// Downloads street-level data for the area from Mapillary
// (https://www.mapillary.com) and saves data/<area>.mapillary.json:
//
// - features: street objects Mapillary's detectors found in its photos
//   (street lights, utility poles, signs, benches, post boxes, ...), each
//   with its position on the map.
// - samples: building-front colors measured from photos. For each photo we
//   average a patch on the left and right side of the view, above the street
//   and below the sky, and record where the camera stood and which way that
//   patch looks. build-map.mjs casts those rays at buildings to color them.
//
// Needs a Mapillary client token in MAPILLARY_TOKEN.
// Imagery and data © Mapillary contributors, CC BY-SA 4.0.
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { AREA } from './area.mjs'

const TOKEN = process.env.MAPILLARY_TOKEN
if (!TOKEN) {
  console.error('Set MAPILLARY_TOKEN to a Mapillary client token (see README).')
  process.exit(1)
}
const API = 'https://graph.mapillary.com'
const MAX_PHOTOS = Number(process.env.MAPILLARY_MAX_PHOTOS ?? 12000)
// Keep one photo per this many meters of street, so photos spread out.
const PHOTO_SPACING_M = 12

async function get(path, params) {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${TOKEN}` } })
    if (res.ok) return res.json()
    const body = await res.text()
    if (res.status === 401 || res.status === 403) {
      console.error(`Mapillary refused the token (${res.status}): ${body}`)
      process.exit(1)
    }
    console.warn(`${path}: ${res.status} ${body.slice(0, 200)}; retrying`)
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
  throw new Error(`Mapillary request failed: ${path}`)
}

// The API caps results per request, so query the area in small tiles of
// about 350 m.
function tiles() {
  const { south, west, north, east } = AREA.bbox
  const n = Math.max(4, Math.ceil(Math.max((north - south) / 0.0031, (east - west) / 0.0037)))
  const out = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const s = south + ((north - south) * i) / n
      const w = west + ((east - west) * j) / n
      out.push([w, s, w + (east - west) / n, s + (north - south) / n].map((v) => v.toFixed(6)).join(','))
    }
  return out
}

// --- Street objects -------------------------------------------------------
const features = []
const seen = new Set()
for (const bbox of tiles()) {
  for (const path of ['/map_features', '/map_features?traffic_signs']) {
    const isSign = path.endsWith('traffic_signs')
    const json = await get('/map_features', {
      bbox,
      fields: 'id,object_value,geometry',
      limit: 2000,
      ...(isSign ? { layers: 'trafficsigns' } : { layers: 'points' }),
    })
    for (const f of json.data ?? []) {
      if (seen.has(f.id) || !f.geometry?.coordinates) continue
      seen.add(f.id)
      const [lon, lat] = f.geometry.coordinates
      features.push({ v: f.object_value, lat, lon, sign: isSign ? 1 : 0 })
    }
  }
}
console.log(`${features.length} street objects`)
const byValue = {}
for (const f of features) byValue[f.v] = (byValue[f.v] ?? 0) + 1
console.log(
  Object.entries(byValue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, n]) => `${n} ${k}`)
    .join('\n'),
)

// --- Photos ---------------------------------------------------------------
const photos = new Map()
for (const bbox of tiles()) {
  const json = await get('/images', {
    bbox,
    fields: 'id,geometry,computed_geometry,compass_angle,computed_compass_angle,captured_at,is_pano,thumb_1024_url',
    limit: 2000,
  })
  for (const p of json.data ?? []) {
    const geom = p.computed_geometry ?? p.geometry
    const angle = p.computed_compass_angle ?? p.compass_angle
    if (!geom || angle == null || p.is_pano || !p.thumb_1024_url) continue
    photos.set(p.id, { lat: geom.coordinates[1], lon: geom.coordinates[0], angle, at: p.captured_at, url: p.thumb_1024_url })
  }
}
console.log(`${photos.size} photos in the area`)

// Prefer recent photos, one per grid cell (and per rough heading).
const cellDeg = PHOTO_SPACING_M / 111000
const picked = new Map()
for (const p of [...photos.values()].sort((a, b) => b.at - a.at)) {
  const key = `${Math.round(p.lat / cellDeg)},${Math.round(p.lon / cellDeg)},${Math.round(p.angle / 90) % 4}`
  if (!picked.has(key)) picked.set(key, p)
}
const chosen = [...picked.values()].slice(0, MAX_PHOTOS)
console.log(`Measuring ${chosen.length} photos`)

// Average color of a patch of the image, as sRGB 0-255.
async function patchColor(img, meta, x0, x1, y0, y1) {
  const left = Math.round(meta.width * x0)
  const top = Math.round(meta.height * y0)
  const width = Math.max(1, Math.round(meta.width * (x1 - x0)))
  const height = Math.max(1, Math.round(meta.height * (y1 - y0)))
  const { channels } = await img.clone().extract({ left, top, width, height }).stats()
  return channels.slice(0, 3).map((c) => Math.round(c.median ?? c.mean))
}

const samples = []
let done = 0
async function measure(p) {
  try {
    const res = await fetch(p.url)
    if (!res.ok) return
    const img = sharp(Buffer.from(await res.arrayBuffer()))
    const meta = await img.metadata()
    // Building fronts sit on the sides of the view, roughly between the
    // horizon and a few floors up. A typical dashcam sees about ±35° here.
    const left = await patchColor(img, meta, 0.03, 0.25, 0.25, 0.5)
    const right = await patchColor(img, meta, 0.75, 0.97, 0.25, 0.5)
    const r = (v) => Math.round(v * 1e6) / 1e6
    samples.push({ lat: r(p.lat), lon: r(p.lon), b: Math.round(p.angle - 35), c: left })
    samples.push({ lat: r(p.lat), lon: r(p.lon), b: Math.round(p.angle + 35), c: right })
  } catch (err) {
    console.warn(`photo failed: ${err.message}`)
  } finally {
    if (++done % 100 === 0) console.log(`${done}/${chosen.length}`)
  }
}
// A pool of downloads at a time.
const queue = [...chosen]
await Promise.all(
  Array.from({ length: 16 }, async () => {
    for (let p; (p = queue.shift()); ) await measure(p)
  }),
)

const file = `data/${AREA.id}.mapillary.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: 'Street-level data © Mapillary contributors (CC BY-SA 4.0)',
    fetchedAt: new Date().toISOString(),
    photosInArea: photos.size,
    features,
    samples,
  }),
)
console.log(`Saved ${features.length} street objects and ${samples.length} color samples to ${file}`)
