import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'

const WEB_URL = /\bdsh web:\s+(http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+)\b/
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g
const START_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 7_000
const MAX_LOCAL_HTML_BYTES = 10 * 1024 * 1024
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
const MAX_TREE_ENTRIES = 5000

let mainWindow
let backend
let backendUrl
let stopping = false
let allowQuit = false
let logFile
let desktopStyleKey
let terminalCounter = 0
const terminals = new Map()

ipcMain.handle('dsh:read-local-html', async (event, target) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Local HTML request came from an unknown window.')
  if (typeof target !== 'string' || !isAbsolute(target) || !['.html', '.htm'].includes(extname(target).toLowerCase())) {
    throw new Error('Only absolute HTML file paths can be opened.')
  }
  const info = await stat(target)
  if (!info.isFile() || info.size > MAX_LOCAL_HTML_BYTES) throw new Error('The HTML file is missing or exceeds 10 MB.')
  return { path: target, title: basename(target), content: await readFile(target, 'utf8') }
})

async function workspaceRoot(requested) {
  const target = typeof requested === 'string' && requested !== ''
    ? requested
    : process.env.DSH_DESKTOP_WORKSPACE || homedir()
  if (!isAbsolute(target)) throw new Error('The workspace directory must be absolute.')
  const root = await realpath(resolve(target))
  if (!(await stat(root)).isDirectory()) throw new Error('The workspace directory is missing.')
  return root
}

async function safeWorkspacePath(requestedRoot, target) {
  if (typeof target !== 'string' || isAbsolute(target)) throw new Error('Workspace paths must be relative.')
  const root = await workspaceRoot(requestedRoot)
  const resolved = resolve(root, target)
  const canonical = await realpath(resolved).catch(() => resolved)
  const rel = relative(root, canonical)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('The requested path is outside the workspace.')
  return { root, path: canonical }
}

async function collectWorkspaceTree(root, directory = root, depth = 0, entries = { count: 0 }) {
  if (entries.count >= MAX_TREE_ENTRIES || depth > 12) return []
  const children = await readdir(directory, { withFileTypes: true })
  const result = []
  for (const child of children.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (entries.count >= MAX_TREE_ENTRIES) break
    if (child.name === '.git' || child.name === 'node_modules' || child.name === 'dist') continue
    const absolutePath = join(directory, child.name)
    const path = relative(root, absolutePath)
    entries.count += 1
    result.push({ name: child.name, path, kind: child.isDirectory() ? 'directory' : 'file', children: child.isDirectory() ? await collectWorkspaceTree(root, absolutePath, depth + 1, entries) : undefined })
  }
  return result
}

ipcMain.handle('dsh:workspace-tree', async (event, requestedRoot) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Workspace request came from an unknown window.')
  const root = await workspaceRoot(requestedRoot)
  return { root, entries: await collectWorkspaceTree(root) }
})

ipcMain.handle('dsh:read-workspace-file', async (event, requestedRoot, target) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('File request came from an unknown window.')
  const { root, path } = await safeWorkspacePath(requestedRoot, target)
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_PREVIEW_BYTES) throw new Error('This file is missing or exceeds the 2 MB preview limit.')
  const extension = extname(path).toLowerCase()
  const image = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)
  const displayPath = relative(root, path)
  if (image) return { path: displayPath, kind: 'image', mime: extension === '.svg' ? 'image/svg+xml' : `image/${extension.slice(1)}`, content: (await readFile(path)).toString('base64') }
  return { path: displayPath, kind: 'text', content: await readFile(path, 'utf8') }
})

ipcMain.handle('dsh:write-workspace-file', async (event, requestedRoot, target, content) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('File write came from an unknown window.')
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_PREVIEW_BYTES) throw new Error('Editor content exceeds the 2 MB limit.')
  const { root, path } = await safeWorkspacePath(requestedRoot, target)
  const info = await stat(path)
  if (!info.isFile()) throw new Error('Only existing workspace files can be edited.')
  await writeFile(path, content, 'utf8')
  return { path: relative(root, path) }
})

function runGit(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error !== null && error.code !== 1) { reject(new Error(stderr.trim() || error.message)); return }
      resolvePromise({ stdout, stderr })
    })
  })
}

ipcMain.handle('dsh:git-status', async (event, requestedRoot) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Git request came from an unknown window.')
  const cwd = await workspaceRoot(requestedRoot)
  const result = await runGit(['status', '--short', '--branch'], cwd)
  return { cwd, output: result.stdout }
})

ipcMain.handle('dsh:git-diff', async (event, requestedRoot, target) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Git request came from an unknown window.')
  const { root, path } = await safeWorkspacePath(requestedRoot, target)
  const result = await runGit(['--no-pager', 'diff', '--no-ext-diff', '--', relative(root, path)], root)
  return { path: relative(root, path), output: result.stdout || '(no unstaged changes)' }
})

async function loadPty() {
  const require = createRequire(join(runtimeRoot(), 'package.json'))
  return require('node-pty')
}

ipcMain.handle('dsh:terminal-create', async (event, requestedRoot, columns, rows) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Terminal request came from an unknown window.')
  const pty = await loadPty()
  const id = `terminal-${String(++terminalCounter)}`
  const shellPath = process.platform === 'win32' ? 'pwsh.exe' : process.env.SHELL || '/bin/zsh'
  const cwd = await workspaceRoot(requestedRoot)
  const terminal = pty.spawn(shellPath, [], { name: 'xterm-256color', cols: Math.max(20, Number(columns) || 80), rows: Math.max(5, Number(rows) || 24), cwd, env: { ...process.env, TERM: 'xterm-256color' } })
  terminal.onData(data => { if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('dsh:terminal-data', id, data) })
  terminal.onExit(({ exitCode }) => { terminals.delete(id); if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('dsh:terminal-exit', id, exitCode) })
  terminals.set(id, terminal)
  return { id, cwd }
})

ipcMain.on('dsh:terminal-input', (event, id, data) => {
  if (event.sender !== mainWindow?.webContents || typeof id !== 'string' || typeof data !== 'string') return
  terminals.get(id)?.write(data)
})

ipcMain.on('dsh:terminal-resize', (event, id, columns, rows) => {
  if (event.sender !== mainWindow?.webContents || typeof id !== 'string') return
  terminals.get(id)?.resize(Math.max(20, Number(columns) || 80), Math.max(5, Number(rows) || 24))
})

ipcMain.on('dsh:terminal-close', (event, id) => {
  if (event.sender !== mainWindow?.webContents || typeof id !== 'string') return
  terminals.get(id)?.kill()
  terminals.delete(id)
})

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

function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? '#171716' : '#f7f7f5'
}

async function applyDesktopStyles() {
  if (process.platform !== 'darwin' || mainWindow === undefined) return
  if (desktopStyleKey !== undefined) {
    await mainWindow.webContents.removeInsertedCSS(desktopStyleKey)
  }
  const css = await readFile(join(app.getAppPath(), 'customizations', 'macos-shell.css'), 'utf8')
  desktopStyleKey = await mainWindow.webContents.insertCSS(css, { cssOrigin: 'author' })
  const themeScript = await readFile(join(app.getAppPath(), 'customizations', 'system-theme.js'), 'utf8')
  await mainWindow.webContents.executeJavaScript(themeScript)
  await syncDesktopTheme()
}

async function syncDesktopTheme() {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  const dark = nativeTheme.shouldUseDarkColors
  mainWindow.setBackgroundColor(dark ? '#171716' : '#f7f7f5')
  await mainWindow.webContents.executeJavaScript(`globalThis.__dshDesktopSetSystemTheme?.(${String(dark)})`)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: windowBackground(),
    title: '',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 24, y: 14 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      preload: join(app.getAppPath(), 'src', 'preload.cjs'),
    },
  })
  const initialUrl = backendUrl ?? loadingPage()
  mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    desktopStyleKey = undefined
  })
  mainWindow.webContents.on('did-finish-load', () => {
    void applyDesktopStyles().catch(error => {
      writeLog(`Desktop styles could not be applied: ${error instanceof Error ? error.message : String(error)}`)
    })
  })
  mainWindow.setTitle('')
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
  nativeTheme.on('updated', () => {
    void syncDesktopTheme().catch(error => {
      writeLog(`Desktop theme could not be updated: ${error instanceof Error ? error.message : String(error)}`)
    })
  })
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
