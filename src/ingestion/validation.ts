import canonicalize from 'canonicalize'
import katex from 'katex'
import { PDFDocument } from 'pdf-lib'

import taxonomy from '../../content/tags-taxonomy.json' with { type: 'json' }
import { katexOptions } from '../lib/katex'
// Precompiled from docs/ingestion-v1/schema.json (pnpm run generate:schema-validator).
// Cloudflare Workers forbid runtime code generation, so ajv.compile() must
// never run in the worker — it crashes workerd at startup with
// "Error compiling schema" and takes the whole site down.
import validateSchema from './schemaValidator.generated'
import type { IngestionIssue, IngestionRequestBody, ValidatedIngestion } from './types'
const allowedTags = new Set(taxonomy.categories.flatMap((category) => category.subtopics.map((tag) => tag.key)))

export const normalizeText = (value: string) =>
  value.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').map((line) => line.trimEnd()).join('\n').trim()

export const sha256Hex = async (bytes: Uint8Array | string) => {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const owned = new Uint8Array(input.byteLength)
  owned.set(input)
  const digest = await crypto.subtle.digest('SHA-256', owned.buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const decodeBase64 = (value: string) => {
  const raw = atob(value)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

const countPDFPages = async (bytes: Uint8Array) => {
  try {
    return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()
  } catch {
    return 0
  }
}

export const formulaeFromMarkdown = (markdown: string) => {
  const formulae: string[] = []
  const matcher = /\$\$([\s\S]*?)\$\$|(?<!\\)\$(?!\$)((?:\\.|[^$\\])+)\$/g
  for (const match of markdown.matchAll(matcher)) formulae.push((match[1] ?? match[2]).trim())
  return formulae.filter(Boolean)
}

const contentHashInput = (manifest: Record<string, any>) => {
  const item = manifest.item
  return {
    competitionSlug: manifest.competition.competitionSlug,
    paperCode: manifest.paper.paperCode,
    problemCode: item.problemCode,
    originalLanguage: item.originalLanguage,
    contentOriginal: normalizeText(item.contentOriginal),
    contentZh: item.contentZh == null ? null : normalizeText(item.contentZh),
    contentEn: item.contentEn == null ? null : normalizeText(item.contentEn),
    answerOriginal: item.answerOriginal == null ? null : normalizeText(item.answerOriginal),
    answerZh: item.answerZh == null ? null : normalizeText(item.answerZh),
    answerEn: item.answerEn == null ? null : normalizeText(item.answerEn),
    images: item.images.map((image: Record<string, any>) => ({
      assetKey: image.assetKey,
      contentHash: image.contentHash,
      sourcePage: image.sourcePage,
      sourceRegion: image.sourceRegion,
      placementMarker: image.placementMarker,
    })),
  }
}

export const computeContentHash = async (manifest: Record<string, any>) => {
  const canonical = canonicalize(contentHashInput(manifest))
  if (!canonical) return null
  return `sha256:${await sha256Hex(canonical)}`
}

const addIssue = (
  issues: IngestionIssue[],
  code: string,
  severity: IngestionIssue['severity'],
  path: string,
  message: string,
) => issues.push({ code, severity, path, message })

const validatePageRef = (
  ref: Record<string, any>,
  path: string,
  files: Map<string, Record<string, any>>,
  issues: IngestionIssue[],
) => {
  const file = files.get(ref?.fileId)
  if (!file) return addIssue(issues, 'UNKNOWN_SOURCE_FILE', 'error', path, 'Referenced fileId is not in sourceBundle.files.')
  if (!Number.isInteger(ref.pageIndex) || ref.pageIndex < 1 || ref.pageIndex > file.pageCount) {
    addIssue(issues, 'SOURCE_PAGE_OUT_OF_RANGE', 'error', path, 'pageIndex is outside the recomputed PDF page range.')
  }
}

export async function validateIngestionRequest(
  body: IngestionRequestBody,
  bucket?: R2Bucket,
  options: { acceptServerRecomputedContentHash?: boolean } = {},
): Promise<ValidatedIngestion> {
  const manifest = structuredClone(body?.manifest ?? {})
  const rawManifest = body?.manifest ?? {}
  const issues: IngestionIssue[] = []
  const sourceBytes = new Map<string, Uint8Array>()
  const assetBytes = new Map<string, { bytes: Uint8Array; mediaType: string; originalFileName: string }>()

  if (!validateSchema(manifest)) {
    for (const error of validateSchema.errors ?? []) {
      addIssue(issues, 'SCHEMA_INVALID', 'error', error.instancePath || '/', error.message ?? 'Schema validation failed.')
    }
  }

  const suppliedSources = new Map((body?.sourceFiles ?? []).map((file) => [file.fileId, file.dataBase64]))
  const files = new Map<string, Record<string, any>>()
  for (const [index, file] of (manifest.sourceBundle?.files ?? []).entries()) {
    if (files.has(file.fileId)) {
      addIssue(issues, 'DUPLICATE_SOURCE_FILE_ID', 'error', `/sourceBundle/files/${index}/fileId`, 'fileId must be unique within sourceBundle.files.')
      continue
    }
    const encoded = suppliedSources.get(file.fileId)
    if (!encoded) {
      addIssue(issues, 'SOURCE_FILE_BYTES_REQUIRED', 'error', `/sourceBundle/files/${index}`, 'Raw PDF bytes are required for server-side verification.')
      continue
    }
    let bytes: Uint8Array
    try {
      bytes = decodeBase64(encoded)
    } catch {
      addIssue(issues, 'SOURCE_FILE_BASE64_INVALID', 'error', `/sourceBundle/files/${index}`, 'Source PDF is not valid base64.')
      continue
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      addIssue(issues, 'SOURCE_FILE_TOO_LARGE', 'error', `/sourceBundle/files/${index}`, 'Each source PDF is limited to 25 MiB.')
    }
    const hash = `sha256:${await sha256Hex(bytes)}`
    const pageCount = await countPDFPages(bytes)
    if (!pageCount) addIssue(issues, 'SOURCE_FILE_INVALID_PDF', 'error', `/sourceBundle/files/${index}`, 'Source bytes are not a readable PDF with at least one page.')
    if (file.fileHash !== hash) addIssue(issues, 'SOURCE_FILE_HASH_MISMATCH', 'error', `/sourceBundle/files/${index}/fileHash`, 'Reported fileHash does not match raw PDF bytes.')
    if (file.byteSize !== bytes.byteLength) addIssue(issues, 'SOURCE_FILE_SIZE_MISMATCH', 'error', `/sourceBundle/files/${index}/byteSize`, 'Reported byteSize does not match raw PDF bytes.')
    if (file.pageCount !== pageCount) addIssue(issues, 'SOURCE_FILE_PAGE_COUNT_MISMATCH', 'error', `/sourceBundle/files/${index}/pageCount`, 'Reported pageCount does not match the PDF page tree.')
    file.fileHash = hash
    file.byteSize = bytes.byteLength
    file.pageCount = pageCount
    file.r2ObjectKey = `ingestion/sources/${hash.slice(7)}/${file.originalFileName}`
    files.set(file.fileId, file)
    sourceBytes.set(file.fileId, bytes)
  }
  for (const suppliedFileId of suppliedSources.keys()) {
    if (!(manifest.sourceBundle?.files ?? []).some((file: Record<string, any>) => file.fileId === suppliedFileId)) {
      addIssue(issues, 'UNDECLARED_SOURCE_FILE', 'error', '/sourceFiles', `Raw bytes were supplied for undeclared fileId ${suppliedFileId}.`)
    }
  }
  if ([...sourceBytes.values()].reduce((total, bytes) => total + bytes.byteLength, 0) > 100 * 1024 * 1024) {
    addIssue(issues, 'SOURCE_BUNDLE_TOO_LARGE', 'error', '/sourceBundle/files', 'Combined source PDFs are limited to 100 MiB.')
  }

  const bundleLines = [...files.values()]
    .sort((a, b) => a.originalFileName.localeCompare(b.originalFileName))
    .map((file) => `${file.originalFileName}:${file.fileHash.slice(7)}\n`)
    .join('')
  const bundleHash = `sha256:${await sha256Hex(bundleLines)}`
  if (rawManifest.sourceBundle?.bundleHash !== bundleHash) {
    addIssue(issues, 'BUNDLE_HASH_MISMATCH', 'error', '/sourceBundle/bundleHash', 'Reported bundleHash does not match the verified source files.')
  }
  if (manifest.sourceBundle) manifest.sourceBundle.bundleHash = bundleHash

  for (const asset of body?.assetFiles ?? []) {
    try {
      assetBytes.set(asset.assetKey, {
        bytes: decodeBase64(asset.dataBase64),
        mediaType: asset.mediaType,
        originalFileName: asset.originalFileName,
      })
      if (assetBytes.get(asset.assetKey)!.bytes.byteLength > 10 * 1024 * 1024) {
        addIssue(issues, 'ASSET_FILE_TOO_LARGE', 'error', '/assetFiles', `Asset ${asset.assetKey} exceeds the 10 MiB limit.`)
      }
    } catch {
      addIssue(issues, 'ASSET_BASE64_INVALID', 'error', '/item/images', `Asset ${asset.assetKey} is not valid base64.`)
    }
  }

  const imageKeys = new Set<string>()
  for (const [index, image] of (manifest.item?.images ?? []).entries()) {
    const path = `/item/images/${index}`
    if (imageKeys.has(image.assetKey)) addIssue(issues, 'DUPLICATE_ASSET_KEY', 'error', `${path}/assetKey`, 'assetKey must be unique within an item.')
    imageKeys.add(image.assetKey)
    validatePageRef(image.sourcePage, `${path}/sourcePage`, files, issues)
    const box = image.sourceRegion
    if (box && (box.x + box.width > 1 || box.y + box.height > 1)) {
      addIssue(issues, 'BOUNDING_BOX_OUT_OF_RANGE', 'error', `${path}/sourceRegion`, 'Normalized bounding box extends beyond the source page.')
    }
    if (image.placementMarker !== `asset://${image.assetKey}`) {
      addIssue(issues, 'ASSET_MARKER_MISMATCH', 'error', `${path}/placementMarker`, 'placementMarker must match assetKey exactly.')
    }
    const suppliedAsset = assetBytes.get(image.assetKey)
    if (suppliedAsset) {
      image.contentHash = `sha256:${await sha256Hex(suppliedAsset.bytes)}`
      image.r2ObjectKey = `ingestion/assets/${image.contentHash.slice(7)}/${suppliedAsset.originalFileName}`
    } else if (!image.contentHash || !image.r2ObjectKey) {
      addIssue(issues, 'IMAGE_BYTES_PENDING', 'warning', path, 'Image crop bytes, hash, and private R2 object are required before approval.')
    }
  }

  for (const [index, ref] of (manifest.item?.sourcePages ?? []).entries()) validatePageRef(ref, `/item/sourcePages/${index}`, files, issues)
  for (const [pointer, assessment] of Object.entries(manifest.fieldAssessments ?? {}) as [string, any][]) {
    for (const [index, evidence] of (assessment.evidence ?? []).entries()) {
      if (evidence.sourcePage) validatePageRef(evidence.sourcePage, `/fieldAssessments/${pointer}/evidence/${index}`, files, issues)
    }
    if (assessment.confidence < 0.7) addIssue(issues, 'LOW_CONFIDENCE_BLOCKED', 'error', pointer, 'Confidence below 0.70 must be re-extracted or filled by a human.')
  }

  for (const [index, tag] of (manifest.item?.tags ?? []).entries()) {
    if (!allowedTags.has(tag)) addIssue(issues, 'TAXONOMY_TAG_UNKNOWN', 'error', `/item/tags/${index}`, `Unknown taxonomy key: ${tag}`)
  }

  const contentFields = ['contentOriginal', 'contentZh', 'contentEn', 'answerOriginal', 'answerZh', 'answerEn']
  let formulaCount = 0
  const markerCounts = new Map<string, number>()
  const originalMarkerCounts = new Map<string, number>()
  for (const field of contentFields) {
    const value = manifest.item?.[field]
    if (typeof value !== 'string') continue
    for (const formula of formulaeFromMarkdown(value)) {
      formulaCount += 1
      const rendered = katex.renderToString(formula, katexOptions)
      if (rendered.includes('katex-error')) addIssue(issues, 'KATEX_RENDER_ERROR', 'error', `/item/${field}`, `KaTeX could not render formula ${formulaCount}.`)
    }
    for (const match of value.matchAll(/asset:\/\/([a-z0-9][a-z0-9-]{1,63})/g)) {
      markerCounts.set(match[1], (markerCounts.get(match[1]) ?? 0) + 1)
      if (field === 'contentOriginal') originalMarkerCounts.set(match[1], (originalMarkerCounts.get(match[1]) ?? 0) + 1)
    }
  }
  for (const key of imageKeys) {
    if (originalMarkerCounts.get(key) !== 1) addIssue(issues, 'ASSET_MARKER_CARDINALITY', 'error', '/item/contentOriginal', `asset://${key} must appear exactly once in contentOriginal.`)
  }
  for (const key of markerCounts.keys()) {
    if (!imageKeys.has(key)) addIssue(issues, 'UNKNOWN_ASSET_MARKER', 'error', '/item/contentOriginal', `asset://${key} has no matching image record.`)
  }

  const computedContentHash = await computeContentHash(manifest)
  if (!computedContentHash) addIssue(issues, 'CONTENT_CANONICALIZATION_FAILED', 'error', '/item', 'Content could not be canonicalized with JCS.')
  const contentHash = computedContentHash ?? `sha256:${await sha256Hex('')}`
  if (!options.acceptServerRecomputedContentHash && rawManifest.item?.contentHash !== contentHash) addIssue(issues, 'CONTENT_HASH_MISMATCH', 'error', '/item/contentHash', 'Reported contentHash does not match normalized JCS content.')
  if (manifest.item) manifest.item.contentHash = contentHash

  const bundleHashHex = bundleHash.slice(7)
  const sourceItemKey = await sha256Hex(`${bundleHashHex}\n${manifest.item?.problemCode ?? ''}`)
  const idempotencyKey = `ingest-v1:${sourceItemKey}`
  if (rawManifest.idempotencyKey !== idempotencyKey) addIssue(issues, 'IDEMPOTENCY_KEY_MISMATCH', 'error', '/idempotencyKey', 'Reported idempotencyKey does not match the verified source bundle and problemCode.')
  manifest.idempotencyKey = idempotencyKey

  if (manifest.workflow?.createAs !== 'draft' || manifest.workflow?.publishAllowed !== false || manifest.workflow?.humanApprovalRequired !== true) {
    addIssue(issues, 'WORKFLOW_BOUNDARY_VIOLATION', 'error', '/workflow', 'Ingestion must remain draft-only and require human approval.')
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const clientIssues = Array.isArray(rawManifest.validation?.issues) ? rawManifest.validation.issues : []
  const mergedIssues = [...clientIssues.filter((issue: IngestionIssue) => issue?.severity === 'info'), ...issues]
  manifest.validation = {
    schemaValid: !issues.some((issue) => issue.code === 'SCHEMA_INVALID'),
    taxonomyValid: !issues.some((issue) => issue.code === 'TAXONOMY_TAG_UNKNOWN'),
    katex: {
      checked: true,
      formulaCount,
      errors: issues.filter((issue) => issue.code === 'KATEX_RENDER_ERROR'),
    },
    imageMapping: {
      expectedCount: imageKeys.size,
      mappedCount: [...imageKeys].filter((key) => originalMarkerCounts.get(key) === 1).length,
      allPlacementMarkersResolved: !issues.some((issue) => issue.code.includes('MARKER')),
    },
    overallConfidence: Math.min(...Object.values(manifest.fieldAssessments ?? {}).map((assessment: any) => assessment.confidence), 1),
    needsReview: true,
    issues: mergedIssues,
  }
  manifest.workflow = { ...manifest.workflow, createAs: 'draft', publishAllowed: false, humanApprovalRequired: true, reviewState: 'needs-review' }

  if (!hasErrors && bucket) {
    await Promise.all([
      ...[...files.values()].map((file) => bucket.put(file.r2ObjectKey, sourceBytes.get(file.fileId)!, { httpMetadata: { contentType: 'application/pdf' } })),
      ...(manifest.item?.images ?? []).flatMap((image: Record<string, any>) => {
        const asset = assetBytes.get(image.assetKey)
        return asset && image.r2ObjectKey
          ? [bucket.put(image.r2ObjectKey, asset.bytes, { httpMetadata: { contentType: asset.mediaType } })]
          : []
      }),
    ])
  }

  const identityKey = `${manifest.competition?.competitionSlug ?? ''}\n${manifest.paper?.paperCode ?? ''}\n${manifest.item?.problemCode ?? ''}`
  return { manifest, sourceBytes, assetBytes, issues, hasErrors, identityKey }
}

export const normalizedSimilarity = (left: string, right: string) => {
  const normalize = (value: string) => normalizeText(value).toLowerCase().replace(/\s+/g, ' ')
  const a = normalize(left)
  const b = normalize(right)
  if (a === b) return 1
  if (a.length < 3 || b.length < 3) return 0
  const grams = (value: string) => {
    const result = new Map<string, number>()
    for (let index = 0; index <= value.length - 3; index += 1) result.set(value.slice(index, index + 3), (result.get(value.slice(index, index + 3)) ?? 0) + 1)
    return result
  }
  const ga = grams(a)
  const gb = grams(b)
  let intersection = 0
  for (const [gram, count] of ga) intersection += Math.min(count, gb.get(gram) ?? 0)
  const total = [...ga.values()].reduce((sum, value) => sum + value, 0) + [...gb.values()].reduce((sum, value) => sum + value, 0)
  return total ? (2 * intersection) / total : 0
}
