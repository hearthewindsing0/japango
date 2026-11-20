// Uploads the built tiles to the R2 bucket the Worker serves them from,
// plus a snapshot of the raw source data under sources/. Tiles go up
// before the manifest, so a player never gets a manifest whose tiles
// aren't there yet. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
import { execFileSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { AREA } from './area.mjs'

const BUCKET = 'japango-tiles'
const put = (key, file) =>
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', 'application/json', '--remote'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })

const dir = `public/tiles/${AREA.id}`
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort((a, b) => (a === 'manifest.json') - (b === 'manifest.json'))
for (const f of files) put(`${AREA.id}/${f}`, `${dir}/${f}`)
console.log(`Uploaded ${files.length} tile files to r2://${BUCKET}/${AREA.id}/`)

const sources = (await readdir('data')).filter((f) => f.startsWith(`${AREA.id}.`) && f.endsWith('.json'))
for (const f of sources) put(`sources/${AREA.id}/${f}`, `data/${f}`)
console.log(`Uploaded ${sources.length} source files to r2://${BUCKET}/sources/${AREA.id}/`)
