import { Buffer } from 'node:buffer'
import type { Endpoint, PayloadRequest } from 'payload'
import { commitTransaction, initTransaction, killTransaction } from 'payload'

import type { IngestionRequestBody } from './types'
import { normalizedSimilarity, sha256Hex, validateIngestionRequest } from './validation'

type TokenDoc = { id: string | number; scopes?: string[]; disabled?: boolean; expiresAt?: string }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const idOf = (value: unknown) => (value && typeof value === 'object' && 'id' in value ? (value as { id: string | number }).id : value)
const isAdminUser = (user: unknown) => Boolean(user && typeof user === 'object' && 'role' in user && (user as { role: string }).role === 'admin')

async function authenticateServiceToken(req: PayloadRequest, scope: string): Promise<TokenDoc | Response> {
  const authorization = req.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) return json({ error: 'UNAUTHORIZED', message: 'A restricted ingestion bearer token is required.' }, 401)
  const tokenHash = await sha256Hex(match[1])
  const result = await req.payload.find({
    collection: 'ingestion-tokens' as any,
    where: { tokenHash: { equals: tokenHash } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const token = result.docs[0] as unknown as TokenDoc | undefined
  if (!token || token.disabled || (token.expiresAt && new Date(token.expiresAt) <= new Date())) {
    return json({ error: 'UNAUTHORIZED', message: 'The ingestion token is invalid, expired, or disabled.' }, 401)
  }
  if (!token.scopes?.includes(scope)) return json({ error: 'FORBIDDEN', message: `Token lacks ${scope}.` }, 403)
  await req.payload.update({
    collection: 'ingestion-tokens' as any,
    id: token.id,
    data: { lastUsedAt: new Date().toISOString() },
    overrideAccess: true,
    req,
  })
  return token
}

const transaction = async <T>(req: PayloadRequest, action: () => Promise<T>) => {
  const ownsTransaction = await initTransaction(req)
  try {
    const result = await action()
    if (ownsTransaction) await commitTransaction(req)
    return result
  } catch (error) {
    if (ownsTransaction) await killTransaction(req)
    throw error
  }
}

const auditEvent = (action: string, actor: string | number, detail?: unknown) => ({
  action,
  actor,
  at: new Date().toISOString(),
  ...(detail === undefined ? {} : { detail }),
})

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

export function ingestionEndpoints(bucket?: R2Bucket): Endpoint[] {
  const createJob: Endpoint['handler'] = async (req) => {
    const token = await authenticateServiceToken(req, 'ingestion:create')
    if (token instanceof Response) return token
    let body: IngestionRequestBody
    try {
      body = (await req.json!()) as IngestionRequestBody
    } catch {
      return json({ error: 'INVALID_JSON', message: 'Request body must be JSON.' }, 400)
    }

    const checked = await validateIngestionRequest(body, bucket)
    if (checked.hasErrors) return json({ error: 'INGESTION_VALIDATION_FAILED', issues: checked.issues }, 422)
    const manifest = checked.manifest

    const sameIdempotency = await req.payload.find({
      collection: 'ingestion-jobs' as any,
      where: { idempotencyKey: { equals: manifest.idempotencyKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (sameIdempotency.docs[0]) {
      const existing = sameIdempotency.docs[0] as any
      if (String(idOf(existing.actorToken)) !== String(token.id)) return json({ error: 'IDEMPOTENCY_KEY_OWNED_BY_ANOTHER_ACTOR' }, 409)
      const item = await req.payload.find({
        collection: 'ingestion-items' as any,
        where: { job: { equals: existing.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      return json({ duplicate: 'idempotency-key', job: existing, item: item.docs[0] }, 200)
    }

    const importMatch = await req.payload.find({
      collection: 'ingestion-jobs' as any,
      where: { importId: { equals: manifest.importId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (importMatch.docs[0]) return json({ error: 'IMPORT_ID_CONFLICT', message: 'A new revision requires a new importId.' }, 409)

    const identityMatches = await req.payload.find({
      collection: 'ingestion-items' as any,
      where: { identityKey: { equals: checked.identityKey } },
      sort: '-createdAt',
      limit: 1,
      depth: 1,
      overrideAccess: true,
      req,
    })
    const previous = identityMatches.docs[0] as any
    if (previous?.contentHash === manifest.item.contentHash) {
      const owner = idOf(previous.job?.actorToken)
      if (String(owner) !== String(token.id)) return json({ error: 'DUPLICATE_CONTENT_OWNED_BY_ANOTHER_ACTOR' }, 409)
      return json({ duplicate: 'identity-and-content', job: previous.job, item: previous }, 200)
    }
    if (previous && !token.scopes?.includes('ingestion:update')) {
      return json({ error: 'FORBIDDEN', message: 'Token lacks ingestion:update for a revision.' }, 403)
    }

    const sameContent = await req.payload.find({
      collection: 'ingestion-items' as any,
      where: { contentHash: { equals: manifest.item.contentHash } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (sameContent.docs[0]) {
      manifest.validation.issues.push({
        code: 'POSSIBLE_DUPLICATE_IDENTITY',
        severity: 'warning',
        path: '/item/problemCode',
        message: 'The same content hash exists under another competition/paper/problem identity.',
      })
    } else {
      const candidates = await req.payload.find({
        collection: 'ingestion-items' as any,
        limit: 100,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (candidates.docs.some((candidate: any) => normalizedSimilarity(candidate.data?.contentOriginal ?? '', manifest.item.contentOriginal) >= 0.92)) {
        manifest.validation.issues.push({
          code: 'FUZZY_DUPLICATE_CANDIDATE',
          severity: 'warning',
          path: '/item/contentOriginal',
          message: 'A normalized text candidate reached the 0.92 review threshold; no automatic merge was performed.',
        })
      }
    }

    try {
      const created = await transaction(req, async () => {
        const job = await req.payload.create({
          collection: 'ingestion-jobs' as any,
          data: {
            importId: manifest.importId,
            idempotencyKey: manifest.idempotencyKey,
            actorToken: token.id,
            status: 'needs-review',
            competitionSlug: manifest.competition.competitionSlug,
            paperCode: manifest.paper.paperCode,
            problemCode: manifest.item.problemCode,
            contentHash: manifest.item.contentHash,
            sourceBundle: manifest.sourceBundle,
            rawInput: body.manifest,
            normalizedInput: manifest,
            validation: manifest.validation,
            revisionOf: previous ? idOf(previous.job) : undefined,
            auditTrail: [auditEvent('draft-created', token.id)],
          },
          overrideAccess: true,
          req,
        })
        const item = await req.payload.create({
          collection: 'ingestion-items' as any,
          data: {
            job: job.id,
            identityKey: checked.identityKey,
            contentHash: manifest.item.contentHash,
            data: manifest.item,
            fieldAssessments: manifest.fieldAssessments,
            validation: manifest.validation,
            reviewState: 'needs-review',
            revisionOf: previous?.id,
            auditTrail: [auditEvent(previous ? 'revision-created' : 'draft-created', token.id)],
          },
          overrideAccess: true,
          req,
        })
        for (const image of manifest.item.images) {
          const file = checked.assetBytes.get(image.assetKey)
          await req.payload.create({
            collection: 'ingestion-assets' as any,
            data: {
              item: item.id,
              assetKey: image.assetKey,
              metadata: image,
              r2ObjectKey: image.r2ObjectKey,
              contentHash: image.contentHash,
              mediaType: file?.mediaType,
              originalFileName: file?.originalFileName,
              byteSize: file?.bytes.byteLength,
              status: 'unreviewed',
            },
            overrideAccess: true,
            req,
          })
        }
        return { job, item }
      })
      return json({ ...created, revision: Boolean(previous), warnings: manifest.validation.issues.filter((issue: any) => issue.severity === 'warning') }, 201)
    } catch (error) {
      req.payload.logger.error({ err: error }, 'Failed to persist ingestion draft')
      return json({ error: 'INGESTION_PERSIST_FAILED' }, 500)
    }
  }

  const readJob: Endpoint['handler'] = async (req) => {
    const token = await authenticateServiceToken(req, 'ingestion:read-own')
    if (token instanceof Response) return token
    const id = String(req.routeParams?.id ?? '')
    const result = await req.payload.find({
      collection: 'ingestion-jobs' as any,
      where: { and: [{ id: { equals: id } }, { actorToken: { equals: token.id } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (!result.docs[0]) return json({ error: 'NOT_FOUND' }, 404)
    const items = await req.payload.find({
      collection: 'ingestion-items' as any,
      where: { job: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    return json({ job: result.docs[0], item: items.docs[0] })
  }

  const approveJob: Endpoint['handler'] = async (req) => {
    if (!isAdminUser(req.user)) return json({ error: 'FORBIDDEN', message: 'Administrator session required.' }, 403)
    if (!bucket) return json({ error: 'STORAGE_UNAVAILABLE' }, 503)
    const id = String(req.routeParams?.id ?? '')
    let job: any
    try {
      job = await req.payload.findByID({ collection: 'ingestion-jobs' as any, id, depth: 0, overrideAccess: true, req })
    } catch {
      job = null
    }
    if (!job) return json({ error: 'NOT_FOUND' }, 404)
    if (job.status !== 'needs-review') return json({ error: 'INVALID_REVIEW_STATE' }, 409)
    const itemResult = await req.payload.find({ collection: 'ingestion-items' as any, where: { job: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const item = itemResult.docs[0] as any
    if (!item) return json({ error: 'ITEM_NOT_FOUND' }, 404)
    const assetsResult = await req.payload.find({ collection: 'ingestion-assets' as any, where: { item: { equals: item.id } }, limit: 100, depth: 0, overrideAccess: true, req })
    const assets = assetsResult.docs as any[]
    if (assets.some((asset) => !asset.r2ObjectKey || !asset.contentHash)) {
      return json({ error: 'ASSETS_NOT_READY', message: 'Every image requires verified bytes, hash, and private R2 key before approval.' }, 422)
    }

    const manifest = structuredClone(job.normalizedInput)
    manifest.item = item.data
    manifest.fieldAssessments = item.fieldAssessments
    const sourceFiles = []
    for (const source of manifest.sourceBundle.files) {
      const object = await bucket.get(source.r2ObjectKey)
      if (!object) return json({ error: 'SOURCE_OBJECT_MISSING', fileId: source.fileId }, 422)
      sourceFiles.push({ fileId: source.fileId, dataBase64: base64(new Uint8Array(await object.arrayBuffer())) })
    }
    const assetFiles = []
    for (const asset of assets) {
      const object = await bucket.get(asset.r2ObjectKey)
      if (!object) return json({ error: 'ASSET_OBJECT_MISSING', assetKey: asset.assetKey }, 422)
      assetFiles.push({
        assetKey: asset.assetKey,
        dataBase64: base64(new Uint8Array(await object.arrayBuffer())),
        mediaType: asset.mediaType,
        originalFileName: asset.originalFileName,
      })
    }
    const checked = await validateIngestionRequest(
      { manifest, sourceFiles, assetFiles },
      undefined,
      { acceptServerRecomputedContentHash: true },
    )
    if (checked.hasErrors) return json({ error: 'APPROVAL_VALIDATION_FAILED', issues: checked.issues }, 422)
    if (checked.manifest.competition.year == null || !checked.manifest.competition.nameZh || !checked.manifest.competition.nameEn) {
      return json({ error: 'FORMAL_COMPETITION_FIELDS_REQUIRED', message: 'year, nameZh, and nameEn must be filled before publishing.' }, 422)
    }

    try {
      const result = await transaction(req, async () => {
        const competitionData = checked.manifest.competition
        const competitions = await req.payload.find({ collection: 'competitions', where: { slug: { equals: competitionData.competitionSlug } }, limit: 1, depth: 0, overrideAccess: true, req })
        const competition = competitions.docs[0]
          ? await req.payload.update({
              collection: 'competitions', id: competitions.docs[0].id,
              data: { nameOriginal: competitionData.nameOriginal, nameZh: competitionData.nameZh, nameEn: competitionData.nameEn, year: competitionData.year, editionLabel: competitionData.editionLabel, level: competitionData.level },
              overrideAccess: true, req,
            })
          : await req.payload.create({
              collection: 'competitions',
              data: { slug: competitionData.competitionSlug, nameOriginal: competitionData.nameOriginal, nameZh: competitionData.nameZh, nameEn: competitionData.nameEn, year: competitionData.year, editionLabel: competitionData.editionLabel, level: competitionData.level },
              overrideAccess: true, req,
            })

        const mediaByAsset = new Map<string, any>()
        for (const asset of assets) {
          const object = await bucket.get(asset.r2ObjectKey)
          const bytes = Buffer.from(await object!.arrayBuffer())
          const media = await req.payload.create({
            collection: 'media',
            data: { alt: asset.metadata.altZh ?? asset.metadata.altOriginal },
            file: { data: bytes, mimetype: asset.mediaType, name: asset.originalFileName, size: bytes.byteLength },
            overrideAccess: true,
            req,
          })
          mediaByAsset.set(asset.assetKey, media)
          await req.payload.update({ collection: 'ingestion-assets' as any, id: asset.id, data: { status: 'approved', createdMedia: media.id }, overrideAccess: true, req })
        }

        const replaceMarkers = (value: unknown) => {
          if (typeof value !== 'string') return value
          let result = value
          for (const [assetKey, media] of mediaByAsset) result = result.replaceAll(`asset://${assetKey}`, media.url)
          return result
        }
        const data = checked.manifest.item
        const problemData: any = {
          slug: data.slugCandidate,
          competition: competition.id,
          paperCode: checked.manifest.paper.paperCode,
          problemCode: data.problemCode,
          difficulty: data.difficulty,
          tags: data.tags,
          originalLanguage: data.originalLanguage,
          contentOriginal: replaceMarkers(data.contentOriginal),
          contentZh: replaceMarkers(data.contentZh),
          contentEn: replaceMarkers(data.contentEn),
          answerOriginal: replaceMarkers(data.answerOriginal),
          answerZh: replaceMarkers(data.answerZh),
          answerEn: replaceMarkers(data.answerEn),
          source: `${competitionData.nameOriginal} ${checked.manifest.paper.paperTitle} ${data.problemCode}`,
          sourcePages: data.sourcePages,
          ingestionItem: item.id,
          allowWikiEdit: data.allowWikiEdit,
          status: 'published',
        }
        let linkedProblemID = idOf(item.createdProblem)
        const previousItemID = idOf(item.revisionOf)
        if (!linkedProblemID && previousItemID) {
          const previousItem = await req.payload.findByID({ collection: 'ingestion-items' as any, id: previousItemID as string | number, depth: 0, overrideAccess: true, req }) as any
          linkedProblemID = idOf(previousItem.createdProblem)
        }
        const slugProblems = await req.payload.find({ collection: 'problems', where: { slug: { equals: data.slugCandidate } }, limit: 1, depth: 0, overrideAccess: true, req })
        const slugProblem = slugProblems.docs[0]
        if (slugProblem && (!linkedProblemID || String(slugProblem.id) !== String(linkedProblemID))) {
          throw new Error('PROBLEM_SLUG_CONFLICT')
        }
        const problem: any = linkedProblemID
          ? await req.payload.update({ collection: 'problems', id: linkedProblemID as string | number, data: problemData, overrideAccess: true, req })
          : await req.payload.create({ collection: 'problems', data: problemData, overrideAccess: true, req })
        const now = new Date().toISOString()
        const rawItem = (job.rawInput as any)?.item
        const humanDiff = JSON.stringify(rawItem) === JSON.stringify(data) ? null : { before: rawItem, after: data }
        const event = auditEvent('approved-and-published', req.user!.id, { problemId: problem.id, humanDiff })
        await req.payload.update({
          collection: 'ingestion-items' as any,
          id: item.id,
          data: { reviewState: 'reviewed', createdProblem: problem.id, reviewedBy: req.user!.id, reviewedAt: now, humanDiff, auditTrail: [...(item.auditTrail ?? []), event], contentHash: checked.manifest.item.contentHash, validation: checked.manifest.validation },
          overrideAccess: true,
          req,
        })
        await req.payload.update({
          collection: 'ingestion-jobs' as any,
          id: job.id,
          data: { status: 'reviewed', createdProblem: problem.id, validation: checked.manifest.validation, normalizedInput: checked.manifest, auditTrail: [...(job.auditTrail ?? []), event] },
          overrideAccess: true,
          req,
        })
        return { competition, problem, media: [...mediaByAsset.values()] }
      })
      return json({ approved: true, ...result })
    } catch (error) {
      if (error instanceof Error && error.message === 'PROBLEM_SLUG_CONFLICT') {
        return json({ error: 'PROBLEM_SLUG_CONFLICT', message: 'The requested slug belongs to a Problem outside this ingestion revision chain.' }, 409)
      }
      req.payload.logger.error({ err: error }, 'Failed to approve ingestion draft')
      return json({ error: 'APPROVAL_TRANSACTION_FAILED' }, 500)
    }
  }

  const rejectJob: Endpoint['handler'] = async (req) => {
    if (!isAdminUser(req.user)) return json({ error: 'FORBIDDEN', message: 'Administrator session required.' }, 403)
    let reason = ''
    try {
      const body = (await req.json!()) as { reason?: unknown }
      reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    } catch {
      // Required-field response below is intentionally the same for malformed JSON.
    }
    if (!reason) return json({ error: 'REJECT_REASON_REQUIRED' }, 422)
    const id = String(req.routeParams?.id ?? '')
    const jobs = await req.payload.find({ collection: 'ingestion-jobs' as any, where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const job = jobs.docs[0] as any
    if (!job) return json({ error: 'NOT_FOUND' }, 404)
    if (job.status !== 'needs-review') return json({ error: 'INVALID_REVIEW_STATE' }, 409)
    const items = await req.payload.find({ collection: 'ingestion-items' as any, where: { job: { equals: job.id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const item = items.docs[0] as any
    if (!item) return json({ error: 'ITEM_NOT_FOUND' }, 404)
    const event = auditEvent('rejected', req.user!.id, { reason })
    await transaction(req, async () => {
      await req.payload.update({ collection: 'ingestion-items' as any, id: item.id, data: { reviewState: 'rejected', reviewedBy: req.user!.id, reviewedAt: new Date().toISOString(), auditTrail: [...(item.auditTrail ?? []), event] }, overrideAccess: true, req })
      await req.payload.update({ collection: 'ingestion-jobs' as any, id: job.id, data: { status: 'rejected', rejectReason: reason, auditTrail: [...(job.auditTrail ?? []), event] }, overrideAccess: true, req })
    })
    return json({ rejected: true, reason })
  }

  return [
    { path: '/ingestion/jobs', method: 'post', handler: createJob },
    { path: '/ingestion/jobs/:id', method: 'get', handler: readJob },
    { path: '/ingestion/jobs/:id/approve', method: 'post', handler: approveJob },
    { path: '/ingestion/jobs/:id/reject', method: 'post', handler: rejectJob },
  ]
}
