// The people of the area and their days, written ahead of time by Claude.
// People come in circles: friends, coworkers, a family, neighbours. For each
// circle Claude writes, in three passes,
//   1. the people (who they are, where they live and work, how they talk to
//      a stranger who walks up),
//   2. their weekday: every outing, solo or together, from the time they
//      leave home to the time they're back,
//   3. what they say when they meet (ending with where each of them goes
//      next, which is where the plan sends them) and the scene at the place
//      they went to, for the player who follows them.
// scripts/life/plan.mjs then checks every person's day makes sense, works
// out each walk on the map and writes the files the game reads.
//
// Writes data/life/<area>/circles/<id>.json, one file per circle, so a run
// can add circles without touching the ones already written.
//
// Usage: bun scripts/life/write-life.mjs [--circles=N] [--redo]
// Signs in like fetch-conversations.mjs (workload identity federation, or
// ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { AREA_ID } from '../area.mjs'
import { VOICES } from '../voices.mjs'
import { checkCircle, PLACE_KINDS_SOCIAL } from './plan.mjs'

const MODEL = 'claude-haiku-5-5'
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const CIRCLES = +arg('circles', 1)
const REDO = process.argv.includes('--redo')
const env = process.env
const federated = env.ANTHROPIC_FEDERATION_RULE_ID && env.ANTHROPIC_ORGANIZATION_ID && (env.ANTHROPIC_IDENTITY_TOKEN_FILE || env.ANTHROPIC_IDENTITY_TOKEN)
if (!federated && !env.ANTHROPIC_API_KEY) throw new Error('Set up workload identity federation (see .github/workflows/conversations.yml) or ANTHROPIC_API_KEY')

const { places } = JSON.parse(await readFile(`public/life/${AREA_ID}/places.json`, 'utf8'))
const byId = new Map(places.map((p) => [p.id, p]))
const label = (p) => `${p.id}: ${p.name ?? p.nameEn ?? p.kind}${p.nameEn && p.name && p.nameEn !== p.name ? ` (${p.nameEn})` : ''}${p.cuisine ? `, ${p.cuisine}` : ''}${p.hours ? `, open ${hoursText(p.hours)}` : ''}`
function hoursText(h) {
  const t = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const d = h[0] ?? h.find(Boolean)
  return d ? d.map(([a, b]) => `${t(a)}-${t(b)}`).join(',') : 'closed Mon'
}
const listOf = (kinds) =>
  places
    .filter((p) => kinds.includes(p.kind))
    .map(label)
    .join('\n')

// The place list Claude chooses from, sent once per call and cached.
const PLACE_LIST = `Places in the area (id: name). Use these ids exactly.

Homes (apartment blocks; many people can live in one):
${listOf(['home'])}

Work and study:
${listOf(['office', 'school', 'clinic', 'hotel'])}

Out and about:
${listOf(PLACE_KINDS_SOCIAL)}

Station exits (people arriving by train or leaving the area):
${listOf(['exit'])}

Map edges (the street goes on to the rest of Tokyo; for people who live or work outside the area):
${listOf(['away'])}`

const client = new Anthropic()

async function ask(system, prompt, schema, check, tag) {
  let feedback = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    // Streamed: the SDK won't wait this long for a reply in one piece.
    const res = await client.messages
      .stream({
      model: MODEL,
      max_tokens: 32000,
      system: [
        { type: 'text', text: system },
        { type: 'text', text: PLACE_LIST, cache_control: { type: 'ephemeral' } },
      ],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt + feedback }],
      })
      .finalMessage()
    if (res.stop_reason === 'refusal') {
      console.warn(`  ${tag}: declined`)
      return null
    }
    try {
      const out = JSON.parse(res.content.find((b) => b.type === 'text')?.text ?? '')
      const problems = check(out)
      if (!problems.length) return out
      console.warn(`  ${tag}: ${problems.length} problems, trying again\n    ${problems.slice(0, 8).join('\n    ')}`)
      feedback = `\n\nYour last answer had these problems; fix them:\n- ${problems.slice(0, 20).join('\n- ')}`
    } catch {
      console.warn(`  ${tag}: unreadable reply (${res.stop_reason}), trying again`)
    }
  }
  return null
}

// ---- Pass 1: the people ----

const STYLE = `You write the people of a game set in real-life Roppongi, Tokyo, for learners of Japanese. Every person on the street is someone: they have a name, a life, a day that makes sense, and they talk like real people in Tokyo today. Keep everything friendly enough for a teenager: no politics, no slurs, no sexual content, drinking only in passing. Never real or famous people.`

const hex = { type: 'string', description: 'Colour as #rrggbb' }
const PEOPLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['circle', 'people'],
  properties: {
    circle: { type: 'string', description: 'One English sentence: who this circle is and how they know each other' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'family', 'nameEn', 'age', 'gender', 'occupation', 'personality', 'mood', 'speech', 'appearance', 'look', 'voice', 'home', 'work', 'relations', 'approach'],
        properties: {
          key: { type: 'string', description: 'Short lowercase romaji id, unique in the circle, e.g. "saki"' },
          name: { type: 'string', description: 'Given name in Japanese' },
          family: { type: 'string', description: 'Family name in Japanese' },
          nameEn: { type: 'string', description: 'Full name in romaji, given name first' },
          age: { type: 'integer' },
          gender: { type: 'string', enum: ['female', 'male', 'nonbinary'] },
          occupation: { type: 'string', description: 'English' },
          personality: { type: 'string', description: 'A few English words' },
          mood: { type: 'string', description: 'Their mood today, a few English words' },
          speech: { type: 'string', description: 'How they talk, in English: register, dialect, habits' },
          appearance: { type: 'string', description: 'One English sentence on how they look and dress' },
          look: {
            type: 'object',
            additionalProperties: false,
            required: ['shirt', 'pants', 'skin', 'hair', 'bag', 'backpack', 'longHair', 'height'],
            properties: { shirt: hex, pants: hex, skin: hex, hair: hex, bag: hex, backpack: { type: 'boolean' }, longHair: { type: 'boolean' }, height: { type: 'number', description: '0.9 (short) to 1.08 (tall)' } },
          },
          voice: { type: 'string', enum: Object.keys(VOICES) },
          home: { type: 'string', description: 'Place id of where they live: a home, or a map edge or station exit if they live outside the area' },
          work: { type: 'string', description: 'Place id where they work or study, or "" if they do not' },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'is'],
              properties: { key: { type: 'string' }, is: { type: 'string', description: 'English, e.g. "best friend", "coworker", "younger sister"' } },
            },
          },
          approach: {
            type: 'object',
            additionalProperties: false,
            required: ['openness', 'register', 'topics', 'knows', 'avoids', 'lines'],
            properties: {
              openness: { type: 'string', enum: ['chatty', 'polite-brief', 'busy', 'shy'] },
              register: { type: 'string', enum: ['casual', 'polite', 'keigo'], description: 'How they talk to a stranger' },
              topics: { type: 'array', items: { type: 'string' }, description: 'English: what they will happily talk about' },
              knows: { type: 'array', items: { type: 'string' }, description: 'Place ids they know well and might recommend' },
              avoids: { type: 'string', description: 'English' },
              lines: {
                type: 'object',
                additionalProperties: false,
                required: ['greet', 'recommend', 'directions', 'topic', 'bye'],
                properties: Object.fromEntries(
                  ['greet', 'recommend', 'directions', 'topic', 'bye'].map((k) => [
                    k,
                    {
                      type: 'array',
                      items: { type: 'object', additionalProperties: false, required: ['ja', 'en'], properties: { ja: { type: 'string' }, en: { type: 'string' } } },
                    },
                  ]),
                ),
              },
            },
          },
        },
      },
    },
  },
}

// The voices' given names, which characters mustn't take.
const VOICE_NAMES = ['ひまり', 'つむぎ', 'そら', 'イタコ', '武宏', '朱司', '龍星', '宗麟']

function checkPeople(out) {
  const p = []
  const keys = new Set(out.people.map((x) => x.key))
  if (out.people.length < 4) p.push('a circle needs at least 4 people')
  if (keys.size !== out.people.length) p.push('two people share a key')
  for (const x of out.people) {
    for (const c of Object.values(x.look)) if (typeof c === 'string' && !/^#[0-9a-f]{6}$/i.test(c)) p.push(`${x.key}: colour "${c}" must be #rrggbb`)
    if (!/^[a-z][a-z0-9-]*$/.test(x.key)) p.push(`${x.key}: key must be lowercase romaji`)
    const home = byId.get(x.home)
    if (!home || !['home', 'away', 'exit'].includes(home.kind)) p.push(`${x.key}: home "${x.home}" is not a home, map edge or station exit`)
    if (x.work && !byId.has(x.work)) p.push(`${x.key}: work "${x.work}" is not a place id`)
    for (const k of x.approach.knows) if (!byId.has(k)) p.push(`${x.key}: knows "${k}" is not a place id`)
    for (const r of x.relations) if (!keys.has(r.key)) p.push(`${x.key}: relation to unknown "${r.key}"`)
    if (VOICE_NAMES.includes(x.name) || VOICES[`${x.family}${x.name}`]) p.push(`${x.key}: named after a voice (${x.family}${x.name})`)
    for (const [k, ls] of Object.entries(x.approach.lines)) if (!ls.length) p.push(`${x.key}: no ${k} lines`)
  }
  return p
}

// ---- Pass 2: their weekday ----

const WHERE = { type: 'object', additionalProperties: false, required: ['key', 'place'], properties: { key: { type: 'string' }, place: { type: 'string', description: 'Place id' } } }
const OUTINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outings'],
  properties: {
    outings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'purpose', 'people', 'from', 'meet', 'at', 'to', 'stay', 'talk'],
        properties: {
          key: { type: 'string', description: 'Short lowercase id, e.g. "karaoke-night"' },
          purpose: { type: 'string', description: 'English, e.g. "Saki, Kota and Mei meet outside ALMOND and go to karaoke"' },
          people: { type: 'array', items: { type: 'string' }, description: 'Keys of everyone on this outing' },
          from: { type: 'array', items: WHERE, description: 'Where each person sets off from' },
          meet: { type: 'string', description: 'Place id where a group meets (stand outside and talk), or "" for one person' },
          at: { type: 'string', description: 'HH:MM they meet, or a solo person arrives. After midnight write 24:30 etc.' },
          to: { type: 'array', items: WHERE, description: 'Where each person goes after the meeting; people may split up' },
          stay: { type: 'integer', description: 'Minutes they stay at the place they went to' },
          talk: { type: 'string', description: 'English: what they talk about when they meet, and how they decide where to go (groups only, "" for one person)' },
        },
      },
    },
  },
}

// ---- Pass 3: what they say ----

const line = { type: 'object', additionalProperties: false, required: ['key', 'ja', 'en'], properties: { key: { type: 'string', description: 'Speaker key' }, ja: { type: 'string' }, en: { type: 'string' } } }
const TALK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'note', 'lines', 'because', 'there'],
  properties: {
    title: { type: 'string', description: 'Short English title' },
    note: { type: 'string', description: 'One or two English sentences on a bit of language or culture a learner would find useful' },
    lines: { type: 'array', items: line, description: 'What they say when they meet, ending with the decision' },
    because: { type: 'string', description: 'English: why they go where they go' },
    there: { type: 'array', items: line, description: 'A short scene at the place they went to, for a player who follows them in (empty if they split up to go home)' },
  },
}

const TALK_RULES = `Write the way people really talk in Tokyo today, at an intermediate learner level: mostly JLPT N4-N3 vocabulary and grammar, short spoken sentences, casual speech between friends and polite speech with seniors. Each line under 40 Japanese characters, Japanese only in "ja" (no romaji, furigana or brackets), a natural English translation in "en". Use real places by name when it fits.`

function checkTalk(out, o, keys) {
  const p = []
  if (out.lines.length < 6 || out.lines.length > 16) p.push(`${out.lines.length} lines; write 6 to 16`)
  for (const l of [...out.lines, ...out.there]) {
    if (!keys.has(l.key)) p.push(`line by "${l.key}", who isn't on this outing`)
    if (!/[぀-ヿ一-鿿]/.test(l.ja) || l.ja.length > 50) p.push(`odd line "${l.ja}"`)
  }
  for (const k of keys) if (!out.lines.some((l) => l.key === k)) p.push(`${k} never speaks`)
  return p
}

// ---- Run ----

const dir = `data/life/${AREA_ID}/circles`
await mkdir(dir, { recursive: true })
const have = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
const SEEDS = [
  'four friends in their twenties who work around Roppongi and like to go out after work',
  'a small design studio: a boss and a few staff who have lunch together',
  'a family who lives in Roppongi: parents, a teenager at school, a grandparent who visits',
  'university students who meet in Roppongi to study and hang out',
  'people who work at a restaurant and a konbini near the crossing, and their regulars',
  'neighbours in one apartment block: a retired couple, a young couple, a single office worker, a foreign resident who speaks some Japanese',
  'coworkers at an embassy and a foreign company in Roppongi Hills',
  'old school friends in their forties who meet once a month',
]

let n = 0
for (let i = 0; n < CIRCLES; i++) {
  const id = `c${String(i + 1).padStart(3, '0')}`
  const file = `${dir}/${id}.json`
  if (existsSync(file) && !REDO) continue
  n++
  const seed = SEEDS[i % SEEDS.length]
  console.log(`Circle ${id}: ${seed}`)
  const others = (await Promise.all(have.slice(0, 40).map((f) => readFile(`${dir}/${f}`, 'utf8').then(JSON.parse))))
    .flatMap((c) => c.people.map((x) => `${x.family}${x.name}`))
    .join('、')

  const cast = await ask(
    STYLE,
    `Write one circle of 4 to 8 people: ${seed}. Vary ages, jobs and temperaments. Their homes are in the area, or a map edge or station exit if they live elsewhere and come in. Give each a few relations to others in the circle.

"approach" is what happens when the player, a stranger learning Japanese, walks up to them: how open they are, what they like talking about, places they know (ids), and a bank of short lines (2 or 3 each) in their own voice for greeting the player, recommending a place, giving directions, chatting about one of their topics, and saying goodbye. ${TALK_RULES}

Pick each person a voice from this list that fits their age and manner:
${Object.entries(VOICES)
  .map(([v, d]) => `- ${v}: ${d.about}`)
  .join('\n')}
The voice names are not character names. ${others ? `Don't reuse these names already taken: ${others}.` : ''}`,
    PEOPLE_SCHEMA,
    checkPeople,
    `${id} people`,
  )
  if (!cast) continue
  const who = cast.people
    .map((x) => `- ${x.key}: ${x.family}${x.name}, ${x.age}, ${x.occupation}; ${x.personality}; lives at ${label(byId.get(x.home))}${x.work ? `, works at ${label(byId.get(x.work))}` : ''}; ${x.relations.map((r) => `${r.is} of ${r.key}`).join(', ')}`)
    .join('\n')

  const day = await ask(
    STYLE,
    `This circle: ${cast.circle}
${who}

Write their weekday as outings, from when each person first leaves home in the morning to when they are back home at night. An outing is one trip: a person (or a group) goes from where they are to a place, maybe meeting others first. Solo outings for commutes, errands and going home; group outings when they meet (lunch together, drinks after work, karaoke, a coffee). When a group meets, they stand outside "meet" and talk, then each goes to their "to"; a group may split (two go to karaoke, one goes home).

Rules, which are checked:
- Each person's outings follow on: an outing starts where their last one ended ("to"), the first starts at their home, the last ends at their home.
- Times don't overlap: leave time for the walk (about 1 minute per 80 m) and for a meeting (about 5 minutes) between arriving somewhere and the next outing. "stay" is how long they plan to stay; it may run up to their next outing.
- Places are open when they're there.
- A group meets somewhere on the way for everyone, usually outside the place they end up going to, or a well-known spot nearby (ALMOND at the crossing, a station exit), never across town.
- 3 to 6 outings per person. Use real places from the list, mostly within Roppongi.
- Every key in from/to is on the outing, and every person on the outing appears in both.`,
    OUTINGS_SCHEMA,
    (out) => checkCircle({ people: cast.people, outings: out.outings, places: byId }),
    `${id} day`,
  )
  if (!day) continue

  const talks = {}
  for (const o of day.outings.filter((o) => o.people.length > 1)) {
    const okeys = new Set(o.people)
    const goes = o.to.map((t) => `${t.key} → ${t.place} (${label(byId.get(t.place) ?? { id: t.place, kind: '?' })})`).join('; ')
    const together = new Set(o.to.map((t) => t.place)).size === 1 && PLACE_KINDS_SOCIAL.includes(byId.get(o.to[0].place)?.kind)
    talks[o.key] = await ask(
      STYLE,
      `${cast.people
        .filter((x) => okeys.has(x.key))
        .map((x) => `- ${x.key}: ${x.family}${x.name}, ${x.age}, ${x.occupation}. ${x.personality}. Mood: ${x.mood}. Talks: ${x.speech}`)
        .join('\n')}

At ${o.at} they meet outside ${label(byId.get(o.meet) ?? { id: o.meet, kind: '?' })}. ${o.talk}
Write what they say when they meet. It must end with them deciding where each goes next, which is: ${goes}. ${together ? `Then write "there": 4 to 8 lines they say once inside, for a player who follows them in.` : 'Leave "there" empty.'}

${TALK_RULES}`,
      TALK_SCHEMA,
      (out) => checkTalk(out, o, okeys),
      `${id} ${o.key}`,
    )
  }

  await writeFile(file, JSON.stringify({ id, seed, model: MODEL, ...cast, outings: day.outings, talks }, null, 1))
  console.log(`  saved ${file}: ${cast.people.length} people, ${day.outings.length} outings`)
}
