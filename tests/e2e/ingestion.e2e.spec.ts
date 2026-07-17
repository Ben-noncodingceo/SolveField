import { expect, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { sha256Hex } from '../../src/ingestion/validation'
import { ingestionSample } from '../helpers/ingestionSample'

const baseURL = 'http://localhost:3000'
const rawToken = 'test-only-ingestion-token'
const unique = 'e2e-ingest'
const ingestionAdmin = { email: 'ingestion-e2e@solvefield.invalid', password: 'test-ingestion-admin', role: 'admin' as const }
let payload: Payload

async function cleanup() {
  const jobs = await payload.find({ collection: 'ingestion-jobs', where: { importId: { contains: unique.replaceAll('-', '_') } }, limit: 100, overrideAccess: true })
  for (const job of jobs.docs) {
    const items = await payload.find({ collection: 'ingestion-items', where: { job: { equals: job.id } }, limit: 100, overrideAccess: true })
    for (const item of items.docs) {
      await payload.delete({ collection: 'problems', where: { ingestionItem: { equals: item.id } }, overrideAccess: true })
      const assets = await payload.find({ collection: 'ingestion-assets', where: { item: { equals: item.id } }, limit: 100, overrideAccess: true })
      for (const asset of assets.docs) await payload.delete({ collection: 'ingestion-assets', id: asset.id, overrideAccess: true })
      await payload.delete({ collection: 'ingestion-items', id: item.id, overrideAccess: true })
    }
    await payload.delete({ collection: 'ingestion-jobs', id: job.id, overrideAccess: true })
  }
  await payload.delete({ collection: 'problems', where: { slug: { equals: `${unique}-ipho-2026-t1` } }, overrideAccess: true })
  await payload.delete({ collection: 'competitions', where: { slug: { equals: `${unique}-ipho-2026` } }, overrideAccess: true })
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
})
