// Turns data/<area>.osm.json (from fetch-osm.mjs) into the map the game
// loads: public/maps/<area>.json.
//
// The output has two parts, both in meters inside the rotated map frame
// (x grows right along Roppongi-dori, y grows down the screen):
//
// - Vector shapes the game draws smoothly: buildings with heights, roads,
//   paths, crossings, parks, water and trees.
// - A coarse grid (AREA.cell meters per cell) of ground types, used for
//   collisions and the minimap.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

// Grid cell types. Must match src/game/tiles.ts
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
  SHRINE: 12,
  SIDEWALK: 13,
}

const input = process.argv[2] ?? `data/${AREA.id}.osm.json`
const output = process.argv[3] ?? `public/maps/${AREA.id}.json`
const osm = JSON.parse(await readFile(input, 'utf8'))
const { width: FW, height: FH, cell } = AREA

// --- Projection -----------------------------------------------------------
// Local equirectangular meters around the center, then turned by rotationDeg.
const lat0 = AREA.center.lat
const lon0 = AREA.center.lon
const M_PER_DEG_LAT = 110574
const M_PER_DEG_LON = 111320 * Math.cos((lat0 * Math.PI) / 180)
const th = (AREA.rotationDeg * Math.PI) / 180
const cos = Math.cos(th)
const sin = Math.sin(th)
const proj = ([lat, lon]) => {
  const e = (lon - lon0) * M_PER_DEG_LON
  const n = (lat - lat0) * M_PER_DEG_LAT
  const x = e * cos + n * sin
  const yn = -e * sin + n * cos
  return [x + FW / 2, -yn + FH / 2]
}
const r1 = (v) => Math.round(v * 10) / 10
const flat = (pts) => pts.flatMap(([x, y]) => [r1(x), r1(y)])

// Rough bounds check: keep features that come anywhere near the frame.
const MARGIN = 60
const nearFrame = (pts) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return maxX > -MARGIN && maxY > -MARGIN && minX < FW + MARGIN && minY < FH + MARGIN
}

// --- Grid rasterization ---------------------------------------------------
const GW = Math.ceil(FW / cell)
const GH = Math.ceil(FH / cell)
const grid = new Uint8Array(GW * GH).fill(T.GROUND)
const setCell = (x, y, v) => {
  if (x >= 0 && y >= 0 && x < GW && y < GH) grid[y * GW + x] = v
}

/** Even-odd scanline fill of rings given in meters. Ring pieces need not be
 *  joined, as long as together they close. */
function fillPolygon(rings, v) {
  const edges = []
  let minY = Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = [ring[i][0] / cell, ring[i][1] / cell]
      const b = [ring[i + 1][0] / cell, ring[i + 1][1] / cell]
      edges.push([a, b])
      minY = Math.min(minY, a[1], b[1])
      maxY = Math.max(maxY, a[1], b[1])
    }
  }
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(GH - 1, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    const xs = []
    for (const [[ax, ay], [bx, by]] of edges) {
      if (ay <= cy !== by <= cy) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5))
      const xb = Math.min(GW - 1, Math.floor(xs[i + 1] - 0.5))
      for (let x = xa; x <= xb; x++) setCell(x, y, v)
    }
  }
}

/** Marks every cell whose center is within width/2 meters of the polyline. */
function drawLine(pts, widthM, v, only) {
  const r = Math.max(widthM / 2 / cell, 0.5)
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0] / cell
    const ay = pts[i][1] / cell
    const bx = pts[i + 1][0] / cell
    const by = pts[i + 1][1] / cell
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-9
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r))
    const x1 = Math.min(GW - 1, Math.ceil(Math.max(ax, bx) + r))
    const yA = Math.max(0, Math.floor(Math.min(ay, by) - r))
    const yB = Math.min(GH - 1, Math.ceil(Math.max(ay, by) + r))
    for (let y = yA; y <= yB; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        const qx = ax + t * dx - px
        const qy = ay + t * dy - py
        if (qx * qx + qy * qy <= r * r && (!only || only.includes(grid[y * GW + x]))) setCell(x, y, v)
      }
    }
  }
}
const cellAt = (xm, ym) => {
  const x = Math.floor(xm / cell)
  const y = Math.floor(ym / cell)
  return x >= 0 && y >= 0 && x < GW && y < GH ? grid[y * GW + x] : T.VOID
}

// --- Helpers --------------------------------------------------------------
const hash = (n) => {
  let h = Number(BigInt(n) % 2147483647n) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}
let seed = 12345
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

const ringsOf = (e) =>
  e.type === 'way' ? [e.geom.map(proj)] : e.type === 'relation' ? e.members.map((m) => m.geom.map(proj)) : []
const roleRings = (e) =>
  e.type === 'way'
    ? { outer: [e.geom.map(proj)], inner: [] }
    : {
        outer: joinRings(e.members.filter((m) => m.role !== 'inner').map((m) => m.geom.map(proj))),
        inner: joinRings(e.members.filter((m) => m.role === 'inner').map((m) => m.geom.map(proj))),
      }

/** Joins way pieces of a multipolygon into closed rings. */
function joinRings(pieces) {
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
  const rings = []
  const left = pieces.map((p) => [...p])
  while (left.length) {
    let ring = left.shift()
    let grew = true
    while (!same(ring[0], ring.at(-1)) && grew) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const p = left[i]
        if (same(ring.at(-1), p[0])) ring = ring.concat(p.slice(1))
        else if (same(ring.at(-1), p.at(-1))) ring = ring.concat([...p].reverse().slice(1))
        else continue
        left.splice(i, 1)
        grew = true
        break
      }
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

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

const area2 = (ring) => {
  let s = 0
  for (let i = 0; i + 1 < ring.length; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return s / 2
}

const elements = osm.elements
const ways = elements.filter((e) => e.type !== 'node')

// --- 1. Areas: parks, parking, water, shrine grounds ----------------------
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
const areaList = ways
  .filter((e) => isClosed(e) && !e.tags.building && !below(e.tags) && areaType(e.tags) !== null)
  .map((e) => ({ e, ...roleRings(e) }))
  .filter((a) => a.outer.length && a.outer.some(nearFrame))
  .map((a) => ({ ...a, size: Math.abs(area2(a.outer[0])) }))
  .sort((a, b) => b.size - a.size)
const areas = []
for (const a of areaList) {
  const t = areaType(a.e.tags)
  fillPolygon([...a.outer, ...a.inner], t)
  for (const ring of a.outer) areas.push({ t, p: flat(ring), h: a.inner.filter((r) => r.length > 3).map(flat) })
}

// --- 2. Roads, sidewalks and paths ----------------------------------------
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
// Big roads get a sidewalk on each side, this wide.
const SIDEWALK_M = { trunk: 4, primary: 4, secondary: 3.5, tertiary: 3 }
const PATH_WIDTH_M = { pedestrian: 5, footway: 2.5, path: 2, steps: 2.5, cycleway: 2, corridor: 2 }

const highways = ways.filter(
  (e) => e.tags.highway && !below(e.tags) && !e.tags.highway.startsWith('motorway') && nearFrame(e.geom.map(proj)),
)
const widthOf = (tags) => {
  const explicit = parseFloat(tags.width)
  if (explicit > 0 && explicit < 60) return explicit
  const lanes = parseInt(tags.lanes)
  if (ROAD_WIDTH_M[tags.highway] && lanes > 0) return Math.max(lanes * 3.2, ROAD_WIDTH_M[tags.highway] / 2)
  return ROAD_WIDTH_M[tags.highway] ?? PATH_WIDTH_M[tags.highway] ?? 0
}

const roadWays = highways
  .filter((e) => ROAD_WIDTH_M[e.tags.highway])
  .sort((a, b) => widthOf(b.tags) - widthOf(a.tags))
const roads = []
for (const e of roadWays) {
  const pts = e.geom.map(proj)
  const w = widthOf(e.tags)
  const sw = SIDEWALK_M[e.tags.highway.replace('_link', '')] ?? 0
  if (sw && !e.tags.highway.endsWith('_link')) drawLine(pts, w + sw * 2, T.SIDEWALK, [T.GROUND, T.PARKING, T.GRASS, T.SHRINE])
  roads.push({ t: e.tags.highway, w: r1(w), s: sw, p: flat(pts), b: e.tags.bridge === 'yes' ? 1 : 0 })
}
for (const e of roadWays) drawLine(e.geom.map(proj), widthOf(e.tags), T.ROAD)

const paths = []
for (const e of highways.filter((e) => PATH_WIDTH_M[e.tags.highway])) {
  const pts = e.geom.map(proj)
  const crossing = e.tags.footway === 'crossing' || e.tags.cycleway === 'crossing'
  if (e.tags.area === 'yes' && isClosed(e)) {
    fillPolygon([pts], T.FOOTWAY)
    areas.push({ t: T.FOOTWAY, p: flat(pts), h: [] })
  } else {
    const w = crossing ? 4 : widthOf(e.tags)
    drawLine(pts, w, crossing ? T.CROSSING : T.FOOTWAY)
    paths.push({ t: crossing ? 'crossing' : e.tags.highway, w: r1(w), p: flat(pts) })
  }
}
// Crossing nodes on roads without a mapped crossing way: a short zebra patch
// across the road, perpendicular to it.
for (const n of elements) {
  if (n.type !== 'node' || n.tags.highway !== 'crossing') continue
  const [x, y] = proj(n.pos)
  if (x < 0 || y < 0 || x > FW || y > FH) continue
  let best = null
  for (const r of roadWays) {
    const g = r.geom
    for (let i = 0; i + 1 < g.length; i++) {
      const a = proj(g[i])
      const b = proj(g[i + 1])
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len2 = dx * dx + dy * dy || 1e-9
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2))
      const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y)
      if (!best || d < best.d) best = { d, dx, dy, w: widthOf(r.tags) }
    }
  }
  if (!best || best.d > 3) continue
  const len = Math.hypot(best.dx, best.dy)
  const nx = -best.dy / len
  const ny = best.dx / len
  const half = best.w / 2
  const pts = [
    [x - nx * half, y - ny * half],
    [x + nx * half, y + ny * half],
  ]
  drawLine(pts, 4, T.CROSSING)
  paths.push({ t: 'crossing', w: 4, p: flat(pts) })
}

// --- 3. Buildings ---------------------------------------------------------
// PLATEAU's survey-based models when we have them (accurate footprints and
// measured heights), otherwise OpenStreetMap's building outlines.
const plateauFile = `data/${AREA.id}.plateau.json`
const plateau = existsSync(plateauFile) ? JSON.parse(await readFile(plateauFile, 'utf8')) : null

// Real heights would put 200 m towers on screen, so squash tall buildings:
// full height up to about 2-3 floors, then gently rising, capped at 15 m, so
// buildings south of the player don't wall off the view.
const gameHeight = (real) => (real <= 8 ? real : Math.min(15, 8 + Math.sqrt(real - 8) * 1.3))

const buildings = []
if (plateau?.buildings?.length) {
  const seenRings = new Set()
  plateau.buildings.forEach((b, i) => {
    const key = JSON.stringify(b.ring)
    if (seenRings.has(key)) return
    seenRings.add(key)
    const ring = b.ring.map(proj)
    if (ring.length < 4 || !nearFrame(ring)) return
    // Close the ring if the source didn't.
    const [fx, fy] = ring[0]
    const [lx, ly] = ring.at(-1)
    if (fx !== lx || fy !== ly) ring.push([fx, fy])
    fillPolygon([ring], T.BUILDING)
    const real = b.h > 0 ? b.h : b.st > 0 ? b.st * 3.3 : 8
    buildings.push({ p: flat(ring), h: r1(gameHeight(real)), v: hash(i + 1) % 8, ho: [] })
  })
  console.log(`Buildings from PLATEAU: ${buildings.length}`)
} else {
  const buildingWays = ways.filter(
    (e) => e.tags.building && isClosed(e) && !below(e.tags) && !['roof', 'no', 'canopy'].includes(e.tags.building),
  )
  for (const e of buildingWays) {
    const { outer, inner } = roleRings(e)
    if (!outer.length || !outer.some(nearFrame)) continue
    fillPolygon([...outer, ...inner], T.BUILDING)
    const levels = parseFloat(e.tags['building:levels'])
    const height = parseFloat(e.tags.height)
    const real = height > 0 ? height : levels > 0 ? levels * 3.2 : 8
    const v = hash(e.id) % 8
    for (const ring of outer)
      buildings.push({ p: flat(ring), h: r1(gameHeight(real)), v, ho: inner.filter((r) => r.length > 3).map(flat) })
  }
}

// --- 4. Trees -------------------------------------------------------------
const trees = []
const WALKABLE_FOR_TREE = [T.GROUND, T.FOOTWAY, T.GRASS, T.WOODS, T.SHRINE, T.PARKING, T.SIDEWALK]
const addTree = (x, y, s) => {
  if (x < 1 || y < 1 || x > FW - 1 || y > FH - 1) return
  if (!WALKABLE_FOR_TREE.includes(cellAt(x, y))) return
  trees.push(r1(x), r1(y), Math.round(s * 100) / 100)
}
// Mapped trees.
for (const n of elements) {
  if (n.type !== 'node' || n.tags.natural !== 'tree') continue
  const [x, y] = proj(n.pos)
  addTree(x, y, 0.9 + rand() * 0.4)
}
// Street trees along the edge of big roads' sidewalks, every ~10 m.
for (const r of roadWays) {
  const sw = SIDEWALK_M[r.tags.highway]
  if (!sw || sw < 3.5) continue
  const pts = r.geom.map(proj)
  const off = widthOf(r.tags) / 2 + 1
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    const nx = -(by - ay) / len
    const ny = (bx - ax) / len
    for (let d = 5; d < len - 3; d += 10) {
      const px = ax + ((bx - ax) * d) / len
      const py = ay + ((by - ay) * d) / len
      for (const side of [-1, 1]) {
        const tx = px + nx * off * side
        const ty = py + ny * off * side
        if (cellAt(tx, ty) === T.SIDEWALK) addTree(tx, ty, 0.8 + rand() * 0.3)
      }
    }
  }
}
// Woods are thick with trees; parks get scattered ones.
for (let y = 2; y < FH - 2; y += 4) {
  for (let x = 2; x < FW - 2; x += 4) {
    const jx = x + (rand() - 0.5) * 3
    const jy = y + (rand() - 0.5) * 3
    const c = cellAt(jx, jy)
    const p = rand()
    if ((c === T.WOODS && p < 0.6) || (c === T.GRASS && p < 0.12) || (c === T.SHRINE && p < 0.08))
      addTree(jx, jy, 0.9 + rand() * 0.6)
  }
}
for (let i = 0; i < trees.length; i += 3) {
  const x = Math.floor(trees[i] / cell)
  const y = Math.floor(trees[i + 1] / cell)
  setCell(x, y, T.TREE)
}

// --- Street-level data from Mapillary (optional) --------------------------
// Props where Mapillary's detectors saw street objects, and building wall
// colors measured from photos. See scripts/fetch-mapillary.mjs.
const mlyFile = `data/${AREA.id}.mapillary.json`
const mly = existsSync(mlyFile) ? JSON.parse(await readFile(mlyFile, 'utf8')) : null

// Mapillary class → prop kind the game knows how to draw.
function propKind(v, sign) {
  // A sign or light seen from behind is the same object as its front.
  if (v.endsWith('-back') || v.includes('--back')) return null
  if (sign) return 'sign'
  if (v.includes('street-light')) return 'streetlight'
  if (v.includes('utility-pole')) return 'pole'
  if (v.includes('traffic-light')) return 'trafficlight'
  if (v.includes('traffic-sign')) return 'sign'
  if (v.includes('bench')) return 'bench'
  if (v.includes('trash-can')) return 'bin'
  if (v.includes('fire-hydrant')) return 'hydrant'
  if (v.includes('mailbox')) return 'postbox'
  if (v.includes('bike-rack')) return 'bikerack'
  if (v.includes('phone-booth')) return 'phonebooth'
  if (v.includes('manhole')) return 'manhole'
  // Store signs, ads, cones, road markings and the like are left out for now.
  return null
}
// Mapillary can report one object several times from different photos.
const MIN_GAP_M = { streetlight: 4, pole: 4, trafficlight: 3, sign: 1.5, manhole: 1.5 }
const props = []
if (mly) {
  for (const f of mly.features) {
    const kind = propKind(f.v, f.sign)
    if (!kind) continue
    const [x, y] = proj([f.lat, f.lon])
    if (x < 1 || y < 1 || x > FW - 1 || y > FH - 1) continue
    // Detected positions are a few meters off at times; never put a prop
    // inside a building or in the middle of the road.
    const c = cellAt(x, y)
    if (c === T.BUILDING || c === T.WATER || (c === T.ROAD && kind !== 'trafficlight' && kind !== 'manhole')) continue
    // Face the nearest road, so lamp arms and signs point the right way.
    let rot = 0
    let bestD = Infinity
    for (let dy = -10; dy <= 10; dy++)
      for (let dx = -10; dx <= 10; dx++) {
        const d = dx * dx + dy * dy
        if (d < bestD && d > 0 && cellAt(x + dx * cell, y + dy * cell) === T.ROAD) {
          bestD = d
          rot = Math.atan2(dy, dx)
        }
      }
    const gap = MIN_GAP_M[kind] ?? 1.5
    if (props.some((p) => p.k === kind && Math.abs(p.x - x) < gap && Math.abs(p.y - y) < gap)) continue
    props.push({ k: kind, x: r1(x), y: r1(y), r: Math.round(rot * 100) / 100 })
  }
}

// Wall colors: cast each photo sample's ray and credit the first building
// wall it hits within 40 m.
const wallSamples = buildings.map(() => [])
if (mly) {
  const boxes = buildings.map((b) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < b.p.length; i += 2) {
      x0 = Math.min(x0, b.p[i])
      x1 = Math.max(x1, b.p[i])
      y0 = Math.min(y0, b.p[i + 1])
      y1 = Math.max(y1, b.p[i + 1])
    }
    return [x0, y0, x1, y1]
  })
  const RANGE = 40
  for (const smp of mly.samples) {
    const [ox, oy] = proj([smp.lat, smp.lon])
    // Compass bearing (clockwise from north) → direction in the map frame.
    const b = (smp.b * Math.PI) / 180
    const e = Math.sin(b)
    const n = Math.cos(b)
    const dx = e * cos + n * sin
    const dy = -(-e * sin + n * cos)
    let best = null
    for (let i = 0; i < buildings.length; i++) {
      const [x0, y0, x1, y1] = boxes[i]
      if (x1 < ox - RANGE || x0 > ox + RANGE || y1 < oy - RANGE || y0 > oy + RANGE) continue
      const p = buildings[i].p
      for (let k = 0; k + 3 < p.length; k += 2) {
        // Ray vs. segment intersection.
        const ax = p[k]
        const ay = p[k + 1]
        const ex = p[k + 2] - ax
        const ey = p[k + 3] - ay
        const den = dx * ey - dy * ex
        if (Math.abs(den) < 1e-9) continue
        const t = ((ax - ox) * ey - (ay - oy) * ex) / den
        const u = ((ax - ox) * dy - (ay - oy) * dx) / den
        if (t > 1 && t < RANGE && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, i }
      }
    }
    if (best) wallSamples[best.i].push(smp.c)
  }
}
function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return [f(0), f(8), f(4)]
}
let colored = 0
wallSamples.forEach((list, i) => {
  if (!list.length) return
  // Median per channel resists cars, people and shadows in the patch.
  const med = [0, 1, 2].map((ch) => {
    const vals = list.map((c) => c[ch]).sort((a, b) => a - b)
    return vals[Math.floor(vals.length / 2)]
  })
  // Photo patches often catch shade, windows or glare. Keep the hue, but
  // pull lightness and saturation into a range that reads as a painted wall.
  const [h, sat, l] = rgbToHsl(med)
  buildings[i].c = hslToRgb(h, Math.min(sat, 0.45), Math.min(0.85, Math.max(0.5, l)))
  buildings[i].n = list.length
  colored++
})
if (mly) console.log(`Mapillary: ${props.length} props placed, ${colored} buildings colored from photos`)

// --- Places and streets ---------------------------------------------------
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
const centroid = (ring) => {
  let sx = 0
  let sy = 0
  for (const p of ring) {
    sx += p[0]
    sy += p[1]
  }
  return [sx / ring.length, sy / ring.length]
}
const pois = []
for (const e of elements) {
  const name = e.tags.name
  if (!name || e.tags.highway || e.tags.route) continue
  const kind = kindOf(e.tags)
  if (!kind) continue
  const [x, y] = e.type === 'node' ? proj(e.pos) : centroid(ringsOf(e)[0] ?? [[-1, -1]])
  if (x < 0 || y < 0 || x >= FW || y >= FH) continue
  const poi = { name, kind, x: r1(x), y: r1(y) }
  const en = e.tags['name:en'] ?? e.tags['name:ja-Latn'] ?? e.tags['name:ja_rm']
  if (en && en !== name) poi.nameEn = en
  if (e.tags['name:ja-Hira']) poi.kana = e.tags['name:ja-Hira']
  if (e.tags.ref && kind === 'exit') poi.ref = e.tags.ref
  pois.push(poi)
}

const streets = []
for (const e of roadWays) {
  if (!e.tags.name) continue
  const s = { name: e.tags.name, pts: e.geom.map(proj).map(([x, y]) => [r1(x), r1(y)]) }
  if (e.tags['name:en']) s.nameEn = e.tags['name:en']
  streets.push(s)
}

// --- Spawn ----------------------------------------------------------------
const BLOCKED = new Set([T.BUILDING, T.WATER, T.TREE, T.VOID])
const [sx0, sy0] = proj([AREA.spawn.lat, AREA.spawn.lon]).map((v) => Math.floor(v / cell))
let spawn = null
for (let r = 0; !spawn && r < 200; r++) {
  for (let y = sy0 - r; y <= sy0 + r && !spawn; y++)
    for (let x = sx0 - r; x <= sx0 + r && !spawn; x++)
      if (x >= 0 && y >= 0 && x < GW && y < GH && !BLOCKED.has(grid[y * GW + x]))
        spawn = { x: (x + 0.5) * cell, y: (y + 0.5) * cell }
}

// --- Terrain ---------------------------------------------------------------
// PLATEAU's ground heights (from fetch-terrain.mjs), smoothed a little so
// retaining walls become short ramps. The game scales them down to match the
// shortened buildings (see TERRAIN_SCALE in src/game/map.ts).
const terrainFile = `data/${AREA.id}.terrain.json`
let terrain = null
/** Real height above sea level at a frame point, in meters. */
let terrainAt = () => 0
if (existsSync(terrainFile)) {
  const t = JSON.parse(await readFile(terrainFile, 'utf8'))
  const src = new Int16Array(new Uint8Array(Buffer.from(t.data, 'base64')).buffer)
  const { width: TW, height: TH } = t
  let cur = Float32Array.from(src)
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(cur.length)
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue
            sum += cur[yy * TW + xx]
            n++
          }
        next[y * TW + x] = sum / n
      }
    cur = next
  }
  terrainAt = (x, y) => {
    const fx = Math.min(Math.max(x / t.cell, 0), TW - 1.001)
    const fy = Math.min(Math.max(y / t.cell, 0), TH - 1.001)
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const i = y0 * TW + x0
    const a = cur[i] + (cur[i + 1] - cur[i]) * (fx - x0)
    const b = cur[i + TW] + (cur[i + TW + 1] - cur[i + TW]) * (fx - x0)
    return t.base + (a + (b - a) * (fy - y0)) / 10
  }
  const dm = Int16Array.from(cur, (v) => Math.round(v))
  terrain = {
    cell: t.cell,
    width: TW,
    height: TH,
    base: t.base,
    data: Buffer.from(dm.buffer).toString('base64'),
  }
  console.log(`Terrain ${TW}×${TH} at ${t.cell} m, ${t.base} m above sea level and up`)
}

// --- Bridges (PLATEAU) -----------------------------------------------------
// Viaducts and footbridges as 3D surfaces. Each corner's height above the
// ground is shrunk the same way as buildings, and set on the game's ground.
const TERRAIN_SCALE = 0.5 // keep in sync with src/game/map.ts
const bridgesFile = `data/${AREA.id}.bridges.json`
const bridgeData = existsSync(bridgesFile) ? JSON.parse(await readFile(bridgesFile, 'utf8')) : null
const bridges = []
const groundBase = terrain?.base ?? 0
for (const b of bridgeData?.bridges ?? []) {
  for (const ring of b.rings) {
    const out = []
    let inside = false
    for (let i = 0; i < ring.length; i += 3) {
      const [x, y] = proj([ring[i], ring[i + 1]])
      if (x > -20 && y > -20 && x < FW + 20 && y < FH + 20) inside = true
      const g = terrain ? terrainAt(x, y) : ring[i + 2]
      const above = ring[i + 2] - g
      const h = (g - groundBase) * TERRAIN_SCALE + (above > 0 ? gameHeight(above) : above * TERRAIN_SCALE)
      out.push(r1(x), r1(y), Math.round(h * 100) / 100)
    }
    if (inside && out.length >= 9) bridges.push(out)
  }
}

// The Shuto Expressway (首都高) isn't in PLATEAU's bridge models here, so its
// viaducts are built from OSM: a deck along each elevated motorway way, at a
// height from its layer, ramping down where it meets a ground-level road.
const motorways = ways.filter((e) => e.tags.highway?.startsWith('motorway') && !below(e.tags) && e.geom?.length > 1)
const key = (pos) => `${pos[0]},${pos[1]}`
const deckAt = new Map() // node → deck heights above ground (real m) of ways that end there
const groundEnds = new Set()
const deckOf = (e) => 8 + 5 * Math.max(1, Number(e.tags.layer ?? 1))
for (const e of motorways) {
  for (const pos of [e.geom[0], e.geom[e.geom.length - 1]]) {
    if (e.tags.bridge === 'yes') deckAt.set(key(pos), [...(deckAt.get(key(pos)) ?? []), deckOf(e)])
    else groundEnds.add(key(pos))
  }
}
const viaducts = []
for (const e of motorways) {
  if (e.tags.bridge !== 'yes') continue
  const pts = e.geom.map(proj)
  if (!nearFrame(pts)) continue
  // Height at each end: 0 if it lands on a ground-level road, else the
  // average of the decks that meet there.
  const endH = (pos) => {
    if (groundEnds.has(key(pos)) && (deckAt.get(key(pos))?.length ?? 0) < 2) return 0
    const list = deckAt.get(key(pos)) ?? [deckOf(e)]
    return list.reduce((a, b) => a + b, 0) / list.length
  }
  const h0 = endH(e.geom[0])
  const h1 = endH(e.geom[e.geom.length - 1])
  const mid = deckOf(e)
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lens[lens.length - 1] || 1
  const RAMP = 120 // meters to climb from the ground to a deck
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const d = lens[i]
    // Blend from each end's height to the way's own deck height.
    const t0 = Math.min(1, d / Math.min(RAMP, total / 2))
    const t1 = Math.min(1, (total - d) / Math.min(RAMP, total / 2))
    let real = mid
    if (h0 !== mid) real = h0 + (real - h0) * t0
    if (h1 !== mid) real = h1 + (real - h1) * Math.min(t1, 1)
    const [x, y] = pts[i]
    const g = terrain ? (terrainAt(x, y) - groundBase) * TERRAIN_SCALE : 0
    out.push(r1(x), r1(y), Math.round((g + gameHeight(real)) * 100) / 100)
  }
  viaducts.push({ p: out, w: r1(Math.max(widthOf(e.tags), (Number(e.tags.lanes) || 2) * 3.5 + 1.5)) })
}
console.log(`Shuto Expressway: ${viaducts.length} viaduct segments`)
if (bridgeData) console.log(`Bridges: ${bridges.length} surfaces from ${bridgeData.bridges.length} PLATEAU bridges`)

// --- Discoveries (Wikipedia) ----------------------------------------------
// Places with a Wikipedia article become discoveries; the best known become
// stamps in a stamp rally (スタンプラリー). Each sits on the nearest spot the
// player can reach, so walking up to it works.
const wikiFile = `data/${AREA.id}.wiki.json`
const wiki = existsSync(wikiFile) ? JSON.parse(await readFile(wikiFile, 'utf8')) : null
const discoveries = []
const WALKABLE = new Set([T.GROUND, T.ROAD, T.FOOTWAY, T.GRASS, T.CROSSING, T.PARKING, T.PITCH, T.SHRINE, T.SIDEWALK])
const reachable = (x, y) => {
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  for (let r = 0; r < 45; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const gx = cx + dx
        const gy = cy + dy
        if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue
        if (WALKABLE.has(grid[gy * GW + gx])) return [(gx + 0.5) * cell, (gy + 0.5) * cell]
      }
  return null
}
for (const p of wiki?.places ?? []) {
  const [x0, y0] = proj([p.lat, p.lon])
  if (x0 < 5 || y0 < 5 || x0 > FW - 5 || y0 > FH - 5) continue
  // Skip whole districts and the like: they're everywhere, not a spot.
  if (p.types.some((t) => /district|neighborhood|town|ward|city|chōme|human settlement|area/i.test(t))) continue
  const at = reachable(x0, y0)
  if (!at) continue
  const d = { id: p.id, x: r1(at[0]), y: r1(at[1]), ja: p.ja, links: p.links }
  if (p.en) d.en = p.en
  if (p.types[0]) d.kind = p.types[0]
  if (p.jaText) d.jt = p.jaText
  if (p.enText) d.et = p.enText
  d.jw = p.jaTitle
  if (p.enTitle) d.ew = p.enTitle
  // Several items can share a spot (a building and its museum): keep the first.
  if (discoveries.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < 6)) continue
  discoveries.push(d)
}
discoveries.sort((a, b) => b.links - a.links)
let stamps = 0
for (const d of discoveries) {
  if (stamps >= 10) break
  if (!d.en || !d.jt) continue
  if (discoveries.some((o) => o.stamp && Math.hypot(o.x - d.x, o.y - d.y) < 40)) continue
  d.stamp = 1
  stamps++
}
for (const d of discoveries) delete d.links
if (wiki) console.log(`Discoveries: ${discoveries.length}, stamps: ${discoveries.filter((d) => d.stamp).map((d) => d.ja).join('、')}`)

// --- Named slopes (坂) ----------------------------------------------------
// Tokyo names its slopes, and Minato-ku puts a small sign at each end with
// the name and a line of history. Readings and meanings for the ones around
// here; OSM rarely has them.
const SLOPE_INFO = {
  けやき坂: ['けやきざか', 'Keyaki-zaka', 'zelkova tree slope'],
  霞坂: ['かすみざか', 'Kasumi-zaka', 'mist slope'],
  寄席坂: ['よせざか', 'Yose-zaka', 'variety theater slope'],
  鳥居坂: ['とりいざか', 'Torii-zaka', 'shrine gate slope'],
  檜坂: ['ひのきざか', 'Hinoki-zaka', 'cypress slope'],
  宮村坂: ['みやむらざか', 'Miyamura-zaka', 'Miyamura slope'],
  本氷川坂: ['もとひかわざか', 'Motohikawa-zaka', 'original Hikawa (shrine) slope'],
  饂飩坂: ['うどんざか', 'Udon-zaka', 'udon noodle slope'],
  芋洗坂: ['いもあらいざか', 'Imoarai-zaka', 'potato washing slope'],
  永坂: ['ながさか', 'Naga-saka', 'long slope'],
  暗闇坂: ['くらやみざか', 'Kurayami-zaka', 'darkness slope'],
  乃木坂: ['のぎざか', 'Nogi-zaka', 'General Nogi slope'],
  なだれ坂: ['なだれざか', 'Nadare-zaka', 'sliding slope'],
  桜坂: ['さくらざか', 'Sakura-zaka', 'cherry blossom slope'],
  フランス坂: ['ふらんすざか', 'Furansu-zaka', 'France slope'],
  すべり坂: ['すべりざか', 'Suberi-zaka', 'slippery slope'],
  閻魔坂: ['えんまざか', 'Enma-zaka', 'King Enma (judge of the dead) slope'],
  牛坂: ['うしざか', 'Ushi-zaka', 'cow slope'],
  潮見坂: ['しおみざか', 'Shiomi-zaka', 'tide watching slope'],
  氷川坂: ['ひかわざか', 'Hikawa-zaka', 'Hikawa (shrine) slope'],
  於多福坂: ['おたふくざか', 'Otafuku-zaka', 'Otafuku (round-faced lucky woman) slope'],
  南部坂: ['なんぶざか', 'Nanbu-zaka', 'Nanbu (clan) slope'],
  丹波谷坂: ['たんばだにざか', 'Tanbadani-zaka', 'Tanba valley slope'],
  不動坂: ['ふどうざか', 'Fudō-zaka', 'Fudō (guardian deity) slope'],
  あひる坂: ['あひるざか', 'Ahiru-zaka', 'duck slope'],
}
// Way names that end in 坂, minus places named after one (赤坂, 乃木坂 the
// neighborhood) when they are a street's name rather than its slope name.
const slopeNames = (tags) =>
  [tags['incline:name'], ...(tags.name ?? '').split(/[／;/]/)]
    .map((n) => n?.trim())
    .filter((n) => n && n.endsWith('坂') && n.length <= 6 && n !== '赤坂')
const slopeWays = new Map()
for (const e of highways) {
  for (const n of new Set(slopeNames(e.tags))) {
    if (!slopeWays.has(n)) slopeWays.set(n, [])
    slopeWays.get(n).push(e)
  }
}
const slopes = []
const inFrame = ([x, y]) => x >= 2 && y >= 2 && x < FW - 2 && y < FH - 2
const freeSpot = (x, y, nx, ny, from) => {
  // Step out sideways from the middle of the road until off the roadway.
  for (let d = from; d < from + 8; d += 0.5) {
    for (const s of [1, -1]) {
      const px = x + nx * d * s
      const py = y + ny * d * s
      const gx = Math.floor(px / cell)
      const gy = Math.floor(py / cell)
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue
      const c = grid[gy * GW + gx]
      if (c === T.SIDEWALK || c === T.GROUND || c === T.FOOTWAY || c === T.GRASS || c === T.PARKING)
        return [px, py, Math.atan2(-ny * s, -nx * s)]
    }
  }
  return null
}
for (const [name, list] of slopeWays) {
  // All points of the slope inside the frame, with the next point along.
  const pts = []
  for (const e of list) {
    const p = e.geom.map(proj)
    for (let i = 0; i < p.length; i++) {
      if (!inFrame(p[i])) continue
      const q = p[i + 1] ?? p[i - 1]
      pts.push({ x: p[i][0], y: p[i][1], h: terrainAt(p[i][0], p[i][1]), q, w: widthOf(e.tags) })
    }
  }
  if (pts.length < 2) continue
  const lo = pts.reduce((a, b) => (b.h < a.h ? b : a))
  const hi = pts.reduce((a, b) => (b.h > a.h ? b : a))
  const signs = []
  for (const [end, top] of [
    [lo, 0],
    [hi, 1],
  ]) {
    const dx = end.q[0] - end.x
    const dy = end.q[1] - end.y
    const len = Math.hypot(dx, dy) || 1
    const spot = freeSpot(end.x, end.y, -dy / len, dx / len, end.w / 2 + 0.5)
    if (spot) signs.push({ x: r1(spot[0]), y: r1(spot[1]), r: Math.round(spot[2] * 100) / 100, top })
  }
  if (Math.hypot(lo.x - hi.x, lo.y - hi.y) < 30 && signs.length > 1) signs.pop()
  if (!signs.length) continue
  const info = SLOPE_INFO[name]
  const slope = { name, rise: r1(hi.h - lo.h), signs }
  if (info) Object.assign(slope, { kana: info[0], en: info[1], gloss: info[2] })
  slopes.push(slope)
}
console.log(`${slopes.length} named slopes:`, slopes.map((s) => `${s.name} ${s.rise} m`).join(', '))

// --- Output ---------------------------------------------------------------
// Run-length encode the grid as (value, count ≤ 255) byte pairs.
const rle = []
for (let i = 0; i < grid.length; ) {
  const v = grid[i]
  let n = 1
  while (i + n < grid.length && grid[i + n] === v && n < 255) n++
  rle.push(v, n)
  i += n
}

const counts = Object.fromEntries(Object.keys(T).map((k) => [k, 0]))
const names = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]))
for (const t of grid) counts[names[t]]++

await writeFile(
  output,
  JSON.stringify({
    version: 2,
    id: AREA.id,
    name: AREA.name,
    nameEn: AREA.nameEn,
    attribution: osm.attribution,
    credits: [osm.attribution, plateau?.buildings?.length || terrain ? '3D都市モデル（Project PLATEAU）国土交通省' : null, mly?.attribution, wiki ? wiki.attribution : null].filter(Boolean),
    fetchedAt: osm.fetchedAt,
    rotationDeg: AREA.rotationDeg,
    width: FW,
    height: FH,
    spawn,
    grid: { cell, width: GW, height: GH, rle: Buffer.from(rle).toString('base64') },
    buildings,
    roads,
    paths,
    areas,
    trees,
    props,
    pois,
    streets,
    slopes,
    discoveries,
    bridges,
    viaducts,
    terrain,
  }),
)
console.log(`Built ${FW}×${FH} m map → ${output}`)
console.log(
  `${buildings.length} buildings, ${roads.length} roads, ${paths.length} paths, ${areas.length} areas, ${trees.length / 3} trees`,
)
console.log(`${pois.length} places, ${streets.length} named street segments, spawn at`, spawn)
console.log('Grid cells:', counts)
