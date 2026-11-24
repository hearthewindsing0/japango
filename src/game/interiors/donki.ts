// ドン・キホーテ六本木店, the Don Quijote on Gaien-Higashi-dōri, ground
// floor. The store is famous for 圧縮陳列 (compressed display): narrow aisles
// between shelves packed to the ceiling, handwritten yellow POP price
// cards everywhere, snacks and souvenirs by the door, cosmetics and
// medicine further in, the checkout at the back and an escalator up.
// Laid out from descriptions of the chain's flagship stores (no interior
// photos of this one could be checked); see donki.json for sources.
//
// The room is fitted to the building's outline in the game (see
// landmarks/DonQuijote.tsx), so sizes here are relative: `a` runs along the
// front, `b` into the building, in meters from the door.
import type { InteriorLayout, InteriorPlace } from '../interior'
import { toMap } from './antnbee'
import data from './donki.json'

export const DONKI = data

/** Shelves are this far apart, center to center, and this wide. */
const PITCH = 2.3
const SHELF_W = 0.9
/** Open space inside the door, and the cross aisle at the back. */
const FRONT = 3.2
const BACK = 3.0
export const SHELF_H = 2.15

/** A box in the room: center (a, b), half sizes along a and b, height. */
export interface Box {
  a: number
  b: number
  ha: number
  hb: number
  h: number
  kind: 'shelf' | 'wagon' | 'counter' | 'escalator' | 'tank'
  /** For shelves: which section's goods. */
  section?: keyof typeof data.signs
}

export interface DonkiPlan {
  room: { a0: number; a1: number; b0: number; b1: number }
  boxes: Box[]
  /** Section signs hung over the aisles: [sign key, a, b]. */
  signs: [keyof typeof data.signs, number, number][]
  door: { a0: number; a1: number }
  /** The flat walk in from the pavement. */
  ramp: { b0: number; b1: number; w: number }
}

const ORDER: (keyof typeof data.signs)[] = ['sweets', 'souvenirs', 'cosmetics', 'medicine', 'daily', 'drinks', 'party']

/** Where everything goes, from the room the building has room for. */
export function donkiPlan(p: InteriorPlace): DonkiPlan {
  const r = p.room ?? { a0: -8, a1: 8, depth: 14 }
  const room = { a0: r.a0, a1: r.a1, b0: 0, b1: r.depth }
  const boxes: Box[] = []
  const signs: DonkiPlan['signs'] = []
  const door = { a0: -1.6, a1: 1.6 }
  // Checkout along the back wall on the left, escalator back right.
  const regLen = Math.min(5, (room.a1 - room.a0) * 0.35)
  boxes.push({ kind: 'counter', a: room.a0 + 0.8 + regLen / 2, b: room.b1 - 0.9, ha: regLen / 2, hb: 0.35, h: 1.0 })
  signs.push(['register', room.a0 + 0.8 + regLen / 2, room.b1 - 1.9])
  signs.push(['taxfree', room.a0 + 0.8 + regLen * 0.85, room.b1 - 1.9])
  boxes.push({ kind: 'escalator', a: room.a1 - 1.0, b: room.b1 - 2.6, ha: 0.6, hb: 2.2, h: 2.4 })
  signs.push(['escalator', room.a1 - 2.0, room.b1 - 2.6])
  // Shelf rows run into the store, between the open front and the back
  // aisle, leaving the door's line clear as the main aisle.
  const sb0 = FRONT
  const sb1 = Math.max(sb0 + 2, room.b1 - BACK)
  let k = 0
  const rows: number[] = []
  for (let a = door.a1 + 0.6 + SHELF_W / 2 + 0.5; a < room.a1 - 0.3 - SHELF_W / 2; a += PITCH) rows.push(a)
  for (let a = door.a0 - 0.6 - SHELF_W / 2 - 0.5; a > room.a0 + 0.3 + SHELF_W / 2; a -= PITCH) rows.push(a)
  rows.sort((x, y) => Math.abs(x) - Math.abs(y))
  for (const a of rows) {
    const section = ORDER[k % ORDER.length]
    k++
    boxes.push({ kind: 'shelf', a, b: (sb0 + sb1) / 2, ha: SHELF_W / 2, hb: (sb1 - sb0) / 2, h: SHELF_H, section })
    // Its sign hangs over the aisle beside it, near the front end.
    const side = a > 0 ? -1 : 1
    signs.push([section, a + side * (PITCH / 2), sb0 + 0.8])
  }
  // Shelves along the side walls too (they're full to the top as well).
  boxes.push({ kind: 'shelf', a: room.a0 + 0.3, b: (sb0 + sb1) / 2, ha: 0.3, hb: (sb1 - sb0) / 2, h: SHELF_H + 0.2, section: 'daily' })
  boxes.push({ kind: 'shelf', a: room.a1 - 0.3, b: (sb0 + sb1 - 3) / 2, ha: 0.3, hb: (sb1 - sb0 - 3) / 2, h: SHELF_H + 0.2, section: 'drinks' })
  // Wagons heaped with snacks just inside the door, either side of it.
  for (const a of [door.a0 - 1.5, door.a1 + 1.5])
    if (a > room.a0 + 1 && a < room.a1 - 1) boxes.push({ kind: 'wagon', a, b: 1.7, ha: 0.6, hb: 0.45, h: 0.9, section: 'sweets' })
  signs.push(['sweets', door.a1 + 1.5, 1.0])
  signs.push(['exit', 0, 1.0])
  signs.push(['pop', door.a0 - 1.5, 2.4])
  return { room, boxes, signs, door, ramp: { b0: -0.7, b1: 1.2, w: door.a1 - door.a0 } }
}

/** The walkable layout, in map meters. */
export function donkiLayout(p: InteriorPlace): InteriorLayout {
  const plan = donkiPlan(p)
  const len = Math.hypot(p.ux, p.uy) || 1
  const ux = p.ux / len
  const uy = p.uy / len
  const z = p.z
  const { room, ramp } = plan
  const rect = (a0: number, b0: number, a1: number, b1: number) => [toMap(p, a0, b0), toMap(p, a1, b0), toMap(p, a1, b1), toMap(p, a0, b1)].flat()
  const [ax, ay] = toMap(p, 0, ramp.b0)
  const [bx, by] = toMap(p, 0, ramp.b1)
  return {
    z,
    floors: [{ kind: 'concourse', z, p: rect(room.a0, room.b0 + 0.05, room.a1, room.b1) }],
    // Flat: the shop floor is level with the pavement.
    ramps: [{ kind: 'stairs', exit: 1, ax, ay, bx, by, w: ramp.w, za: z, zb: z }],
    blocks: plan.boxes.map((s) => {
      const [x, y] = toMap(p, s.a, s.b)
      return { x, y, ax: ux, ay: uy, hl: s.ha, hd: s.hb, z }
    }),
    signs: plan.signs.map(([key, a, b]) => {
      const [x, y] = toMap(p, a, b)
      const s = data.signs[key]
      return { x, y, z, r: 0, t: s.t, en: s.en, c: '#ffd400', k: 'info' as const, n: s.n }
    }),
  }
}
