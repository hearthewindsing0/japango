// Places you can walk inside (so far, one bar). The rooms themselves are
// laid out in the game (src/game/interiors/), in meters from the front
// door; the map build only works out where that door is: on the face of the
// place's building that looks onto the pavement, nearest the OSM point.
//
// Each entry finds its OSM node by name. If OSM ever loses it, `at` is the
// fallback position (from the same node, 2026-11).

const PLACES = [
  {
    id: 'antnbee',
    // アントンビー, the craft beer bar in the basement of 5-1-5 Roppongi,
    // a minute down Gaien-Higashi-dōri from the crossing (toward Tokyo
    // Tower, on the right). Not the newer 1F bar at 7-9-2 Roppongi.
    match: (t) => t.amenity === 'bar' && /ant\s*'?\s*n\s*bee|アントンビー/i.test(`${t.name ?? ''} ${t['name:en'] ?? ''}`),
    at: [35.6627119, 139.7330266],
  },
]

const r2 = (v) => Math.round(v * 100) / 100

function inPoly(p, x, y) {
  let hit = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1]
    const yj = p[j + 1]
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) hit = !hit
  }
  return hit
}

/** `buildings`: the map's footprints ({ p: flat ring }), `walkable(x, y)`:
 *  open ground, `ground(x, y)`: street height. */
export function buildInteriors({ elements, proj, buildings, walkable, ground }) {
  const out = []
  for (const place of PLACES) {
    const node = elements.find((e) => e.type === 'node' && e.tags && place.match(e.tags))
    const [px, py] = proj(node?.pos ?? place.at)
    const home = buildings.find((b) => inPoly(b.p, px, py))
    if (!home) {
      console.warn(`Interior ${place.id}: no building at ${px.toFixed(1)},${py.toFixed(1)}`)
      continue
    }
    // The building's centroid, to tell inside from outside.
    const p = home.p
    let cx = 0
    let cy = 0
    for (let i = 0; i < p.length; i += 2) {
      cx += p[i]
      cy += p[i + 1]
    }
    cx /= p.length / 2
    cy /= p.length / 2
    // The front: an edge at least 3 m long with pavement in front of it,
    // nearest the bar's point.
    let best = null
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i]
      const ay = p[i + 1]
      const bx = p[i + 2]
      const by = p[i + 3]
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 3) continue
      let ux = (bx - ax) / len
      let uy = (by - ay) / len
      // Into the building: (vx, vy) = (-uy, ux), turned to point inside.
      let vx = -uy
      let vy = ux
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      if ((cx - mx) * vx + (cy - my) * vy < 0) {
        ux = -ux
        uy = -uy
        vx = -vx
        vy = -vy
      }
      let open = 0
      for (const t of [0.25, 0.5, 0.75]) if (walkable(ax + (bx - ax) * t - vx * 1.5, ay + (by - ay) * t - vy * 1.5)) open++
      if (open < 2) continue
      const d = Math.abs((px - mx) * vx + (py - my) * vy) + Math.abs((px - mx) * ux + (py - my) * uy) * 0.3
      if (!best || d < best.d) best = { d, mx, my, ux, uy, len }
    }
    if (!best) {
      console.warn(`Interior ${place.id}: no front facing the street`)
      continue
    }
    out.push({
      id: place.id,
      x: r2(best.mx),
      y: r2(best.my),
      // Street height a meter out from the door.
      z: r2(ground(best.mx + best.uy, best.my - best.ux)),
      ux: r2(best.ux),
      uy: r2(best.uy),
      front: r2(best.len),
    })
  }
  return out
}
