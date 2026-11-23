// Low-poly cars, taxis, vans, trucks and buses for the traffic. Each kind
// is three geometries: the body (painted per car with instance colors),
// the trim (glass, tyres, bumpers) and the lamps, which glow.
//
// Model space: the front points to +z, the car's left is +x (where the
// passenger sits in Japan), the ground is y = 0. Sizes are in meters.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const KINDS = ['sedan', 'taxi', 'kei', 'van', 'truck', 'bus'] as const
export type VehicleKind = (typeof KINDS)[number]

interface Part {
  size: [number, number, number]
  at: [number, number, number]
  color?: string
  wheel?: boolean
}

interface Spec {
  length: number
  body: Part[]
  trim: Part[]
  lamps: Part[]
  /** Paint jobs to pick from; repeats make a color more common. */
  paints: string[]
}

const GLASS = '#26313b'
const TYRE = '#1c1d20'
const BUMPER = '#3c3f44'
const HEAD = '#fff4d2'
const TAIL = '#e3262b'

const wheels = (r: number, x: number, zs: number[]): Part[] =>
  zs.flatMap((z) => [-x, x].map((wx): Part => ({ size: [r, 0.24, r], at: [wx, r, z], color: TYRE, wheel: true })))

const lights = (x: number, y: number, z: number, w = 0.34): Part[] => [
  ...[-x, x].map((lx): Part => ({ size: [w, 0.14, 0.05], at: [lx, y, z], color: HEAD })),
  ...[-x, x].map((lx): Part => ({ size: [w, 0.14, 0.05], at: [lx, y + 0.02, -z], color: TAIL })),
]

const SPECS: Record<VehicleKind, Spec> = {
  sedan: {
    length: 4.6,
    body: [
      { size: [1.76, 0.62, 4.6], at: [0, 0.62, 0] },
      { size: [1.58, 0.56, 2.45], at: [0, 1.21, -0.25] },
    ],
    trim: [
      { size: [1.6, 0.38, 2.5], at: [0, 1.18, -0.25], color: GLASS },
      { size: [1.78, 0.18, 0.12], at: [0, 0.42, 2.31], color: BUMPER },
      { size: [1.78, 0.18, 0.12], at: [0, 0.42, -2.31], color: BUMPER },
      ...wheels(0.32, 0.78, [1.45, -1.45]),
    ],
    lamps: lights(0.58, 0.8, 2.31),
    paints: ['#f2f2f0', '#f2f2f0', '#f2f2f0', '#c9ccd0', '#c9ccd0', '#18191b', '#18191b', '#2b3a55', '#7a1f24', '#5a5f66'],
  },
  // A tall, boxy Tokyo taxi with its roof lamp (行灯) and the red 空車
  // (vacant) sign behind the windscreen on the passenger side.
  taxi: {
    length: 4.4,
    body: [
      { size: [1.7, 0.7, 4.4], at: [0, 0.66, 0] },
      { size: [1.6, 0.72, 2.9], at: [0, 1.37, -0.05] },
    ],
    trim: [
      { size: [1.62, 0.48, 2.95], at: [0, 1.38, -0.05], color: GLASS },
      { size: [1.72, 0.2, 0.12], at: [0, 0.42, 2.21], color: BUMPER },
      { size: [1.72, 0.2, 0.12], at: [0, 0.42, -2.21], color: BUMPER },
      ...wheels(0.31, 0.75, [1.4, -1.4]),
    ],
    lamps: [
      { size: [0.5, 0.2, 0.24], at: [0, 1.83, 0.3], color: '#ffe7a3' },
      { size: [0.3, 0.1, 0.03], at: [0.42, 1.22, 1.44], color: '#ff3b30' },
      ...lights(0.56, 0.84, 2.21),
    ],
    paints: ['#1f2b4d', '#1f2b4d', '#1f2b4d', '#1f2b4d', '#151618', '#151618', '#e8b923', '#2f7d4a', '#e7e3d6', '#d9622b'],
  },
  // A kei car: small, square and tall.
  kei: {
    length: 3.4,
    body: [
      { size: [1.48, 0.6, 3.4], at: [0, 0.6, 0] },
      { size: [1.42, 0.85, 2.45], at: [0, 1.32, -0.28] },
    ],
    trim: [
      { size: [1.44, 0.52, 2.5], at: [0, 1.38, -0.28], color: GLASS },
      { size: [1.5, 0.16, 0.1], at: [0, 0.4, 1.71], color: BUMPER },
      { size: [1.5, 0.16, 0.1], at: [0, 0.4, -1.71], color: BUMPER },
      ...wheels(0.27, 0.65, [1.12, -1.12]),
    ],
    lamps: lights(0.5, 0.78, 1.71, 0.28),
    paints: ['#f4f4f0', '#f4f4f0', '#c9ccd0', '#b7d4e6', '#e8d8b0', '#c9524a', '#7d8b67', '#2a2c30'],
  },
  // A delivery van.
  van: {
    length: 4.7,
    body: [{ size: [1.7, 1.62, 4.7], at: [0, 1.12, 0] }],
    trim: [
      { size: [1.72, 0.56, 1.25], at: [0, 1.5, 1.74], color: GLASS },
      { size: [1.72, 0.2, 0.12], at: [0, 0.42, 2.36], color: BUMPER },
      { size: [1.72, 0.2, 0.12], at: [0, 0.42, -2.36], color: BUMPER },
      ...wheels(0.33, 0.75, [1.55, -1.5]),
    ],
    lamps: lights(0.6, 0.85, 2.36),
    paints: ['#f4f4f0', '#f4f4f0', '#f4f4f0', '#f4f4f0', '#c9ccd0', '#1f2a38'],
  },
  // A small box truck.
  truck: {
    length: 6.2,
    body: [{ size: [2.06, 2.25, 4.3], at: [0, 1.95, -0.85] }],
    trim: [
      { size: [1.9, 1.5, 1.7], at: [0, 1.2, 2.25], color: '#ebe9e3' },
      { size: [1.92, 0.58, 1.72], at: [0, 1.58, 2.27], color: GLASS },
      { size: [1.6, 0.3, 6.1], at: [0, 0.55, 0], color: '#2c2e32' },
      { size: [1.94, 0.22, 0.12], at: [0, 0.48, 3.1], color: BUMPER },
      ...wheels(0.4, 0.84, [2.2, -1.55, -2.45]),
    ],
    lamps: [
      ...[-0.7, 0.7].map((x): Part => ({ size: [0.32, 0.16, 0.05], at: [x, 0.85, 3.12], color: HEAD })),
      ...[-0.8, 0.8].map((x): Part => ({ size: [0.3, 0.16, 0.05], at: [x, 0.9, -3.02], color: TAIL })),
    ],
    paints: ['#eeeeea', '#eeeeea', '#c8ccd0', '#c8ccd0', '#2f5f9e', '#f2f2ec'],
  },
  // A city bus, cream with a green stripe.
  bus: {
    length: 10.5,
    body: [{ size: [2.49, 2.62, 10.5], at: [0, 1.6, 0] }],
    trim: [
      { size: [2.51, 0.95, 10.1], at: [0, 2.08, -0.1], color: GLASS },
      { size: [2.2, 1.5, 0.05], at: [0, 1.75, 5.25], color: GLASS },
      { size: [2.51, 0.24, 10.52], at: [0, 1.18, 0], color: '#3d9a5b' },
      { size: [2.5, 0.2, 0.14], at: [0, 0.42, 5.26], color: BUMPER },
      ...wheels(0.5, 1.02, [3.3, -2.9]),
    ],
    lamps: [
      { size: [1.5, 0.24, 0.05], at: [0, 2.72, 5.27], color: '#ffb43a' },
      ...lights(0.95, 0.72, 5.26, 0.3),
    ],
    paints: ['#f1efe6', '#f1efe6', '#f1efe6', '#e9ece4'],
  },
}

export const vehicleLength = (k: VehicleKind) => SPECS[k].length
export const vehiclePaints = (k: VehicleKind) => SPECS[k].paints

function build(parts: Part[], white = false) {
  if (!parts.length) return new THREE.BufferGeometry()
  const c = new THREE.Color()
  const pieces = parts.map((p) => {
    const g = p.wheel
      ? new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1], 12).rotateZ(Math.PI / 2)
      : new THREE.BoxGeometry(...p.size)
    g.translate(...p.at)
    const geo = g.index ? g.toNonIndexed() : g
    c.set(white ? '#ffffff' : (p.color ?? '#ffffff'))
    // Colors are in linear space, like three's own material colors.
    const cols = new Float32Array(geo.attributes.position.count * 3)
    for (let i = 0; i < cols.length; i += 3) {
      cols[i] = c.r
      cols[i + 1] = c.g
      cols[i + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    return geo
  })
  const merged = mergeGeometries(pieces)!
  pieces.forEach((p) => p.dispose())
  return merged
}

export function vehicleGeometries(kind: VehicleKind) {
  const s = SPECS[kind]
  return { body: build(s.body, true), trim: build(s.trim), lamps: build(s.lamps) }
}
