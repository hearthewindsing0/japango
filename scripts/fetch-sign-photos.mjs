// Street photos of every shop sign on the map, for working out what each
// shop's real sign looks like (colors, lettering, shape). For each sign in
// public/tiles/<area>/ it finds Mapillary photos taken in front of that wall
// and looking at it, crops the part of the photo around the sign, and saves:
//
//   data/signphotos/<area>/index.json   sign number → name, kind, position, photos
//   data/signphotos/<area>/<n>-<k>.webp the crops (k = 0, 1: best two photos)
//   data/signphotos/<area>/sheet-<s>.webp contact sheets, 10 signs each,
//                                         labelled with the sign number
//
// They go to the server with `bun scripts/data.mjs push signphotos` (the
// Sign photos workflow) and are only reference material: the game never
// loads them. Needs MAPILLARY_TOKEN. Imagery © Mapillary contributors, CC BY-SA 4.0.
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import sharp from 'sharp'
import { AREA } from './area.mjs'
import { frameToLatLon, latLonToFrame } from './geo.mjs'

const TOKEN = process.env.MAPILLARY_TOKEN
if (!TOKEN) {
  console.error('Set MAPILLARY_TOKEN to a Mapillary client token.')
  process.exit(1)
}
const API = 'https://graph.mapillary.com'
const OUT = `data/signphotos/${AREA.id}`
const ONLY = process.env.SIGN_ONLY ? new Set(process.env.SIGN_ONLY.split(',').map(Number)) : null

async function get(path, params) {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${TOKEN}` } })
    if (res.ok) return res.json()
    const body = await res.text()
    if (res.status === 401 || res.status === 403) throw new Error(`Mapillary refused the token (${res.status}): ${body}`)
    console.warn(`${path}: ${res.status} ${body.slice(0, 200)}; retrying`)
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
  throw new Error(`Mapillary request failed: ${path}`)
}

async function pool(jobs, n = 8) {
  const queue = [...jobs]
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let job; (job = queue.shift()); ) await job()
    }),
  )
}

// --- The signs ----------------------------------------------------------------
const dir = `public/tiles/${AREA.id}`
if (!existsSync(dir)) throw new Error(`No ${dir}: run \`bun scripts/data.mjs pull tiles\` first`)
const signs = []
for (const f of readdirSync(dir).filter((f) => /^\d+_\d+\.json$/.test(f))) {
  const tile = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'))
  for (const s of tile.signs ?? []) if (s.t) signs.push({ t: s.t, k: s.k, x: s.x, y: s.y, r: s.r, w: s.w ?? 4 })
}
// A stable order (by position), so sign numbers stay put between runs.
signs.sort((a, b) => a.y - b.y || a.x - b.x)
console.log(`${signs.length} signs`)

// --- The photos ---------------------------------------------------------------
// Query small boxes around groups of signs (the API caps results per box).
const photos = new Map()
const boxes = new Map()
for (const s of signs) {
  const key = `${Math.floor(s.x / 60)},${Math.floor(s.y / 60)}`
  if (!boxes.has(key)) boxes.set(key, s)
}
await pool(
  [...boxes.keys()].map((key) => async () => {
    const [i, j] = key.split(',').map(Number)
    const corners = [
      [i * 60 - 45, j * 60 - 45],
      [i * 60 + 105, j * 60 + 105],
      [i * 60 - 45, j * 60 + 105],
      [i * 60 + 105, j * 60 - 45],
    ].map(([x, y]) => frameToLatLon(AREA, x, y))
    const lats = corners.map((c) => c[0])
    const lons = corners.map((c) => c[1])
    const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) => v.toFixed(6)).join(',')
    const json = await get('/images', {
      bbox,
      fields: 'id,computed_geometry,geometry,computed_compass_angle,compass_angle,captured_at,is_pano,camera_parameters,width,height,thumb_2048_url',
      limit: 2000,
    })
    for (const p of json.data ?? []) {
      const geom = p.computed_geometry ?? p.geometry
      const angle = p.computed_compass_angle ?? p.compass_angle
      if (!geom || angle == null || p.is_pano || !p.thumb_2048_url || photos.has(p.id)) continue
      const [x, y] = latLonToFrame(AREA, geom.coordinates[1], geom.coordinates[0])
      // Horizontal field of view from the focal length (a fraction of the
      // longer side); dashcams without one are about 75°.
      const focal = p.camera_parameters?.[0]
      const landscape = (p.width ?? 4) >= (p.height ?? 3)
      const half = focal > 0.2 && focal < 3 ? Math.atan(0.5 / focal) * (landscape ? 1 : (p.width ?? 3) / (p.height ?? 4)) : (37 * Math.PI) / 180
      photos.set(p.id, { id: p.id, x, y, h: (angle * Math.PI) / 180, at: p.captured_at, half, url: p.thumb_2048_url })
    }
  }),
)
console.log(`${photos.size} photos near signs`)

// --- Store-sign detections ----------------------------------------------------
// Mapillary's detector marked store signs in its photos: each detection is an
// outline in one photo. Cropping around that outline shows the sign itself,
// which beats guessing from where the camera stood and which way it looked.
const storeSigns = new Map()
await pool(
  [...boxes.keys()].map((key) => async () => {
    const [i, j] = key.split(',').map(Number)
    const corners = [
      [i * 60 - 20, j * 60 - 20],
      [i * 60 + 80, j * 60 + 80],
      [i * 60 - 20, j * 60 + 80],
      [i * 60 + 80, j * 60 - 20],
    ].map(([x, y]) => frameToLatLon(AREA, x, y))
    const lats = corners.map((c) => c[0])
    const lons = corners.map((c) => c[1])
    const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) => v.toFixed(6)).join(',')
    const json = await get('/map_features', { bbox, fields: 'id,geometry,object_value', object_values: 'object--sign--store', limit: 2000 })
    for (const f of json.data ?? []) {
      if (f.object_value !== 'object--sign--store' || !f.geometry?.coordinates) continue
      const [x, y] = latLonToFrame(AREA, f.geometry.coordinates[1], f.geometry.coordinates[0])
      storeSigns.set(f.id, { id: f.id, x, y })
    }
  }),
)
console.log(`${storeSigns.size} store-sign detections near signs`)

/** A detection's outline as a box in 0..1 image coordinates. */
function detectionBox(b64) {
  const tile = new VectorTile(new Pbf(Buffer.from(b64, 'base64')))
  for (const name of Object.keys(tile.layers)) {
    const layer = tile.layers[name]
    if (!layer.length) continue
    const f = layer.feature(0)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const ring of f.loadGeometry())
      for (const p of ring) {
        x0 = Math.min(x0, p.x)
        y0 = Math.min(y0, p.y)
        x1 = Math.max(x1, p.x)
        y1 = Math.max(y1, p.y)
      }
    const e = f.extent || layer.extent || 4096
    return [x0 / e, y0 / e, x1 / e, y1 / e]
  }
  return null
}

/** The best detection crops of a sign: the biggest outlines, one per photo. */
async function detections(s) {
  const near = [...storeSigns.values()].map((f) => ({ f, d: Math.hypot(f.x - s.x, f.y - s.y) })).filter((o) => o.d < 10)
  near.sort((a, b) => a.d - b.d)
  const found = []
  for (const { f } of near.slice(0, 3)) {
    const json = await get(`/${f.id}/detections`, { fields: 'image,geometry' }).catch(() => null)
    for (const det of json?.data ?? []) {
      if (!det.geometry || !det.image?.id) continue
      let box
      try {
        box = detectionBox(det.geometry)
      } catch {
        continue
      }
      if (!box) continue
      found.push({ image: det.image.id, box, area: (box[2] - box[0]) * (box[3] - box[1]) })
    }
  }
  found.sort((a, b) => b.area - a.area)
  const out = []
  for (const d of found) {
    if (out.some((o) => o.image === d.image)) continue
    out.push(d)
    if (out.length === 2) break
  }
  return out
}

/** Crop around a detection outline, with room to see the shop front. */
async function cropDetection(d) {
  const meta = await get(`/${d.image}`, { fields: 'thumb_2048_url,captured_at' })
  if (!meta.thumb_2048_url) return null
  const res = await fetch(meta.thumb_2048_url)
  if (!res.ok) return null
  const img = sharp(Buffer.from(await res.arrayBuffer()))
  const { width: W, height: H } = await img.metadata()
  const [x0, y0, x1, y1] = d.box
  const cx = ((x0 + x1) / 2) * W
  const cy = ((y0 + y1) / 2) * H
  const w = Math.max((x1 - x0) * W * 2.2, 200)
  const h = Math.max((y1 - y0) * H * 3.2, w * 0.6)
  const left = Math.max(0, Math.round(cx - w / 2))
  const top = Math.max(0, Math.round(cy - h / 2))
  const width = Math.min(W - left, Math.round(w))
  const height = Math.min(H - top, Math.round(h))
  if (width < 40 || height < 30) return null
  const buf = await img.extract({ left, top, width, height }).resize({ width: 640, height: 480, fit: 'inside' }).webp({ quality: 80 }).toBuffer()
  return { buf, at: new Date(meta.captured_at).toISOString().slice(0, 10) }
}

// Compass heading → frame direction (x right, y down).
const th = ((AREA.rotationDeg ?? 0) * Math.PI) / 180
const dirOf = (h) => {
  const e = Math.sin(h)
  const n = Math.cos(h)
  return [e * Math.cos(th) + n * Math.sin(th), e * Math.sin(th) - n * Math.cos(th)]
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** The best photos of a sign: in front of its wall, looking at it, not too far. */
function candidates(s) {
  const out = []
  const nx = Math.cos(s.r)
  const ny = Math.sin(s.r)
  for (const p of photos.values()) {
    const dx = s.x - p.x
    const dy = s.y - p.y
    const d = Math.hypot(dx, dy)
    if (d < 4 || d > 45) continue
    // Camera on the street side of the wall, not looking along it.
    const front = (-dx * nx - dy * ny) / d
    if (front < 0.3) continue
    const [fx, fy] = dirOf(p.h)
    // Angle of the sign off the camera's axis (positive = right of center).
    const off = wrap(Math.atan2(dy, dx) - Math.atan2(fy, fx))
    if (Math.abs(off) > p.half * 0.8) continue
    const ageYears = (Date.now() - p.at) / 3.15e10
    const score = front * 2 - Math.abs(d - 14) / 12 - Math.abs(off) / p.half - ageYears * 0.15
    out.push({ p, d, off, score })
  }
  out.sort((a, b) => b.score - a.score)
  // Two photos from different spots.
  const picked = []
  for (const c of out) {
    if (picked.some((q) => Math.hypot(q.p.x - c.p.x, q.p.y - c.p.y) < 5)) continue
    picked.push(c)
    if (picked.length === 2) break
  }
  return picked
}

/** Crop the part of the photo around the sign: its width plus a few meters, and storefront height. */
async function crop(c, s) {
  const res = await fetch(c.p.url)
  if (!res.ok) throw new Error(`photo ${c.p.id}: HTTP ${res.status}`)
  const img = sharp(Buffer.from(await res.arrayBuffer())).rotate()
  const meta = await img.metadata()
  const W = meta.width
  const H = meta.height
  const f = W / 2 / Math.tan(c.p.half)
  const cx = W / 2 + Math.tan(c.off) * f
  const span = Math.max(W * 0.28, ((s.w + 6) / c.d) * f)
  const left = Math.max(0, Math.round(cx - span / 2))
  const right = Math.min(W, Math.round(cx + span / 2))
  // Storefronts sit from about the horizon up a few floors.
  const top = Math.round(H * 0.08)
  const bottom = Math.round(H * 0.72)
  if (right - left < 40) return null
  return img
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: 640, height: 480, fit: 'inside' })
    .webp({ quality: 78 })
    .toBuffer()
}

await mkdir(OUT, { recursive: true })
const index = []
let done = 0
await pool(
  signs.map((s, n) => async () => {
    if (ONLY && !ONLY.has(n)) return
    const entry = { n, t: s.t, k: s.k, x: s.x, y: s.y, photos: [] }
    index.push(entry)
    // Detection crops first, then camera-angle crops to make up two.
    for (const d of await detections(s).catch(() => [])) {
      try {
        const got = await cropDetection(d)
        if (!got) continue
        const file = `${n}-${entry.photos.length}.webp`
        await writeFile(`${OUT}/${file}`, got.buf)
        entry.photos.push({ file, id: d.image, at: got.at, det: 1 })
      } catch (e) {
        console.warn(`${n} ${s.t}: ${e.message}`)
      }
    }
    for (const c of candidates(s)) {
      if (entry.photos.length >= 2) break
      try {
        const buf = await crop(c, s)
        if (!buf) continue
        const file = `${n}-${entry.photos.length}.webp`
        await writeFile(`${OUT}/${file}`, buf)
        entry.photos.push({ file, id: c.p.id, at: new Date(c.p.at).toISOString().slice(0, 10), d: Math.round(c.d) })
      } catch (e) {
        console.warn(`${n} ${s.t}: ${e.message}`)
      }
    }
    if (++done % 25 === 0) console.log(`${done}/${signs.length}`)
  }),
)
index.sort((a, b) => a.n - b.n)
console.log(`${index.filter((e) => e.photos.length).length}/${index.length} signs have a photo, ${index.filter((e) => e.photos.some((p) => p.det)).length} from a sign detection`)
await writeFile(`${OUT}/index.json`, JSON.stringify({ area: AREA.id, credit: 'Imagery © Mapillary contributors, CC BY-SA 4.0', signs: index }, null, 1))

// --- Contact sheets -----------------------------------------------------------
// 10 signs a sheet (2 across), each cell its two crops side by side and its number.
const CW = 360
const CH = 270
const PER = 10
for (let s = 0; s * PER < index.length; s++) {
  const group = index.slice(s * PER, (s + 1) * PER)
  const layers = []
  for (const [i, e] of group.entries()) {
    const ox = (i % 2) * (CW * 2 + 16)
    const oy = Math.floor(i / 2) * (CH + 8)
    for (const [k, ph] of e.photos.entries()) {
      const input = await sharp(`${OUT}/${ph.file}`).resize({ width: CW, height: CH, fit: 'contain', background: '#222' }).toBuffer()
      layers.push({ input, left: ox + k * CW, top: oy })
      // A green bar under crops cut around a sign detection.
      if (ph.det) layers.push({ input: Buffer.from(`<svg width="${CW}" height="6"><rect width="${CW}" height="6" fill="#22c55e"/></svg>`), left: ox + k * CW, top: oy + CH - 6 })
    }
    const label = Buffer.from(
      `<svg width="90" height="44"><rect width="90" height="44" rx="8" fill="#ffd400"/><text x="45" y="32" font-size="30" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#000">${e.n}</text></svg>`,
    )
    layers.push({ input: label, left: ox + 4, top: oy + 4 })
  }
  const rows = Math.ceil(group.length / 2)
  await sharp({ create: { width: CW * 4 + 16, height: rows * (CH + 8), channels: 3, background: '#111' } })
    .composite(layers)
    .webp({ quality: 80 })
    .toFile(`${OUT}/sheet-${s}.webp`)
}
console.log('Contact sheets written')
