// Train timetables: when each platform's trains arrive and leave, at the
// real times of day in Tokyo.
//
// The Ōedo Line runs on Toei's published static GTFS timetable (public,
// CC BY 4.0), built into public/trains/<area>.json by
// scripts/trains/build-timetables.mjs. Tokyo Metro's GTFS (Hibiya Line)
// needs an ODPT developer key, so until that key is set the Hibiya Line
// runs on an approximate schedule with the real first and last trains and
// roughly the real gaps between trains for each hour.
//
// Live data (useLiveTrains): the Worker's /api/trains/live reads ODPT's
// odpt:Train and odpt:TrainInformation (the key stays on the server) and
// says how late the trains coming into each platform are. Trains due in the
// next while move by that delay, and the boards show 遅れ and the line's
// status. Only while the game clock is the real one (no ?time=).
import { useEffect, useState } from 'react'
import type { Station } from './station'

/** One timetable row: service id, arrival, departure (seconds after the
 *  service day's midnight; past 24:00 for trains after midnight), where
 *  it's going, and that in English. */
type Row = [string, number, number, string, string]

export interface Timetable {
  area: string
  built: string
  sources: {
    feed: string
    operator: string
    operatorEn: string
    license: string
    licenseUrl: string
    credit: string
    creditEn: string
    url: string
    version: string
    valid: [string, string]
  }[]
  /** Live delays and status, merged in by the game (see useLiveTrains). */
  live?: Live | null
  stations: Record<
    string,
    {
      feed: string
      services: Record<string, { days: string; start: string; end: string }>
      dates: Record<string, { add: string[]; drop: string[] }>
      /** By the next stop, which says the direction. */
      platforms: Record<string, Row[]>
    }
  >
}

export interface Departure {
  /** Seconds after today's midnight in Tokyo (negative: yesterday). */
  arr: number
  dep: number
  to: string
  toEn: string
  /** From the approximate schedule, not a published timetable. */
  approx?: boolean
  /** Seconds late (live data): arr and dep already include it. */
  late?: number
}

export interface LiveLine {
  /** The operator's service status text, e.g. 現在、平常どおり運転しています。 */
  text: string
  textEn: string
  /** Short status when something's wrong: 遅延, 運転見合わせ... */
  status: string
  statusEn: string
  /** By the platform's next stop: seconds late. */
  delays: Record<string, number>
}
export interface Live {
  /** When it was read (ms). */
  at: number
  /** By station ref (H04, E23). */
  lines: Record<string, LiveLine>
}

/** Live train delays and line status for an area, every minute. Off
 *  (null) when `on` is false, e.g. when ?time= moves the game clock. */
export function useLiveTrains(area: string | undefined, on: boolean) {
  const [live, setLive] = useState<Live | null>(null)
  useEffect(() => {
    if (!area || !on) return setLive(null)
    let alive = true
    const get = () =>
      fetch(`/api/trains/live?area=${encodeURIComponent(area)}`)
        .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
        .then((l) => alive && l && typeof l.at === 'number' && setLive(l))
        .catch(() => {})
    get()
    const id = setInterval(get, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [area, on])
  return live
}

/** Trains due from this long before the live reading to this long after it
 *  run late by the platform's delay. Further out, the timetable. */
const LIVE_BEFORE = 15 * 60
const LIVE_AFTER = 45 * 60

const cache = new Map<string, Promise<Timetable | null>>()
export function loadTimetable(area: string) {
  let p = cache.get(area)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}trains/${area}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Timetable>) : null))
      .catch(() => null)
    cache.set(area, p)
  }
  return p
}

export function useTimetable(area: string | undefined) {
  const [tt, setTt] = useState<Timetable | null>(null)
  useEffect(() => {
    if (!area) return
    let live = true
    loadTimetable(area).then((t) => live && setTt(t))
    return () => void (live = false)
  }, [area])
  return tt
}

const DAY = 86400
/** Tokyo is UTC+9 all year (no daylight saving). */
const JST = 9 * 3600

/** Tokyo's day number (days since 1970-01-01 there) and seconds into it. */
export function tokyoNow(ms: number) {
  const t = ms / 1000 + JST
  const day = Math.floor(t / DAY)
  return { day, sec: t - day * DAY }
}

function ymd(day: number) {
  const d = new Date(day * DAY * 1000)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
const weekday = (day: number) => (day + 3) % 7

function activeServices(st: Timetable['stations'][string], day: number) {
  const date = ymd(day)
  const dow = weekday(day)
  const on = new Set<string>()
  for (const [id, s] of Object.entries(st.services)) {
    if (s.days[dow] === '1' && (!s.start || s.start <= date) && (!s.end || date <= s.end)) on.add(id)
  }
  const ex = st.dates[date]
  ex?.drop.forEach((id) => on.delete(id))
  ex?.add.forEach((id) => on.add(id))
  return on
}

/** Weekends and public holidays run the 土休日 (weekend and holiday)
 *  timetable. Holidays come from any feed's calendar: a day that runs a
 *  weekend-only service. */
export function holidayLike(tt: Timetable | null, day: number) {
  if (weekday(day) >= 5) return true
  for (const st of Object.values(tt?.stations ?? {})) {
    const on = activeServices(st, day)
    if (!on.size) continue
    return [...on].every((id) => st.services[id]?.days.slice(0, 5) === '00000')
  }
  return false
}

/** Approximate schedules: minutes between trains for each hour from 5 to
 *  24 (midnight to the last train), weekday and weekend/holiday, plus the
 *  first and last departures (minutes after midnight). From the operators'
 *  published Roppongi timetables, rounded. */
const APPROX: Record<string, { weekday: number[]; holiday: number[]; first: number; last: number; to: [string, string][] }> = {
  // Hibiya Line, H04. 1番線 (next 神谷町) for Kita-senju, 2番線 (next 広尾)
  // for Naka-meguro.
  H04: {
    //        5  6  7    8    9  10 11 12 13 14 15 16 17 18   19 20 21 22 23 24
    weekday: [8, 4, 2.5, 2.5, 4, 5, 5, 5, 5, 5, 5, 5, 4, 3.5, 4, 5, 5, 6, 7, 8],
    holiday: [8, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 7, 8, 8],
    first: 5 * 60 + 2,
    last: 24 * 60 + 25,
    to: [
      ['北千住', 'Kita-senju'],
      ['中目黒', 'Naka-meguro'],
    ],
  },
  // Ōedo Line, E23, used only until the Toei timetable has been built.
  E23: {
    weekday: [8, 5, 3, 3, 4, 6, 6, 6, 6, 6, 6, 6, 5, 4, 4, 5, 5, 6, 7, 8],
    holiday: [8, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 8, 8],
    first: 5 * 60 + 5,
    last: 24 * 60 + 30,
    to: [
      ['都庁前', 'Tochōmae'],
      ['光が丘', 'Hikarigaoka'],
    ],
  },
}

function approxDay(station: Station, platform: number, holiday: boolean): Departure[] {
  const a = APPROX[station.id]
  if (!a) return []
  const gaps = holiday ? a.holiday : a.weekday
  // The two directions are staggered so they don't arrive together.
  const dirTo = a.to[platform % 2]
  const out: Departure[] = []
  let m = a.first + platform * 2
  while (m <= a.last) {
    const dep = Math.round(m * 60)
    out.push({ arr: dep - 30, dep, to: dirTo[0], toEn: dirTo[1], approx: true })
    const h = Math.min(gaps.length - 1, Math.max(0, Math.floor(m / 60) - 5))
    m += gaps[h]
  }
  return out
}

const dayCache = new Map<string, Departure[]>()

/** A platform's departures on one Tokyo day's timetable, in seconds after
 *  that day's midnight: yesterday's trains after midnight come out
 *  negative, today's after midnight past 24:00. Sorted by departure. */
export function departures(tt: Timetable | null, station: Station, platform: number, day: number): Departure[] {
  const key = `${tt?.built ?? '-'}|${tt?.live?.at ?? 0}|${station.id}|${platform}|${day}`
  const hit = dayCache.get(key)
  if (hit) return hit
  const out: Departure[] = []
  const st = tt?.stations[station.id]
  const next = station.platforms[platform]?.next
  const rows = st && next ? st.platforms[next] : undefined
  for (const [d, shift] of [
    [day - 1, -DAY],
    [day, 0],
  ] as const) {
    if (rows && st) {
      const on = activeServices(st, d)
      for (const [sid, arr, dep, to, toEn] of rows) {
        if (!on.has(sid)) continue
        // Timetables give minutes: when arrival and departure are the same,
        // the train still stands at the platform for half a minute.
        out.push({ arr: Math.min(arr, dep - 25) + shift, dep: dep + shift, to, toEn: toEn || EN[to] || '' })
      }
    } else {
      for (const x of approxDay(station, platform, holidayLike(tt, d))) out.push({ ...x, arr: x.arr + shift, dep: x.dep + shift })
    }
  }
  // Live delays: move the trains due around now.
  const delay = tt?.live && next ? (tt.live.lines[station.id]?.delays[next] ?? 0) : 0
  if (delay > 0 && tt?.live) {
    const at = tokyoNow(tt.live.at)
    const now = at.sec + (at.day - day) * DAY
    for (const d of out) {
      if (d.dep < now - LIVE_BEFORE - delay || d.dep > now + LIVE_AFTER) continue
      d.arr += delay
      d.dep += delay
      d.late = delay
    }
  }
  out.sort((a, b) => a.dep - b.dep)
  if (dayCache.size > 64) dayCache.clear()
  dayCache.set(key, out)
  return out
}

/** The next departures from a platform, starting with the train standing
 *  there (if any). `sec` is seconds into Tokyo day `day`. */
export function nextDepartures(tt: Timetable | null, station: Station, platform: number, day: number, sec: number, n = 2) {
  // Tomorrow's own trains (not its copy of tonight's after midnight).
  const later = departures(tt, station, platform, day + 1).filter((d) => d.dep >= 0)
  const list = [...departures(tt, station, platform, day), ...later.map((d) => ({ ...d, arr: d.arr + DAY, dep: d.dep + DAY }))]
  return list.filter((d) => d.dep >= sec).slice(0, n)
}

/** "22:41", and "0:12" for trains after midnight. */
export function clockText(sec: number) {
  const m = Math.floor(((sec % DAY) + DAY) % DAY / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** English names of the places trains go, for feeds without translations. */
const EN: Record<string, string> = {
  北千住: 'Kita-senju',
  南千住: 'Minami-senju',
  中目黒: 'Naka-meguro',
  霞ケ関: 'Kasumigaseki',
  東武動物公園: 'Tōbu-dōbutsu-kōen',
  南栗橋: 'Minami-kurihashi',
  光が丘: 'Hikarigaoka',
  都庁前: 'Tochōmae',
  大門: 'Daimon',
  両国: 'Ryōgoku',
  清澄白河: 'Kiyosumi-shirakawa',
  新宿: 'Shinjuku',
  汐留: 'Shiodome',
  練馬: 'Nerima',
}
