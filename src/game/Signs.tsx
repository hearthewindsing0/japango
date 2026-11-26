import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { buildingBase, type HeightFn } from './geometry'
import { is24h, isOpen } from './hours'
import type { MapTile } from './map'

// Shop signs: a lit board over each shop front with its name, and for bars
// and restaurants in taller buildings a vertical sign (袖看板) sticking out
// from the wall, the way Roppongi's side streets look. All signs share one
// canvas texture.
//
// Shops with real opening hours (from OpenStreetMap) follow Tokyo time: an
// open shop has a 営業中 plate by the door; a closed one has its sign
// switched off and its shutter down, with a 準備中 plate hung on it.

const FONT = '"M PLUS 1 Variable", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'

// Diorama: signs are little rounded toy boards with a cream rim. Corners
// are cut out by alphaTest.
function board(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, bg: string) {
  ctx.beginPath()
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, r)
  ctx.fillStyle = '#fbf3e4'
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x + 6, y + 6, w - 12, h - 12, Math.max(2, r - 4))
  ctx.fillStyle = bg
  ctx.fill()
}
const ATLAS = 1024 // atlas width; its height fits the tile's signs
const H_SLOT = { w: 256, h: 64 } // horizontal boards
const V_SLOT = { w: 64, h: 256 } // vertical signs

type Kind = MapTile['signs'][number]['k']

function colorsFor(text: string, kind: Kind): [string, string] {
  if (/ファミリーマート|FamilyMart/i.test(text)) return ['#ffffff', '#0b7a3e']
  if (/ローソン|LAWSON/i.test(text)) return ['#1e5fb4', '#ffffff']
  if (/セブン|7-Eleven|7-ELEVEN/i.test(text)) return ['#ffffff', '#e3342f']
  switch (kind) {
    case 'konbini':
      return ['#2b6cb0', '#ffffff']
    case 'food':
      return ['#b91c1c', '#fff7e6']
    case 'cafe':
      return ['#5b3a29', '#f5e6c8']
    case 'bar':
      return ['#1f1235', '#ff7ad9']
    default:
      return ['#f4f1ea', '#222222']
  }
}

function drawHorizontal(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: Kind) {
  const [bg, fg] = colorsFor(text, kind)
  board(ctx, x, y, H_SLOT.w, H_SLOT.h, 16, bg)
  ctx.fillStyle = fg
  let size = 36
  ctx.font = `800 ${size}px ${FONT}`
  const w = ctx.measureText(text).width
  if (w > H_SLOT.w - 28) {
    size = Math.max(14, Math.floor((size * (H_SLOT.w - 28)) / w))
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + H_SLOT.w / 2, y + H_SLOT.h / 2 + 2, H_SLOT.w - 24)
}

function drawVertical(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: Kind) {
  const [bg, fg] = colorsFor(text, kind)
  board(ctx, x, y, V_SLOT.w, V_SLOT.h, 16, bg)
  ctx.fillStyle = fg
  // Japanese reads top to bottom on vertical signs: one character per line.
  const chars = [...text].slice(0, 8)
  const size = Math.min(40, Math.floor((V_SLOT.h - 24) / chars.length))
  ctx.font = `800 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chars.forEach((ch, i) => ctx.fillText(ch, x + V_SLOT.w / 2, y + (V_SLOT.h - size * chars.length) / 2 + size * (i + 0.5), V_SLOT.w - 14))
}

/** Mostly Japanese names suit vertical signs; long Latin names don't. */
const verticalOk = (t: string) => [...t].length <= 8 && /[぀-ヿ一-鿿]/.test(t)

export function Signs({
  tile,
  clip,
  height,
  day,
  minute,
  night,
}: {
  tile: MapTile
  clip: THREE.Plane[]
  height: HeightFn
  day: number
  minute: number
  night: number
}) {
  // The sign font loads its glyphs on demand: draw again once this tile's
  // characters are in.
  const [fontV, setFontV] = useState(0)
  useEffect(() => {
    if (typeof document === 'undefined' || !tile.signs.length) return
    let live = true
    document.fonts
      .load(`800 36px "M PLUS 1 Variable"`, tile.signs.map((s) => s.t).join(''))
      .then((f) => live && f.length > 0 && setFontV((v) => v + 1))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [tile])
  const built = useMemo(() => {
    void fontV
    const signs = tile.signs
    if (!signs.length || typeof document === 'undefined') return null
    // Horizontal boards first, then a band of vertical signs below them.
    const isVertical = (s: (typeof signs)[number]) => (s.k === 'bar' || s.k === 'food') && verticalOk(s.t) && (tile.buildings[s.b]?.h ?? 6) >= 8
    const hCols = ATLAS / H_SLOT.w
    const vCols = ATLAS / V_SLOT.w
    const H_ROWS = Math.ceil(signs.length / hCols)
    const vRows = Math.ceil(signs.filter(isVertical).length / vCols)
    const atlasH = 2 ** Math.ceil(Math.log2(Math.max(64, H_ROWS * H_SLOT.h + vRows * V_SLOT.h)))
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS
    canvas.height = atlasH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const pos: number[] = []
    const uv: number[] = []
    const up = new THREE.Vector3(0, 1, 0)
    // A quad facing `normal`, with u running along up × normal.
    const quad = (c: THREE.Vector3, normal: THREE.Vector3, w: number, h: number, r: [number, number, number, number]) => {
      const right = new THREE.Vector3().crossVectors(up, normal).multiplyScalar(w / 2)
      const top = up.clone().multiplyScalar(h / 2)
      const [u0, v0, u1, v1] = r
      const BL = c.clone().sub(right).sub(top)
      const BR = c.clone().add(right).sub(top)
      const TR = c.clone().add(right).add(top)
      const TL = c.clone().sub(right).add(top)
      for (const [p, u, v] of [
        [BL, u0, v0],
        [BR, u1, v0],
        [TR, u1, v1],
        [BL, u0, v0],
        [TR, u1, v1],
        [TL, u0, v1],
      ] as const) {
        pos.push(p.x, p.y, p.z)
        uv.push(u, v)
      }
    }
    // Slot rectangle in UV space (flipY: v = 1 at the top of the canvas).
    const rect = (x: number, y: number, w: number, h: number): [number, number, number, number] => [
      x / ATLAS,
      1 - (y + h) / atlasH,
      (x + w) / ATLAS,
      1 - y / atlasH,
    ]

    let nh = 0
    let nv = 0
    // Vertex range of each sign's quads, to dim it when the shop is closed.
    const ranges: [number, number][] = []
    for (const s of signs) {
      const first = pos.length / 3
      const b = tile.buildings[s.b]
      const base = b ? buildingBase(b.p, height) : height(s.x, s.y)
      const top = b ? b.h : 6
      const n = new THREE.Vector3(Math.cos(s.r), 0, Math.sin(s.r))
      // Board over the shop front.
      const sx = (nh % hCols) * H_SLOT.w
      const sy = Math.floor(nh / hCols) * H_SLOT.h
      drawHorizontal(ctx, sx, sy, s.t, s.k)
      const w = Math.min(s.w, 3.2)
      quad(new THREE.Vector3(s.x + n.x * 0.06, base + 3.05, s.y + n.z * 0.06), n, w, w / 4, rect(sx, sy, H_SLOT.w, H_SLOT.h))
      nh++
      // A vertical sign for bars and restaurants with floors above.
      if (isVertical(s)) {
        const vx = (nv % vCols) * V_SLOT.w
        const vy = H_ROWS * H_SLOT.h + Math.floor(nv / vCols) * V_SLOT.h
        drawVertical(ctx, vx, vy, s.t, s.k)
        // Off to one side of the board, sticking out from the wall.
        const side = new THREE.Vector3().crossVectors(up, n).multiplyScalar(w / 2 + 0.6)
        const c = new THREE.Vector3(s.x + n.x * 0.55 + side.x, base + Math.min(top - 1.6, 5.6), s.y + n.z * 0.55 + side.z)
        const across = new THREE.Vector3().crossVectors(up, n)
        const r = rect(vx, vy, V_SLOT.w, V_SLOT.h)
        quad(c.clone().addScaledVector(across, 0.03), across, 0.6, 2.4, r)
        quad(c.clone().addScaledVector(across, -0.03), across.clone().negate(), 0.6, 2.4, r)
        nv++
      }
      ranges.push([first, pos.length / 3])
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3))
    geo.computeBoundingSphere()
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.MeshBasicMaterial({ map: tex, clippingPlanes: clip, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })
    return { geo, tex, mat, ranges }
  }, [tile, clip, height, fontV])

  useEffect(
    () => () => {
      built?.geo.dispose()
      built?.tex.dispose()
      built?.mat.dispose()
    },
    [built],
  )

  // Which shops are closed right now (only those with known hours).
  const closedKey = tile.signs.map((s) => (s.oh && !isOpen(s.oh, day, minute) ? '1' : '0')).join('')
  const dark = night > 0.3
  useEffect(() => {
    if (!built) return
    const col = built.geo.getAttribute('color') as THREE.BufferAttribute
    built.ranges.forEach(([a, b], i) => {
      // A closed shop's sign is switched off: dim at night, a little flat by day.
      const v = closedKey[i] === '1' ? (dark ? 0.22 : 0.75) : 1
      for (let k = a; k < b; k++) col.setXYZ(k, v, v, v)
    })
    col.needsUpdate = true
  }, [built, closedKey, dark])

  return (
    <>
      {built && <mesh geometry={built.geo} material={built.mat} />}
      <Shutters tile={tile} clip={clip} height={height} closedKey={closedKey} />
    </>
  )
}

// --- Shutters and 営業中 / 準備中 plates -------------------------------------

const PLATE = { w: 256, h: 96 }
let plateTex: THREE.CanvasTexture | null = null
let shutterTex: THREE.CanvasTexture | null = null

/** Two plates side by side: 営業中 (open) on the left, 準備中 (closed) right. */
function plateTexture() {
  if (plateTex) return plateTex
  const canvas = document.createElement('canvas')
  canvas.width = PLATE.w * 2
  canvas.height = PLATE.h
  const ctx = canvas.getContext('2d')!
  const draw = (x: number, text: string, bg: string, fg: string) => {
    ctx.fillStyle = bg
    ctx.fillRect(x, 0, PLATE.w, PLATE.h)
    ctx.strokeStyle = fg
    ctx.lineWidth = 5
    ctx.strokeRect(x + 6, 6, PLATE.w - 12, PLATE.h - 12)
    ctx.fillStyle = fg
    ctx.font = `700 58px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + PLATE.w / 2, PLATE.h / 2 + 3, PLATE.w - 24)
  }
  draw(0, '営業中', '#fdfaf2', '#c81e1e')
  draw(PLATE.w, '準備中', '#2d2a26', '#f4efe4')
  plateTex = new THREE.CanvasTexture(canvas)
  plateTex.colorSpace = THREE.SRGBColorSpace
  plateTex.anisotropy = 4
  return plateTex
}

/** Corrugated steel: light and dark bands. */
function shutterTexture() {
  if (shutterTex) return shutterTex
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 32
  const ctx = canvas.getContext('2d')!
  for (let y = 0; y < 32; y++) {
    const t = (y % 8) / 8
    const v = Math.round(150 + 50 * Math.sin(t * Math.PI))
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 6})`
    ctx.fillRect(0, y, 4, 1)
  }
  shutterTex = new THREE.CanvasTexture(canvas)
  shutterTex.colorSpace = THREE.SRGBColorSpace
  shutterTex.wrapS = shutterTex.wrapT = THREE.RepeatWrapping
  return shutterTex
}

function Shutters({ tile, clip, height, closedKey }: { tile: MapTile; clip: THREE.Plane[]; height: HeightFn; closedKey: string }) {
  const built = useMemo(() => {
    if (typeof document === 'undefined') return null
    const shutter: { pos: number[]; uv: number[] } = { pos: [], uv: [] }
    const plate: { pos: number[]; uv: number[] } = { pos: [], uv: [] }
    const up = new THREE.Vector3(0, 1, 0)
    const quad = (out: { pos: number[]; uv: number[] }, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, [u0, v0, u1, v1]: number[]) => {
      const right = new THREE.Vector3().crossVectors(up, n).multiplyScalar(w / 2)
      const top = up.clone().multiplyScalar(h / 2)
      const BL = c.clone().sub(right).sub(top)
      const BR = c.clone().add(right).sub(top)
      const TR = c.clone().add(right).add(top)
      const TL = c.clone().sub(right).add(top)
      for (const [p, u, v] of [
        [BL, u0, v0],
        [BR, u1, v0],
        [TR, u1, v1],
        [BL, u0, v0],
        [TR, u1, v1],
        [TL, u0, v1],
      ] as const) {
        out.pos.push(p.x, p.y, p.z)
        out.uv.push(u, v)
      }
    }
    tile.signs.forEach((s, i) => {
      if (!s.oh || is24h(s.oh)) return
      const closed = closedKey[i] === '1'
      const b = tile.buildings[s.b]
      const base = b ? buildingBase(b.p, height) : height(s.x, s.y)
      const n = new THREE.Vector3(Math.cos(s.r), 0, Math.sin(s.r))
      const w = Math.min(s.w, 3.2)
      if (closed) {
        // Shutter from the pavement up to the sign board.
        const sh = 2.75
        quad(shutter, new THREE.Vector3(s.x + n.x * 0.05, base + sh / 2, s.y + n.z * 0.05), n, w, sh, [0, 0, w / 0.5, sh / 0.5])
        quad(plate, new THREE.Vector3(s.x + n.x * 0.08, base + 1.55, s.y + n.z * 0.08), n, 0.8, 0.3, [0.5, 0, 1, 1])
      } else {
        // Beside the door, at eye level.
        const side = new THREE.Vector3().crossVectors(up, n).multiplyScalar(Math.max(0.6, w / 2 - 0.5))
        quad(plate, new THREE.Vector3(s.x + n.x * 0.06 + side.x, base + 1.55, s.y + n.z * 0.06 + side.z), n, 0.8, 0.3, [0, 0, 0.5, 1])
      }
    })
    const geoOf = (g: { pos: number[]; uv: number[] }) => {
      if (!g.pos.length) return null
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
      geo.computeVertexNormals()
      geo.computeBoundingSphere()
      return geo
    }
    return { shutter: geoOf(shutter), plate: geoOf(plate) }
  }, [tile, height, closedKey])

  const mats = useMemo(
    () => ({
      shutter: new THREE.MeshStandardMaterial({ map: shutterTexture(), roughness: 0.6, metalness: 0.3, clippingPlanes: clip }),
      plate: new THREE.MeshBasicMaterial({ map: plateTexture(), clippingPlanes: clip }),
    }),
    [clip],
  )
  useEffect(
    () => () => {
      built?.shutter?.dispose()
      built?.plate?.dispose()
    },
    [built],
  )
  useEffect(
    () => () => {
      mats.shutter.dispose()
      mats.plate.dispose()
    },
    [mats],
  )
  if (!built) return null
  return (
    <>
      {built.shutter && <mesh geometry={built.shutter} material={mats.shutter} />}
      {built.plate && <mesh geometry={built.plate} material={mats.plate} />}
    </>
  )
}
