// Downloads every data source for one map area at the same time, then
// builds the map and cuts it into tiles. Pick the area with AREA=<id>
// (default roppongi); make one with scripts/add-area.mjs.
//
//   AREA=shibuya node scripts/fetch-all.mjs [--only osm,wiki] [--skip mapillary]
//
// Mapillary needs MAPILLARY_TOKEN and is skipped without one. (City sounds
// aren't per area; they come from fetch-sounds.mjs.)
// If a source other than OpenStreetMap fails, the map is still built from
// whatever that source saved last time, and the run exits with an error
// at the end so it shows up as failed.
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { AREA } from './area.mjs'

const { values: v } = parseArgs({ options: { only: { type: 'string' }, skip: { type: 'string' } } })
const list = (s) => new Set((s ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const only = list(v.only)
const skip = list(v.skip)

/** Each source: its script, what it waits for, and when it can run. */
const SOURCES = {
  osm: { script: 'fetch-osm.mjs', required: true },
  plateau: { script: 'fetch-plateau.mjs' },
  terrain: { script: 'fetch-terrain.mjs' },
  bridges: { script: 'fetch-bridges.mjs' },
  wiki: { script: 'fetch-wiki.mjs' },
  // Roof colors are measured over PLATEAU's roof outlines.
  aerial: { script: 'fetch-aerial.mjs', after: ['plateau'] },
  mapillary: { script: 'fetch-mapillary.mjs', needs: 'MAPILLARY_TOKEN' },
}

const wanted = Object.entries(SOURCES).filter(([name, s]) => {
  if (only.size && !only.has(name)) return false
  if (skip.has(name)) return false
  if (s.needs && !process.env[s.needs]) {
    console.log(`· ${name}: skipped (no ${s.needs})`)
    return false
  }
  return true
})

const t0 = Date.now()
const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`.padStart(5)

/** Runs a script with each output line tagged by its source. */
function run(name, script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`scripts/${script}`], { env: { ...process.env, AREA: AREA.id } })
    const tag = (stream, out) => {
      let rest = ''
      stream.on('data', (d) => {
        const lines = (rest + d).split('\n')
        rest = lines.pop()
        for (const l of lines) out.write(`${secs()} [${name}] ${l}\n`)
      })
      stream.on('end', () => rest && out.write(`${secs()} [${name}] ${rest}\n`))
    }
    tag(child.stdout, process.stdout)
    tag(child.stderr, process.stderr)
    child.on('close', (code) => resolve(code === 0))
  })
}

console.log(`Fetching ${wanted.map(([n]) => n).join(', ')} for ${AREA.nameEn} (${AREA.width}×${AREA.height} m)`)
const done = new Map() // name → promise of success
for (const [name, s] of wanted)
  done.set(
    name,
    (async () => {
      for (const dep of s.after ?? []) await done.get(dep)
      const ok = await run(name, s.script)
      console.log(`${secs()} ${ok ? '✓' : '✗'} ${name}`)
      return ok
    })(),
  )
const results = Object.fromEntries(await Promise.all([...done].map(async ([n, p]) => [n, await p])))
const failed = Object.keys(results).filter((n) => !results[n])

if (failed.some((n) => SOURCES[n].required)) {
  console.error(`OpenStreetMap failed, so the map can't be built.`)
  process.exit(1)
}
for (const [name, script] of [
  ['build', 'build-map.mjs'],
  ['tiles', 'build-tiles.mjs'],
])
  if (!(await run(name, script))) {
    console.error(`${name} failed`)
    process.exit(1)
  }

console.log(`${secs()} Done: ${AREA.nameEn} built${failed.length ? `, but ${failed.join(', ')} failed (using older data for those)` : ''}.`)
if (failed.length) process.exit(1)
