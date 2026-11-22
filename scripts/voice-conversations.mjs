// Voices the conversations in public/talk/<area>.json with VOICEVOX
// (voicevox.hiroshiba.jp): one MP3 per line at
// public/talk/<area>/<conversation>-<line>.mp3, a little slower than normal
// speech for learners. Lines already voiced with the same voice are kept.
//
// Needs a running VOICEVOX engine, at VOICEVOX_URL (default
// http://localhost:50021), for example:
//   docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest
// and ffmpeg for the MP3s.
//
// Usage: node scripts/voice-conversations.mjs [--redo]
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'
import { VOICES, credit } from './voices.mjs'

const ENGINE = process.env.VOICEVOX_URL || 'http://localhost:50021'
const REDO = process.argv.includes('--redo')
const SPEED = 0.92

const file = `public/talk/${AREA.id}.json`
if (!existsSync(file)) {
  console.log(`No ${file} yet; nothing to voice.`)
  process.exit(0)
}
const talk = JSON.parse(await readFile(file, 'utf8'))

// The engine's style id for each of our voices.
async function engineJson(path, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${ENGINE}${path}`, init)
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`)
      return res
    } catch (e) {
      if (attempt >= 30) throw e
      await new Promise((r) => setTimeout(r, 2000)) // the engine may still be starting
    }
  }
}
const speakers = await (await engineJson('/speakers')).json()
const styleId = {}
for (const [name, v] of Object.entries(VOICES)) {
  const s = speakers.find((s) => s.name === name)?.styles.find((st) => st.name === v.style)
  if (s) styleId[name] = s.id
  else console.warn(`VOICEVOX has no ${name} (${v.style}); lines in that voice stay silent`)
}

/** WAV to MP3 (mono, 48 kbit/s) with ffmpeg. */
function toMp3(wav) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '24000', '-b:a', '48k', '-f', 'mp3', 'pipe:1'])
    const out = []
    ff.stdout.on('data', (d) => out.push(d))
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}`))))
    ff.stdin.end(wav)
  })
}

async function speak(id, text) {
  const q = await (await engineJson(`/audio_query?speaker=${id}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json()
  q.speedScale = SPEED
  q.prePhonemeLength = 0.05
  q.postPhonemeLength = 0.15
  const wav = Buffer.from(await (await engineJson(`/synthesis?speaker=${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) })).arrayBuffer())
  return toMp3(wav)
}

await mkdir(`public/talk/${AREA.id}`, { recursive: true })
let n = 0
for (const conv of talk.conversations) {
  for (const [i, l] of conv.lines.entries()) {
    const voice = conv.speakers[l.s]?.voice
    const id = styleId[voice]
    if (id == null) continue
    const path = `talk/${AREA.id}/${conv.id}-${i}.mp3`
    if (!REDO && l.audio === path && l.voice === voice && existsSync(`public/${path}`)) continue
    await writeFile(`public/${path}`, await speak(id, l.ja))
    l.audio = path
    l.voice = voice
    n++
  }
}
const used = new Set(talk.conversations.flatMap((c) => c.lines.filter((l) => l.audio).map((l) => l.voice)))
talk.voices = [...used].sort().map(credit)
await writeFile(file, JSON.stringify(talk, null, 1))
console.log(`Voiced ${n} lines; voices: ${talk.voices.join(', ') || 'none'}`)
