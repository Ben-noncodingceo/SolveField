import { describe, expect, test } from 'vitest'

import seed from '../../content/seed.json' with { type: 'json' }
import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import { renderToHtml } from '../../src/lib/renderMarkdownLatex'
import { transformLatexTextMacros } from '../../src/lib/remarkLatexTextMacros'

// v3 守栏：题干/解析里不能出现原始 LaTeX 文本宏（task #15 修复后 0 字面）。
// 与 v2 (katex-corpus-frontend) 互补：v2 守"0 katex-error"，v3 守"无 LaTeX 文本宏泄漏"。
//
// 用法：每条 markdown 字段跑 renderToHtml（完整 react-markdown + remark-math +
// rehype-katex + remarkLatexTextMacros 管线），断言 HTML 里不出现
// \textbf \textit \emph \textrm \textsf \texttt 这几个原始 token。

const RAW_MACRO_TOKENS = [
  '\\textbf',
  '\\textit',
  '\\emph',
  '\\textrm',
  '\\textsf',
  '\\texttt',
  '\\rm',
  '\\bfseries',
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

// 单元测试：transformLatexTextMacros 在各种输入下的行为
describe('transformLatexTextMacros (unit)', () => {
  test('passes through plain text unchanged', () => {
    expect(transformLatexTextMacros('No macros here.')).toBe('No macros here.')
  })

  test('passes through text with only math-mode backslashes unchanged (no \\textbf/\\textit outside math)', () => {
    // 注意：源本身不带 $...$，所以 \\alpha 等是文本流里的合法 LaTeX 符号——不在本插件处理范围
    // 但我们这个插件只识别 6 个文本宏名，所以 \\alpha 不会被替换
    expect(transformLatexTextMacros('Use \\alpha for angle.')).toBe('Use \\alpha for angle.')
  })

  test('converts \\textbf{X} to **X**', () => {
    expect(transformLatexTextMacros('\\textbf{(a) Hydrostatic gate.}')).toBe('**(a) Hydrostatic gate.**')
  })

  test('converts \\textit{X} to *X*', () => {
    expect(transformLatexTextMacros('\\textit{italic}')).toBe('*italic*')
  })

  test('converts \\emph{X} to *X*', () => {
    expect(transformLatexTextMacros('\\emph{emphasised}')).toBe('*emphasised*')
  })

  test('strips \\textrm and \\textsf wrappers', () => {
    expect(transformLatexTextMacros('\\textrm{serif} text')).toBe('serif text')
    expect(transformLatexTextMacros('\\textsf{sans} text')).toBe('sans text')
  })

  test('wraps \\texttt in backticks', () => {
    expect(transformLatexTextMacros('Use \\texttt{foo_bar} here')).toBe('Use `foo_bar` here')
  })

  test('handles Chinese inside braces', () => {
    expect(transformLatexTextMacros('\\textbf{(a) 静水闸门}：边长 $a$')).toBe(
      '**(a) 静水闸门**：边长 $a$',
    )
  })

  test('handles multiple macros in one string', () => {
    expect(
      transformLatexTextMacros(
        '\\textbf{(a)} first \\textbf{(b)} second \\textit{italic}',
      ),
    ).toBe('**(a)** first **(b)** second *italic*')
  })

  test('handles nested braces (balanced)', () => {
    // \\textbf{\\textit{X}} → **\textit{X}**（外层转换后内层 \\textit 仍是文本，下一次渲染会被再次处理）
    // 这里只测单次调用：外层替换为 **\textit{X}**，内层 \\textit 在新的 Markdown 阶段被再次转
    expect(transformLatexTextMacros('\\textbf{\\textit{bold-italic}}')).toBe(
      '**\\textit{bold-italic}**',
    )
  })

  test('preserves \\textbf with unbalanced braces (graceful fallback)', () => {
    // 缺失右 }  → 保留原文不替换，避免挂掉整页
    expect(transformLatexTextMacros('\\textbf{never closed')).toBe('\\textbf{never closed')
  })

  test('preserves math symbols not in the registered macro set', () => {
    // \\rho / \\hbar / \\sqrt 等数学符号在文本流里出现应原样保留（KaTeX 数学模式处理）
    expect(transformLatexTextMacros('\\rho_0 and \\hbar\\omega')).toBe(
      '\\rho_0 and \\hbar\\omega',
    )
  })

  test('handles macro with leading whitespace inside braces', () => {
    expect(transformLatexTextMacros('\\textbf {spaced}')).toBe('**spaced**')
  })

  test('handles empty braces (becomes empty markdown)', () => {
    expect(transformLatexTextMacros('\\textbf{}')).toBe('****')
  })

  test('converts \\rm{X} to X (roman font, stripped)', () => {
    // \rm is a font-switch declaration (no braces) in old LaTeX; here we
    // only handle the braced variant \rm{X} which T3 actually uses.
    expect(transformLatexTextMacros('\\rm{roman text}')).toBe('roman text')
  })

  test('converts \\bfseries{X} to **X** (bold declaration variant)', () => {
    expect(transformLatexTextMacros('\\bfseries{bold text}')).toBe('**bold text**')
  })
})

// 集成测试：完整渲染管线 (react-markdown + remark-math + rehype-katex +
// remarkLatexTextMacros) 下，seed corpus 不应有 LaTeX 文本宏字面出现在 HTML 里
describe('v3 corpus guard — no raw LaTeX text macros leak in rendered HTML', () => {
  test('collected a non-empty corpus of markdown fields', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  test.each(cases)('renders $label with zero raw LaTeX text macro tokens', ({ source }) => {
    const html = renderToHtml(source)
    for (const token of RAW_MACRO_TOKENS) {
      expect(html, `expected no literal ${token} in HTML`).not.toContain(token)
    }
  })
})