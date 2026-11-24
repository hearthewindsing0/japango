import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildingBase } from '../geometry'
import { groundAt, tileGroundAt, type GameMap, type MapTile } from '../map'
import { seeThroughUniforms } from '../seeThrough'
import type { Focus } from '../World'
import { Bin, buildingAt, canvas, findPoi, ringArea, ringOf, seeThrough, texture, type Ring } from './common'

// Roppongi Hills Mori Tower (六本木ヒルズ森タワー), 54 floors and 238 m, the
// tower everyone in Roppongi steers by. The map squashes tall buildings to
// at most 15 m so they don't wall off the view, so this dresses that stub so
// it still reads as the tower: a tall glass lobby, then dense bands of
// blue-grey glass and silver fins (many thin floors, so it looks tall from
// above), and the glass crown at the top where Tokyo City View and the Mori
// Art Museum are, glowing after dark, with a helipad and red aircraft lights
// on the roof. The footprint is the map's own (PLATEAU), petal curves and all.

const NAME = '六本木ヒルズ森タワー'
const OUT = 0.06
const LOBBY = 4.2
/** Game meters per floor above the lobby: thin, to suggest 50-odd floors. */
const FLOOR = 0.95
const BAY = 1.6
const CROWN = 2.6

/** One repeating block of facade, 8 bays by 8 floors, with lit windows for night. */
function paintFacade() {
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
      const x = bx * bw
      const y = fy * fh
      const n = Math.abs(Math.sin(bx * 12.9898 + fy * 78.233) * 43758.5453) % 1
      const g = c.createLinearGradient(x, y, x + bw, y + fh)
      g.addColorStop(0, `rgb(${92 + n * 18},${112 + n * 18},${130 + n * 16})`)
      g.addColorStop(1, `rgb(${58 + n * 10},${72 + n * 12},${88 + n * 12})`)
      c.fillStyle = g
      c.fillRect(x, y, bw, fh)
      // Offices lit after dark, most of them.
      if (n > 0.35) {
        e.fillStyle = n > 0.85 ? 'rgba(255,240,215,0.95)' : 'rgba(255,226,180,0.7)'
        e.fillRect(x + 2, y + fh * 0.22, bw - 4, fh * 0.7)
      }
    }
  // Spandrels: a pale band at each floor.
  c.fillStyle = '#c7ccd0'
  for (let fy = 0; fy < 8; fy++) c.fillRect(0, fy * fh, w, fh * 0.2)
  // Silver fins every bay, a thinner one between, which give the tower its
  // pinstriped look.
  for (let bx = 0; bx < 8; bx++) {
    c.fillStyle = '#e4e7ea'
    c.fillRect(bx * bw, 0, PX * 0.16, h)
    c.fillStyle = 'rgba(214,219,224,0.75)'
    c.fillRect(bx * bw + bw / 2, 0, PX * 0.06, h)
  }
  // Sky caught in the glass.
  c.fillStyle = 'rgba(255,255,255,0.08)'
  c.beginPath()
  c.moveTo(0, h)
  c.lineTo(w * 0.35, 0)
  c.lineTo(w * 0.55, 0)
  c.lineTo(w * 0.2, h)
  c.fill()
  const tc = texture(color, true)
  const tg = texture(glow, true)
  return { tc, tg }
}

/** The lobby: tall glass in slim frames, lit from inside. */
function paintLobby() {
  const PX = 48
  const w = 4 * BAY * PX
  const h = LOBBY * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  const g = c.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#5c6f80')
  g.addColorStop(1, '#a9b6bf')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  // Lit lobby behind the glass, between the frames.
  e.fillStyle = 'rgba(255,230,190,0.45)'
  for (let x = 0; x < w; x += BAY * PX) e.fillRect(x + 6, h * 0.2, BAY * PX - 12, h * 0.75)
  c.fillStyle = '#d9dde0'
  for (let x = 0; x <= w; x += BAY * PX) c.fillRect(x - 3, 0, 6, h)
  c.fillRect(0, h * 0.55, w, 4)
  // A dark stone plinth band at the top of the lobby.
  c.fillStyle = '#4a4d50'
  c.fillRect(0, 0, w, h * 0.12)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** The crown: glass between tall ribs, see-through at the top. */
function paintCrown() {
  const PX = 48
  const w = 2 * BAY * PX
  const h = CROWN * PX
  const [color, c] = canvas(w, h)
  const [glow, e] = canvas(w, h)
  const g = c.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#8fa7bb')
  g.addColorStop(1, '#486074')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
  e.fillStyle = '#000'
  e.fillRect(0, 0, w, h)
  // The observation floors glow cool white.
  e.fillStyle = 'rgba(205,230,255,0.95)'
  e.fillRect(0, h * 0.35, w, h * 0.55)
  c.fillStyle = '#eef1f3'
  for (let x = 0; x <= w; x += (BAY * PX) / 2) c.fillRect(x - 3, 0, 6, h)
  c.fillRect(0, h * 0.3, w, 5)
  c.fillRect(0, h - 6, w, 6)
  return { tc: texture(color, true), tg: texture(glow, true) }
}

/** Painted panels around a ring, from y0 to y1, `out` meters off the walls. */
export function band(ring: Ring, y0: number, y1: number, out: number, uScale: number, vScale: number, vOffset = 0) {
  const ccw = ringArea(ring) > 0
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let u = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % ring.length]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 0.01) continue
    const dx = (bx - ax) / len
    const dy = (by - ay) / len
    const nx = ccw ? dy : -dy
    const ny = ccw ? -dx : dx
    const k = pos.length / 3
    pos.push(ax + nx * out, y0, ay + ny * out, bx + nx * out, y0, by + ny * out, bx + nx * out, y1, by + ny * out, ax + nx * out, y1, ay + ny * out)
    uv.push(u / uScale, vOffset, (u + len) / uScale, vOffset, (u + len) / uScale, vOffset + (y1 - y0) / vScale, u / uScale, vOffset + (y1 - y0) / vScale)
    // Wind so the face points outward (+normal toward n).
    if (ccw) idx.push(k, k + 2, k + 1, k, k + 3, k + 2)
    else idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
    u += len
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** Pushes a ring outward by `d` meters (simple offset along vertex normals). */
export function grow(ring: Ring, d: number): Ring {
  const ccw = ringArea(ring) > 0
  const n = ring.length
  return ring.map(([x, y], i) => {
    const [px, py] = ring[(i + n - 1) % n]
    const [qx, qy] = ring[(i + 1) % n]
    const l1 = Math.hypot(x - px, y - py) || 1
    const l2 = Math.hypot(qx - x, qy - y) || 1
    const n1 = ccw ? [(y - py) / l1, -(x - px) / l1] : [-(y - py) / l1, (x - px) / l1]
    const n2 = ccw ? [(qy - y) / l2, -(qx - x) / l2] : [-(qy - y) / l2, (qx - x) / l2]
    let ax = n1[0] + n2[0]
    let ay = n1[1] + n2[1]
    const al = Math.hypot(ax, ay) || 1
    ax /= al
    ay /= al
    const cos = Math.max(0.5, ax * n1[0] + ay * n1[1])
    return [x + (ax * d) / cos, y + (ay * d) / cos] as [number, number]
  })
}

export function roofGeometry(ring: Ring, y: number) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ShapeGeometry(shape)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, y, 0)
  return geo
}

function paintHelipad() {
  const [cv, c] = canvas(256, 256)
  c.fillStyle = '#5d6063'
  c.fillRect(0, 0, 256, 256)
  c.strokeStyle = '#f2f2ee'
  c.lineWidth = 10
  c.beginPath()
  c.arc(128, 128, 104, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = '#f2f2ee'
  c.font = 'bold 150px Arial, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('H', 128, 136)
  return texture(cv)
}

interface Built {
  group: THREE.Group
  glowMats: THREE.MeshLambertMaterial[]
  lights: THREE.MeshBasicMaterial
  dispose(): void
}

function build(tile: MapTile, b: MapTile['buildings'][number], uniforms: ReturnType<typeof seeThroughUniforms>): Built | null {
  const ring = ringOf(b.p)
  if (ring.length < 3) return null
  const base = buildingBase(b.p, (x, y) => tileGroundAt(tile, x, y))
  const top = base + b.h
  const bin = new Bin()
  const group = new THREE.Group()
  group.name = 'mori-tower'
  const glowMats: THREE.MeshLambertMaterial[] = []
  const lit = (t: { tc: THREE.Texture; tg: THREE.Texture }, extra: THREE.MeshLambertMaterialParameters = {}) => {
    bin.add(t.tc)
    bin.add(t.tg)
    const m = bin.add(seeThrough(new THREE.MeshLambertMaterial({ map: t.tc, emissive: '#ffffff', emissiveMap: t.tg, emissiveIntensity: 0, side: THREE.DoubleSide, ...extra }), uniforms, base))
    glowMats.push(m)
    return m
  }
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
    bin.add(geo)
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  const lobbyTop = base + LOBBY + 0.6
  const crownBottom = top - CROWN + 0.4
  add(band(ring, base, lobbyTop, OUT, 4 * BAY, LOBBY + 0.6), lit(paintLobby()))
  add(band(ring, lobbyTop, crownBottom, OUT, 8 * BAY, 8 * FLOOR), lit(paintFacade()))
  // The crown bulges out a little, and rises past the roof.
  const crownRing = grow(ring, 0.35)
  add(band(crownRing, crownBottom, top + 1.6, 0, 2 * BAY, CROWN + 1.2), lit(paintCrown()))
  const roofMat = bin.add(seeThrough(new THREE.MeshLambertMaterial({ color: '#b3b7ba' }), uniforms, base))
  add(roofGeometry(crownRing, top + 0.9), roofMat, false)
  // Helipad in the middle of the roof.
  let cx = 0
  let cy = 0
  for (const [x, y] of ring) {
    cx += x / ring.length
    cy += y / ring.length
  }
  const pad = bin.add(paintHelipad())
  const padMat = bin.add(seeThrough(new THREE.MeshLambertMaterial({ map: pad }), uniforms, base))
  const padGeo = new THREE.CircleGeometry(7, 40).rotateX(-Math.PI / 2).translate(cx, top + 0.95, cy)
  add(padGeo, padMat, false)
  // Red aircraft warning lights around the rim.
  const lights = bin.add(new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }))
  const dot = bin.add(new THREE.SphereGeometry(0.28, 8, 6))
  const step = Math.max(1, Math.floor(crownRing.length / 8))
  for (let i = 0; i < crownRing.length; i += step) {
    const [x, y] = crownRing[i]
    const m = new THREE.Mesh(dot, lights)
    m.position.set(x, top + 1.9, y)
    group.add(m)
  }
  return { group, glowMats, lights, dispose: () => bin.dispose() }
}

export function MoriTower({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const found = useMemo(() => {
    const f = findPoi(tiles, NAME)
    if (!f) return null
    const b = buildingAt(f.tile, f.poi.x, f.poi.y)
    return b ? { tile: f.tile, b } : null
  }, [tiles])
  const key = found ? found.b.p.join(',') : ''
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo(
    () => (found && typeof document !== 'undefined' ? build(found.tile, found.b, uniforms) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, uniforms],
  )
  useEffect(() => () => built?.dispose(), [built])
  const camera = useThree((s) => s.camera)
  const blink = useRef(0)
  useFrame((_, dt) => {
    const { x, y } = focus.current
    uniforms.uPlayer.value.set(x, groundAt(map, x, y) + 1.0, y)
    uniforms.uCam.value.copy(camera.position)
    if (built) {
      blink.current += dt
      // Aircraft lights pulse about once every 1.5 s.
      const on = Math.sin(blink.current * 4.2) > 0.2
      built.lights.color.set(on ? '#ff2a1a' : '#5a1410')
    }
  })
  useEffect(() => {
    for (const m of built?.glowMats ?? []) m.emissiveIntensity = 0.05 + night * 0.75
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
