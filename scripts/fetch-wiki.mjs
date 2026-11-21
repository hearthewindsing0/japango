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
/** Intro text of up to 20 articles per request (the action API batches
 *  them, which keeps us well under Wikipedia's rate limits). */
async function intros(lang, titles) {
  const out = new Map()
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20)
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts` +
      `&exintro=1&explaintext=1&exlimit=20&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`
    const j = await get(url)
    const q = j?.query ?? {}
    // Follow the API's title fixes and redirects back to what we asked for.
    const to = new Map()
    for (const m of [...(q.normalized ?? []), ...(q.redirects ?? [])]) to.set(m.from, m.to)
    const text = new Map((q.pages ?? []).map((pg) => [pg.title, pg.extract]))
    for (const t of batch) {
      let k = t
      for (let n = 0; n < 3 && to.has(k); n++) k = to.get(k)
      const o = opening(text.get(k)?.replace(/\s*\n+\s*/g, lang === 'ja' ? '' : ' '), lang)
      if (o) out.set(t, o)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return out
}

const ja = await intros('ja', places.map((p) => p.jaTitle))
const en = await intros('en', places.filter((p) => p.enTitle).map((p) => p.enTitle))
for (const p of places) {
  p.jaText = ja.get(p.jaTitle)
  p.enText = p.enTitle ? en.get(p.enTitle) : undefined
}
console.log(`Intros: ${ja.size} Japanese, ${en.size} English`)

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
