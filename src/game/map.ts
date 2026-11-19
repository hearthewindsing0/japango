import { BLOCKED } from './tiles'

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

interface MapFile {
  id: string
  name: string
  nameEn: string
  attribution: string
  fetchedAt?: string
  tileSize: number
  width: number
  height: number
  spawn: { x: number; y: number }
  tiles: string
  variants: string
  pois: Poi[]
  streets: Street[]
}

export interface GameMap extends Omit<MapFile, 'tiles' | 'variants'> {
  tiles: Uint8Array
  variants: Uint8Array
}

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export async function loadMap(id: string): Promise<GameMap> {
  const res = await fetch(`${import.meta.env.BASE_URL}maps/${id}.json`)
  if (!res.ok) throw new Error(`Map "${id}" not found (${res.status})`)
  const file = (await res.json()) as MapFile
  return { ...file, tiles: decode(file.tiles), variants: decode(file.variants) }
}

export function tileAt(map: GameMap, x: number, y: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0
  return map.tiles[y * map.width + x]
}

export const isBlocked = (map: GameMap, x: number, y: number) => BLOCKED.has(tileAt(map, x, y))

function distToSegment(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy || 1e-9
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}

/** The named street within `maxDist` tiles of (x, y), if any. */
export function streetNear(map: GameMap, x: number, y: number, maxDist = 8): Street | null {
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

/** Places inside a rectangle, most important first. */
export function poisIn(map: GameMap, x0: number, y0: number, x1: number, y1: number, limit: number) {
  return map.pois
    .filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, limit)
}

/** The closest place within `maxDist` tiles. */
export function nearestPoi(map: GameMap, x: number, y: number, maxDist = 12) {
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
