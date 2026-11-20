// Cuts the built map (data/<area>.map.json) into square tiles the game
// streams around the player: public/tiles/<area>/manifest.json plus one
// <col>_<row>.json per tile. A tile holds every shape that touches its
// square, and the game clips drawing to the square, so roads and buildings
// that cross a tile edge join up seamlessly.
//
// The tiles are static files: today they're served with the game, later
// from Cloudflare R2 (set VITE_TILES_URL).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { AREA } from './area.mjs'

export const TILE = 256 // meters
const TERRAIN_MARGIN = 64 // meters of terrain kept around each tile

const input = process.argv[2] ?? `data/${AREA.id}.map.json`
const outDir = process.argv[3] ?? `public/tiles/${AREA.id}`
const map = JSON.parse(await readFile(input, 'utf8'))
const cols = Math.ceil(map.width / TILE)
const rows = Math.ceil(map.height / TILE)

// Ground types, decoded from run lengths.
const { cell, width: GW, height: GH } = map.grid
const grid = new Uint8Array(GW * GH)
{
  const b = Buffer.from(map.grid.rle, 'base64')
  let o = 0
  for (let i = 0; i < b.length; i += 2) {
    grid.fill(b[i], o, o + b[i + 1])
    o += b[i + 1]
  }
}
const rle = (cells) => {
  const out = []
  for (let i = 0; i < cells.length; ) {
    const v = cells[i]
    let n = 1
    while (i + n < cells.length && cells[i + n] === v && n < 255) n++
    out.push(v, n)
    i += n
  }
  return Buffer.from(out).toString('base64')
}

// Terrain heights (Int16 decimeters), decoded once.
const terrain = map.terrain
const th = terrain ? new Int16Array(Uint8Array.from(Buffer.from(terrain.data, 'base64')).buffer) : null

/** Bounding box of flat [x, y, ...] points with a given stride. */
const bbox = (p, stride = 2) => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < p.length; i += stride) {
    x0 = Math.min(x0, p[i])
    x1 = Math.max(x1, p[i])
    y0 = Math.min(y0, p[i + 1])
    y1 = Math.max(y1, p[i + 1])
  }
  return [x0, y0, x1, y1]
}
// Shapes may reach a little past their points (road width, a viaduct's
// deck), so test with a margin.
const touches = ([x0, y0, x1, y1], tx0, ty0, pad) => x1 >= tx0 - pad && x0 <= tx0 + TILE + pad && y1 >= ty0 - pad && y0 <= ty0 + TILE + pad
const inside = (x, y, tx0, ty0) => x >= tx0 && x < tx0 + TILE && y >= ty0 && y < ty0 + TILE

const boxes = {
  buildings: map.buildings.map((b) => bbox(b.p)),
  roads: map.roads.map((r) => bbox(r.p)),
  paths: map.paths.map((p) => bbox(p.p)),
  areas: map.areas.map((a) => bbox(a.p)),
  bridges: (map.bridges ?? []).map((b) => bbox(b, 3)),
  viaducts: (map.viaducts ?? []).map((v) => bbox(v.p, 3)),
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const tiles = []
let bytes = 0
for (let row = 0; row < rows; row++)
  for (let col = 0; col < cols; col++) {
    const x0 = col * TILE
    const y0 = row * TILE
    const pick = (list, key, pad) => list.filter((_, i) => touches(boxes[key][i], x0, y0, pad))

    // Buildings that touch the square, plus any a sign in it hangs on.
    const signs = (map.signs ?? []).filter((s) => inside(s.x, s.y, x0, y0))
    const keep = new Set()
    map.buildings.forEach((_, i) => touches(boxes.buildings[i], x0, y0, 0) && keep.add(i))
    for (const s of signs) if (s.b >= 0) keep.add(s.b)
    const order = [...keep].sort((a, b) => a - b)
    const local = new Map(order.map((g, i) => [g, i]))

    const trees = []
    for (let i = 0; i < map.trees.length; i += 3)
      if (inside(map.trees[i], map.trees[i + 1], x0, y0)) trees.push(map.trees[i], map.trees[i + 1], map.trees[i + 2])

    // Ground types for exactly this square.
    const gx0 = Math.floor(x0 / cell)
    const gy0 = Math.floor(y0 / cell)
    const gw = Math.min(GW, Math.floor((x0 + TILE) / cell)) - gx0
    const gh = Math.min(GH, Math.floor((y0 + TILE) / cell)) - gy0
    const cells = new Uint8Array(gw * gh)
    for (let y = 0; y < gh; y++) cells.set(grid.subarray((gy0 + y) * GW + gx0, (gy0 + y) * GW + gx0 + gw), y * gw)

    // Terrain points over the square and a margin around it, so shapes
    // that cross the edge (a building's base) get the same heights in both
    // tiles. Heights are shared, so the ground meets exactly at the edge.
    let tTerrain
    if (terrain) {
      const c = terrain.cell
      const m = Math.ceil(TERRAIN_MARGIN / c)
      const ox = Math.max(0, Math.floor(x0 / c) - m)
      const oy = Math.max(0, Math.floor(y0 / c) - m)
      const w = Math.min(terrain.width - 1, Math.ceil((x0 + TILE) / c) + m) - ox + 1
      const h = Math.min(terrain.height - 1, Math.ceil((y0 + TILE) / c) + m) - oy + 1
      const part = new Int16Array(w * h)
      for (let y = 0; y < h; y++) part.set(th.subarray((oy + y) * terrain.width + ox, (oy + y) * terrain.width + ox + w), y * w)
      tTerrain = { cell: c, ox, oy, width: w, height: h, base: terrain.base, data: Buffer.from(part.buffer).toString('base64') }
    }

    const tile = {
      col,
      row,
      x0,
      y0,
      size: TILE,
      grid: { cell, ox: gx0, oy: gy0, width: gw, height: gh, rle: rle(cells) },
      terrain: tTerrain,
      buildings: order.map((i) => map.buildings[i]),
      roads: pick(map.roads, 'roads', 20),
      paths: pick(map.paths, 'paths', 6),
      areas: pick(map.areas, 'areas', 0),
      bridges: pick(map.bridges ?? [], 'bridges', 0),
      viaducts: pick(map.viaducts ?? [], 'viaducts', 20),
      trees,
      props: (map.props ?? []).filter((p) => inside(p.x, p.y, x0, y0)),
      pois: map.pois.filter((p) => inside(p.x, p.y, x0, y0)),
      signs: signs.map((s) => ({ ...s, b: s.b >= 0 ? local.get(s.b) : -1 })),
    }
    const json = JSON.stringify(tile)
    bytes += json.length
    await writeFile(`${outDir}/${col}_${row}.json`, json)
    tiles.push([col, row])
  }

// Everything that isn't tied to one square: the area itself, and the small
// lists the HUD needs everywhere (street names, slopes, the stamp rally).
const manifest = {
  version: 3,
  id: map.id,
  name: map.name,
  nameEn: map.nameEn,
  attribution: map.attribution,
  credits: map.credits,
  fetchedAt: map.fetchedAt,
  builtAt: new Date().toISOString(),
  rotationDeg: map.rotationDeg,
  width: map.width,
  height: map.height,
  spawn: map.spawn,
  cell,
  tile: TILE,
  cols,
  rows,
  tiles,
  streets: map.streets,
  slopes: map.slopes ?? [],
  discoveries: map.discoveries ?? [],
  stations: map.stations ?? [],
}
await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest))
console.log(`Cut ${map.width}×${map.height} m into ${tiles.length} tiles of ${TILE} m (${(bytes / 1e6).toFixed(1)} MB) → ${outDir}`)
