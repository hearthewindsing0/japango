// Checks that every person's day makes sense, and turns the circles Claude
// wrote (data/life/<area>/circles/*.json) into what the game reads:
//
//   public/life/<area>/people.json         everyone, by id
//   public/life/<area>/outings.json        every trip, with each person's walk
//                                          (a ready-made line on the map)
//   public/life/<area>/conversations.json  what they say when they meet, and
//                                          at the place they go to
//
// Times are minutes from midnight of a weekday (a Wednesday); past 1440 is
// after midnight.
//
//   bun scripts/life/plan.mjs
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { AREA_ID } from '../area.mjs'
import { crossingsOf, loadWalkGrid, route } from './walk.mjs'

/** Places people go out to (rather than live, work or arrive at). */
export const PLACE_KINDS_SOCIAL = ['karaoke', 'izakaya', 'bar', 'club', 'noodles', 'restaurant', 'fastfood', 'cafe', 'konbini', 'supermarket', 'drugstore', 'shop', 'park', 'shrine', 'gym', 'sight', 'errand']

const DAY = 2 // Wednesday (hours are Monday first)
const WALK = 80 // m a minute, walking
const LIGHT_WAIT = 0.4 // minutes, on average, waiting for the green man at each lit zebra
const DETOUR = 1.35 // walks are about this much longer than a straight line
const TALK_MIN = 4 // minutes a meeting takes, standing outside and talking

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Rough walking minutes between two places, before routes are worked out. */
const roughWalk = (a, b) => Math.ceil((Math.hypot(a.door.x - b.door.x, a.door.y - b.door.y) * DETOUR) / WALK)

function openAt(place, m) {
  const week = place.hours
  if (!week) return true
  const d = m >= 1440 ? (DAY + 1) % 7 : DAY
  const t = m % 1440
  if (week[d]?.some(([s, e]) => t >= s && t < e)) return true
  const prev = (d + 6) % 7
  return week[prev]?.some(([s, e]) => e > 1440 && t + 1440 >= s && t + 1440 < e) ?? false
}

const detourOk = (extra, direct) => extra <= Math.max(6, direct * 0.5)

/**
 * Moves a group's meeting spot when it sends someone the long way round:
 * to the spot (one of the places they're going, a station exit, a
 * konbini, a park, ALMOND) that keeps everyone's detour smallest. Claude
 * picks plausible spots but doesn't know how far apart things are.
 */
export function fixMeets(outings, places, walk = roughWalk) {
  const spots = [...places.values()].filter((p) => p.kind === 'exit' || p.kind === 'konbini' || p.kind === 'park' || p.name === 'ALMOND')
  for (const o of outings) {
    if (o.people.length < 2 || !Array.isArray(o.from) || !Array.isArray(o.to)) continue
    const legs = o.people.map((k) => [places.get(o.from.find((w) => w.key === k)?.place), places.get(o.to.find((w) => w.key === k)?.place)])
    if (legs.some(([a, b]) => !a || !b)) continue
    const worst = (m) => Math.max(...legs.map(([a, b]) => (a === b ? 0 : walk(a, m) + walk(m, b) - walk(a, b) - Math.max(6, walk(a, b) * 0.5))))
    const now = places.get(o.meet)
    if (now && worst(now) <= 0) continue
    let best = null
    let bw = Infinity
    for (const m of [...new Set(legs.map(([, b]) => b))].concat(spots)) {
      const w = worst(m)
      if (w < bw) [bw, best] = [w, m]
    }
    if (best && bw <= 0) o.meet = best.id
  }
}

/**
 * Everything wrong with a circle's day (empty when it all makes sense):
 * outings follow on from each other for each person, nobody is in two
 * places at once or walks impossibly fast, and places are open.
 */
export function checkCircle({ people, outings, places, walk = roughWalk }) {
  const p = []
  const byKey = new Map(people.map((x) => [x.key, x]))
  const keysOf = new Set()
  for (const o of outings) {
    if (keysOf.has(o.key)) p.push(`two outings are called "${o.key}"`)
    keysOf.add(o.key)
    const on = new Set(o.people)
    for (const k of on) if (!byKey.has(k)) p.push(`${o.key}: unknown person "${k}"`)
    for (const side of ['from', 'to']) {
      const ks = o[side].map((w) => w.key)
      if (ks.length !== on.size || !ks.every((k) => on.has(k))) p.push(`${o.key}: "${side}" must list each person on the outing once`)
      for (const w of o[side]) if (!places.has(w.place)) p.push(`${o.key}: ${side} "${w.place}" is not a place id`)
    }
    if (on.size > 1 && !places.has(o.meet)) p.push(`${o.key}: a group needs a "meet" place id, not "${o.meet}"`)
    if (!/^\d\d:\d\d$/.test(o.at)) p.push(`${o.key}: bad time "${o.at}"`)
  }
  if (p.length) return p

  for (const person of people) {
    const mine = outings.filter((o) => o.people.includes(person.key)).sort((a, b) => toMin(a.at) - toMin(b.at))
    if (mine.length < 2) {
      p.push(`${person.key} needs at least a trip out and a trip home`)
      continue
    }
    let here = person.home
    let free = 0
    for (const o of mine) {
      const from = o.from.find((w) => w.key === person.key).place
      const to = o.to.find((w) => w.key === person.key).place
      if (from !== here) p.push(`${person.key}: "${o.key}" starts at ${from}, but they are at ${here} after their last outing`)
      const at = toMin(o.at)
      const first = o.meet && o.people.length > 1 ? o.meet : to
      const leave = at - (from === first ? 0 : walk(places.get(from), places.get(first)))
      // A stay is "up to": leaving early is fine, leaving before arriving isn't.
      if (leave < free) p.push(`${person.key}: "${o.key}" would mean leaving ${from} at ${hhmm(leave)}, before they even get there at ${hhmm(free)}`)
      if (o.meet && o.people.length > 1 && from !== to) {
        // Meet on the way, not across town and back.
        const direct = walk(places.get(from), places.get(to))
        const via = walk(places.get(from), places.get(o.meet)) + walk(places.get(o.meet), places.get(to))
        if (!detourOk(via - direct, direct))
          p.push(`${person.key}: meeting at ${o.meet} in "${o.key}" is ${via - direct} minutes out of their way; meet near where they are going (outside it is fine)`)
      }
      const arrive = o.meet && o.people.length > 1 ? at + TALK_MIN + (o.meet === to ? 0 : walk(places.get(o.meet), places.get(to))) : at
      const dest = places.get(to)
      if (!['home', 'office', 'school', 'hotel', 'away', 'exit'].includes(dest.kind)) {
        if (!openAt(dest, arrive)) p.push(`${person.key}: ${to} (${dest.name ?? dest.nameEn}) is closed at ${hhmm(arrive)}`)
        else if (!openAt(dest, arrive + Math.max(0, o.stay - 1))) p.push(`${person.key}: ${to} (${dest.name ?? dest.nameEn}) closes before ${hhmm(arrive + o.stay)}`)
      }
      here = to
      free = arrive
    }
    if (here !== person.home) p.push(`${person.key}: their day ends at ${here}, not at home (${person.home})`)
  }
  return p
}

// ---- Build the game's files ----

if (import.meta.main ?? process.argv[1]?.endsWith('plan.mjs')) {
  const dir = `data/life/${AREA_ID}/circles`
  const out = `public/life/${AREA_ID}`
  const { places } = JSON.parse(await readFile(`${out}/places.json`, 'utf8'))
  const byId = new Map(places.map((x) => [x.id, x]))
  const grid = await loadWalkGrid(AREA_ID)
  const routes = new Map()
  const walkBetween = (a, b) => {
    const k = `${a}>${b}`
    if (!routes.has(k)) {
      const r = route(grid, byId.get(a).door, byId.get(b).door)
      if (r) r.x = crossingsOf(grid, r.p)
      routes.set(k, r)
    }
    return routes.get(k)
  }
  const minsOf = (r) => Math.ceil(r.len / WALK + LIGHT_WAIT * r.x.filter((c) => c[3]).length)
  const realWalk = (a, b) => {
    const r = walkBetween(a.id, b.id)
    return r ? minsOf(r) : roughWalk(a, b)
  }

  const people = []
  const outings = []
  const conversations = []
  const files = existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.json')).sort() : []
  for (const f of files) {
    const c = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'))
    const pid = (k) => `${c.id}-${k}`
    const problems = checkCircle({ people: c.people, outings: c.outings, places: byId, walk: realWalk })
    if (problems.length) {
      console.warn(`${c.id}: left out, its day doesn't add up:\n  ${problems.join('\n  ')}`)
      continue
    }
    for (const x of c.people)
      people.push({
        id: pid(x.key),
        circle: c.id,
        ...Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'key')),
        relations: x.relations.map((r) => ({ id: pid(r.key), is: r.is })),
      })
    for (const o of c.outings) {
      const id = `${c.id}-${o.key}`
      const at = toMin(o.at)
      const group = o.people.length > 1
      const t = c.talks?.[o.key]
      const legs = []
      for (const k of o.people) {
        const from = o.from.find((w) => w.key === k).place
        const to = o.to.find((w) => w.key === k).place
        const leg = (a, b, arrive) => {
          if (a === b) return null
          const r = walkBetween(a, b)
          const mins = r ? minsOf(r) : roughWalk(byId.get(a), byId.get(b))
          return { who: pid(k), from: a, to: b, depart: arrive - mins, arrive, len: r?.len ?? null, p: r?.p ?? null, x: r?.x ?? [] }
        }
        if (group) {
          // Some come early, some are a minute or two late: the first to
          // arrive waits outside, which is what the player sees.
          const early = (hash(`${id}${k}`) % 9) - 2
          const a = leg(from, o.meet, at - early)
          if (a) legs.push({ ...a, then: 'wait' })
          const b = leg(o.meet, to, at + TALK_MIN + realWalk(byId.get(o.meet), byId.get(to)))
          if (b) legs.push({ ...b, depart: at + TALK_MIN, then: 'enter' })
        } else {
          const a = leg(from, to, at)
          if (a) legs.push({ ...a, then: 'enter' })
        }
      }
      outings.push({
        id,
        purpose: o.purpose,
        people: o.people.map(pid),
        meet: group ? o.meet : null,
        at,
        stay: o.stay,
        talk: t ? id : null,
        legs,
      })
      if (t)
        conversations.push({
          id,
          outing: id,
          at: o.meet,
          title: t.title,
          note: t.note,
          speakers: o.people.map(pid),
          lines: t.lines.map((l) => ({ s: pid(l.key), ja: l.ja, en: l.en })),
          ending: { each: Object.fromEntries(o.to.map((w) => [pid(w.key), w.place])), because: t.because },
          there: t.there.map((l) => ({ s: pid(l.key), ja: l.ja, en: l.en })),
        })
    }
  }
  outings.sort((a, b) => a.at - b.at)
  await mkdir(out, { recursive: true })
  const day = 'weekday'
  await writeFile(`${out}/people.json`, JSON.stringify({ area: AREA_ID, people }))
  await writeFile(`${out}/outings.json`, JSON.stringify({ area: AREA_ID, day, outings }))
  await writeFile(`${out}/conversations.json`, JSON.stringify({ area: AREA_ID, conversations }))
  console.log(`${people.length} people, ${outings.length} outings, ${outings.reduce((n, o) => n + o.legs.length, 0)} walks, ${conversations.length} conversations`)
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
