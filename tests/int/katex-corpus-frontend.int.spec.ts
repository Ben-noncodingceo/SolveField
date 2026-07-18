import { describe, expect, test } from 'vitest'

import seed from '../../content/seed.json' with { type: 'json' }
import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import { renderToHtml } from '../../src/lib/renderMarkdownLatex'

// v2 前台真实渲染路径护栏（与 katex-corpus.int.spec.ts 的 ingest 抽取器路径互补）：
// 对整段 markdown 字段跑 react-markdown + remark-math + rehype-katex（单一源 @/lib/katex），
// 断言 0 个 `katex-error`。这样除了 KaTeX 宏/公式本身，还多守一层 remark 的
// `$…$`/`$$…$$` 定界解析——ingest 抽取器是先正则抽公式再渲染，天然绕过定界。
// 语料同源：content/seed.json（T1/T2/T3）+ docs/ingestion-v1/example.json（Ted 那批）。

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

describe('KaTeX corpus — frontend render path (react-markdown + remark-math + rehype-katex)', () => {
  test('collected a non-empty corpus of markdown fields', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  test.each(cases)('renders $label with zero katex-error', ({ source }) => {
    const html = renderToHtml(source)
    expect(html).not.toContain('katex-error')
  })
})
