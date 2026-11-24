import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildingBase } from '../geometry'
import type { InteriorPlace } from '../interior'
import { groundAt, isBlocked, tileGroundAt, type GameMap, type MapTile } from '../map'
import { seeThroughUniforms } from '../seeThrough'
import type { Focus } from '../World'
import { Bin, canvas, findPoi, inside, ringArea, ringOf, seeThrough, texture, type Ring } from './common'

// 国立新美術館, The National Art Center, Tokyo (Kisho Kurokawa, opened
// January 2007): the museum behind the great undulating wall of glass on
// the north-west edge of Roppongi. The wave is the map's own outline (the
// run of short wall segments), so it's dressed in glass with fine
// horizontal louvers, glowing softly after dark, and the main entrance gets
// its glass cone. Behind the glass is the atrium, which you can walk into
// (interiors/nact.ts): the floor follows the wave, and the two inverted
// concrete cones rise from it.

const NAME = '国立新美術館'
const OUT = 0.06
/** Walls shorter than this can be part of the wave's polyline. */
const WAVE_SEG = 12
/** The atrium reaches this far behind the deepest point of the wave. */
const ATRIUM_DEPTH = 10
/** Below this footprint (m²) the building is taken to be all atrium. */
const THIN_AREA = 3000

interface Plan {
  ring: Ring
  base: number
  h: number
  /** Wave vertices, in order along the wall. */
  wave: [number, number][]
  /** Outward normal at each wave vertex. */
  normals: [number, number][]
  door: InteriorPlace
  /** How many wave walls face open ground: picks the front building. */
  opens: number
}

function plan(map: GameMap, tile: MapTile, b: MapTile['buildings'][number]): Plan | null {
  const ring = ringOf(b.p)
  if (ring.length < 8) return null
  const ccw = ringArea(ring) > 0
  const n = ring.length
  const height = (x: number, y: number) => tileGroundAt(tile, x, y)
  const base = buildingBase(b.p, height)
  const edgeLen = (i: number) => {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % n]
    return Math.hypot(bx - ax, by - ay)
  }
  const outward = (i: number): [number, number] => {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % n]
    const l = edgeLen(i) || 1
    return ccw ? [(by - ay) / l, -(bx - ax) / l] : [-(by - ay) / l, (bx - ax) / l]
  }
  const open = (i: number) => {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % n]
    const [nx, ny] = outward(i)
    const mx = (ax + bx) / 2 + nx * 2
    const my = (ay + by) / 2 + ny * 2
    return !isBlocked(map, mx, my)
  }
  // The wave: the longest run of open walls built of short segments (the
  // map draws the curve as a polyline). On the map the glass atrium is its
  // own crescent in front of the galleries, so its outer side is the run.
  const ok = ring.map((_, i) => edgeLen(i) < WAVE_SEG && open(i))
  let best: [number, number] = [0, 0]
  for (let s = 0; s < n; s++) {
    if (!ok[s] || ok[(s + n - 1) % n]) continue
    let k = 0
    while (k < n && ok[(s + k) % n]) k++
    if (k > best[1]) best = [s, k]
  }
  if (best[1] < 8) return null
  const opens = best[1]
  const wave: [number, number][] = []
  const normals: [number, number][] = []
  for (let k = 0; k <= best[1]; k++) {
    const i = (best[0] + k) % n
    wave.push(ring[i])
    const a = outward((i + n - 1) % n)
    const c = outward(i % n)
    const m = Math.hypot(a[0] + c[0], a[1] + c[1]) || 1
    normals.push(k === 0 ? c : k === best[1] ? outward((i + n - 1) % n) : [(a[0] + c[0]) / m, (a[1] + c[1]) / m])
  }
  // The axis of the wave, and inward across it.
  const [sx, sy] = wave[0]
  const [ex, ey] = wave[wave.length - 1]
  const al = Math.hypot(ex - sx, ey - sy) || 1
  let u: [number, number] = [(ex - sx) / al, (ey - sy) / al]
  let v: [number, number] = [-u[1], u[0]]
  // v must point into the building.
  const mid = wave[Math.floor(wave.length / 2)]
  if (!inside(ring, mid[0] + v[0] * 2, mid[1] + v[1] * 2)) v = [-v[0], -v[1]]
  // Keep (u, v) a right-handed pair like the other interiors: v = (-u.y, u.x).
  if (Math.abs(v[0] + u[1]) > 1e-6) u = [-u[0], -u[1]]
  const depth = (x: number, y: number) => (x - sx) * v[0] + (y - sy) * v[1]
  const back = Math.max(...wave.map(([x, y]) => depth(x, y))) + ATRIUM_DEPTH
  const inner = wave.map(([x, y], k) => [x - normals[k][0] * 0.5, y - normals[k][1] * 0.5] as [number, number])
  // Floor: a thin building (the crescent) is all atrium, so the floor is its
  // outline pulled in a little. Otherwise the wave, then back along a
  // straight wall, pulled in until it's inside.
  let poly: [number, number][]
  if (Math.abs(ringArea(ring)) < THIN_AREA) {
    poly = ring.map((_, j) => {
      const i = (best[0] + j) % n
      const [x, y] = ring[i]
      const a = outward((i + n - 1) % n)
      const c = outward(i)
      return [x - (a[0] + c[0]) * 0.25, y - (a[1] + c[1]) * 0.25] as [number, number]
    })
  } else {
    const toBack = ([x, y]: [number, number]): [number, number] => {
      const d = back - depth(x, y)
      return [x + v[0] * d, y + v[1] * d]
    }
    poly = [...inner, toBack(inner[inner.length - 1]), toBack(inner[0])]
    for (let t = 0; t < 12 && !poly.slice(-2).every(([x, y]) => inside(ring, x, y)); t++) {
      for (const k of [poly.length - 2, poly.length - 1]) {
        poly[k] = [poly[k][0] - v[0], poly[k][1] - v[1]]
      }
    }
  }
  /** Meters of floor straight in from the glass at (x, y). */
  const thickness = (x: number, y: number) => {
    let d = 0.5
    while (d < 40 && inside(poly, x + v[0] * d, y + v[1] * d)) d += 0.5
    return d - 0.5
  }
  // The door: the middle of the wave by length.
  let total = 0
  const lens = wave.slice(1).map(([x, y], k) => Math.hypot(x - wave[k][0], y - wave[k][1]))
  for (const l of lens) total += l
  let acc = 0
  let dk = 0
  for (; dk < lens.length && acc + lens[dk] < total / 2; dk++) acc += lens[dk]
  const t = (total / 2 - acc) / (lens[dk] || 1)
  const [dx0, dy0] = wave[dk]
  const [dx1, dy1] = wave[Math.min(dk + 1, wave.length - 1)]
  const door: [number, number] = [dx0 + (dx1 - dx0) * t, dy0 + (dy1 - dy0) * t]
  const doorZ = height(door[0] - v[0] * 2, door[1] - v[1] * 2)
  // Spots along the atrium, by how far along the wave axis they are.
  const along = (x: number, y: number) => (x - sx) * u[0] + (y - sy) * u[1]
  const L = Math.abs(along(ex, ey))
  const atAlong = (f: number, dv: number): [number, number] => {
    // f: 0..1 along the axis (in the direction of u), dv: meters in from
    // the glass at that point.
    const target = f * L * Math.sign(along(ex, ey) || 1)
    let bestK = 0
    let bd = Infinity
    inner.forEach(([x, y], k) => {
      const d = Math.abs(along(x, y) - target)
      if (d < bd) [bd, bestK] = [d, k]
    })
    const [x, y] = inner[bestK]
    const rest = thickness(x, y)
    // dv < 0: that fraction of the way across (-0.5 = the middle).
    const dd = dv < 0 ? rest * -dv : Math.min(dv, rest - 1)
    return [x + v[0] * dd, y + v[1] * dd]
  }
  const spots: Record<string, [number, number]> = {
    door: [door[0] + v[0] * 0.6, door[1] + v[1] * 0.6],
    coneBig: atAlong(0.33, -0.5),
    coneSmall: atAlong(0.72, -0.5),
    cafe: atAlong(0.12, 2.6),
    ticket: atAlong(0.52, 8.5),
    info: atAlong(0.6, 3.6),
    lockers: atAlong(0.88, 8.8),
    escalator: atAlong(0.2, 8.6),
  }
  return {
    ring,
    base,
    h: b.h,
    wave,
    normals,
    opens,
    door: { id: 'nact', x: door[0], y: door[1], z: doorZ, ux: u[0], uy: u[1], front: total, poly: poly.flat(), glass: best[1], spots },
  }
}

/**
 * The museum is two buildings on the map: the galleries, and in front of
 * them the wavy glass atrium. Of the buildings at or right next to the
 * map's point, take the one whose wave faces the most open ground.
 */
function findNact(map: GameMap, tiles: MapTile[]) {
  const f = findPoi(tiles, NAME)
  if (!f) return null
  const { tile, poi } = f
  let best: { tile: MapTile; b: MapTile['buildings'][number]; p: Plan } | null = null
  for (const b of tile.buildings) {
    const ring = ringOf(b.p)
    if (ring.length < 8) continue
    const near = inside(ring, poi.x, poi.y) || ring.some(([x, y]) => Math.hypot(x - poi.x, y - poi.y) < 20)
    if (!near) continue
    const p = plan(map, tile, b)
    if (p && (!best || p.opens > best.p.opens)) best = { tile, b, p }
  }
  return best ?? null
}

export function nactDoor(map: GameMap | null, tiles: MapTile[]): InteriorPlace | null {
  return (map && findNact(map, tiles)?.p.door) ?? null
}

/** Glass with fine horizontal louvers, a few bands of floor slabs behind. */
function paintGlass() {
  const W = 256
  const H = 512
  const [color, c] = canvas(W, H)
  const [glow, e] = canvas(W, H)
  const g = c.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#7fb6b1')
  g.addColorStop(0.5, '#5c9894')
  g.addColorStop(1, '#88bdb7')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  e.fillStyle = '#000'
  e.fillRect(0, 0, W, H)
  // Louvers: thin pale lines every few pixels, like fritted glass bands.
  for (let y = 0; y < H; y += 6) {
    c.fillStyle = 'rgba(220,240,236,0.55)'
    c.fillRect(0, y, W, 2)
  }
  // Mullions.
  c.fillStyle = 'rgba(235,240,240,0.9)'
  for (let x = 0; x < W; x += 64) c.fillRect(x, 0, 3, H)
  // Warm light from the atrium behind, after dark.
  e.fillStyle = 'rgba(255,232,190,0.75)'
  e.fillRect(0, 0, W, H)
  e.fillStyle = 'rgba(0,0,0,0.6)'
  for (let y = 0; y < H; y += 6) e.fillRect(0, y, W, 2)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The wave: glass panels following the short walls, a bit off them. */
function waveGeometry(p: Plan, y0: number, y1: number) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let u = 0
  for (let k = 0; k < p.wave.length; k++) {
    const [x, y] = p.wave[k]
    const [nx, ny] = p.normals[k]
    if (k > 0) u += Math.hypot(x - p.wave[k - 1][0], y - p.wave[k - 1][1])
    pos.push(x + nx * OUT, y0, y + ny * OUT, x + nx * OUT, y1, y + ny * OUT)
    uv.push(u / 4, 0, u / 4, (y1 - y0) / 8)
    if (k > 0) {
      const a = (k - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

interface Built {
  group: THREE.Group
  glow: THREE.MeshLambertMaterial[]
  dispose(): void
}

function build(p: Plan, uniforms: ReturnType<typeof seeThroughUniforms>): Built {
  const bin = new Bin()
  const group = new THREE.Group()
  group.name = 'nact'
  const glow: THREE.MeshLambertMaterial[] = []
  const { tc, tg } = paintGlass()
  bin.add(tc)
  bin.add(tg)
  const glass = bin.add(seeThrough(new THREE.MeshLambertMaterial({ map: tc, emissive: '#ffffff', emissiveMap: tg, emissiveIntensity: 0, side: THREE.DoubleSide }), uniforms, p.base))
  glow.push(glass)
  const wave = new THREE.Mesh(bin.add(waveGeometry(p, p.base, p.base + p.h + 0.4)), glass)
  wave.receiveShadow = true
  group.add(wave)
  // The entrance cone: a glass drum narrowing upward, with a flat white lid.
  const { door } = p
  const len = Math.hypot(door.ux, door.uy) || 1
  const vx = -door.uy / len
  const vy = door.ux / len
  const cx = door.x - vx * 1.2
  const cy = door.y - vy * 1.2
  const coneGlass = bin.add(
    seeThrough(new THREE.MeshLambertMaterial({ color: '#9fd0cc', emissive: '#ffe9c4', emissiveIntensity: 0, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), uniforms, p.base),
  )
  glow.push(coneGlass)
  const cone = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(2.4, 3.2, 5.2, 32, 1, true)), coneGlass)
  cone.position.set(cx, door.z + 2.6, cy)
  group.add(cone)
  const white = bin.add(seeThrough(new THREE.MeshLambertMaterial({ color: '#eef0ee' }), uniforms, p.base))
  const lid = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(2.7, 2.7, 0.35, 32)), white)
  lid.position.set(cx, door.z + 5.35, cy)
  lid.castShadow = true
  group.add(lid)
  // Ribs on the cone.
  const rib = bin.add(new THREE.BoxGeometry(0.08, 5.3, 0.08))
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const m = new THREE.Mesh(rib, white)
    m.position.set(cx + Math.cos(a) * 2.85, door.z + 2.6, cy + Math.sin(a) * 2.85)
    // Lean with the cone's slope.
    m.rotation.set(Math.sin(a) * -0.19, 0, Math.cos(a) * 0.19)
    group.add(m)
  }
  return { group, glow, dispose: () => bin.dispose() }
}

export function Nact({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const found = useMemo(() => findNact(map, tiles), [map, tiles])
  const key = found ? found.b.p.join(',') : ''
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo(() => {
    if (!found || typeof document === 'undefined') return null
    return build(found.p, uniforms)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uniforms])
  useEffect(() => () => built?.dispose(), [built])
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const { x, y } = focus.current
    uniforms.uPlayer.value.set(x, groundAt(map, x, y) + 1.0, y)
    uniforms.uCam.value.copy(camera.position)
  })
  useEffect(() => {
    for (const m of built?.glow ?? []) m.emissiveIntensity = 0.03 + night * 0.45
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
