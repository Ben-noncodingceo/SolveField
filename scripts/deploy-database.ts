import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  extractUpStatements,
  migrationDefinitions,
  type MigrationDefinition,
} from './native-d1-migrations'
import { cloudflareEnvironmentArgs, runCommand } from './deploy-utils'

type D1Result<Row> = { results?: Row[]; success?: boolean }
type CountRow = { count: number }

const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--')
let isLocal = false
let isCheckOnly = false
let persistTo: string | undefined
for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index]
  if (arg === '--local') isLocal = true
  else if (arg === '--check-only') isCheckOnly = true
  else if (arg === '--persist-to') {
    const value = cliArgs[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--persist-to requires a directory')
    persistTo = value
    index += 1
  } else throw new Error(`Unknown argument: ${arg}`)
}
if (persistTo && !isLocal) throw new Error('--persist-to is supported only with --local')

if (!isLocal && !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error(
    `Remote database ${isCheckOnly ? 'verification' : 'deployment'} requires CLOUDFLARE_API_TOKEN`,
  )
}

const environmentArgs = cloudflareEnvironmentArgs()
const targetArgs = isLocal
  ? ['--local', ...(persistTo ? ['--persist-to', persistTo] : [])]
  : ['--remote', ...environmentArgs]

const runWrangler = (args: string[], capture = false): string =>
  runCommand('pnpm', ['exec', 'wrangler', ...args], { capture })

const query = <Row>(sql: string): Row[] => {
  const output = runWrangler(
    ['d1', 'execute', 'D1', ...targetArgs, '--command', sql, '--json'],
    true,
  )
  const parsed = JSON.parse(output) as Array<D1Result<Row>>
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success === false)) {
    throw new Error('D1 verification returned an unsuccessful result')
  }
  return parsed.flatMap((entry) => entry.results ?? [])
}

const count = (sql: string): number => Number(query<CountRow>(sql)[0]?.count ?? 0)

const hasMigrationTable = (): boolean =>
  count("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='payload_migrations'") === 1

const isApplied = (name: string): boolean =>
  hasMigrationTable() &&
  count(`SELECT COUNT(*) AS count FROM payload_migrations WHERE name = '${name}'`) === 1

const sentinelCount = (migration: MigrationDefinition): number => count(migration.sentinelSQL)
const deploymentBatch = hasMigrationTable()
  ? count('SELECT COALESCE(MAX(batch), 0) + 1 AS count FROM payload_migrations')
  : 1

const verifyApplied = (migration: MigrationDefinition): void => {
  if (!isApplied(migration.name)) {
    throw new Error(`Migration tracking verification failed for ${migration.name}`)
  }
  const actual = sentinelCount(migration)
  if (actual !== migration.expectedSentinels) {
    throw new Error(
      `Schema verification failed for ${migration.name}: expected ${migration.expectedSentinels} sentinels, got ${actual}`,
    )
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'solvefield-migrations-'))

try {
  for (const migration of migrationDefinitions) {
    if (isApplied(migration.name)) {
      verifyApplied(migration)
      console.log(`Migration already applied and verified: ${migration.name}`)
      continue
    }

    const partialSentinels = sentinelCount(migration)
    if (partialSentinels !== 0) {
      throw new Error(
        `Refusing unsafe resume of ${migration.name}: ${partialSentinels}/${migration.expectedSentinels} schema sentinels exist without exactly one tracking row. Restore the D1 database to the pre-migration bookmark before retrying.`,
      )
    }

    if (isCheckOnly) {
      throw new Error(
        `Unapplied migration detected: ${migration.name}. Run pnpm run deploy:database before deploying the Worker.`,
      )
    }

    const statements = extractUpStatements(migration.file)
    const tracking = `INSERT INTO payload_migrations (name, batch, updated_at, created_at) VALUES (
  '${migration.name}', ${deploymentBatch},
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);`
    const sqlFile = join(tempDir, `${migration.name}.sql`)
    writeFileSync(sqlFile, [...statements, tracking].join('\n'), {
      encoding: 'utf8',
      mode: 0o600,
    })

    console.log(`Applying migration with native Wrangler D1: ${migration.name} (${statements.length} statements)`)
    runWrangler(['d1', 'execute', 'D1', ...targetArgs, '--file', sqlFile])
    verifyApplied(migration)
    console.log(`Migration applied and verified: ${migration.name}`)
  }

  if (isCheckOnly) {
    console.log(`Schema check passed: ${migrationDefinitions.length} migration(s) applied and verified`)
  } else {
    runWrangler(['d1', 'execute', 'D1', ...targetArgs, '--command', 'PRAGMA optimize'])
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
