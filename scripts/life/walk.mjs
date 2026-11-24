// Where people can walk, and the way from one point to another. Built from
// the game map's 1 m grid (data/<area>.map.json): pavements, footpaths,
// plazas and zebra crossings are walkable; small back streets are walkable
// but avoided (Tokyo's lanes have no pavement, people walk in the road);
// big roads can only be crossed at a zebra.
//
// Used ahead of time by the scripts that write people's days, so the game
// gets each walk as a ready-made line and never has to search the map.
import { readFile } from 'node:fs/promises'

// Tile codes, as in build-map.mjs.
const T = { VOID: 0, GROUND: 1, ROAD: 2, FOOTWAY: 3, GRASS: 4, WATER: 5, BUILDING: 6, TREE: 7, CROSSING: 8, PARKING: 9, WOODS: 10, PITCH: 11, SHRINE: 12, SIDEWALK: 13 }

/** Cost of a meter on each kind of cell; missing = can't walk there. */
const COST = {
  [T.SIDEWALK]: 1,
  [T.FOOTWAY]: 1,
  [T.CROSSING]: 1,
  [T.GROUND]: 1.2,
  [T.SHRINE]: 1.2,
  [T.PARKING]: 1.6,
  [T.GRASS]: 3,
  [T.ROAD]: 2.5, // a back street; big roads are blocked below
}
// Roads people don't walk along or across except at a crossing.
const BIG_ROADS = /^(motorway|trunk|primary|secondary|tertiary)/

/** Cells people stand on comfortably (for doors and meeting points). */
export const PAVED = new Set([T.SIDEWALK, T.FOOTWAY, T.GROUND, T.SHRINE, T.PARKING])

export async function loadWalkGrid(areaId) {
  const map = JSON.parse(await readFile(`data/${areaId}.map.json`, 'utf8'))
  const { width: W, height: H, rle } = map.grid
  const cells = new Uint8Array(W * H)
  const b = Buffer.from(rle, 'base64')
  for (let i = 0, o = 0; i < b.length; i += 2) {
    cells.fill(b[i], o, o + b[i + 1])
    o += b[i + 1]
  }
  // Cost per cell, 0 = blocked.
  const cost = new Float32Array(W * H)
  for (let i = 0; i < cells.length; i++) cost[i] = COST[cells[i]] ?? 0
  // Block big roads (not their zebra crossings, not bridges overhead).
  // Everything inside the carriageway goes, not only road cells: OSM often
  // draws a footpath or a pavement corner a little inside the road, and a
  // walker on it looks like they're walking down the middle of the street.
  // crossing: 0, or 1 + the axis of the road a zebra cell crosses (0 east-
  // west, 1 north-south), for waiting at the lights.
  const crossing = new Uint8Array(W * H)
  for (const r of map.roads) {
    if (r.b || !BIG_ROADS.test(r.t)) continue
    const half = r.w / 2
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const axis = Math.abs(r.p[i + 2] - r.p[i]) >= Math.abs(r.p[i + 3] - r.p[i + 1]) ? 0 : 1
      stroke(r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], half, (j) => {
        if (cells[j] === T.CROSSING) crossing[j] = 1 + axis
        else cost[j] = 0
      })
    }
  }
  // Traffic lights (the points of a road the cars stop at).
  const lights = []
  for (const r of map.roads) for (const i of r.sg ?? []) lights.push(r.p[i * 2], r.p[i * 2 + 1])
  function stroke(ax, ay, bx, by, half, fn) {
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - half))
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + half))
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - half))
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by) + half))
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy || 1
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2))
        if (Math.hypot(ax + dx * t - x - 0.5, ay + dy * t - y - 0.5) <= half) fn(y * W + x)
      }
  }
  // The one connected walkable area everything should join up through;
  // specks of pavement shut in by buildings or big roads don't count.
  const main = new Uint8Array(W * H)
  const comp = new Int32Array(W * H).fill(-1)
  let best = -1
  let bestN = 0
  for (let s = 0, id = 0; s < W * H; s++, id++) {
    if (!cost[s] || comp[s] >= 0) continue
    let n = 0
    const st = [s]
    comp[s] = id
    while (st.length) {
      const i = st.pop()
      n++
      const x = i % W
      const y = (i / W) | 0
      for (const j of [x + 1 < W && i + 1, x > 0 && i - 1, y + 1 < H && i + W, y > 0 && i - W])
        if (j !== false && cost[j] && comp[j] < 0) {
          comp[j] = id
          st.push(j)
        }
    }
    if (n > bestN) [bestN, best] = [n, id]
  }
  for (let i = 0; i < W * H; i++) if (comp[i] === best) main[i] = 1
  return { W, H, cells, cost, main, map, crossing, lights }
}

/** Nearest cell to (x, y) that passes `ok`, searching outward up to `max` m. */
export function nearestCell(grid, x, y, ok, max = 60) {
  const { W, H } = grid
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  for (let r = 0; r <= max; r++) {
    let best = null
    let bd = Infinity
    for (let yy = cy - r; yy <= cy + r; yy++)
      for (let xx = cx - r; xx <= cx + r; xx++) {
        if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== r) continue
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !ok(yy * W + xx)) continue
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y)
        if (d < bd) [bd, best] = [d, { x: xx + 0.5, y: yy + 0.5 }]
      }
    if (best) return best
  }
  return null
}

/**
 * The walk from a to b: a line of points [x0, y0, x1, y1, …] in map meters
 * and its length, or null when there's no way through.
 */
export function route(grid, a, b) {
  const { W, H, cost } = grid
  const start = Math.floor(a.y) * W + Math.floor(a.x)
  const goal = Math.floor(b.y) * W + Math.floor(b.x)
  if (!cost[start] || !cost[goal]) return null
  const gx = goal % W
  const gy = (goal / W) | 0
  // A* over the grid, 8 neighbours, with a binary heap.
  const g = new Float64Array(W * H).fill(Infinity)
  const done = new Uint8Array(W * H)
  const from = new Int32Array(W * H).fill(-1)
  const heap = new Heap()
  g[start] = 0
  heap.push(start, 0)
  const STEPS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ]
  let found = false
  while (heap.size) {
    const i = heap.pop()
    if (done[i]) continue
    done[i] = 1
    if (i === goal) {
      found = true
      break
    }
    const x = i % W
    const y = (i / W) | 0
    for (const [dx, dy, d] of STEPS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (!cost[j] || done[j]) continue
      // No cutting corners past a wall.
      if (dx && dy && (!cost[y * W + nx] || !cost[ny * W + x])) continue
      const ng = g[i] + d * (cost[i] + cost[j]) * 0.5
      if (ng >= g[j]) continue
      g[j] = ng
      from[j] = i
      heap.push(j, ng + Math.hypot(nx - gx, ny - gy))
    }
  }
  if (!found) return null
  const cellsOnPath = []
  for (let i = goal; i !== -1; i = from[i]) cellsOnPath.push(i)
  cellsOnPath.reverse()
  const pts = smooth(grid, cellsOnPath.map((i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5]))
  pts[0] = [a.x, a.y]
  pts[pts.length - 1] = [b.x, b.y]
  let len = 0
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
  return { p: pts.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), len: Math.round(len) }
}

/** Drop points a walker can skip: keep a corner only where the straight line
 * would leave cells of the same cost (so a walk keeps to the pavement). */
function smooth(grid, pts) {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  let k = 0
  while (k < pts.length - 1) {
    let far = k + 1
    for (let m = pts.length - 1; m > k + 1; m--)
      if (clear(grid, pts[k], pts[m])) {
        far = m
        break
      }
    out.push(pts[far])
    k = far
  }
  return out
}

function clear(grid, [ax, ay], [bx, by]) {
  const { W, cost } = grid
  const c0 = cost[Math.floor(ay) * W + Math.floor(ax)]
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2)
  for (let s = 1; s < n; s++) {
    const x = ax + ((bx - ax) * s) / n
    const y = ay + ((by - ay) * s) / n
    const c = cost[Math.floor(y) * W + Math.floor(x)]
    if (!c || c > c0 + 0.01) return false
  }
  return true
}

class Heap {
  constructor() {
    this.ids = []
    this.keys = []
  }
  get size() {
    return this.ids.length
  }
  push(id, key) {
    const { ids, keys } = this
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }
  pop() {
    const { ids, keys } = this
    const top = ids[0]
    const id = ids.pop()
    const key = keys.pop()
    if (ids.length) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= ids.length) break
        if (c + 1 < ids.length && keys[c + 1] < keys[c]) c++
        if (keys[c] >= key) break
        ids[i] = ids[c]
        keys[i] = keys[c]
        i = c
      }
      ids[i] = id
      keys[i] = key
    }
    return top
  }
}

/** Lights this close to a zebra (m) control it. */
const LIGHT_NEAR = 30

/**
 * The zebras a walk crosses big roads on, as [from, to, axis, lights, x]:
 * meters along the walk where it steps onto and off the zebra, the axis of
 * the road (0 east-west, 1 north-south), 1 if traffic lights control it
 * (the walker waits for the green man) else 0, and the zebra's x, which the
 * lights' timing depends on (traffic.ts signalState).
 */
export function crossingsOf(grid, p) {
  const { W, crossing, lights } = grid
  const out = []
  let run = null
  let d = 0
  const close = () => {
    if (run && run.to - run.from >= 2) {
      const axis = run.axis[1] >= run.axis[0] ? 1 : 0
      let lit = 0
      for (let i = 0; i < lights.length && !lit; i += 2) if (Math.hypot(lights[i] - run.x, lights[i + 1] - run.y) < LIGHT_NEAR) lit = 1
      out.push([Math.round(run.from * 10) / 10, Math.round(run.to * 10) / 10, axis, lit, Math.round(run.x)])
    }
    run = null
  }
  for (let i = 2; i < p.length; i += 2) {
    const dx = p[i] - p[i - 2]
    const dy = p[i + 1] - p[i - 1]
    const s = Math.hypot(dx, dy)
    for (let t = 0; t < s; t += 0.25) {
      const x = p[i - 2] + (dx * t) / s
      const y = p[i - 1] + (dy * t) / s
      const c = crossing[Math.floor(y) * W + Math.floor(x)]
      if (c) {
        // A gap of a meter or two (a kerb, a gap in the paint) is still the same zebra.
        if (run && d + t - run.to > 2) close()
        run ??= { from: d + t, to: d + t, axis: [0, 0], x, y }
        run.to = d + t
        run.axis[c - 1]++
        if (run.axis[c - 1] === 4) [run.x, run.y] = [x, y]
      }
    }
    d += s
  }
  close()
  return out
}
