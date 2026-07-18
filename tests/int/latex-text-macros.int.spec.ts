import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import seed from '../../content/seed.json' with { type: 'json' }
import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import { renderToHtml } from '../../src/lib/renderMarkdownLatex'
import { transformLatexInMarkdown } from '../../src/lib/remarkLatexTextMacros'

// v3 守栏：题干/解析里不能出现原始 LaTeX 文本宏（task #15 修复后 0 字面）。
// 与 v2 (katex-corpus-frontend) 互补：v2 守"0 katex-error"，v3 守"无 LaTeX 文本宏泄漏"。
// v4 新增：含 T3 .tex 真实内容，验证块级结构命令（\begin{itemize}/\item 等）的转写。
// 用法：每条 markdown 字段跑 renderToHtml（完整 react-markdown + remark-math +
// rehype-katex + transformLatexInMarkdown 管线），断言 HTML 里不出现
// \textbf \textit \emph \textrm \textsf \texttt \rm \bfseries \begin{itemize}
// \end{itemize} \begin{enumerate} \end{enumerate} 这 12 个原始 token。

const RAW_MACRO_TOKENS = [
  '\\textbf',
  '\\textit',
  '\\emph',
  '\\textrm',
  '\\textsf',
  '\\texttt',
  '\\rm',
  '\\bfseries',
  // 块级环境（task #16）：
  '\\begin{itemize}',
  '\\end{itemize}',
  '\\begin{enumerate}',
  '\\end{enumerate}',
] as const

const MARKDOWN_FIELDS = [
  'contentOriginal',
  'contentZh',
  'contentEn',
  'answerOriginal',
  'answerZh',
  'answerEn',
] as const

type Case = { label: string; source: string }

const collect = (owner: string, item: Record<string, unknown>, cases: Case[]) => {
  for (const field of MARKDOWN_FIELDS) {
    const value = item[field]
    if (typeof value === 'string' && value.trim()) cases.push({ label: `${owner}/${field}`, source: value })
  }
}

const cases: Case[] = []
for (const problem of (seed as { problems: Record<string, unknown>[] }).problems) {
  collect(String(problem.slug), problem, cases)
}
const exItem = (example as { item: Record<string, unknown> }).item
collect(`example/${String(exItem.slugCandidate)}`, exItem, cases)

// T3 .tex 真实内容抽出来跑 v4 守栏（task #16 新增）
function extractProblemboxContents(texPath: string): string[] {
  const text = readFileSync(resolve(__dirname, '..', '..', texPath), 'utf-8')
  const re = /\\begin\{problembox\}([\s\S]*?)\\end\{problembox\}/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const body = m[1]!.trim()
    if (body.length > 0) out.push(body)
  }
  return out
}

const t3Bodies = extractProblemboxContents('docs/ipho-2026-t3-content.tex')
for (let i = 0; i < t3Bodies.length; i++) {
  cases.push({ label: `t3/problembox[${i + 1}]`, source: t3Bodies[i]! })
}

// 单元测试：transformLatexInMarkdown 在各种输入下的行为
describe('transformLatexInMarkdown (unit)', () => {
  test('passes through plain text unchanged', () => {
    expect(transformLatexInMarkdown('No macros here.')).toBe('No macros here.')
  })

  test('passes through empty string', () => {
    expect(transformLatexInMarkdown('')).toBe('')
  })

  // ---- 文本宏（task #15）----

  test('converts \\textbf{X} to **X**', () => {
    expect(transformLatexInMarkdown('\\textbf{(a) Hydrostatic gate.}')).toBe(
      '**(a) Hydrostatic gate.**',
    )
  })

  test('converts \\textit{X} to *X*', () => {
    expect(transformLatexInMarkdown('\\textit{italic}')).toBe('*italic*')
  })

  test('converts \\emph{X} to *X*', () => {
    expect(transformLatexInMarkdown('\\emph{emphasised}')).toBe('*emphasised*')
  })

  test('strips \\textrm and \\textsf wrappers', () => {
    expect(transformLatexInMarkdown('\\textrm{serif} text')).toBe('serif text')
    expect(transformLatexInMarkdown('\\textsf{sans} text')).toBe('sans text')
  })

  test('wraps \\texttt in backticks', () => {
    expect(transformLatexInMarkdown('Use \\texttt{foo_bar} here')).toBe('Use `foo_bar` here')
  })

  test('handles Chinese inside braces', () => {
    expect(transformLatexInMarkdown('\\textbf{(a) 静水闸门}：边长 $a$')).toBe(
      '**(a) 静水闸门**：边长 $a$',
    )
  })

  test('handles multiple macros in one string', () => {
    expect(
      transformLatexInMarkdown('\\textbf{(a)} first \\textbf{(b)} second \\textit{italic}'),
    ).toBe('**(a)** first **(b)** second *italic*')
  })

  test('handles nested braces (balanced)', () => {
    // 单次调用：外层替换为 **\textit{X}**，内层 \textit 在 transformLatexInMarkdown
    // 整体遍历时会再被处理一次（text 段走 transformTextMacros）
    const r = transformLatexInMarkdown('\\textbf{\\textit{bold-italic}}')
    // 期望最终：** *bold-italic* *
    expect(r).toBe('***bold-italic***')
  })

  test('preserves \\textbf with unbalanced braces (graceful fallback)', () => {
    expect(transformLatexInMarkdown('\\textbf{never closed')).toBe('\\textbf{never closed')
  })

  test('preserves math symbols not in the registered macro set', () => {
    expect(transformLatexInMarkdown('\\rho_0 and \\hbar\\omega')).toBe(
      '\\rho_0 and \\hbar\\omega',
    )
  })

  test('converts \\SI{1.00}{K} inside math mode to \\mathrm{1.00\\,K} (KaTeX-friendly)', () => {
    // 仅在数学模式内转换；文本模式不处理
    expect(transformLatexInMarkdown('T = \\SI{1.00}{K}')).toBe(
      'T = \\mathrm{1.00\\,K}',
    )
  })

  test('converts multiple \\SI in same math segment', () => {
    expect(transformLatexInMarkdown('$\\SI{1.00}{K} + \\SI{2.00}{mol}$')).toBe(
      '$\\mathrm{1.00\\,K} + \\mathrm{2.00\\,mol}$',
    )
  })

  test('handles macro with leading whitespace inside braces', () => {
    expect(transformLatexInMarkdown('\\textbf {spaced}')).toBe('**spaced**')
  })

  test('handles empty braces (becomes empty markdown)', () => {
    expect(transformLatexInMarkdown('\\textbf{}')).toBe('****')
  })

  test('converts \\rm{X} to X (roman font, stripped)', () => {
    expect(transformLatexInMarkdown('\\rm{roman text}')).toBe('roman text')
  })

  test('converts \\bfseries{X} to **X** (bold declaration variant)', () => {
    expect(transformLatexInMarkdown('\\bfseries{bold text}')).toBe('**bold text**')
  })

  test('does NOT touch text inside $...$ math mode', () => {
    expect(transformLatexInMarkdown('Let $\\textbf{x}$ be bold in math.')).toBe(
      'Let $\\textbf{x}$ be bold in math.',
    )
  })

  test('does NOT touch text inside $$...$$ display math', () => {
    expect(transformLatexInMarkdown('$$\\textbf{display}$$')).toBe('$$\\textbf{display}$$')
  })

  test('preserves math spanning across text segments correctly', () => {
    expect(transformLatexInMarkdown('\\textbf{before} $x = 1$ \\textbf{after}')).toBe(
      '**before** $x = 1$ **after**',
    )
  })

  test('escaped \\$ is treated as literal dollar', () => {
    // \$ 在 LaTeX 中表示字面 $，不属于数学模式入口
    expect(transformLatexInMarkdown('Price is \\$5.')).toBe('Price is \\$5.')
  })

  // ---- 块级结构（task #16）----

  test('converts \\begin{itemize}...\\item to Markdown dash list', () => {
    const input = '\\begin{itemize}\n  \\item First\n  \\item Second\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('- First\n- Second')
  })

  test('converts \\begin{enumerate}...\\item to Markdown ordered list', () => {
    const input = '\\begin{enumerate}\n  \\item Alpha\n  \\item Beta\n  \\item Gamma\n\\end{enumerate}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('1. Alpha\n2. Beta\n3. Gamma')
  })

  test('preserves math inside \\item body', () => {
    const input = '\\begin{itemize}\n  \\item $E = mc^2$\n  \\item $F = ma$\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('- $E = mc^2$\n- $F = ma$')
  })

  test('runs text macros inside \\item body', () => {
    const input = '\\begin{itemize}\n  \\item \\textbf{important}\n  \\item \\textit{note}\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('- **important**\n- *note*')
  })

  test('handles \\begin{quote} as Markdown blockquote', () => {
    const input = '\\begin{quote}\nFirst line.\nSecond line.\n\\end{quote}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('> First line.\n> Second line.')
  })

  test('handles \\begin{center} as HTML div', () => {
    const input = '\\begin{center}\nCentered text\n\\end{center}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('<div style="text-align:center">\n\nCentered text\n\n</div>')
  })

  test('handles unknown environments by leaving them untouched', () => {
    const input = '\\begin{problembox}\nT3-A content\n\\end{problembox}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe(input)
  })

  test('handles itemize with nested itemize', () => {
    const input =
      '\\begin{itemize}\n  \\item outer\n  \\begin{itemize}\n    \\item inner1\n    \\item inner2\n  \\end{itemize}\n  \\item last\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    // 嵌套列表以 4 空格缩进挂在其父项（outer）之后，符合标准 Markdown 嵌套列表
    expect(r).toBe(
      '- outer\n    - inner1\n    - inner2\n- last',
    )
  })

  test('preserves unbalanced \\begin{env} (graceful fallback)', () => {
    const input = '\\begin{itemize}\n  \\item never closed'
    const r = transformLatexInMarkdown(input)
    // 没匹配到 \end{itemize}，原样保留
    expect(r).toBe(input)
  })

  test('handles Chinese inside \\item', () => {
    const input = '\\begin{itemize}\n  \\item 绝热去磁\n  \\item 等温去磁\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('- 绝热去磁\n- 等温去磁')
  })

  test('block env + text macros + math, all combined', () => {
    const input =
      '\\textbf{Title}\\begin{itemize}\n  \\item \\textbf{a}：$x=1$\n  \\item \\textit{b}：$y=2$\n\\end{itemize}'
    const r = transformLatexInMarkdown(input)
    expect(r).toBe('**Title**- **a**：$x=1$\n- *b*：$y=2$')
    // 上面期望可读但 \end{itemize} 之前是 text 段，所以 "**Title**" 和 "-" 中间无分隔
    // 这是设计选择：title 紧跟列表不空行也合法 Markdown（标题在前）
  })
})

// 集成测试：完整渲染管线 + T3 corpus + seed/example 全套
describe('v3+v4 corpus guard — no raw LaTeX text/structure macros leak in rendered HTML', () => {
  test('extracted a non-empty corpus of markdown fields', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  test('extracted T3 problembox contents for v4 guard', () => {
    // 至少抽到 T3-A, T3-B, T3-C 三个 problembox
    expect(t3Bodies.length).toBeGreaterThanOrEqual(3)
  })

  // KaTeX 会把公式原始 TeX 源码回显进不可见的 <annotation encoding="application/x-tex">
  // （给屏幕阅读器/复制用，视觉上永不渲染）。数学模式内合法的 \rm（如 \rho_{\rm He}）
  // 会出现在这个 annotation 里——那不是"泄漏给用户"，守栏只应扫描可见输出。
  const stripKatexAnnotations = (html: string): string =>
    html.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, '')

  test.each(cases)('renders $label with zero raw LaTeX macro tokens', ({ source }) => {
    const html = stripKatexAnnotations(renderToHtml(source))
    for (const token of RAW_MACRO_TOKENS) {
      expect(html, `expected no literal ${token} in visible HTML`).not.toContain(token)
    }
  })
})