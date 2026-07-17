import { describe, expect, it } from 'vitest'

import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import { computeContentHash, normalizedSimilarity, validateIngestionRequest } from '../../src/ingestion/validation'
import { ingestionSample } from '../helpers/ingestionSample'

describe('ingestion v1 contract', () => {
  it('reproduces the frozen RFC 8785 content hash exactly', async () => {
    expect(await computeContentHash(example)).toBe(example.item.contentHash)
  })

  it('accepts Ted\'s IPhO T1 manifest shape and recomputes untrusted validation fields', async () => {
    const body = await ingestionSample()
    body.manifest.validation.schemaValid = false
    body.manifest.validation.taxonomyValid = false
    const result = await validateIngestionRequest(body)

    expect(result.hasErrors).toBe(false)
    expect(result.manifest.validation.schemaValid).toBe(true)
    expect(result.manifest.validation.taxonomyValid).toBe(true)
    expect(result.manifest.validation.katex.formulaCount).toBeGreaterThan(100)
    expect(result.manifest.workflow).toMatchObject({
      createAs: 'draft',
      publishAllowed: false,
      humanApprovalRequired: true,
      reviewState: 'needs-review',
    })
    expect(result.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.code)).toContain('IMAGE_BYTES_PENDING')
  })

  it('rejects source hash tampering without creating a valid draft', async () => {
    const body = await ingestionSample()
    body.manifest.sourceBundle.files[0].fileHash = `sha256:${'0'.repeat(64)}`
    const result = await validateIngestionRequest(body)
    expect(result.hasErrors).toBe(true)
    expect(result.issues.map((issue) => issue.code)).toContain('SOURCE_FILE_HASH_MISMATCH')
  })

  it('rejects cross-field bbox and placement-marker violations', async () => {
    const body = await ingestionSample()
    body.manifest.item.images[0].sourceRegion.x = 0.9
    body.manifest.item.images[0].sourceRegion.width = 0.2
    body.manifest.item.images[1].placementMarker = 'asset://fig-1c'
    const result = await validateIngestionRequest(body)
    expect(result.hasErrors).toBe(true)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['BOUNDING_BOX_OUT_OF_RANGE', 'ASSET_MARKER_MISMATCH']))
  })

  it('blocks confidence below 0.70 and unknown taxonomy keys', async () => {
    const body = await ingestionSample()
    body.manifest.fieldAssessments['/item/contentOriginal'].confidence = 0.69
    body.manifest.item.tags.push('invented-taxonomy-key')
    const result = await validateIngestionRequest(body)
    expect(result.hasErrors).toBe(true)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['LOW_CONFIDENCE_BLOCKED', 'TAXONOMY_TAG_UNKNOWN']))
  })

  it('uses warning-only fuzzy similarity at the frozen 0.92 threshold', () => {
    expect(normalizedSimilarity('A physics problem with $x^2$.', 'A physics problem with $x^2$.')).toBe(1)
    expect(normalizedSimilarity('completely unrelated', 'orbital mechanics')).toBeLessThan(0.92)
  })
})
