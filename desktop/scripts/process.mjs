import { spawn as nodeSpawn } from 'node:child_process'

const spawn = process.platform === 'win32'
  ? (await import('cross-spawn')).default
  : nodeSpawn

export const desktopDir = new URL('..', import.meta.url)
export const repoRoot = new URL('../..', import.meta.url)

export function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

export function run(command, args, options = {}) {
  const piped = options.capture || options.input !== undefined
  const result = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: piped ? 'pipe' : 'inherit',
    windowsHide: true,
  })
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    if (piped) {
      result.stdout.setEncoding('utf8')
      result.stderr.setEncoding('utf8')
      result.stdout.on('data', chunk => { stdout += chunk })
      result.stderr.on('data', chunk => { stderr += chunk })
    }
    if (piped) result.stdin.end(options.input)
    result.once('error', reject)
    result.once('exit', (code, signal) => {
      if (code === 0) {
        resolve({
          stdout: options.trimOutput === false ? stdout : stdout.trim(),
          stderr: options.trimOutput === false ? stderr : stderr.trim(),
        })
        return
      }
      const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${String(code)}`
      const detail = stderr.trim() === '' ? '' : `\n${stderr.trim()}`
      reject(new Error(`${command} ${args.join(' ')} failed with ${cause}${detail}`))
    })
  })
}
