// Finds places in the area that have a Japanese Wikipedia article (via
// Wikidata) and saves each one's names, coordinates and the opening lines of
// its Japanese and English articles to data/<area>.wiki.json. The game turns
// them into discoveries and a stamp rally.
//
// Wikidata is CC0; Wikipedia text is CC BY-SA 4.0 and is credited in game.
import { writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

const { south, west, north, east } = AREA.bbox
const UA = { 'User-Agent': 'japango-map-builder/0.1 (game map data script)', Accept: 'application/json' }

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: UA })
    if (res.ok) return res.json()
    if (res.status === 404) return null
    console.warn(`${res.status} ${url}; retrying`)
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)))
  }
  return null
}

const query = `
SELECT ?item ?coord ?ja ?en ?jaTitle ?enTitle ?links ?typeEn WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral .
  }
  ?jaArticle schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?jaTitle .
  OPTIONAL { ?enArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
  OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P31 ?type . ?type rdfs:label ?typeEn FILTER(LANG(?typeEn) = "en") }
  ?item wikibase:sitelinks ?links .
}`
const sparql = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`)
if (!sparql) throw new Error('Wikidata query failed')

const byId = new Map()
for (const b of sparql.results.bindings) {
  const id = b.item.value.split('/').pop()
  const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/)
  if (!m) continue
  const prev = byId.get(id)
  if (prev) {
    if (b.typeEn && !prev.types.includes(b.typeEn.value)) prev.types.push(b.typeEn.value)
    continue
  }
  byId.set(id, {
    id,
    lat: Number(m[2]),
    lon: Number(m[1]),
    ja: b.ja?.value ?? b.jaTitle.value,
    en: b.en?.value,
    jaTitle: b.jaTitle.value,
    enTitle: b.enTitle?.value,
    links: Number(b.links.value),
    types: b.typeEn ? [b.typeEn.value] : [],
  })
}
// The best-known places first; keep a sensible number.
const places = [...byId.values()].sort((a, b) => b.links - a.links).slice(0, 400)
console.log(`Wikidata: ${byId.size} places with a Japanese article; keeping ${places.length}`)

/** The first one or two sentences of an article's summary. */
const opening = (text, lang, max = lang === 'ja' ? 140 : 280) => {
  if (!text) return undefined
  const parts = lang === 'ja' ? text.split(/(?<=。)/) : text.split(/(?<=\.)\s+/)
  let out = ''
  for (const p of parts) {
    if (out && out.length + p.length > max) break
    out += (out && lang !== 'ja' ? ' ' : '') + p
  }
  return out.trim() || undefined
}
const summary = async (lang, title) => {
  if (!title) return undefined
  const j = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`)
  return opening(j?.extract, lang)
}

for (const [i, p] of places.entries()) {
  p.jaText = await summary('ja', p.jaTitle)
  p.enText = await summary('en', p.enTitle)
  if (i % 20 === 0) console.log(`  ${i + 1}/${places.length} ${p.ja}`)
  await new Promise((r) => setTimeout(r, 120))
}

const file = `data/${AREA.id}.wiki.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: 'Wikidata (CC0); text from Wikipedia (CC BY-SA 4.0)',
    fetchedAt: new Date().toISOString(),
    places,
  }),
)
console.log(`Saved ${places.length} places to ${file}`)
for (const p of places.slice(0, 25)) console.log(`  ${p.links} ${p.ja} / ${p.en ?? ''} [${p.types.join(', ')}]`)
