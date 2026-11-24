// Walking underground: stations are flat floors (concourse, corridors,
// platforms) joined by sloped ramps (stairs, escalators), and exit stairs
// that start on the street. See scripts/stations.mjs for how they're built.
import type { Flat } from './map'
import type { Interior } from './interior'

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
  k: 'platform' | 'name' | 'gate' | 'exit' | 'info' | 'board'
  /** For a departure board ('board'): its platform's index. */
  p?: number
  /** A learning note for this sign, instead of the one for its kind. */
  n?: string
  /** Mounted on a wall (not hanging): where it's drawn, when that isn't
   *  x, y (a station name board across the tracks is read from the
   *  platform edge, where x, y put its card). */
  wall?: { x: number; y: number; z: number }
  /** For a station name board (駅名標): this station and the stations
   *  either side, `next` on the reader's right when `right` is true. */
  name?: { here: NeighborStation; next: NeighborStation | null; prev: NeighborStation | null; right: boolean }
}

export interface NeighborStation {
  ref: string
  ja: string
  kana: string
  en: string
}

/** The stations around the ones on the map, for the name boards (駅名標)
 *  on the platforms, by line letter. In line order. */
const LINES: Record<string, NeighborStation[]> = {
  H: [
    { ref: 'H03', ja: '神谷町', kana: 'かみやちょう', en: 'Kamiyachō' },
    { ref: 'H04', ja: '六本木', kana: 'ろっぽんぎ', en: 'Roppongi' },
    { ref: 'H05', ja: '広尾', kana: 'ひろお', en: 'Hiro-o' },
  ],
  E: [
    { ref: 'E22', ja: '麻布十番', kana: 'あざぶじゅうばん', en: 'Azabu-jūban' },
    { ref: 'E23', ja: '六本木', kana: 'ろっぽんぎ', en: 'Roppongi' },
    { ref: 'E24', ja: '青山一丁目', kana: 'あおやまいっちょうめ', en: 'Aoyama-itchōme' },
  ],
}
export function lineStation(lineRef: string, ja: string): NeighborStation | null {
  return LINES[lineRef[0]]?.find((x) => x.ja === ja) ?? null
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
  /** Rows of ticket gates: center, the direction the row runs, width.
   *  `solid`: a stretch of fare fence instead of gates. */
  gates: { x: number; y: number; ax: number; ay: number; w: number; z: number; solid?: 1 }[]
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
/** Stairs higher than this over a floor leave room to walk under them. */
const HEADROOM = 2.1

/** Gate cabinets and fence: boxes along a row (ax, ay), with half lengths
 *  along the row and across it. */
export function gateBoxes(g: Station['gates'][number]) {
  const out: { x: number; y: number; ax: number; ay: number; hl: number; hd: number; z: number }[] = []
  if (g.solid) out.push({ x: g.x, y: g.y, ax: g.ax, ay: g.ay, hl: g.w / 2, hd: 0.13, z: g.z })
  else {
    // 0.2 m cabinets, 1.2 m deep, with lanes between, about 1.1 m apart.
    const n = Math.max(1, Math.round(g.w / 1.1))
    for (let i = 0; i <= n; i++) {
      const o = -g.w / 2 + (i * g.w) / n
      out.push({ x: g.x + g.ax * o, y: g.y + g.ay * o, ax: g.ax, ay: g.ay, hl: 0.1, hd: 0.6, z: g.z })
    }
  }
  return out
}

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

/** A departure board (発車案内) over each platform, a little along from its
 *  middle so it doesn't sit on the station name board. Its text is live:
 *  see DepartureBoards in Stations.tsx. */
function addDepartureBoards(s: Station) {
  if (s.signs.some((g) => g.k === 'board')) return
  s.platforms.forEach((p, i) => {
    const f = s.floors[p.i]
    const t = s.tracks[i]
    if (!f || !t) return
    let cx = 0
    let cy = 0
    for (let k = 0; k < f.p.length; k += 2) (cx += f.p[k]), (cy += f.p[k + 1])
    cx /= f.p.length / 2
    cy /= f.p.length / 2
    const len = Math.hypot(t.bx - t.ax, t.by - t.ay) || 1
    const along = 14
    s.signs.push({
      x: cx + ((t.bx - t.ax) / len) * along,
      y: cy + ((t.by - t.ay) / len) * along,
      z: f.z,
      r: 0,
      t: '発車案内',
      en: 'Departures',
      c: s.line.colour,
      k: 'board',
      p: i,
    })
  })
}

/** A platform as the trains and riders see it: the track's middle and
 *  direction, `n` pointing from the track to the platform, the line of
 *  the platform edge (screen doors), how wide the platform is, and the
 *  stairs and escalators that go up from it. */
export interface PlatformFrame {
  i: number
  z: number
  mx: number
  my: number
  ux: number
  uy: number
  nx: number
  ny: number
  half: number
  /** Platform edge: the track's middle plus n times this. */
  edge: number
  /** From the edge to the back of the platform. */
  width: number
  /** Where the door openings in the screen doors are, along the track
   *  from its middle. */
  doors: number[]
  /** Ways up: the foot (on the platform) and the top of each ramp. */
  ups: { fx: number; fy: number; tx: number; ty: number; tz: number; along: number; ramp: StationRamp }[]
}

export const EDGE = 1.75
/** Screen doors: 2.6 m panels every 4 m, the openings between them. */
export function doorOpenings(half: number) {
  const out: number[] = []
  for (let a = -half; a < half - 0.5; a += 4) {
    const o = a + 2.6 + 0.7
    if (o < half - 0.3) out.push(o)
  }
  return out
}

function centroid(p: Flat) {
  let cx = 0
  let cy = 0
  for (let k = 0; k < p.length; k += 2) (cx += p[k]), (cy += p[k + 1])
  return [cx / (p.length / 2), cy / (p.length / 2)]
}

const frames = new WeakMap<Station, PlatformFrame[]>()
export function platformFrames(s: Station): PlatformFrame[] {
  const hit = frames.get(s)
  if (hit) return hit
  const out: PlatformFrame[] = []
  s.tracks.forEach((t, i) => {
    const f = s.floors[s.platforms[i]?.i ?? -1]
    if (!f) return
    const len = Math.hypot(t.bx - t.ax, t.by - t.ay) || 1
    const ux = (t.bx - t.ax) / len
    const uy = (t.by - t.ay) / len
    const mx = (t.ax + t.bx) / 2
    const my = (t.ay + t.by) / 2
    const [cx, cy] = centroid(f.p)
    const side = Math.sign(-uy * (cx - mx) + ux * (cy - my)) || 1
    const nx = -uy * side
    const ny = ux * side
    let width = 2
    for (let k = 0; k < f.p.length; k += 2) width = Math.max(width, (f.p[k] - mx) * nx + (f.p[k + 1] - my) * ny - EDGE)
    const ups: PlatformFrame['ups'] = []
    for (const r of s.ramps) {
      const lowA = r.za <= r.zb
      const lz = Math.min(r.za, r.zb)
      if (Math.abs(lz - f.z) > 0.4) continue
      const lx = lowA ? r.ax : r.bx
      const ly = lowA ? r.ay : r.by
      const hx = lowA ? r.bx : r.ax
      const hy = lowA ? r.by : r.ay
      const rl = Math.hypot(hx - lx, hy - ly) || 1
      // A step off the bottom, onto the platform.
      const fx = lx - ((hx - lx) / rl) * 0.8
      const fy = ly - ((hy - ly) / rl) * 0.8
      if (!inPoly(f.p, fx, fy) && !inPoly(f.p, lx, ly)) continue
      ups.push({ fx, fy, tx: hx, ty: hy, tz: Math.max(r.za, r.zb), along: (fx - mx) * ux + (fy - my) * uy, ramp: r })
    }
    out.push({ i, z: t.z, mx, my, ux, uy, nx, ny, half: t.half, edge: EDGE, width: Math.min(width, 12), doors: doorOpenings(t.half), ups })
  })
  frames.set(s, out)
  return out
}

/** Station name boards (駅名標) on the wall across the tracks from each
 *  platform, facing it, with the next and previous stations and arrows
 *  the way this platform's trains go. They replace the plain name signs
 *  from the map build. */
function addNameBoards(s: Station, ug: Underground) {
  if (s.signs.some((g) => g.k === 'name' && g.name)) return
  const here = lineStation(s.line.ref, s.name) ?? { ref: s.line.ref, ja: s.name, kana: '', en: s.nameEn }
  const fr = platformFrames(s)
  if (!fr.length) return
  s.signs = s.signs.filter((g) => g.k !== 'name')
  for (const f of fr) {
    const p = s.platforms[f.i]
    const other = s.platforms.find((o) => o !== p)
    const next = p?.next ? lineStation(s.line.ref, p.next) : null
    const prev = other?.next ? lineStation(s.line.ref, other.next) : null
    // Across the track: the trench's far wall, or, where another track
    // runs alongside with no wall between (the same test the station
    // drawing uses), past it and its platform to that platform's back wall.
    const shared = s.tracks.some((o, j) => j !== f.i && Math.abs(o.z - f.z) < 0.5 && Math.hypot((o.ax + o.bx) / 2 - (f.mx - f.nx * 4.4), (o.ay + o.by) / 2 - (f.my - f.ny * 4.4)) < 3)
    let across = 2.1
    let seen = false
    if (shared)
      for (let d = 2.5; d < 30; d += 0.25) {
        const on = ug.hasSurface(f.mx - f.nx * d, f.my - f.ny * d, f.z)
        if (on) seen = true
        else if (seen) {
          across = d
          break
        }
      }
    // Just in front of the wall's face (walls are 0.25 m thick, on the
    // line; the scan steps a quarter meter past the far platform's edge).
    const face = seen ? across - 0.45 : across - 0.2
    // Facing the platform, the reader looks along -n; their right is
    // (ny, -nx) in map terms. Trains leave the way the track's dx, dy go.
    const t = s.tracks[f.i]
    const right = f.ny * t.dx - f.nx * t.dy > 0
    for (let a = -f.half + 18; a <= f.half - 18; a += 28) {
      s.signs.push({
        x: f.mx + f.ux * a + f.nx * (f.edge + 1),
        y: f.my + f.uy * a + f.ny * (f.edge + 1),
        z: f.z,
        r: Math.atan2(f.nx, f.ny),
        t: `${here.ja}　次は ${next?.ja ?? ''}`,
        en: `${here.en} (${here.ref}). Next: ${next ? `${next.en} (${next.ref})` : '-'}${prev ? `. Previous: ${prev.en} (${prev.ref})` : ''}`,
        c: s.line.colour,
        k: 'name',
        wall: { x: f.mx + f.ux * a - f.nx * face, y: f.my + f.uy * a - f.ny * face, z: f.z },
        name: { here, next, prev, right },
        n: `駅名標 (えきめいひょう), the station name board. ${here.ref} is the station number: ${here.ref[0]} for the ${s.line.en}, stop ${Number(here.ref.slice(1))}. 次 (つぎ) means next and 前 (まえ) before: the arrow shows the way this platform's trains go.`,
      })
    }
  }
}

/** One map's stations and walk-in places (a basement bar), flattened for
 *  quick walking checks. */
export class Underground {
  /** The street, as one more surface: its height where you can walk, null
   *  inside buildings. Lets you step off the top of exit stairs. */
  street: (x: number, y: number) => number | null = () => null
  floors: StationFloor[] = []
  ramps: StationRamp[] = []
  cabinets: ReturnType<typeof gateBoxes> = []
  readonly stations: Station[]
  readonly interiors: Interior[]
  constructor(stations: Station[], interiors: Interior[] = []) {
    this.stations = stations
    this.interiors = interiors
    for (const s of stations) {
      this.floors.push(...s.floors)
      this.ramps.push(...s.ramps)
      for (const g of s.gates) this.cabinets.push(...gateBoxes(g))
      addDepartureBoards(s)
    }
    for (const s of stations) addNameBoards(s, this)
    for (const it of interiors) {
      this.floors.push(...it.floors)
      this.ramps.push(...it.ramps)
      this.cabinets.push(...it.blocks)
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
    // where the stairs go down through it, or pass too low overhead.
    if (!best[1] || best[1] === 'street')
      for (const s of all) {
        if (!s[1] || s[1] === 'street') continue
        const dz = s[0] - best[0]
        if (dz < -GAP || (dz > GAP && dz < HEADROOM)) return null
      }
    for (const c of this.cabinets) {
      if (Math.abs(c.z - best[0]) > 1.5) continue
      const dx = x - c.x
      const dy = y - c.y
      if (Math.abs(dx * c.ax + dy * c.ay) <= c.hl && Math.abs(-dx * c.ay + dy * c.ax) <= c.hd) return null
    }
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

  /** Inside a platform hall at height z: over a floor, or over a track
 *  at that level (for keeping the camera in the room). */
  inHall(x: number, y: number, z: number) {
    if (this.hasSurface(x, y, z)) return true
    for (const s of this.stations)
      for (const t of s.tracks) {
        if (Math.abs(t.z - z) > 0.5) continue
        const dx = t.bx - t.ax
        const dy = t.by - t.ay
        const len = Math.hypot(dx, dy) || 1
        const along = ((x - t.ax) * dx + (y - t.ay) * dy) / len
        if (along < 0 || along > len) continue
        if (Math.abs(((x - t.ax) * dy - (y - t.ay) * dx) / len) < 1.9) return true
      }
    return false
  }

  /** The platform you're standing on, if any: for the low camera. */
  platformAt(x: number, y: number, z: number) {
    for (const s of this.stations)
      for (const f of platformFrames(s)) {
        if (Math.abs(f.z - z) > 0.5) continue
        const fl = s.floors[s.platforms[f.i].i]
        if (fl && inPoly(fl.p, x, y)) return { station: s, frame: f }
      }
    return null
  }

  /** The walk-in place whose space contains this point, for the HUD. */
  interiorAt(x: number, y: number, z: number) {
    for (const it of this.interiors) {
      for (const f of it.floors) if (Math.abs(f.z - z) < 2 && inPoly(f.p, x, y)) return it
      for (const r of it.ramps) {
        const rz = rampZ(r, x, y)
        if (rz != null && Math.abs(rz - z) < 2) return it
      }
    }
    return null
  }

  /** The nearest sign on this level within `max` meters. */
  signNear(x: number, y: number, z: number, max = 7) {
    let best: { s: StationSign; st: Station | Interior } | null = null
    let bestD = max
    for (const st of [...this.stations, ...this.interiors])
      for (const s of st.signs) {
        if (Math.abs(s.z - z) > 2) continue
        const d = Math.hypot(s.x - x, s.y - y)
        // A room's signs are close together: only the one you're by.
        if (s.k === 'info' && d > 2.5) continue
        // Name boards repeat along the platform: only the one you're by.
        if (s.k === 'name' && d > 3.5) continue
        if (d < bestD) {
          bestD = d
          best = { s, st }
        }
      }
    return best
  }
}
