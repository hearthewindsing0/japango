import type { Week } from './hours'
import { BLOCKED, T } from './tiles'
import type { InteriorPlace } from './interior'
import type { Station } from './station'
import type { PeopleFlow } from './people-flow'

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
  /** Real opening hours, Monday first (see hours.ts). */
  oh?: Week
  /** What a restaurant serves, in Japanese and English (和食, Japanese food). */
  cu?: string
  cuEn?: string
  /** Curated place id (data/places/<area>.json): always labelled, starred
   *  on the minimap. */
  fav?: string
  /** It has closed since; it's shown where it used to be. */
  gone?: 1
}

/** A curated place, as the manifest lists them for the minimap. */
export interface Place {
  id: string
  x: number
  y: number
  ja: string
  en: string
  kind: PoiKind
  gone?: 1
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
  /** rc: roof color from aerial photos (sRGB 0-255), if any. */
  buildings: { p: Flat; h: number; v: number; ho?: Flat[]; c?: [number, number, number]; rc?: [number, number, number] }[]
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
  /** Shop signs on walls: t = text, k = shop kind, r = facing, w = max
   *  width, b = index of the building it hangs on. */
  signs?: { x: number; y: number; r: number; w: number; b: number; t: string; k: PoiKind; oh?: Week; fav?: 1 }[]
  places?: Place[]
  /** Places with a Wikipedia article; stamp = part of the stamp rally. */
  discoveries?: Discovery[]
  /** Bridge surfaces: rings of [x, y, height] in game meters. */
  bridges?: Flat[]
  /** Elevated expressway: polylines of [x, y, deck height], w = width. */
  viaducts?: { p: Flat; w: number }[]
  /** Ground heights: a grid every `cell` meters, Int16 decimeters above
   *  `base` (meters above sea level), base64. */
  terrain?: { cell: number; width: number; height: number; base: number; data: string }
}

export interface Discovery {
  /** Wikidata id, e.g. Q1191163. */
  id: string
  x: number
  y: number
  ja: string
  en?: string
  kind?: string
  /** Opening lines of the Japanese and English Wikipedia articles. */
  jt?: string
  et?: string
  /** Article titles on ja.wikipedia.org and en.wikipedia.org. */
  jw: string
  ew?: string
  stamp?: 1
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

/** One square of the map, as the tile files hold it. Shapes that cross
 *  the square's edge are in every tile they touch; drawing is clipped to
 *  the square. */
export interface TileFile {
  col: number
  row: number
  x0: number
  y0: number
  size: number
  grid: { cell: number; ox: number; oy: number; width: number; height: number; rle: string }
  terrain?: { cell: number; ox: number; oy: number; width: number; height: number; base: number; data: string }
  buildings: MapFile['buildings']
  roads: MapFile['roads']
  paths: MapFile['paths']
  areas: MapFile['areas']
  bridges: Flat[]
  viaducts: NonNullable<MapFile['viaducts']>
  trees: number[]
  props: NonNullable<MapFile['props']>
  pois: Poi[]
  signs: NonNullable<MapFile['signs']>
}

export interface MapTile extends Omit<TileFile, 'grid' | 'terrain'> {
  key: string
  /** Far edges of the square, cut at the map's edge. */
  x1: number
  y1: number
  cell: number
  /** Grid cell of the tile's first ground-type cell. */
  gx: number
  gy: number
  gridW: number
  gridH: number
  grid: Uint8Array
  /** Ground height in game meters at each terrain point, or null if flat.
   *  ox, oy: the first point's index on the map-wide terrain grid. */
  ground: { cell: number; ox: number; oy: number; width: number; height: number; h: Float32Array } | null
}

/** What the tile manifest holds: the area, and the few lists the HUD needs
 *  wherever you are. */
export interface Manifest {
  version: 3
  id: string
  name: string
  nameEn: string
  attribution: string
  credits?: string[]
  /** When the tiles were cut; tiles are fetched with it so caches can keep them. */
  builtAt?: string
  rotationDeg: number
  width: number
  height: number
  spawn: { x: number; y: number }
  cell: number
  tile: number
  cols: number
  rows: number
  tiles: [number, number][]
  streets: Street[]
  slopes: Slope[]
  discoveries: Discovery[]
  /** Curated places (data/places/<area>.json), starred on the minimap. */
  places?: Place[]
  /** Stations you can walk into (see station.ts). */
  stations?: Station[]
  /** Front doors of places you can walk into (see interior.ts). */
  interiors?: InteriorPlace[]
  /** Measured people counts per 1 km square (see people-flow.ts). */
  peopleFlow?: PeopleFlow
}

/** The map as the game sees it: the manifest plus whichever tiles are
 *  loaded right now (see useTileStream). */
export interface GameMap extends Omit<Manifest, 'tiles'> {
  /** Every tile the map has, as [col, row]. */
  index: [number, number][]
  /** The tiles loaded right now, by tileKey. */
  tiles: Map<string, MapTile>
  /** Where tiles are fetched from. */
  base: string
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

/** Tiles come with the game unless VITE_TILES_URL points elsewhere (R2). */
const TILES_URL: string = import.meta.env.VITE_TILES_URL || `${import.meta.env.BASE_URL}tiles/`

export async function loadMap(id: string): Promise<GameMap> {
  const base = `${TILES_URL.replace(/\/?$/, '/')}${id}/`
  const res = await fetch(`${base}manifest.json`)
  if (!res.ok) throw new Error(`Map "${id}" not found (${res.status})`)
  const file = (await res.json()) as Manifest
  if (file.version !== 3) throw new Error(`Map "${id}" is an old format. Run npm run map:build.`)
  const { tiles, ...rest } = file
  return { ...rest, index: tiles, tiles: new Map(), base }
}

export const tileKey = (col: number, row: number) => `${col}_${row}`

export async function loadTile(map: GameMap, col: number, row: number): Promise<MapTile> {
  const v = map.builtAt ? `?v=${encodeURIComponent(map.builtAt)}` : ''
  const res = await fetch(`${map.base}${tileKey(col, row)}.json${v}`)
  if (!res.ok) throw new Error(`Tile ${tileKey(col, row)}: ${res.status}`)
  const file = (await res.json()) as TileFile
  const { grid, terrain, ...rest } = file
  let ground: MapTile['ground'] = null
  if (terrain) {
    const bytes = Uint8Array.from(atob(terrain.data), (c) => c.charCodeAt(0))
    const dm = new Int16Array(bytes.buffer)
    ground = {
      cell: terrain.cell,
      ox: terrain.ox,
      oy: terrain.oy,
      width: terrain.width,
      height: terrain.height,
      h: Float32Array.from(dm, (v) => v * 0.1 * TERRAIN_SCALE),
    }
  }
  return {
    ...rest,
    key: tileKey(col, row),
    x1: Math.min(file.x0 + file.size, map.width),
    y1: Math.min(file.y0 + file.size, map.height),
    ground,
    cell: grid.cell,
    gx: grid.ox,
    gy: grid.oy,
    gridW: grid.width,
    gridH: grid.height,
    grid: decodeRle(grid.rle, grid.width * grid.height),
  }
}

/** The loaded tile under a point, if any. */
export function tileAt(map: GameMap, x: number, y: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined
  return map.tiles.get(tileKey(Math.floor(x / map.tile), Math.floor(y / map.tile)))
}

/** Height of the ground at a point, in meters, from one tile's terrain.
 *  The ground is flat inside each triangle of the terrain grid, whose cells
 *  are cut from corner (x0, y1) to (x1, y0), so this matches the drawn
 *  ground exactly. */
export function tileGroundAt(tile: MapTile, x: number, y: number) {
  const g = tile.ground
  if (!g) return 0
  const fx = Math.min(Math.max(x / g.cell - g.ox, 0), g.width - 1.0001)
  const fy = Math.min(Math.max(y / g.cell - g.oy, 0), g.height - 1.0001)
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

/** Height of the ground anywhere on the map (0 where no tile is loaded). */
export function groundAt(map: GameMap, x: number, y: number) {
  const t = tileAt(map, Math.min(Math.max(x, 0), map.width - 0.01), Math.min(Math.max(y, 0), map.height - 0.01))
  return t ? tileGroundAt(t, x, y) : 0
}

/** Ground type at a point in meters. */
export function cellAt(map: GameMap, x: number, y: number) {
  const t = tileAt(map, x, y)
  if (!t) return T.VOID // not loaded yet: solid until it is
  const cx = Math.floor(x / t.cell) - t.gx
  const cy = Math.floor(y / t.cell) - t.gy
  if (cx < 0 || cy < 0 || cx >= t.gridW || cy >= t.gridH) return T.VOID
  return t.grid[cy * t.gridW + cx]
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
  return [...map.tiles.values()]
    .flatMap((t) => t.pois)
    .filter((p) => Math.abs(p.x - x) <= radius && Math.abs(p.y - y) <= radius * 0.8)
    .sort((a, b) => (a.fav ? -1 : KIND_RANK[a.kind]) - (b.fav ? -1 : KIND_RANK[b.kind]))
    .slice(0, limit)
}

/** The discovery within `maxDist` meters, if any. */
export function discoveryNear(map: GameMap, x: number, y: number, maxDist = 9) {
  let best: Discovery | null = null
  let bestD = maxDist
  for (const d of map.discoveries ?? []) {
    const dist = Math.hypot(d.x - x, d.y - y)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best
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
  for (const t of map.tiles.values())
  for (const p of t.pois) {
    if (p.kind === 'building' && !p.nameEn) continue
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
