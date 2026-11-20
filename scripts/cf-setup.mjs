// Makes sure the Cloudflare resources the Worker uses exist (the D1
// database and the R2 bucket), and writes the database's id into
// wrangler.toml for this run. Needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID. Safe to run every time.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const DB = 'japango'
const BUCKET = 'japango-tiles'
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const findDb = () => JSON.parse(wrangler('d1', 'list', '--json')).find((d) => d.name === DB)
let db = findDb()
if (!db) {
  console.log(`Creating D1 database ${DB}`)
  wrangler('d1', 'create', DB)
  db = findDb()
}
if (!db) throw new Error('Could not find or create the D1 database')
console.log(`D1 ${DB}: ${db.uuid}`)

try {
  wrangler('r2', 'bucket', 'create', BUCKET)
  console.log(`Created R2 bucket ${BUCKET}`)
} catch (e) {
  if (!/already exists|already own/i.test(String(e.stderr ?? e))) throw e
  console.log(`R2 bucket ${BUCKET} exists`)
}

const toml = await readFile('wrangler.toml', 'utf8')
await writeFile('wrangler.toml', toml.replace(/database_id = "[^"]*"/, `database_id = "${db.uuid}"`))
