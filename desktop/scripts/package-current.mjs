import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { desktopDir, executable, run } from './process.mjs'
import { smokeRuntime } from './smoke-runtime.mjs'
import { stageRuntime } from './stage-runtime.mjs'
import { syncDesktopVersion } from './sync-version.mjs'

const desktop = fileURLToPath(desktopDir)

export async function packageCurrent() {
  await syncDesktopVersion({ check: true })
  await stageRuntime()
  await smokeRuntime()
  console.log('Building desktop installer...')
  await run(executable('electron-builder'), ['--config', 'electron-builder.yml', '--mac', 'dir'], { cwd: desktop })
  const target = join(desktop, 'dist', 'current', 'mac-arm64', 'DeepSeek Harness.app')
  console.log(`Desktop app overwritten at ${target}`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await packageCurrent()
}
