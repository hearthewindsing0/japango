import type { GameMap } from '../game/map'
import type { Underground } from '../game/station'

/** The arrival scene: the player starts at the foot of a station exit's
 *  stairs and walks up onto the street. Roppongi uses Hibiya line exit 3,
 *  the one by ALMOND and the crossing; elsewhere, the exit nearest the
 *  start. Null if the map has no stations. */
export function arrivalPath(map: GameMap, ug: Underground | null) {
  if (!ug || !map.stations?.length) return null
  let best: { st: (typeof map.stations)[number]; ex: (typeof map.stations)[number]['exits'][number]; d: number } | null = null
  for (const st of ug.stations)
    for (const ex of st.exits) {
      const preferred = st.id === 'H04' && ex.ref === '3'
      const d = preferred ? -1 : Math.hypot(ex.x - map.spawn.x, ex.y - map.spawn.y)
      if (st.ramps[ex.ramp] && (!best || d < best.d)) best = { st, ex, d }
    }
  if (!best) return null
  const r = best.st.ramps[best.ex.ramp]
  const lowIsA = r.za < r.zb
  const low = { x: lowIsA ? r.ax : r.bx, y: lowIsA ? r.ay : r.by, z: Math.min(r.za, r.zb) }
  const high = { x: lowIsA ? r.bx : r.ax, y: lowIsA ? r.by : r.ay }
  const len = Math.hypot(high.x - low.x, high.y - low.y) || 1
  const ux = (high.x - low.x) / len
  const uy = (high.y - low.y) / len
  // A few steps back from the foot of the stairs, if there's floor there.
  let start = { x: low.x + ux * 0.4, y: low.y + uy * 0.4, z: low.z }
  for (const back of [3, 2, 1]) {
    const at = ug.standCircle(low.x - ux * back, low.y - uy * back, low.z, 0.3)
    if (at) {
      start = { x: low.x - ux * back, y: low.y - uy * back, z: at.z }
      break
    }
  }
  // Up the stairs, a step out, then along the pavement toward the start
  // (ALMOND, in Roppongi).
  const out = { x: high.x + ux * 1.1, y: high.y + uy * 1.1 }
  const side = (map.spawn.x - out.x) * -uy + (map.spawn.y - out.y) * ux >= 0 ? 1 : -1
  const along = Math.min(36, Math.max(4, Math.abs((map.spawn.x - out.x) * -uy + (map.spawn.y - out.y) * ux)))
  const path: [number, number][] = [
    [low.x + ux * 0.6, low.y + uy * 0.6],
    [out.x, out.y],
    [out.x - uy * side * along, out.y + ux * side * along],
  ]
  return { start, path, ux, uy, station: best.st, exit: best.ex }
}
