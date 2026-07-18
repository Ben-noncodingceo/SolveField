import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv'
import standaloneCode from 'ajv/dist/standalone'
import addFormats from 'ajv-formats'

import schema from '../docs/ingestion-v1/schema.json' with { type: 'json' }

// Cloudflare Workers forbid runtime code generation (new Function), so
// ajv.compile() must never run inside the worker. This script precompiles the
// frozen ingest v1 schema into a static validator module at authoring time;
// src/ingestion/validation.ts imports the generated file instead of compiling.
// tests/int/schema-validator-sync.int.spec.ts asserts the checked-in output
// stays in sync with schema.json and these options.

export const OUTPUT_RELATIVE_PATH = 'src/ingestion/schemaValidator.generated.js'

export const generateValidatorCode = (): string => {
  const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  // Even with esm:true, ajv standalone emits external scope values as
  // require() calls; rewrite them to static imports so the module loads in
  // an ESM worker bundle.
  const code = standaloneCode(ajv, validate)
    .replaceAll('require("ajv/dist/runtime/ucs2length").default', '__ucs2length')
    .replaceAll('require("ajv-formats/dist/formats").fullFormats', '__fullFormats')
  if (code.includes('require(')) {
    throw new Error('Unrewritten require() left in standalone validator output — extend the import fixups above.')
  }
  const banner = [
    '/* eslint-disable */',
    '// GENERATED FILE — do not edit by hand.',
    '// Rebuild with: pnpm run generate:schema-validator',
    '// Source of truth: docs/ingestion-v1/schema.json (frozen ingest v1 contract).',
    '// Precompiled because Cloudflare Workers disallow runtime code generation.',
    'import __ucs2length from "ajv/dist/runtime/ucs2length";',
    'import { fullFormats as __fullFormats } from "ajv-formats/dist/formats";',
    '',
  ].join('\n')
  return `${banner}${code}\n`
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const outputPath = join(repoRoot, OUTPUT_RELATIVE_PATH)
  writeFileSync(outputPath, generateValidatorCode(), 'utf8')
  console.log(`Wrote ${OUTPUT_RELATIVE_PATH}`)
}
