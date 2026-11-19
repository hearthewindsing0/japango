// Turns data/<area>.osm.json (from fetch-osm.mjs) into a tile map the game
// loads: public/maps/<area>.json.
//
// Each tile is TILE_SIZE meters square. Tiles are painted in layers, later
// layers on top: ground → parks/parking/water → roads and paths → crossings →
// buildings → trees.
import { readFile, writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

// Must match src/game/tiles.ts
export const T = {
  VOID: 0,
  GROUND: 1,
  ROAD: 2,
  FOOTWAY: 3,
  GRASS: 4,
  WATER: 5,
  BUILDING: 6,
  TREE: 7,
  CROSSING: 8,
  PARKING: 9,
  WOODS: 10,
  PITCH: 11,
  SHRINE: 12, // grounds of shrines and temples
}

const input = process.argv[2] ?? `data/${AREA.id}.osm.json`
const output = process.argv[3] ?? `public/maps/${AREA.id}.json`
const osm = JSON.parse(await readFile(input, 'utf8'))
const { south, west, north, east } = AREA.bbox
const ts = AREA.tileSize

// Local equirectangular projection; fine at neighborhood scale.
const lat0 = ((south + north) / 2) * (Math.PI / 180)
const M_PER_DEG_LAT = 110574
const M_PER_DEG_LON = 111320 * Math.cos(lat0)
const W = Math.ceil(((east - west) * M_PER_DEG_LON) / ts)
const H = Math.ceil(((north - south) * M_PER_DEG_LAT) / ts)
const proj = ([lat, lon]) => [((lon - west) * M_PER_DEG_LON) / ts, ((north - lat) * M_PER_DEG_LAT) / ts]

const tiles = new Uint8Array(W * H).fill(T.GROUND)
const variants = new Uint8Array(W * H)

const set = (x, y, v, variant = 0) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  tiles[y * W + x] = v
  variants[y * W + x] = variant
}

/** Even-odd scanline fill. `rings` is a list of point lists (tile coords).
 *  Pieces need not be ordered or joined, as long as together they close. */
function fillPolygon(rings, v, variant = 0, only) {
  const edges = []
  let minY = Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i++) {
      edges.push([ring[i], ring[i + 1]])
      minY = Math.min(minY, ring[i][1], ring[i + 1][1])
      maxY = Math.max(maxY, ring[i][1], ring[i + 1][1])
    }
  }
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(H - 1, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    const xs = []
    for (const [[ax, ay], [bx, by]] of edges) {
      if (ay <= cy !== by <= cy) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5))
      const xb = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5))
      for (let x = xa; x <= xb; x++) {
        if (only && !only.includes(tiles[y * W + x])) continue
        set(x, y, v, variant)
      }
    }
  }
}

/** Paints every tile whose center is within width/2 of the polyline. */
function drawLine(pts, widthTiles, v) {
  const r = Math.max(widthTiles / 2, 0.5)
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-9
    const x0 = Math.floor(Math.min(ax, bx) - r)
    const x1 = Math.ceil(Math.max(ax, bx) + r)
    const yA = Math.floor(Math.min(ay, by) - r)
    const yB = Math.ceil(Math.max(ay, by) + r)
    for (let y = yA; y <= yB; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        const qx = ax + t * dx - px
        const qy = ay + t * dy - py
        if (qx * qx + qy * qy <= r * r) set(x, y, v)
      }
    }
  }
}

const hash = (n) => {
  let h = Number(n % 2147483647) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

const ringsOf = (e) =>
  e.type === 'way' ? [e.geom.map(proj)] : e.type === 'relation' ? e.members.map((m) => m.geom.map(proj)) : []

const isClosed = (e) =>
  e.type === 'relation' ||
  (e.type === 'way' && e.geom.length > 3 && e.geom[0][0] === e.geom.at(-1)[0] && e.geom[0][1] === e.geom.at(-1)[1])

const below = (tags) =>
  Number(tags.layer ?? 0) < 0 ||
  tags.tunnel === 'yes' ||
  tags.location === 'underground' ||
  tags.indoor === 'yes' ||
  tags.covered === 'yes' ||
  tags.parking === 'underground' ||
  tags.parking === 'multi-storey'

const elements = osm.elements
const ways = elements.filter((e) => e.type !== 'node')

// 1. Areas: parks, parking, water, shrine grounds.
function areaType(tags) {
  if (tags.amenity === 'place_of_worship') return T.SHRINE
  if (tags.leisure === 'pitch' || tags.leisure === 'track') return T.PITCH
  if (['park', 'garden', 'playground', 'dog_park', 'common'].includes(tags.leisure)) return T.GRASS
  if (['grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery'].includes(tags.landuse)) return T.GRASS
  if (['grassland', 'scrub', 'heath'].includes(tags.natural)) return T.GRASS
  if (tags.landuse === 'forest' || tags.natural === 'wood') return T.WOODS
  if (tags.natural === 'water' || tags.leisure === 'swimming_pool' || tags.landuse === 'basin') return T.WATER
  if (tags.amenity === 'parking') return T.PARKING
  return null
}
// Paint bigger areas first so that small ones (a pond in a park) end up on top.
const areas = ways
  .filter((e) => isClosed(e) && !e.tags.building && !below(e.tags) && areaType(e.tags) !== null)
  .map((e) => ({ e, rings: ringsOf(e) }))
  .map((a) => {
    const ring = a.rings[0]
    let s = 0
    for (let i = 0; i + 1 < ring.length; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return { ...a, size: Math.abs(s) }
  })
  .sort((a, b) => b.size - a.size)
for (const { e, rings } of areas) fillPolygon(rings, areaType(e.tags))

// 2. Roads and paths, widest kinds first so footpaths stay visible on top.
const ROAD_WIDTH_M = {
  trunk: 18,
  trunk_link: 8,
  primary: 16,
  primary_link: 8,
  secondary: 12,
  secondary_link: 7,
  tertiary: 9,
  tertiary_link: 6,
  unclassified: 6,
  residential: 5,
  living_street: 4,
  service: 4,
  road: 5,
}
const PATH_WIDTH_M = { pedestrian: 5, footway: 3, path: 2, steps: 3, cycleway: 2, corridor: 2 }

const highways = ways.filter((e) => e.tags.highway && !below(e.tags) && !e.tags.highway.startsWith('motorway'))
const widthOf = (tags) => {
  const explicit = parseFloat(tags.width)
  if (explicit > 0) return explicit
  const lanes = parseInt(tags.lanes)
  if (ROAD_WIDTH_M[tags.highway] && lanes > 0) return Math.max(lanes * 3.2, ROAD_WIDTH_M[tags.highway] / 2)
  return ROAD_WIDTH_M[tags.highway] ?? PATH_WIDTH_M[tags.highway] ?? 0
}
const roads = highways.filter((e) => ROAD_WIDTH_M[e.tags.highway]).sort((a, b) => widthOf(b.tags) - widthOf(a.tags))
for (const e of roads) drawLine(e.geom.map(proj), widthOf(e.tags) / ts, T.ROAD)

const paths = highways.filter((e) => PATH_WIDTH_M[e.tags.highway])
for (const e of paths) {
  const pts = e.geom.map(proj)
  const crossing = e.tags.footway === 'crossing' || e.tags.cycleway === 'crossing'
  if (e.tags.area === 'yes' && isClosed(e)) fillPolygon([pts], T.FOOTWAY)
  else drawLine(pts, widthOf(e.tags) / ts, crossing ? T.CROSSING : T.FOOTWAY)
}
// Crossing nodes on roads get a small zebra patch.
for (const n of elements) {
  if (n.type !== 'node' || n.tags.highway !== 'crossing') continue
  const [x, y] = proj(n.pos)
  drawLine([[x, y], [x + 0.01, y]], 4 / ts, T.CROSSING)
}

// 3. Buildings. Each building gets a variant (0-7) for its roof color.
const buildings = ways.filter(
  (e) => e.tags.building && isClosed(e) && !below(e.tags) && !['roof', 'no', 'canopy'].includes(e.tags.building),
)
for (const e of buildings) fillPolygon(ringsOf(e), T.BUILDING, hash(e.id) % 8)

// 4. Single trees, only where they don't land on a road or building.
for (const n of elements) {
  if (n.type !== 'node' || n.tags.natural !== 'tree') continue
  const [x, y] = proj(n.pos).map(Math.floor)
  const cur = tiles[y * W + x]
  if ([T.GROUND, T.FOOTWAY, T.GRASS, T.WOODS, T.SHRINE, T.PARKING].includes(cur)) set(x, y, T.TREE)
}

// Points of interest: named places the game can label and NPCs can talk about.
function kindOf(tags) {
  if (tags.railway === 'station' || tags.public_transport === 'station') return 'station'
  if (tags.railway === 'subway_entrance') return 'exit'
  if (tags.shop === 'convenience') return 'konbini'
  if (tags.amenity === 'place_of_worship') return 'shrine'
  if (['restaurant', 'fast_food', 'food_court'].includes(tags.amenity)) return 'food'
  if (tags.amenity === 'cafe') return 'cafe'
  if (['bar', 'pub', 'nightclub'].includes(tags.amenity)) return 'bar'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.tourism || tags.historic || tags.amenity === 'arts_centre') return 'sight'
  if (tags.shop) return 'shop'
  if (tags.amenity) return 'amenity'
  if (tags.building || tags.landuse) return 'building'
  return null
}
const centroid = (rings) => {
  let sx = 0
  let sy = 0
  let n = 0
  for (const p of rings[0]) {
    sx += p[0]
    sy += p[1]
    n++
  }
  return [sx / n, sy / n]
}
const pois = []
for (const e of elements) {
  const name = e.tags.name
  if (!name || e.tags.highway || e.tags.route) continue
  const kind = kindOf(e.tags)
  if (!kind) continue
  const [x, y] = e.type === 'node' ? proj(e.pos) : centroid(ringsOf(e))
  if (x < 0 || y < 0 || x >= W || y >= H) continue
  const poi = { name, kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
  const en = e.tags['name:en'] ?? e.tags['name:ja-Latn'] ?? e.tags['name:ja_rm']
  if (en && en !== name) poi.nameEn = en
  if (e.tags['name:ja-Hira']) poi.kana = e.tags['name:ja-Hira']
  if (e.tags.ref && kind === 'exit') poi.ref = e.tags.ref
  pois.push(poi)
}

// Named streets, so the game can say which street you're on.
const streets = []
for (const e of roads) {
  if (!e.tags.name) continue
  const s = { name: e.tags.name, pts: e.geom.map(proj).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) }
  if (e.tags['name:en']) s.nameEn = e.tags['name:en']
  streets.push(s)
}

// Spawn on the walkable tile nearest the configured spawn point.
const BLOCKED = new Set([T.BUILDING, T.WATER, T.TREE, T.VOID])
const [sx0, sy0] = proj([AREA.spawn.lat, AREA.spawn.lon]).map(Math.floor)
let spawn = null
for (let r = 0; !spawn && r < 200; r++) {
  for (let y = sy0 - r; y <= sy0 + r && !spawn; y++)
    for (let x = sx0 - r; x <= sx0 + r && !spawn; x++)
      if (x >= 0 && y >= 0 && x < W && y < H && !BLOCKED.has(tiles[y * W + x])) spawn = { x, y }
}

const counts = {}
for (const [k, v] of Object.entries(T)) counts[k] = 0
const names = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]))
for (const t of tiles) counts[names[t]]++

await writeFile(
  output,
  JSON.stringify({
    id: AREA.id,
    name: AREA.name,
    nameEn: AREA.nameEn,
    attribution: osm.attribution,
    fetchedAt: osm.fetchedAt,
    bbox: AREA.bbox,
    tileSize: ts,
    width: W,
    height: H,
    spawn,
    tiles: Buffer.from(tiles).toString('base64'),
    variants: Buffer.from(variants).toString('base64'),
    pois,
    streets,
  }),
)
console.log(`Built ${W}x${H} map (${ts}m tiles) → ${output}`)
console.log(`${pois.length} places, ${streets.length} named street segments, spawn at`, spawn)
console.log('Tile counts:', counts)
