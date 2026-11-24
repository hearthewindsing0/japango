import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildingBase } from './geometry'
import { groundAt, tileGroundAt, type GameMap, type MapTile } from './map'
import { seeThroughGlsl, seeThroughUniforms } from './seeThrough'
import type { Focus } from './World'

// ALMOND (アマンド), the pink café on the corner of Roppongi Crossing and the
// neighborhood's classic meeting point. The map has its building as a plain
// box, so this dresses it up the way it looks in life: a tall glass corner
// with ALMOND in white letters and white railings, pink-lit window displays
// and pink banner flags, then grey stone tiles, and the hot pink sign with a
// striped awning on the stretch along the main road.
//
// The facade is a set of painted panels laid a few centimeters in front of
// the building's own walls, so the building stays as it is (roof, collisions,
// party walls). Which walls face the street, where the corner is and which
// side is the main road are all worked out from the map, not hard-coded.

const NAME = 'ALMOND'
const PX = 64 // texture pixels per meter
const OUT = 0.04 // facade panels sit this far in front of the walls

const PINK = '#e5337c'
const PINK_LIGHT = '#ff8fbd'
const PINK_DEEP = '#b81d5c'
const STONE = '#c2bfb9'
const MULLION = '#d9dadc'
const SERIF = 'Didot, "Bodoni 72", Georgia, "Times New Roman", serif'

type Ring = [number, number][]

const ringOf = (p: number[]): Ring => {
  const r: Ring = []
  for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i], p[i + 1]])
  const [a, b] = [r[0], r[r.length - 1]]
  if (r.length > 1 && a[0] === b[0] && a[1] === b[1]) r.pop()
  return r
}

function inside(r: Ring, x: number, y: number) {
  let hit = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const segDist = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9)))
  return Math.hypot(ax + t * dx - x, ay + t * dy - y)
}

/** One wall of the building that faces the street. */
interface Face {
  /** Left and right ends as seen from the street, in map meters. */
  l: [number, number]
  r: [number, number]
  len: number
  /** Outward normal, map (x, y). */
  n: [number, number]
  /** Ground height in front of it, above the building's base. */
  g: number
  role: 'corner' | 'main' | 'side'
  /** Which end the corner is at, for the main and side walls. */
  cornerAt: 'l' | 'r'
}

interface Plan {
  faces: Face[]
  base: number
  h: number
}

/** Works out the facade from the building's outline and its neighbors. */
function plan(tile: MapTile, b: MapTile['buildings'][number]): Plan | null {
  const ring = ringOf(b.p)
  if (ring.length < 3) return null
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % ring.length]
    area += ax * by - bx * ay
  }
  const ccw = area > 0
  const others = tile.buildings.filter((o) => o !== b).map((o) => ringOf(o.p))
  const height = (x: number, y: number) => tileGroundAt(tile, x, y)
  const base = buildingBase(b.p, height)
  // The widest road within a few meters of a point, or 0.
  const roadAt = (x: number, y: number) => {
    let w = 0
    for (const r of tile.roads) {
      if (r.b) continue
      for (let i = 0; i + 3 < r.p.length; i += 2)
        if (segDist(x, y, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) < r.w / 2 + r.s + 3) w = Math.max(w, r.w)
    }
    return w
  }

  const walls = ring.map(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length]
    const len = Math.hypot(bx - ax, by - ay)
    const dx = (bx - ax) / (len || 1)
    const dy = (by - ay) / (len || 1)
    // Outward: to the right of a→b on a counter-clockwise ring (y down).
    const n: [number, number] = ccw ? [dy, -dx] : [-dy, dx]
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    const px = mx + n[0] * 2.5
    const py = my + n[1] * 2.5
    const street = len > 1.5 && !others.some((o) => inside(o, px, py))
    // The right hand of someone outside looking at the wall.
    const rx = n[1]
    const ry = -n[0]
    const aLeft = (bx - ax) * rx + (by - ay) * ry > 0
    return {
      a: [ax, ay] as [number, number],
      b: [bx, by] as [number, number],
      len,
      n,
      street,
      road: street ? roadAt(mx + n[0] * 6, my + n[1] * 6) : 0,
      aLeft,
      g: Math.max(0, height(mx + n[0] * 1.5, my + n[1] * 1.5) - base),
    }
  })
  const k = walls.length
  // The corner: the shortest street wall with street walls either side (a
  // cut corner). Without one, the longest street wall is the main one and
  // there is no corner face.
  let corner = -1
  for (let i = 0; i < k; i++) {
    const w = walls[i]
    if (!w.street || !walls[(i + k - 1) % k].street || !walls[(i + 1) % k].street) continue
    if (w.len < 12 && (corner < 0 || w.len < walls[corner].len)) corner = i
  }
  const faces: Face[] = []
  const add = (i: number, role: Face['role'], cornerVertex: [number, number] | null) => {
    const w = walls[i]
    const l = w.aLeft ? w.a : w.b
    const r = w.aLeft ? w.b : w.a
    const cornerAt = cornerVertex && cornerVertex[0] === r[0] && cornerVertex[1] === r[1] ? 'r' : 'l'
    faces.push({ l, r, len: w.len, n: w.n, g: w.g, role, cornerAt })
  }
  if (corner >= 0) {
    const prev = (corner + k - 1) % k
    const next = (corner + 1) % k
    // The main wall is the one on the wider road.
    const mainIsPrev = walls[prev].road >= walls[next].road
    add(corner, 'corner', null)
    add(prev, mainIsPrev ? 'main' : 'side', walls[corner].a)
    add(next, mainIsPrev ? 'side' : 'main', walls[corner].b)
  } else {
    const street = walls.map((_, i) => i).filter((i) => walls[i].street)
    if (!street.length) return null
    const main = street.reduce((a, i) => (walls[i].road > walls[a].road || (walls[i].road === walls[a].road && walls[i].len > walls[a].len) ? i : a))
    // The corner end of the main wall: the one shared with another street wall.
    const prevStreet = walls[(main + k - 1) % k].street
    add(main, 'main', prevStreet ? walls[main].a : walls[main].b)
    const side = prevStreet ? (main + k - 1) % k : (main + 1) % k
    if (walls[side].street) add(side, 'side', walls[main].a === walls[side].b ? walls[main].a : walls[main].b)
  }
  return { faces, base, h: b.h }
}

/** Floor heights above the pavement, scaled to the building's height. */
function floors(h: number, g: number) {
  const top = h - g
  const s = Math.min(1, top / 14)
  return {
    shop: [0.15, 4.0 * s] as const, // ground-floor café and displays
    upper: [4.3 * s, 8.0 * s] as const, // second floor: the glass salon
    stone: 8.0 * s,
    windows: top > 11 ? ([10.6 * s, top - 0.9] as const) : null,
    top,
  }
}

/** Paints one wall. Returns the color canvas and a glow canvas for night. */
function paintFace(face: Face, p: Plan) {
  const w = Math.max(1, Math.round(face.len * PX))
  const H = Math.round(p.h * PX)
  const color = document.createElement('canvas')
  const glow = document.createElement('canvas')
  color.width = glow.width = w
  color.height = glow.height = H
  const c = color.getContext('2d')!
  const e = glow.getContext('2d')!
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, H)
  const f = floors(p.h, face.g)
  // Canvas y for a height above the pavement in front of this wall.
  const Y = (m: number) => H - (m + face.g) * PX
  const X = (m: number) => m * PX
  // Meters along the wall measured from the corner end.
  const fromCorner = (m: number) => (face.cornerAt === 'l' ? m : face.len - m)

  // Everything starts as stone tiles.
  c.fillStyle = STONE
  c.fillRect(0, 0, w, H)
  // Large granite tiles in a stack bond, with thin pale joints.
  c.fillStyle = '#9d9a95'
  c.fillRect(0, 0, w, H)
  const tw = 1.2 * PX
  const th = 0.75 * PX
  for (let y = H; y > -th; y -= th)
    for (let x = 0; x < w; x += tw) {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      const v = (n - Math.floor(n) - 0.5) * 10
      c.fillStyle = `rgb(${194 + v},${191 + v},${185 + v})`
      c.fillRect(x + 1, y - th + 1, tw - 2, th - 2)
    }
  // Dark plinth at the foot of the wall.
  c.fillStyle = '#55524f'
  c.fillRect(0, Y(f.shop[0]), w, H - Y(f.shop[0]))

  const glassBand = (x0: number, x1: number, y0: number, y1: number, kind: 'shop' | 'upper' | 'office', bay: number) => {
    const gx0 = X(x0)
    const gx1 = X(x1)
    const top = Y(y1)
    const bot = Y(y0)
    if (kind === 'office') {
      const g = c.createLinearGradient(0, top, 0, bot)
      g.addColorStop(0, '#7f97ad')
      g.addColorStop(1, '#4c5f72')
      c.fillStyle = g
      c.fillRect(gx0, top, gx1 - gx0, bot - top)
      // A few lit office windows at night.
      e.fillStyle = 'rgba(255,226,170,0.5)'
      e.fillRect(gx0, top, gx1 - gx0, bot - top)
    } else {
      // Pink-lit inside: curtains swagged along the top, glowing shelves.
      const g = c.createLinearGradient(0, top, 0, bot)
      g.addColorStop(0, kind === 'upper' ? '#c9447e' : '#f06a9f')
      g.addColorStop(0.45, PINK_LIGHT)
      g.addColorStop(1, kind === 'upper' ? '#f6a8c8' : '#ffd1e2')
      c.fillStyle = g
      c.fillRect(gx0, top, gx1 - gx0, bot - top)
      e.fillStyle = '#ffffff'
      e.fillRect(gx0, top, gx1 - gx0, bot - top)
      // Curtain swags.
      c.fillStyle = PINK_DEEP
      const sw = bay * PX
      for (let x = gx0; x < gx1 - 1; x += sw) {
        c.beginPath()
        c.moveTo(x, top)
        c.quadraticCurveTo(x + sw / 2, top + 0.7 * PX, Math.min(gx1, x + sw), top)
        c.fill()
      }
      if (kind === 'shop') {
        // Display shelves with cakes, and a white counter.
        for (const sy of [1.0, 1.6, 2.2]) {
          c.fillStyle = '#ffffff'
          c.fillRect(gx0, Y(sy), gx1 - gx0, 0.06 * PX)
          for (let x = gx0 + 6; x < gx1 - 8; x += 13) {
            c.fillStyle = ['#fff4ea', '#f8c9d8', '#7a3f2c', '#ffffff'][Math.floor(x / 13) % 4]
            c.fillRect(x, Y(sy) - 0.18 * PX, 9, 0.18 * PX)
          }
        }
      }
    }
    // Mullions every bay, and transoms top and bottom.
    c.fillStyle = MULLION
    const n = Math.max(1, Math.round((x1 - x0) / bay))
    for (let i = 0; i <= n; i++) {
      const x = gx0 + ((gx1 - gx0) * i) / n
      c.fillRect(x - 0.05 * PX, top, 0.1 * PX, bot - top)
    }
    c.fillRect(gx0, top - 0.06 * PX, gx1 - gx0, 0.12 * PX)
    c.fillRect(gx0, bot - 0.06 * PX, gx1 - gx0, 0.12 * PX)
    // Sky reflection streaks.
    c.fillStyle = 'rgba(255,255,255,0.14)'
    for (let i = 0; i < n; i++) {
      const x = gx0 + ((gx1 - gx0) * (i + 0.2)) / n
      c.beginPath()
      c.moveTo(x, bot)
      c.lineTo(x + 0.35 * PX, bot)
      c.lineTo(x + 0.9 * PX, top)
      c.lineTo(x + 0.55 * PX, top)
      c.fill()
    }
  }
  const railing = (x0: number, x1: number, y: number) => {
    // White balcony railing across the bottom of the upper glass.
    c.fillStyle = '#ffffff'
    e.fillStyle = 'rgba(255,255,255,0.6)'
    const top = Y(y + 0.85)
    c.fillRect(X(x0), top, X(x1) - X(x0), 0.07 * PX)
    c.fillRect(X(x0), Y(y + 0.1), X(x1) - X(x0), 0.05 * PX)
    for (let x = X(x0) + 4; x < X(x1); x += 0.14 * PX) c.fillRect(x, top, 2, Y(y + 0.1) - top)
    e.fillRect(X(x0), top, X(x1) - X(x0), 0.07 * PX)
  }
  const letters = (x0: number, x1: number, y0: number, y1: number) => {
    const size = Math.min((y1 - y0) * PX, ((x1 - x0) * PX) / 4.4)
    c.font = `600 ${size}px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const cx = (X(x0) + X(x1)) / 2
    const cy = (Y(y0) + Y(y1)) / 2
    c.fillStyle = 'rgba(120,20,60,0.35)'
    c.fillText(NAME, cx + 3, cy + 3)
    c.fillStyle = '#ffffff'
    c.fillText(NAME, cx, cy)
    e.font = c.font
    e.textAlign = 'center'
    e.textBaseline = 'middle'
    e.fillStyle = '#ffffff'
    e.fillText(NAME, cx, cy)
  }

  const glassTo = face.role === 'corner' ? face.len : Math.min(face.len - (face.role === 'main' ? 4.2 : 2), Math.max(3, face.len * 0.5))
  // Glass from the corner end, then stone.
  const [g0, g1] = face.cornerAt === 'l' ? [0, glassTo] : [face.len - glassTo, face.len]
  glassBand(g0, g1, f.shop[0], f.shop[1], 'shop', 1.45)
  glassBand(g0, g1, f.upper[0], f.upper[1], 'upper', 1.45)
  railing(g0, g1, f.upper[0])
  if (face.role === 'corner') letters(g0 + 0.5, g1 - 0.5, f.upper[0] + 1.3, f.upper[1] - 0.6)
  else if (glassTo > 3.5) letters(g0 + 0.3, g1 - 0.3, f.upper[0] + 1.6, f.upper[1] - 0.8)
  if (f.windows) {
    // Office floors above the stone band, on every street wall.
    glassBand(0.4, face.len - 0.4, f.windows[0], f.windows[1], 'office', 1.8)
  }

  // The stone stretch: a café door with a pink display beside it.
  if (face.role !== 'corner' && face.len - glassTo > 1.5) {
    const s0 = fromCorner(glassTo)
    const s1 = fromCorner(face.len)
    const [a, b] = [Math.min(s0, s1) + 0.5, Math.max(s0, s1) - 0.5]
    if (b - a > 1) glassBand(a, b, f.shop[0], f.shop[1] - 0.6, 'shop', (b - a) / 2)
  }
  // What glows is the painted wall itself, where the lights are.
  e.globalCompositeOperation = 'multiply'
  e.drawImage(color, 0, 0)
  return { color, glow }
}

/** The hot pink sign over the stone stretch: ALMOND over a striped awning. */
function paintSign(wm: number, hm: number) {
  const w = Math.round(wm * PX * 1.5)
  const h = Math.round(hm * PX * 1.5)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  c.fillStyle = PINK
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#ffffff'
  c.font = `600 ${h * 0.17}px ${SERIF}`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(NAME, w / 2, h * 0.15)
  // A striped half-dome awning.
  const cx = w / 2
  const cy = h * 0.84
  const rx = w * 0.4
  const ry = h * 0.52
  const n = 11
  // Gores between meridians, like a striped dome seen from the front.
  const meridian = (k: number, t: number): [number, number] => [cx + rx * k * Math.cos(t), cy - ry * Math.sin(t)]
  const STEPS = 24
  for (let i = 0; i < n; i++) {
    const ka = Math.sin(-Math.PI / 2 + (Math.PI * i) / n)
    const kb = Math.sin(-Math.PI / 2 + (Math.PI * (i + 1)) / n)
    c.fillStyle = i % 2 ? PINK_LIGHT : '#ffffff'
    c.beginPath()
    for (let j = 0; j <= STEPS; j++) c.lineTo(...meridian(ka, (Math.PI / 2) * (j / STEPS)))
    for (let j = STEPS; j >= 0; j--) c.lineTo(...meridian(kb, (Math.PI / 2) * (j / STEPS)))
    c.closePath()
    c.fill()
  }
  // A little knob on top.
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.arc(cx, cy - ry, h * 0.03, 0, Math.PI * 2)
  c.fill()
  // Scalloped valance along the bottom.
  c.fillStyle = '#ffffff'
  c.fillRect(cx - rx, cy, rx * 2, h * 0.06)
  const sc = (rx * 2) / 12
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? '#ffffff' : '#f7b6cf'
    c.beginPath()
    c.arc(cx - rx + sc * (i + 0.5), cy + h * 0.06, sc / 2, 0, Math.PI)
    c.fill()
  }
  return cv
}

/** A pink banner flag with white chevrons and the name. */
function paintFlag() {
  const w = 96
  const h = 192
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  c.fillStyle = PINK
  c.fillRect(0, 0, w, h)
  c.strokeStyle = '#ffffff'
  c.lineWidth = 9
  for (const y of [18, 42]) {
    c.beginPath()
    c.moveTo(0, y + 18)
    c.lineTo(w / 2, y)
    c.lineTo(w, y + 18)
    c.stroke()
  }
  c.fillStyle = '#ffffff'
  c.font = `600 19px ${SERIF}`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(NAME, w / 2, h * 0.62)
  c.fillRect(w * 0.2, h * 0.7, w * 0.6, 2)
  return cv
}

const texture = (cv: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Adds the see-through hole to a material, as the other buildings have. */
function seeThrough<M extends THREE.Material>(m: M, uniforms: ReturnType<typeof seeThroughUniforms>, base: number) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPlayer; uniform vec3 uCam; varying vec3 vWorld;\nconst float vBase = ${base.toFixed(2)};`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${seeThroughGlsl()}`)
  }
  return m
}

interface Built {
  group: THREE.Group
  mats: THREE.MeshLambertMaterial[]
  dispose(): void
}

function build(p: Plan, uniforms: ReturnType<typeof seeThroughUniforms>): Built {
  const group = new THREE.Group()
  group.name = 'almond'
  const mats: THREE.MeshLambertMaterial[] = []
  const disposables: { dispose(): void }[] = []
  const mat = (opts: THREE.MeshLambertMaterialParameters) => {
    const m = seeThrough(new THREE.MeshLambertMaterial({ emissive: '#ffffff', emissiveIntensity: 0, ...opts }), uniforms, p.base)
    mats.push(m)
    disposables.push(m)
    for (const t of [opts.map, opts.emissiveMap]) if (t) disposables.push(t)
    return m
  }
  const flagTex = texture(paintFlag())
  const flagMat = mat({ map: flagTex, emissiveMap: flagTex, side: THREE.DoubleSide })
  const poleMat = mat({ color: '#e8e8ea' })
  const flagGeo = new THREE.PlaneGeometry(0.7, 1.4)
  const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6).rotateZ(Math.PI / 2)
  disposables.push(flagGeo, poleGeo)

  for (const face of p.faces) {
    const { color, glow } = paintFace(face, p)
    const m = mat({ map: texture(color), emissiveMap: texture(glow) })
    const [lx, ly] = face.l
    const [rx, ry] = face.r
    const [nx, ny] = face.n
    const y0 = p.base
    const y1 = p.base + p.h
    const geo = new THREE.BufferGeometry()
    const o = OUT
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [lx + nx * o, y0, ly + ny * o, rx + nx * o, y0, ry + ny * o, rx + nx * o, y1, ry + ny * o, lx + nx * o, y1, ly + ny * o],
        3,
      ),
    )
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    geo.computeVertexNormals()
    // Make sure it faces outward.
    const nrm = geo.getAttribute('normal')
    if (nrm.getX(0) * nx + nrm.getZ(0) * ny < 0) geo.setIndex([0, 2, 1, 0, 3, 2])
    geo.computeVertexNormals()
    disposables.push(geo)
    const mesh = new THREE.Mesh(geo, m)
    mesh.receiveShadow = true
    group.add(mesh)

    // Along the wall, from the left end, in world space.
    const dx = (rx - lx) / face.len
    const dy = (ry - ly) / face.len
    const at = (u: number, up: number, out: number) => new THREE.Vector3(lx + dx * u + nx * out, p.base + face.g + up, ly + dy * u + ny * out)
    const f = floors(p.h, face.g)
    const glassTo = face.role === 'corner' ? face.len : Math.min(face.len - (face.role === 'main' ? 4.2 : 2), Math.max(3, face.len * 0.5))
    const fromCorner = (m2: number) => (face.cornerAt === 'l' ? m2 : face.len - m2)

    // Banner flags on short poles sticking out over the pavement.
    const flagStep = 2.9
    for (let m2 = 1.2; m2 < glassTo - 0.6; m2 += flagStep) {
      const u = fromCorner(m2)
      const pole = new THREE.Mesh(poleGeo, poleMat)
      pole.position.copy(at(u, f.upper[0] + 1.25, 0.4))
      pole.rotation.y = -Math.atan2(ny, nx)
      group.add(pole)
      const flag = new THREE.Mesh(flagGeo, flagMat)
      flag.position.copy(at(u, f.upper[0] + 0.55, 0.45))
      // Hung square to the wall, so it reads from up the street and above.
      flag.rotation.y = Math.atan2(dx, dy)
      flag.castShadow = true
      group.add(flag)
    }

    // The pink sign over the stone stretch of the main wall.
    if (face.role === 'main' && face.len - glassTo > 2.5) {
      const sw = Math.min(face.len - glassTo - 0.6, 5)
      const sh = Math.min(f.upper[1] - f.upper[0] - 0.4, sw * 0.62)
      const mid = fromCorner(glassTo + (face.len - glassTo) / 2)
      const signTex = texture(paintSign(sw, sh))
      const front = mat({ map: signTex, emissiveMap: signTex })
      const edge = mat({ color: '#ffffff' })
      const box = new THREE.BoxGeometry(sw, sh, 0.22)
      disposables.push(box)
      // Box faces: +x, -x, +y, -y, +z (front), -z.
      const sign = new THREE.Mesh(box, [edge, edge, edge, edge, front, edge])
      sign.position.copy(at(mid, f.upper[0] + 0.25 + sh / 2, 0.15))
      sign.rotation.y = Math.atan2(nx, ny)
      sign.castShadow = true
      group.add(sign)
    }
  }
  return {
    group,
    mats,
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}

/** Finds ALMOND's building among the loaded tiles. */
function findAlmond(tiles: MapTile[]) {
  for (const tile of tiles) {
    const poi = tile.pois.find((p) => p.name === NAME)
    if (!poi) continue
    // The building with the café in it, or failing that the one whose
    // street sign carries the name.
    let b = tile.buildings.find((o) => inside(ringOf(o.p), poi.x, poi.y))
    if (!b) {
      const s = tile.signs.find((x) => x.t === NAME)
      b = s ? tile.buildings[s.b] : undefined
    }
    if (b) return { tile, b }
  }
  return null
}

/** The names of signs the landmark replaces (the map's generic board). */
export const LANDMARK_SIGNS = new Set([NAME])

export function Almond({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const found = useMemo(() => findAlmond(tiles), [tiles])
  // Rebuild only when the building itself changes, not on every tile load.
  const key = found ? found.b.p.join(',') : ''
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo(() => {
    if (!found || typeof document === 'undefined') return null
    const p = plan(found.tile, found.b)
    return p ? build(p, uniforms) : null
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
    // Lit from inside all day; brighter after dark.
    for (const m of built?.mats ?? []) m.emissiveIntensity = m.emissiveMap ? 0.15 + night * 0.6 : 0
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
