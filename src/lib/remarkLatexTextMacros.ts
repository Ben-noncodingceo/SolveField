// LaTeX 文本宏 + 块级结构 → Markdown 等价物（task #15 + #16）。
//
// 背景：
//   题干/解析里常见 LaTeX **文本格式**命令（`\textbf`/`\textit`/`\emph`/`\texttt`/
//   `\textrm`/`\textsf`/`\rm`/`\bfseries`），KaTeX 数学模式（`$...$` / `$$...$$`）
//   不处理；以及**块级结构**命令（`\begin{itemize}`、`\begin{enumerate}`、
//   `\begin{center}`、`\begin{quote}`），在原始 Markdown 文本流里全部以原文输出。
//
// 做法：在 markdown 解析**之前**对源字符串做一次性转写，分两阶段：
//   1. **块级环境**：`\begin{env} ... \end{env}` → 对应 HTML/Markdown 块
//      （`\begin{itemize}/\item` → `- ...`；`\begin{enumerate}/\item` → `1. ...`；
//        `\begin{center}` → 保留为 div 风格；`\begin{quote}` → `> ...`）
//   2. **文本宏**（同 task #15）：`\textbf{X}` → `**X**` 等
//
// 关键边界：必须**不在** `$...$` / `$$...$$` 数学模式内做替换（KaTeX 自己处理数学）。
// 做法：先把源字符串切成 math / non-math 段（保留分隔符的偏移信息），
//       每段独立处理，结束后按原顺序重组成最终字符串。
//
// 失败模式：解析错误（不闭合花括号、不闭合 begin/end）→ 保留原文，不让单条坏数据挂整页。
//
// 不处理的（语义不清或另案）：
//   - `\mathrm`/`\mathbf` 等"半文本半数学"宏——保留给 KaTeX
//   - `\SI{1.0}{m}`（siunitx）—— 需在 ingest/数据层做归一化（数字+单位拆开）
//   - TikZ 图片——前端无 JS 渲染可移植方案，约定在 Ted 录入端预渲染为 SVG/PNG
//   - 自定义盒子（`\begin{problembox}`/`\solutionbox`/`\answerbox`/`\notebox`）——Ted 录入端剥离
//   - 声明式宏（`\rm X` 不带花括号）—— 本任务范围内 IPhO T3 body content 实际未使用（实测）

import { visit } from 'unist-util-visit'
import type { Plugin } from 'unified'
import type { Root, Text, PhrasingContent, Paragraph, Heading } from 'mdast'

// ---------- siunitx 拦截（task #16 补充） ----------
// 在数学模式里出现 \SI{a}{b} 时，KaTeX 不知道 \SI（siunitx 包宏），会报红。
// 简单拦截：把 \SI{a}{b} 转成 \mathrm{a\,b}（以普通文本方式渲染数字+单位），
// 避免 KaTeX errorColor 红色块污染页面。Siunitx 的完整语法（指数/分数线/复合单位）不在范围。
// 该函数是“数学模式内的”专项；只被 splitMathAndText 出的 'math' 段调用。

function transformSiInMath(text: string): string {
  if (!text.includes('\\SI')) return text
  // 手动扫描 \SI{a}{b}，用 index 拼接避免 String.replace 索引坑
  const out: string[] = []
  let cursor = 0
  const re = /\\SI\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index < cursor) continue
    out.push(text.slice(cursor, m.index))
    const aOpen = m.index + m[0].length - 1 // '{' position
    const aClose = findMatchingBrace(text, aOpen)
    if (aClose === -1) {
      out.push(text.slice(m.index))
      cursor = text.length
      break
    }
    let bOpen = aClose + 1
    while (bOpen < text.length && /\s/.test(text[bOpen]!)) bOpen++
    if (text[bOpen] !== '{') {
      // 不是 \SI{a}{b} 形式（如 \SI{a}\foo ），保留原文
      out.push(text.slice(m.index, aClose + 1))
      cursor = aClose + 1
      re.lastIndex = cursor
      continue
    }
    const bClose = findMatchingBrace(text, bOpen)
    if (bClose === -1) {
      out.push(text.slice(m.index))
      cursor = text.length
      break
    }
    const a = text.slice(aOpen + 1, aClose)
    const b = text.slice(bOpen + 1, bClose)
    // 不转义花括号：单位里合法存在 ^{-3}/_{i} 等上下标（findMatchingBrace 已保证 a/b 花括号平衡）。
    // 早期版本用 escapeMathrm 把 `{`→`\{`，会把 `m^{-3}` 破坏成可见字面 `m^\{-3\}`。
    out.push(`\\mathrm{${a}\\,${b}}`)
    cursor = bClose + 1
    re.lastIndex = cursor
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return out.join('')
}

function findMatchingBrace(text: string, openIndex: number): number {
  if (text[openIndex] !== '{') return -1
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// ---------- 文本宏配置（task #15） ----------

// 已知 LaTeX 文本宏名 → 输出 token（包裹 X 的部分）
// 顺序很关键：更长的宏名优先，避免 \text 误匹配 \texttt
// (\rm / \bfseries 是 IPhO T3 原文里的频率第二、第三高的文本宏)
interface TextMacro {
  name: string
  wrap: (inner: string) => string
}

const TEXT_MACROS: ReadonlyArray<TextMacro> = [
  { name: 'textbf', wrap: (inner) => `**${inner}**` },
  { name: 'textit', wrap: (inner) => `*${inner}*` },
  { name: 'emph', wrap: (inner) => `*${inner}*` },
  { name: 'textrm', wrap: (inner) => inner },
  { name: 'textsf', wrap: (inner) => inner },
  { name: 'texttt', wrap: (inner) => `\`${inner}\`` },
  { name: 'rm', wrap: (inner) => inner }, // \rm 是字体切换声明，与 \textrm 同语义（罗马体）
  { name: 'bfseries', wrap: (inner) => `**${inner}**` }, // \textbf 的"字体切换"写法
] as const

// ---------- 块级结构配置（task #16 新增） ----------

interface BlockEnv {
  name: string
  // 给定 \begin{env} ... \end{env} 的 inner（已经过 \item 转写），返回 Markdown 字符串
  render: (inner: string) => string
}

// 注意：顺序无关（每个环境名是独立 begin/end 配对）
const BLOCK_ENVS: ReadonlyArray<BlockEnv> = [
  {
    name: 'itemize',
    // \item X → - X  (每条一行)
    // 嵌套需要缩进，但我们用同一缩进；未来如果支持嵌套可在前面加 \itemize 嵌套时再加 2 空格
    render: (inner) => {
      const items = parseItems(inner, false)
      return items.map((it) => `- ${it}`).join('\n')
    },
  },
  {
    name: 'enumerate',
    render: (inner) => {
      const items = parseItems(inner, false)
      return items.map((it, i) => `${i + 1}. ${it}`).join('\n')
    },
  },
  {
    name: 'center',
    // 居中：Markdown 无原生，用 HTML div 提示（CSS 处理）。inner 为原始文本，内部再递归转换。
    render: (inner) => `<div style="text-align:center">\n\n${transformLatexInMarkdown(inner).trim()}\n\n</div>`,
  },
  {
    name: 'quote',
    // 引用：用 Markdown > 语法。inner 为原始文本，先递归转换再逐行加 > 前缀。
    render: (inner) => {
      return transformLatexInMarkdown(inner)
        .trim()
        .split('\n')
        .map((line) => (line.length > 0 ? `> ${line}` : '>'))
        .join('\n')
    },
  },
]

// ---------- 工具：math 段与非 math 段切分 ----------

interface Segment {
  // 'math' 表示这是 $...$ 或 $$...$$ 的内部（含定界符），不处理
  // 'text' 表示普通文本
  kind: 'math' | 'text'
  value: string
}

/**
 * 把源字符串切成 math / text 段，math 段以整个定界符+内部为单位保留。
 * - 支持 $...$ 和 $$...$$ 两种
 * - 不支持嵌套数学（KaTeX 也不支持）；遇到 \$ 转义视为字面
 * - 转义反斜杠 \$ 视为字面美元符号
 */
function splitMathAndText(source: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  while (i < source.length) {
    // 跳过一个反斜杠
    if (source[i] === '\\' && source[i + 1] === '$') {
      // 字面 \$ ：把 \$ 拼到当前 text 段，跳过 2 个字符
      const last = out[out.length - 1]
      if (last && last.kind === 'text') last.value += source.slice(i, i + 2)
      else out.push({ kind: 'text', value: source.slice(i, i + 2) })
      i += 2
      continue
    }
    // 检测 $$...$$ （display math）
    if (source[i] === '$' && source[i + 1] === '$') {
      const end = source.indexOf('$$', i + 2)
      if (end === -1) {
        // 未闭合：把剩余当 text
        const last = out[out.length - 1]
        if (last && last.kind === 'text') last.value += source.slice(i)
        else out.push({ kind: 'text', value: source.slice(i) })
        i = source.length
        break
      }
      out.push({ kind: 'math', value: source.slice(i, end + 2) })
      i = end + 2
      continue
    }
    // 检测 $...$ （inline math）
    if (source[i] === '$') {
      // 找到下一个非转义的 $
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\' && source[j + 1] === '$') {
          j += 2
          continue
        }
        if (source[j] === '$') break
        j++
      }
      if (j >= source.length) {
        // 未闭合
        const last = out[out.length - 1]
        if (last && last.kind === 'text') last.value += source.slice(i)
        else out.push({ kind: 'text', value: source.slice(i) })
        i = source.length
        break
      }
      out.push({ kind: 'math', value: source.slice(i, j + 1) })
      i = j + 1
      continue
    }
    // 普通字符：累积到当前 text 段
    const last = out[out.length - 1]
    if (last && last.kind === 'text') last.value += source[i]
    else out.push({ kind: 'text', value: source[i]! })
    i++
  }
  return out
}

/**
 * 找下一个 \begin{env} ... \end{env} 块。
 * 返回 { start, end, env, inner, balanced }；找不到返回 null。
 * - start: '\begin' 的开始位置
 * - end:   紧跟 '\end{env}' 之后的字符位置（用于 slice(start, end)）
 * - balanced: true 表示花括号配对成功；false 表示解析失败（调用方决定是否保留原文）
 */
function findBlockEnv(
  text: string,
  startAt: number,
  knownEnvs: ReadonlyArray<string>,
): {
  start: number
  end: number
  env: string
  inner: string
} | null {
  // 匹配 \begin{env} （env ∈ knownEnvs）
  const alt = knownEnvs.join('|')
  const re = new RegExp(`\\\\begin\\s*\\{(${alt})\\}`, 'g')
  re.lastIndex = startAt
  const m = re.exec(text)
  if (!m) return null
  const env = m[1]!
  const start = m.index
  const afterBegin = re.lastIndex // 紧跟 \begin{env} 之后
  // 深度计数找到**配对**的 \end{env}：同名环境可嵌套（\begin{itemize} 里再套
  // \begin{itemize}），若只取第一个 \end{env} 会把外层 begin 错配到内层 end。
  const tokenRe = new RegExp(`\\\\(begin|end)\\s*\\{${env}\\}`, 'g')
  tokenRe.lastIndex = afterBegin
  let depth = 1
  let tm: RegExpExecArray | null
  while ((tm = tokenRe.exec(text)) !== null) {
    if (tm[1] === 'begin') {
      depth++
    } else {
      depth--
      if (depth === 0) {
        const end = tm.index + tm[0].length
        return { start, end, env, inner: text.slice(afterBegin, tm.index) }
      }
    }
  }
  return null // 未闭合（不平衡）→ 调用方保留原文
}

// ---------- 工具：item 拆分 ----------

/**
 * 把 \begin{itemize} 的 inner 按 \item 拆分成若干文本块。
 * - \item[label] 形式也支持（label 保留）
 * - 允许 \item 之间空行 / 多空白
 * - 允许 inner 包含嵌套 \begin{itemize}（递归处理）
 */
function parseItems(inner: string, _isOrdered: boolean): string[] {
  const items: string[] = []
  let cursor = 0
  while (cursor < inner.length) {
    // 找下一个 \item 或 \begin{...}（嵌套）或 EOF
    const itemMatch = /\\item(\s*\[[^\]]*\])?/.exec(inner.slice(cursor))
    const beginMatch = /\\begin\s*\{(itemize|enumerate)\}/.exec(inner.slice(cursor))
    const nextItemPos = itemMatch ? cursor + itemMatch.index : -1
    const nextBeginPos = beginMatch ? cursor + beginMatch.index : -1
    // 取最近的
    const positions = [nextItemPos, nextBeginPos].filter((p) => p >= 0)
    if (positions.length === 0) break
    const nextPos = Math.min(...positions)
    cursor = nextPos
    if (cursor === nextBeginPos) {
      // 嵌套 \begin{itemize}/\begin{enumerate}：递归处理**整块**（含 begin/end），
      // 否则去掉 begin/end 后 transformLatexInMarkdown 不会再识别成列表。
      const nested = findBlockEnv(inner, cursor, ['itemize', 'enumerate'])
      if (nested) {
        const nestedFull = inner.slice(nested.start, nested.end)
        // 递归转成 Markdown 列表后，每行缩进 4 空格作为上一条 item 的子列表
        const nestedMd = transformLatexInMarkdown(nestedFull)
          .split('\n')
          .map((l) => (l.length > 0 ? '    ' + l : l))
          .join('\n')
        if (items.length > 0) {
          // 挂到上一条 item 末尾（标准 Markdown 嵌套列表）
          items[items.length - 1] += '\n' + nestedMd
        } else {
          // 没有前置 item（异常/无父项）——独立保留
          items.push(nestedMd)
        }
        cursor = nested.end
      } else {
        cursor++ // 跳过异常
      }
      continue
    }
    // 处理一个 \item
    const itemLabelMatch = /^\\item(\s*\[[^\]]*\])?/.exec(inner.slice(cursor))
    if (!itemLabelMatch) {
      cursor++
      continue
    }
    const labelPart = itemLabelMatch[1] ?? '' // e.g. " [label]"
    cursor += itemLabelMatch[0].length
    // item 内容：直到下一个 \item 或 \end{...} 或 \begin{...} 或 EOF
    const tail = inner.slice(cursor)
    const stopRe = /\\(?:item(\s*\[[^\]]*\])?|begin\s*\{(?:itemize|enumerate)\}|end\s*\{(?:itemize|enumerate)\})/
    const stopMatch = stopRe.exec(tail)
    const itemEnd = stopMatch ? stopMatch.index : tail.length
    const itemBody = tail.slice(0, itemEnd)
    // 递归处理 item body（可能含 \textbf 等宏）
    const itemBodyTransformed = transformLatexInMarkdown(itemBody).trim()
    items.push(labelPart ? `${labelPart.trim()} ${itemBodyTransformed}` : itemBodyTransformed)
    cursor += itemEnd
  }
  return items
}

// ---------- 文本宏替换（task #15） ----------

const TEXT_MACRO_ALT = TEXT_MACROS.map((m) => m.name).join('|')

function findTextMacro(
  text: string,
  startAt: number,
): { start: number; end: number; inner: string; name: string } | null {
  const re = new RegExp(`\\\\(${TEXT_MACRO_ALT})\\s*\\{`, 'g')
  re.lastIndex = startAt
  const m = re.exec(text)
  if (!m) return null
  const macroName = m[1]!
  const braceStart = m.index + m[0].length - 1
  if (text[braceStart] !== '{') return null
  let depth = 0
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const inner = text.slice(braceStart + 1, i)
        return { start: m.index, end: i + 1, inner, name: macroName }
      }
    }
  }
  return null
}

/** 在一段 plain text 跑文本宏替换；不抛错，最坏保留原文。 */
function transformTextMacros(text: string): string {
  if (!text.includes('\\')) return text
  const out: string[] = []
  let cursor = 0
  let safety = 0
  while (cursor < text.length) {
    const found = findTextMacro(text, cursor)
    if (!found) {
      out.push(text.slice(cursor))
      break
    }
    out.push(text.slice(cursor, found.start))
    const macro = TEXT_MACROS.find((m) => m.name === found.name)
    if (!macro) {
      out.push(text.slice(found.start, found.end))
    } else {
      out.push(macro.wrap(found.inner))
    }
    cursor = found.end
    if (++safety > 10000) {
      out.push(text.slice(cursor))
      break
    }
  }
  return out.join('')
}

/** 重复跑直到不再变化（处理嵌套宏如 \textbf{\textit{x}} → ** *x* **）。 */
function transformTextMacrosUntilStable(text: string): string {
  let cur = text
  for (let i = 0; i < 10; i++) {
    const next = transformTextMacros(cur)
    if (next === cur) return cur
    cur = next
  }
  return cur
}

// ---------- 块级环境替换（task #16） ----------

const BLOCK_ENV_NAMES = BLOCK_ENVS.map((e) => e.name)

/**
 * 在一段 plain text 里把所有块级 \begin{env} ... \end{env} 转成 Markdown。
 * 嵌套块递归处理；解析失败保留原文。
 */
function transformBlockEnvs(text: string): string {
  if (!text.includes('\\begin')) return text
  // 反复扫描直到没有更多块
  // （一次扫描可能错过嵌套，因为 match 完一个外层后会跳过其内部）
  let out = text
  for (let pass = 0; pass < 50; pass++) {
    const before = out
    out = transformBlockEnvsOnePass(out)
    if (out === before) break
  }
  return out
}

function transformBlockEnvsOnePass(text: string): string {
  const result: string[] = []
  let cursor = 0
  let safety = 0
  while (cursor < text.length) {
    const found = findBlockEnv(text, cursor, BLOCK_ENV_NAMES)
    if (!found) {
      result.push(text.slice(cursor))
      break
    }
    result.push(text.slice(cursor, found.start))
    // 找环境对应的渲染函数
    const env = BLOCK_ENVS.find((e) => e.name === found.env)
    if (!env) {
      // 未知环境，保留原文
      result.push(text.slice(found.start, found.end))
    } else {
      // 传**原始** inner 给 render：itemize/enumerate 需要自己按 \item 拆分并递归
      // 转换每条 item（含嵌套列表）；center/quote 在各自 render 内部再递归转换。
      // （早期在此处预转换会与 parseItems 的递归重复处理、破坏嵌套 \item 结构。）
      result.push(env.render(found.inner))
    }
    cursor = found.end
    if (++safety > 10000) {
      result.push(text.slice(cursor))
      break
    }
  }
  return result.join('')
}

// ---------- 数学段处理（task #16） ----------

/**
 * 处理一个 math 段（含定界符 $...$ / $$...$$）。
 * 目前只做 \SI 拦截，避免 KaTeX 对 siunitx 宏报红；定界符原样保留。
 * transformSiInMath 只识别 \SI{a}{b}，不会误碰 `$` 定界符，故直接整段传入即可。
 */
function transformMathSegment(value: string): string {
  return transformSiInMath(value)
}

// ---------- LaTeX 数学定界符规范化（task #16） ----------

/**
 * 把 LaTeX 原生数学定界符规范化成 `$` 形式，让 remark-math 能识别渲染：
 *   \[ ... \]  → $$ ... $$   （display math）
 *   \( ... \)  → $ ... $      （inline math）
 * 否则 `\[...\]` 会当作普通文本泄漏成字面 `[ ... ]`，内部的 \rm/\dd 等也跟着漏出来。
 *
 * 关键边界：`\\[0.5em]`（LaTeX 换行+行距）里的 `[` 前面是 `\\`（两个反斜杠），
 * 不能误当成 `\[` 显示公式。用否定回顾 (?<!\\) 保证被匹配的反斜杠前面不是反斜杠。
 * 同理 `[0.5em]` 里的 `]` 是裸 `]`，不是 `\]`，天然不匹配。
 */
function normalizeMathDelimiters(source: string): string {
  if (!source.includes('\\')) return source
  return source
    .replace(/(?<!\\)\\\[/g, '$$$$') // \[ → $$ （replace 里 $$ 表示字面 $，故需 $$$$）
    .replace(/(?<!\\)\\\]/g, '$$$$') // \] → $$
    .replace(/(?<!\\)\\\(/g, '$$') // \( → $ （$$ 表示字面 $）
    .replace(/(?<!\\)\\\)/g, '$$') // \) → $
}

// ---------- 顶层入口：transformLatexInMarkdown ----------

/**
 * 把整段 source 字符串转成"在 Markdown 渲染层等价于原 LaTeX 意图"的 Markdown。
 * 数学模式（$...$ / $$...$$）内部保持原样不处理（除 \SI 拦截外）。
 *
 * 算法（顺序很关键）：
 *   0. 规范化 \[..\]/\(..\) → $$..$$/$..$（让 remark-math 识别）
 *   1. **块级环境跑在切分 math 之前**：否则跨公式的 \begin{itemize}...\end{itemize}
 *      会被 $...$ 切成不同 text 段、begin/end 无法配对，导致整块列表漏转。
 *      块级环境名是 allowlist（itemize/enumerate/center/quote），数学环境
 *      （aligned/cases 等）不在其中，天然不会误碰公式内部。
 *   2. 再按 math / text 段切分：
 *      - text 段：文本宏（\textbf 等）+ \SI 归一
 *      - math 段：\SI 拦截（让 KaTeX 不报红）
 *   3. 重组输出
 */
export function transformLatexInMarkdown(source: string): string {
  if (!source.includes('\\')) return source
  const normalized = normalizeMathDelimiters(source)
  const blockProcessed = transformBlockEnvs(normalized)
  const segments = splitMathAndText(blockProcessed)
  return segments
    .map((seg) => {
      if (seg.kind === 'math') return transformMathSegment(seg.value)
      // text 段：文本宏 + 文本模式下偶发的 \SI 也归一（罕见，单元测试要求一致）
      let out = transformTextMacrosUntilStable(seg.value)
      out = transformSiInMath(out)
      return out
    })
    .join('')
}

// ---------- remark 插件入口（保留以兼容旧调用，但实际转换在组件层） ----------
// 实际转换在 MarkdownLatex.tsx 通过 transformLatexInMarkdown 完成。
// 这里保留插件形态（空操作）以避免破坏未来若需在 AST 层做补充处理。

export const remarkLatexTextMacros: Plugin<[], Root> = () => {
  return (tree) => {
    // 在 AST 阶段不再做主力转换（已在 source 字符串层做完）。
    // 仅做"邻接 text 节点合并"这一类纯 AST 清理，避免 mdast 把 \textbf{ + X + }
    // 切成三段后某段因不闭合而漏处理。
    visit(tree, 'paragraph', (node: Paragraph) => {
      mergeAdjacentText(node.children as PhrasingContent[])
    })
    visit(tree, 'heading', (node: Heading) => {
      mergeAdjacentText(node.children as PhrasingContent[])
    })
    // 防御性：未来若 source 层有遗漏，AST 层兜底跑一次 text 宏
    visit(tree, 'text', (node: Text) => {
      const original = node.value
      const transformed = transformTextMacros(original)
      if (transformed !== original) node.value = transformed
    })
  }
}

function mergeAdjacentText(children: PhrasingContent[]): void {
  for (let i = 0; i < children.length - 1; i++) {
    const cur = children[i]!
    const next = children[i + 1]!
    if (cur.type === 'text' && next.type === 'text') {
      ;(cur as Text).value += (next as Text).value
      children.splice(i + 1, 1)
      i--
    }
  }
}