// Adds a map area: writes areas/<id>.json, which every fetch and build
// script then reads (pick it with AREA=<id>). Give either a center and a
// size, or the corners of a box to cover:
//
//   bun scripts/add-area.mjs --id shibuya --name 渋谷 --name-en Shibuya \
//     --center 35.6595,139.7005 --size 1500x1200 [--rotation 0] [--spawn lat,lon]
//   bun scripts/add-area.mjs --id akasaka --name 赤坂 --name-en Akasaka \
//     --corners 35.668,139.730,35.680,139.742
//
// --corners is south,west,north,east. With a --rotation, the map is the
// smallest turned rectangle that still covers the whole box. Sizes are in
// meters and rounded up to whole meters. Run it again to change an area.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { latLonToFrame } from './geo.mjs'

const { values: v } = parseArgs({
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    'name-en': { type: 'string' },
    center: { type: 'string' },
    size: { type: 'string' },
    corners: { type: 'string' },
    rotation: { type: 'string' },
    spawn: { type: 'string' },
  },
})
const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}
const nums = (s, n, what) => {
  const out = String(s ?? '')
    .split(/[\s,x×]+/)
    .filter(Boolean)
    .map(Number)
  if (out.length !== n || out.some((x) => !Number.isFinite(x))) fail(`--${what} needs ${n} numbers, got "${s ?? ''}"`)
  return out
}

const id = (v.id ?? '').trim().toLowerCase()
if (!/^[a-z0-9-]+$/.test(id)) fail('--id must be lowercase letters, digits and dashes, like "shibuya"')
const file = `areas/${id}.json`
const old = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {}

const rotationDeg = v.rotation ? Number(v.rotation) : (old.rotationDeg ?? 0)
let center
let width
let height
if (v.corners) {
  const [s, w, n, e] = nums(v.corners, 4, 'corners')
  if (!(n > s && e > w)) fail('--corners is south,west,north,east')
  center = { lat: (s + n) / 2, lon: (w + e) / 2 }
  // Size the turned rectangle to hold all four corners.
  const probe = { center, rotationDeg, width: 0, height: 0 }
  const pts = [
    [s, w],
    [s, e],
    [n, w],
    [n, e],
  ].map(([la, lo]) => latLonToFrame(probe, la, lo))
  width = 2 * Math.max(...pts.map(([x]) => Math.abs(x)))
  height = 2 * Math.max(...pts.map(([, y]) => Math.abs(y)))
} else if (v.center && v.size) {
  const [lat, lon] = nums(v.center, 2, 'center')
  ;[width, height] = nums(v.size, 2, 'size')
  center = { lat, lon }
} else if (old.center && !v.center && !v.size) {
  ;({ center, width, height } = old)
} else fail('Give --center lat,lon with --size WxH, or --corners south,west,north,east')

width = Math.ceil(width)
height = Math.ceil(height)
if (width < 100 || height < 100 || width * height > 25e6) fail(`${width}×${height} m is too small or too big (at most 25 km²)`)

const r6 = (x) => Math.round(x * 1e6) / 1e6
let spawn = old.spawn ?? center
if (v.spawn) {
  const [lat, lon] = nums(v.spawn, 2, 'spawn')
  spawn = { lat, lon }
}
const [sx, sy] = latLonToFrame({ center, rotationDeg, width, height }, spawn.lat, spawn.lon)
if (sx < 0 || sy < 0 || sx > width || sy > height) spawn = center

const area = {
  ...old,
  id,
  name: v.name ?? old.name ?? id,
  nameEn: v['name-en'] ?? old.nameEn ?? id[0].toUpperCase() + id.slice(1),
  center: { lat: r6(center.lat), lon: r6(center.lon) },
  rotationDeg,
  width,
  height,
  cell: old.cell ?? 1,
  spawn: { lat: r6(spawn.lat), lon: r6(spawn.lon) },
}
delete area.bbox
await writeFile(file, JSON.stringify(area, null, 2) + '\n')
console.log(`${existsSync(file) && old.id ? 'Updated' : 'Added'} ${file}: ${area.name} (${area.nameEn}), ${width}×${height} m, ${(width * height / 1e6).toFixed(2)} km²`)
