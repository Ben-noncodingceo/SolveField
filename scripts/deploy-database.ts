import { cloudflareEnvironmentArgs, runCommand } from './deploy-utils'

const environmentArgs = cloudflareEnvironmentArgs()
const payloadEnv = {
  ...process.env,
  NODE_ENV: 'production' as const,
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'ignore',
}

runCommand('pnpm', ['exec', 'payload', 'migrate'], { env: payloadEnv })
runCommand('pnpm', [
  'exec',
  'wrangler',
  'd1',
  'execute',
  'D1',
  '--command',
  'PRAGMA optimize',
  '--remote',
  ...environmentArgs,
])
