// Downloads 3D building models for the area from Project PLATEAU
// (国土交通省, https://www.mlit.go.jp/plateau/) and saves a compact copy to
// data/<area>.plateau.json: each building's footprint, measured height,
// floor count and name where recorded.
//
// PLATEAU publishes CityGML files per map mesh. The data catalog API tells
// us which files cover our bounding box.
// Source: 3D都市モデル（Project PLATEAU）, 国土交通省.
import { writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

const { south, west, north, east } = AREA.bbox
const CATALOG = 'https://api.plateauview.mlit.go.jp/datacatalog/citygml'

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url)
    if (res.ok) return res.json()
    console.warn(`${url}: ${res.status}; retrying`)
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
  }
  throw new Error(`Request failed: ${url}`)
}

// Japanese standard grid ("地域メッシュ") code → its lat/lon box. Codes
// longer than 8 digits are subdivisions; we use their 8-digit parent.
function meshBounds(code) {
  const c = code.slice(0, 8)
  const lat = Number(c.slice(0, 2)) / 1.5 + Number(c[4]) / 12 + Number(c[6]) / 120
  const lon = Number(c.slice(2, 4)) + 100 + Number(c[5]) / 8 + Number(c[7]) / 80
  return { south: lat, north: lat + 1 / 120, west: lon, east: lon + 1 / 80 }
}
const overlaps = (m) => m.south < north && m.north > south && m.west < east && m.east > west

const catalog = await getJson(`${CATALOG}/r:${west},${south},${east},${north}?types=bldg`)
// Use the newest release of each city that covers the area.
const latest = new Map()
for (const city of catalog.cities ?? []) {
  const prev = latest.get(city.cityCode)
  if (!prev || city.year > prev.year) latest.set(city.cityCode, city)
}
const files = []
for (const city of latest.values()) {
  for (const f of city.files?.bldg ?? []) if (overlaps(meshBounds(f.code))) files.push({ ...f, city: city.cityName, year: city.year })
}
console.log(`PLATEAU: ${files.length} building files from ${[...latest.values()].map((c) => `${c.cityName} ${c.year}`).join(', ')}`)

// --- CityGML parsing --------------------------------------------------------
// The files are big but regular, so plain string scanning is enough.
const tagText = (s, tag) => {
  const m = s.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))
  return m ? m[1].trim() : null
}

/** Footprint ring [[lat, lon], ...] from a building's LOD0 or LOD1 geometry. */
function footprint(block) {
  const lod0 = block.match(/<bldg:lod0(?:FootPrint|RoofEdge)>([\s\S]*?)<\/bldg:lod0(?:FootPrint|RoofEdge)>/)
  const source = lod0 ? lod0[1] : block.match(/<bldg:lod1Solid>([\s\S]*?)<\/bldg:lod1Solid>/)?.[1]
  if (!source) return null
  let best = null
  for (const m of source.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)) {
    const v = m[1].trim().split(/\s+/).map(Number)
    const pts = []
    let minH = Infinity
    let maxH = -Infinity
    for (let i = 0; i + 2 < v.length; i += 3) {
      pts.push([v[i], v[i + 1]])
      minH = Math.min(minH, v[i + 2])
      maxH = Math.max(maxH, v[i + 2])
    }
    if (pts.length < 4) continue
    // In a LOD1 solid, the footprint is a flat polygon (the floor or roof);
    // walls are not flat. Pick the biggest flat one.
    if (!lod0 && maxH - minH > 0.01) continue
    let area = 0
    for (let i = 0; i + 1 < pts.length; i++) area += pts[i][1] * pts[i + 1][0] - pts[i + 1][1] * pts[i][0]
    area = Math.abs(area)
    if (!best || area > best.area) best = { pts, area }
  }
  return best?.pts ?? null
}

const r7 = (n) => Math.round(n * 1e7) / 1e7
const buildings = []
for (const f of files) {
  console.log(`Downloading ${f.code} (${f.city}, LOD${f.maxLod})`)
  const res = await fetch(f.url)
  if (!res.ok) {
    console.warn(`  failed: ${res.status}`)
    continue
  }
  const text = await res.text()
  let n = 0
  for (const m of text.matchAll(/<bldg:Building[ >][\s\S]*?<\/bldg:Building>/g)) {
    const block = m[0]
    const ring = footprint(block)
    if (!ring) continue
    // Skip buildings outside the area.
    const inArea = ring.some(([lat, lon]) => lat > south && lat < north && lon > west && lon < east)
    if (!inArea) continue
    const h = Number(tagText(block, 'bldg:measuredHeight'))
    const storeys = Number(tagText(block, 'bldg:storeysAboveGround'))
    const name = tagText(block, 'gml:name')
    const b = { ring: ring.map(([lat, lon]) => [r7(lat), r7(lon)]) }
    if (h > 0) b.h = Math.round(h * 10) / 10
    if (storeys > 0) b.st = storeys
    if (name) b.name = name
    buildings.push(b)
    n++
  }
  console.log(`  ${n} buildings`)
}

const file = `data/${AREA.id}.plateau.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: '3D都市モデル（Project PLATEAU）国土交通省',
    fetchedAt: new Date().toISOString(),
    files: files.map((f) => `${f.city} ${f.year} ${f.code}`),
    buildings,
  }),
)
const withH = buildings.filter((b) => b.h).length
console.log(`Saved ${buildings.length} buildings (${withH} with measured heights) to ${file}`)
