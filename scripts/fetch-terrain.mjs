// Downloads the ground's shape from PLATEAU's terrain model (地形モデル, a
// triangle mesh of the bare ground) and saves a height grid for the map
// frame to data/<area>.terrain.json.
//
// The grid covers the playable rectangle from scripts/area.mjs, one height
// every CELL meters, in decimeters above the lowest point.
// Source: 3D都市モデル（Project PLATEAU）国土交通省.
import { writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

const CELL = 4
const { south, west, north, east } = AREA.bbox
const { width: FW, height: FH } = AREA
const CATALOG = 'https://api.plateauview.mlit.go.jp/datacatalog/citygml'

// Same projection as build-map.mjs.
const lat0 = AREA.center.lat
const lon0 = AREA.center.lon
const M_PER_DEG_LAT = 110574
const M_PER_DEG_LON = 111320 * Math.cos((lat0 * Math.PI) / 180)
const th = (AREA.rotationDeg * Math.PI) / 180
const proj = (lat, lon) => {
  const e = (lon - lon0) * M_PER_DEG_LON
  const n = (lat - lat0) * M_PER_DEG_LAT
  return [e * Math.cos(th) + n * Math.sin(th) + FW / 2, -(-e * Math.sin(th) + n * Math.cos(th)) + FH / 2]
}

const GW = Math.ceil(FW / CELL) + 1
const GH = Math.ceil(FH / CELL) + 1
const heights = new Float32Array(GW * GH).fill(NaN)

/** Writes the triangle's height at every grid point inside it. */
function rasterize(a, b, c) {
  const minX = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) / CELL))
  const maxX = Math.min(GW - 1, Math.floor(Math.max(a[0], b[0], c[0]) / CELL))
  const minY = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) / CELL))
  const maxY = Math.min(GH - 1, Math.floor(Math.max(a[1], b[1], c[1]) / CELL))
  if (minX > maxX || minY > maxY) return
  const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  if (Math.abs(den) < 1e-9) return
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const x = gx * CELL
      const y = gy * CELL
      const w1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
      const w2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
      const w3 = 1 - w1 - w2
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue
      heights[gy * GW + gx] = w1 * a[2] + w2 * b[2] + w3 * c[2]
    }
  }
}

const catalog = await (await fetch(`${CATALOG}/r:${west},${south},${east},${north}?types=dem`)).json()
const latest = new Map()
for (const city of catalog.cities ?? []) {
  if (!city.files?.dem?.length) continue
  const prev = latest.get(city.cityCode)
  if (!prev || city.year > prev.year) latest.set(city.cityCode, city)
}
const pad = 0.002
let triangles = 0
for (const city of latest.values()) {
  for (const f of city.files.dem) {
    console.log(`Terrain ${city.cityName} ${city.year} ${f.code}: ${f.url}`)
    const res = await fetch(f.url)
    if (!res.ok || !res.body) {
      console.warn(`  failed: ${res.status}`)
      continue
    }
    // These files are large, so scan the text as it streams in. Each
    // triangle's corners are in one <gml:posList> as "lat lon height" ×4.
    const decoder = new TextDecoder()
    let buf = ''
    const re = /<gml:posList[^>]*>([^<]+)<\/gml:posList>/g
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true })
      let last = 0
      re.lastIndex = 0
      let m
      while ((m = re.exec(buf))) {
        last = re.lastIndex
        const v = m[1].trim().split(/\s+/).map(Number)
        if (v.length < 9) continue
        // Quick reject: skip triangles nowhere near the area.
        if (v[0] < south - pad || v[0] > north + pad || v[1] < west - pad || v[1] > east + pad) continue
        const p = [0, 3, 6].map((i) => [...proj(v[i], v[i + 1]), v[i + 2]])
        rasterize(p[0], p[1], p[2])
        triangles++
      }
      buf = buf.slice(last)
      // Keep only a tail that might hold a partial tag.
      if (buf.length > 1e6) buf = buf.slice(buf.lastIndexOf('<gml:posList'))
    }
  }
}
console.log(`${triangles} terrain triangles in the area`)

// Fill any gaps (under bridges or at the edges) from the nearest known heights.
let missing = 0
for (let pass = 0; pass < 50; pass++) {
  missing = 0
  const next = heights.slice()
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x
      if (!Number.isNaN(heights[i])) continue
      let sum = 0
      let n = 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue
        const h = heights[yy * GW + xx]
        if (!Number.isNaN(h)) {
          sum += h
          n++
        }
      }
      if (n) next[i] = sum / n
      else missing++
    }
  heights.set(next)
  if (!missing) break
}

let min = Infinity
let max = -Infinity
for (const h of heights) {
  if (Number.isNaN(h)) continue
  min = Math.min(min, h)
  max = Math.max(max, h)
}
const dm = new Int16Array(heights.length)
for (let i = 0; i < heights.length; i++) dm[i] = Number.isNaN(heights[i]) ? 0 : Math.round((heights[i] - min) * 10)

const file = `data/${AREA.id}.terrain.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: '3D都市モデル（Project PLATEAU）国土交通省',
    fetchedAt: new Date().toISOString(),
    cell: CELL,
    width: GW,
    height: GH,
    base: Math.round(min * 10) / 10,
    data: Buffer.from(dm.buffer).toString('base64'),
  }),
)
console.log(`Saved ${GW}×${GH} terrain grid to ${file}: ${min.toFixed(1)}–${max.toFixed(1)} m above sea level`)
