import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { desktopDir } from './process.mjs'

const WEB_URL = /\bdsh web:\s+(http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+)\b/
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g
const STOP_TIMEOUT_MS = 7_000

async function stopChild(child) {
  if (child === undefined || child.exitCode !== null) return
  await new Promise(resolveExit => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, STOP_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveExit()
    })
    child.kill('SIGTERM')
  })
}

async function waitForStartPage(url) {
  const deadline = Date.now() + 15_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) })
      const body = await response.text()
      if (response.ok && body.includes('window.__DSH_BOOT__')) return
      lastError = new Error(`Desktop runtime returned an invalid start page (${String(response.status)}).`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Desktop runtime did not return a valid start page within 15 seconds.', { cause: lastError })
}

export async function smokeRuntime() {
  const desktop = fileURLToPath(desktopDir)
  const entry = resolve(desktop, 'runtime', 'lib', 'bin.js')
  const smokeHome = await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
  let child
  try {
    child = spawn(electronPath, ['--expose-internals', entry, 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd: homedir(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: smokeHome,
        DSH_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let output = ''
    let resolved = false
    const url = await new Promise((resolveUrl, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Desktop runtime did not report a Web address within 60 seconds.\n${output}`))
      }, 60_000)
      const inspect = chunk => {
        output += chunk.replace(ANSI, '')
        const match = WEB_URL.exec(output)
        if (match?.[1] === undefined || resolved) return
        resolved = true
        clearTimeout(timeout)
        resolveUrl(match[1])
      }
      child.stdout.on('data', inspect)
      child.stderr.on('data', inspect)
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        if (resolved) return
        clearTimeout(timeout)
        reject(new Error(`Desktop runtime exited before startup (${code === null ? signal : String(code)}).\n${output}`))
      })
    })

    await waitForStartPage(url)
    console.log(`Desktop runtime smoke passed at ${url}`)
  } finally {
    await stopChild(child)
    await rm(smokeHome, { recursive: true, force: true })
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await smokeRuntime()
}
