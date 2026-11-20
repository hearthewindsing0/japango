// Downloads 3D bridge models for the area from Project PLATEAU (橋梁モデル):
// the Shuto Expressway viaducts, footbridges (歩道橋) and the like. Saves
// each bridge's surfaces as 3D polygons to data/<area>.bridges.json.
//
// Coordinates stay as lat, lon, height (m above sea level); build-map.mjs
// projects them into the map frame.
// Source: 3D都市モデル（Project PLATEAU）国土交通省.
import { writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

const { south, west, north, east } = AREA.bbox
const CATALOG = 'https://api.plateauview.mlit.go.jp/datacatalog/citygml'
const pad = 0.001

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url)
    if (res.ok) return res.json()
    console.warn(`${url}: ${res.status}; retrying`)
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
  }
  throw new Error(`Request failed: ${url}`)
}

const catalog = await getJson(`${CATALOG}/r:${west},${south},${east},${north}?types=brid`)
const latest = new Map()
for (const city of catalog.cities ?? []) {
  if (!city.files?.brid?.length) continue
  const prev = latest.get(city.cityCode)
  if (!prev || city.year > prev.year) latest.set(city.cityCode, city)
}

const near = (lat, lon) => lat > south - pad && lat < north + pad && lon > west - pad && lon < east + pad

/** Exterior rings of the most detailed geometry in a <brid:Bridge> block. */
function surfaces(block) {
  for (const lod of [3, 2, 1]) {
    const re = new RegExp(`<brid:lod${lod}(\\w+)>([\\s\\S]*?)</brid:lod${lod}\\1>`, 'g')
    const rings = []
    for (const m of block.matchAll(re)) {
      for (const ex of m[2].matchAll(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)) {
        const v = ex[1].trim().split(/\s+/).map(Number)
        if (v.length >= 9) rings.push(v)
      }
    }
    if (rings.length) return { lod, rings }
  }
  return null
}

const bridges = []
const seen = new Set()
for (const city of latest.values()) {
  for (const f of city.files.brid) {
    console.log(`Bridges ${city.cityName} ${city.year} ${f.code} (LOD${f.maxLod}): ${f.url}`)
    const res = await fetch(f.url)
    if (!res.ok || !res.body) {
      console.warn(`  failed: ${res.status}`)
      continue
    }
    const decoder = new TextDecoder()
    let buf = ''
    let kept = 0
    const flush = (final) => {
      for (;;) {
        const start = buf.indexOf('<brid:Bridge ')
        const startAlt = buf.indexOf('<brid:Bridge>')
        const s = [start, startAlt].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), Infinity)
        if (s === Infinity) {
          // Keep a short tail in case a start tag is split across chunks.
          if (buf.length > 64) buf = buf.slice(-64)
          return
        }
        const e = buf.indexOf('</brid:Bridge>', s)
        if (e < 0) {
          buf = buf.slice(s)
          if (final) buf = ''
          return
        }
        const block = buf.slice(s, e)
        buf = buf.slice(e + 14)
        const geo = surfaces(block)
        if (!geo) continue
        const rings = geo.rings.filter((v) => {
          for (let i = 0; i < v.length; i += 3) if (near(v[i], v[i + 1])) return true
          return false
        })
        if (!rings.length) continue
        const key = rings[0].slice(0, 9).join(',')
        if (seen.has(key)) continue
        seen.add(key)
        const name = block.match(/<gml:name[^>]*>([^<]*)<\/gml:name>/)?.[1]?.trim()
        const fn = block.match(/<brid:function[^>]*>([^<]*)<\/brid:function>/)?.[1]?.trim()
        bridges.push({
          name: name || undefined,
          function: fn || undefined,
          lod: geo.lod,
          // lat, lon, height triples, trimmed to ~1 cm.
          rings: rings.map((v) => v.map((n, i) => (i % 3 === 2 ? Math.round(n * 100) / 100 : Math.round(n * 1e7) / 1e7))),
        })
        kept++
      }
    }
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true })
      flush(false)
    }
    flush(true)
    console.log(`  ${kept} bridges near the area`)
  }
}

const file = `data/${AREA.id}.bridges.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: '3D都市モデル（Project PLATEAU）国土交通省',
    fetchedAt: new Date().toISOString(),
    bridges,
  }),
)
const polys = bridges.reduce((n, b) => n + b.rings.length, 0)
console.log(`Saved ${bridges.length} bridges (${polys} surfaces) to ${file}`)
for (const b of bridges.slice(0, 40)) console.log(`  ${b.name ?? '(no name)'} ${b.function ?? ''} LOD${b.lod} ${b.rings.length} surfaces`)
