// Conversations people have at the game's talking spots, written ahead of
// time by Claude and voiced once by Azure AI Speech. Writes
// public/talk/<area>.json (the scripts, with English) and
// public/talk/<area>/<conversation>-<line>.mp3 (one clip per line). The
// game plays them from where the speakers stand; scripts/build-dict.mjs
// splits the lines into words for furigana and word cards.
//
// Needs ANTHROPIC_API_KEY. With AZURE_SPEECH_KEY and AZURE_SPEECH_REGION the
// lines are voiced too; without them the game shows subtitles only.
//
// Usage: node scripts/fetch-conversations.mjs [--redo] [--only=<scene id>]
// Scenes already written are kept; --redo writes them all again.
import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

const MODEL = 'claude-haiku-5-5'
const REDO = process.argv.includes('--redo')
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const AZURE_KEY = process.env.AZURE_SPEECH_KEY
const AZURE_REGION = process.env.AZURE_SPEECH_REGION
if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY')
if (!AZURE_KEY || !AZURE_REGION) console.warn('No AZURE_SPEECH_KEY / AZURE_SPEECH_REGION: writing scripts without voices.')

// Azure's Japanese neural voices, as the writer sees them. Each speaker gets
// one, and the two people in a conversation never share a voice.
const VOICES = {
  'ja-JP-NanamiNeural': 'woman, 20s-30s, warm and friendly',
  'ja-JP-AoiNeural': 'young woman, late teens to early 20s, bright',
  'ja-JP-MayuNeural': 'woman, 20s, lively and casual',
  'ja-JP-ShioriNeural': 'woman, 30s-50s, calm and composed',
  'ja-JP-KeitaNeural': 'man, 20s-30s, relaxed',
  'ja-JP-DaichiNeural': 'man, 30s-40s, steady office worker',
  'ja-JP-NaokiNeural': 'man, 40s-60s, calm and low',
}

// Where people stop and talk. The crossing spot is the pavement outside
// ALMOND, Roppongi's classic meeting point, on the corner of the crossing.
const map = JSON.parse(await readFile(`data/${AREA.id}.map.json`, 'utf8'))
const almond = (map.pois ?? []).find((p) => p.name === 'ALMOND') ?? map.spawn
const near = (x, y, r) =>
  (map.pois ?? [])
    .filter((p) => Math.hypot(p.x - x, p.y - y) < r && p.name)
    .map((p) => `${p.name}${p.nameEn && p.nameEn !== p.name ? ` (${p.nameEn})` : ''}${p.cu ? `, ${p.cu}` : ''}`)
const SPOTS = [
  {
    id: 'crossing',
    name: '六本木交差点',
    nameEn: 'Roppongi Crossing',
    x: Math.round(almond.x * 10) / 10,
    y: Math.round(almond.y * 10) / 10,
    about:
      'Roppongi Crossing (六本木交差点), where Roppongi-dori meets Gaien-Higashi-dori under the Shuto Expressway. The speakers stand on the pavement outside ALMOND (アマンド), the pink café that has been the classic Roppongi meeting point for decades. Roppongi Station exits are on every corner (Hibiya Line and Oedo Line). Tokyo Midtown is a few minutes north along Gaien-Higashi-dori, Roppongi Hills a few minutes west along Roppongi-dori.',
  },
]

// What the conversations are about. `when` is the time of day they fit
// (morning 5-10, lunch 10-14, afternoon 14-17, evening 17-21, night 21-5);
// `weather` is 'any' or 'rain'.
const SCENES = [
  { id: 'late-friend', spot: 'crossing', when: ['evening'], weather: 'any', seed: 'Two friends meet outside ALMOND for dinner. One arrives a few minutes late and apologises; they decide where to eat.' },
  { id: 'lunch-choice', spot: 'crossing', when: ['lunch'], weather: 'any', seed: 'Two coworkers on their lunch break choose between ramen and curry nearby, and worry about the queue.' },
  { id: 'no-umbrella', spot: 'crossing', when: ['evening', 'night'], weather: 'rain', seed: 'It started raining. One person forgot an umbrella; the other suggests buying a cheap plastic one at the convenience store.' },
  { id: 'last-train', spot: 'crossing', when: ['night'], weather: 'any', seed: 'After drinks, two friends debate catching the last train or going to karaoke until the first train.' },
  { id: 'monday-morning', spot: 'crossing', when: ['morning'], weather: 'any', seed: 'Two colleagues bump into each other coming up from the station exit on the way to work and chat about their weekend.' },
  { id: 'directions', spot: 'crossing', when: ['lunch', 'afternoon', 'evening'], weather: 'any', seed: 'A visitor from Osaka politely asks a local office worker the way to Tokyo Midtown; the local explains in polite Japanese.' },
  { id: 'students-cafe', spot: 'crossing', when: ['afternoon'], weather: 'any', seed: 'Two university students waiting for a third friend who is running late, deciding to wait in a café.' },
  { id: 'mother-daughter', spot: 'crossing', when: ['afternoon'], weather: 'any', seed: 'A mother visiting from the countryside and her adult daughter who lives in Tokyo, talking about the season and what to buy at the drugstore.' },
  { id: 'quick-dinner', spot: 'crossing', when: ['evening'], weather: 'any', seed: 'Two tired office workers leaving late want a quick, cheap dinner, maybe standing soba, and talk about the weather.' },
  { id: 'friday-night', spot: 'crossing', when: ['night'], weather: 'any', seed: 'Friday night: two friends plan the rest of the evening, an izakaya or takoyaki to eat on the way, and tease each other.' },
]

const SYSTEM = `You write short conversations that learners of Japanese overhear in a game set in real-life Roppongi, Tokyo. The player walks up to two people talking on the street and listens.

Write the way people really talk in Tokyo today, at an intermediate learner level: mostly JLPT N4-N3 vocabulary and grammar, short spoken sentences, natural casual speech between friends (contractions like じゃん, てる, ちゃう are fine) and polite speech with strangers or seniors. Avoid rare kanji, long monologues and textbook stiffness. Use real places around the spot by name when it fits.

Rules:
- 8 to 12 lines, the two speakers taking turns (a speaker may say two short lines in a row now and then).
- Each line under 40 Japanese characters. Japanese text only in "ja": no romaji, no furigana, no brackets.
- "en" is a natural English translation of that line.
- Names are ordinary Japanese names as they would be said (e.g. 佐藤さん, ユイ). Never real or famous people.
- Everyday, friendly content a teenager could hear: no politics, no slurs, no sexual content, drinking only in passing.
- Give each speaker a voice from the list that fits their age and manner; the two speakers must have different voices.
- "note" is one or two English sentences on a bit of language or culture from the conversation that a learner would find useful.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'note', 'speakers', 'lines'],
  properties: {
    title: { type: 'string', description: 'Short English title' },
    summary: { type: 'string', description: 'One English sentence on what is going on' },
    note: { type: 'string' },
    speakers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'about', 'voice'],
        properties: {
          name: { type: 'string', description: 'How they are called, in Japanese' },
          about: { type: 'string', description: 'A few English words: age, job, manner' },
          voice: { type: 'string', enum: Object.keys(VOICES) },
        },
      },
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'ja', 'en'],
        properties: {
          speaker: { type: 'integer', description: '0 or 1: index into speakers' },
          ja: { type: 'string' },
          en: { type: 'string' },
        },
      },
    },
  },
}

const client = new Anthropic()

async function write(scene) {
  const spot = SPOTS.find((s) => s.id === scene.spot)
  const prompt = `Spot: ${spot.about}
Places within about 120 m: ${near(spot.x, spot.y, 120).slice(0, 40).join('; ')}.
Time of day: ${scene.when.join(' or ')}. Weather: ${scene.weather === 'rain' ? 'raining' : 'whatever is usual for the season, mention it only lightly'}.

Voices:
${Object.entries(VOICES)
  .map(([v, d]) => `- ${v}: ${d}`)
  .join('\n')}

Scene: ${scene.seed}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    if (res.stop_reason === 'refusal') {
      console.warn(`  ${scene.id}: declined (${res.stop_details?.category ?? 'no reason'})`)
      return null
    }
    const text = res.content.find((b) => b.type === 'text')?.text
    try {
      const c = JSON.parse(text ?? '')
      const problem = check(c)
      if (!problem) return c
      console.warn(`  ${scene.id}: ${problem}, trying again`)
    } catch {
      console.warn(`  ${scene.id}: unreadable reply (${res.stop_reason}), trying again`)
    }
  }
  return null
}

/** What is wrong with a written conversation, or null. */
function check(c) {
  if (c.speakers?.length !== 2) return 'needs exactly two speakers'
  if (c.speakers[0].voice === c.speakers[1].voice) return 'both speakers have the same voice'
  if (!(c.lines?.length >= 6 && c.lines.length <= 14)) return `${c.lines?.length} lines`
  for (const l of c.lines) {
    if (l.speaker !== 0 && l.speaker !== 1) return 'line with an unknown speaker'
    if (!/[぀-ヿ一-鿿]/.test(l.ja) || /[a-zA-Z]{3,}/.test(l.ja.replace(/ALMOND|AFURI|Hub/g, ''))) return `odd line "${l.ja}"`
    if (l.ja.length > 50) return `long line "${l.ja}"`
  }
  return null
}

const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

/** One line as an MP3, from Azure AI Speech. */
async function speak(voice, text) {
  // A touch slower than normal speech, for learners.
  const ssml = `<speak version="1.0" xml:lang="ja-JP"><voice name="${voice}"><prosody rate="-8%">${esc(text)}</prosody></voice></speak>`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'japango-builder',
      },
      body: ssml,
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if (res.status === 401 || res.status === 403) throw new Error(`Azure refused the key (${res.status}); check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION`)
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
  }
  throw new Error(`Azure could not voice "${text}"`)
}

const file = `public/talk/${AREA.id}.json`
const dir = `public/talk/${AREA.id}`
await mkdir(dir, { recursive: true })
const old = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { conversations: [] }
const byId = new Map(old.conversations.map((c) => [c.id, c]))

for (const scene of SCENES) {
  if (ONLY && scene.id !== ONLY) continue
  let conv = byId.get(scene.id)
  if (!conv || REDO || ONLY) {
    console.log(`Writing ${scene.id}…`)
    const c = await write(scene)
    if (!c) {
      console.warn(`  ${scene.id}: skipped`)
      continue
    }
    // New words mean new clips.
    for (const l of conv?.lines ?? []) if (l.audio) await rm(`public/${l.audio}`, { force: true })
    conv = {
      id: scene.id,
      spot: scene.spot,
      when: scene.when,
      weather: scene.weather,
      title: c.title,
      summary: c.summary,
      note: c.note,
      speakers: c.speakers,
      lines: c.lines.map((l) => ({ s: l.speaker, ja: l.ja, en: l.en })),
    }
    byId.set(scene.id, conv)
  }
  if (AZURE_KEY && AZURE_REGION) {
    let n = 0
    for (const [i, l] of conv.lines.entries()) {
      const path = `talk/${AREA.id}/${conv.id}-${i}.mp3`
      if (l.audio === path && existsSync(`public/${path}`)) continue
      await writeFile(`public/${path}`, await speak(conv.speakers[l.s].voice, l.ja))
      l.audio = path
      n++
    }
    if (n) console.log(`  ${conv.id}: voiced ${n} lines`)
  }
}

// Keep the scene order, and drop conversations whose scene is gone.
const conversations = SCENES.map((s) => byId.get(s.id)).filter(Boolean)
await writeFile(
  file,
  JSON.stringify(
    {
      attribution: `Conversations written by Claude (${MODEL}, Anthropic)${conversations.some((c) => c.lines.some((l) => l.audio)) ? '; voices by Azure AI Speech' : ''}`,
      spots: SPOTS.map(({ about: _about, ...s }) => s),
      conversations,
    },
    null,
    1,
  ),
)
console.log(`Saved ${conversations.length} conversations to ${file}`)
