// Riders: the people on the station platforms. Nobody here is a random
// figure: every rider is someone from the people of the area (people.json),
// riding a train because their day plan (outings.json) has them come in or
// leave through a station exit. Until the everyday tier of people has been
// written into those files, a stand-in everyday tier comes from
// everyday.ts, and switches off once people.json has everyday people.
//
// Each ride is matched to a real train on the timetable (trains.ts): someone
// leaving comes down to the platform a few minutes before, queues at a door
// and boards when the doors open; someone arriving gets off when the train
// stands at the platform and walks to the stairs.
import { useEffect, useState } from 'react'
import type { Look } from './character'
import { everydayTier } from './everyday'
import type { PlatformFrame, Station } from './station'
import { departures, type Timetable } from './trains'

export interface Rider {
  id: string
  name: string
  nameEn: string
  age: number
  occupation: string
  look: Look
  tier: 'full' | 'everyday'
  /** Where they ride to and from, when we know (the stand-in tier). */
  home?: string
}

export interface Ride {
  who: string
  station: string
  /** Index into the station's platforms (and tracks). */
  platform: number
  board: boolean
  /** Seconds after midnight of the plan's day: when they reach the
   *  platform (boarding), or when they want to be off the train. */
  at: number
  /** Only on weekends and holidays (1), only on weekdays (0), or every day. */
  days?: 0 | 1
}

export interface RiderSource {
  riders: Map<string, Rider>
  rides: Ride[]
}

interface LifePerson {
  id: string
  name: string
  family?: string
  nameEn: string
  age: number
  occupation: string
  look: Look
  tier?: string
}
interface LifePlace {
  id: string
  kind: string
  station?: string
}
interface LifeLeg {
  who: string
  from: string
  to: string
  depart: number
  arrive: number
}

/** A small stable hash, for choices that must not change between visits. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Minutes between a station exit and the platform, at a walk. */
const EXIT_WALK = 150

/** Rides from the day plans: every leg that starts at a station exit
 *  came off a train, and every leg that ends at one boards a train. Which
 *  way along the line they live is fixed per person: they come in on one
 *  platform and leave from the other. */
export function ridesFromPlans(people: LifePerson[], legs: LifeLeg[], places: LifePlace[], stations: Station[]): RiderSource {
  const riders = new Map<string, Rider>()
  const rides: Ride[] = []
  const exits = new Map(places.filter((p) => p.kind === 'exit' && p.station).map((p) => [p.id, p.station!]))
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const leg of legs) {
    const inAt = exits.get(leg.from)
    const outAt = exits.get(leg.to)
    const sid = inAt ?? outAt
    const st = stations.find((s) => s.id === sid)
    const p = byId.get(leg.who)
    if (!st || !p || st.platforms.length < 2) continue
    const side = hash(p.id) % 2
    if (inAt) rides.push({ who: p.id, station: st.id, platform: side, board: false, at: leg.depart * 60 - EXIT_WALK })
    if (outAt) rides.push({ who: p.id, station: st.id, platform: 1 - side, board: true, at: leg.arrive * 60 + EXIT_WALK })
    riders.set(p.id, {
      id: p.id,
      name: `${p.family ?? ''}${p.name}`,
      nameEn: p.nameEn,
      age: p.age,
      occupation: p.occupation,
      look: p.look,
      tier: p.tier === 'everyday' ? 'everyday' : 'full',
    })
  }
  return { riders, rides }
}

/** Everyone who rides, from the people of the area, plus the stand-in
 *  everyday tier while the data has none. */
export function useRiders(area: string | undefined, stations: Station[]) {
  const [src, setSrc] = useState<RiderSource | null>(null)
  useEffect(() => {
    if (!area || !stations.length) return
    let live = true
    const base = `${import.meta.env.BASE_URL}life/${area}/`
    const get = (f: string) =>
      fetch(base + f)
        .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
        .catch(() => null)
    Promise.all([get('people.json'), get('outings.json'), get('places.json')]).then(([pj, oj, plj]) => {
      if (!live) return
      const people: LifePerson[] = pj?.people ?? []
      const legs: LifeLeg[] = (oj?.outings ?? []).flatMap((o: { legs?: LifeLeg[] }) => o.legs ?? [])
      const places: LifePlace[] = plj?.places ?? []
      const out = ridesFromPlans(people, legs, places, stations)
      if (!people.some((p) => p.tier === 'everyday')) {
        const ev = everydayTier(stations)
        ev.riders.forEach((r, id) => out.riders.set(id, r))
        out.rides.push(...ev.rides)
      }
      setSrc(out)
    })
    return () => void (live = false)
  }, [area, stations])
  return src
}

// ---------------------------------------------------------------------------
// Where everyone is, second by second.

const WALK = 1.25 // m/s on the platform
const STAIRS = 0.6 // m/s along the slope of stairs and escalators

/** One rider's moves for one ride: points in time with where they are. */
export interface Track {
  who: string
  /** Times (Tokyo seconds of the day) and positions; between two points
   *  they walk in a straight line, or stand if the points are the same. */
  t: number[]
  x: number[]
  y: number[]
  z: number[]
  /** When they stand still, which way they face (map x, y). */
  fx: number
  fy: number
}

/** A small deterministic random sequence. */
function seq(seed: number) {
  let s = seed || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function pickUp(f: PlatformFrame, r: () => number) {
  return f.ups[Math.floor(r() * f.ups.length)]
}

/** A door near where they come down, most likely the near ones. */
function pickDoor(f: PlatformFrame, along: number, r: () => number) {
  const w = f.doors.map((a) => Math.exp(-Math.abs(a - along) / 30) + 0.08)
  let pick = r() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < w.length; i++) if ((pick -= w[i]) <= 0) return i
  return w.length - 1
}

class TrackBuilder {
  t: number[] = []
  x: number[] = []
  y: number[] = []
  z: number[] = []
  constructor(t: number, x: number, y: number, z: number) {
    this.push(t, x, y, z)
  }
  push(t: number, x: number, y: number, z: number) {
    this.t.push(t)
    this.x.push(x)
    this.y.push(y)
    this.z.push(z)
    return this
  }
  get end() {
    return this.t[this.t.length - 1]
  }
  /** Walk to a point, at a speed. */
  to(x: number, y: number, z: number, speed = WALK) {
    const i = this.t.length - 1
    const d = Math.hypot(x - this.x[i], y - this.y[i], (z - this.z[i]) * 2)
    return this.push(this.end + d / speed, x, y, z)
  }
  /** Stand where they are until a time. */
  wait(until: number) {
    const i = this.t.length - 1
    if (until > this.end) this.push(until, this.x[i], this.y[i], this.z[i])
    return this
  }
}

/** Every rider's moves on a station's platforms on one Tokyo day, as
 *  tracks sorted by start time. Rides whose plan is for the day before
 *  (after midnight) are included, shifted. */
export function dayTracks(src: RiderSource, tt: Timetable | null, station: Station, frames: PlatformFrame[], day: number, holiday: boolean): Track[] {
  const out: Track[] = []
  // People queue at a door in the order they come; count per train and door.
  const queue = new Map<string, number>()
  const rides = src.rides.filter((r) => r.station === station.id && (r.days == null || r.days === (holiday ? 1 : 0)))
  // Last night's rides after midnight happen early this Tokyo day.
  for (const r of [...rides]) if (r.at > 86400) rides.push({ ...r, at: r.at - 86400 })
  rides.sort((a, b) => a.at - b.at)
  for (const ride of rides) {
    const f = frames.find((x) => x.i === ride.platform)
    if (!f || !f.ups.length || !f.doors.length) continue
    const list = departures(tt, station, ride.platform, day)
    if (!list.length) continue
    const r = seq(hash(`${ride.who}|${ride.at}|${day}`))
    const up = pickUp(f, r)
    const door = pickDoor(f, up.along, r)
    const a = f.doors[door]
    const P = (along: number, out: number) => [f.mx + f.ux * along + f.nx * out, f.my + f.uy * along + f.ny * out] as const
    const walkway = f.edge + Math.min(f.width * 0.55, 3)
    if (ride.board) {
      // The first train that leaves with time to get on.
      const d = list.find((x) => x.dep >= ride.at + 30)
      if (!d) continue
      const k = `${d.dep}|${door}`
      const j = queue.get(k) ?? 0
      queue.set(k, j + 1)
      // Late at night trains are far apart: nobody waits 20 minutes on the
      // platform, they'd come down later.
      const enter = Math.max(ride.at, d.arr - 9 * 60 + r() * 120)
      const tb = new TrackBuilder(enter, up.tx, up.ty, up.tz).to(up.fx, up.fy, f.z, STAIRS)
      tb.to(...P(up.along, walkway), f.z).to(...P(a, walkway), f.z)
      // Two lines either side of the door, front to back.
      const side = j % 2 ? 0.55 : -0.55
      const row = Math.floor(j / 2)
      const spot = P(a + side, f.edge + 0.7 + row * 0.6)
      tb.to(...spot, f.z)
      // They get on after the people getting off, one after another.
      tb.wait(Math.min(d.dep - 6, d.arr + 6 + j * 1.1))
      tb.to(...P(a, f.edge), f.z).to(...P(a, f.edge - 1.2), f.z)
      if (tb.end > d.dep + 2) continue
      out.push({ who: ride.who, t: tb.t, x: tb.x, y: tb.y, z: tb.z, fx: -f.nx, fy: -f.ny })
    } else {
      // The last train in before they want to be off it.
      let d = null
      for (const x of list) if (x.arr <= ride.at && x.arr > ride.at - 900) d = x
      d ??= list.find((x) => x.arr > ride.at)
      if (!d) continue
      const k = `off|${d.arr}|${door}`
      const j = queue.get(k) ?? 0
      queue.set(k, j + 1)
      const start = d.arr + 2 + j * 1.0 + r() * 0.6
      if (start > d.dep - 4) continue
      const tb = new TrackBuilder(start, ...P(a, f.edge - 1.2), f.z)
      tb.to(...P(a, f.edge + 0.6), f.z)
        .to(...P(a + (up.along - a) * 0.15, walkway + (r() - 0.5)), f.z)
        .to(...P(up.along, walkway), f.z)
        .to(up.fx, up.fy, f.z)
        .to(up.tx, up.ty, up.tz, STAIRS)
      out.push({ who: ride.who, t: tb.t, x: tb.x, y: tb.y, z: tb.z, fx: -f.nx, fy: -f.ny })
    }
  }
  out.sort((p, q) => p.t[0] - q.t[0])
  return out
}

/** Where a track has its rider at time `sec`: position, heading and
 *  whether they're walking. Null outside the track's time. */
export function trackAt(tr: Track, sec: number) {
  const n = tr.t.length
  if (sec < tr.t[0] || sec > tr.t[n - 1]) return null
  let i = 1
  while (i < n - 1 && tr.t[i] < sec) i++
  const t0 = tr.t[i - 1]
  const t1 = tr.t[i]
  const k = t1 > t0 ? (sec - t0) / (t1 - t0) : 1
  const dx = tr.x[i] - tr.x[i - 1]
  const dy = tr.y[i] - tr.y[i - 1]
  const moving = Math.hypot(dx, dy) > 0.01
  return {
    x: tr.x[i - 1] + dx * k,
    y: tr.y[i - 1] + dy * k,
    z: tr.z[i - 1] + (tr.z[i] - tr.z[i - 1]) * k,
    hx: moving ? dx : tr.fx,
    hy: moving ? dy : tr.fy,
    moving,
  }
}
