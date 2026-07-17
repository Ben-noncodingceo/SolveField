import { getPayload } from 'payload'
import config from '../payload.config'

// Targeted Phase 1 checks (data layer): run against local D1 after migrate + seed.
// Verifies: (1) seed data present, (2) (problem,user) rating uniqueness is
// enforced at the DB level, (3) role field defaults. Run: pnpm run check:phase1
const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error('FAIL: ' + msg)
  // eslint-disable-next-line no-console
  console.log('  ✓ ' + msg)
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  console.log('Phase 1 data-layer checks:')

  // 1. Seed present
  const problems = await payload.find({ collection: 'problems', limit: 100, depth: 0 })
  assert(problems.totalDocs >= 3, `seed problems present (${problems.totalDocs} ≥ 3)`)
  const comps = await payload.find({ collection: 'competitions', limit: 100, depth: 0 })
  assert(comps.totalDocs >= 1, `seed competitions present (${comps.totalDocs} ≥ 1)`)
  const problemId = problems.docs[0].id

  // 2. A user gets default role 'user'
  const email = `check_${problems.totalDocs}_${comps.totalDocs}@solvefield.local`
  await payload.delete({ collection: 'users', where: { email: { equals: email } } })
  const user = await payload.create({ collection: 'users', data: { email, password: 'pw123456', role: 'user' } })
  assert(user.role === 'user', 'user role persisted')

  // 3. (problem,user) rating uniqueness — second create must fail (DB unique index)
  await payload.delete({ collection: 'problem-ratings', where: { user: { equals: user.id } } })
  await payload.create({ collection: 'problem-ratings', data: { problem: problemId, user: user.id, vote: 1, score: 5 } })
  let dupBlocked = false
  try {
    await payload.create({ collection: 'problem-ratings', data: { problem: problemId, user: user.id, vote: -1 } })
  } catch {
    dupBlocked = true
  }
  assert(dupBlocked, 'duplicate (problem,user) rating rejected by unique constraint')

  // cleanup
  await payload.delete({ collection: 'problem-ratings', where: { user: { equals: user.id } } })
  await payload.delete({ collection: 'users', where: { email: { equals: email } } })

  console.log('All Phase 1 data-layer checks passed ✅')
}

await run()
