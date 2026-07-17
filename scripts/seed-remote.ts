import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import seed from '../content/seed.json'

type SeedCompetition = (typeof seed.competitions)[number]
type SeedProblem = (typeof seed.problems)[number]
type VerifyRow = { kind: 'competition' | 'problem'; slug: string; seed_count: number }

const isLocal = process.argv.includes('--local')
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--local')

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`)
}
if (!isLocal && !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error('Remote seed requires CLOUDFLARE_API_TOKEN')
}

const sqlText = (value: string | null | undefined): string =>
  value == null ? 'NULL' : `'${value.replaceAll("'", "''")}'`

const sqlNumber = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric seed value: ${value}`)
  return String(value)
}

const competitionUpsert = (competition: SeedCompetition): string => `
INSERT INTO competitions (
  slug, name_zh, name_en, year, level, description_zh, description_en
) VALUES (
  ${sqlText(competition.slug)},
  ${sqlText(competition.nameZh)},
  ${sqlText(competition.nameEn)},
  ${sqlNumber(competition.year)},
  ${sqlText(competition.level)},
  ${sqlText(competition.descriptionZh)},
  ${sqlText(competition.descriptionEn)}
)
ON CONFLICT(slug) DO UPDATE SET
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  year = excluded.year,
  level = excluded.level,
  description_zh = excluded.description_zh,
  description_en = excluded.description_en,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`

const problemUpsert = (problem: SeedProblem): string => {
  const competitionID = `(SELECT id FROM competitions WHERE slug = ${sqlText(problem.competitionSlug)})`
  const tags = problem.tags
    .map(
      (tag, index) =>
        `INSERT INTO problems_tags (\`order\`, parent_id, value) VALUES (${index}, (SELECT id FROM problems WHERE slug = ${sqlText(problem.slug)}), ${sqlText(tag)});`,
    )
    .join('\n')

  return `
INSERT INTO problems (
  slug, competition_id, difficulty, original_language,
  content_original, content_zh, content_en,
  answer_original, answer_zh, answer_en,
  source, official_solution_url, allow_wiki_edit, status
) VALUES (
  ${sqlText(problem.slug)}, ${competitionID}, ${sqlNumber(problem.difficulty)}, ${sqlText(problem.originalLanguage)},
  ${sqlText(problem.contentOriginal)}, ${sqlText(problem.contentZh)}, ${sqlText(problem.contentEn)},
  ${sqlText(problem.answerOriginal)}, ${sqlText(problem.answerZh)}, ${sqlText(problem.answerEn)},
  ${sqlText(problem.source)}, ${sqlText(problem.officialSolutionUrl)}, ${problem.allowWikiEdit ? 1 : 0}, ${sqlText(problem.status)}
)
ON CONFLICT(slug) DO UPDATE SET
  competition_id = excluded.competition_id,
  difficulty = excluded.difficulty,
  original_language = excluded.original_language,
  content_original = excluded.content_original,
  content_zh = excluded.content_zh,
  content_en = excluded.content_en,
  answer_original = excluded.answer_original,
  answer_zh = excluded.answer_zh,
  answer_en = excluded.answer_en,
  source = excluded.source,
  official_solution_url = excluded.official_solution_url,
  allow_wiki_edit = excluded.allow_wiki_edit,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
DELETE FROM problems_tags WHERE parent_id = (SELECT id FROM problems WHERE slug = ${sqlText(problem.slug)});
${tags}`
}

const statements = [
  'PRAGMA foreign_keys = ON;',
  ...seed.competitions.map(competitionUpsert),
  ...seed.problems.map(problemUpsert),
]

const targetArgs = isLocal ? ['--local'] : ['--remote']
if (process.env.CLOUDFLARE_ENV) targetArgs.push('--env', process.env.CLOUDFLARE_ENV)

const runWrangler = (args: string[]): string => {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  })

  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    throw new Error(`Wrangler exited with status ${result.status ?? 'unknown'}`)
  }
  return result.stdout
}

const verifySelects = [
  ...seed.competitions.map(
    ({ slug }) =>
      `SELECT 'competition' AS kind, ${sqlText(slug)} AS slug, COUNT(*) AS seed_count FROM competitions WHERE slug = ${sqlText(slug)}`,
  ),
  ...seed.problems.map(
    ({ slug }) =>
      `SELECT 'problem' AS kind, ${sqlText(slug)} AS slug, COUNT(*) AS seed_count FROM problems WHERE slug = ${sqlText(slug)}`,
  ),
]
const verifySQL = verifySelects.join(' UNION ALL ')

const tempDir = mkdtempSync(join(tmpdir(), 'solvefield-seed-'))
const sqlFile = join(tempDir, 'seed.sql')

try {
  writeFileSync(sqlFile, statements.join('\n'), { encoding: 'utf8', mode: 0o600 })
  const writeOutput = runWrangler([
    'd1', 'execute', 'D1', ...targetArgs, '--file', sqlFile,
  ])
  if (writeOutput) process.stdout.write(writeOutput)

  const rawVerification = runWrangler([
    'd1', 'execute', 'D1', ...targetArgs, '--command', verifySQL, '--json',
  ])
  const parsed = JSON.parse(rawVerification) as Array<{ results?: VerifyRow[]; success?: boolean }>
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success === false)) {
    throw new Error('D1 verification returned an unsuccessful result')
  }
  const rows = parsed.flatMap((entry) => entry.results ?? [])
  const expected = new Map<string, number>([
    ...seed.competitions.map(({ slug }) => [`competition:${slug}`, 1] as const),
    ...seed.problems.map(({ slug }) => [`problem:${slug}`, 1] as const),
  ])
  for (const row of rows) expected.delete(`${row.kind}:${row.slug}`)

  const invalid = rows.filter((row) => Number(row.seed_count) !== 1)
  if (invalid.length > 0 || expected.size > 0) {
    throw new Error(
      `Seed verification failed: invalid=${JSON.stringify(invalid)}, missing=${JSON.stringify([...expected.keys()])}`,
    )
  }

  console.log(`Seed verified via D1: ${seed.competitions.length} competitions + ${seed.problems.length} problems`)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
