// The people of the area going about their day (written ahead of time by
// scripts/life/write-life.mjs, checked and routed by scripts/life/plan.mjs).
// Each person's day is a list of walks with times: this works out where
// everyone is at a given minute, so the game needs no pathfinding. A group
// meets, talks (you can listen in), then walks off to where they decided.
import { useEffect, useRef, useState } from 'react'
import type { Look } from './character'
import type { Caption, Conversation } from './talk'

export interface LifePerson {
  id: string
  name: string
  family: string
  nameEn: string
  age: number
  gender: string
  occupation: string
  personality: string
  mood: string
  look: Look
  voice: string
}

export interface Leg {
  who: string
  from: string
  to: string
  /** Minutes from midnight (past 1440 is after midnight). */
  depart: number
  arrive: number
  len: number | null
  /** The walk, [x0, y0, x1, y1, …] in map meters. */
  p: number[] | null
  /** At the end: wait there for the others, or go in. */
  then: 'wait' | 'enter'
}

export interface Outing {
  id: string
  purpose: string
  people: string[]
  meet: string | null
  at: number
  stay: number
  talk: string | null
  legs: Leg[]
}

export interface LifeLine {
  s: string
  ja: string
  en: string
}

export interface LifeTalk {
  id: string
  outing: string
  at: string
  title: string
  note: string
  speakers: string[]
  lines: LifeLine[]
  ending: { each: Record<string, string>; because: string }
  there: LifeLine[]
}

export interface LifePlace {
  id: string
  kind: string
  name: string | null
  nameEn: string | null
  door: { x: number; y: number }
}

export interface Life {
  people: Map<string, LifePerson>
  outings: Outing[]
  talks: Map<string, LifeTalk>
  places: Map<string, LifePlace>
  /** Each person's walks, in time order. */
  legsOf: Map<string, { leg: Leg; outing: Outing }[]>
}

/** How long a group stands and talks when they meet (plan.mjs TALK_MIN). */
export const TALK_MIN = 4

export async function loadLife(area: string): Promise<Life | null> {
  const get = async (f: string) => {
    const res = await fetch(`${import.meta.env.BASE_URL}life/${area}/${f}.json`)
    if (!res.ok) throw new Error(`${f}: ${res.status}`)
    return res.json()
  }
  try {
    const [people, outings, talks, places] = await Promise.all([get('people'), get('outings'), get('conversations'), get('places')])
    const legsOf = new Map<string, { leg: Leg; outing: Outing }[]>()
    for (const o of outings.outings as Outing[])
      for (const leg of o.legs) {
        const list = legsOf.get(leg.who) ?? []
        list.push({ leg, outing: o })
        legsOf.set(leg.who, list)
      }
    for (const list of legsOf.values()) list.sort((a, b) => a.leg.depart - b.leg.depart)
    return {
      people: new Map((people.people as LifePerson[]).map((p) => [p.id, p])),
      outings: outings.outings,
      talks: new Map((talks.conversations as LifeTalk[]).map((c) => [c.outing, c])),
      places: new Map((places.places as LifePlace[]).map((p) => [p.id, p])),
      legsOf,
    }
  } catch {
    return null
  }
}

/** Where someone is: walking a leg, or standing with their group. */
export interface Whereabouts {
  person: LifePerson
  x: number
  y: number
  /** Direction they face, radians (as rotation.y). */
  facing: number
  walking: boolean
  /** The outing they're on. */
  outing: Outing
}

/** Point and heading a fraction `t` of the way along a walk. */
function along(p: number[], t: number) {
  let total = 0
  for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
  let d = Math.max(0, Math.min(1, t)) * total
  for (let i = 2; i < p.length; i += 2) {
    const dx = p[i] - p[i - 2]
    const dy = p[i + 1] - p[i - 1]
    const s = Math.hypot(dx, dy)
    if (d <= s || i === p.length - 2) {
      const k = s ? Math.min(1, d / s) : 0
      return { x: p[i - 2] + dx * k, y: p[i - 1] + dy * k, facing: Math.atan2(dx, dy) }
    }
    d -= s
  }
  return { x: p[0], y: p[1], facing: 0 }
}

/**
 * Everyone who is out on the street at `minute` (from midnight, with
 * fractions): walking, or standing where their group meets. People at home,
 * at work or inside somewhere aren't listed.
 */
export function whereabouts(life: Life, minute: number): Whereabouts[] {
  const out: Whereabouts[] = []
  const standing = new Map<string, Whereabouts[]>()
  for (const [id, legs] of life.legsOf) {
    const person = life.people.get(id)
    if (!person) continue
    // A day runs past midnight: 00:30 is also 24:30 of the day before.
    for (const m of [minute, minute + 1440]) {
      let found: Whereabouts | null = null
      for (let i = 0; i < legs.length; i++) {
        const { leg, outing } = legs[i]
        if (m >= leg.depart && m < leg.arrive && leg.p) {
          const a = along(leg.p, (m - leg.depart) / Math.max(0.01, leg.arrive - leg.depart))
          // Keep to their own side of the pavement, so two people on the
          // same walk don't merge into one.
          const side = (((hash(id) % 5) - 2) * 0.35) as number
          a.x += Math.cos(a.facing) * side
          a.y -= Math.sin(a.facing) * side
          found = { person, ...a, walking: true, outing }
          break
        }
        const next = legs[i + 1]
        if (leg.then === 'wait' && m >= leg.arrive && (!next || m < next.leg.depart) && leg.p) {
          found = { person, x: leg.p[leg.p.length - 2], y: leg.p[leg.p.length - 1], facing: 0, walking: false, outing }
          const key = outing.id
          standing.set(key, [...(standing.get(key) ?? []), found])
          break
        }
      }
      if (found) {
        out.push(found)
        break
      }
    }
  }
  // A group stands in a ring around their meeting spot, facing the middle.
  for (const group of standing.values()) {
    const cx = group[0].x
    const cy = group[0].y
    const r = 0.45 + 0.18 * group.length
    group.forEach((w, i) => {
      const a = (i / group.length) * Math.PI * 2 + 0.6
      w.x = cx + Math.cos(a) * r
      w.y = cy + Math.sin(a) * r
      w.facing = Math.atan2(cx - w.x, cy - w.y)
    })
  }
  return out
}

// ?life=18:25 starts people's day at that time (it runs on from there), to
// watch a scene without waiting for it.
const START_AT = (() => {
  const m = /^(\d{1,2}):(\d\d)$/.exec(new URLSearchParams(location.search).get('life') ?? '')
  return m ? { minute: +m[1] * 60 + +m[2], from: Date.now() } : null
})()

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Minutes since Tokyo midnight, with seconds, for smooth walking. */
export function tokyoMinute(date: Date) {
  if (START_AT) return (START_AT.minute + (date.getTime() - START_AT.from) / 60000) % 1440
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute') + (get('second') + date.getMilliseconds() / 1000) / 60
}

/** Shared with the 3D people: who in the group is speaking right now. */
export const lifeLive = {
  speaking: null as { outing: string; person: string } | null,
}

const START = 25 // meters: you hear a group once you're this close
const HEAR = 12 // full subtitles inside this
const FADE = 22 // none beyond this
const NOTE_MS = 7000

/**
 * The conversation of the group meeting nearest the player, if they're
 * close: steps through its lines (each held long enough to read) and returns
 * a caption the talk box can show. Each meeting is heard once.
 */
export function useLifeTalk(life: Life | null, focus: { current: { x: number; y: number; under?: boolean } }, enabled: boolean): Caption | null {
  const [caption, setCaption] = useState<Caption | null>(null)
  const on = useRef(enabled)
  useEffect(() => {
    on.current = enabled
  }, [enabled])
  useEffect(() => {
    if (!life) return
    const heard = new Set<string>()
    let cur: { talk: LifeTalk; conv: Conversation; spot: Caption['spot']; line: number; until: number } | null = null
    let shown = ''
    const tick = () => {
      const now = performance.now()
      const f = focus.current
      if (!cur && on.current && !f.under) {
        const minute = tokyoMinute(new Date())
        for (const o of life.outings) {
          if (!o.talk || heard.has(o.id) || !o.meet) continue
          const m = minute < o.at - 720 ? minute + 1440 : minute
          if (m < o.at - 1 || m > o.at + TALK_MIN) continue
          const t = life.talks.get(o.id)
          const place = life.places.get(o.meet)
          if (!t || !place || Math.hypot(place.door.x - f.x, place.door.y - f.y) > START) continue
          heard.add(o.id)
          const speakers = t.speakers.map((id) => life.people.get(id))
          const conv: Conversation = {
            id: t.id,
            spot: o.id,
            when: [],
            weather: 'any',
            title: t.title,
            summary: t.ending.because,
            note: t.note,
            speakers: speakers.map((p) => ({ name: p ? p.name : '?', about: p ? `${p.age}, ${p.occupation}` : '', voice: p?.voice ?? '' })),
            lines: t.lines.map((l) => ({ s: Math.max(0, t.speakers.indexOf(l.s)), ja: l.ja, en: l.en })),
          }
          const spot = { id: o.id, name: place.name ?? place.nameEn ?? '', nameEn: place.nameEn ?? place.name ?? '', x: place.door.x, y: place.door.y }
          cur = { talk: t, conv, spot, line: 0, until: now + readMs(conv.lines[0].ja) }
          break
        }
      }
      if (cur && now > cur.until) {
        if (cur.line >= 0 && cur.line < cur.conv.lines.length - 1) {
          cur.line++
          cur.until = now + readMs(cur.conv.lines[cur.line].ja)
        } else if (cur.line >= 0) {
          cur.line = -1
          cur.until = now + NOTE_MS
        } else cur = null
      }
      lifeLive.speaking = cur && cur.line >= 0 ? { outing: cur.spot.id, person: cur.talk.lines[cur.line].s } : null
      let next: Caption | null = null
      if (cur) {
        const d = Math.hypot(cur.spot.x - f.x, cur.spot.y - f.y)
        const clear = d <= HEAR ? 1 : d >= FADE ? 0 : 1 - (d - HEAR) / (FADE - HEAR)
        next = { spot: cur.spot, conv: cur.conv, line: cur.line, clear: Math.round(clear * 10) / 10 }
      }
      const key = next ? `${next.conv.id}:${next.line}:${next.clear}` : ''
      if (key !== shown) {
        shown = key
        setCaption(next)
      }
    }
    const timer = window.setInterval(tick, 200)
    return () => {
      window.clearInterval(timer)
      lifeLive.speaking = null
    }
  }, [life, focus])
  return caption
}

const readMs = (ja: string) => 1400 + [...ja].length * 170
