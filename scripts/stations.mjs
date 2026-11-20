// Underground stations you can walk into, built from OpenStreetMap:
// subway entrances (exit numbers and positions), platforms and the subway
// lines' tracks. OSM rarely maps the corridors in between, so those are
// laid out here: each exit gets stairs down to a corridor that runs to its
// station's concourse, with ticket gates where the corridor meets it, and
// stairs or escalators down to each platform.
//
// Everything is in game units: map meters across, and heights on the same
// scale as the ground (real depths × TERRAIN_SCALE).

/** Facts OSM doesn't hold, by station ref. Depths in real meters below the
 *  street; dirs: per platform (west/north first), the way trains leave and
 *  the line's terminus, so signs read "〜方面". */
const STATION_INFO = {
  // Hibiya Line, Roppongi (H04): side platforms one floor down.
  H04: {
    line: { ja: '日比谷線', en: 'Hibiya Line', operator: '東京メトロ', operatorEn: 'Tokyo Metro' },
    platformDepth: [11, 11],
    dirs: [
      { num: '1', ja: '北千住方面', en: 'for Kita-senju', next: '神谷町' },
      { num: '2', ja: '中目黒方面', en: 'for Naka-meguro', next: '広尾' },
    ],
  },
  // Ōedo Line, Roppongi (E23): among the deepest in Tokyo, with the two
  // platforms stacked one above the other (about 32 m and 42 m down).
  E23: {
    line: { ja: '大江戸線', en: 'Ōedo Line', operator: '都営地下鉄', operatorEn: 'Toei Subway' },
    platformDepth: [32, 42],
    stacked: true,
    dirs: [
      { ja: '都庁前・光が丘方面', en: 'for Tochōmae and Hikarigaoka', next: '青山一丁目' },
      { ja: '大門・両国方面', en: 'for Daimon and Ryōgoku', next: '麻布十番' },
    ],
  },
}

const CONCOURSE_DEPTH = 5 // real meters, B1
const CORRIDOR_W = 4.5
const STAIR_SLOPE = 0.55 // rise per meter of run (about 29°)
const PLATFORM_EDGE_TO_TRACK = 1.8

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

/** Rectangle (as a flat polygon) centered at c, along axis u. */
function rect(cx, cy, ux, uy, halfL, halfW) {
  const px = -uy
  const py = ux
  return [
    [cx - ux * halfL - px * halfW, cy - uy * halfL - py * halfW],
    [cx + ux * halfL - px * halfW, cy + uy * halfL - py * halfW],
    [cx + ux * halfL + px * halfW, cy + uy * halfL + py * halfW],
    [cx - ux * halfL + px * halfW, cy - uy * halfL + py * halfW],
  ].flatMap(([x, y]) => [r1(x), r1(y)])
}

const axisRect = (x0, y0, x1, y1) => [r1(Math.min(x0, x1)), r1(Math.min(y0, y1)), r1(Math.max(x0, x1)), r1(Math.min(y0, y1)), r1(Math.max(x0, x1)), r1(Math.max(y0, y1)), r1(Math.min(x0, x1)), r1(Math.max(y0, y1))]

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(ax + dx * t - px, ay + dy * t - py)
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
  // one concourse depth, so their corridors meet.
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
  const exitsAll = elements
    .filter((e) => e.type === 'node' && e.tags.railway === 'subway_entrance')
    .map((e) => ({ e, p: proj(e.pos) }))
    .filter(({ p }) => inFrame(p))
    .map(({ e, p }) => ({ e, p: onPavement(p) }))

  for (const [name, group] of byName) {
    // Exits near this station name; each goes to the closest station.
    const exits = exitsAll.filter(({ p }) => group.some((s) => Math.hypot(p[0] - s.x, p[1] - s.y) < 450))
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
      // this line's, west/north first.
      const plats = platformsAll
        .filter(({ pts }) => pts.some(([px, py]) => Math.hypot(px - x, py - y) < 80))
        .map(({ pts }) => platformFrame(pts))
        .filter((p) => !lines.length || nearest(p.cx, p.cy, lines) <= nearest(p.cx, p.cy, otherLines))
        .sort((a, b) => a.cx + a.cy - (b.cx + b.cy))
        .slice(0, 2)
      const surface = ground(x, y)

      const floors = []
      const ramps = []
      const gates = []
      const tracks = []
      const signs = []
      const platforms = []

      // Concourse (B1): over the platforms, a little longer.
      let ax0 = Infinity
      let ay0 = Infinity
      let ax1 = -Infinity
      let ay1 = -Infinity
      for (const p of plats)
        for (const s of [-1, 1])
          for (const t of [-1, 1]) {
            const px = p.cx + p.ux * p.half * s - p.uy * p.halfW * t
            const py = p.cy + p.uy * p.half * s + p.ux * p.halfW * t
            ax0 = Math.min(ax0, px)
            ax1 = Math.max(ax1, px)
            ay0 = Math.min(ay0, py)
            ay1 = Math.max(ay1, py)
          }
      if (!plats.length) [ax0, ay0, ax1, ay1] = [x - 15, y - 8, x + 15, y + 8]
      const along = ax1 - ax0 > ay1 - ay0 // concourse runs along x?
      const pad = 6
      const conc = along ? [ax0 - pad, ay0 - 3, ax1 + pad, ay1 + 3] : [ax0 - 3, ay0 - pad, ax1 + 3, ay1 + pad]
      floors.push({ kind: 'concourse', z: zB1, p: axisRect(...conc) })

      // Platforms, their tracks, and the way down to each.
      plats.forEach((p, i) => {
        const dir = info.dirs[i] ?? info.dirs[0]
        const z = r2(surface - info.platformDepth[i] * scale)
        // Which long side faces the track: the side nearer this line's rails.
        let side = 1
        if (lines.length) {
          const probe = (s) => nearest(p.cx - p.uy * (p.halfW + 2) * s, p.cy + p.ux * (p.halfW + 2) * s, lines)
          side = probe(1) <= probe(-1) ? 1 : -1
        }
        floors.push({ kind: 'platform', z, p: rect(p.cx, p.cy, p.ux, p.uy, p.half, p.halfW) })
        // Track centerline beside the platform edge.
        const off = p.halfW + PLATFORM_EDGE_TO_TRACK
        const tx = p.cx - p.uy * off * side
        const ty = p.cy + p.ux * off * side
        // Trains keep left: the platform is on the left of the way they go.
        // In map coordinates (y down), left of (dx, dy) is (dy, -dx).
        const toPlat = [p.cx - tx, p.cy - ty]
        let dx = -toPlat[1]
        let dy = toPlat[0]
        const l = Math.hypot(dx, dy) || 1
        dx /= l
        dy /= l
        // Stacked single-track levels: the sign table says which way.
        if (info.stacked && i === 1) {
          dx = -dx
          dy = -dy
        }
        tracks.push({ ax: r1(tx - p.ux * (p.half + 4)), ay: r1(ty - p.uy * (p.half + 4)), bx: r1(tx + p.ux * (p.half + 4)), by: r1(ty + p.uy * (p.half + 4)), z, dx: r2(dx), dy: r2(dy), half: r1(p.half) })
        platforms.push({ i: floors.length - 1, num: dir.num ?? '', ja: dir.ja, en: dir.en, next: dir.next, side })

        // Stairs (or a long escalator) from B1 down to the platform, along
        // the platform's middle, starting a third of the way along it.
        const drop = zB1 - z
        const run = Math.min(p.half * 1.6, drop / STAIR_SLOPE)
        const kind = drop > 6 ? 'escalator' : 'stairs'
        const sx = p.cx - p.ux * p.half * 0.75
        const sy = p.cy - p.uy * p.half * 0.75
        // Stacked platforms: the deeper one's escalator starts further along
        // so the two don't overlap.
        const shift = info.stacked && i === 1 ? p.half * 0.2 : 0
        const a = [sx + p.ux * shift, sy + p.uy * shift]
        const b = [a[0] + p.ux * run, a[1] + p.uy * run]
        // If the run can't cover the drop, it ends at the platform anyway.
        ramps.push({ kind, ax: r1(a[0]), ay: r1(a[1]), bx: r1(b[0]), by: r1(b[1]), w: 2.4, za: zB1, zb: z })
        signs.push({ x: r1(a[0] - p.ux * 1.5), y: r1(a[1] - p.uy * 1.5), z: zB1, r: r2(Math.atan2(p.uy, p.ux)), t: `${dir.num ? dir.num + '番線 ' : ''}${dir.ja}`, en: `${dir.num ? 'Track ' + dir.num + ', ' : ''}${dir.en}`, c: colour, k: 'platform' })
        // Station name board on the platform, like the real ones.
        signs.push({
          x: r1(p.cx + p.ux * p.half * 0.4 + p.uy * (p.halfW - 0.4) * side),
          y: r1(p.cy + p.uy * p.half * 0.4 - p.ux * (p.halfW - 0.4) * side),
          z,
          r: r2(Math.atan2(p.ux, -p.uy)),
          t: `${name} ${n.tags.ref}`,
          en: `${n.tags['name:en'] ?? ''} · next: ${dir.next}`,
          c: colour,
          k: 'name',
        })
      })
      return { n, info, colour, floors, ramps, gates, tracks, signs, platforms, conc, along, surface }
    })

    // Exits: stairs down from the street, then a corridor to the nearest
    // concourse, with gates where it arrives.
    for (const { e, p } of exits) {
      const [ex, ey] = p
      let best = null
      for (const s of built) {
        const [c0x, c0y, c1x, c1y] = s.conc
        const nx = Math.max(c0x, Math.min(c1x, ex))
        const ny = Math.max(c0y, Math.min(c1y, ey))
        const d = Math.hypot(nx - ex, ny - ey)
        if (!best || d < best.d) best = { s, d, nx, ny }
      }
      if (!best || best.d > 500) continue
      const { s, nx, ny } = best
      const top = ground(ex, ey)
      const drop = Math.max(1, top - zB1)
      const run = drop / STAIR_SLOPE
      // Stairs run along the main direction toward the concourse.
      const horiz = Math.abs(nx - ex) >= Math.abs(ny - ey)
      const ux = horiz ? Math.sign(nx - ex) || 1 : 0
      const uy = horiz ? 0 : Math.sign(ny - ey) || 1
      const bx = ex + ux * run
      const by = ey + uy * run
      const ref = e.tags.ref ?? (e.tags.name?.match(/([0-9]+[a-z]?)\s*(番)?(出口|出入口)/)?.[1] ?? '')
      s.ramps.push({ kind: 'stairs', exit: 1, ax: r1(ex), ay: r1(ey), bx: r1(bx), by: r1(by), w: 2.6, za: r2(top), zb: zB1 })
      // Corridor: from the stair bottom to the concourse edge, an L if needed.
      const hw = CORRIDOR_W / 2
      const cx = Math.max(s.conc[0], Math.min(s.conc[2], bx))
      const cy = Math.max(s.conc[1], Math.min(s.conc[3], by))
      const legs = []
      if (Math.abs(cx - bx) > 0.5 || Math.abs(cy - by) > 0.5) {
        if (horiz) {
          legs.push([bx - ux * 1, by - hw, cx + (cx > bx ? hw : -hw), by + hw])
          if (Math.abs(cy - by) > 0.5) legs.push([cx - hw, by, cx + hw, cy])
        } else {
          legs.push([bx - hw, by - uy * 1, bx + hw, cy + (cy > by ? hw : -hw)])
          if (Math.abs(cx - bx) > 0.5) legs.push([bx, cy - hw, cx, cy + hw])
        }
      } else legs.push([bx - hw, by - hw, bx + hw, by + hw])
      for (const l of legs) s.floors.push({ kind: 'corridor', z: zB1, p: axisRect(...l) })
      // Ticket gates across the corridor where it enters the concourse,
      // just inside it.
      if (legs.length && (Math.abs(cx - bx) > 0.5 || Math.abs(cy - by) > 0.5)) {
        const last = legs.at(-1)
        const lastHoriz = Math.abs(last[2] - last[0]) > Math.abs(last[3] - last[1])
        const from = lastHoriz ? [Math.sign(cx - bx) || 1, 0] : [0, Math.sign(cy - by) || 1]
        const gx = cx + from[0] * 1.5
        const gy = cy + from[1] * 1.5
        if (!s.gates.some((g) => Math.hypot(g.x - gx, g.y - gy) < 6)) {
          // ax, ay: the direction the row of gates runs (across the corridor).
          s.gates.push({ x: r1(gx), y: r1(gy), ax: Math.abs(from[1]), ay: Math.abs(from[0]), w: CORRIDOR_W, z: zB1 })
          s.signs.push({ x: r1(gx - from[0] * 3), y: r1(gy - from[1] * 3), z: zB1, r: r2(Math.atan2(from[1], from[0])), t: '改札口', en: 'Ticket gates', c: s.colour, k: 'gate' })
        }
      }
      // Exit sign at the stair bottom.
      s.signs.push({ x: r1(bx + ux * 1.5), y: r1(by + uy * 1.5), z: zB1, r: r2(Math.atan2(uy, ux)), t: `出口 ${ref}`.trim(), en: `Exit ${ref}`.trim(), c: '#f2c230', k: 'exit' })
      s.exits = [...(s.exits ?? []), { ref, name: e.tags.name ?? '', x: r1(ex), y: r1(ey), ux, uy, ramp: s.ramps.length - 1 }]
    }

    for (const s of built) {
      stationsOut.push({
        id: s.n.tags.ref,
        name: s.n.tags.name,
        nameEn: s.n.tags['name:en'] ?? '',
        wikidata: s.n.tags.wikidata,
        line: { ...s.info.line, ref: s.n.tags.ref, colour: s.colour },
        x: r1(s.n.pos ? proj(s.n.pos)[0] : 0),
        y: r1(s.n.pos ? proj(s.n.pos)[1] : 0),
        datum: r2(datum),
        floors: s.floors,
        ramps: s.ramps,
        gates: s.gates,
        tracks: s.tracks,
        platforms: s.platforms,
        signs: s.signs,
        exits: s.exits ?? [],
      })
    }
  }
  return stationsOut
}
