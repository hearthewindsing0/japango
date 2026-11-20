import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildingBase, type HeightFn } from './geometry'
import { groundAt, type GameMap } from './map'

// Shop signs: a lit board over each shop front with its name, and for bars
// and restaurants in taller buildings a vertical sign (袖看板) sticking out
// from the wall, the way Roppongi's side streets look. All signs share one
// canvas texture.

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'
const ATLAS = 2048
const H_SLOT = { w: 256, h: 64 } // horizontal boards
const V_SLOT = { w: 64, h: 256 } // vertical signs
const H_ROWS = 24 // rows of horizontal slots; vertical ones go below

type Kind = NonNullable<GameMap['signs']>[number]['k']

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
  ctx.fillStyle = bg
  ctx.fillRect(x, y, H_SLOT.w, H_SLOT.h)
  ctx.fillStyle = fg
  let size = 40
  ctx.font = `700 ${size}px ${FONT}`
  const w = ctx.measureText(text).width
  if (w > H_SLOT.w - 16) {
    size = Math.max(14, Math.floor((size * (H_SLOT.w - 16)) / w))
    ctx.font = `700 ${size}px ${FONT}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + H_SLOT.w / 2, y + H_SLOT.h / 2 + 2, H_SLOT.w - 12)
}

function drawVertical(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: Kind) {
  const [bg, fg] = colorsFor(text, kind)
  ctx.fillStyle = bg
  ctx.fillRect(x, y, V_SLOT.w, V_SLOT.h)
  ctx.strokeStyle = fg
  ctx.lineWidth = 3
  ctx.strokeRect(x + 3, y + 3, V_SLOT.w - 6, V_SLOT.h - 6)
  ctx.fillStyle = fg
  // Japanese reads top to bottom on vertical signs: one character per line.
  const chars = [...text].slice(0, 8)
  const size = Math.min(44, Math.floor((V_SLOT.h - 16) / chars.length))
  ctx.font = `700 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chars.forEach((ch, i) => ctx.fillText(ch, x + V_SLOT.w / 2, y + 8 + size * (i + 0.5), V_SLOT.w - 8))
}

/** Mostly Japanese names suit vertical signs; long Latin names don't. */
const verticalOk = (t: string) => [...t].length <= 8 && /[぀-ヿ一-鿿]/.test(t)

export function Signs({ map, clip, height }: { map: GameMap; clip: THREE.Plane[]; height: HeightFn }) {
  const built = useMemo(() => {
    const signs = map.signs ?? []
    if (!signs.length || typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS
    canvas.height = ATLAS
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
      1 - (y + h) / ATLAS,
      (x + w) / ATLAS,
      1 - y / ATLAS,
    ]

    const hCols = ATLAS / H_SLOT.w
    const vCols = ATLAS / V_SLOT.w
    const vRows = Math.floor((ATLAS - H_ROWS * H_SLOT.h) / V_SLOT.h)
    let nh = 0
    let nv = 0
    for (const s of signs) {
      if (nh >= hCols * H_ROWS) break
      const b = map.buildings[s.b]
      const base = b ? buildingBase(b.p, height) : groundAt(map, s.x, s.y)
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
      if ((s.k === 'bar' || s.k === 'food') && top >= 8 && verticalOk(s.t) && nv < vCols * vRows) {
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
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeBoundingSphere()
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.MeshBasicMaterial({ map: tex, clippingPlanes: clip })
    return { geo, tex, mat }
  }, [map, clip, height])

  useEffect(
    () => () => {
      built?.geo.dispose()
      built?.tex.dispose()
      built?.mat.dispose()
    },
    [built],
  )
  if (!built) return null
  return <mesh geometry={built.geo} material={built.mat} />
}
