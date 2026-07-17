import { setTimeout as delay } from 'node:timers/promises'

import { cloudflareEnvironmentArgs, runCommand } from './deploy-utils'

type WorkerVersion = { id?: string }

const environmentArgs = cloudflareEnvironmentArgs()

const listVersionIDs = (): Set<string> => {
  const raw = runCommand(
    'pnpm',
    ['exec', 'wrangler', 'versions', 'list', '--config', 'wrangler.jsonc', ...environmentArgs, '--json'],
    { capture: true },
  )
  const versions = JSON.parse(raw) as WorkerVersion[]
  if (!Array.isArray(versions)) throw new Error('Wrangler versions list did not return an array')
  return new Set(versions.map(({ id }) => id).filter((id): id is string => Boolean(id)))
}

const versionsBefore = listVersionIDs()

runCommand(
  'pnpm',
  ['exec', 'opennextjs-cloudflare', 'build', ...environmentArgs],
  { env: { ...process.env, SOLVEFIELD_EPHEMERAL_PROXY: '1' } },
)
// Deploy the generated bundle with Wrangler directly. The OpenNext deploy
// wrapper has returned exit 0 without creating a version in the default env.
runCommand('pnpm', [
  'exec', 'wrangler', 'deploy', '--config', 'wrangler.jsonc', ...environmentArgs,
])

let newVersionIDs: string[] = []
for (let attempt = 0; attempt < 3; attempt++) {
  const versionsAfter = listVersionIDs()
  newVersionIDs = [...versionsAfter].filter((id) => !versionsBefore.has(id))
  if (newVersionIDs.length > 0) break
  if (attempt < 2) await delay(1000)
}

if (newVersionIDs.length === 0) {
  throw new Error('Deploy command exited without creating a new Worker version')
}

console.log(`Deploy verified: new Worker version ${newVersionIDs.join(', ')}`)
