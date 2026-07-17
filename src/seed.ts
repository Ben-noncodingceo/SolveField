import { getPayload } from 'payload'
import config from './payload.config'
import seed from '../content/seed.json'
import type { Problem } from './payload-types'

// Idempotent seed importer. Upserts by slug so it can run repeatedly without
// creating duplicates. Source file content/seed.json is never modified.
// Run: pnpm seed   (= payload run src/seed.ts)
type SeedCompetition = {
  slug: string; nameZh: string; nameEn: string; year: number; level: string
  descriptionZh?: string | null; descriptionEn?: string | null; cover?: string | null
}
type SeedProblem = {
  slug: string; competitionSlug: string; difficulty: number; tags: string[]
  originalLanguage: string
  contentOriginal: string; contentZh?: string | null; contentEn?: string | null
  answerOriginal?: string | null; answerZh?: string | null; answerEn?: string | null
  source: string; officialSolutionUrl?: string | null; allowWikiEdit: boolean; status: string
}

export const runSeed = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const data = seed as { competitions: SeedCompetition[]; problems: SeedProblem[] }

  // --- Competitions (upsert by slug) ---
  const compIdBySlug = new Map<string, number>()
  for (const c of data.competitions) {
    const existing = await payload.find({
      collection: 'competitions', where: { slug: { equals: c.slug } }, limit: 1, depth: 0,
    })
    const doc = { slug: c.slug, nameZh: c.nameZh, nameEn: c.nameEn, year: c.year,
      level: c.level as 'national' | 'regional' | 'world',
      descriptionZh: c.descriptionZh ?? undefined, descriptionEn: c.descriptionEn ?? undefined }
    if (existing.totalDocs > 0) {
      const id = existing.docs[0].id
      await payload.update({ collection: 'competitions', id, data: doc })
      compIdBySlug.set(c.slug, id)
    } else {
      const created = await payload.create({ collection: 'competitions', data: doc })
      compIdBySlug.set(c.slug, created.id)
    }
  }
  payload.logger.info(`Seed: ${data.competitions.length} competitions upserted`)

  // --- Problems (upsert by slug; resolve competitionSlug → id) ---
  let count = 0
  for (const p of data.problems) {
    const competition = compIdBySlug.get(p.competitionSlug)
    if (!competition) { payload.logger.warn(`Skip ${p.slug}: unknown competition ${p.competitionSlug}`); continue }
    const doc = {
      slug: p.slug, competition, difficulty: p.difficulty, tags: p.tags as Problem['tags'],
      originalLanguage: p.originalLanguage,
      contentOriginal: p.contentOriginal, contentZh: p.contentZh ?? undefined, contentEn: p.contentEn ?? undefined,
      answerOriginal: p.answerOriginal ?? undefined, answerZh: p.answerZh ?? undefined, answerEn: p.answerEn ?? undefined,
      source: p.source, officialSolutionUrl: p.officialSolutionUrl ?? undefined,
      allowWikiEdit: p.allowWikiEdit, status: p.status as 'draft' | 'pending' | 'published' | 'archived',
    }
    const existing = await payload.find({
      collection: 'problems', where: { slug: { equals: p.slug } }, limit: 1, depth: 0,
    })
    if (existing.totalDocs > 0) {
      await payload.update({ collection: 'problems', id: existing.docs[0].id, data: doc })
    } else {
      await payload.create({ collection: 'problems', data: doc })
    }
    count++
  }
  payload.logger.info(`Seed: ${count} problems upserted`)
}

// Allow `payload run src/seed.ts`
await runSeed()
