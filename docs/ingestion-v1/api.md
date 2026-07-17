# SolveField ingestion API v1

Canonical content contract: [`schema.json`](schema.json). The HTTP envelope keeps raw source bytes outside that schema so the server can verify every reported hash and PDF fact.

## Restricted token

Generate a token only in a private operator shell and store only its SHA-256 hex digest in the admin-only `IngestionTokens` collection:

```bash
export INGESTION_TOKEN="$(openssl rand -hex 32)"
printf %s "$INGESTION_TOKEN" | shasum -a 256
```

Create the record with all three v1 scopes: `ingestion:create`, `ingestion:update`, and `ingestion:read-own`. Put the raw value only in the importing service's private secret store. Rotation is create-new → switch client → disable-old; `disabled` and `expiresAt` revoke access immediately. Neither raw tokens nor token hashes belong in frontend code, README examples, application logs, or chat.

## Create or revise a draft

`POST /api/ingestion/jobs`, with `Authorization: Bearer <restricted-token>` and JSON:

```json
{
  "manifest": { "schemaVersion": "solvefield.ingest.v1" },
  "sourceFiles": [
    { "fileId": "src-t1a", "dataBase64": "<raw PDF bytes as base64>" }
  ],
  "assetFiles": [
    {
      "assetKey": "fig-1a",
      "dataBase64": "<raw crop bytes as base64>",
      "mediaType": "image/png",
      "originalFileName": "fig-1a.png"
    }
  ]
}
```

`manifest` must be the complete Draft-07 document; the abbreviated object above only illustrates the envelope. `sourceFiles` must contain every `sourceBundle.files[].fileId`. `assetFiles` may be omitted during extraction, but missing image bytes/hash/R2 keys remain a review warning and block approval.

The server independently recomputes schema validity, PDF byte size/page count/file hash, bundle/content/idempotency hashes, taxonomy, page references, bounding boxes, placement markers, confidence gates, and KaTeX. Client `validation.schemaValid` and `taxonomyValid` are ignored.

- First valid draft: `201`.
- Same idempotency key: `200`, same job/item.
- Same identity + hash: `200`, same version.
- Same identity + different hash: `201`, new review revision with `revisionOf`.
- Same hash + different identity, or text similarity ≥ 0.92: warning only; never auto-merge.
- Any validation error: `422`; no job/item/asset draft is written.

`GET /api/ingestion/jobs/:id` requires `ingestion:read-own` and returns only a job owned by that token.

## Human approval

`POST /api/ingestion/jobs/:id/approve` ignores service-token authority and requires an authenticated Payload admin session. It re-reads private R2 objects, revalidates the current admin-edited item, blocks missing/unverified assets, then performs one D1 transaction that creates or updates Competition, Media, and the published Problem and writes reviewer/time/before-after audit data back to the staging records.

`POST /api/ingestion/jobs/:id/reject` is also admin-session-only and requires `{ "reason": "..." }`. It atomically marks job/item rejected and permanently records the reason, reviewer, and time; resubmission is a new revision rather than an overwrite.

All three staging collections are admin-only and unreviewed asset objects use private `ingestion/` R2 keys. They are never returned by public collection access.

## Verification

```bash
pnpm exec vitest run tests/int/ingestion.int.spec.ts --config ./vitest.config.mts
pnpm exec playwright test ingestion.e2e.spec.ts --config=playwright.config.ts --project=chromium
```

The HTTP suite covers anonymous/tampered `422` with no draft, idempotent retry, full Ted IPhO three-image review-only behavior, service-token publish/user/approval denial, read-own, and admin-only transactional publication.
