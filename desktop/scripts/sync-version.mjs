import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { repoRoot } from './process.mjs'

const root = fileURLToPath(repoRoot)
const officialManifestPath = resolve(root, 'package.json')
const desktopManifestPath = resolve(root, 'desktop', 'package.json')
const desktopLockPath = resolve(root, 'desktop', 'package-lock.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function officialVersion(manifest) {
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error('The official root package.json does not contain a supported release version.')
  }
  return manifest.version
}

export async function syncDesktopVersion({ check = false } = {}) {
  const version = officialVersion(await readJson(officialManifestPath))
  const desktopManifest = await readJson(desktopManifestPath)
  const desktopLock = await readJson(desktopLockPath)
  const matches = desktopManifest.version === version
    && desktopLock.version === version
    && desktopLock.packages?.['']?.version === version

  if (check) {
    if (!matches) throw new Error(`Desktop version must match official version ${version}.`)
    console.log(`Desktop version matches official version ${version}.`)
    return { changed: false, version }
  }
  if (matches) return { changed: false, version }

  desktopManifest.version = version
  desktopLock.version = version
  if (typeof desktopLock.packages?.[''] !== 'object' || desktopLock.packages[''] === null) {
    throw new Error('desktop/package-lock.json is missing its root package record.')
  }
  desktopLock.packages[''].version = version
  await Promise.all([
    writeFile(desktopManifestPath, `${JSON.stringify(desktopManifest, null, 2)}\n`),
    writeFile(desktopLockPath, `${JSON.stringify(desktopLock, null, 2)}\n`),
  ])
  console.log(`Desktop version updated to ${version}.`)
  return { changed: true, version }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await syncDesktopVersion({ check: process.argv.includes('--check') })
}
