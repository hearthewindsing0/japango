import { BLOCKED, T } from './tiles'

export type PoiKind =
  | 'station'
  | 'exit'
  | 'konbini'
  | 'shrine'
  | 'food'
  | 'cafe'
  | 'bar'
  | 'park'
  | 'sight'
  | 'shop'
  | 'amenity'
  | 'building'

export interface Poi {
  name: string
  nameEn?: string
  kana?: string
  ref?: string
  kind: PoiKind
  x: number
  y: number
}

export interface Street {
  name: string
  nameEn?: string
  pts: [number, number][]
}

/** Flat [x0, y0, x1, y1, …] coordinate list, in meters. */
export type Flat = number[]

export interface MapFile {
  version: 2
  id: string
  name: string
  nameEn: string
  attribution: string
  fetchedAt?: string
  /** How far the map is turned from north-up, counter-clockwise, in degrees. */
  rotationDeg: number
  width: number
  height: number
  spawn: { x: number; y: number }
  grid: { cell: number; width: number; height: number; rle: string }
  /** c: wall color measured from street photos (sRGB 0-255), if any. */
  buildings: { p: Flat; h: number; v: number; ho?: Flat[]; c?: [number, number, number] }[]
  roads: { t: string; w: number; s: number; p: Flat; b: number }[]
  paths: { t: string; w: number; p: Flat }[]
  areas: { t: number; p: Flat; h: Flat[] }[]
  /** [x, y, scale] triples. */
  trees: number[]
  /** Street objects seen in street-level photos. r: facing, in radians. */
  props?: { k: PropKind; x: number; y: number; r: number }[]
  /** Data sources to credit on screen. */
  credits?: string[]
  pois: Poi[]
  streets: Street[]
  /** Named slopes (坂), with a sign at the bottom (top: 0) and top (1). rise
   *  is the real height difference in meters. */
  slopes?: Slope[]
  /** Ground heights: a grid every `cell` meters, Int16 decimeters above
   *  `base` (meters above sea level), base64. */
  terrain?: { cell: number; width: number; height: number; base: number; data: string }
}

export interface Slope {
  name: string
  kana?: string
  en?: string
  gloss?: string
  rise: number
  signs: { x: number; y: number; r: number; top: 0 | 1 }[]
}

export type PropKind =
  | 'slopesign'
  | 'streetlight'
  | 'pole'
  | 'trafficlight'
  | 'sign'
  | 'bench'
  | 'bin'
  | 'hydrant'
  | 'postbox'
  | 'bikerack'
  | 'phonebooth'
  | 'manhole'

/** Real slopes are shrunk by this much, to match the shortened buildings. */
export const TERRAIN_SCALE = 0.5

export interface GameMap extends Omit<MapFile, 'grid' | 'terrain'> {
  cell: number
  gridW: number
  gridH: number
  grid: Uint8Array
  /** Ground height in game meters at each terrain grid point, or null if flat. */
  ground: { cell: number; width: number; height: number; h: Float32Array } | null
}

function decodeRle(b64: string, size: number) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const out = new Uint8Array(size)
  let o = 0
  for (let i = 0; i < bytes.length; i += 2) {
    out.fill(bytes[i], o, o + bytes[i + 1])
    o += bytes[i + 1]
  }
  return out
}

export async function loadMap(id: string): Promise<GameMap> {
  const res = await fetch(`${import.meta.env.BASE_URL}maps/${id}.json`)
  if (!res.ok) throw new Error(`Map "${id}" not found (${res.status})`)
  const file = (await res.json()) as MapFile
  if (file.version !== 2) throw new Error(`Map "${id}" is an old format. Run npm run map:build.`)
  const { grid, terrain, ...rest } = file
  let ground: GameMap['ground'] = null
  if (terrain) {
    const bytes = Uint8Array.from(atob(terrain.data), (c) => c.charCodeAt(0))
    const dm = new Int16Array(bytes.buffer)
    ground = {
      cell: terrain.cell,
      width: terrain.width,
      height: terrain.height,
      h: Float32Array.from(dm, (v) => v * 0.1 * TERRAIN_SCALE),
    }
  }
  return {
    ground,
    ...rest,
    cell: grid.cell,
    gridW: grid.width,
    gridH: grid.height,
    grid: decodeRle(grid.rle, grid.width * grid.height),
  }
}

/** Height of the ground at a point, in meters. The ground is flat inside
 *  each triangle of the terrain grid, whose cells are cut from corner
 *  (x0, y1) to (x1, y0), so this matches the drawn ground exactly. */
export function groundAt(map: GameMap, x: number, y: number) {
  const g = map.ground
  if (!g) return 0
  const fx = Math.min(Math.max(x / g.cell, 0), g.width - 1.0001)
  const fy = Math.min(Math.max(y / g.cell, 0), g.height - 1.0001)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const i = y0 * g.width + x0
  const h = g.h
  if (tx + ty <= 1) return h[i] + (h[i + 1] - h[i]) * tx + (h[i + g.width] - h[i]) * ty
  const j = i + g.width + 1
  return h[j] + (h[j - 1] - h[j]) * (1 - tx) + (h[i + 1] - h[j]) * (1 - ty)
}

/** Ground type at a point in meters. */
export function cellAt(map: GameMap, x: number, y: number) {
  const cx = Math.floor(x / map.cell)
  const cy = Math.floor(y / map.cell)
  if (cx < 0 || cy < 0 || cx >= map.gridW || cy >= map.gridH) return T.VOID
  return map.grid[cy * map.gridW + cx]
}

export const isBlocked = (map: GameMap, x: number, y: number) => BLOCKED.has(cellAt(map, x, y))

/** True if a circle of radius r at (x, y) overlaps anything solid. */
export function circleBlocked(map: GameMap, x: number, y: number, r: number) {
  if (isBlocked(map, x, y)) return true
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    if (isBlocked(map, x + Math.cos(a) * r, y + Math.sin(a) * r)) return true
  }
  return false
}

function distToSegment(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy || 1e-9
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}

/** The named street within `maxDist` meters of (x, y), if any. */
export function streetNear(map: GameMap, x: number, y: number, maxDist = 14): Street | null {
  let best: Street | null = null
  let bestD = maxDist
  for (const s of map.streets) {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const d = distToSegment(x, y, s.pts[i], s.pts[i + 1])
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
  }
  return best
}

const KIND_RANK: Record<PoiKind, number> = {
  station: 0,
  sight: 1,
  park: 1,
  shrine: 1,
  building: 2,
  exit: 2,
  konbini: 3,
  cafe: 3,
  food: 3,
  bar: 3,
  shop: 4,
  amenity: 5,
}

/** Places within `radius` meters, most important first. */
export function poisNear(map: GameMap, x: number, y: number, radius: number, limit: number) {
  return map.pois
    .filter((p) => Math.abs(p.x - x) <= radius && Math.abs(p.y - y) <= radius * 0.8)
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, limit)
}

/** The slope sign within `maxDist` meters, if any. */
export function slopeNear(map: GameMap, x: number, y: number, maxDist = 14) {
  let best: { slope: Slope; top: boolean } | null = null
  let bestD = maxDist
  for (const slope of map.slopes ?? [])
    for (const s of slope.signs) {
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < bestD) {
        bestD = d
        best = { slope, top: s.top === 1 }
      }
    }
  return best
}

/** The closest place within `maxDist` meters. */
export function nearestPoi(map: GameMap, x: number, y: number, maxDist = 25) {
  let best: Poi | null = null
  let bestD = maxDist
  for (const p of map.pois) {
    if (p.kind === 'building' && !p.nameEn) continue
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
