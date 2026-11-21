// Turns OpenStreetMap opening_hours strings into a simple weekly schedule
// the game can check against Tokyo time: seven lists (Monday first) of
// [open, close] in minutes from that day's midnight. A close past 1440 runs
// into the next morning (bars open 18:00-03:00 → [1080, 1620]).
//
// Covers what Roppongi's shops actually use: weekday ranges (Mo-Fr, Sa-We),
// several time spans (11:30-14:00,18:00-22:00), "off", "24/7", closing
// times past midnight (18:00-26:00 or 18:00-02:00), ";" rules that replace
// earlier ones for their days and ", " rules that add to them. Public
// holidays (PH), nth-weekday rules (Su[1]) and date ranges (Dec 29-Jan 03)
// are skipped, so on those days the usual weekday hours apply.
// Returns null when nothing usable is left.

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/
const TIME = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/

/** Days picked by a selector like "Mo-Fr", "Sa,Su", "Su,Mo-Th", "Tu, Mo[3]".
 *  null when the selector only names things we skip (PH, Su[1]). */
function parseDays(sel) {
  const days = new Set()
  let skipped = false
  for (const raw of sel.split(',')) {
    const item = raw.trim()
    if (!item) continue
    if (/\[/.test(item) || /^(PH|SH)$/.test(item)) {
      skipped = true
      continue
    }
    const m = item.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/)
    if (!m) return undefined // not a weekday selector
    const a = DAYS.indexOf(m[1])
    const b = m[2] ? DAYS.indexOf(m[2]) : a
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === b) break
    }
  }
  if (!days.size) return skipped ? null : undefined
  return [...days]
}

/** Time spans like "11:30-15:00, 17:30-23:30", "off", or undefined. */
function parseTimes(text) {
  const t = text.trim()
  if (/^(off|closed)$/i.test(t)) return []
  const spans = []
  for (const part of t.split(',')) {
    const m = part.trim().match(TIME)
    if (!m) return undefined
    const s = Number(m[1]) * 60 + Number(m[2])
    let e = Number(m[3]) * 60 + Number(m[4])
    if (e <= s) e += 1440
    if (e > s + 1440) return undefined
    spans.push([s, e])
  }
  return spans
}

export function parseOpeningHours(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const week = DAYS.map(() => null)
  let used = false
  // "Mo-Fr 18:00-01:30, Sa 18:00-24:00": a comma right after a time and
  // before a weekday starts an additional rule.
  for (const rule of value.split(';')) {
    const parts = rule.split(/(?<=\d)\s*,\s*(?=[A-Z])/)
    parts.forEach((part, pi) => {
      const p = part.trim()
      if (!p) return
      if (p === '24/7') {
        for (let d = 0; d < 7; d++) week[d] = [[0, 1440]]
        used = true
        return
      }
      if (MONTHS.test(p) || /\bday\b/.test(p)) return // dates and offsets: skipped
      // Split the weekday selector from the times ("Tu, Mo[3] off").
      const m = /^(\d{1,2}:|off\b|closed\b)/i.test(p) ? [p, '', p] : p.match(/^(.*?\S)\s+((?:\d{1,2}:|off\b|closed\b).*)$/i)
      if (!m) return
      const times = parseTimes(m[2])
      if (!times) return
      let days = [0, 1, 2, 3, 4, 5, 6]
      if (m[1]?.trim()) {
        const d = parseDays(m[1])
        if (!d) return
        days = d
      }
      for (const d of days) {
        // ";" rules replace a day's hours, ", " rules add to them.
        week[d] = pi > 0 && week[d] ? [...week[d], ...times] : times
      }
      used = true
    })
  }
  if (!used) return null
  return week.map((d) => d ?? [])
}
