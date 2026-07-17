import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type MigrationDefinition = {
  name: string
  file: string
  sentinelSQL: string
  expectedSentinels: number
}

export const migrationDefinitions: MigrationDefinition[] = [
  {
    name: '20250929_111647',
    file: 'src/migrations/20250929_111647.ts',
    sentinelSQL: `SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='media') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='payload_migrations') AS count`,
    expectedSentinels: 3,
  },
  {
    name: '20260717_045649_phase1_collections',
    file: 'src/migrations/20260717_045649_phase1_collections.ts',
    sentinelSQL: `SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='competitions') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='problems') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='problem_ratings') +
      (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='role') AS count`,
    expectedSentinels: 4,
  },
  {
    name: '20260717_074705',
    file: 'src/migrations/20260717_074705.ts',
    sentinelSQL: `SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ingestion_tokens') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ingestion_jobs') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ingestion_items') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ingestion_assets') +
      (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='item_assetKey_idx') +
      (SELECT COUNT(*) FROM pragma_table_info('problems') WHERE name='ingestion_item_id') AS count`,
    expectedSentinels: 6,
  },
]

export const extractUpStatements = (relativeFile: string): string[] => {
  const source = readFileSync(resolve(process.cwd(), relativeFile), 'utf8')
  const upStart = source.indexOf('export async function up')
  const downStart = source.indexOf('export async function down')
  if (upStart === -1 || downStart === -1 || downStart <= upStart) {
    throw new Error(`Could not isolate migration up() in ${relativeFile}`)
  }

  const upSource = source.slice(upStart, downStart)
  const statements = [...upSource.matchAll(/sql`((?:\\[\s\S]|[^`])*)`/g)].map((match) =>
    match[1].replaceAll('\\`', '`').trim(),
  )
  if (statements.length === 0) throw new Error(`No SQL statements found in ${relativeFile}`)
  if (statements.some((statement) => statement.includes('${'))) {
    throw new Error(`Dynamic SQL interpolation is unsupported in native migration ${relativeFile}`)
  }
  return statements
}
