// Real opening hours from OpenStreetMap (parsed at build time by
// scripts/opening-hours.mjs): seven lists, Monday first, of [open, close]
// in minutes from that day's midnight. A close past 1440 runs into the next
// morning.

export type Week = [number, number][][]

/** Tokyo weekday (0 = Monday) and minutes since midnight. */
export function tokyoWeekMinute(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
  return { day: Math.max(0, day), minute: Number(get('hour')) * 60 + Number(get('minute')) }
}

export function isOpen(week: Week, day: number, minute: number) {
  if (week[day]?.some(([s, e]) => minute >= s && minute < e)) return true
  // Still open from last night (18:00-03:00).
  const prev = (day + 6) % 7
  return week[prev]?.some(([s, e]) => e > 1440 && minute + 1440 >= s && minute + 1440 < e) ?? false
}

export const is24h = (week: Week) => week.every((d) => d.some(([s, e]) => s === 0 && e >= 1440))

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** Today's hours the way Japanese shop doors write them: "11:30〜15:00 / 17:30〜翌3:00". */
export function hoursToday(week: Week, day: number) {
  if (is24h(week)) return '24時間営業'
  const spans = week[day] ?? []
  if (!spans.length) return '本日定休日'
  return spans.map(([s, e]) => `${hhmm(s)}〜${e > 1440 ? `翌${hhmm(e - 1440)}` : hhmm(e)}`).join(' / ')
}
