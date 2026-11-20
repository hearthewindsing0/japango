// Underground stations you can walk into. Positions come from
// OpenStreetMap: subway entrances (exit numbers), platforms and the subway
// lines' tracks. OSM doesn't map what's in between, so the layout comes
// from STATION_INFO, written from the operators' published station guides
// and the stations' Wikipedia articles: which floor each platform is on,
// where the ticket gates are, which exits each gate serves, and how you get
// down to the platforms.
//
// Each station is laid out along its platforms' axis (a, along the tracks)
// and across it (b). Ticket-gate halls sit on B1 over the ends of the
// platforms: the outer part (toward the exits) is outside the gates, the
// inner part is inside, with stairs or escalators down. Exits come down to
// the outer part along corridors that keep clear of the inner part.
//
// Everything is in game units: map meters across, and heights on the same
// scale as the ground (real depths × TERRAIN_SCALE).

/** Facts OSM doesn't hold, by station ref. Depths in real meters below the
 *  street. Platforms are listed in order across the tracks (smallest b
 *  first); `extent` stretches OSM's platform to its real length, in meters
 *  along the tracks from OSM's center. `heading` (+1/−1 along a) is for
 *  stacked platforms, where "keep left" can't tell the direction. */
const STATION_INFO = {
  // Hibiya Line, Roppongi (H04). Two side platforms on B2 under
  // Roppongi-dōri, staggered: platform 1 reaches further toward Kamiyachō
  // (east), platform 2 toward Hiroo (west). Two separate gates on B1, one at
  // each end, not linked outside the gates.
  H04: {
    line: { ja: '日比谷線', en: 'Hibiya Line', operator: '東京メトロ', operatorEn: 'Tokyo Metro' },
    platforms: [
      { num: '1', ja: '北千住方面', en: 'for Kita-senju', next: '神谷町', depth: 11, extent: [-83, 45] },
      { num: '2', ja: '中目黒方面', en: 'for Naka-meguro', next: '広尾', depth: 11, extent: [-97, 30] },
    ],
    halls: [
      { end: -1, ja: '西麻布方面改札', en: 'Nishi-Azabu gate', exits: ['1a', '1b', '1c', '2'] },
      { end: 1, ja: '六本木交差点方面改札', en: 'Roppongi Crossing gate', exits: ['3', '4a', '4b'] },
    ],
  },
  // Ōedo Line, Roppongi (E23), under Gaien-Higashi-dōri. One platform per
  // level, stacked: 2番線 (for Daimon) on B5, 32.8 m down, and 1番線 (for
  // Shinjuku and Tochōmae) on B7, 42.3 m down, the deepest subway platform
  // in Japan. Gates on B1 at both ends; escalators go down to a B4 passage
  // that splits to the two levels.
  E23: {
    line: { ja: '大江戸線', en: 'Ōedo Line', operator: '都営地下鉄', operatorEn: 'Toei Subway' },
    via: { depth: 24, floor: 'B4' },
    platforms: [
      { num: '2', ja: '大門・両国方面', en: 'for Daimon and Ryōgoku', next: '麻布十番', depth: 32.8, heading: 1, extent: [-67, 67] },
      { num: '1', ja: '都庁前・光が丘方面', en: 'for Tochōmae and Hikarigaoka', next: '青山一丁目', depth: 42.3, heading: -1, extent: [-67, 67] },
    ],
    halls: [
      { end: -1, ja: '東京ミッドタウン方面改札', en: 'Tokyo Midtown gate', exits: ['7', '8'] },
      // Linked outside the gates to the Hibiya Line's crossing-side gate.
      { end: 1, ja: '六本木交差点・六本木ヒルズ方面改札', en: 'Roppongi Crossing and Roppongi Hills gate', exits: ['5', '6'], link: { station: 'H04', hall: 1 } },
    ],
  },
}

const CONCOURSE_DEPTH = 5 // real meters, B1
const CORRIDOR_W = 4.5
const STAIR_SLOPE = 0.55 // rise per meter of run (about 29°)
const PLATFORM_EDGE_TO_TRACK = 1.8
/** Gate hall: meters inside the gates, and outside them. */
const PAID = 12
const UNPAID = 14

const r1 = (v) => Math.round(v * 10) / 10
const r2 = (v) => Math.round(v * 100) / 100

/** Long axis of a polygon (unit vector), from its longest edge. */
function longAxis(pts) {
  let best = [1, 0]
  let bestL = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1][0] - pts[i][0]
    const dy = pts[i + 1][1] - pts[i][1]
    const l = Math.hypot(dx, dy)
    if (l > bestL) {
      bestL = l
      best = [dx / l, dy / l]
    }
  }
  // Point it east (or south, for one that runs north–south).
  if (Math.abs(best[0]) >= Math.abs(best[1]) ? best[0] < 0 : best[1] < 0) best = [-best[0], -best[1]]
  return best
}

/** A platform as a center, axis, half length and half width. */
function platformFrame(pts) {
  const ring = pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
  const [ux, uy] = longAxis(pts)
  let a0 = Infinity
  let a1 = -Infinity
  let b0 = Infinity
  let b1 = -Infinity
  for (const [x, y] of ring) {
    const a = (x - cx) * ux + (y - cy) * uy
    const b = -(x - cx) * uy + (y - cy) * ux
    a0 = Math.min(a0, a)
    a1 = Math.max(a1, a)
    b0 = Math.min(b0, b)
    b1 = Math.max(b1, b)
  }
  const mid = (a0 + a1) / 2
  const midB = (b0 + b1) / 2
  return {
    cx: cx + ux * mid - uy * midB,
    cy: cy + uy * mid + ux * midB,
    ux,
    uy,
    half: (a1 - a0) / 2,
    halfW: Math.max(1.5, (b1 - b0) / 2),
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(ax + dx * t - px, ay + dy * t - py)
}

/** The number on an entrance, from its tags. */
function exitRef(tags) {
  if (tags.ref) return tags.ref
  const tries = [
    [tags.name, /([0-9]+[a-z]?)\s*[番版]?\s*(出口|出入口)/i],
    [tags['name:en'], /exit\s*([0-9]+[a-z]?)/i],
    [tags['name:en'], /entrada\s*([0-9]+[a-z]?)/i],
    [tags['name:es'], /(?:entrada|salida)\s*([0-9]+[a-z]?)/i],
  ]
  for (const [s, re] of tries) {
    const m = s?.match(re)
    if (m) return m[1].toLowerCase()
  }
  return ''
}

/**
 * @param {object} o
 * @param {any[]} o.elements OSM elements (compact form from fetch-osm.mjs)
 * @param {(p: [number, number]) => [number, number]} o.proj lat/lon → map meters
 * @param {(x: number, y: number) => number} o.ground game ground height
 * @param {number} o.scale real meters → game height
 * @param {number} o.width
 * @param {number} o.height
 * @param {(x: number, y: number) => boolean} o.walkable street walkable here
 */
export function buildStations({ elements, proj, ground, scale, width, height, walkable }) {
  // OSM often puts an entrance on a building's wall; the stairs start on
  // the nearest open pavement, with room around them.
  const clear = (x, y) => {
    for (let a = 0; a < 8; a++) if (!walkable(x + Math.cos((a * Math.PI) / 4) * 1.8, y + Math.sin((a * Math.PI) / 4) * 1.8)) return false
    return walkable(x, y)
  }
  const onPavement = ([x, y]) => {
    if (clear(x, y)) return [x, y]
    for (let r = 0.5; r <= 25; r += 0.5)
      for (let a = 0; a < 32; a++) {
        const qx = x + Math.cos((a * Math.PI) / 16) * r
        const qy = y + Math.sin((a * Math.PI) / 16) * r
        if (clear(qx, qy)) return [qx, qy]
      }
    return [x, y]
  }
  const inFrame = ([x, y]) => x >= 0 && y >= 0 && x <= width && y <= height
  const nodes = elements.filter((e) => e.type === 'node' && e.tags.railway === 'station' && e.tags.station === 'subway' && STATION_INFO[e.tags.ref])
  const stationsOut = []

  // Stations that share a name (Roppongi's Hibiya and Ōedo stations) share
  // one B1 level, so their passages can meet.
  const byName = new Map()
  for (const n of nodes) {
    const [x, y] = proj(n.pos)
    if (!inFrame([x, y])) continue
    byName.set(n.tags.name, [...(byName.get(n.tags.name) ?? []), { n, x, y }])
  }

  const platformsAll = elements
    .filter((e) => e.type === 'way' && e.tags.railway === 'platform' && e.tags.level && parseFloat(e.tags.level) < 0 && e.geom?.length > 2)
    .map((e) => ({ e, pts: e.geom.map(proj) }))
  const linesAll = elements.filter((e) => e.type === 'way' && e.tags.railway === 'subway' && e.geom?.length > 1).map((e) => ({ e, pts: e.geom.map(proj) }))
  const entrances = elements.filter((e) => e.type === 'node' && e.tags.railway === 'subway_entrance')

  for (const [name, group] of byName) {
    const nameEn = group[0].n.tags['name:en'] ?? ''
    // This station's entrances: named for it (not for a neighbor like
    // 六本木一丁目), and not far off.
    const ours = (t) => {
      const s = t.name ?? ''
      return s === name || s.startsWith(name + '駅') || (nameEn && (s === nameEn || s.startsWith(nameEn + ' ')))
    }
    const exits = entrances
      .filter((e) => ours(e.tags))
      .map((e) => ({ e, raw: proj(e.pos) }))
      .filter(({ raw }) => inFrame(raw) && group.some((s) => Math.hypot(raw[0] - s.x, raw[1] - s.y) < 450))
      .map(({ e, raw }) => ({
        e,
        p: onPavement(raw),
        ref: exitRef(e.tags),
      }))
    const datum = Math.max(...group.map((s) => ground(s.x, s.y)), ...exits.map(({ p }) => ground(p[0], p[1])))
    const lowest = Math.min(...group.map((s) => ground(s.x, s.y)), ...exits.map(({ p }) => ground(p[0], p[1])))
    // B1 sits a floor below the lowest street it connects to.
    const zB1 = r2(lowest - CONCOURSE_DEPTH * scale)

    const built = group.map(({ n, x, y }) => {
      const info = STATION_INFO[n.tags.ref]
      const lineRef = n.tags.ref[0]
      const colour = linesAll.find((l) => l.e.tags.ref === lineRef)?.e.tags.colour ?? n.tags.colour ?? '#888888'
      const lines = linesAll.filter((l) => l.e.tags.ref === lineRef || l.e.tags.name?.includes(info.line.ja))
      const otherLines = linesAll.filter((l) => !lines.includes(l))
      const nearest = (qx, qy, ls) => {
        let best = Infinity
        for (const l of ls) for (let k = 0; k + 1 < l.pts.length; k++) best = Math.min(best, distToSeg(qx, qy, ...l.pts[k], ...l.pts[k + 1]))
        return best
      }
      // Its platforms: underground ones within 80 m whose nearest rails are
      // this line's.
      const frames = platformsAll
        .filter(({ pts }) => pts.some(([px, py]) => Math.hypot(px - x, py - y) < 80))
        .map(({ pts }) => platformFrame(pts))
        .filter((p) => !lines.length || nearest(p.cx, p.cy, lines) <= nearest(p.cx, p.cy, otherLines))
        .slice(0, info.platforms.length)
      if (!frames.length) frames.push({ cx: x, cy: y, ux: 1, uy: 0, half: 60, halfW: 2.5 })

      // The station's own frame: a along the tracks, b across.
      const [ux, uy] = [frames[0].ux, frames[0].uy]
      const px = -uy
      const py = ux
      const c = [frames.reduce((s, f) => s + f.cx, 0) / frames.length, frames.reduce((s, f) => s + f.cy, 0) / frames.length]
      const P = (a, b) => [c[0] + ux * a + px * b, c[1] + uy * a + py * b]
      const AB = (qx, qy) => [(qx - c[0]) * ux + (qy - c[1]) * uy, (qx - c[0]) * px + (qy - c[1]) * py]
      const rectAB = (a0, a1, b0, b1) =>
        [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)].flatMap(([qx, qy]) => [r1(qx), r1(qy)])
      const ramp = (kind, a0, b0, a1, b1, za, zb, w = 2.4) => {
        const [ax, ay] = P(a0, b0)
        const [bx, by] = P(a1, b1)
        return { kind, ax: r1(ax), ay: r1(ay), bx: r1(bx), by: r1(by), w, za: r2(za), zb: r2(zb) }
      }
      const angle = (da, db) => r2(Math.atan2(uy * da + py * db, ux * da + px * db))

      const surface = ground(x, y)
      const floors = []
      const ramps = []
      const gates = []
      const tracks = []
      const signs = []
      const platforms = []

      // Platforms in order across the tracks, stretched to their real length.
      const plats = frames
        .map((f) => {
          const [ac, bc] = AB(f.cx, f.cy)
          return { f, ac, bc }
        })
        .sort((p, q) => p.bc - q.bc)
        .map(({ f, ac, bc }, i) => {
          const spec = info.platforms[i] ?? info.platforms[0]
          const [e0, e1] = spec.extent ?? [-f.half, f.half]
          return { spec, a0: ac + e0, a1: ac + e1, b: bc, halfW: f.halfW, z: r2(surface - spec.depth * scale) }
        })

      plats.forEach((p, i) => {
        const { spec, z } = p
        const am = (p.a0 + p.a1) / 2
        const half = (p.a1 - p.a0) / 2
        floors.push({ kind: 'platform', z, p: rectAB(p.a0, p.a1, p.b - p.halfW, p.b + p.halfW) })
        // Which long side faces the track: the side nearer this line's rails.
        let side = 1
        if (lines.length) {
          const probe = (s) => nearest(...P(am, p.b + (p.halfW + 2) * s), lines)
          side = probe(1) <= probe(-1) ? 1 : -1
        }
        p.side = side
        const tb = p.b + (p.halfW + PLATFORM_EDGE_TO_TRACK) * side
        // Trains keep left: the platform is on the left of the way they go,
        // which in this frame is a heading of −side. Stacked platforms say.
        const heading = spec.heading ?? -side
        const d = [ux * heading, uy * heading]
        const [tax, tay] = P(p.a0 - 4, tb)
        const [tbx, tby] = P(p.a1 + 4, tb)
        tracks.push({ ax: r1(tax), ay: r1(tay), bx: r1(tbx), by: r1(tby), z, dx: r2(d[0]), dy: r2(d[1]), half: r1(half) })
        platforms.push({ i: floors.length - 1, num: spec.num ?? '', ja: spec.ja, en: spec.en, next: spec.next, side })
        // Station name boards along the back wall, like the real ones.
        for (const t of [-0.55, 0.05, 0.6]) {
          const [sx, sy] = P(am + half * t, p.b - (p.halfW - 0.4) * side)
          signs.push({ x: r1(sx), y: r1(sy), z, r: angle(0, side), t: `${name} ${n.tags.ref}`, en: `${nameEn} · next: ${spec.next}`, c: colour, k: 'name' })
        }
      })

      // Ticket-gate halls over the ends of the platforms, as wide as the
      // platforms and the tracks between them.
      const hb0 = Math.min(...plats.map((p) => p.b - p.halfW))
      const hb1 = Math.max(...plats.map((p) => p.b + p.halfW))
      const halls = info.halls.map((h) => {
        // Where every platform still runs, so the way down lands on them.
        const aEnd = h.end < 0 ? Math.max(...plats.map((p) => p.a0)) : Math.min(...plats.map((p) => p.a1))
        const inward = -h.end
        const gate = aEnd + inward * 2
        const paid = [gate, gate + inward * PAID].sort((p, q) => p - q)
        const unpaid = [gate, gate - inward * UNPAID].sort((p, q) => p - q)
        floors.push({ kind: 'concourse', z: zB1, p: rectAB(Math.min(...paid, ...unpaid), Math.max(...paid, ...unpaid), hb0, hb1) })
        // The gate line: lanes in the middle, fare fence to the walls.
        const w = hb1 - hb0
        const lanes = Math.min(w - 2, 7)
        const mid = (hb0 + hb1) / 2
        const [gx, gy] = P(gate, mid)
        gates.push({ x: r1(gx), y: r1(gy), ax: r2(px), ay: r2(py), w: lanes, z: zB1 })
        for (const [f0, f1] of [
          [hb0, mid - lanes / 2],
          [mid + lanes / 2, hb1],
        ]) {
          if (f1 - f0 < 0.3) continue
          const [fx, fy] = P(gate, (f0 + f1) / 2)
          gates.push({ x: r1(fx), y: r1(fy), ax: r2(px), ay: r2(py), w: r1(f1 - f0), z: zB1, solid: 1 })
        }
        const [sx, sy] = P(gate - inward * 3, mid)
        signs.push({ x: r1(sx), y: r1(sy), z: zB1, r: angle(-inward, 0), t: h.ja, en: h.en, c: colour, k: 'gate' })

        // The way down, inside the gates.
        const down = (d0, b, za, zb) => {
          const run = Math.max(2, (za - zb) / STAIR_SLOPE)
          return { r: ramp(za - zb > 4 ? 'escalator' : 'stairs', gate + inward * d0, b, gate + inward * (d0 + run), b, za, zb), end: d0 + run }
        }
        const platformSign = (p, d0, z) => {
          const [qx, qy] = P(gate + inward * (d0 - 1.5), p.b)
          signs.push({ x: r1(qx), y: r1(qy), z, r: angle(-inward, 0), t: `${p.spec.num ? p.spec.num + '番線 ' : ''}${p.spec.ja}`, en: `${p.spec.num ? 'Track ' + p.spec.num + ', ' : ''}${p.spec.en}`, c: colour, k: 'platform' })
        }
        if (info.via) {
          // Escalator to the passage below, then one down to each level.
          const zVia = r2(surface - info.via.depth * scale)
          const first = down(2, mid, zB1, zVia)
          ramps.push(first.r)
          const [qx, qy] = P(gate + inward * 0.6, mid)
          signs.push({ x: r1(qx), y: r1(qy), z: zB1, r: angle(-inward, 0), t: `${info.line.ja} のりば`, en: `${info.line.en} platforms`, c: colour, k: 'platform', n: 'のりば (乗り場) means "where you board". Follow it to the platforms.' })
          const s0 = first.end - 1
          const s1 = first.end + 8
          const [v0, v1] = [gate + inward * s0, gate + inward * s1].sort((p, q) => p - q)
          floors.push({ kind: 'corridor', z: zVia, p: rectAB(v0, v1, hb0, hb1) })
          for (const p of plats) {
            const st = down(first.end + 3, p.b, zVia, p.z)
            ramps.push(st.r)
            platformSign(p, first.end + 3, zVia)
          }
        } else
          for (const p of plats) {
            ramps.push(down(2, p.b, zB1, p.z).r)
            platformSign(p, 2, zB1)
          }
        return { h, inward, gate, unpaid, mid, hb0, hb1 }
      })
      return { n, info, colour, floors, ramps, gates, tracks, signs, platforms, halls, AB, P, rectAB, ramp, angle, surface, exits: [] }
    })

    // Corridors between a point and a hall's outer part (or an earlier
    // corridor), along the station's axes, keeping clear of the paid part.
    const hw = CORRIDOR_W / 2
    const route = (s, hall, a, b, extra) => {
      const legs = []
      // Each leg runs from (a0, b0) to (a1, b1). The first starts at the
      // stair bottom and only needs to reach back under the stairs' width.
      const leg = (a0, b0, a1, b1) => {
        const back = legs.length ? hw : 1.3
        const sa = Math.sign(a1 - a0)
        const sb = Math.sign(b1 - b0)
        const ea = [a0 - (sa || 0) * back - (sa ? 0 : hw), a1 + (sa || 0) * hw + (sa ? 0 : hw)]
        const eb = [b0 - (sb || 0) * back - (sb ? 0 : hw), b1 + (sb || 0) * hw + (sb ? 0 : hw)]
        legs.push([Math.min(...ea), Math.max(...ea), Math.min(...eb), Math.max(...eb)])
      }
      // Target: the hall's outer part, or the nearest corridor already there.
      const targets = [{ t: [hall.unpaid[0], hall.unpaid[1], hall.hb0, hall.hb1], isHall: true }, ...extra.map((t) => ({ t, isHall: false }))]
      const dist = ([a0, a1, b0, b1]) => Math.hypot(Math.max(a0 - a, 0, a - a1), Math.max(b0 - b, 0, b - b1))
      const { t, isHall } = targets.sort((p, q) => dist(p.t) - dist(q.t))[0]
      const [ta0, ta1, tb0, tb1] = t
      const inA = (v) => v >= ta0 + hw && v <= ta1 - hw
      const inB = (v) => v >= tb0 + hw && v <= tb1 - hw
      const clampA = (v) => (ta1 - ta0 < 2 * hw ? (ta0 + ta1) / 2 : Math.max(ta0 + hw, Math.min(ta1 - hw, v)))
      const intoB = (v) => (v < tb0 ? tb0 + 1 : v > tb1 ? tb1 - 1 : v)
      if (dist(t) < 0.01) return legs
      if (isHall && !inA(a) && b > hall.hb0 - hw - 0.3 && b < hall.hb1 + hw + 0.3) {
        // Right beside the gates: step out of the way first.
        const out = b - hall.hb0 < hall.hb1 - b ? hall.hb0 - hw - 0.5 : hall.hb1 + hw + 0.5
        leg(a, b, a, out)
        b = out
      }
      if (inA(a)) leg(a, b, a, intoB(b))
      else if (!isHall && inB(b)) leg(a, b, a < ta0 ? ta0 + 1 : ta1 - 1, b)
      else {
        const at = clampA(a)
        leg(a, b, at, b)
        leg(at, b, at, intoB(b))
      }
      return legs
    }

    const allHalls = built.flatMap((s) => s.halls.map((hall) => ({ s, hall })))
    const corridors = new Map(allHalls.map(({ hall }) => [hall, []]))
    const addCorridors = (s, hall, legs) => {
      for (const l of legs) {
        s.floors.push({ kind: 'corridor', z: zB1, p: s.rectAB(...l) })
        corridors.get(hall).push(l)
      }
    }

    // Exits: each to the hall that serves its number (else the nearest),
    // farthest first, so nearer ones can join their corridor.
    const placed = exits.map((x) => {
      let home = allHalls.find(({ hall }) => x.ref && hall.h.exits.includes(x.ref))
      if (!home) {
        let best = Infinity
        for (const o of allHalls) {
          const [qx, qy] = o.s.P((o.hall.unpaid[0] + o.hall.unpaid[1]) / 2, o.hall.mid)
          const d = Math.hypot(qx - x.p[0], qy - x.p[1])
          if (d < best) {
            best = d
            home = o
          }
        }
      }
      const [a, b] = home.s.AB(...x.p)
      const ua = Math.max(home.hall.unpaid[0], Math.min(home.hall.unpaid[1], a))
      return { ...x, home, d: Math.hypot(ua - a, Math.max(home.hall.hb0 - b, 0, b - home.hall.hb1)) }
    })
    placed.sort((p, q) => q.d - p.d)
    for (const { e, p, ref, home } of placed) {
      const { s, hall } = home
      const [ex, ey] = p
      const [a, b] = s.AB(ex, ey)
      const top = ground(ex, ey)
      const run = Math.max(1, top - zB1) / STAIR_SLOPE
      // Stairs head toward the hall along whichever axis is farther off.
      const ta = Math.max(hall.unpaid[0] + hw, Math.min(hall.unpaid[1] - hw, a))
      const tb = Math.max(hall.hb0, Math.min(hall.hb1, b))
      const alongA = Math.abs(ta - a) >= Math.abs(tb - b)
      const sa = alongA ? Math.sign(ta - a) || 1 : 0
      const sb = alongA ? 0 : Math.sign(tb - b) || 1
      const ba = a + sa * run
      const bb = b + sb * run
      s.ramps.push({ ...s.ramp('stairs', a, b, ba, bb, top, zB1, 2.6), exit: 1 })
      addCorridors(s, hall, route(s, hall, ba, bb, corridors.get(hall)))
      const [bx, by] = s.P(ba, bb)
      const ux = r2((bx - ex) / run)
      const uy = r2((by - ey) / run)
      const [sx, sy] = s.P(ba + sa * 1.5, bb + sb * 1.5)
      s.signs.push({ x: r1(sx), y: r1(sy), z: zB1, r: s.angle(sa, sb), t: `出口 ${ref}`.trim(), en: `Exit ${ref}`.trim(), c: '#f2c230', k: 'exit' })
      s.exits.push({ ref, name: e.tags.name ?? '', x: r1(ex), y: r1(ey), ux, uy, ramp: s.ramps.length - 1 })
    }

    // Passages between gate halls outside the gates (for changing lines).
    for (const { s, hall } of allHalls) {
      const link = hall.h.link
      const other = link && built.find((o) => o.n.tags.ref === link.station)
      if (!other) continue
      const oh = other.halls[link.hall]
      const [ox, oy] = other.P((oh.unpaid[0] + oh.unpaid[1]) / 2, oh.mid)
      const [a, b] = s.AB(ox, oy)
      addCorridors(s, hall, route(s, hall, a, b, []))
      const note = '乗り換え (のりかえ) means changing trains. Follow it to the other line.'
      const [qx, qy] = s.P((hall.unpaid[0] + hall.unpaid[1]) / 2 - hall.inward * 2, hall.hb1 - 1)
      s.signs.push({ x: r1(qx), y: r1(qy), z: zB1, r: s.angle(0, 1), t: `のりかえ ${other.info.line.ja}`, en: `Transfer: ${other.info.line.en}`, c: other.colour, k: 'gate', n: note })
      s.signs.push({ x: r1(ox), y: r1(oy), z: zB1, r: s.angle(0, -1), t: `のりかえ ${s.info.line.ja}`, en: `Transfer: ${s.info.line.en}`, c: s.colour, k: 'gate', n: note })
    }

    for (const s of built) {
      stationsOut.push({
        id: s.n.tags.ref,
        name: s.n.tags.name,
        nameEn: s.n.tags['name:en'] ?? '',
        wikidata: s.n.tags.wikidata,
        line: { ...s.info.line, ref: s.n.tags.ref, colour: s.colour },
        x: r1(proj(s.n.pos)[0]),
        y: r1(proj(s.n.pos)[1]),
        datum: r2(datum),
        floors: s.floors,
        ramps: s.ramps,
        gates: s.gates,
        tracks: s.tracks,
        platforms: s.platforms,
        signs: s.signs,
        exits: s.exits,
      })
    }
  }
  return stationsOut
}
