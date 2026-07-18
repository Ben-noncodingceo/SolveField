// 文本流里的 LaTeX 文本宏 → Markdown 等价物（task #15 修复）。
//
// 背景：
//   题干/解析里常见 `\textbf{(a) 小标题}` `\textit{...}` `\emph{...}` 等
//   LaTeX **文本格式**命令。KaTeX 数学模式（`$...$` / `$$...$$`）不处理这些，
//   remark-math 也不把它们当数学；它们处在普通 Markdown 文本流里，会原样输出。
//   IPhO 题面普遍用这种写法，是标准 LaTeX 文本格式，不是数据错误。
//
// 做法：在 remark 阶段（早于 rehype-katex）把 inline text 里的几个常见 LaTeX
// 文本宏替换为等价 Markdown，由 react-markdown 自己转成 HTML 元素。
//   \textbf{X}    → **X**          （bold，react-markdown 输出 <strong>）
//   \textit{X}    → *X*            （italic，<em>）
//   \emph{X}      → *X*            （italic，<em>）
//   \textrm{X}    → X              （serif 字体由全局 CSS 决定，剥离宏）
//   \textsf{X}    → X              （sans-serif，剥离）
//   \texttt{X}    → `X`            （monospace，inline code）
//
// 边界（重要）：
//   - 只处理 text 节点；遇到 inlineMath/math/code/inlineCode/html 节点直接跳过
//   - X 必须花括号平衡；解析失败保留原文，不让单条坏数据挂整页
//   - 不在 `$...$` 内做替换（KaTeX 自己处理 math）
//
// 不替换的（避免误伤或语义不清）：
//   - \mathrm, \mathbf 等"半文本半数学"宏——保留给 KaTeX 处理，
//     若出现在文本流里由 KaTeX throwOnError:false 降级显示
//   - \section, \begin 等块级结构——超出本任务范围

import { visit } from 'unist-util-visit'
import type { Plugin } from 'unified'
import type { Root, Text, PhrasingContent, Paragraph, Heading } from 'mdast'

// 已知 LaTeX 文本宏名 → 输出 token（包裹 X 的部分）
// 顺序很关键：更长的宏名优先，避免 \text 误匹配 \texttt
// (\rm / \bfseries 是 IPhO T3 原文里的频率第二、第三高的文本宏)
const MACROS: ReadonlyArray<{ name: string; wrap: (inner: string) => string }> = [
  { name: 'textbf', wrap: (inner) => `**${inner}**` },
  { name: 'textit', wrap: (inner) => `*${inner}*` },
  { name: 'emph', wrap: (inner) => `*${inner}*` },
  { name: 'textrm', wrap: (inner) => inner },
  { name: 'textsf', wrap: (inner) => inner },
  { name: 'texttt', wrap: (inner) => `\`${inner}\`` },
  { name: 'rm', wrap: (inner) => inner }, // \rm 是字体切换声明，与 \textrm 同语义（罗马体）
  { name: 'bfseries', wrap: (inner) => `**${inner}**` }, // \textbf 的“字体切换”写法
] as const

// 在模板字符串里直接写 \\，避免与正则的 \ 转义冲突
const MACRO_ALT = MACROS.map((m) => m.name).join('|')

/**
 * 在一段 plain text 里找下一个完整的 LaTeX 文本宏（包括花括号内容）。
 * 返回 { start, end, inner, name }；找不到返回 null。
 * matchEnd 不含尾 `}` 之后的字符。
 */
function findMacro(
  text: string,
  startAt: number,
): { start: number; end: number; inner: string; name: string } | null {
  // 从 startAt 起扫描：匹配  \macro\s*{  （macro ∈ MACRO_ALT）
  // 正则源码里 '\\' 表示一个反斜杠字面量（这里的 \\ 写在模板字符串中，实际生成 regex 源码里的 \\）
  const re = new RegExp(`\\\\(${MACRO_ALT})\\s*\\{`, 'g')
  re.lastIndex = startAt
  const m = re.exec(text)
  if (!m) return null
  const macroName = m[1]!
  const braceStart = m.index + m[0].length - 1 // '{' 的位置
  if (text[braceStart] !== '{') return null
  // 从 braceStart+1 起扫描平衡花括号
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
  // 没找到匹配的 '}' —— 解析失败；返回 null 让上层保留原文
  return null
}

/**
 * 把单个 text 字符串里的 LaTeX 文本宏替换为 Markdown 等价物。
 * 失败时（不平衡等）保留原文。
 */
export function transformLatexTextMacros(text: string): string {
  if (!text.includes('\\')) return text
  const out: string[] = []
  let cursor = 0
  let safety = 0
  while (cursor < text.length) {
    const found = findMacro(text, cursor)
    if (!found) {
      out.push(text.slice(cursor))
      break
    }
    out.push(text.slice(cursor, found.start))
    const macro = MACROS.find((m) => m.name === found.name)
    if (!macro) {
      // 防御性：未注册的宏名（理论上正则不会匹配到）
      out.push(text.slice(found.start, found.end))
    } else {
      out.push(macro.wrap(found.inner))
    }
    cursor = found.end
    if (++safety > 10000) {
      // 极端情况（宏嵌套几千层）放弃，避免无限循环；保留剩余原文
      out.push(text.slice(cursor))
      break
    }
  }
  return out.join('')
}

/**
 * remark 插件：在所有 paragraph / heading 等 block 的 text 孩子上跑
 * transformLatexTextMacros。
 *
 * 实现要点：remark-math 在解析阶段会把 `$...$` / `$$...$$` 切成 inlineMath / math 节点，
 * 其内部不再包含 mdast text 节点，所以本插件在 text 节点上运行天然不会误伤数学内容。
 * （inlineMath / math 节点不进入 visit 的 text 路径——此外的 code / inlineCode / html
 * 同理，这些节点也不会包含 text 孩子。）
 */
export const remarkLatexTextMacros: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text) => {
      const original = node.value
      const transformed = transformLatexTextMacros(original)
      if (transformed !== original) {
        node.value = transformed
      }
    })

    // 合并相邻 text 节点（如果用户的源里写出了被 mdast 切分的奇怪情形）：
    // 如 `before \textbf{` + `X` + `}` 三段相邻 text；合并后能被上面的 visit 抓到。
    visit(tree, 'paragraph', (node: Paragraph) => {
      mergeAdjacentText(node.children as PhrasingContent[])
    })
    visit(tree, 'heading', (node: Heading) => {
      mergeAdjacentText(node.children as PhrasingContent[])
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
      i-- // 重测当前位置（合并后可能又出现新邻居）
    }
  }
}