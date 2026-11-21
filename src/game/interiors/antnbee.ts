// アントンビー (Ant 'n Bee), the craft beer bar in the basement of
// 5-1-5 Roppongi. Laid out from public descriptions and photos: a steep,
// narrow staircase straight down from Gaien-Higashi-dōri, an L-shaped bar
// with about ten counter seats and twenty Japanese craft taps on the wall
// behind it, standing room in the middle, and tables at the back for about
// twenty. Cream brick and dark wood, warm lights, beer posters.
//
// Everything is in meters from the front door: `a` along the street
// (the building face), `b` into the building. The map build finds the
// door (scripts/interiors.mjs); see interior.ts for how it's walked.
import type { InteriorPlace, InteriorLayout } from '../interior'
import data from './antnbee.json'

export const ANTNBEE = data

/** Floor of the bar, below the street (game heights, ~5 m real). */
export const DEPTH = 2.6
/** The stairs: centered at STAIR_A, from the pavement down to the room. */
export const STAIR_A = 1.95
export const STAIR_W = 1.1
export const STAIR_TOP = -0.9
export const STAIR_BOTTOM = 3.3
/** The room. */
export const ROOM = { a0: -4.4, a1: 4.0, b0: 3.2, b1: 14.2 }
/** The bar counter: the long leg's front edge, and where the L turns. */
export const COUNTER = { front: -1.6, depth: 0.65, b0: 4.6, b1: 10.6 }

/** A box in the room: center (a, b), half sizes along a and b, height. */
export interface Box {
  a: number
  b: number
  ha: number
  hb: number
  h: number
}

/** Things you bump into. */
export const SOLID: Box[] = [
  // Counter, long leg and the short leg at the back.
  { a: COUNTER.front - COUNTER.depth / 2, b: (COUNTER.b0 + COUNTER.b1) / 2, ha: COUNTER.depth / 2, hb: (COUNTER.b1 - COUNTER.b0) / 2, h: 1.05 },
  { a: (ROOM.a0 + COUNTER.front) / 2, b: COUNTER.b1 + COUNTER.depth / 2, ha: (COUNTER.front - ROOM.a0) / 2, hb: COUNTER.depth / 2, h: 1.05 },
  // Register and fridge at the front end of the bar.
  { a: (ROOM.a0 + COUNTER.front - COUNTER.depth) / 2, b: (ROOM.b0 + COUNTER.b0) / 2, ha: (COUNTER.front - COUNTER.depth - ROOM.a0) / 2, hb: (COUNTER.b0 - ROOM.b0) / 2, h: 1.6 },
  // Drink ledge along the right wall.
  { a: ROOM.a1 - 0.18, b: 7.4, ha: 0.18, hb: 2.4, h: 1.1 },
  // Standing tables.
  { a: 1.0, b: 6.3, ha: 0.32, hb: 0.32, h: 1.05 },
  { a: 1.0, b: 9.0, ha: 0.32, hb: 0.32, h: 1.05 },
  // Back room: bench along the back wall, tables in front of it.
  { a: (ROOM.a0 + ROOM.a1) / 2, b: ROOM.b1 - 0.3, ha: (ROOM.a1 - ROOM.a0) / 2, hb: 0.3, h: 0.45 },
  { a: -3.0, b: 12.8, ha: 0.55, hb: 0.4, h: 0.72 },
  { a: -0.4, b: 12.8, ha: 0.55, hb: 0.4, h: 0.72 },
  { a: 2.3, b: 12.8, ha: 0.55, hb: 0.4, h: 0.72 },
  // Low partition between the bar and the tables, with a gap to walk through.
  { a: 2.6, b: 11.4, ha: 1.4, hb: 0.08, h: 1.3 },
]

/** Stools along the counter, and chairs at the tables: [a, b]. */
export const STOOLS: [number, number][] = Array.from({ length: 10 }, (_, i) => [COUNTER.front + 0.45, COUNTER.b0 + 0.35 + i * 0.59])
export const CHAIRS: [number, number][] = [-3.0, -0.4, 2.3].flatMap((a) => [
  [a - 0.3, 12.05] as [number, number],
  [a + 0.3, 12.05] as [number, number],
])

/** Where the learning signs are: [key into the data's signs, a, b]. */
const SIGN_SPOTS: [keyof typeof data.signs, number, number][] = [
  ['taps', -1.0, 6.2],
  ['counter', -0.6, 9.4],
  ['tables', 0.4, 12.0],
  ['nosmoking', 3.0, 4.2],
  ['toilet', 3.4, 10.6],
  ['exit', STAIR_A, 4.0],
  ['stairs', STAIR_A, 1.2],
]

/** Where the bartender stands, and the spot you order from. */
export const BARTENDER: [number, number] = [-3.1, 7.4]
export const ORDER_SPOT = { a: COUNTER.front + 0.6, b0: COUNTER.b0, b1: COUNTER.b1 + 0.8 }

/** Turn local (a, b) into map meters. */
export function toMap(p: InteriorPlace, a: number, b: number): [number, number] {
  const len = Math.hypot(p.ux, p.uy) || 1
  const ux = p.ux / len
  const uy = p.uy / len
  return [p.x + a * ux - b * uy, p.y + a * uy + b * ux]
}

/** Map meters to local (a, b). */
export function toLocal(p: InteriorPlace, x: number, y: number): [number, number] {
  const len = Math.hypot(p.ux, p.uy) || 1
  const ux = p.ux / len
  const uy = p.uy / len
  const dx = x - p.x
  const dy = y - p.y
  return [dx * ux + dy * uy, -dx * uy + dy * ux]
}

/** The walkable layout, in map meters. */
export function antnbeeLayout(p: InteriorPlace): InteriorLayout {
  const len = Math.hypot(p.ux, p.uy) || 1
  const ux = p.ux / len
  const uy = p.uy / len
  const z = p.z - DEPTH
  const rect = (a0: number, b0: number, a1: number, b1: number) => [toMap(p, a0, b0), toMap(p, a1, b0), toMap(p, a1, b1), toMap(p, a0, b1)].flat()
  const [tx, ty] = toMap(p, STAIR_A, STAIR_TOP)
  const [bx, by] = toMap(p, STAIR_A, STAIR_BOTTOM)
  return {
    z,
    floors: [{ kind: 'concourse', z, p: rect(ROOM.a0, ROOM.b0, ROOM.a1, ROOM.b1) }],
    ramps: [{ kind: 'stairs', exit: 1, ax: tx, ay: ty, bx, by, w: STAIR_W, za: p.z, zb: z }],
    blocks: SOLID.map((s) => {
      const [x, y] = toMap(p, s.a, s.b)
      return { x, y, ax: ux, ay: uy, hl: s.ha, hd: s.hb, z }
    }),
    signs: SIGN_SPOTS.map(([key, a, b]) => {
      const [x, y] = toMap(p, a, b)
      const s = data.signs[key]
      const onStairs = key === 'stairs'
      return { x, y, z: onStairs ? p.z - DEPTH / 2 : z, r: 0, t: s.t, en: s.en, c: '#f2b705', k: 'info' as const, n: s.n }
    }),
  }
}
