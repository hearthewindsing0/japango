import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildingBase } from '../geometry'
import type { InteriorPlace } from '../interior'
import { starbucksPlan } from '../interiors/starbucks'
import { groundAt, isBlocked, tileGroundAt, type GameMap, type MapTile } from '../map'
import { seeThroughUniforms } from '../seeThrough'
import type { Focus } from '../World'
import { Bin, buildingNear, canvas, findPoi, fitRoom, inside, openWalls, ringArea, ringOf, segDist, seeThrough, texture, type OpenWall, type Ring } from './common'
import { roofGeometry } from './MoriTower'

// 東京ミッドタウン (Tokyo Midtown, 2007), on the old Defense Agency site in
// Akasaka 9-chōme. SOM's master plan puts the 248 m Midtown Tower at the
// heart, with lower buildings around it like foothills; the tower's faces
// are overlapping planes meant to recall shoji screens (pale vertical
// louvers over glass), with the Ritz-Carlton in its top floors. The Galleria
// (four floors of shops) runs along the garden side, and the Plaza, under a
// tall glass canopy, draws people in from Gaien-Higashi-dōri.
//
// On the map the tower and the Galleria are one footprint, so the tower's
// walls are the ones inside its own outline (OpenStreetMap way 103007069,
// roughly; see TOWER below). The Plaza is the narrow building in front.
// At the south end of the Plaza is the Starbucks (Henry's old local),
// which you can walk into (interiors/starbucks.ts), with tables out on the
// plaza.

const TOWER_POI = 'ミッドタウンタワー'
const STARBUCKS_POI = /^スターバックス.*ミッドタウン/
const OUT = 0.06
const GREEN = '#00704a'
const LATIN = '"Helvetica Neue", Arial, sans-serif'

/**
 * The tower's outline, from its map label: a box along the tower's long
 * axis (about 70° from the map's x axis), 68 × 49 m in OSM, plus a margin.
 * The label sits a little north-east of the middle.
 */
const TOWER = {
  dx: -5,
  dy: 9,
  angle: 1.234,
  half: [38, 28] as [number, number],
}

/** Floors above the lobby are this tall in game meters: many thin ones. */
const LOBBY = 4.0
const FLOOR = 0.9
const BAY = 1.5
const CROWN = 2.4
const STORE_H = 3.4
const FASCIA = 0.8

/** The coffee chain's round green mark, simplified: a ring and a star. */
export function drawSiren(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  c.save()
  c.fillStyle = GREEN
  c.beginPath()
  c.arc(cx, cy, r, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#ffffff'
  c.lineWidth = r * 0.07
  c.beginPath()
  c.arc(cx, cy, r * 0.66, 0, Math.PI * 2)
  c.stroke()
  // A white star at the top of the inner circle, and a crowned face below
  // it in outline.
  c.fillStyle = '#ffffff'
  const star = (x: number, y: number, R: number) => {
    c.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? R * 0.42 : R
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    c.closePath()
    c.fill()
  }
  star(cx, cy - r * 0.36, r * 0.16)
  c.beginPath()
  c.arc(cx, cy + r * 0.08, r * 0.24, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = GREEN
  c.beginPath()
  c.arc(cx, cy + r * 0.08, r * 0.17, 0, Math.PI * 2)
  c.fill()
  // Small stars round the ring.
  c.fillStyle = '#ffffff'
  star(cx - r * 0.83, cy, r * 0.07)
  star(cx + r * 0.83, cy, r * 0.07)
  c.restore()
}

/** The store front: tall glass in wood frames, the café warm behind it,
 *  under a dark band with the name. One texture for the whole width. */
function paintStore(width: number) {
  const PX = 64
  const w = Math.max(64, Math.round(width * PX))
  const h = Math.round((STORE_H + FASCIA) * PX)
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  const top = FASCIA * PX
  // Inside: warm wood, pendant lights, people's shapes at tables.
  const g = c.createLinearGradient(0, top, 0, h)
  g.addColorStop(0, '#6b4a33')
  g.addColorStop(1, '#a37a56')
  c.fillStyle = g
  c.fillRect(0, top, w, h - top)
  for (let x = 30; x < w; x += 110) {
    c.fillStyle = '#ffd58f'
    c.beginPath()
    c.arc(x, top + 34, 9, 0, Math.PI * 2)
    c.fill()
    e.fillStyle = 'rgba(255,214,150,0.9)'
    e.beginPath()
    e.arc(x, top + 34, 26, 0, Math.PI * 2)
    e.fill()
  }
  e.fillStyle = 'rgba(255,205,140,0.55)'
  e.fillRect(0, top + 10, w, h - top - 10)
  c.fillStyle = 'rgba(40,28,20,0.55)'
  for (let x = 50; x < w; x += 140) {
    c.beginPath()
    c.ellipse(x, h - 60, 14, 26, 0, 0, Math.PI * 2)
    c.fill()
    c.beginPath()
    c.arc(x, h - 98, 11, 0, Math.PI * 2)
    c.fill()
  }
  // The glass, catching the sky.
  c.fillStyle = 'rgba(200,225,230,0.22)'
  c.fillRect(0, top, w, h - top)
  c.fillStyle = 'rgba(255,255,255,0.12)'
  for (let x = 0; x < w; x += 300) {
    c.beginPath()
    c.moveTo(x, h)
    c.lineTo(x + 120, top)
    c.lineTo(x + 170, top)
    c.lineTo(x + 50, h)
    c.fill()
  }
  // Wood mullions every 1.5 m, a transom.
  c.fillStyle = '#4a3121'
  for (let x = 0; x <= w; x += 1.5 * PX) c.fillRect(x - 4, top, 8, h - top)
  c.fillRect(0, top + (h - top) * 0.22, w, 6)
  c.fillRect(0, h - 10, w, 10)
  // Fascia: dark band, the mark and the name in white.
  c.fillStyle = '#1f2a25'
  c.fillRect(0, 0, w, top)
  const r = top * 0.42
  const name = 'STARBUCKS COFFEE'
  c.font = `600 ${Math.round(top * 0.36)}px ${LATIN}`
  const tw = c.measureText(name).width
  const x0 = w / 2 - (tw + r * 2.6) / 2
  drawSiren(c, x0 + r, top / 2, r)
  c.fillStyle = '#ffffff'
  c.textBaseline = 'middle'
  c.fillText(name, x0 + r * 2.6, top / 2 + 2)
  e.fillStyle = 'rgba(255,255,255,0.8)'
  e.font = c.font
  e.textBaseline = 'middle'
  e.fillText(name, x0 + r * 2.6, top / 2 + 2)
  e.fillStyle = 'rgba(80,200,150,0.7)'
  e.beginPath()
  e.arc(x0 + r, top / 2, r, 0, Math.PI * 2)
  e.fill()
  return { tc: texture(color), tg: texture(glow) }
}

/** The Plaza's glass: big panes on a fine steel grid, lit at night. */
function paintPlazaGlass() {
  const PX = 32
  const w = 6 * PX
  const h = 8 * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  const g = c.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#9cc0c4')
  g.addColorStop(1, '#6f97a0')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  e.fillStyle = 'rgba(255,215,160,0.32)'
  e.fillRect(0, 0, w, h)
  c.fillStyle = '#e6eaec'
  for (let x = 0; x <= w; x += 1.5 * PX) c.fillRect(x - 1.5, 0, 3, h)
  for (let y = 0; y <= h; y += 2 * PX) c.fillRect(0, y - 1.5, w, 3)
  e.fillStyle = '#000'
  for (let x = 0; x <= w; x += 1.5 * PX) e.fillRect(x - 1.5, 0, 3, h)
  for (let y = 0; y <= h; y += 2 * PX) e.fillRect(0, y - 1.5, w, 3)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The canopy roof: glass on a diagonal steel lattice. */
function paintCanopy() {
  const [cv, c] = canvas(256, 256)
  c.fillStyle = '#b8d2d4'
  c.fillRect(0, 0, 256, 256)
  c.strokeStyle = '#f2f4f5'
  c.lineWidth = 4
  for (let k = -256; k < 512; k += 48) {
    c.beginPath()
    c.moveTo(k, 0)
    c.lineTo(k + 256, 256)
    c.moveTo(k + 256, 0)
    c.lineTo(k, 256)
    c.stroke()
  }
  return texture(cv, true)
}

/** The tower: glass behind pale vertical louvers, in overlapping planes
 *  like shoji, with thin floor lines. */
function paintTower() {
  const PX = 48
  const w = 8 * BAY * PX
  const h = 8 * FLOOR * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  const bw = BAY * PX
  const fh = FLOOR * PX
  for (let fy = 0; fy < 8; fy++)
    for (let bx = 0; bx < 8; bx++) {
      const n = Math.abs(Math.sin(bx * 12.9898 + fy * 78.233) * 43758.5453) % 1
      c.fillStyle = `rgb(${96 + n * 16},${118 + n * 16},${128 + n * 14})`
      c.fillRect(bx * bw, fy * fh, bw, fh)
      if (n > 0.3) {
        e.fillStyle = n > 0.8 ? 'rgba(255,242,220,0.95)' : 'rgba(255,230,190,0.7)'
        e.fillRect(bx * bw + 3, fy * fh + fh * 0.2, bw - 6, fh * 0.72)
      }
    }
  // Floor lines.
  c.fillStyle = '#d9d6cf'
  for (let fy = 0; fy < 8; fy++) c.fillRect(0, fy * fh, w, fh * 0.12)
  // Louvers: a pale stone-colored fin every third of a bay, heavier at the
  // bay lines, and every other pair of bays a plane that stands proud (a
  // lighter stripe with a shadow beside it).
  for (let bx = 0; bx < 8; bx++) {
    const x = bx * bw
    for (let k = 0; k < 3; k++) {
      c.fillStyle = k === 0 ? '#efece5' : 'rgba(232,228,220,0.85)'
      c.fillRect(x + (k * bw) / 3, 0, k === 0 ? PX * 0.18 : PX * 0.09, h)
    }
    if (bx % 4 === 1) {
      c.fillStyle = 'rgba(255,255,255,0.12)'
      c.fillRect(x, 0, bw * 2, h)
      c.fillStyle = 'rgba(0,0,0,0.18)'
      c.fillRect(x + bw * 2, 0, PX * 0.2, h)
    }
  }
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The tower's foot: tall glass between stone piers. */
function paintLobby() {
  const PX = 48
  const w = 4 * BAY * PX
  const h = LOBBY * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  const g = c.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#61737b')
  g.addColorStop(1, '#a4b3b8')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  e.fillStyle = 'rgba(255,232,195,0.5)'
  for (let x = 0; x < w; x += BAY * PX) e.fillRect(x + 8, h * 0.18, BAY * PX - 16, h * 0.78)
  c.fillStyle = '#d8d2c6'
  for (let x = 0; x <= w; x += BAY * PX) c.fillRect(x - 7, 0, 14, h)
  c.fillRect(0, 0, w, h * 0.12)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The top floors (the hotel): darker glass, warm light all night. */
function paintCrown() {
  const PX = 48
  const w = 2 * BAY * PX
  const h = CROWN * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  c.fillStyle = '#4d6069'
  c.fillRect(0, 0, w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  e.fillStyle = 'rgba(255,214,160,0.9)'
  e.fillRect(0, h * 0.3, w, h * 0.55)
  c.fillStyle = '#efece5'
  for (let x = 0; x <= w; x += (BAY * PX) / 3) c.fillRect(x - 2, 0, 4, h)
  c.fillRect(0, 0, w, 8)
  c.fillRect(0, h * 0.25, w, 4)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The Galleria: four floors of shops, stone bands and shop glass. */
function paintGalleria() {
  const PX = 32
  const w = 12 * PX
  const h = 15 * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  c.fillStyle = '#d6d0c4'
  c.fillRect(0, 0, w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  const fh = h / 4
  for (let f = 0; f < 4; f++) {
    const y = h - (f + 1) * fh
    c.fillStyle = f === 0 ? '#7f969c' : '#8aa0a6'
    c.fillRect(0, y + fh * 0.18, w, fh * 0.7)
    e.fillStyle = f === 0 ? 'rgba(255,236,205,0.85)' : 'rgba(255,230,190,0.5)'
    e.fillRect(0, y + fh * 0.2, w, fh * 0.66)
    c.fillStyle = '#c9c2b4'
    for (let x = 0; x < w; x += 3 * PX) c.fillRect(x, y, 10, fh)
  }
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** A wall segment with its outward normal. */
interface Seg {
  a: [number, number]
  b: [number, number]
  n: [number, number]
}

function segsOf(ring: Ring): Seg[] {
  const ccw = ringArea(ring) > 0
  const out: Seg[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 0.3) continue
    const dx = (b[0] - a[0]) / len
    const dy = (b[1] - a[1]) / len
    out.push({ a, b, n: ccw ? [dy, -dx] : [-dy, dx] })
  }
  return out
}

/** Painted quads on some walls, from y0 to y1, `out` meters off them. */
function quads(segs: Seg[], y0: number, y1: number, out: number, uScale: number, vScale: number) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let u = 0
  for (const { a, b, n } of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const k = pos.length / 3
    const [ax, ay] = [a[0] + n[0] * out, a[1] + n[1] * out]
    const [bx, by] = [b[0] + n[0] * out, b[1] + n[1] * out]
    pos.push(ax, y0, ay, bx, y0, by, bx, y1, by, ax, y1, ay)
    uv.push(u / uScale, 0, (u + len) / uScale, 0, (u + len) / uScale, (y1 - y0) / vScale, u / uScale, (y1 - y0) / vScale)
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
    u += len
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

type Building = MapTile['buildings'][number]

interface StorePlan {
  ring: Ring
  base: number
  h: number
  front: OpenWall
  /** Other open walls of the Plaza building. */
  glass: OpenWall[]
  door: InteriorPlace
}

/** The Plaza building, its Starbucks front and the room behind it. */
function storePlan(map: GameMap, tile: MapTile, b: Building, px: number, py: number): StorePlan | null {
  const ring = ringOf(b.p)
  if (ring.length < 3) return null
  const base = buildingBase(b.p, (x, y) => tileGroundAt(tile, x, y))
  const walls = openWalls(map, tile, b)
  if (!walls.length) return null
  // The front is the open wall nearest the café's point, long enough for a
  // shop front.
  const dist = (w: OpenWall) => segDist(px, py, w.l[0], w.l[1], w.r[0], w.r[1])
  const fronts = walls.filter((w) => w.len >= 8)
  const front = (fronts.length ? fronts : walls).reduce((a, w) => (dist(w) < dist(a) ? w : a))
  // The door: the café's point, moved onto the wall, kept 5 m from its ends.
  const ex = front.r[0] - front.l[0]
  const ey = front.r[1] - front.l[1]
  const t0 = ((px - front.l[0]) * ex + (py - front.l[1]) * ey) / (front.len * front.len)
  const m = Math.min(0.5, 5 / front.len)
  const t = Math.max(m, Math.min(1 - m, t0))
  const at: [number, number] = [front.l[0] + ex * t, front.l[1] + ey * t]
  const room = fitRoom(ring, front, at, 7.5, 11)
  const z = tileGroundAt(tile, at[0] + front.n[0] * 1.2, at[1] + front.n[1] * 1.2)
  return {
    ring,
    base,
    h: b.h,
    front,
    glass: walls.filter((w) => w !== front),
    door: {
      id: 'starbucks',
      x: at[0],
      y: at[1],
      z,
      ux: room.ux,
      uy: room.uy,
      front: front.len,
      room: { a0: room.a0, a1: room.a1, depth: room.depth },
    },
  }
}

function findStore(map: GameMap, tiles: MapTile[]) {
  const f = findPoi(tiles, STARBUCKS_POI)
  if (!f) return null
  const b = buildingNear(f.tile, f.poi.x, f.poi.y, 8)
  if (!b) return null
  const p = storePlan(map, f.tile, b, f.poi.x, f.poi.y)
  return p ? { tile: f.tile, b, p } : null
}

/** The café's front door, for walking in (see interior.ts). */
export function starbucksDoor(map: GameMap | null, tiles: MapTile[]): InteriorPlace | null {
  return (map && findStore(map, tiles)?.p.door) ?? null
}

interface Built {
  group: THREE.Group
  glow: { m: THREE.MeshLambertMaterial; day: number; night: number }[]
  dispose(): void
}

function buildStore(p: StorePlan, free: (x: number, y: number) => boolean, uniforms: ReturnType<typeof seeThroughUniforms>, bin: Bin, group: THREE.Group, glow: Built['glow']) {
  const { door, front } = p
  const plan = starbucksPlan(door)
  const { a0, a1 } = plan.room
  const len = Math.hypot(door.ux, door.uy) || 1
  const ux = door.ux / len
  const uy = door.uy / len
  const toMap = (a: number, b: number): [number, number] => [door.x + a * ux - b * uy, door.y + a * uy + b * ux]
  const mat = (params: THREE.MeshLambertMaterialParameters, base = p.base) => bin.add(seeThrough(new THREE.MeshLambertMaterial(params), uniforms, base))
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, shadow = false) => {
    bin.add(geo)
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  // The shop front, a hair off the wall, from a0 to a1 (a runs from the
  // street's right to left, so the texture is laid from a1 to a0).
  const store = paintStore(a1 - a0)
  bin.add(store.tc)
  bin.add(store.tg)
  const storeMat = mat({
    map: store.tc,
    emissive: '#ffffff',
    emissiveMap: store.tg,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  })
  glow.push({ m: storeMat, day: 0.25, night: 1.0 })
  const seg: Seg = {
    a: toMap(a1, -OUT * 2),
    b: toMap(a0, -OUT * 2),
    n: front.n,
  }
  add(quads([seg], door.z, door.z + STORE_H + FASCIA, 0, a1 - a0, STORE_H + FASCIA), storeMat)
  // Terrace tables on the plaza in front: round tables with two chairs, and
  // a pair of big parasols.
  const wood = mat({ color: '#7a5537' }, door.z)
  const dark = mat({ color: '#2d2a27' }, door.z)
  const canvasMat = mat({ color: '#eef0ea', side: THREE.DoubleSide }, door.z)
  const top = bin.add(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 18))
  const leg = bin.add(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6))
  const chair = bin.add(new THREE.BoxGeometry(0.4, 0.46, 0.4))
  const back = bin.add(new THREE.BoxGeometry(0.4, 0.4, 0.05))
  const parasol = bin.add(new THREE.ConeGeometry(1.7, 0.6, 10, 1, true))
  const pole = bin.add(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6))
  const ry = Math.atan2(-uy, ux)
  const place = (geo: THREE.BufferGeometry, m: THREE.Material, a: number, b: number, y: number, rot = 0) => {
    const [x, z] = toMap(a, b)
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, door.z + y, z)
    mesh.rotation.y = ry + rot
    mesh.castShadow = true
    group.add(mesh)
  }
  const span = Math.min(a1 - a0, 14)
  const tables: [number, number][] = []
  for (let a = -span / 2 + 1.2; a <= span / 2 - 1.2; a += 2.4) {
    if (Math.abs(a) < 1.4) continue
    tables.push([a, -2.4], [a, -4.6])
  }
  // Only where there's open paving (not in a neighbour's wall).
  const clear = (a: number, b: number, r: number) =>
    [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ].every(([da, db]) => free(...toMap(a + da, b + db)))
  for (const [a, b] of tables) {
    if (!clear(a, b, 1.0)) continue
    place(top, wood, a, b, 0.74)
    place(leg, dark, a, b, 0.37)
    for (const s of [-1, 1]) {
      place(chair, dark, a + s * 0.62, b, 0.23)
      place(back, dark, a + s * 0.82, b, 0.66, Math.PI / 2)
    }
  }
  for (const a of [-span / 4 - 0.6, span / 4 + 0.6]) {
    if (!clear(a, -3.5, 1.8)) continue
    place(pole, dark, a, -3.5, 1.25)
    place(parasol, canvasMat, a, -3.5, 2.65)
  }
}

function buildTower(tile: MapTile, b: Building, poi: { x: number; y: number }, uniforms: ReturnType<typeof seeThroughUniforms>, bin: Bin, group: THREE.Group, glow: Built['glow']) {
  const ring = ringOf(b.p)
  if (ring.length < 3) return
  const base = buildingBase(b.p, (x, y) => tileGroundAt(tile, x, y))
  const top = base + b.h
  const cx = poi.x + TOWER.dx
  const cy = poi.y + TOWER.dy
  const e1 = [Math.cos(TOWER.angle), Math.sin(TOWER.angle)]
  const inTower = (x: number, y: number) => {
    const dx = x - cx
    const dy = y - cy
    return Math.abs(dx * e1[0] + dy * e1[1]) < TOWER.half[0] && Math.abs(-dx * e1[1] + dy * e1[0]) < TOWER.half[1]
  }
  const segs = segsOf(ring)
  const tower = segs.filter((s) => inTower((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2))
  const rest = segs.filter((s) => !tower.includes(s))
  const lit = (t: { tc: THREE.Texture; tg: THREE.Texture }, day = 0.05, night = 0.75) => {
    bin.add(t.tc)
    bin.add(t.tg)
    const m = bin.add(
      seeThrough(
        new THREE.MeshLambertMaterial({
          map: t.tc,
          emissive: '#ffffff',
          emissiveMap: t.tg,
          emissiveIntensity: 0,
          side: THREE.DoubleSide,
        }),
        uniforms,
        base,
      ),
    )
    glow.push({ m, day, night })
    return m
  }
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    bin.add(geo)
    const mesh = new THREE.Mesh(geo, m)
    mesh.receiveShadow = true
    group.add(mesh)
  }
  if (tower.length) {
    const lobbyTop = base + LOBBY
    const crownBottom = top - CROWN + 0.4
    add(quads(tower, base, lobbyTop, OUT, 4 * BAY, LOBBY), lit(paintLobby()))
    add(quads(tower, lobbyTop, crownBottom, OUT, 8 * BAY, 8 * FLOOR), lit(paintTower()))
    add(quads(tower, crownBottom, top + 1.2, OUT * 2, 2 * BAY, CROWN + 0.8), lit(paintCrown(), 0.1, 0.9))
  }
  if (rest.length) add(quads(rest, base, top, OUT, 12, 15), lit(paintGalleria(), 0.03, 0.6))
}

function buildPlaza(p: StorePlan, uniforms: ReturnType<typeof seeThroughUniforms>, bin: Bin, group: THREE.Group, glow: Built['glow']) {
  const segs: Seg[] = p.glass.map((w) => ({ a: w.r, b: w.l, n: w.n }))
  const top = p.base + p.h
  const g = paintPlazaGlass()
  bin.add(g.tc)
  bin.add(g.tg)
  const m = bin.add(
    seeThrough(
      new THREE.MeshLambertMaterial({
        map: g.tc,
        emissive: '#ffffff',
        emissiveMap: g.tg,
        emissiveIntensity: 0,
        side: THREE.DoubleSide,
      }),
      uniforms,
      p.base,
    ),
  )
  glow.push({ m, day: 0.03, night: 0.32 })
  const add = (geo: THREE.BufferGeometry, mm: THREE.Material) => {
    bin.add(geo)
    const mesh = new THREE.Mesh(geo, mm)
    mesh.receiveShadow = true
    group.add(mesh)
  }
  if (segs.length) add(quads(segs, p.base, top, OUT, 6, 8), m)
  // The front wall above the café, glass up to the canopy.
  const f: Seg = { a: p.front.r, b: p.front.l, n: p.front.n }
  add(quads([f], p.base + STORE_H + FASCIA, top, OUT, 6, 8), m)
  // The canopy: a lattice of glass over the whole building, just above the
  // roof.
  const canopy = bin.add(paintCanopy())
  canopy.repeat.set(1 / 10, 1 / 10)
  const cm = bin.add(
    seeThrough(
      new THREE.MeshLambertMaterial({
        map: canopy,
        transparent: true,
        opacity: 0.92,
      }),
      uniforms,
      p.base,
    ),
  )
  const roof = roofGeometry(p.ring, top + 0.08)
  // Planar UVs in meters for the lattice.
  const pos = roof.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i)
    uv[i * 2 + 1] = pos.getZ(i)
  }
  roof.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  add(roof, cm)
}

export function Midtown({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const store = useMemo(() => findStore(map, tiles), [map, tiles])
  const tower = useMemo(() => {
    const f = findPoi(tiles, TOWER_POI)
    const b = f && buildingNear(f.tile, f.poi.x, f.poi.y, 8)
    return f && b ? { tile: f.tile, b, poi: f.poi } : null
  }, [tiles])
  const key = `${store ? store.b.p.join(',') : ''}|${tower ? tower.b.p.join(',') : ''}`
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo((): Built | null => {
    if (typeof document === 'undefined' || (!store && !tower)) return null
    const bin = new Bin()
    const group = new THREE.Group()
    group.name = 'midtown'
    const glow: Built['glow'] = []
    if (tower && tower.b !== store?.b) buildTower(tower.tile, tower.b, tower.poi, uniforms, bin, group, glow)
    if (store) {
      buildPlaza(store.p, uniforms, bin, group, glow)
      const others = store.tile.buildings.map((o) => ringOf(o.p))
      const free = (x: number, y: number) => !isBlocked(map, x, y) && !others.some((r) => inside(r, x, y))
      buildStore(store.p, free, uniforms, bin, group, glow)
    }
    return { group, glow, dispose: () => bin.dispose() }
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
    for (const g of built?.glow ?? []) g.m.emissiveIntensity = g.day + night * (g.night - g.day)
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
