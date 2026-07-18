import katex from 'katex'
import { describe, expect, it, test } from 'vitest'

import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import seed from '../../content/seed.json' with { type: 'json' }
import { katexMacros, katexOptions } from '../../src/lib/katex'
import { formulaeFromMarkdown } from '../../src/ingestion/validation'

// Machine guard for the single KaTeX config source (src/lib/katex.ts).
// Renders every formula in the real production corpus (seed.json, ~224 across
// IPhO T1/T2/T3) and the ingestion contract example (example.json, the 158
// formulas Ted hand-verified), asserting zero `katex-error`. If anyone changes
// the shared macro set and it breaks real content, CI fails here — naming the
// exact formula — instead of relying on a human eyeballing formulas. Uses the
// same extractor and options production validation uses, so the guard tracks
// production behaviour (incl. the shared `$…$`/`$$…$$` delimiter parsing).

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, out)
  return out
}

const formulaeFrom = (root: unknown) => collectStrings(root).flatMap((text) => formulaeFromMarkdown(text))

// KaTeX rewrites the passed `macros` object in place, so a fresh copy per
// formula is required — a shared object leaks macro state across renders and
// could false-green (or false-red) the guard. Matches src/components/
// MarkdownLatex.tsx:14 and src/lib/katex.ts's per-render-copy note.
const rendersClean = (formula: string) =>
  !katex.renderToString(formula, { ...katexOptions, macros: { ...katexMacros } }).includes('katex-error')

const seedFormulae = formulaeFrom(seed)
const exampleFormulae = formulaeFrom(example)

describe('KaTeX corpus render guard (shared src/lib/katex.ts)', () => {
  // Guard against silent zero-extraction masking a real regression.
  it('extracts a non-trivial formula corpus from both fixtures', () => {
    expect(seedFormulae.length).toBeGreaterThan(100)
    expect(exampleFormulae.length).toBeGreaterThan(0)
  })

  test.each(seedFormulae.map((formula, index) => [index, formula]))(
    'seed.json formula #%i renders without katex-error',
    (_index, formula) => expect(rendersClean(formula)).toBe(true),
  )

  test.each(exampleFormulae.map((formula, index) => [index, formula]))(
    'example.json formula #%i renders without katex-error',
    (_index, formula) => expect(rendersClean(formula)).toBe(true),
  )
})
