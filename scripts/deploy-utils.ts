import { spawnSync } from 'node:child_process'

export const cloudflareEnvironmentArgs = (): string[] => {
  const environment = process.env.CLOUDFLARE_ENV?.trim()
  return environment ? ['--env', environment] : []
}

export const runCommand = (
  command: string,
  args: string[],
  options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {},
): string => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: options.env ?? process.env,
  })

  if (result.stderr) process.stderr.write(result.stderr)
  if (!options.capture && result.stdout) process.stdout.write(result.stdout)
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (options.capture && result.stdout) process.stderr.write(result.stdout)
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
  return result.stdout
}
