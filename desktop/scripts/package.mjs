import { packageCurrent } from './package-current.mjs'
import { syncOfficial } from './sync-official.mjs'

await syncOfficial()
await packageCurrent()
