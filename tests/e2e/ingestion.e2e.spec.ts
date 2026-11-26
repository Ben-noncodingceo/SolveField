import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { computeContentHash, sha256Hex } from '../../src/ingestion/validation'
import type { IngestionRequestBody } from '../../src/ingestion/types'
import { ingestionSample } from '../helpers/ingestionSample'

const baseURL = 'http://localhost:3000'
const rawToken = 'test-only-ingestion-token'
const unique = 'e2e-ingest'
const ingestionAdmin = { email: 'ingestion-e2e@solvefield.invalid', password: 'test-ingestion-admin', role: 'admin' as const }
let payload: Payload

const solutionPNGBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l9sAAAAASUVORK5CYII='

async function answerAssetRevision(body: IngestionRequestBody): Promise<IngestionRequestBody> {
  const manifest = structuredClone(body.manifest)
  const solutionPNG = Buffer.from(solutionPNGBase64, 'base64')
  const solutionPDF = new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Label (solution) >>\nendobj\n%%EOF',
  )
  const solutionSource: {
    fileId: string
    originalFileName: string
    mediaType: string
    byteSize: number
    pageCount: number
    fileHash: string
    r2ObjectKey: string | null
  } = {
    fileId: 'src-solution',
    originalFileName: 'T1-solution.pdf',
    mediaType: 'application/pdf',
    byteSize: solutionPDF.byteLength,
    pageCount: 1,
    fileHash: `sha256:${await sha256Hex(solutionPDF)}`,
    r2ObjectKey: null,
  }
  manifest.importId = `${manifest.importId}_answer_revision`
  manifest.sourceBundle.files.push(solutionSource)
  manifest.item.answerOriginal = '## Official solution\n\n![Official solution diagram](asset://solution-figure-1)'
  manifest.item.images = [{
    assetKey: 'solution-figure-1',
    role: 'solution-figure',
    sourcePage: { fileId: solutionSource.fileId, pageIndex: 1, printedPageLabel: 'S1' },
    sourceRegion: { unit: 'normalized', origin: 'top-left', x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    placementMarker: 'asset://solution-figure-1',
    placementField: 'answerOriginal',
    altOriginal: 'Official solution diagram.',
    altZh: null,
    altEn: null,
    captionOriginal: 'Figure S1.',
    r2ObjectKey: null,
    contentHash: `sha256:${await sha256Hex(solutionPNG)}`,
    confidence: 0.99,
    needsReview: true,
  }]
  manifest.item.sourcePages.push({ fileId: solutionSource.fileId, pageIndex: 1, printedPageLabel: 'S1' })
  const bundleLines = [...manifest.sourceBundle.files]
    .sort((a, b) => a.originalFileName.localeCompare(b.originalFileName))
    .map((file) => `${file.originalFileName}:${file.fileHash.slice(7)}\n`)
    .join('')
  manifest.sourceBundle.bundleHash = `sha256:${await sha256Hex(bundleLines)}`
  manifest.idempotencyKey = `ingest-v1:${await sha256Hex(`${manifest.sourceBundle.bundleHash.slice(7)}\n${manifest.item.problemCode}`)}`
  manifest.item.contentHash = await computeContentHash(manifest)

  return {
    manifest,
    sourceFiles: [
      ...body.sourceFiles,
      { fileId: solutionSource.fileId, dataBase64: Buffer.from(solutionPDF).toString('base64') },
    ],
    assetFiles: [{
      assetKey: 'solution-figure-1',
      dataBase64: solutionPNGBase64,
      mediaType: 'image/png',
      originalFileName: 'solution-figure-1.png',
    }],
  }
}

async function cleanup() {
  const jobs = await payload.find({ collection: 'ingestion-jobs', where: { importId: { contains: unique.replaceAll('-', '_') } }, limit: 100, overrideAccess: true })
  for (const job of jobs.docs) {
    const items = await payload.find({ collection: 'ingestion-items', where: { job: { equals: job.id } }, limit: 100, overrideAccess: true })
    for (const item of items.docs) {
      await payload.delete({ collection: 'problems', where: { ingestionItem: { equals: item.id } }, overrideAccess: true })
      const assets = await payload.find({ collection: 'ingestion-assets', where: { item: { equals: item.id } }, limit: 100, overrideAccess: true })
      for (const asset of assets.docs) {
        const mediaID = typeof asset.createdMedia === 'object' ? asset.createdMedia?.id : asset.createdMedia
        await payload.delete({ collection: 'ingestion-assets', id: asset.id, overrideAccess: true })
        if (mediaID) await payload.delete({ collection: 'media', id: mediaID, overrideAccess: true })
      }
      await payload.delete({ collection: 'ingestion-items', id: item.id, overrideAccess: true })
    }
    await payload.delete({ collection: 'ingestion-jobs', id: job.id, overrideAccess: true })
  }
  await payload.delete({ collection: 'problems', where: { slug: { contains: unique } }, overrideAccess: true })
  await payload.delete({ collection: 'competitions', where: { slug: { contains: unique } }, overrideAccess: true })
  await payload.delete({ collection: 'ingestion-tokens', where: { name: { equals: unique } }, overrideAccess: true })
  await payload.delete({ collection: 'users', where: { email: { equals: ingestionAdmin.email } }, overrideAccess: true })
}

test.describe.serial('restricted ingestion API', () => {
  test.beforeAll(async () => {
    payload = await getPayload({ config })
    await cleanup()
    await payload.create({ collection: 'users', data: ingestionAdmin, overrideAccess: true })
    await payload.create({
      collection: 'ingestion-tokens',
      data: {
        name: unique,
        tokenHash: await sha256Hex(rawToken),
        scopes: ['ingestion:create', 'ingestion:update', 'ingestion:read-own'],
        disabled: false,
      },
      overrideAccess: true,
    })
  })

  test.afterAll(async () => {
    await cleanup()
  })

  test('rejects anonymous and tampered requests without persisting a draft', async ({ request }) => {
    const body = await ingestionSample({ unique, withImages: false })
    const anonymous = await request.post(`${baseURL}/api/ingestion/jobs`, { data: body })
    expect(anonymous.status()).toBe(401)

    body.manifest.item.contentHash = `sha256:${'0'.repeat(64)}`
    const tampered = await request.post(`${baseURL}/api/ingestion/jobs`, {
      data: body,
      headers: { authorization: `Bearer ${rawToken}` },
    })
    expect(tampered.status()).toBe(422)
    const persisted = await payload.find({ collection: 'ingestion-jobs', where: { importId: { equals: body.manifest.importId } }, overrideAccess: true })
    expect(persisted.totalDocs).toBe(0)
  })

  test('creates Ted-shaped draft once, then returns it idempotently', async ({ request }) => {
    const body = await ingestionSample({ unique, withImages: false })
    const first = await request.post(`${baseURL}/api/ingestion/jobs`, { data: body, headers: { authorization: `Bearer ${rawToken}` } })
    expect(first.status()).toBe(201)
    const created = await first.json()
    expect(created.item.createdProblem).toBeFalsy()
    expect(created.job.status).toBe('needs-review')

    const retry = await request.post(`${baseURL}/api/ingestion/jobs`, { data: body, headers: { authorization: `Bearer ${rawToken}` } })
    expect(retry.status()).toBe(200)
    const duplicate = await retry.json()
    expect(duplicate.duplicate).toBe('idempotency-key')
    expect(duplicate.job.id).toBe(created.job.id)

    const own = await request.get(`${baseURL}/api/ingestion/jobs/${created.job.id}`, { headers: { authorization: `Bearer ${rawToken}` } })
    expect(own.status()).toBe(200)
  })

  test('stores Ted\'s full three-image sample as review-only and blocks premature approval', async ({ request }) => {
    const body = await ingestionSample({ unique: `${unique}-img` })
    const created = await request.post(`${baseURL}/api/ingestion/jobs`, { data: body, headers: { authorization: `Bearer ${rawToken}` } })
    expect(created.status()).toBe(201)
    const draft = await created.json()
    expect(draft.warnings.map((warning: { code: string }) => warning.code)).toContain('IMAGE_BYTES_PENDING')
    expect(draft.item.createdProblem).toBeFalsy()

    const login = await request.post(`${baseURL}/api/users/login`, { data: { email: ingestionAdmin.email, password: ingestionAdmin.password } })
    expect(login.ok()).toBe(true)
    const approval = await request.post(`${baseURL}/api/ingestion/jobs/${draft.job.id}/approve`)
    expect(approval.status()).toBe(422)
    expect((await approval.json()).error).toBe('ASSETS_NOT_READY')
  })

  test('service token cannot publish, manage users, or call approval', async ({ request }) => {
    const jobs = await payload.find({ collection: 'ingestion-jobs', where: { importId: { equals: `ing_${unique.replaceAll('-', '_')}` } }, limit: 1, overrideAccess: true })
    const job = jobs.docs[0]
    const headers = { authorization: `Bearer ${rawToken}` }
    expect((await request.post(`${baseURL}/api/ingestion/jobs/${job.id}/approve`, { headers })).status()).toBe(403)
    expect((await request.post(`${baseURL}/api/ingestion/jobs/${job.id}/reject`, { headers, data: { reason: 'forbidden' } })).status()).toBe(403)
    expect((await request.post(`${baseURL}/api/problems`, { headers, data: {} })).status()).toBe(403)
    expect((await request.post(`${baseURL}/api/users`, { headers, data: {} })).status()).toBe(403)
  })

  test('admin session alone can approve and atomically publish the draft', async ({ request }) => {
    const login = await request.post(`${baseURL}/api/users/login`, { data: { email: ingestionAdmin.email, password: ingestionAdmin.password } })
    expect(login.ok()).toBe(true)
    const jobs = await payload.find({ collection: 'ingestion-jobs', where: { importId: { equals: `ing_${unique.replaceAll('-', '_')}` } }, limit: 1, overrideAccess: true })
    const response = await request.post(`${baseURL}/api/ingestion/jobs/${jobs.docs[0].id}/approve`)
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.approved).toBe(true)
    expect(result.problem.status).toBe('published')

    const item = await payload.find({ collection: 'ingestion-items', where: { job: { equals: jobs.docs[0].id } }, limit: 1, overrideAccess: true })
    expect(item.docs[0].reviewState).toBe('reviewed')
    expect(item.docs[0].createdProblem).toBeTruthy()
  })

  test('answer-only revision previews, uploads, and publishes a solution figure onto the existing problem', async ({ request }) => {
    const login = await request.post(`${baseURL}/api/users/login`, { data: { email: ingestionAdmin.email, password: ingestionAdmin.password } })
    expect(login.ok()).toBe(true)

    const base = await ingestionSample({ unique: `${unique}-answer`, withImages: false })
    const baseCreated = await request.post(`${baseURL}/api/ingestion/jobs`, {
      data: base,
      headers: { authorization: `Bearer ${rawToken}` },
    })
    expect(baseCreated.status()).toBe(201)
    const baseDraft = await baseCreated.json()
    const baseApproval = await request.post(`${baseURL}/api/ingestion/jobs/${baseDraft.job.id}/approve`)
    expect(baseApproval.status()).toBe(200)
    const originalProblem = (await baseApproval.json()).problem

    const revision = await answerAssetRevision(base)
    const revisionCreated = await request.post(`${baseURL}/api/ingestion/jobs`, {
      data: revision,
      headers: { authorization: `Bearer ${rawToken}` },
    })
    const revisionDraft = await revisionCreated.json()
    expect(revisionCreated.status(), JSON.stringify(revisionDraft)).toBe(201)
    expect(revisionDraft.revision).toBe(true)
    expect(revisionDraft.item.data.answerOriginal).toContain('asset://solution-figure-1')
    expect(revisionDraft.item.data.images[0]).toMatchObject({
      role: 'solution-figure',
      placementField: 'answerOriginal',
    })

    const preview = await request.get(`${baseURL}/api/ingestion/jobs/${revisionDraft.job.id}`, {
      headers: { authorization: `Bearer ${rawToken}` },
    })
    expect(preview.status()).toBe(200)
    expect((await preview.json()).item.data.answerOriginal).toContain('asset://solution-figure-1')

    const approval = await request.post(`${baseURL}/api/ingestion/jobs/${revisionDraft.job.id}/approve`)
    expect(approval.status()).toBe(200)
    const approved = await approval.json()
    expect(approved.problem.id).toBe(originalProblem.id)
    expect(approved.problem.contentOriginal).toBe(originalProblem.contentOriginal)
    expect(approved.problem.answerOriginal).toContain('/api/media/file/')
    expect(approved.problem.answerOriginal).not.toContain('asset://')

    const assets = await payload.find({
      collection: 'ingestion-assets',
      where: { item: { equals: revisionDraft.item.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(assets.totalDocs).toBe(1)
    expect(assets.docs[0]).toMatchObject({ status: 'approved', assetKey: 'solution-figure-1' })
    expect(assets.docs[0].createdMedia).toBeTruthy()

    const detail = await request.get(`${baseURL}/problems/${revision.manifest.item.slugCandidate}?lang=en`)
    expect(detail.status()).toBe(200)
    const html = await detail.text()
    expect(html).toContain('/api/media/file/')
    expect(html).not.toContain('asset://solution-figure-1')
  })
})
