// Walking underground: stations are flat floors (concourse, corridors,
// platforms) joined by sloped ramps (stairs, escalators), and exit stairs
// that start on the street. See scripts/stations.mjs for how they're built.
import type { Flat } from './map'

export interface StationFloor {
  kind: 'concourse' | 'corridor' | 'platform'
  z: number
  p: Flat
}
export interface StationRamp {
  kind: 'stairs' | 'escalator'
  /** 1 for stairs that come down from the street. */
  exit?: 1
  ax: number
  ay: number
  bx: number
  by: number
  w: number
  /** Heights at the a end and the b end. */
  za: number
  zb: number
}
export interface StationSign {
  x: number
  y: number
  z: number
  /** Facing (the board's normal), radians in map coordinates. */
  r: number
  t: string
  en: string
  c: string
  k: 'platform' | 'name' | 'gate' | 'exit'
}
export interface Station {
  id: string
  name: string
  nameEn: string
  wikidata?: string
  line: { ja: string; en: string; operator: string; operatorEn: string; ref: string; colour: string }
  x: number
  y: number
  datum: number
  floors: StationFloor[]
  ramps: StationRamp[]
  /** Rows of ticket gates: center, the direction the row runs, width. */
  gates: { x: number; y: number; ax: number; ay: number; w: number; z: number }[]
  /** Track centerlines; dx, dy: the way trains leave. */
  tracks: { ax: number; ay: number; bx: number; by: number; z: number; dx: number; dy: number; half: number }[]
  platforms: { i: number; num: string; ja: string; en: string; next: string; side: number }[]
  signs: StationSign[]
  exits: { ref: string; name: string; x: number; y: number; ux: number; uy: number; ramp: number }[]
}

/** How far up or down a step can be. */
const STEP = 0.6
/** Ramps and floors this far apart in height don't touch: it's a drop or
 *  the underside of the stairs. */
const GAP = 0.8

function inPoly(p: Flat, x: number, y: number) {
  let hit = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1]
    const yj = p[j + 1]
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) hit = !hit
  }
  return hit
}

/** Height of a ramp at a point, or null if the point isn't on it. */
export function rampZ(r: StationRamp, x: number, y: number) {
  const dx = r.bx - r.ax
  const dy = r.by - r.ay
  const len = Math.hypot(dx, dy) || 1
  const t = ((x - r.ax) * dx + (y - r.ay) * dy) / (len * len)
  const side = Math.abs((-(x - r.ax) * dy + (y - r.ay) * dx) / len)
  if (t < 0 || t > 1 || side > r.w / 2) return null
  return r.za + (r.zb - r.za) * t
}

/** One map's stations, flattened for quick walking checks. */
export class Underground {
  /** The street, as one more surface: its height where you can walk, null
   *  inside buildings. Lets you step off the top of exit stairs. */
  street: (x: number, y: number) => number | null = () => null
  floors: StationFloor[] = []
  ramps: StationRamp[] = []
  cabinets: { x0: number; y0: number; x1: number; y1: number; z: number }[] = []
  readonly stations: Station[]
  constructor(stations: Station[]) {
    this.stations = stations
    for (const s of stations) {
      this.floors.push(...s.floors)
      this.ramps.push(...s.ramps)
      // Gate cabinets: 0.25 m wide, 1.2 m deep, with 0.75 m lanes between.
      for (const g of s.gates) {
        const n = Math.floor(g.w / 1.0)
        for (let i = 0; i <= n; i++) {
          const o = -g.w / 2 + (i * g.w) / n
          const cx = g.x + g.ax * o
          const cy = g.y + g.ay * o
          const hx = g.ax ? 0.13 : 0.6
          const hy = g.ay ? 0.13 : 0.6
          this.cabinets.push({ x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy, z: g.z })
        }
      }
    }
  }

  /** Every surface under a point: [height, the ramp, or null for a floor,
   *  or 'street']. */
  private surfaces(x: number, y: number) {
    const out: [number, StationRamp | null | 'street'][] = []
    const g = this.street(x, y)
    if (g != null) out.push([g, 'street'])
    for (const f of this.floors) if (inPoly(f.p, x, y)) out.push([f.z, null])
    for (const r of this.ramps) {
      const z = rampZ(r, x, y)
      if (z != null) out.push([z, r])
    }
    return out
  }

  /** Where you'd stand here, coming from height `z`: the height, and
   *  whether it's the street. Null if there's nothing to stand on (a wall,
   *  a drop, the side of the stairs, a ticket gate). */
  standAt(x: number, y: number, z: number): { z: number; street: boolean } | null {
    const all = this.surfaces(x, y)
    // Stairs win over the floor they're cut into, so you can step onto
    // them; otherwise the surface nearest your height.
    let best: (typeof all)[number] | null = null
    const rank = (s: (typeof all)[number]) => (s[1] && s[1] !== 'street' ? 0 : 1)
    for (const s of all) {
      if (Math.abs(s[0] - z) > STEP) continue
      if (!best || rank(s) < rank(best) || (rank(s) === rank(best) && Math.abs(s[0] - z) < Math.abs(best[0] - z))) best = s
    }
    if (!best) return null
    // A floor (or the street) with a stairwell cut through it: blocked
    // where the stairs are well above or below it.
    if (!best[1] || best[1] === 'street')
      for (const s of all) if (s[1] && s[1] !== 'street' && Math.abs(s[0] - best[0]) > GAP) return null
    for (const c of this.cabinets) if (Math.abs(c.z - best[0]) < 1.5 && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return null
    return { z: best[0], street: best[1] === 'street' }
  }

  /** Like standAt, for a body of radius r: every edge point must stand too. */
  standCircle(x: number, y: number, z: number, r: number) {
    const c = this.standAt(x, y, z)
    if (!c) return null
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      if (!this.standAt(x + Math.cos(a) * r, y + Math.sin(a) * r, c.z)) return null
    }
    return c
  }

  /** True if some station floor or ramp is at about height z here (not the
   *  street): for working out where walls go. */
  hasSurface(x: number, y: number, z: number) {
    for (const f of this.floors) if (Math.abs(f.z - z) < 0.3 && inPoly(f.p, x, y)) return true
    for (const r of this.ramps) {
      const rz = rampZ(r, x, y)
      if (rz != null && Math.abs(rz - z) < GAP) return true
    }
    return false
  }

  /** On the street: the exit stairs that start here, if you're stepping
   *  onto their top. */
  exitStairsAt(x: number, y: number, ground: number) {
    for (const r of this.ramps) {
      if (!r.exit) continue
      const z = rampZ(r, x, y)
      if (z != null && Math.abs(z - ground) <= STEP) return z
    }
    return null
  }

  /** On the street: true over an exit's stairwell (you'd fall in). */
  overStairwell(x: number, y: number, ground: number) {
    for (const r of this.ramps) {
      if (!r.exit) continue
      // A little margin around the stairwell, for its walls.
      const z = rampZ({ ...r, w: r.w + 0.6 }, x, y)
      if (z != null && ground - z > STEP) return true
    }
    return false
  }

  /** The station whose space contains this point, for the HUD. */
  stationAt(x: number, y: number, z: number) {
    for (const s of this.stations) {
      for (const f of s.floors) if (Math.abs(f.z - z) < 2 && inPoly(f.p, x, y)) return s
      for (const r of s.ramps) {
        const rz = rampZ(r, x, y)
        if (rz != null && Math.abs(rz - z) < 2) return s
      }
    }
    return null
  }

  /** The nearest sign on this level within `max` meters. */
  signNear(x: number, y: number, z: number, max = 7) {
    let best: { s: StationSign; st: Station } | null = null
    let bestD = max
    for (const st of this.stations)
      for (const s of st.signs) {
        if (Math.abs(s.z - z) > 2) continue
        const d = Math.hypot(s.x - x, s.y - y)
        if (d < bestD) {
          bestD = d
          best = { s, st }
        }
      }
    return best
  }
}
