import * as THREE from 'three'
import { isBlocked, type GameMap, type MapTile, type Poi } from '../map'
import { seeThroughGlsl, type SeeThroughUniforms } from '../seeThrough'

// Shared bits for hand-made landmarks (ALMOND, Maman, Mori Tower, ...):
// finding a place's building among the loaded tiles, and materials that get
// the same see-through hole as the map's buildings.

export type Ring = [number, number][]

export const ringOf = (p: number[]): Ring => {
  const r: Ring = []
  for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i], p[i + 1]])
  const [a, b] = [r[0], r[r.length - 1]]
  if (r.length > 1 && a[0] === b[0] && a[1] === b[1]) r.pop()
  return r
}

export function inside(r: Ring, x: number, y: number) {
  let hit = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

export const segDist = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9)))
  return Math.hypot(ax + t * dx - x, ay + t * dy - y)
}

/** Signed area of a ring (positive = counter-clockwise in map x/y). */
export function ringArea(r: Ring) {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const [ax, ay] = r[i]
    const [bx, by] = r[(i + 1) % r.length]
    a += ax * by - bx * ay
  }
  return a / 2
}

export const texture = (cv: HTMLCanvasElement, repeat = false) => {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function canvas(w: number, h: number) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return [cv, cv.getContext('2d')!] as const
}

/** Adds the see-through hole to a material, as the map's buildings have. */
export function seeThrough<M extends THREE.Material>(m: M, uniforms: SeeThroughUniforms, base: number, opts?: Parameters<typeof seeThroughGlsl>[0]) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPlayer; uniform vec3 uCam; varying vec3 vWorld;\nconst float vBase = ${base.toFixed(2)};`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${seeThroughGlsl(opts)}`)
  }
  m.customProgramCacheKey = () => `see-${base.toFixed(2)}-${JSON.stringify(opts ?? {})}`
  return m
}

/** A point of interest by name among the loaded tiles, and its tile. */
export function findPoi(tiles: MapTile[], name: string | RegExp): { tile: MapTile; poi: Poi } | null {
  for (const tile of tiles) {
    const poi = tile.pois.find((p) => (typeof name === 'string' ? p.name === name : name.test(p.name)))
    if (poi) return { tile, poi }
  }
  return null
}

/** The building a point is in, on a tile. */
export function buildingAt(tile: MapTile, x: number, y: number) {
  return tile.buildings.find((o) => inside(ringOf(o.p), x, y))
}

/** Collects things to dispose of when a landmark is rebuilt. */
export class Bin {
  private items: { dispose(): void }[] = []
  add<T extends { dispose(): void }>(t: T) {
    this.items.push(t)
    return t
  }
  dispose() {
    this.items.forEach((d) => d.dispose())
    this.items = []
  }
}

/** The building nearest a point: the one it's in, or one within `r` m. */
export function buildingNear(tile: MapTile, x: number, y: number, r = 6) {
  const hit = buildingAt(tile, x, y)
  if (hit) return hit
  let best: MapTile['buildings'][number] | undefined
  let bd = r
  for (const b of tile.buildings) {
    const g = ringOf(b.p)
    for (let i = 0; i < g.length; i++) {
      const [ax, ay] = g[i]
      const [bx, by] = g[(i + 1) % g.length]
      const d = segDist(x, y, ax, ay, bx, by)
      if (d < bd) [bd, best] = [d, b]
    }
  }
  return best
}

/** One wall with open ground in front: its ends as seen from outside
 *  (left, right), length and outward normal. */
export interface OpenWall {
  l: [number, number]
  r: [number, number]
  len: number
  n: [number, number]
}

/** The walls of a building that face open ground (no building in front,
 *  on this tile or any other). */
export function openWalls(map: GameMap, tile: MapTile, b: MapTile['buildings'][number], minLen = 1.5): OpenWall[] {
  const ring = ringOf(b.p)
  const ccw = ringArea(ring) > 0
  const others = tile.buildings.filter((o) => o !== b).map((o) => ringOf(o.p))
  const out: OpenWall[] = []
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % ring.length]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < minLen) continue
    const dx = (bx - ax) / len
    const dy = (by - ay) / len
    const n: [number, number] = ccw ? [dy, -dx] : [-dy, dx]
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    const open = (d: number) => !isBlocked(map, mx + n[0] * d, my + n[1] * d) && !others.some((o) => inside(o, mx + n[0] * d, my + n[1] * d))
    if (!open(1.2) || !open(3)) continue
    const aLeft = (bx - ax) * n[1] + (by - ay) * -n[0] > 0
    out.push({
      l: aLeft ? [ax, ay] : [bx, by],
      r: aLeft ? [bx, by] : [ax, ay],
      len,
      n,
    })
  }
  return out
}

/**
 * A rectangular ground-floor room behind a stretch of wall: the door at
 * `at` on the wall (map meters), `a` along the wall and `b` into the
 * building, as large as fits inside the outline up to the limits given.
 */
export function fitRoom(ring: Ring, w: OpenWall, at: [number, number], maxHalf: number, maxDepth: number) {
  // Into the building is -n; (-uy, ux) = -n.
  const ux = -w.n[1]
  const uy = w.n[0]
  const [mx, my] = at
  const toMap = (a: number, bb: number): [number, number] => [mx + a * ux - bb * uy, my + a * uy + bb * ux]
  const isIn = (a: number, bb: number) => inside(ring, ...toMap(a, bb))
  // How far the wall reaches either side of the door.
  const along = (x: number, y: number) => (x - mx) * ux + (y - my) * uy
  const ends = [along(...w.l), along(...w.r)].sort((p, q) => p - q)
  let a0 = Math.max(-maxHalf, ends[0] + 0.4)
  let a1 = Math.min(maxHalf, ends[1] - 0.4)
  let depth = 2
  for (let d = 2.5; d <= maxDepth; d += 0.5) {
    let ok = true
    for (let a = a0; a <= a1 + 1e-6; a += 0.5) if (!isIn(a, d + 0.4)) ok = false
    if (!ok) break
    depth = d
  }
  while (a1 - a0 > 5 && ![0.5, depth / 2, depth].every((d) => isIn(a0 - 0.3, d) && isIn(a1 + 0.3, d))) {
    a0 += 0.25
    a1 -= 0.25
  }
  return {
    x: mx,
    y: my,
    ux,
    uy,
    a0: +a0.toFixed(2),
    a1: +a1.toFixed(2),
    depth,
    toMap,
  }
}
