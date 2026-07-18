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
  })

  it('accepts the frozen contract example and rejects a broken manifest', () => {
    expect(validateSchema(example)).toBe(true)
    const broken = structuredClone(example) as Record<string, unknown>
    delete broken.importId
    expect(validateSchema(broken)).toBe(false)
    expect(validateSchema.errors?.some((error: { message?: string }) => error.message?.includes('importId'))).toBe(true)
  })
})
