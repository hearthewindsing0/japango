// Builds a small Japanese dictionary for the game's own text: every place
// name, sign, slope and Wikipedia snippet in the map is split into words
// (kuromoji), and each word gets its reading and English meanings from
// JMdict. Writes public/dict/<area>.json, which the game loads to show
// furigana and tap-for-meaning.
//
// Usage: node scripts/build-dict.mjs path/to/jmdict-eng.json
// JMdict © the Electronic Dictionary Research and Development Group,
// CC BY-SA 4.0 (via scriptin/jmdict-simplified).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { AREA } from './area.mjs'

const require = createRequire(import.meta.url)
const kuromoji = require('kuromoji')

const jmdictPath = process.argv[2]
if (!jmdictPath) throw new Error('Pass the path to jmdict-eng-*.json')

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

const words = {}
const out = {}
for (const text of texts) {
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
        if (!words[key]) words[key] = { r: w.kana[0]?.text ?? reading, g: glossesOf(w) }
      }
    }
    // Furigana only where the surface has kanji.
    const furi = /[一-鿿]/.test(surface) ? reading : ''
    const seg = [surface]
    if (key || furi) seg.push(key)
    if (furi) seg.push(furi)
    segs.push(seg)
  }
  out[text] = segs
}

await mkdir('public/dict', { recursive: true })
const file = `public/dict/${AREA.id}.json`
await writeFile(
  file,
  JSON.stringify({
    attribution: 'JMdict (EDRDG, CC BY-SA 4.0); word splitting by kuromoji (IPADIC)',
    texts: out,
    words,
  }),
)
console.log(`Saved ${Object.keys(out).length} texts and ${Object.keys(words).length} words to ${file}`)
