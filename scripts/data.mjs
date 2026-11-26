// Moves the game's generated data between this folder and the server.
//
// Generated data (map tiles, raw source snapshots, the dictionary, the
// conversations and their audio, the people of the area, city sounds, train
// timetables) is not kept in git. It lives in the R2 bucket the Worker
// serves the game from, under the same path the game asks for:
//
//   public/tiles/roppongi/0_0.json  →  r2://japango-tiles/tiles/roppongi/0_0.json  →  /tiles/roppongi/0_0.json
//   data/roppongi.osm.json          →  r2://japango-tiles/data/roppongi.osm.json   →  /data/roppongi.osm.json
//
// The files are grouped into sets (below). Each set has an index in R2,
// index/<set>.json, listing its files with a hash, so a pull only downloads
// what changed and a push only uploads what changed.
//
//   bun scripts/data.mjs pull [set ...]   download from the live site (no sign-in needed)
//   bun scripts/data.mjs push set ...     upload to R2 (needs CLOUDFLARE_API_TOKEN
//                                         and CLOUDFLARE_ACCOUNT_ID, or --local)
//   bun scripts/data.mjs status [set ...] what differs between here and the server
//   bun scripts/data.mjs seed --root DIR  push every set whose index is missing in
//                                         R2, from the files under DIR (used once,
//                                         to move the data that used to be in git)
//
// Sets are named for the area in AREA (default roppongi): `tiles` is
// tiles-roppongi. With no sets, pull and status take all of them.
//   --local       push to wrangler's local R2 (for `bun run cf:dev`)
//   --root DIR    read and write files under DIR instead of this folder
// JAPANGO_DATA_URL picks the site to pull from.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { parseArgs, promisify } from 'node:util'

const run = promisify(execFile)

export const BUCKET = 'japango-tiles'
export const DATA_URL = (process.env.JAPANGO_DATA_URL || 'https://japango.hearthewindsing0.workers.dev').replace(/\/$/, '')

/**
 * Every set of generated data: the paths it covers (a path ending in / is a
 * folder, any other is a file name prefix) and which script writes it.
 */
export const SETS = {
  // fetch-all.mjs (Map data workflow): raw downloads and the built map
  sources: (a) => [`data/${a}.`],
  // build-tiles.mjs (Map data workflow)
  tiles: (a) => [`public/tiles/${a}/`],
  // build-dict.sh (Map data and Conversations workflows)
  dict: (a) => [`public/dict/${a}.`],
  // fetch-conversations.mjs + voice-conversations.mjs (Conversations workflow)
  talk: (a) => [`public/talk/${a}.json`, `public/talk/${a}/`],
  // scripts/life/ (Life workflow)
  life: (a) => [`data/life/${a}/`, `public/life/${a}/`],
  // trains/build-timetables.mjs (Train timetables workflow)
  trains: (a) => [`public/trains/${a}.`],
  // fetch-sounds.mjs (Map data workflow, when asked); shared by every area
  sounds: () => [`public/sounds/`],
  // fetch-sign-photos.mjs (Sign photos workflow): reference photos of shop signs
  signphotos: (a) => [`data/signphotos/${a}/`],
}
const SHARED = new Set(['sounds'])
// Reference material nobody needs to run the game: only pulled when named.
const ON_REQUEST = new Set(['signphotos'])

/** The R2 key (and URL path) for a file in this folder. */
export const keyOf = (path) => (path.startsWith('public/') ? path.slice('public/'.length) : path)

const TYPES = { json: 'application/json', mp3: 'audio/mpeg', webp: 'image/webp', png: 'image/png', txt: 'text/plain' }
const typeOf = (path) => TYPES[path.split('.').pop()] ?? 'application/octet-stream'

const setId = (name, area) => (SHARED.has(name) ? name : `${name}-${area}`)
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 20)

/** Files under root that belong to a set, relative to root. */
function localFiles(root, prefixes) {
  const out = []
  for (const p of prefixes) {
    const dir = p.endsWith('/') ? p.slice(0, -1) : dirname(p)
    if (!existsSync(join(root, dir))) continue
    for (const e of readdirSync(join(root, dir), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith('.')) continue
      const rel = relative(root, join(e.parentPath ?? e.path, e.name)).split(sep).join('/')
      if (rel.startsWith(p)) out.push(rel)
    }
  }
  return [...new Set(out)].sort()
}

async function localIndex(root, prefixes) {
  const files = {}
  for (const f of localFiles(root, prefixes)) {
    const buf = await readFile(join(root, f))
    files[f] = { hash: hash(buf), size: buf.length }
  }
  return files
}

const wrangler = (args, local) => ['wrangler', 'r2', 'object', ...args, local ? '--local' : '--remote']

/** The set's index as R2 has it, or null. */
async function remoteIndex(id, { local, viaSite }) {
  if (viaSite) {
    const res = await fetch(`${DATA_URL}/index/${id}.json?t=${Date.now()}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${DATA_URL}/index/${id}.json: HTTP ${res.status}`)
    const type = res.headers.get('content-type') ?? ''
    // An older Worker answers unknown paths with the game's index.html.
    if (!type.includes('json')) return null
    return res.json()
  }
  try {
    const { stdout } = await run('bunx', wrangler(['get', `${BUCKET}/index/${id}.json`, '--pipe'], local), {
      maxBuffer: 64 << 20,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    return JSON.parse(stdout)
  } catch (e) {
    if (/does not exist|not found|404|10007/i.test(`${e.stderr ?? ''}${e.stdout ?? ''}${e.message}`)) return null
    throw e
  }
}

async function put(key, file, local) {
  for (let attempt = 1; ; attempt++) {
    try {
      await run(
        'bunx',
        wrangler(['put', `${BUCKET}/${key}`, '--file', file, '--content-type', typeOf(file)], local),
        { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
      )
      return
    } catch (e) {
      if (attempt >= 4) throw new Error(`Upload of ${key} failed: ${e.stderr || e.message}`)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}

/** Runs fn over items, a few at a time. */
async function pool(items, n, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

/** Uploads changed files, manifests after the rest, and the index last. */
async function push(name, area, { root, local, allowEmpty }) {
  const id = setId(name, area)
  const files = await localIndex(root, SETS[name](area))
  const count = Object.keys(files).length
  if (!count && !allowEmpty) {
    throw new Error(`${id}: no files here to push (looked in ${SETS[name](area).join(', ')}). Pull or build them first.`)
  }
  const before = (await remoteIndex(id, { local }))?.files ?? {}
  const changed = Object.keys(files).filter((f) => before[f]?.hash !== files[f].hash)
  const last = (f) => /(^|\/)manifest\.json$/.test(f)
  const first = changed.filter((f) => !last(f))
  await pool(first, 8, (f) => put(keyOf(f), join(root, f), local))
  await pool(changed.filter(last), 8, (f) => put(keyOf(f), join(root, f), local))
  const index = { set: id, updated: new Date().toISOString(), files }
  const tmp = join(tmpdir(), `japango-index-${id}-${process.pid}.json`)
  await writeFile(tmp, JSON.stringify(index))
  await put(`index/${id}.json`, tmp, local)
  const gone = Object.keys(before).filter((f) => !files[f]).length
  console.log(`${id}: ${count} files, uploaded ${changed.length}${gone ? `, ${gone} no longer listed` : ''}`)
}

async function pull(name, area, { root }) {
  const id = setId(name, area)
  const index = await remoteIndex(id, { viaSite: true })
  if (!index) {
    console.log(`${id}: not on the server yet`)
    return
  }
  const want = Object.entries(index.files).filter(([f, { hash: h }]) => {
    const p = join(root, f)
    return !existsSync(p) || hash(readFileSync(p)) !== h
  })
  await pool(want, 8, async ([f, { hash: h }]) => {
    const res = await fetch(`${DATA_URL}/${keyOf(f)}?v=${h}`)
    if (!res.ok) throw new Error(`${DATA_URL}/${keyOf(f)}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (hash(buf) !== h) throw new Error(`${f}: got a different file than the index lists`)
    await mkdir(dirname(join(root, f)), { recursive: true })
    await writeFile(join(root, f), buf)
  })
  console.log(`${id}: ${Object.keys(index.files).length} files, downloaded ${want.length}`)
}

async function status(name, area, { root }) {
  const id = setId(name, area)
  const remote = (await remoteIndex(id, { viaSite: true }))?.files ?? {}
  const here = await localIndex(root, SETS[name](area))
  const all = [...new Set([...Object.keys(remote), ...Object.keys(here)])].sort()
  const diff = all.filter((f) => remote[f]?.hash !== here[f]?.hash)
  console.log(`${id}: ${Object.keys(here).length} here, ${Object.keys(remote).length} on the server, ${diff.length} differ`)
  for (const f of diff.slice(0, 20)) console.log(`  ${!here[f] ? 'server only' : !remote[f] ? 'here only  ' : 'changed    '} ${f}`)
  if (diff.length > 20) console.log(`  … and ${diff.length - 20} more`)
}

async function seed(area, { root, local }) {
  for (const name of Object.keys(SETS)) {
    const id = setId(name, area)
    if (!localFiles(root, SETS[name](area)).length) continue
    if (await remoteIndex(id, { local })) {
      console.log(`${id}: already on the server`)
      continue
    }
    await push(name, area, { root, local })
  }
}

if (import.meta.main) {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      local: { type: 'boolean', default: false },
      root: { type: 'string', default: '.' },
      'allow-empty': { type: 'boolean', default: false },
    },
  })
  const [cmd, ...names] = positionals
  const area = process.env.AREA || 'roppongi'
  if (!/^[a-z0-9-]+$/.test(area)) throw new Error(`Bad area id "${area}"`)
  const root = v.root.replace(/\/$/, '') || '.'
  const opts = { root, local: v.local, allowEmpty: v['allow-empty'] }
  const unknown = names.filter((n) => !SETS[n])
  if (unknown.length) throw new Error(`Unknown set ${unknown.join(', ')}. Sets: ${Object.keys(SETS).join(', ')}`)
  const sets = names.length ? names : Object.keys(SETS).filter((n) => !ON_REQUEST.has(n))
  if (cmd === 'pull') for (const n of sets) await pull(n, area, opts)
  else if (cmd === 'status') for (const n of sets) await status(n, area, opts)
  else if (cmd === 'push') {
    if (!names.length) throw new Error('Name the sets to push, like: push tiles dict')
    for (const n of names) await push(n, area, opts)
  } else if (cmd === 'seed') await seed(area, opts)
  else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
    process.exit(cmd ? 1 : 0)
  }
}
