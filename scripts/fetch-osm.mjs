// Downloads OpenStreetMap data for the area in scripts/area.mjs from the
// Overpass API and saves a compact copy to data/<area>.osm.json.
// Map data © OpenStreetMap contributors, ODbL 1.0.
import { writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

// Public Overpass servers are often busy, so try a few, with retries.
const ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]
const { south, west, north, east } = AREA.bbox
const bb = `${south},${west},${north},${east}`

const query = `
[out:json][timeout:120];
(
  way["building"](${bb});
  relation["building"](${bb});
  way["highway"](${bb});
  way["railway"](${bb});
  way["landuse"](${bb});
  relation["landuse"](${bb});
  way["leisure"](${bb});
  relation["leisure"](${bb});
  way["natural"](${bb});
  relation["natural"](${bb});
  way["amenity"](${bb});
  way["waterway"](${bb});
  node["natural"="tree"](${bb});
  node["name"](${bb});
);
out geom;
`

async function download() {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'japango-map-builder/0.1' },
          body: 'data=' + encodeURIComponent(query),
        })
        if (res.ok) return await res.json()
        console.warn(`${url}: ${res.status} ${res.statusText}`)
      } catch (err) {
        console.warn(`${url}: ${err.message}`)
      }
    }
    await new Promise((r) => setTimeout(r, 15000 * (attempt + 1)))
  }
  console.error('Could not download map data from any Overpass server.')
  process.exit(1)
}
const json = await download()

const r = (n) => Math.round(n * 1e7) / 1e7
const pt = (p) => [r(p.lat), r(p.lon)]
const compact = json.elements.map((e) => {
  const out = { type: e.type, id: e.id, tags: e.tags ?? {} }
  if (e.type === 'node') out.pos = pt(e)
  if (e.type === 'way') out.geom = (e.geometry ?? []).map(pt)
  if (e.type === 'relation')
    out.members = (e.members ?? [])
      .filter((m) => m.type === 'way' && m.geometry)
      .map((m) => ({ role: m.role, geom: m.geometry.map(pt) }))
  return out
})

const file = `data/${AREA.id}.osm.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: '© OpenStreetMap contributors (ODbL 1.0)',
    fetchedAt: new Date().toISOString(),
    bbox: AREA.bbox,
    elements: compact,
  }),
)
console.log(`Saved ${compact.length} elements to ${file}`)
