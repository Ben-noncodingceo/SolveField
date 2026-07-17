import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Competitions } from './collections/Competitions'
import { Problems } from './collections/Problems'
import { ProblemRatings } from './collections/ProblemRatings'
import { ProblemEdits } from './collections/ProblemEdits'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => realpath(value).endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'
const useEphemeralBuildProxy = process.env.SOLVEFIELD_EPHEMERAL_PROXY === '1'

const createLog =
  (level: string, fn: typeof console.log) => (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      fn(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || 'info',
  trace: createLog('trace', console.debug),
  debug: createLog('debug', console.debug),
  info: createLog('info', console.log),
  warn: createLog('warn', console.warn),
  error: createLog('error', console.error),
  fatal: createLog('fatal', console.error),
  silent: () => {},
} as any // Use PayloadLogger type when it's exported

// Are we executing inside a deployed Cloudflare Worker (vs Node during
// build / CLI / local dev)? Cloudflare sets this UA at runtime. This is the ONLY
// reliable runtime-vs-build discriminator — do NOT key off env vars like
// CLOUDFLARE_API_TOKEN, which are build-time-only and absent in the Worker at
// runtime (that leak caused `No such module "wrangler"` 500s). See ADR-001.
const isWorkerRuntime =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

const cloudflare = isWorkerRuntime
  ? // Deployed Worker runtime: native OpenNext bindings. Never imports `wrangler`.
    await getCloudflareContext({ async: true })
  : // Build / CLI / local dev (Node): local wrangler platform proxy, works offline.
    await getCloudflareContextFromWrangler()

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Competitions, Problems, ProblemRatings, ProblemEdits],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // push:false → rely on committed migrations (mandatory for D1), not dev auto-sync.
  db: sqliteD1Adapter({ binding: cloudflare.env.D1, push: false }),
  logger: isProduction ? cloudflareLogger : undefined,
  // Storage adapters are configured as plugins in Payload 3.x (the template's
  // top-level `storage` key is from a newer API). See docs/ADR-001-cloudflare.md.
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
  ],
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        // Next/OpenNext build starts multiple page-data workers. A shared
        // persistent Miniflare D1 causes SQLITE_BUSY_RECOVERY/readonly races,
        // while builds do not query D1 at all. Build scripts opt into an
        // in-memory proxy; dev and Payload CLI keep normal local persistence.
        persist: useEphemeralBuildProxy ? false : true,
        // Remote bindings only for Payload CLI commands such as migrations.
        // Builds stay local even when a token exists. Production seed deliberately
        // uses native Wrangler D1 SQL instead of this proxy (see ADR-001).
        remoteBindings: isCLI && !!process.env.CLOUDFLARE_API_TOKEN,
      } satisfies GetPlatformProxyOptions),
  )
}
