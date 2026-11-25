// スターバックス コーヒー 東京ミッドタウン店, on the ground floor of Midtown's
// Plaza. Laid out the way the chain's bigger cafés are: the ordering counter
// with the pastry case across the back, the espresso bar behind it, menu
// boards above, the pick-up end of the counter by the condiment bar, small
// tables and a long shared table out front, and armchairs by the glass.
// Time Out describes this one as roomy, with terrace seats on the plaza.
// No interior photos could be checked, so it's the chain's usual layout
// (see starbucks.json for sources).
//
// The room is fitted to the building outline in the game (see
// landmarks/Midtown.tsx): `a` runs along the front, `b` into the building,
// in meters from the door.
import type { InteriorLayout, InteriorPlace } from '../interior'
import { toMap } from './antnbee'
import data from './starbucks.json'

export const STARBUCKS = data

export type SignKey = keyof typeof data.signs

/** A box in the room: center (a, b), half sizes along a and b, height. */
export interface Box {
  a: number
  b: number
  ha: number
  hb: number
  h: number
  kind: 'counter' | 'case' | 'backbar' | 'condiment' | 'table' | 'long' | 'armchair' | 'low'
}

export interface StarbucksPlan {
  room: { a0: number; a1: number; b0: number; b1: number }
  boxes: Box[]
  /** Signs: [key, a, b]. */
  signs: [SignKey, number, number][]
  /** Menu boards above the back bar: center a, width. */
  boards: { a: number; w: number }
  door: { a0: number; a1: number }
  ramp: { b0: number; b1: number; w: number }
}

/** Tables for two are this far apart. */
const PITCH_A = 2.2
const PITCH_B = 2.0

export function starbucksPlan(p: InteriorPlace): StarbucksPlan {
  const r = p.room ?? { a0: -7, a1: 7, depth: 10 }
  const room = { a0: r.a0, a1: r.a1, b0: 0, b1: r.depth }
  const W = room.a1 - room.a0
  const D = room.b1
  const boxes: Box[] = []
  const signs: StarbucksPlan['signs'] = []
  const door = { a0: -1.0, a1: 1.0 }
  // The counter runs along the back, on whichever side of the door has more
  // room; the seats take the other side.
  const right = room.a1 > -room.a0
  const side = right ? 1 : -1
  const far = right ? room.a1 : room.a0
  const len = Math.min(6.5, W * 0.5)
  const cb = Math.max(3.2, D - 2.4)
  // Counter: from near the side wall inward. The pastry case is the end
  // nearest the middle, then the register, then pick-up at the wall end.
  const c0 = far - side * 0.9
  const c1 = far - side * (0.9 + len)
  const cMid = (c0 + c1) / 2
  boxes.push({
    kind: 'counter',
    a: (c0 + cMid) / 2,
    b: cb,
    ha: Math.abs(c0 - cMid) / 2,
    hb: 0.35,
    h: 1.0,
  })
  boxes.push({
    kind: 'case',
    a: (cMid + c1) / 2,
    b: cb,
    ha: Math.abs(c1 - cMid) / 2,
    hb: 0.4,
    h: 1.15,
  })
  // The espresso bar along the back wall behind it.
  if (D - cb > 1.6)
    boxes.push({
      kind: 'backbar',
      a: (c0 + c1) / 2,
      b: D - 0.4,
      ha: len / 2,
      hb: 0.3,
      h: 0.95,
    })
  // Condiment bar against the side wall, in front of the pick-up end.
  boxes.push({
    kind: 'condiment',
    a: far - side * 0.35,
    b: Math.max(1.6, cb - 1.9),
    ha: 0.3,
    hb: 0.7,
    h: 0.95,
  })
  signs.push(['food', (cMid + c1) / 2, cb - 0.9])
  signs.push(['order', (c0 + cMid) / 2 - side * 0.6, cb - 0.9])
  signs.push(['pickup', c0 - side * 0.2, cb - 0.9])
  signs.push(['condiment', far - side * 0.5, Math.max(1.6, cb - 1.9) - 1.0])
  // Seating: the other side of the room, tables for two in rows, a long
  // shared table between them and the counter, armchairs by the glass.
  const s0 = right ? room.a0 + 0.9 : room.a1 - 0.9
  const sEnd = c1 - side * 1.6
  const seatA: number[] = []
  for (let a = s0; right ? a < sEnd : a > sEnd; a += side * PITCH_A) seatA.push(a)
  for (const a of seatA)
    for (let b = 2.3; b < D - 1.0; b += PITCH_B) {
      if (Math.abs(a) < 1.6 && b < 3.4) continue
      boxes.push({ kind: 'table', a, b, ha: 0.35, hb: 0.35, h: 0.72 })
    }
  // The long shared table on the counter side, by the glass, leaving a lane
  // in front of the counter for the queue.
  const lt0 = Math.max(door.a1 + 1.2, Math.min(c0, c1) + 0.2)
  const lt1 = Math.min(Math.max(c0, c1) - 0.2, room.a1 - 1.6)
  const lt = right ? [lt0, lt1] : [Math.max(room.a0 + 1.6, Math.min(c0, c1) + 0.2), Math.min(door.a0 - 1.2, Math.max(c0, c1) - 0.2)]
  if (lt[1] - lt[0] > 2 && cb > 5)
    boxes.push({
      kind: 'long',
      a: (lt[0] + lt[1]) / 2,
      b: 2.6,
      ha: (lt[1] - lt[0]) / 2,
      hb: 0.45,
      h: 0.74,
    })
  // Armchairs by the window, either side of the door.
  for (const a of [door.a0 - 1.6, door.a0 - 3.2, door.a1 + 1.6, door.a1 + 3.2]) if (a > room.a0 + 0.6 && a < room.a1 - 0.6) boxes.push({ kind: 'armchair', a, b: 0.9, ha: 0.42, hb: 0.42, h: 0.8 })
  signs.push(['seats', s0 + side * 1.0, 1.6])
  signs.push(['exit', 0, 0.9])
  signs.push(['terrace', 0, -2.6])
  return {
    room,
    boxes,
    signs,
    boards: { a: (c0 + c1) / 2, w: len },
    door,
    ramp: { b0: -0.7, b1: 1.2, w: door.a1 - door.a0 },
  }
}

/** The walkable layout, in map meters. */
export function starbucksLayout(p: InteriorPlace): InteriorLayout {
  const plan = starbucksPlan(p)
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
    floors: [
      {
        kind: 'concourse',
        z,
        p: rect(room.a0, room.b0 + 0.05, room.a1, room.b1),
      },
    ],
    ramps: [{ kind: 'stairs', exit: 1, ax, ay, bx, by, w: ramp.w, za: z, zb: z }],
    blocks: plan.boxes.map((s) => {
      const [x, y] = toMap(p, s.a, s.b)
      // Chairs round the small tables take room too.
      const pad = s.kind === 'table' ? 0.25 : 0
      return { x, y, ax: ux, ay: uy, hl: s.ha + pad, hd: s.hb + pad, z }
    }),
    signs: plan.signs
      .filter(([key]) => key !== 'terrace')
      .map(([key, a, b]) => {
        const [x, y] = toMap(p, a, b)
        const s = data.signs[key]
        return {
          x,
          y,
          z,
          r: 0,
          t: s.t,
          en: s.en,
          c: '#00704a',
          k: 'info' as const,
          n: s.n,
        }
      }),
  }
}
