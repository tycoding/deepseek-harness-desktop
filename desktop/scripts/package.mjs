import { fileURLToPath } from 'node:url'
import { desktopDir, executable, run } from './process.mjs'
import { smokeRuntime } from './smoke-runtime.mjs'
import { stageRuntime } from './stage-runtime.mjs'
import { syncOfficial } from './sync-official.mjs'

const desktop = fileURLToPath(desktopDir)

await syncOfficial()
await stageRuntime()
await smokeRuntime()
console.log('Building desktop installer...')
await run(executable('electron-builder'), ['--config', 'electron-builder.yml'], { cwd: desktop })
console.log('Desktop installer build completed.')
