import { existsSync, globSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import manifest from '../package.json' with { type: 'json' }
import { desktopDir, executable, repoRoot, run } from './process.mjs'

const root = fileURLToPath(repoRoot)
const desktop = fileURLToPath(desktopDir)
const runtime = resolve(desktop, 'runtime')
const cliEntry = join(runtime, 'lib', 'bin.js')
const webEntry = join(runtime, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')

async function firstSymlink(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await firstSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function materializeRuntimeLinks() {
  const nodeModules = join(runtime, 'node_modules')
  let link = await firstSymlink(nodeModules)
  while (link !== undefined) {
    const relative = link.slice(nodeModules.length + 1).split(sep)
    const binIndex = relative.lastIndexOf('.bin')
    if (binIndex >= 0) {
      await rm(join(nodeModules, ...relative.slice(0, binIndex + 1)), { recursive: true, force: true })
      link = await firstSymlink(nodeModules)
      continue
    }
    const source = await realpath(link)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(link, { recursive: true, force: true })
    await mkdir(dirname(link), { recursive: true })
    await cp(source, link, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    link = await firstSymlink(nodeModules)
  }
}

function packagePath(base, name) {
  return join(base, ...name.split('/'))
}

async function runtimePackageDirs() {
  const nodeModules = join(runtime, 'node_modules')
  const directories = [runtime]
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.pnpm') continue
    const path = join(nodeModules, entry.name)
    if (!entry.name.startsWith('@')) {
      directories.push(path)
      continue
    }
    for (const child of await readdir(path, { withFileTypes: true })) {
      if (child.isDirectory()) directories.push(join(path, child.name))
    }
  }
  return directories
}

async function workspacePackageMap() {
  const manifests = globSync([
    'apps/*/package.json',
    'packages/*/*/package.json',
    'vendor/*/package.json',
    'native/landlock-run/package.json',
    'native/landlock-run/packages/*/package.json',
  ], { cwd: root })
  const packages = new Map()
  for (const relative of manifests) {
    const manifestPath = join(root, relative)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (typeof manifest.name === 'string') packages.set(manifest.name, dirname(manifestPath))
  }
  return packages
}

async function installedPackageMap() {
  const manifests = globSync([
    'node_modules/*/package.json',
    'node_modules/@*/*/package.json',
    'node_modules/.pnpm/*/node_modules/*/package.json',
    'node_modules/.pnpm/*/node_modules/@*/*/package.json',
  ], { cwd: root })
  const packages = new Map()
  for (const relative of manifests) {
    const manifestPath = join(root, relative)
    const installedManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (typeof installedManifest.name === 'string' && !packages.has(installedManifest.name)) {
      packages.set(installedManifest.name, dirname(manifestPath))
    }
  }
  return packages
}

async function restoreWorkspaceClosure() {
  const nodeModules = join(runtime, 'node_modules')
  const workspacePackages = await workspacePackageMap()
  const installedPackages = await installedPackageMap()
  let restored = 0
  while (true) {
    let changed = false
    for (const directory of await runtimePackageDirs()) {
      const manifestPath = join(directory, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      const required = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}).filter(name => manifest.peerDependenciesMeta?.[name]?.optional !== true),
      ])
      for (const name of required) {
        const destination = packagePath(nodeModules, name)
        if (existsSync(destination)) continue
        const source = workspacePackages.get(name) ?? installedPackages.get(name)
        if (source === undefined) continue
        const nestedNodeModules = join(source, 'node_modules')
        await mkdir(dirname(destination), { recursive: true })
        await cp(source, destination, {
          recursive: true,
          dereference: true,
          filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
        })
        restored += 1
        changed = true
      }
    }
    if (!changed) break
  }

  const unresolved = new Set()
  for (const directory of await runtimePackageDirs()) {
    const manifestPath = join(directory, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const required = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(name => manifest.peerDependenciesMeta?.[name]?.optional !== true),
    ]
    for (const name of required) {
      if (!existsSync(packagePath(nodeModules, name))) unresolved.add(name)
    }
  }
  if (unresolved.size > 0) {
    throw new Error(`Desktop runtime dependencies are missing: ${[...unresolved].sort().join(', ')}`)
  }
  if (restored > 0) console.log(`Restored ${String(restored)} workspace runtime dependencies.`)
}

export async function stageRuntime() {
  if (runtime === root || root.startsWith(runtime + sep)) {
    throw new Error(`Refusing to clear unsafe runtime path: ${runtime}`)
  }

  console.log('Installing official project dependencies...')
  await run(executable('pnpm'), ['install', '--frozen-lockfile'], { cwd: root })
  console.log('Building official project...')
  await run(executable('pnpm'), ['run', 'build'], { cwd: root })

  await rm(runtime, { recursive: true, force: true })
  console.log('Preparing desktop runtime...')
  await run(executable('pnpm'), [
    '--filter', '@deepseek-ai/dsh',
    'deploy', '--legacy', '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=true',
    '--config.link-workspace-packages=true',
    runtime,
  ], { cwd: root })
  await materializeRuntimeLinks()
  await restoreWorkspaceClosure()

  console.log('Restoring project development dependencies...')
  await run(executable('pnpm'), ['install', '--frozen-lockfile'], { cwd: root })

  if (!existsSync(cliEntry) || !existsSync(webEntry)) {
    throw new Error('The prepared runtime is missing the command entry or built Web application.')
  }

  console.log('Preparing native terminal support for Electron...')
  await run(executable('electron-rebuild'), [
    '--force',
    '--module-dir', runtime,
    '--version', manifest.devDependencies.electron,
    '--only', 'node-pty',
  ], { cwd: desktop })
  console.log(`Desktop runtime ready: ${runtime}`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await stageRuntime()
}
