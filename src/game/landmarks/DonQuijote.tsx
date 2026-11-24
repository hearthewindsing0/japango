import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildingBase } from '../geometry'
import type { InteriorPlace } from '../interior'
import { groundAt, isBlocked, tileGroundAt, type GameMap, type MapTile } from '../map'
import { seeThroughUniforms } from '../seeThrough'
import type { Focus } from '../World'
import { Bin, buildingAt, canvas, findPoi, inside, ringArea, ringOf, segDist, seeThrough, texture, type Ring } from './common'

// ドン・キホーテ六本木店 (Don Quijote Roppongi), 3-14-10 Roppongi on
// Gaien-Higashi-dōri: the eight-storey discount store everyone calls ドンキ,
// open around the clock. Dressed the way the chain's flagship stores look:
// an open, blazing ground floor heaped with goods, the yellow band with
// 驚安の殿堂 ドン・キホーテ in red, the walls above papered with bright
// banners, Donpen the penguin mascot in his red nightcap, and the big
// fish tanks either side of the entrance (Tokyo Cheapo names them as the
// store's landmark). On the roof stands the Intamin half-pipe roller coaster
// built in 2005-06 that never carried a rider: neighbours objected to the
// noise, so it was never allowed to run.
//
// The front is the long wall facing the main road. You can walk in: the
// ground floor (interiors/donki.ts) is fitted inside the building's outline.

const POI = 'ドン・キホーテ'
const PX = 48
const OUT = 0.05
const YELLOW = '#ffd400'
const RED = '#e60012'
const BLUE = '#0052a5'
const GOTHIC = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "M PLUS 1 Variable", "Yu Gothic", sans-serif'

/** One street-facing wall: ends as seen from outside (left, right). */
interface Wall {
  l: [number, number]
  r: [number, number]
  len: number
  n: [number, number]
  /** How far the main road is in front of it (m), or Infinity. */
  road: number
}

interface Plan {
  ring: Ring
  base: number
  h: number
  walls: Wall[]
  front: Wall
  /** The street height at the front door. */
  doorZ: number
  door: InteriorPlace
}

function plan(map: GameMap, tile: MapTile, b: MapTile['buildings'][number]): Plan | null {
  const ring = ringOf(b.p)
  if (ring.length < 3) return null
  const ccw = ringArea(ring) > 0
  const others = tile.buildings.filter((o) => o !== b).map((o) => ringOf(o.p))
  const height = (x: number, y: number) => tileGroundAt(tile, x, y)
  const base = buildingBase(b.p, height)
  const big = tile.roads.filter((r) => !r.b && /^(primary|secondary|trunk|tertiary)/.test(r.t))
  const roadAhead = (x: number, y: number, nx: number, ny: number) => {
    for (let d = 2; d < 40; d += 1) {
      const px = x + nx * d
      const py = y + ny * d
      for (const r of big)
        for (let i = 0; i + 3 < r.p.length; i += 2) if (segDist(px, py, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) < r.w / 2) return d
    }
    return Infinity
  }
  const walls: Wall[] = []
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % ring.length]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 1.5) continue
    const dx = (bx - ax) / len
    const dy = (by - ay) / len
    const n: [number, number] = ccw ? [dy, -dx] : [-dy, dx]
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    // Open in front (the map grid knows about every neighbour, even ones
    // on other tiles).
    const open = (d: number) => !isBlocked(map, mx + n[0] * d, my + n[1] * d) && !others.some((o) => inside(o, mx + n[0] * d, my + n[1] * d))
    if (!open(1.2) || !open(3)) continue
    // Left and right as seen by someone outside looking at it.
    const aLeft = (bx - ax) * n[1] + (by - ay) * -n[0] > 0
    walls.push({ l: aLeft ? [ax, ay] : [bx, by], r: aLeft ? [bx, by] : [ax, ay], len, n, road: roadAhead(mx, my, n[0], n[1]) })
  }
  if (!walls.length) return null
  // The front: a long wall nearest the main road.
  const long = walls.filter((w) => w.len >= 8)
  const front = (long.length ? long : walls).reduce((a, w) => (w.road < a.road - 1 || (Math.abs(w.road - a.road) <= 1 && w.len > a.len) ? w : a))
  const mx = (front.l[0] + front.r[0]) / 2
  const my = (front.l[1] + front.r[1]) / 2
  const doorZ = height(mx + front.n[0] * 1.2, my + front.n[1] * 1.2)
  // Into the building is -n; `a` (along the front) runs so that
  // (-uy, ux) = -n, which is from right to left as seen from the street.
  const ux = -front.n[1]
  const uy = front.n[0]
  const toMap = (a: number, bb: number): [number, number] => [mx + a * ux - bb * uy, my + a * uy + bb * ux]
  const isIn = (a: number, bb: number) => inside(ring, ...toMap(a, bb))
  // The biggest rectangle behind the door that stays inside the outline,
  // with a margin for the walls.
  const half = front.len / 2 - 0.4
  let a0 = -half
  let a1 = half
  let depth = 2
  for (let d = 2.5; d < 26; d += 0.5) {
    let ok = true
    for (let a = a0; a <= a1 + 1e-6; a += 0.5) if (!isIn(a, d + 0.4)) ok = false
    if (!ok) break
    depth = d
  }
  // Narrow the room if the outline is narrower further in.
  while (a1 - a0 > 6 && ![0.5, depth / 2, depth].every((d) => isIn(a0 - 0.3, d) && isIn(a1 + 0.3, d))) {
    a0 += 0.25
    a1 -= 0.25
  }
  return {
    ring,
    base,
    h: b.h,
    walls,
    front,
    doorZ,
    door: { id: 'donki', x: mx, y: my, z: doorZ, ux, uy, front: front.len, room: { a0: +a0.toFixed(2), a1: +a1.toFixed(2), depth } },
  }
}

/** Finds the store's building among the loaded tiles. */
function findDonki(tiles: MapTile[]) {
  for (const tile of tiles) {
    const poi = tile.pois.find((p) => p.name === POI && p.kind === 'shop')
    if (!poi) continue
    const b = buildingAt(tile, poi.x, poi.y)
    if (b) return { tile, b }
  }
  // Falls back to the name alone.
  const f = findPoi(tiles, POI)
  const b = f && buildingAt(f.tile, f.poi.x, f.poi.y)
  return f && b ? { tile: f.tile, b } : null
}

/** The front door, for walking in (see interior.ts). Stable while the
 *  building is loaded. */
export function donkiDoor(map: GameMap | null, tiles: MapTile[]): InteriorPlace | null {
  const f = map && findDonki(tiles)
  if (!map || !f) return null
  return plan(map, f.tile, f.b)?.door ?? null
}

/** Donpen, the chain's penguin: blue head, white face, red nightcap. */
export function drawDonpen(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // Nightcap, flopping to the right, with a white pom-pom.
  c.fillStyle = RED
  c.beginPath()
  c.moveTo(cx - r * 0.95, cy - r * 0.35)
  c.quadraticCurveTo(cx - r * 0.2, cy - r * 1.9, cx + r * 1.25, cy - r * 1.05)
  c.lineTo(cx + r * 0.95, cy - r * 0.35)
  c.closePath()
  c.fill()
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.arc(cx + r * 1.3, cy - r * 1.0, r * 0.24, 0, Math.PI * 2)
  c.fill()
  c.fillRect(cx - r * 1.0, cy - r * 0.48, r * 2.0, r * 0.26)
  // Head.
  c.fillStyle = '#1b4fb5'
  c.beginPath()
  c.arc(cx, cy + r * 0.12, r * 0.95, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.ellipse(cx, cy + r * 0.3, r * 0.68, r * 0.6, 0, 0, Math.PI * 2)
  c.fill()
  // Eyes and a yellow beak.
  c.fillStyle = '#111'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(cx + s * r * 0.26, cy + r * 0.12, r * 0.1, r * 0.15, 0, 0, Math.PI * 2)
    c.fill()
  }
  c.fillStyle = '#ffb400'
  c.beginPath()
  c.ellipse(cx, cy + r * 0.45, r * 0.28, r * 0.13, 0, 0, Math.PI * 2)
  c.fill()
}

const hash = (a: number, b: number) => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return n - Math.floor(n)
}

/** Shelves crammed with packages, as seen through the open front. */
export function drawGoods(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed = 1, rowH = 22) {
  const COLORS = ['#e60012', '#ffd400', '#0052a5', '#ff7fb0', '#22a33a', '#ff8a00', '#ffffff', '#7b3fb5', '#00a0e9', '#8b4513']
  const rows = Math.max(2, Math.round(h / rowH))
  const k = rowH / 22
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    let x = x0
    let i = 0
    while (x < x0 + w) {
      const pw = (6 + hash(r + seed, i) * 16) * k
      const ph = rh * (0.55 + hash(i + seed, r) * 0.4)
      c.fillStyle = COLORS[Math.floor(hash(i * 3 + seed, r * 7) * COLORS.length)]
      c.fillRect(x, y0 + (r + 1) * rh - ph - 3, Math.min(pw, x0 + w - x) - 1, ph)
      x += pw
      i++
    }
    // Shelf edge with a strip of yellow price tags.
    c.fillStyle = '#dfe3e6'
    c.fillRect(x0, y0 + (r + 1) * rh - 3, w, 3)
    c.fillStyle = YELLOW
    for (let t = x0 + 4; t < x0 + w; t += 26 * k) c.fillRect(t, y0 + (r + 1) * rh - 3, 10 * k, 4 * k)
  }
}

/** A yellow starburst POP card with a price. */
export function drawPop(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, top: string, price: string) {
  c.fillStyle = YELLOW
  c.beginPath()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const rr = i % 2 ? r * 0.8 : r
    c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  c.closePath()
  c.fill()
  c.fillStyle = RED
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `900 ${r * 0.42}px ${GOTHIC}`
  c.fillText(top, cx, cy - r * 0.22)
  c.font = `900 ${r * 0.4}px ${GOTHIC}`
  c.fillText(price, cx, cy + r * 0.28)
}

const BANNERS: [string, string, string][] = [
  // [background, text color, text]
  [YELLOW, RED, '驚安'],
  [RED, YELLOW, '免税'],
  [BLUE, '#ffffff', '24H'],
  ['#ff7fb0', '#ffffff', '化粧品'],
  [YELLOW, BLUE, 'お酒'],
  ['#111111', YELLOW, 'ブランド'],
  [RED, '#ffffff', '激安'],
  [BLUE, YELLOW, 'TAX FREE'],
  [YELLOW, RED, 'お菓子'],
  ['#ff8a00', '#ffffff', '医薬品'],
]

/** Paints one wall: colour and night glow. */
function paintWall(w: Wall, p: Plan, isFront: boolean, seed: number) {
  const W = Math.max(1, Math.round(w.len * PX))
  const H = Math.round(p.h * PX)
  const [color, c] = canvas(W, H)
  const [glow, e] = canvas(W, H)
  e.fillStyle = '#000'
  e.fillRect(0, 0, W, H)
  const g = Math.max(0, p.doorZ - p.base)
  const Y = (m: number) => H - (m + g) * PX
  // Dark grey wall behind everything.
  c.fillStyle = '#3d4248'
  c.fillRect(0, 0, W, H)
  const shopTop = 3.3
  const bandTop = 4.3
  // Ground floor: wide open, lit, heaped with goods (front and sides alike).
  const fx0 = 0.3 * PX
  const fx1 = W - 0.3 * PX
  c.fillStyle = '#fff6d8'
  c.fillRect(fx0, Y(shopTop), fx1 - fx0, Y(0) - Y(shopTop))
  drawGoods(c, fx0, Y(shopTop - 0.25), fx1 - fx0, Y(0.2) - Y(shopTop - 0.25), seed)
  e.fillStyle = '#ffffff'
  e.fillRect(fx0, Y(shopTop), fx1 - fx0, Y(0) - Y(shopTop))
  if (isFront) {
    // The doorway in the middle: a bright gap into the store.
    const mid = W / 2
    c.fillStyle = '#fffbe9'
    c.fillRect(mid - 1.7 * PX, Y(2.6), 3.4 * PX, Y(0) - Y(2.6))
    c.fillStyle = '#c7ccd0'
    c.fillRect(mid - 1.75 * PX, Y(2.65), 3.5 * PX, 0.08 * PX)
  }
  // Pillars.
  c.fillStyle = '#2a2d31'
  for (let x = 0; x <= W; x += 4.5 * PX) c.fillRect(x - 0.15 * PX, Y(shopTop), 0.3 * PX, Y(0) - Y(shopTop))
  // The yellow band over the shop: 驚安の殿堂 ドン・キホーテ.
  c.fillStyle = YELLOW
  c.fillRect(0, Y(bandTop), W, Y(shopTop) - Y(bandTop))
  c.fillStyle = RED
  c.fillRect(0, Y(shopTop) - 0.1 * PX, W, 0.1 * PX)
  c.fillRect(0, Y(bandTop), W, 0.1 * PX)
  e.fillStyle = '#ffffff'
  e.fillRect(0, Y(bandTop), W, Y(shopTop) - Y(bandTop))
  const bh = Y(shopTop) - Y(bandTop)
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  const label = isFront ? '驚安の殿堂 ドン・キホーテ' : 'ドン・キホーテ'
  c.font = `900 ${bh * 0.62}px ${GOTHIC}`
  const step = Math.max(c.measureText(label).width + bh * 2.2, 8 * PX)
  for (let x = step / 2; x < W + step / 2; x += step) {
    c.fillStyle = BLUE
    c.fillText(label, x + 3, (Y(bandTop) + Y(shopTop)) / 2 + 3)
    c.fillStyle = RED
    c.fillText(label, x, (Y(bandTop) + Y(shopTop)) / 2)
    drawDonpen(c, x + c.measureText(label).width / 2 + bh * 0.75, (Y(bandTop) + Y(shopTop)) / 2 + bh * 0.05, bh * 0.32)
  }
  // Upper floors: windows papered over with banners, floor by floor.
  const top = p.h - g - 1.6
  const FLOOR = 2.6
  let f = 0
  for (let y = bandTop + 0.4; y + FLOOR - 0.3 < top; y += FLOOR, f++) {
    const n = Math.max(1, Math.round(w.len / 4.2))
    const pw = w.len / n
    for (let i = 0; i < n; i++) {
      const [bg, fg, t] = BANNERS[Math.floor(hash(i + seed * 5, f) * BANNERS.length)]
      const x = (i * pw + 0.25) * PX
      const ww = (pw - 0.5) * PX
      const y0 = Y(y + FLOOR - 0.4)
      const hh = Y(y) - y0
      if (hash(i, f + seed) < 0.3) {
        // A plain lit window now and then.
        c.fillStyle = '#7d93a6'
        c.fillRect(x, y0, ww, hh)
        e.fillStyle = 'rgba(255,240,200,0.6)'
        e.fillRect(x, y0, ww, hh)
        continue
      }
      c.fillStyle = bg
      c.fillRect(x, y0, ww, hh)
      c.fillStyle = fg
      c.font = `900 ${Math.min(hh * 0.62, (ww / Math.max(2, t.length)) * 1.1)}px ${GOTHIC}`
      c.fillText(t, x + ww / 2, y0 + hh / 2)
      e.fillStyle = 'rgba(255,255,255,0.85)'
      e.fillRect(x, y0, ww, hh)
    }
  }
  // Top band: ドン・キホーテ with Donpen.
  c.fillStyle = YELLOW
  c.fillRect(0, Y(p.h - g), W, Y(top + 0.1) - Y(p.h - g))
  e.fillStyle = '#ffffff'
  e.fillRect(0, Y(p.h - g), W, Y(top + 0.1) - Y(p.h - g))
  const th = Y(top + 0.1) - Y(p.h - g)
  c.font = `900 ${th * 0.66}px ${GOTHIC}`
  c.fillStyle = RED
  c.fillText('ドン・キホーテ', W / 2, Y(p.h - g) + th * 0.53)
  if (w.len > 10) {
    drawDonpen(c, W / 2 - c.measureText('ドン・キホーテ').width / 2 - th * 0.7, Y(p.h - g) + th * 0.58, th * 0.36)
    drawDonpen(c, W / 2 + c.measureText('ドン・キホーテ').width / 2 + th * 0.7, Y(p.h - g) + th * 0.58, th * 0.36)
  }
  e.globalCompositeOperation = 'multiply'
  e.drawImage(color, 0, 0)
  return { color, glow }
}

/** The tall vertical sign at the front: ドンキホーテ down a yellow box. */
function paintTower(hm: number) {
  const W = 128
  const H = Math.round(hm * 64)
  const [cv, c] = canvas(W, H)
  c.fillStyle = YELLOW
  c.fillRect(0, 0, W, H)
  c.strokeStyle = RED
  c.lineWidth = 8
  c.strokeRect(4, 4, W - 8, H - 8)
  drawDonpen(c, W / 2, W * 0.62, W * 0.3)
  const chars = ['ド', 'ン', 'キ', 'ホ', 'ー', 'テ']
  const top = W * 1.15
  const step = (H - top - 10) / chars.length
  c.fillStyle = RED
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `900 ${Math.min(W * 0.72, step * 0.9)}px ${GOTHIC}`
  chars.forEach((ch, i) => {
    c.save()
    c.translate(W / 2, top + step * (i + 0.5))
    // Katakana ー runs down the sign when it's written vertically.
    if (ch === 'ー') c.rotate(Math.PI / 2)
    c.fillText(ch, 0, 0)
    c.restore()
  })
  return cv
}

/** A fish tank: deep blue water, coral and bright fish. */
function paintTank() {
  const [cv, c] = canvas(192, 160)
  const g = c.createLinearGradient(0, 0, 0, 160)
  g.addColorStop(0, '#5fd0ff')
  g.addColorStop(1, '#0b4f8a')
  c.fillStyle = g
  c.fillRect(0, 0, 192, 160)
  c.fillStyle = '#e8d8a8'
  c.fillRect(0, 140, 192, 20)
  for (let i = 0; i < 6; i++) {
    c.fillStyle = ['#ff6f61', '#ff9ec7', '#ffb347'][i % 3]
    c.beginPath()
    c.ellipse(15 + i * 32, 140, 8, 18 + (i % 3) * 6, 0, Math.PI, 0)
    c.fill()
  }
  for (let i = 0; i < 9; i++) {
    const x = 20 + hash(i, 3) * 150
    const y = 20 + hash(i, 7) * 100
    c.fillStyle = ['#ffd400', '#ff7a00', '#ffffff', '#3aa0ff', '#ff3b6b'][i % 5]
    c.beginPath()
    c.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2)
    c.fill()
    c.beginPath()
    c.moveTo(x - 8, y)
    c.lineTo(x - 15, y - 5)
    c.lineTo(x - 15, y + 5)
    c.fill()
  }
  // A big moray eel along the bottom.
  c.strokeStyle = '#6b6b3a'
  c.lineWidth = 7
  c.beginPath()
  c.moveTo(30, 128)
  c.bezierCurveTo(70, 105, 110, 140, 160, 118)
  c.stroke()
  return cv
}

/** Panels laid flat in front of one wall. */
function wallQuad(w: Wall, y0: number, y1: number) {
  const [lx, ly] = w.l
  const [rx, ry] = w.r
  const [nx, ny] = w.n
  const o = OUT
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([lx + nx * o, y0, ly + ny * o, rx + nx * o, y0, ry + ny * o, rx + nx * o, y1, ry + ny * o, lx + nx * o, y1, ly + ny * o], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  geo.computeVertexNormals()
  const nrm = geo.getAttribute('normal')
  if (nrm.getX(0) * nx + nrm.getZ(0) * ny < 0) geo.setIndex([0, 2, 1, 0, 3, 2])
  geo.computeVertexNormals()
  return geo
}

/**
 * The half-pipe coaster on the roof: a U-shaped yellow track between two
 * white lattice towers, with a red car parked at the bottom.
 */
function halfPipe(bin: Bin, p: Plan, mats: { track: THREE.Material; steel: THREE.Material; car: THREE.Material }) {
  const group = new THREE.Group()
  // Along the building's long direction: its longest edge.
  let ux = 1
  let uy = 0
  let longest = 0
  p.ring.forEach(([ax, ay], i) => {
    const [bx, by] = p.ring[(i + 1) % p.ring.length]
    const l = Math.hypot(bx - ax, by - ay)
    if (l > longest) [longest, ux, uy] = [l, (bx - ax) / l, (by - ay) / l]
  })
  let cx = 0
  let cy = 0
  for (const [x, y] of p.ring) {
    cx += x / p.ring.length
    cy += y / p.ring.length
  }
  // Pull the middle back toward the inside if the centroid is outside.
  if (!inside(p.ring, cx, cy)) {
    cx = (p.front.l[0] + p.front.r[0]) / 2 - p.front.n[0] * (longest / 2)
    cy = (p.front.l[1] + p.front.r[1]) / 2 - p.front.n[1] * (longest / 2)
  }
  const roof = p.base + p.h
  const L = Math.min(24, Math.max(12, longest * 0.7))
  const H = Math.min(9, L * 0.36)
  const pts: THREE.Vector3[] = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const s = (t - 0.5) * L
    // A U: flat-ish bottom, rising to vertical at the ends.
    const y = roof + 1.4 + H * Math.pow(Math.abs(2 * t - 1), 2.6)
    pts.push(new THREE.Vector3(cx + ux * s, y, cy + uy * s))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const side: [number, number] = [-uy, ux]
  for (const off of [-0.55, 0.55]) {
    const rail = bin.add(new THREE.TubeGeometry(curve, 120, 0.14, 6, false))
    const m = new THREE.Mesh(rail, mats.track)
    m.position.set(side[0] * off, 0, side[1] * off)
    m.castShadow = true
    group.add(m)
  }
  // The spine under the rails and ties every half meter.
  const spine = bin.add(new THREE.TubeGeometry(curve, 120, 0.28, 8, false).translate(0, -0.45, 0))
  const sm = new THREE.Mesh(spine, mats.track)
  sm.castShadow = true
  group.add(sm)
  const tie = bin.add(new THREE.BoxGeometry(1.3, 0.12, 0.18))
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    const pt = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const m = new THREE.Mesh(tie, mats.steel)
    m.position.copy(pt).add(new THREE.Vector3(0, -0.18, 0))
    m.lookAt(pt.clone().add(tan))
    m.rotateY(Math.PI / 2)
    m.rotateZ(Math.PI / 2)
    group.add(m)
  }
  // Supports: a lattice tower at each end, A-frames along the bottom.
  const leg = bin.add(new THREE.CylinderGeometry(0.12, 0.12, 1, 6))
  const strut = (a: THREE.Vector3, b: THREE.Vector3) => {
    const m = new THREE.Mesh(leg, mats.steel)
    const d = b.clone().sub(a)
    m.position.copy(a).addScaledVector(d, 0.5)
    m.scale.y = d.length()
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    m.castShadow = true
    group.add(m)
  }
  for (const t of [0.04, 0.16, 0.3, 0.5, 0.7, 0.84, 0.96]) {
    const top = curve.getPointAt(t).add(new THREE.Vector3(0, -0.5, 0))
    for (const s of [-1, 1]) {
      const foot = new THREE.Vector3(top.x + side[0] * s * 1.4, roof, top.z + side[1] * s * 1.4)
      strut(foot, top)
    }
    if (t < 0.2 || t > 0.8) {
      // Cross bracing on the tall end towers.
      const mid = (top.y + roof) / 2
      strut(new THREE.Vector3(top.x + side[0] * 1.2, roof + 0.2, top.z + side[1] * 1.2), new THREE.Vector3(top.x - side[0] * 0.8, mid, top.z - side[1] * 0.8))
    }
  }
  // The car, parked at the bottom.
  const car = new THREE.Mesh(bin.add(new THREE.BoxGeometry(2.4, 0.9, 1.4)), mats.car)
  const bottom = curve.getPointAt(0.5)
  car.position.set(bottom.x, bottom.y + 0.55, bottom.z)
  car.rotation.y = -Math.atan2(uy, ux)
  car.castShadow = true
  group.add(car)
  return group
}

interface Built {
  group: THREE.Group
  glow: THREE.MeshLambertMaterial[]
  dispose(): void
}

function build(p: Plan, uniforms: ReturnType<typeof seeThroughUniforms>): Built {
  const bin = new Bin()
  const group = new THREE.Group()
  group.name = 'don-quijote'
  const glow: THREE.MeshLambertMaterial[] = []
  const mat = (opts: THREE.MeshLambertMaterialParameters, lit = false) => {
    const m = bin.add(seeThrough(new THREE.MeshLambertMaterial({ emissive: '#ffffff', emissiveIntensity: 0, ...opts }), uniforms, p.base))
    for (const t of [opts.map, opts.emissiveMap]) if (t) bin.add(t)
    if (lit) glow.push(m)
    return m
  }
  p.walls.forEach((w, i) => {
    const { color, glow: g } = paintWall(w, p, w === p.front, i + 1)
    const mesh = new THREE.Mesh(bin.add(wallQuad(w, p.base, p.base + p.h)), mat({ map: texture(color), emissiveMap: texture(g) }, true))
    mesh.receiveShadow = true
    group.add(mesh)
  })
  const f = p.front
  const dx = (f.r[0] - f.l[0]) / f.len
  const dy = (f.r[1] - f.l[1]) / f.len
  const [nx, ny] = f.n
  const at = (u: number, up: number, out: number) => new THREE.Vector3(f.l[0] + dx * u + nx * out, p.doorZ + up, f.l[1] + dy * u + ny * out)
  // The tall vertical sign at the right end of the front.
  const towerH = Math.min(p.h - 5, 9)
  if (towerH > 3) {
    const tex = texture(paintTower(towerH))
    const face = mat({ map: tex, emissiveMap: tex }, true)
    const edge = mat({ color: RED, emissive: RED }, true)
    const box = bin.add(new THREE.BoxGeometry(1.7, towerH, 0.45))
    // Box faces: +x, -x, +y, -y, +z, -z; +z faces the street.
    const sign = new THREE.Mesh(box, [edge, edge, edge, edge, face, edge])
    sign.position.copy(at(Math.max(1, f.len - 1.3), 4.9 + towerH / 2, 0.35))
    sign.rotation.y = Math.atan2(nx, ny)
    sign.castShadow = true
    group.add(sign)
  }
  // Fish tanks either side of the door.
  const tankTex = texture(paintTank())
  const glass = mat({ map: tankTex, emissiveMap: tankTex }, true)
  const frame = mat({ color: '#2a2d31' })
  const tankGeo = bin.add(new THREE.BoxGeometry(1.5, 1.3, 0.55))
  const standGeo = bin.add(new THREE.BoxGeometry(1.55, 0.7, 0.6))
  for (const s of [-1, 1]) {
    const u = f.len / 2 + s * 2.7
    const tank = new THREE.Mesh(tankGeo, [frame, frame, frame, frame, glass, glass])
    tank.position.copy(at(u, 0.7 + 0.65, 0.4))
    tank.rotation.y = Math.atan2(nx, ny)
    group.add(tank)
    const stand = new THREE.Mesh(standGeo, frame)
    stand.position.copy(at(u, 0.35, 0.4))
    stand.rotation.y = Math.atan2(nx, ny)
    group.add(stand)
  }
  // The coaster on the roof.
  group.add(
    halfPipe(bin, p, {
      track: mat({ color: YELLOW, emissive: '#ffcf00' }, false),
      steel: mat({ color: '#eceff1' }),
      car: mat({ color: RED }),
    }),
  )
  return { group, glow, dispose: () => bin.dispose() }
}

export function DonQuijote({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const found = useMemo(() => findDonki(tiles), [tiles])
  const key = found ? found.b.p.join(',') : ''
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo(() => {
    if (!found || typeof document === 'undefined') return null
    const p = plan(map, found.tile, found.b)
    return p ? build(p, uniforms) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uniforms])
  useEffect(() => () => built?.dispose(), [built])
  const camera = useThree((s) => s.camera)
  const t = useRef(0)
  useFrame((_, dt) => {
    const { x, y } = focus.current
    uniforms.uPlayer.value.set(x, groundAt(map, x, y) + 1.0, y)
    uniforms.uCam.value.copy(camera.position)
    t.current += dt
  })
  useEffect(() => {
    // Lit all day and all night: Donki never closes.
    for (const m of built?.glow ?? []) m.emissiveIntensity = 0.25 + night * 0.85
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
