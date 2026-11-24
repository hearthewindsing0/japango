// Cars on the streets: a road network built from the loaded map tiles, and
// a simple traffic simulation on it. Cars keep to the left (Japan), follow
// one-way streets, keep their distance, stop at red lights (OpenStreetMap's
// traffic signals) and for the player, and turn at junctions. Only the
// streets around the player are simulated; cars that drive out of range are
// brought back somewhere else out of sight.
import { groundAt, tileGroundAt, type Flat, type GameMap, type MapTile } from './map'
import { tokyoMinute } from './life'
import { signalState } from './signals'
import { vehicleLength, vehiclePaints, type VehicleKind } from './vehicles'

export { signalState }

type RoadClass = 'main' | 'mid' | 'minor' | 'expressway'

export interface Way {
  idx: number
  /** Flat x, y points along the center line. */
  p: Flat
  /** Height of each point if it's off the ground (viaduct, bridge). */
  z: number[] | null
  len: number[]
  total: number
  /** 0: both ways, 1: along the points only. */
  oneway: boolean
  lanes: number // per direction
  laneW: number
  vmax: number // m/s
  cls: RoadClass
  /** Stop lines: distance along the way and the travel direction they're for. */
  stops: { d: number; dir: 1 | -1; axis: 0 | 1 }[]
  /** Crosswalks across it, as distances along it: cars don't wait on them. */
  zebras: number[]
}

interface Link {
  way: Way
  i: number // point index
}

export interface Network {
  ways: Way[]
  /** Ways meeting at each point, by point key. */
  at: Map<string, Link[]>
  /** Signature of each way, to keep cars on their road when tiles change. */
  sig: Map<string, Way>
}

export interface Car {
  kind: VehicleKind
  color: string
  len: number
  way: Way
  dir: 1 | -1
  lane: number
  d: number
  v: number
  vmax: number
  /** The way to take at the end of this one, chosen ahead. */
  next: { way: Way; dir: 1 | -1; d: number } | null
  /** Where it's drawn: the lane offset eases in after a turn. */
  x: number
  y: number
  z: number
  ox: number
  oy: number
  heading: number
  slot: number
  /** Seconds left of a stop at a bus stop or to let someone out. */
  hold: number
  /** Distance driven, and how far it may go before minding lights again:
   *  once through a light, it doesn't stop at the other lights of the
   *  same junction. */
  odo: number
  clearTo: number
  /** What it's waiting for, when stopped (for debugging). */
  why?: string
}

const key = (x: number, y: number) => `${Math.round(x * 10)},${Math.round(y * 10)}`

const CLASS: Record<string, RoadClass> = {
  trunk: 'main',
  trunk_link: 'main',
  primary: 'main',
  primary_link: 'main',
  secondary: 'main',
  secondary_link: 'main',
  tertiary: 'mid',
  tertiary_link: 'mid',
  unclassified: 'minor',
  residential: 'minor',
}
/** Default speed limits, km/h. */
const LIMIT: Record<RoadClass, number> = { main: 50, mid: 40, minor: 30, expressway: 60 }
/** Cars per meter of lane at the busiest hour. */
const DENSITY: Record<RoadClass, number> = { main: 1 / 40, mid: 1 / 70, minor: 1 / 180, expressway: 1 / 50 }

/** Share of the traffic out at a given Tokyo hour, 0..1. Roppongi never
 *  quite empties: taxis run all night. */
export function trafficLevel(hour: number) {
  const curve = [0.55, 0.45, 0.38, 0.3, 0.25, 0.3, 0.5, 0.8, 1, 0.9, 0.82, 0.82, 0.85, 0.82, 0.8, 0.82, 0.88, 1, 0.95, 0.85, 0.75, 0.72, 0.7, 0.62]
  return curve[Math.max(0, Math.min(23, Math.floor(hour)))]
}

function cumulative(p: Flat) {
  const len = [0]
  for (let i = 2; i < p.length; i += 2) len.push(len[len.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]))
  return len
}

function inRing(ring: Flat, stride: number, x: number, y: number) {
  let inside = false
  const n = ring.length / stride
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * stride]
    const yi = ring[i * stride + 1]
    const xj = ring[j * stride]
    const yj = ring[j * stride + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

type Road = MapTile['roads'][number]

/** Lanes of a road: per direction, or in all on a one-way street. */
export function laneSetup(r: Road) {
  const oneway = !!r.o
  const total = r.l ?? Math.max(oneway ? 1 : 2, Math.round(r.w / 3.2))
  const lanes = oneway ? Math.max(1, total) : Math.max(1, Math.floor(total / 2))
  const laneW = Math.min(3.4, (oneway ? r.w : r.w / 2) / lanes)
  return { oneway, lanes, laneW }
}

/** Painted lines between the lanes cars drive in: the middle of a two-way
 *  road and the lines between lanes, as offset copies of its center line. */
export function laneLines(roads: Road[]) {
  const out: Flat[] = []
  for (const r of roads) {
    if (!CLASS[r.t] || r.w < 6 || r.p.length < 4) continue
    const { oneway, lanes, laneW } = laneSetup(r)
    const offs: number[] = []
    if (oneway) for (let k = 1; k < lanes; k++) offs.push((k - lanes / 2) * laneW)
    else for (let k = -(lanes - 1); k < lanes; k++) offs.push(k * laneW)
    for (const off of offs) out.push(offsetLine(r.p, off))
  }
  return out
}

/** Lines with the parts over crosswalks taken out. */
export function cutAtZebras(lines: Flat[], zebras: { p: Flat; w: number }[]) {
  const segs: number[][] = []
  for (const z of zebras) for (let i = 0; i + 3 < z.p.length; i += 2) segs.push([z.p[i], z.p[i + 1], z.p[i + 2], z.p[i + 3], z.w / 2 + 0.4])
  const onZebra = (x: number, y: number) => {
    for (const [ax, ay, bx, by, half] of segs) {
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9)))
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < half) return true
    }
    return false
  }
  const out: Flat[] = []
  for (const l of lines) {
    let run: number[] = []
    const flush = () => {
      if (run.length >= 4) out.push(run)
      run = []
    }
    // Walk each segment in half-meter steps, but keep only the points
    // where the line goes on or off a crosswalk, and the corners.
    for (let i = 0; i + 3 < l.length; i += 2) {
      const n = Math.max(1, Math.ceil(Math.hypot(l[i + 2] - l[i], l[i + 3] - l[i + 1]) / 0.5))
      let prevOn = true
      for (let k = 0; k <= n; k++) {
        const x = l[i] + ((l[i + 2] - l[i]) * k) / n
        const y = l[i + 1] + ((l[i + 3] - l[i + 1]) * k) / n
        const on = onZebra(x, y)
        if (on) {
          if (!prevOn) {
            run.push(x, y)
            flush()
          }
        } else if (prevOn || k === n) {
          if (k > 0 || !run.length) run.push(x, y)
        }
        prevOn = on
      }
    }
    flush()
  }
  return out
}

function offsetLine(p: Flat, off: number) {
  if (!off) return p
  const out: number[] = []
  const n = p.length / 2
  for (let i = 0; i < n; i++) {
    // Average of the normals of the segments either side.
    let nx = 0
    let ny = 0
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= n - 1) continue
      const dx = p[j * 2 + 2] - p[j * 2]
      const dy = p[j * 2 + 3] - p[j * 2 + 1]
      const l = Math.hypot(dx, dy) || 1
      nx += dy / l
      ny += -dx / l
    }
    const l = Math.hypot(nx, ny) || 1
    out.push(p[i * 2] + (nx / l) * off, p[i * 2 + 1] + (ny / l) * off)
  }
  return out
}

/** Point and unit direction at distance d along a way. */
export function pointAt(w: Way, d: number) {
  let k = 1
  while (k < w.len.length - 1 && w.len[k] < d) k++
  const a = (k - 1) * 2
  const seg = w.len[k] - w.len[k - 1] || 1
  const f = Math.max(0, Math.min(1, (d - w.len[k - 1]) / seg))
  const tx = (w.p[a + 2] - w.p[a]) / seg
  const ty = (w.p[a + 3] - w.p[a + 1]) / seg
  const z = w.z ? w.z[k - 1] + (w.z[k] - w.z[k - 1]) * f : null
  return { x: w.p[a] + (w.p[a + 2] - w.p[a]) * f, y: w.p[a + 1] + (w.p[a + 3] - w.p[a + 1]) * f, tx, ty, z }
}

/** The road network of the loaded tiles. Roads cut across several tiles
 *  are in each of them; they're counted once. */
export function buildNetwork(tiles: MapTile[], old: Network | null): Network {
  const ways: Way[] = []
  const at = new Map<string, Link[]>()
  const sig = new Map<string, Way>()
  const add = (w: Omit<Way, 'idx'>, s: string) => {
    if (sig.has(s)) return
    // Reuse the old object for a road we already had, so cars on it stay.
    const prev = old?.sig.get(s)
    const way = prev ?? { ...w, idx: 0 }
    way.idx = ways.length
    ways.push(way)
    sig.set(s, way)
    for (let i = 0; i < way.p.length; i += 2) {
      const k = key(way.p[i], way.p[i + 1])
      const list = at.get(k)
      if (list) list.push({ way, i: i / 2 })
      else at.set(k, [{ way, i: i / 2 }])
    }
  }
  const bridges = tiles.flatMap((t) => t.bridges)
  // Crosswalks, to put stop lines just before them.
  const crossings: number[] = []
  for (const t of tiles) for (const c of t.paths) if (c.t === 'crossing') for (let i = 0; i + 3 < c.p.length; i += 2) crossings.push(c.p[i], c.p[i + 1], c.p[i + 2], c.p[i + 3])

  for (const tile of tiles) {
    for (const r of tile.roads) {
      const cls = CLASS[r.t]
      if (!cls || r.p.length < 4) continue
      const s = 'r' + r.p.join(',')
      if (sig.has(s)) continue
      // One-way against the points: turn it around.
      let p = r.p
      let sg = r.sg ?? []
      if (r.o === -1) {
        const n = p.length / 2
        const q: number[] = []
        for (let i = n - 1; i >= 0; i--) q.push(p[i * 2], p[i * 2 + 1])
        p = q
        sg = sg.map((i) => n - 1 - i)
      }
      const { oneway, lanes, laneW } = laneSetup(r)
      // Bridges: the deck's height from the bridge surface under each point.
      let z: number[] | null = null
      if (r.b) {
        z = []
        for (let i = 0; i < p.length; i += 2) {
          let h = tileGroundAt(tile, p[i], p[i + 1])
          for (const ring of bridges)
            if (inRing(ring, 3, p[i], p[i + 1])) {
              let best = Infinity
              for (let j = 0; j < ring.length; j += 3) {
                const dd = Math.hypot(ring[j] - p[i], ring[j + 1] - p[i + 1])
                if (dd < best) {
                  best = dd
                  h = Math.max(h, ring[j + 2])
                }
              }
            }
          z.push(h)
        }
      }
      const len = cumulative(p)
      const way: Omit<Way, 'idx'> = {
        p,
        z,
        len,
        total: len[len.length - 1],
        oneway,
        lanes,
        laneW,
        vmax: ((r.v ?? LIMIT[cls]) / 3.6) * 1.05,
        cls,
        stops: [],
        zebras: [],
      }
      // Crosswalks across it (near its bounding box).
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (let i = 0; i < p.length; i += 2) {
        x0 = Math.min(x0, p[i])
        x1 = Math.max(x1, p[i])
        y0 = Math.min(y0, p[i + 1])
        y1 = Math.max(y1, p[i + 1])
      }
      for (let c = 0; c < crossings.length; c += 4) {
        if (Math.max(crossings[c], crossings[c + 2]) < x0 - 1 || Math.min(crossings[c], crossings[c + 2]) > x1 + 1) continue
        if (Math.max(crossings[c + 1], crossings[c + 3]) < y0 - 1 || Math.min(crossings[c + 1], crossings[c + 3]) > y1 + 1) continue
        const hit = crossAlong(way as Way, crossings[c], crossings[c + 1], crossings[c + 2], crossings[c + 3])
        if (hit !== null && !way.zebras.some((z) => Math.abs(z - hit) < 2)) way.zebras.push(hit)
      }
      way.zebras.sort((a, b) => a - b)
      // Stop lines at the traffic lights: before the last crosswalk ahead
      // of the light, or at the light itself.
      for (const i of sg) {
        const ds = len[i]
        const tx = p[Math.min(i * 2 + 2, p.length - 2)] - p[Math.max(i * 2 - 2, 0)]
        const ty = p[Math.min(i * 2 + 3, p.length - 1)] - p[Math.max(i * 2 - 1, 1)]
        const axis: 0 | 1 = Math.abs(tx) >= Math.abs(ty) ? 0 : 1
        for (const dir of oneway ? ([1] as const) : ([1, -1] as const)) {
          let stop = ds - 2 * dir
          // Crosswalks across this way within 30 m before the light.
          for (const hit of way.zebras) {
            const before = (ds - hit) * dir
            if (before >= -2 && before <= 30 && (hit - 3 * dir - stop) * dir < 0) stop = hit - 3 * dir
          }
          way.stops.push({ d: stop, dir, axis })
        }
      }
      add(way, s)
    }
    // The Shuto Expressway: one way per carriageway, in point order.
    for (const v of tile.viaducts) {
      if (v.p.length < 6) continue
      const s = 'v' + v.p.join(',')
      if (sig.has(s)) continue
      const p: number[] = []
      const z: number[] = []
      for (let i = 0; i < v.p.length; i += 3) {
        p.push(v.p[i], v.p[i + 1])
        z.push(v.p[i + 2])
      }
      const lanes = Math.max(1, Math.round((v.w - 1.5) / 3.5))
      const len = cumulative(p)
      add({ p, z, len, total: len[len.length - 1], oneway: true, lanes, laneW: 3.3, vmax: (LIMIT.expressway / 3.6) * 1.1, cls: 'expressway', stops: [], zebras: [] }, s)
    }
  }
  for (const w of ways) w.stops.sort((a, b) => a.d - b.d)
  return { ways, at, sig }
}

/** Where a crosswalk segment crosses a way's center line, as a distance
 *  along the way, or null. */
function crossAlong(w: Way, ax: number, ay: number, bx: number, by: number) {
  for (let i = 0; i + 3 < w.p.length; i += 2) {
    const cx = w.p[i]
    const cy = w.p[i + 1]
    const dx = w.p[i + 2] - cx
    const dy = w.p[i + 3] - cy
    const ex = bx - ax
    const ey = by - ay
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((ax - cx) * ey - (ay - cy) * ex) / den
    const u = ((ax - cx) * dy - (ay - cy) * dx) / den
    if (t >= 0 && t <= 1 && u >= -0.2 && u <= 1.2) return w.len[i / 2] + t * Math.hypot(dx, dy)
  }
  return null
}

function pickKind(cls: RoadClass, hour: number, rand: () => number): VehicleKind {
  // More taxis at night, delivery vans in the daytime.
  const night = hour >= 22 || hour < 5
  const mix: [VehicleKind, number][] =
    cls === 'expressway'
      ? [['sedan', 34], ['taxi', 12], ['kei', 4], ['van', 16], ['truck', 26], ['bus', 3]]
      : cls === 'minor'
        ? [['sedan', 24], ['taxi', night ? 30 : 14], ['kei', 30], ['van', night ? 4 : 18], ['truck', 2], ['bus', 0]]
        : [['sedan', 26], ['taxi', night ? 52 : 30], ['kei', 9], ['van', night ? 5 : 13], ['truck', night ? 3 : 8], ['bus', cls === 'main' ? 5 : 1]]
  let total = 0
  for (const [, w] of mix) total += w
  let r = rand() * total
  for (const [k, w] of mix) {
    if ((r -= w) <= 0) return k
  }
  return 'sedan'
}

/** People out on a zebra right now (LifePeople.tsx fills it): cars stop
 *  for them as they do for the player. */
export const streetPeople: { x: number; y: number }[] = []

/** What the cars near the player are doing, for the street sounds. */
export interface Nearby {
  x: number
  y: number
  v: number
  kind: VehicleKind
  dist: number
}
export const trafficSound = {
  /** The closest moving cars, nearest first, refreshed each frame. */
  near: [] as Nearby[],
  /** How busy the street is around the player, 0..1. */
  busy: 0,
}

const SLOTS = 240
const MAX_CARS = 420

export class Traffic {
  net: Network | null = null
  cars: Car[] = []
  /** Free instance slots per kind. */
  private free = new Map<VehicleKind, number[]>()
  private seed = 987654321
  time = 0
  private range: { w: Way; weight: number }[] = []
  private rangeWeight = 0
  private nextCount = 0
  private countedNet: Network | null = null
  private target = 0
  rand = () => ((this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0) / 4294967296)

  constructor() {
    for (const k of ['sedan', 'taxi', 'kei', 'van', 'truck', 'bus'] as VehicleKind[]) this.free.set(k, Array.from({ length: SLOTS }, (_, i) => SLOTS - 1 - i))
  }

  static slots = SLOTS

  setNetwork(net: Network) {
    this.net = net
    // Cars on roads that went away (their tile unloaded) go too.
    const live = new Set(net.ways)
    this.cars = this.cars.filter((c) => {
      if (live.has(c.way)) {
        if (c.next && !live.has(c.next.way)) c.next = null
        return true
      }
      this.release(c)
      return false
    })
  }

  private release(c: Car) {
    this.free.get(c.kind)!.push(c.slot)
  }

  /** Puts a new car somewhere between minDist and maxDist from (px, py). */
  private spawn(px: number, py: number, minDist: number, maxDist: number, hour: number) {
    const cand = this.range
    const total = this.rangeWeight
    if (!cand.length) return false
    // Pick a road by how much traffic it carries.
    for (let attempt = 0; attempt < 24; attempt++) {
      let r = this.rand() * total
      let w = cand[0].w
      for (const c of cand) if ((r -= c.weight) <= 0) {
        w = c.w
        break
      }
      const d = this.rand() * w.total
      const pt = pointAt(w, d)
      const dist = Math.hypot(pt.x - px, pt.y - py)
      if (dist < minDist || dist > maxDist) continue
      const dir: 1 | -1 = w.oneway || this.rand() < 0.5 ? 1 : -1
      const lane = Math.floor(this.rand() * w.lanes)
      // Not on top of another car.
      if (this.cars.some((c) => c.way === w && c.dir === dir && c.lane === lane && Math.abs(c.d - d) < 12)) continue
      let kind = pickKind(w.cls, hour, this.rand)
      if (kind === 'bus' && w.lanes < 2 && w.cls !== 'main') kind = 'sedan'
      const slot = this.free.get(kind)!.pop()
      if (slot === undefined) return false
      const paints = vehiclePaints(kind)
      const vmax = w.vmax * (kind === 'bus' || kind === 'truck' ? 0.85 : 0.88 + this.rand() * 0.2)
      const car: Car = {
        kind,
        color: paints[Math.floor(this.rand() * paints.length)],
        len: vehicleLength(kind),
        way: w,
        dir,
        lane,
        d,
        v: vmax * 0.7,
        vmax,
        next: null,
        x: pt.x,
        y: pt.y,
        z: 0,
        ox: 0,
        oy: 0,
        heading: Math.atan2(pt.tx * dir, pt.ty * dir),
        slot,
        hold: 0,
        odo: 0,
        clearTo: 0,
      }
      const o = this.offset(w, dir, lane, pt.tx, pt.ty)
      car.ox = o.x
      car.oy = o.y
      car.x = pt.x + o.x
      car.y = pt.y + o.y
      this.cars.push(car)
      return true
    }
    return false
  }

  /** Lane offset from the center line, keeping left. */
  private offset(w: Way, dir: 1 | -1, lane: number, tx: number, ty: number) {
    // Left of the direction of travel, in map coordinates (y points south).
    const lx = ty * dir
    const ly = -tx * dir
    const off = w.oneway ? (lane - (w.lanes - 1) / 2) * w.laneW : (lane + 0.5) * w.laneW
    // Outer lanes are on the left: lane 0 is nearest the middle.
    return { x: lx * off, y: ly * off }
  }

  /** Where to go at the end of a way: straight on if possible, sometimes
   *  a turn. Null at a dead end or the edge of the loaded map. */
  private chooseNext(c: Car) {
    const net = this.net!
    const w = c.way
    const endI = c.dir > 0 ? w.p.length / 2 - 1 : 0
    const ex = w.p[endI * 2]
    const ey = w.p[endI * 2 + 1]
    const end = pointAt(w, c.dir > 0 ? w.total : 0)
    const hx = end.tx * c.dir
    const hy = end.ty * c.dir
    const opts: { way: Way; dir: 1 | -1; d: number; weight: number }[] = []
    for (const l of net.at.get(key(ex, ey)) ?? []) {
      if (l.way === w) continue
      const n = l.way.p.length / 2
      for (const dir of [1, -1] as const) {
        if (dir === 1 && l.i >= n - 1) continue
        if (dir === -1 && (l.i === 0 || l.way.oneway)) continue
        const d = l.way.len[l.i]
        const pt = pointAt(l.way, dir > 0 ? Math.min(d + 1, l.way.total) : Math.max(d - 1, 0))
        const tx = pt.tx * dir
        const ty = pt.ty * dir
        const cos = hx * tx + hy * ty
        if (cos < -0.5) continue // no U-turns
        // Mostly straight on, and onto the bigger road.
        let weight = cos > 0.85 ? 6 : 1
        if (l.way.cls === 'minor' && w.cls !== 'minor') weight *= 0.25
        if ((l.way.cls === 'expressway') !== (w.cls === 'expressway')) weight *= 0.3
        opts.push({ way: l.way, dir, d, weight })
      }
    }
    if (!opts.length) return null
    let total = 0
    for (const o of opts) total += o.weight
    let r = this.rand() * total
    for (const o of opts) if ((r -= o.weight) <= 0) return { way: o.way, dir: o.dir, d: o.d }
    return opts[0]
  }

  /** One step of the simulation. player: where the player is, or null
   *  underground. */
  step(dtRaw: number, map: GameMap, px: number, py: number, playerOnStreet: boolean, hour: number, radius: number) {
    const dt = Math.min(dtRaw, 0.1)
    this.time += dt
    const net = this.net
    if (!net) return
    // The lights run on the Tokyo clock, shared with the people crossing.
    const clock = tokyoMinute(new Date()) * 60
    const minSpawn = radius * 0.6

    // How many cars the streets in range should hold right now, worked out
    // once a second.
    if (this.time >= this.nextCount || net !== this.countedNet) {
      this.nextCount = this.time + 1
      this.countedNet = net
      this.range = []
      this.rangeWeight = 0
      for (const w of net.ways) {
        // Ways that come within range, by their points.
        let near = false
        for (let i = 0; i < w.p.length && !near; i += 2) near = Math.hypot(w.p[i] - px, w.p[i + 1] - py) < radius
        if (!near) continue
        const weight = w.total * w.lanes * (w.oneway ? 1 : 2) * DENSITY[w.cls]
        this.range.push({ w, weight })
        this.rangeWeight += weight
      }
      // Ways at the edge reach out of range: count about 3/4 of them.
      this.target = Math.min(MAX_CARS, Math.round(this.rangeWeight * 0.75 * trafficLevel(hour)))
    }
    const target = this.target
    if (!this.cars.length) {
      // First fill: anywhere in range, even in sight.
      for (let i = 0; i < target; i++) this.spawn(px, py, 0, radius, hour)
    } else if (this.cars.length < target) {
      for (let i = 0; i < 3 && this.cars.length < target; i++) if (!this.spawn(px, py, minSpawn, radius, hour)) break
    }

    // Cars in each lane, front first, to keep a distance.
    const lanes = new Map<string, Car[]>()
    const laneKey = (w: Way, dir: number, lane: number) => `${w.idx}:${dir}:${lane}`
    const prog = (c: Car) => (c.dir > 0 ? c.d : c.way.total - c.d)
    for (const c of this.cars) {
      const k = laneKey(c.way, c.dir, c.lane)
      const l = lanes.get(k)
      if (l) l.push(c)
      else lanes.set(k, [c])
    }
    for (const l of lanes.values()) l.sort((a, b) => prog(b) - prog(a))

    const remove = new Set<Car>()
    for (const c of this.cars) {
      const w = c.way
      const p = prog(c)
      const left = w.total - p
      // The closest thing ahead to stop behind, as a distance from the
      // car's front.
      let free = Infinity
      c.why = ""
      // The car in front.
      const lane = lanes.get(laneKey(w, c.dir, c.lane))!
      const me = lane.indexOf(c)
      if (me > 0) {
        const lead = lane[me - 1]
        free = prog(lead) - p - (lead.len + c.len) / 2
        c.why = 'lead'
        // Don't end up waiting on a crosswalk: if there's no room past it,
        // wait before it.
        const front = c.d + (c.dir * c.len) / 2
        const rear = lead.d - (lead.dir * lead.len) / 2
        for (const z of w.zebras) {
          const toZ = (z - front) * c.dir - 2.5
          if (toZ < 0 || toZ > free) continue
          if ((rear - z) * c.dir < 2.5 + c.len + 1.5) free = Math.min(free, toZ)
          break
        }
      } else {
        if (!c.next && left < 60) c.next = this.chooseNext(c)
        if (c.next) {
          const n = c.next
          const nl = lanes.get(laneKey(n.way, n.dir, Math.min(c.lane, n.way.lanes - 1)))
          const last = nl?.[nl.length - 1]
          if (last && last !== c) {
            const lp = n.dir > 0 ? last.d - n.d : n.d - last.d
            if (lp > -2) {
              free = left + lp - (last.len + c.len) / 2
              c.why = 'next'
            }
          }
        }
      }
      // Red lights.
      for (const s of w.stops) {
        if (s.dir !== c.dir || c.odo < c.clearTo) continue
        const ahead = (s.d - c.d) * c.dir - c.len / 2
        if (ahead < -0.5 || ahead > 60) continue
        const pt = pointAt(w, s.d)
        const st = signalState(clock, s.axis, pt.x)
        // Going through on green: clear of the junction's other lights.
        if (ahead < 2 && (st === 0 || (st === 1 && c.v > 3))) {
          c.clearTo = c.odo + ahead + c.len + 45
          continue
        }
        // On amber, stop only if there's room to.
        if ((st === 2 || (st === 1 && ahead > (c.v * c.v) / 8)) && ahead < free) {
          free = ahead
          c.why = 'light'
        }
      }
      // The player, if they're standing in the road.
      const here = pointAt(w, c.d)
      const fx = here.tx * c.dir
      const fy = here.ty * c.dir
      const yieldTo = (qx: number, qy: number, width: number, why: string) => {
        const rx = qx - c.x
        const ry = qy - c.y
        const along = rx * fx + ry * fy
        const side = Math.abs(rx * fy - ry * fx)
        if (along > 0 && along < 25 && side < width && along - c.len / 2 - 1.5 < free) {
          free = along - c.len / 2 - 1.5
          c.why = why
        }
      }
      if (playerOnStreet) yieldTo(px, py, 1.7, 'player')
      // People on a zebra: a driver stops for them anywhere on it, not only
      // in their own lane.
      for (const q of streetPeople) if (Math.abs(q.x - c.x) < 26 && Math.abs(q.y - c.y) < 26) yieldTo(q.x, q.y, 4, 'walker')
      // Speed: as fast as the road allows, slowing to stop ~2 m short.
      const room = free - 2
      const safe = room <= 0 ? 0 : Math.sqrt(2 * 4 * room)
      const want = Math.min(c.vmax, safe)
      if (want > c.v) c.v = Math.min(want, c.v + 2.8 * dt)
      else c.v = Math.max(want, c.v - 7 * dt)
      if (room <= 0) c.v = 0
      c.d += c.v * dt * c.dir
      c.odo += c.v * dt

      // End of the way: on to the next, or gone.
      if (c.d > w.total || c.d < 0) {
        const over = c.dir > 0 ? c.d - w.total : -c.d
        const n = c.next ?? this.chooseNext(c)
        c.next = null
        if (!n) {
          remove.add(c)
          continue
        }
        c.way = n.way
        c.dir = n.dir
        c.d = n.d + over * n.dir
        c.lane = Math.min(c.lane, n.way.lanes - 1)
        if (n.way.lanes > 1 && this.rand() < 0.3) c.lane = Math.floor(this.rand() * n.way.lanes)
        c.vmax = n.way.vmax * (c.kind === 'bus' || c.kind === 'truck' ? 0.85 : 0.88 + this.rand() * 0.2)
      }
      // Too far from the player: bring it back elsewhere.
      if (Math.hypot(c.x - px, c.y - py) > radius * 1.15) {
        remove.add(c)
        continue
      }
      // Draw it on its lane, easing the offset after turns.
      const pt = pointAt(c.way, c.d)
      const o = this.offset(c.way, c.dir, c.lane, pt.tx, pt.ty)
      const ease = 1 - Math.exp(-5 * dt)
      c.ox += (o.x - c.ox) * ease
      c.oy += (o.y - c.oy) * ease
      const nx = pt.x + c.ox
      const ny = pt.y + c.oy
      const mx = nx - c.x
      const my = ny - c.y
      if (mx * mx + my * my > 1e-6) {
        const h = Math.atan2(mx, my)
        let dh = h - c.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        c.heading += dh * (1 - Math.exp(-10 * dt))
      }
      c.x = nx
      c.y = ny
      c.z = pt.z ?? groundAt(map, nx, ny)
    }
    if (remove.size) {
      for (const c of remove) this.release(c)
      this.cars = this.cars.filter((c) => !remove.has(c))
      // Replace them out of sight right away, so the street stays as busy.
      for (let i = 0; i < remove.size && this.cars.length < target; i++) this.spawn(px, py, minSpawn, radius, hour)
    }

    // For the sound: the moving cars closest to the player.
    const near: Nearby[] = []
    let busy = 0
    for (const c of this.cars) {
      const dist = Math.hypot(c.x - px, c.y - py)
      if (dist < 70) busy += (c.v / 12) * (1 - dist / 70)
      if (dist < 45 && c.v > 0.5) near.push({ x: c.x, y: c.y, v: c.v, kind: c.kind, dist })
    }
    near.sort((a, b) => a.dist - b.dist)
    trafficSound.near = near.slice(0, 5)
    trafficSound.busy = Math.min(1, busy / 4)
  }
}
