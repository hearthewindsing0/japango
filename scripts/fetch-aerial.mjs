// Roof colors from aerial photos: downloads GSI's seamless aerial photo
// tiles (地理院タイル シームレス空中写真) over the area, takes the median
// color inside each PLATEAU building outline, and saves only those colors to
// data/<area>.roofs.json (no imagery is kept).
// Source: 国土地理院ウェブサイト（地理院タイル）. Run after fetch-plateau.mjs.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { AREA } from './area.mjs'

const Z = 18
const TILE = 256
const URL = (x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${Z}/${x}/${y}.jpg`
const { south, west, north, east } = AREA.bbox

const px = (lon) => ((lon + 180) / 360) * 2 ** Z * TILE
const py = (lat) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * TILE
}

const tx0 = Math.floor(px(west) / TILE)
const tx1 = Math.floor(px(east) / TILE)
const ty0 = Math.floor(py(north) / TILE)
const ty1 = Math.floor(py(south) / TILE)
const W = (tx1 - tx0 + 1) * TILE
const H = (ty1 - ty0 + 1) * TILE
const mosaic = Buffer.alloc(W * H * 3)
let got = 0
for (let ty = ty0; ty <= ty1; ty++)
  for (let tx = tx0; tx <= tx1; tx++) {
    let buf = null
    for (let attempt = 0; attempt < 3 && !buf; attempt++) {
      const res = await fetch(URL(tx, ty), { headers: { 'User-Agent': 'japango-map-builder/0.1' } })
      if (res.ok) buf = Buffer.from(await res.arrayBuffer())
      else await new Promise((r) => setTimeout(r, 1500))
    }
    if (!buf) continue
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    if (info.width !== TILE || info.height !== TILE) continue
    const ox = (tx - tx0) * TILE
    const oy = (ty - ty0) * TILE
    for (let row = 0; row < TILE; row++) data.copy(mosaic, ((oy + row) * W + ox) * 3, row * TILE * 3, (row + 1) * TILE * 3)
    got++
    await new Promise((r) => setTimeout(r, 60))
  }
console.log(`Aerial: ${got} of ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles at zoom ${Z}`)

const inside = (pts, x, y) => {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
const median = (a) => a.sort((p, q) => p - q)[a.length >> 1]

const plateau = JSON.parse(await readFile(`data/${AREA.id}.plateau.json`, 'utf8'))
const roofs = {}
for (const b of plateau.buildings) {
  // Outline in mosaic pixels.
  const pts = b.ring.map(([lat, lon]) => [px(lon) - tx0 * TILE, py(lat) - ty0 * TILE])
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  if (x0 < 0 || y0 < 0 || x1 >= W || y1 >= H) continue
  // Sample a grid inside the outline, skipping a margin at the edges where
  // walls and neighbors bleed in.
  const step = Math.max(1, Math.min(x1 - x0, y1 - y0) / 8)
  const r = []
  const g = []
  const bl = []
  for (let y = y0 + step; y < y1; y += step)
    for (let x = x0 + step; x < x1; x += step) {
      if (!inside(pts, x, y)) continue
      const i = (Math.floor(y) * W + Math.floor(x)) * 3
      r.push(mosaic[i])
      g.push(mosaic[i + 1])
      bl.push(mosaic[i + 2])
    }
  if (r.length < 4) continue
  const c = [median(r), median(g), median(bl)]
  if (c[0] + c[1] + c[2] === 0) continue
  roofs[`${b.ring[0][0]},${b.ring[0][1]}`] = c
}

const file = `data/${AREA.id}.roofs.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: '出典：国土地理院ウェブサイト（地理院タイル シームレス空中写真）',
    fetchedAt: new Date().toISOString(),
    roofs,
  }),
)
console.log(`Saved ${Object.keys(roofs).length} roof colors to ${file}`)
