import * as THREE from 'three'
import type { MapTile, Poi } from '../map'
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
