// 国立新美術館 (The National Art Center, Tokyo), Kisho Kurokawa, 2007: the
// atrium behind the undulating glass wall, with its two giant inverted
// concrete cones (a French brasserie on top of the big one, a tea room on
// the small one), the café by the glass, the ticket counter and lockers.
// The atrium is free to walk into; the galleries behind it aren't in the
// game yet.
//
// The floor follows the curve of the glass wall, so it's worked out from
// the building's outline in the game (landmarks/Nact.tsx) and handed over
// as a polygon with named spots, all in map meters.
import type { InteriorLayout, InteriorPlace } from '../interior'
import data from './nact.json'

export const NACT = data

/** Cone sizes (game meters): radius at the floor and at the top, height. */
export const CONES = {
  big: { r0: 2.0, r1: 4.6, h: 9 },
  small: { r0: 1.5, r1: 3.6, h: 6.2 },
}

/** Fixed furniture: [spot, half length along the wall, half depth, height]. */
const FURNITURE: [string, number, number, number][] = [
  ['ticket', 2.4, 0.45, 1.05],
  ['info', 1.1, 0.5, 1.0],
  ['lockers', 2.5, 0.3, 1.9],
  ['escalator', 0.7, 2.6, 2.2],
]

/** Signs at spots: [sign key, spot, offset along the wall, offset into the room]. */
const SIGNS: [keyof typeof data.signs, string, number, number][] = [
  ['ticket', 'ticket', 0, -1.4],
  ['info', 'info', 0, -1.4],
  ['lockers', 'lockers', 0, -1.2],
  ['gallery', 'escalator', -2.2, 0],
  ['escalator', 'escalator', 0, -3.4],
  ['cafe', 'cafe', 0, 0],
  ['brasserie', 'coneBig', 0, -3.2],
  ['salon', 'coneSmall', 0, -2.6],
  ['photo', 'coneBig', 3.5, 1],
  ['exit', 'door', 0, 2.2],
]

/** Along-the-wall (u) and into-the-room (v) unit vectors. */
export const axes = (p: InteriorPlace) => {
  const len = Math.hypot(p.ux, p.uy) || 1
  const u: [number, number] = [p.ux / len, p.uy / len]
  return { u, v: [-u[1], u[0]] as [number, number] }
}

export function nactLayout(p: InteriorPlace): InteriorLayout {
  const z = p.z
  const { u, v } = axes(p)
  const spot = (k: string) => p.spots?.[k] ?? [p.x, p.y]
  const at = (k: string, du: number, dv: number): [number, number] => {
    const [x, y] = spot(k)
    return [x + u[0] * du + v[0] * dv, y + u[1] * du + v[1] * dv]
  }
  const blocks: InteriorLayout['blocks'] = []
  for (const [k, hl, hd] of FURNITURE) {
    if (!p.spots?.[k]) continue
    const [x, y] = spot(k)
    blocks.push({ x, y, ax: u[0], ay: u[1], hl, hd, z })
  }
  // The cones stand on narrow feet.
  for (const [k, c] of [['coneBig', CONES.big], ['coneSmall', CONES.small]] as const) {
    if (!p.spots?.[k]) continue
    const [x, y] = spot(k)
    blocks.push({ x, y, ax: u[0], ay: u[1], hl: c.r0 * 0.85, hd: c.r0 * 0.85, z })
  }
  // Café tables by the glass.
  if (p.spots?.cafe)
    for (const du of [-3, 0, 3]) {
      const [x, y] = at('cafe', du, 1.2)
      blocks.push({ x, y, ax: u[0], ay: u[1], hl: 0.4, hd: 0.4, z })
    }
  const [dax, day] = at('door', 0, -1.6)
  const [dbx, dby] = at('door', 0, 1.4)
  return {
    z,
    floors: [{ kind: 'concourse', z, p: p.poly ?? [] }],
    ramps: [{ kind: 'stairs', exit: 1, ax: dax, ay: day, bx: dbx, by: dby, w: 3, za: z, zb: z }],
    blocks,
    signs: SIGNS.filter(([, k]) => p.spots?.[k]).map(([key, k, du, dv]) => {
      const [x, y] = at(k, du, dv)
      const s = data.signs[key]
      return { x, y, z, r: 0, t: s.t, en: s.en, c: '#2f3542', k: 'info' as const, n: s.n }
    }),
  }
}
