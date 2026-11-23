// How many people are out, from measured numbers rather than a guess: MLIT's
// people-flow open data (全国の人流オープンデータ, see
// scripts/fetch-people.mjs). For each 1 km mesh square it gives the people
// present, by month, on weekdays and on holidays, as three averages: midday
// (11:00-14:59), the small hours (1:00-4:59) and the whole day.
//
// This is the one place the game asks "how many people are here now?".
// The passers-by (Crowd.tsx) and the street sound (ambience.ts) read
// streetLevel(); the people who live in the area can read peopleAt() to
// decide how many of them should be out at once.

/** One mesh square, as the tile manifest carries it. */
export interface FlowSquare {
  /** 3rd-order mesh code (8 digits). */
  id: string
  /** Center in map meters. */
  c: [number, number]
  /** Outline in map meters: four x, y corners. */
  p: number[]
  /** Weekdays and holidays: per month (Jan first), [midday, small hours, whole day]. */
  wd: [number, number, number][]
  ho: [number, number, number][]
}

export interface PeopleFlow {
  source: string
  url: string
  attribution: string
  license: string
  year: number
  meshes: FlowSquare[]
}

/** When, as the data splits it. */
export interface FlowTime {
  /** 1-12. */
  month: number
  /** Saturday, Sunday or a public holiday. */
  holiday: boolean
  /** Tokyo hour, 0-24 (fractions blend between hours). */
  hour: number
}

// ── From three averages to 24 hours ─────────────────────────────────────
// The data has no hour-by-hour numbers, so each day is drawn with one shape
// and fitted to all three: the small hours sit at the night number, 11-14
// at the midday number, and an evening bump (positive or negative) makes the
// whole day average out right. The shape: people arrive 6-10, stay through
// the afternoon and drift home in the evening.
const WORKDAY = [0.3, 0, 0, 0, 0, 0.05, 0.15, 0.35, 0.6, 0.8, 0.92, 1, 1, 1, 1, 0.97, 0.92, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15]
// Going out: dinner, bars, clubs. Zero in the hours the data measures.
const EVENING = [0.35, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.5, 0.8, 1, 1, 0.85, 0.6]
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const W_SUM = sum(WORKDAY)
const E_SUM = sum(EVENING)

/** People present at each hour 0-23 from the [midday, small hours, whole day] averages. */
export function hourly([day, night, all]: [number, number, number]) {
  const evening = (24 * all - 24 * night - (day - night) * W_SUM) / E_SUM
  return WORKDAY.map((w, h) => Math.max(night * 0.5, night + (day - night) * w + evening * EVENING[h]))
}

const cache = new WeakMap<FlowSquare, Map<string, number[]>>()
function hoursOf(sq: FlowSquare, month: number, holiday: boolean) {
  let byKey = cache.get(sq)
  if (!byKey) cache.set(sq, (byKey = new Map()))
  const key = `${holiday ? 'ho' : 'wd'}${month}`
  let hours = byKey.get(key)
  if (!hours) {
    const m = Math.min(12, Math.max(1, Math.round(month))) - 1
    byKey.set(key, (hours = hourly((holiday ? sq.ho : sq.wd)[m] ?? [0, 0, 0])))
  }
  return hours
}

/** People present in one square at a (fractional) hour. */
export function squareAt(sq: FlowSquare, t: FlowTime) {
  const hours = hoursOf(sq, t.month, t.holiday)
  const h = (((t.hour % 24) + 24) % 24)
  const i = Math.floor(h)
  const f = h - i
  return hours[i] * (1 - f) + hours[(i + 1) % 24] * f
}

/**
 * About how many people are present in the 1 km² around (x, y) in map
 * meters: indoors and out, residents, workers and visitors. Blends between
 * nearby squares so there's no step at their edges. 0 without data.
 */
export function peopleAt(flow: PeopleFlow | undefined, x: number, y: number, t: FlowTime) {
  if (!flow?.meshes.length) return 0
  let wsum = 0
  let v = 0
  for (const sq of flow.meshes) {
    const d = Math.hypot(sq.c[0] - x, sq.c[1] - y)
    if (d > 1400) continue
    const w = 1 / Math.max(50, d) ** 2
    wsum += w
    v += w * squareAt(sq, t)
  }
  return wsum ? v / wsum : 0
}

/** People present in a square that counts as a full street: Roppongi
 *  Crossing's square on a weekday lunchtime is about 92,000. */
export const FULL_STREET = 100_000

/**
 * How busy the street is at (x, y), 0..1, for things that scale with it
 * (how many passers-by are out, how loud the street is). Null when the map
 * has no people-flow data, so callers can fall back to their own guess.
 */
export function streetLevel(flow: PeopleFlow | undefined, x: number, y: number, t: FlowTime): number | null {
  if (!flow?.meshes.length) return null
  return Math.min(1, peopleAt(flow, x, y, t) / FULL_STREET)
}

/** Saturday, Sunday and Japan's public holidays (the data counts them as one). */
export function isHoliday(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(date)
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? ''
  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return true
  return japaneseHoliday(Number(get('year')), Number(get('month')), Number(get('day')))
}

/** Japan's public holidays (国民の祝日), including substitute holidays. */
export function japaneseHoliday(y: number, m: number, d: number): boolean {
  // Equinoxes, by the usual formula (good for 1980-2099).
  const spring = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))
  const autumn = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))
  const isBase = (mm: number, dd: number) =>
    (mm === 1 && (dd === 1 || dd === nthMondayOf(1, 2))) ||
    (mm === 2 && (dd === 11 || dd === 23)) ||
    (mm === 3 && dd === spring) ||
    (mm === 4 && dd === 29) ||
    (mm === 5 && (dd === 3 || dd === 4 || dd === 5)) ||
    (mm === 7 && dd === nthMondayOf(7, 3)) ||
    (mm === 8 && dd === 11) ||
    (mm === 9 && (dd === nthMondayOf(9, 3) || dd === autumn)) ||
    (mm === 10 && dd === nthMondayOf(10, 2)) ||
    (mm === 11 && (dd === 3 || dd === 23))
  function nthMondayOf(mm: number, n: number) {
    const first = new Date(Date.UTC(y, mm - 1, 1)).getUTCDay()
    return 1 + ((8 - first) % 7) + (n - 1) * 7
  }
  if (isBase(m, d)) return true
  // Substitute holiday: the first non-holiday after a holiday on Sunday.
  const date = new Date(Date.UTC(y, m - 1, d))
  for (let back = 1; back <= 3; back++) {
    const p = new Date(date.getTime() - back * 86400000)
    if (!isBase(p.getUTCMonth() + 1, p.getUTCDate())) break
    if (p.getUTCDay() === 0) return true
  }
  // A day between two holidays (as in Silver Week) is a holiday too.
  const prev = new Date(date.getTime() - 86400000)
  const next = new Date(date.getTime() + 86400000)
  return date.getUTCDay() !== 0 && isBase(prev.getUTCMonth() + 1, prev.getUTCDate()) && isBase(next.getUTCMonth() + 1, next.getUTCDate())
}
