import { Outlines, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { PARTS, PLAYER_LOOK, paintOf } from '../game/character'
import { signTexture } from './signs'

// One small Roppongi-like corner, drawn the same way in every look: a main
// road, a side street, a scramble of zebra
// crossings, mid-rise buildings with stacked signs to the north, low shops
// and a pocket park to the south, and one person walking. A look only
// decides materials, colors, light and the camera; the block stays put so
// the five samples compare like for like.

/** What a surface is, so a look can paint it its own way. */
export type Role =
  | 'ground'
  | 'road'
  | 'walk'
  | 'curb'
  | 'paint'
  | 'wall'
  | 'roof'
  | 'glass'
  | 'trim'
  | 'sign'
  | 'leaf'
  | 'trunk'
  | 'metal'
  | 'deck'
  | 'awning'
  | 'lamp'
  | 'skin'
  | 'cloth'
  | 'hair'
  | 'dirt'

export interface MatProps {
  role: Role
  color: string
  map?: THREE.Texture
  /** 0 = not lit; above 0 the surface gives off light at night. */
  glow?: number
}

export interface LookStyle {
  /** Material for a surface. */
  Mat: (p: MatProps) => ReactNode
  /** Recolor a surface (pastel, ink-wash, night...). */
  tint?: (role: Role, color: string) => string
  /** Corner radius for boxes, for a soft toy look. */
  rounded?: number
  /** Ink outline around shapes, in pixels (thinner for small parts and the person). */
  outline?: { color: string; thickness: number; person: number }
  /** Lit windows, street lamps and glowing signs. */
  night?: boolean
  /** Draw the city past the block (off for a cut-out diorama). */
  surroundings?: boolean
  /** Trees as faceted gems instead of soft balls. */
  facetedTrees?: boolean
}

const LookContext = createContext<LookStyle>(null!)
export const useLook = () => useContext(LookContext)
export const LookProvider = LookContext.Provider

// A small seeded random so every look gets the same block.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

type V3 = [number, number, number]

/** A box painted by the current look. */
export function Box({ p, s, role, color, map, glow, rot, shadow = true }: { p: V3; s: V3; role: Role; color: string; map?: THREE.Texture; glow?: number; rot?: V3; shadow?: boolean }) {
  const look = useLook()
  const c = look.tint ? look.tint(role, color) : color
  const mat = look.Mat({ role, color: c, map, glow })
  const outline = look.outline && role !== 'paint' && role !== 'glass' && role !== 'road' && role !== 'ground' && Math.min(...s) > 0.05
  // Outline thickness is in screen pixels; thin parts get a finer line.
  const ol = outline ? <Outlines thickness={Math.min(...s) < 0.4 ? look.outline!.person : look.outline!.thickness} color={look.outline!.color} /> : null
  const min = Math.min(...s)
  if (look.rounded && min > 0.25 && role !== 'road' && role !== 'paint' && role !== 'ground' && role !== 'sign') {
    return (
      <RoundedBox args={s} radius={Math.min(look.rounded, min / 3)} smoothness={3} position={p} rotation={rot} castShadow={shadow} receiveShadow>
        {mat}
        {ol}
      </RoundedBox>
    )
  }
  return (
    <mesh position={p} rotation={rot} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      {mat}
      {ol}
    </mesh>
  )
}

function Ball({ p, r, role, color, scale }: { p: V3; r: number; role: Role; color: string; scale?: V3 }) {
  const look = useLook()
  const c = look.tint ? look.tint(role, color) : color
  return (
    <mesh position={p} scale={scale} castShadow receiveShadow>
      {look.facetedTrees ? <icosahedronGeometry args={[r, 0]} /> : <sphereGeometry args={[r, 24, 16]} />}
      {look.Mat({ role, color: c })}
      {look.outline ? <Outlines thickness={look.outline.thickness} color={look.outline.color} /> : null}
    </mesh>
  )
}

function Rod({ a, b, r, role, color }: { a: V3; b: V3; r: number; role: Role; color: string }) {
  const look = useLook()
  const c = look.tint ? look.tint(role, color) : color
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 8]} />
      {look.Mat({ role, color: c })}
    </mesh>
  )
}

// ---- layout -------------------------------------------------------------
// x east, z south, y up, meters. Main road (Roppongi-dori-like) runs east-
// west at z -6..6; the side street runs north-south at x -4..4.
const ROAD_Z = 6
const SIDE_X = 4
const WALK = 3.5
const EDGE = 34
const CURB = 0.15

function Ground() {
  const look = useLook()
  const far = look.surroundings ? 160 : EDGE
  const quads: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  return (
    <group>
      {/* Asphalt */}
      <Box p={[0, -0.05, 0]} s={[far * 2, 0.1, ROAD_Z * 2]} role="road" color="#3b3e45" shadow={false} />
      <Box p={[0, -0.05, -(ROAD_Z + far) / 2]} s={[SIDE_X * 2, 0.1, far - ROAD_Z]} role="road" color="#3b3e45" shadow={false} />
      <Box p={[0, -0.05, (ROAD_Z + far) / 2]} s={[SIDE_X * 2, 0.1, far - ROAD_Z]} role="road" color="#3b3e45" shadow={false} />
      {/* Raised blocks: sidewalk at the edge, the lot behind it. */}
      {quads.map(([sx, sz]) => {
        const w = far - SIDE_X
        const d = far - ROAD_Z
        const cx = sx * (SIDE_X + w / 2)
        const cz = sz * (ROAD_Z + d / 2)
        return (
          <group key={`${sx}${sz}`}>
            <Box p={[cx, CURB / 2, cz]} s={[w, CURB, d]} role="walk" color="#c9c4ba" shadow={false} />
            {/* Curb stones */}
            <Box p={[cx, CURB / 2 + 0.01, sz * (ROAD_Z + 0.15)]} s={[w, CURB + 0.02, 0.3]} role="curb" color="#e2ded6" shadow={false} />
            <Box p={[sx * (SIDE_X + 0.15), CURB / 2 + 0.01, cz]} s={[0.3, CURB + 0.02, d]} role="curb" color="#e2ded6" shadow={false} />
            {/* Paving seams so the sidewalk reads as tiles. */}
            {Array.from({ length: Math.floor(w / 2.4) }, (_, i) => (
              <Box key={i} p={[sx * (SIDE_X + 1.2 + i * 2.4), CURB + 0.005, sz * (ROAD_Z + WALK / 2)]} s={[0.05, 0.01, WALK]} role="paint" color="#b3ada2" shadow={false} />
            ))}
          </group>
        )
      })}
      {!look.surroundings && <Box p={[0, -1.6, 0]} s={[EDGE * 2, 3, EDGE * 2]} role="dirt" color="#8a6a4f" shadow={false} />}
    </group>
  )
}

function Markings() {
  const far = useLook().surroundings ? 160 : EDGE
  const white = '#f2f2ee'
  const out: ReactNode[] = []
  // Zebra crossings on all four arms.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = -ROAD_Z + 0.8 + i * 1.3
      out.push(<Box key={`zx${sx}${i}`} p={[sx * (SIDE_X + 2.2), 0.01, z]} s={[3.2, 0.02, 0.6]} role="paint" color={white} shadow={false} />)
    }
    // Stop line
    out.push(<Box key={`st${sx}`} p={[sx * (SIDE_X + 4.6), 0.01, sx * -3]} s={[0.4, 0.02, 6]} role="paint" color={white} shadow={false} />)
  }
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = -SIDE_X + 0.7 + i * 1.3
      out.push(<Box key={`zz${sz}${i}`} p={[x, 0.01, sz * (ROAD_Z + 2.2)]} s={[0.6, 0.02, 3.2]} role="paint" color={white} shadow={false} />)
    }
  }
  // Main road: center line in orange, dashed lane lines.
  for (const sx of [-1, 1]) {
    out.push(<Box key={`c${sx}`} p={[sx * (SIDE_X + 4.8 + (far - SIDE_X - 4.8) / 2), 0.01, 0]} s={[far - SIDE_X - 4.8, 0.02, 0.3]} role="paint" color="#f0a830" shadow={false} />)
    for (let x = SIDE_X + 6; x < far; x += 6) {
      for (const z of [-3, 3]) out.push(<Box key={`d${sx}${x}${z}`} p={[sx * x, 0.01, z]} s={[3, 0.02, 0.15]} role="paint" color={white} shadow={false} />)
    }
  }
  // とまれ painted on the side street.
  out.push(<Box key="tomare" p={[1.8, 0.012, ROAD_Z + 6.5]} s={[3, 0.02, 1.6]} role="paint" color={white} map={signTexture('とまれ', { bg: 'transparent', fg: '#f2f2ee', w: 384, h: 192 })} shadow={false} />)
  return <group>{out}</group>
}

interface Bldg {
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
  /** Which side faces the street: windows and signs go there. */
  face: 'n' | 's' | 'e' | 'w'
  floor?: number
  signs?: { text: string; bg: string; fg: string; vertical?: boolean; at: number; y: number; w: number; h: number; side?: 'n' | 's' | 'e' | 'w' }[]
  shop?: { color: string; awning?: string }
  roofStuff?: boolean
}

const BUILDINGS: Bldg[] = [
  // North side, across the main road: mid-rise row with stacked signs.
  {
    x: 13.5,
    z: -17,
    w: 11,
    d: 14,
    h: 24,
    color: '#b9b2a6',
    face: 's',
   
    roofStuff: true,
    signs: [
      { text: 'カラオケ', bg: '#d83a52', fg: '#ffffff', vertical: true, at: -4.6, y: 6.2, w: 1.4, h: 5.4, side: 's' },
      { text: '焼肉', bg: '#1f1f24', fg: '#ffcf3a', vertical: true, at: -4.6, y: 10.4, w: 1.4, h: 3, side: 's' },
      { text: '居酒屋', bg: '#f4efe2', fg: '#a3261b', vertical: true, at: -4.6, y: 14, w: 1.4, h: 3.6, side: 's' },
      { text: 'すし', bg: '#2a6fb0', fg: '#ffffff', vertical: true, at: -4.6, y: 17.6, w: 1.4, h: 2.4, side: 's' },
      { text: '2F 喫茶', bg: '#f6e7c8', fg: '#5a3a22', at: 1.5, y: 4.6, w: 5, h: 1, side: 's' },
      { text: 'ダーツ', bg: '#6a2bd9', fg: '#ffffff', vertical: true, at: -5.6, y: 9, w: 1.2, h: 3.6, side: 'w' },
    ],
    shop: { color: '#e9e2d0' },
  },
  {
    x: 25,
    z: -16,
    w: 10,
    d: 12,
    h: 14,
    color: '#6c7a89',
    face: 's',
    signs: [
      { text: 'BAR 2F', bg: '#20243a', fg: '#ff7ab6', at: 0, y: 4.4, w: 6, h: 1.2, side: 's' },
      { text: 'クラブ', bg: '#0f8f9a', fg: '#ffffff', vertical: true, at: 4.6, y: 8.5, w: 1.3, h: 4, side: 's' },
    ],
    shop: { color: '#d7d2c8', awning: '#20243a' },
  },
  { x: -13.5, z: -14.5, w: 11, d: 9, h: 4.5, color: '#f3f3ef', face: 's', floor: 4.5, signs: [{ text: 'コンビニ', bg: '#ffffff', fg: '#127a6a', at: 0, y: 3.7, w: 7, h: 1, side: 's' }], shop: { color: '#f3f3ef' } },
  {
    x: -24.5,
    z: -17,
    w: 9,
    d: 14,
    h: 19,
    color: '#c7a98a',
    face: 's',
    roofStuff: true,
    signs: [
      { text: 'ラーメン', bg: '#f2b632', fg: '#2a1a10', vertical: true, at: 3.6, y: 9, w: 1.3, h: 5, side: 's' },
      { text: '中華', bg: '#c22f2f', fg: '#ffe9b0', vertical: true, at: 3.6, y: 13.6, w: 1.3, h: 2.6, side: 's' },
    ],
    shop: { color: '#3a2f2a', awning: '#c22f2f' },
  },
  { x: -32, z: -15, w: 5, d: 10, h: 13, color: '#8f9aa3', face: 's' },
  { x: 32, z: -15, w: 5, d: 10, h: 18, color: '#d9d3c4', face: 's' },
  // South side, near the camera: low shops and a small park, so they don't hide the street.
  { x: 13, z: 14, w: 10, d: 8, h: 7, color: '#e5d8c3', face: 'n', shop: { color: '#f7f1e4', awning: '#2f6b4f' }, signs: [{ text: 'カフェ', bg: '#2f6b4f', fg: '#fff8e8', at: 0, y: 3.6, w: 4.2, h: 0.9, side: 'n' }] },
  { x: 24, z: 15, w: 8, d: 10, h: 9, color: '#a8b6c2', face: 'n', shop: { color: '#ffffff' }, signs: [{ text: 'くすり', bg: '#2d5fb8', fg: '#ffffff', at: 0, y: 3.8, w: 5, h: 1, side: 'n' }] },
  { x: -25, z: 15, w: 9, d: 10, h: 8, color: '#d4c4b0', face: 'n', shop: { color: '#e9dfcf', awning: '#a33b2b' }, signs: [{ text: 'そば', bg: '#f4efe2', fg: '#1f1f24', at: 0, y: 3.8, w: 3.2, h: 0.9, side: 'n' }] },
  { x: 32, z: 15, w: 5, d: 10, h: 11, color: '#bfa58e', face: 'n' },
]

function sideVec(face: 'n' | 's' | 'e' | 'w') {
  return { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[face] as [number, number]
}

function Building({ b, seed }: { b: Bldg; seed: number }) {
  const look = useLook()
  const floor = b.floor ?? 3.2
  const floors = Math.max(1, Math.floor(b.h / floor))
  const r = rng(seed)
  const parts: ReactNode[] = []
  parts.push(<Box key="body" p={[b.x, CURB + b.h / 2, b.z]} s={[b.w, b.h, b.d]} role="wall" color={b.color} />)
  // Parapet trim and a roof slab.
  parts.push(<Box key="cap" p={[b.x, CURB + b.h + 0.15, b.z]} s={[b.w + 0.3, 0.3, b.d + 0.3]} role="trim" color="#7d7a74" />)
  // Rooftops show a lot from above: AC units, and a water tank and stair hut on taller ones.
  parts.push(<Box key="ac1" p={[b.x - b.w / 4, CURB + b.h + 0.6, b.z + b.d / 5]} s={[1.6, 0.9, 1.2]} role="metal" color="#d4d6d8" />)
  parts.push(<Box key="ac2" p={[b.x - b.w / 4 + 2, CURB + b.h + 0.6, b.z + b.d / 5]} s={[1.6, 0.9, 1.2]} role="metal" color="#d4d6d8" />)
  if (b.h > 10) {
    parts.push(<Box key="hut" p={[b.x + b.w / 5, CURB + b.h + 1.4, b.z - b.d / 5]} s={[3, 2.6, 3]} role="wall" color={b.color} />)
    parts.push(<Rod key="tank" a={[b.x - b.w / 5, CURB + b.h + 0.3, b.z - b.d / 4]} b={[b.x - b.w / 5, CURB + b.h + 2.6, b.z - b.d / 4]} r={1} role="metal" color="#c9c3b5" />)
  }
  if (b.roofStuff) parts.push(<Box key="bb" p={[b.x, CURB + b.h + 2.4, b.z + b.d / 2 - 0.6]} s={[b.w * 0.7, 3, 0.25]} role="sign" color="#ffffff" map={signTexture('六本木 ラジオ', { bg: '#1d2a4d', fg: '#ffd84a', w: 768, h: 160 })} glow={look.night ? 2.2 : 0} />)
  for (const face of ['n', 's', 'e', 'w'] as const) {
    const [nx, nz] = sideVec(face)
    const along = nx === 0 ? b.w : b.d
    const out = nx === 0 ? b.d / 2 : b.w / 2
    const cols = Math.max(1, Math.floor(along / 2.6))
    const startF = b.shop ? 1 : 0
    for (let f = startF; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const t = (c + 0.5) / cols - 0.5
        const lit = look.night && r() < 0.6
        const y = CURB + f * floor + floor * 0.55
        const px = b.x + (nx === 0 ? t * along : nx * (out + 0.03))
        const pz = b.z + (nz === 0 ? t * along : nz * (out + 0.03))
        const size: V3 = nx === 0 ? [along / cols - 0.9, floor * 0.5, 0.08] : [0.08, floor * 0.5, along / cols - 0.9]
        parts.push(<Box key={`w${face}${f}${c}`} p={[px, y, pz]} s={size} role="glass" color={lit ? (r() < 0.7 ? '#ffd9a0' : '#bfe3ff') : '#5f7387'} glow={lit ? 1.2 : 0} shadow={false} />)
      }
      // A thin band between floors.
      const bandSize: V3 = nx === 0 ? [along, 0.12, 0.1] : [0.1, 0.12, along]
      parts.push(
        <Box
          key={`band${face}${f}`}
          p={[b.x + (nx === 0 ? 0 : nx * (out + 0.04)), CURB + f * floor, b.z + (nz === 0 ? 0 : nz * (out + 0.04))]}
          s={bandSize}
          role="trim"
          color="#8a857c"
          shadow={false}
        />,
      )
    }
    if (b.shop && face === b.face) {
      // Ground-floor shopfront: big glass and an awning.
      const h = Math.min(floor, 3.2)
      const size: V3 = nx === 0 ? [along - 1, h * 0.75, 0.1] : [0.1, h * 0.75, along - 1]
      parts.push(
        <Box key="shop" p={[b.x + nx * (out + 0.04), CURB + h * 0.42, b.z + nz * (out + 0.04)]} s={size} role="glass" color={look.night ? '#fff2d6' : '#8fa3b5'} glow={look.night ? 1.6 : 0} shadow={false} />,
      )
      if (b.shop.awning) {
        const aw: V3 = nx === 0 ? [along - 0.6, 0.2, 1.4] : [1.4, 0.2, along - 0.6]
        parts.push(<Box key="awn" p={[b.x + nx * (out + 0.7), CURB + h * 0.92, b.z + nz * (out + 0.7)]} s={aw} role="awning" color={b.shop.awning} rot={nx === 0 ? [nz * 0.25, 0, 0] : [0, 0, -nx * 0.25]} />)
      }
    }
  }
  for (const [i, s] of (b.signs ?? []).entries()) {
    const face = s.side ?? b.face
    const [nx, nz] = sideVec(face)
    const out = nx === 0 ? b.d / 2 : b.w / 2
    const tex = signTexture(s.text, { bg: s.bg, fg: s.fg, vertical: s.vertical, w: s.vertical ? 192 : Math.round(192 * (s.w / s.h)), h: s.vertical ? Math.round(192 * (s.h / s.w)) : 192 })
    // Vertical signs stick out from the wall, readable from up and down the street; flat ones sit on the facade.
    if (s.vertical) {
      const px = b.x + (nx === 0 ? s.at : nx * (out + 0.1))
      const pz = b.z + (nz === 0 ? s.at : nz * (out + 0.1))
      parts.push(<Box key={`sg${i}`} p={[px, CURB + s.y, pz + nz * 0.05]} s={nx === 0 ? [s.w, s.h, 0.3] : [0.3, s.h, s.w]} role="sign" color="#ffffff" map={tex} glow={look.night ? 2.2 : 0} />)
    } else {
      const px = b.x + (nx === 0 ? s.at : nx * (out + 0.12))
      const pz = b.z + (nz === 0 ? s.at : nz * (out + 0.12))
      parts.push(
        <Box key={`sg${i}`} p={[px, CURB + s.y, pz]} s={nx === 0 ? [s.w, s.h, 0.2] : [0.2, s.h, s.w]} role="sign" color="#ffffff" map={tex} glow={look.night ? 2 : 0} />,
      )
    }
  }
  return <group>{parts}</group>
}

function Tree({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 1.2, 0]} s={[0.3, 2.4, 0.3]} role="trunk" color="#6b4a32" />
      <Ball p={[0, 3.3, 0]} r={1.5} role="leaf" color="#4f8a3c" />
      <Ball p={[0.7, 2.9, 0.4]} r={1} role="leaf" color="#5c9a45" />
      <Ball p={[-0.6, 3, -0.3]} r={1.05} role="leaf" color="#467f36" />
    </group>
  )
}

function Signal({ p, turn }: { p: V3; turn: number }) {
  const look = useLook()
  return (
    <group position={p} rotation={[0, turn, 0]}>
      <Box p={[0, 2.6, 0]} s={[0.18, 5.2, 0.18]} role="metal" color="#8c9196" />
      <Box p={[0.9, 5, 0]} s={[1.8, 0.12, 0.12]} role="metal" color="#8c9196" />
      {/* Flat Japanese-style three-lamp head */}
      <Box p={[1.4, 5, 0.12]} s={[1.5, 0.5, 0.25]} role="metal" color="#5a5f66" />
      {(['#2fbf71', '#f2b632', '#e24b4b'] as const).map((c, i) => (
        <Box key={c} p={[0.95 + i * 0.45, 5, 0.26]} s={[0.32, 0.32, 0.05]} role="lamp" color={i === 0 ? c : '#3a3d42'} glow={i === 0 ? (look.night ? 3 : 0.6) : 0} shadow={false} />
      ))}
      {/* Pedestrian signal */}
      <Box p={[0, 2.8, 0.15]} s={[0.4, 0.8, 0.2]} role="metal" color="#5a5f66" />
      <Box p={[0, 2.6, 0.26]} s={[0.26, 0.26, 0.04]} role="lamp" color="#2fbf71" glow={look.night ? 3 : 0.6} shadow={false} />
    </group>
  )
}

function Pole({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 4.5, 0]} s={[0.3, 9, 0.3]} role="metal" color="#9b9890" />
      <Box p={[0, 8.2, 0]} s={[1.6, 0.12, 0.12]} role="metal" color="#7e7b74" />
      <Box p={[0.35, 6.4, 0.22]} s={[0.45, 0.6, 0.45]} role="metal" color="#7e7b74" />
      <Box p={[0, 2.6, 0.17]} s={[0.32, 1.1, 0.04]} role="sign" color="#ffffff" map={signTexture('六本木 3', { bg: '#1e4fa3', fg: '#ffffff', vertical: true, w: 96, h: 320 })} shadow={false} />
    </group>
  )
}

function Lamp({ p }: { p: V3 }) {
  const look = useLook()
  return (
    <group position={p}>
      <Box p={[0, 3, 0]} s={[0.14, 6, 0.14]} role="metal" color="#5d6268" />
      <Box p={[0, 6, 0.5]} s={[0.4, 0.15, 1.2]} role="metal" color="#5d6268" />
      <Box p={[0, 5.9, 0.8]} s={[0.3, 0.06, 0.6]} role="lamp" color="#fff3d6" glow={look.night ? 4 : 0} shadow={false} />
      {look.night && <pointLight position={[0, 5.4, 0.8]} color="#ffd9a0" intensity={140} distance={18} decay={2} />}
    </group>
  )
}

function Vending({ p, color, turn = 0 }: { p: V3; color: string; turn?: number }) {
  const look = useLook()
  return (
    <group position={p} rotation={[0, turn, 0]}>
      <Box p={[0, 0.95, 0]} s={[1, 1.9, 0.8]} role="metal" color={color} />
      <Box p={[0, 1.25, 0.41]} s={[0.8, 0.8, 0.02]} role="glass" color="#eaf3ff" glow={look.night ? 2.2 : 0.2} shadow={false} />
      {[0, 1, 2].map((i) => (
        <Box key={i} p={[-0.25 + i * 0.25, 1.35, 0.43]} s={[0.12, 0.3, 0.02]} role="sign" color={['#e24b4b', '#2fbf71', '#f2b632'][i]} shadow={false} />
      ))}
      {look.night && <pointLight position={[0, 1.2, 1]} color="#dff0ff" intensity={6} distance={5} />}
    </group>
  )
}

function Rail({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const posts: ReactNode[] = []
  for (let x = x0; x <= x1; x += 2) posts.push(<Box key={x} p={[x, CURB + 0.45, z]} s={[0.08, 0.9, 0.08]} role="metal" color="#e8e8e4" />)
  return (
    <group>
      {posts}
      <Box p={[(x0 + x1) / 2, CURB + 0.85, z]} s={[x1 - x0, 0.1, 0.1]} role="metal" color="#e8e8e4" />
    </group>
  )
}

function Bench({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.45, 0]} s={[1.8, 0.1, 0.5]} role="trunk" color="#9a6b43" />
      <Box p={[-0.7, 0.22, 0]} s={[0.1, 0.44, 0.4]} role="metal" color="#55595e" />
      <Box p={[0.7, 0.22, 0]} s={[0.1, 0.44, 0.4]} role="metal" color="#55595e" />
    </group>
  )
}

function Surroundings() {
  const items = useMemo(() => {
    const r = rng(7)
    const out: { p: V3; s: V3; c: string }[] = []
    const colors = ['#b6b0a5', '#8f9aa3', '#cfc8b8', '#9c8f80', '#7d8892', '#d8d2c6']
    for (let i = 0; i < 70; i++) {
      const sx = r() < 0.5 ? -1 : 1
      const sz = r() < 0.5 ? -1 : 1
      const x = sx * (EDGE + 4 + r() * 70) * (r() < 0.4 ? 0.3 + r() * 0.7 : 1)
      const z = sz * (ROAD_Z + WALK + 26 + r() * 70)
      if (Math.abs(x) < SIDE_X + 4) continue
      const h = 8 + r() * 30
      out.push({ p: [x, CURB + h / 2, z], s: [8 + r() * 10, h, 8 + r() * 10], c: colors[Math.floor(r() * colors.length)] })
    }
    // Keep the row along the main road beyond the block.
    for (const sx of [-1, 1]) {
      for (let x = EDGE + 6; x < 150; x += 12 + r() * 4) {
        for (const sz of [-1, 1]) {
          const h = 8 + r() * 22
          out.push({ p: [sx * x, CURB + h / 2, sz * (ROAD_Z + WALK + 6)], s: [10, h, 10], c: colors[Math.floor(r() * colors.length)] })
        }
      }
    }
    return out
  }, [])
  return (
    <group>
      {items.map((b, i) => (
        <Box key={i} p={b.p} s={b.s} role="wall" color={b.c} />
      ))}
    </group>
  )
}

export function Block() {
  const look = useLook()
  return (
    <group>
      <Ground />
      <Markings />
      {BUILDINGS.map((b, i) => (
        <Building key={i} b={b} seed={i + 1} />
      ))}
      {look.surroundings && <Surroundings />}
      {/* Pocket park on the south-west corner, by the crossing. */}
      <Box p={[-12.5, CURB + 0.2, 14]} s={[8, 0.4, 7]} role="leaf" color="#7aa860" />
      <Tree p={[-14, CURB, 14]} />
      <Tree p={[-10.5, CURB, 16]} />
      <Bench p={[-12, CURB, 11.4]} />
      {/* Street trees along the main road */}
      {[-30, -19, 12, 27].map((x) => (
        <Tree key={x} p={[x, CURB, ROAD_Z + 1]} />
      ))}
      {[-17, 30].map((x) => (
        <Tree key={x} p={[x, CURB, -ROAD_Z - 1]} />
      ))}
      <Signal p={[-SIDE_X - 0.8, CURB, ROAD_Z + 0.8]} turn={0} />
      <Signal p={[SIDE_X + 0.8, CURB, -ROAD_Z - 0.8]} turn={Math.PI} />
      <Signal p={[SIDE_X + 0.8, CURB, ROAD_Z + 0.8]} turn={-Math.PI / 2} />
      <Signal p={[-SIDE_X - 0.8, CURB, -ROAD_Z - 0.8]} turn={Math.PI / 2} />
      {[-23, 7, 19].map((x) => (
        <Pole key={x} p={[x, CURB, ROAD_Z + 2.9]} />
      ))}
      {/* Overhead wires sag between the poles. */}
      {[
        [-23, 7],
        [7, 19],
      ].map(([a, b]) =>
        [7.6, 8.1].map((y) => <Rod key={`${a}${y}`} a={[a, CURB + y, ROAD_Z + 2.9]} b={[b, CURB + y - 0.15, ROAD_Z + 2.9]} r={0.025} role="metal" color="#2a2a2a" />),
      )}
      {[-14, 15].map((x) => (
        <Lamp key={x} p={[x, CURB, -ROAD_Z - 0.7]} />
      ))}
      <Lamp p={[-28, CURB, ROAD_Z + 0.7]} />
      <Vending p={[19.5, CURB, ROAD_Z + 7.4]} color="#e8edf2" turn={Math.PI} />
      <Vending p={[18.4, CURB, ROAD_Z + 7.4]} color="#c8352f" turn={Math.PI} />
      <Vending p={[-7.4, CURB, -ROAD_Z - 7]} color="#2a6fb0" turn={Math.PI / 2} />
      <Rail x0={8} x1={16} z={ROAD_Z + 0.5} />
      <Rail x0={-32} x1={-24} z={-ROAD_Z - 0.5} />
      <Person />
    </group>
  )
}

// ---- the person ----------------------------------------------------------

/** One walker, back and forth along the south sidewalk by the crossing. */
export function Person() {
  const look = useLook()
  const root = useRef<THREE.Group>(null)
  const pivots = useRef<Record<string, THREE.Group | null>>({})
  const parts = useMemo(() => PARTS.filter((p) => p.name !== 'umbrella' && p.name !== 'longHair').map((p) => ({ spec: p, geom: p.make(1) })), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Ping-pong between two points on the sidewalk.
    const span = 13
    const speed = 1.3
    const u = (t * speed) % (span * 2)
    const forward = u < span
    const x = -20 + (forward ? u : span * 2 - u)
    if (root.current) {
      root.current.position.set(x, CURB, ROAD_Z + 2)
      root.current.rotation.y = forward ? Math.PI / 2 : -Math.PI / 2
    }
    const swing = Math.sin(t * 6.4) * 0.55
    for (const { spec } of parts) {
      const g = pivots.current[spec.name]
      if (g && spec.swing) g.rotation.x = swing * spec.swing
    }
    if (root.current) root.current.children[0].position.y = Math.abs(Math.cos(t * 6.4)) * 0.05
  })
  const s = 1.5
  return (
    <group ref={root}>
      <group scale={s}>
        {parts.map(({ spec, geom }) => {
          const color = paintOf(PLAYER_LOOK, spec.paint)
          const role: Role = spec.paint === 'skin' ? 'skin' : spec.paint === 'hair' || spec.paint === 'eyes' ? 'hair' : 'cloth'
          const c = look.tint ? look.tint(role, color) : color
          const mesh = (
            <mesh geometry={geom} castShadow={!!spec.shadow}>
              {look.Mat({ role, color: c })}
              {look.outline && spec.name !== 'eyes' ? <Outlines thickness={look.outline.person} color={look.outline.color} /> : null}
            </mesh>
          )
          if (!spec.pivot) return <group key={spec.name}>{mesh}</group>
          const [px, py, pz] = spec.pivot
          return (
            <group key={spec.name} position={[px, py, pz]} ref={(g) => void (pivots.current[spec.name] = g)}>
              <group position={[-px, -py, -pz]}>{mesh}</group>
            </group>
          )
        })}
      </group>
      {look.night && <pointLight position={[0.6, 2.8, 1.4]} color="#9fc4ff" intensity={14} distance={6} />}
    </group>
  )
}

/** Where cameras look: the crossing, nudged toward the walker. */
export const FOCUS: V3 = [-6, 2, 2]
