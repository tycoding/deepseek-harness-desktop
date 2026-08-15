import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, shell } from 'electron'

const WEB_URL = /\bdsh web:\s+(http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+)\b/
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g
const START_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 7_000

let mainWindow
let backend
let backendUrl
let stopping = false
let allowQuit = false
let logFile

function writeLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`
  if (logFile !== undefined) appendFileSync(logFile, line)
}

function runtimeRoot() {
  return app.isPackaged
    ? join(process.resourcesPath, 'runtime')
    : join(app.getAppPath(), 'runtime')
}

function backendEntry() {
  return join(runtimeRoot(), 'lib', 'bin.js')
}

function startBackend() {
  const entry = backendEntry()
  if (!existsSync(entry)) {
    return Promise.reject(new Error('Desktop runtime is missing. Run npm run prepare:runtime before starting Electron.'))
  }

  writeLog(`Starting local service from ${entry}`)
  backend = spawn(process.execPath, ['--expose-internals', entry, 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: process.env.DSH_DESKTOP_WORKSPACE || homedir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_DESKTOP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  backend.stdout.setEncoding('utf8')
  backend.stderr.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`The local service did not start within ${String(START_TIMEOUT_MS / 1000)} seconds.`))
    }, START_TIMEOUT_MS)
    const inspect = chunk => {
      const plain = chunk.replace(ANSI, '')
      output += plain
      writeLog(plain.trimEnd())
      const match = WEB_URL.exec(output)
      if (settled || match?.[1] === undefined) return
      settled = true
      clearTimeout(timeout)
      backendUrl = match[1]
      resolve(backendUrl)
    }
    backend.stdout.on('data', inspect)
    backend.stderr.on('data', inspect)
    backend.once('error', error => {
      if (settled) {
        writeLog(`Local service error: ${error.message}`)
        return
      }
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    backend.once('exit', (code, signal) => {
      backend = undefined
      const reason = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${String(code)}`
      writeLog(`Local service stopped with ${reason}`)
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(`The local service stopped during startup (${reason}).`))
      } else if (!stopping) {
        dialog.showErrorBox('DeepSeek Harness stopped', 'The local service stopped unexpectedly. See the desktop log for details.')
        app.quit()
      }
    })
  })
}

function loadingPage() {
  return pathToFileURL(join(app.getAppPath(), 'src', 'loading.html')).href
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#f7f7f5',
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const initialUrl = backendUrl ?? loadingPage()
  mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === initialUrl) return
    if (backendUrl !== undefined && new URL(url).origin === new URL(backendUrl).origin) return
    event.preventDefault()
    if (/^(https?:|mailto:)/.test(url)) void shell.openExternal(url)
  })
  await mainWindow.loadURL(initialUrl)
}

function stopBackend() {
  stopping = true
  if (backend === undefined || backend.exitCode !== null) return Promise.resolve()
  const child = backend
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, STOP_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function launchApplication() {
  await app.whenReady()
  const logDir = join(app.getPath('userData'), 'logs')
  mkdirSync(logDir, { recursive: true })
  logFile = join(logDir, 'desktop.log')

  try {
    await createWindow()
    const url = await startBackend()
    await mainWindow?.loadURL(url)
  } catch (error) {
    writeLog(error instanceof Error ? error.stack ?? error.message : String(error))
    dialog.showErrorBox('DeepSeek Harness could not start', error instanceof Error ? error.message : String(error))
    await stopBackend()
    allowQuit = true
    app.quit()
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('before-quit', event => {
    if (allowQuit || stopping) return
    event.preventDefault()
    void stopBackend().finally(() => {
      allowQuit = true
      app.quit()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (mainWindow === undefined && backendUrl !== undefined) void createWindow()
  })

  void launchApplication()
}
