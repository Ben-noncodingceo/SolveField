import { Buffer } from 'node:buffer'

import example from '../../docs/ingestion-v1/example.json' with { type: 'json' }
import type { IngestionRequestBody } from '../../src/ingestion/types'
import { sha256Hex, validateIngestionRequest } from '../../src/ingestion/validation'

const mockPDF = (label: string) => new TextEncoder().encode(
  `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Label (${label}) >>\nendobj\n%%EOF`,
)

export async function ingestionSample(options: { unique?: string; withImages?: boolean } = {}): Promise<IngestionRequestBody> {
  const manifest = structuredClone(example) as Record<string, any>
  const unique = options.unique
  if (unique) {
    manifest.importId = `ing_${unique.replaceAll('-', '_')}`
    manifest.competition.competitionSlug = `${unique}-ipho-2026`
    manifest.item.slugCandidate = `${unique}-ipho-2026-t1`
    manifest.item.problemCode = `T1-${unique.toUpperCase()}`
  }
  if (options.withImages === false) {
    manifest.item.images = []
    for (const field of ['contentOriginal', 'contentZh', 'contentEn']) {
      manifest.item[field] = manifest.item[field].replace(/\n*!\[[^\]]*\]\(asset:\/\/[^)]+\)\n*/g, '\n')
    }
  }

  const sources = manifest.sourceBundle.files.map((file: Record<string, any>) => ({ fileId: file.fileId, bytes: mockPDF(file.fileId) }))
  for (const file of manifest.sourceBundle.files) {
    const source = sources.find((candidate: { fileId: string }) => candidate.fileId === file.fileId)!
    file.byteSize = source.bytes.byteLength
    file.pageCount = 1
    file.fileHash = `sha256:${await sha256Hex(source.bytes)}`
  }
  const bundleLines = [...manifest.sourceBundle.files]
    .sort((a, b) => a.originalFileName.localeCompare(b.originalFileName))
    .map((file) => `${file.originalFileName}:${file.fileHash.slice(7)}\n`)
    .join('')
  manifest.sourceBundle.bundleHash = `sha256:${await sha256Hex(bundleLines)}`
  manifest.idempotencyKey = `ingest-v1:${await sha256Hex(`${manifest.sourceBundle.bundleHash.slice(7)}\n${manifest.item.problemCode}`)}`
  const sourceFiles = sources.map((source: { fileId: string; bytes: Uint8Array }) => ({ fileId: source.fileId, dataBase64: Buffer.from(source.bytes).toString('base64') }))
  const firstPass = await validateIngestionRequest({ manifest, sourceFiles })
  return { manifest: firstPass.manifest, sourceFiles }
}
