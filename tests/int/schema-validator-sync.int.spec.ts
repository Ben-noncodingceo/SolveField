import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import validateSchema from '../../src/ingestion/schemaValidator.generated'
import { OUTPUT_RELATIVE_PATH, generateValidatorCode } from '../../scripts/generate-schema-validator'

// The worker must never run ajv.compile() (Workers forbid runtime code
// generation — it crashed production), so the validator is precompiled and
// checked in. These tests keep that artifact honest.

describe('precompiled ingest schema validator', () => {
  it('checked-in generated validator is in sync with schema.json', () => {
    const checkedIn = readFileSync(join(process.cwd(), OUTPUT_RELATIVE_PATH), 'utf8')
    expect(checkedIn).toBe(generateValidatorCode())
  })

  it('contains no runtime code generation or require calls', () => {
    const checkedIn = readFileSync(join(process.cwd(), OUTPUT_RELATIVE_PATH), 'utf8')
    expect(checkedIn).not.toContain('new Function')
    expect(checkedIn).not.toContain('require(')
    expect(checkedIn).not.toContain('ajv/dist/runtime')
    expect(checkedIn).not.toContain('ajv-formats/dist')
  })

  it('accepts the frozen contract example and rejects a broken manifest', () => {
    expect(validateSchema(example)).toBe(true)
    const broken = structuredClone(example) as Record<string, unknown>
    delete broken.importId
    expect(validateSchema(broken)).toBe(false)
    expect(validateSchema.errors?.some((error: { message?: string }) => error.message?.includes('importId'))).toBe(true)
  })

  it('accepts answer-only solution figure placement and rejects unknown placement fields', () => {
    const answerAsset = structuredClone(example) as unknown as {
      item: { images: Array<Record<string, unknown>> }
      [key: string]: unknown
    }
    answerAsset.item.images[0].role = 'solution-figure'
    answerAsset.item.images[0].placementField = 'answerOriginal'
    expect(validateSchema(answerAsset)).toBe(true)

    answerAsset.item.images[0].placementField = 'answerPreview'
    expect(validateSchema(answerAsset)).toBe(false)
  })

  it('validates Worker-safe string lengths and strict formats', () => {
    const withUnicode = structuredClone(example)
    withUnicode.item.titleOriginal = '🧪'
    expect(validateSchema(withUnicode)).toBe(true)

    const invalidDateTime = structuredClone(example)
    invalidDateTime.sourceBundle.retrievedAt = '2026-02-30T10:00:00Z'
    expect(validateSchema(invalidDateTime)).toBe(false)

    const relativeURL = structuredClone(example)
    relativeURL.sourceBundle.sourceUrl = '/not-an-absolute-uri'
    expect(validateSchema(relativeURL)).toBe(false)

    const urnURL = structuredClone(example)
    urnURL.sourceBundle.sourceUrl = 'urn:uuid:12345678-1234-1234-1234-123456789abc'
    expect(validateSchema(urnURL)).toBe(true)

    const malformedEscape = structuredClone(example)
    malformedEscape.sourceBundle.sourceUrl = 'https://example.test/%GG'
    expect(validateSchema(malformedEscape)).toBe(false)
  })
})
