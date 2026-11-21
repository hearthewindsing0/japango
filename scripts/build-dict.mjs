// Builds a small Japanese dictionary for the game's own text: every place
// name, sign, slope and Wikipedia snippet in the map is split into words
// (kuromoji), and each word gets its reading and English meanings from
// JMdict, an example sentence from Tatoeba (through JMdict's examples) and
// its JLPT level. Example sentences are split into words too, so they get
// furigana and tap-for-meaning. Writes public/dict/<area>.json, which the
// game loads to show furigana and word cards, and public/dict/<area>.kanji.json
// with each kanji's meanings and readings (KANJIDIC2) and stroke order
// (KanjiVG), loaded the first time a word card opens.
//
// Usage: node scripts/build-dict.mjs path/to/jmdict-examples-eng.json [path/to/kanjidic2-en.json]
// (plain jmdict-eng-*.json works too, without example sentences)
//
// JMdict and KANJIDIC2 © the Electronic Dictionary Research and Development
// Group, CC BY-SA 4.0 (via scriptin/jmdict-simplified). Example sentences
// from Tatoeba (tatoeba.org), CC BY 2.0 FR. Stroke order from KanjiVG
// © Ulrich Apel, CC BY-SA 3.0. JLPT levels from jamsinclair/open-anki-jlpt-decks
// (MIT), based on Jonathan Waller's JLPT lists (CC BY).
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { AREA } from './area.mjs'

const require = createRequire(import.meta.url)
const kuromoji = require('kuromoji')

const jmdictPath = process.argv[2]
const kanjidicPath = process.argv[3]
if (!jmdictPath) throw new Error('Pass the path to jmdict-examples-eng-*.json (or jmdict-eng-*.json)')

const map = JSON.parse(await readFile(`data/${AREA.id}.map.json`, 'utf8'))
const hasJa = (s) => /[぀-ヿ一-鿿]/.test(s ?? '')
const texts = new Set()
const add = (s) => hasJa(s) && texts.add(s)
for (const p of map.pois ?? []) add(p.name)
for (const s of map.streets ?? []) add(s.name)
for (const s of map.signs ?? []) add(s.t)
for (const s of map.slopes ?? []) add(s.name)
for (const st of map.stations ?? []) {
  add(st.name)
  add(st.line?.ja)
  for (const s of st.signs ?? []) add(s.t)
}
for (const d of map.discoveries ?? []) {
  add(d.ja)
  add(d.jt)
}
// Shop words the game shows next to places (src/game/hours.ts, App.tsx).
for (const p of map.pois ?? []) add(p.cu)
for (const t of ['営業中', '準備中', '本日', '本日定休日', '24時間営業']) add(t)
// What people say at the talking spots (scripts/fetch-conversations.mjs).
const talkFile = `public/talk/${AREA.id}.json`
if (existsSync(talkFile)) {
  const talk = JSON.parse(await readFile(talkFile, 'utf8'))
  for (const c of talk.conversations ?? []) {
    for (const s of c.speakers ?? []) add(s.name)
    for (const l of c.lines ?? []) add(l.ja)
  }
}
console.log(`${texts.size} Japanese texts in the map`)

const tokenizer = await new Promise((res, rej) =>
  kuromoji
    .builder({ dicPath: join(dirname(require.resolve('kuromoji/package.json')), 'dict') + '/' })
    .build((e, t) => (e ? rej(e) : res(t))),
)

console.log('Loading JMdict…')
const jmdict = JSON.parse(await readFile(jmdictPath, 'utf8'))
const byKanji = new Map()
const byKana = new Map()
for (const w of jmdict.words) {
  for (const k of w.kanji) if (!byKanji.has(k.text)) byKanji.set(k.text, w)
  for (const k of w.kana) if (!byKana.has(k.text)) byKana.set(k.text, w)
}
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
const glossesOf = (w) =>
  w.sense
    .slice(0, 3)
    .map((s) => s.gloss.slice(0, 3).map((g) => g.text).join(', '))
    .filter(Boolean)

// JLPT level of each word (5 = N5, the easiest), from the community lists.
const jlpt = new Map()
const JLPT_URL = 'https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src'
for (const n of [5, 4, 3, 2, 1]) {
  try {
    const res = await fetch(`${JLPT_URL}/n${n}.csv`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    for (const line of (await res.text()).split('\n').slice(1)) {
      const [expr, reading] = line.split(',')
      for (const w of [expr, reading]) if (w && !jlpt.has(w)) jlpt.set(w, n)
    }
  } catch (e) {
    console.warn(`JLPT N${n} list not loaded: ${e.message}`)
  }
}
console.log(`JLPT levels for ${jlpt.size} words`)

/** One example sentence for a word: [Japanese, English, Tatoeba id]. */
function exampleOf(w) {
  let best = null
  for (const s of w.sense ?? []) {
    for (const ex of s.examples ?? []) {
      const ja = ex.sentences?.find((x) => x.lang === 'jpn')?.text
      const en = ex.sentences?.find((x) => x.lang === 'eng')?.text
      if (!ja || !en) continue
      const len = [...ja].length
      // Short and simple beats long; the first sense's examples come first.
      if (!best || (len <= 30 && [...best[0]].length > 30)) best = [ja, en, ex.source?.value ?? '']
    }
    if (best && [...best[0]].length <= 30) break
  }
  return best
}

const words = {}
const out = {}
/** Split a text into furigana segments, adding its words to the dictionary. */
function segment(text, withExamples) {
  const segs = []
  for (const t of tokenizer.tokenize(text)) {
    const surface = t.surface_form
    const base = t.basic_form && t.basic_form !== '*' ? t.basic_form : surface
    const reading = t.reading && t.reading !== '*' ? kataToHira(t.reading) : ''
    const isWord = hasJa(surface) && !['記号', '助詞', '助動詞'].includes(t.pos)
    let key = ''
    if (isWord) {
      const w = byKanji.get(base) ?? byKana.get(base) ?? byKanji.get(surface) ?? byKana.get(surface)
      if (w) {
        key = base
        if (!words[key]) {
          const r = w.kana[0]?.text ?? reading
          const entry = { r, g: glossesOf(w) }
          const n = jlpt.get(key) ?? jlpt.get(w.kanji[0]?.text) ?? (w.kanji.length ? undefined : jlpt.get(r))
          if (n) entry.n = n
          if (withExamples) {
            const ex = exampleOf(w)
            if (ex) entry.ex = ex
          }
          words[key] = entry
        }
      }
    }
    // Furigana only where the surface has kanji.
    const furi = /[一-鿿]/.test(surface) ? reading : ''
    const seg = [surface]
    if (key || furi) seg.push(key)
    if (furi) seg.push(furi)
    segs.push(seg)
  }
  return segs
}
for (const text of texts) out[text] = segment(text, true)
// Example sentences get furigana and tappable words too (those words don't
// get examples of their own, to keep the file small).
let exCount = 0
for (const w of Object.values(words)) {
  if (w.ex && !out[w.ex[0]]) {
    out[w.ex[0]] = segment(w.ex[0], false)
    exCount++
  }
}
console.log(`${exCount} example sentences`)

// --- Kanji: meanings and readings (KANJIDIC2), stroke order (KanjiVG) -------
const kanjiFile = `public/dict/${AREA.id}.kanji.json`
const allKanji = new Set()
for (const key of Object.keys(words)) for (const c of key) if (/[一-鿿]/.test(c)) allKanji.add(c)
const kanji = {}
if (kanjidicPath) {
  const kd = JSON.parse(await readFile(kanjidicPath, 'utf8'))
  for (const ch of kd.characters) {
    if (!allKanji.has(ch.literal)) continue
    const groups = ch.readingMeaning?.groups ?? []
    const all = (f) => groups.flatMap(f)
    const entry = {
      m: all((g) => g.meanings.filter((m) => m.lang === 'en').map((m) => m.value)).slice(0, 4),
      on: all((g) => g.readings.filter((r) => r.type === 'ja_on').map((r) => r.value)).slice(0, 3),
      kun: all((g) => g.readings.filter((r) => r.type === 'ja_kun').map((r) => r.value)).slice(0, 3),
      s: ch.misc?.strokeCounts?.[0],
    }
    if (ch.misc?.grade) entry.gr = ch.misc.grade
    kanji[ch.literal] = entry
  }
  console.log(`KANJIDIC2: ${Object.keys(kanji).length} of ${allKanji.size} kanji`)
}
// Stroke order: one SVG per kanji from KanjiVG, keeping only the stroke
// paths in order. Reuse the last build's strokes so nightly runs don't
// refetch them.
const old = existsSync(kanjiFile) ? JSON.parse(await readFile(kanjiFile, 'utf8')).kanji ?? {} : {}
const KANJIVG = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji'
const todo = [...allKanji]
let fetched = 0
async function strokesOf(c) {
  const hex = c.codePointAt(0).toString(16).padStart(5, '0')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${KANJIVG}/${hex}.svg`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const svg = await res.text()
      return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  return null
}
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let c = todo.shift(); c; c = todo.shift()) {
      const p = old[c]?.p ?? (await strokesOf(c))
      if (!old[c]?.p && p) fetched++
      if (!p?.length) continue
      kanji[c] = { ...(kanji[c] ?? old[c] ?? {}), p }
    }
  }),
)
// Without KANJIDIC2 this run, keep last build's meanings.
for (const c of allKanji) if (!kanjidicPath && old[c] && kanji[c]) kanji[c] = { ...old[c], ...kanji[c] }
console.log(`KanjiVG stroke order: ${Object.values(kanji).filter((k) => k.p).length} kanji (${fetched} downloaded)`)

await mkdir('public/dict', { recursive: true })
const file = `public/dict/${AREA.id}.json`
await writeFile(
  file,
  JSON.stringify({
    attribution:
      'JMdict (EDRDG, CC BY-SA 4.0); example sentences from Tatoeba (CC BY 2.0 FR); JLPT levels from open-anki-jlpt-decks (MIT) after Jonathan Waller (CC BY); word splitting by kuromoji (IPADIC)',
    texts: out,
    words,
  }),
)
console.log(`Saved ${Object.keys(out).length} texts and ${Object.keys(words).length} words to ${file}`)
await writeFile(
  kanjiFile,
  JSON.stringify({
    attribution: 'KANJIDIC2 (EDRDG, CC BY-SA 4.0); stroke order from KanjiVG © Ulrich Apel (CC BY-SA 3.0)',
    kanji,
  }),
)
console.log(`Saved ${Object.keys(kanji).length} kanji to ${kanjiFile}`)
