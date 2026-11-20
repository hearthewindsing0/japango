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
}

export type PropKind =
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

export interface GameMap extends Omit<MapFile, 'grid'> {
  cell: number
  gridW: number
  gridH: number
  grid: Uint8Array
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
  const { grid, ...rest } = file
  return {
    ...rest,
    cell: grid.cell,
    gridW: grid.width,
    gridH: grid.height,
    grid: decodeRle(grid.rle, grid.width * grid.height),
  }
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
