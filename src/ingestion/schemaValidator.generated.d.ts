import type { ErrorObject } from 'ajv'

// Hand-written types for the generated standalone validator (see
// scripts/generate-schema-validator.ts). Narrower than ajv's ValidateFunction
// on purpose: the standalone function only exposes the call signature and
// `errors`, not schema/schemaEnv.
declare const validateSchema: {
  (data: unknown): boolean
  errors?: ErrorObject[] | null
}

export default validateSchema
