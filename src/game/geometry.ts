// Builders that turn the map's flat coordinate lists into Three.js geometry.
// Map coordinates (x, y) in meters become world (X = x, Z = y), with Y up.
import * as THREE from 'three'

type Flat = number[]

const toPts = (p: Flat) => {
  const pts: [number, number][] = []
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]])
  // Drop the closing point of a ring.
  const a = pts[0]
  const b = pts[pts.length - 1]
  if (pts.length > 1 && a[0] === b[0] && a[1] === b[1]) pts.pop()
  return pts
}

const signedArea = (pts: [number, number][]) => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    s += ax * by - bx * ay
  }
  return s / 2
}

function finish(pos: number[], extra: Record<string, { data: number[]; size: number }> = {}) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  for (const [name, a] of Object.entries(extra)) g.setAttribute(name, new THREE.Float32BufferAttribute(a.data, a.size))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Flat polygons (with holes) at height y, facing up. */
export function polygonsGeometry(polys: { p: Flat; h?: Flat[] }[], y: number) {
  const pos: number[] = []
  for (const poly of polys) {
    const outer = toPts(poly.p)
    if (outer.length < 3) continue
    const holes = (poly.h ?? []).map(toPts).filter((h) => h.length >= 3)
    const contour = outer.map(([x, z]) => new THREE.Vector2(x, z))
    const holeVs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)))
    const all = [...contour, ...holeVs.flat()]
    const tris = THREE.ShapeUtils.triangulateShape(contour, holeVs)
    for (const [a, b, c] of tris) {
      // Wind each triangle so it faces +Y.
      const A = all[a]
      const B = all[b]
      const C = all[c]
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)
      const order = cross < 0 ? [A, B, C] : [A, C, B]
      for (const v of order) pos.push(v.x, y, v.y)
    }
  }
  return finish(pos)
}

/** Ribbons of the given width along polylines, with round joins and caps.
 *  `uv.x` is the distance along the line in meters and `uv.y` runs 0..1
 *  across it, for striped materials. */
export function ribbonsGeometry(lines: { p: Flat; w: number }[], y: number, roundJoins = true) {
  const pos: number[] = []
  const uv: number[] = []
  const push = (x: number, z: number, u: number, v: number) => {
    pos.push(x, y, z)
    uv.push(u, v)
  }
  for (const line of lines) {
    const pts: [number, number][] = []
    for (let i = 0; i < line.p.length; i += 2) pts.push([line.p[i], line.p[i + 1]])
    const r = line.w / 2
    let dist = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-6) continue
      const nx = (-(bz - az) / len) * r
      const nz = ((bx - ax) / len) * r
      const u0 = dist
      const u1 = dist + len
      // Two triangles, wound to face +Y.
      push(ax + nx, az + nz, u0, 1)
      push(bx + nx, bz + nz, u1, 1)
      push(ax - nx, az - nz, u0, 0)
      push(ax - nx, az - nz, u0, 0)
      push(bx + nx, bz + nz, u1, 1)
      push(bx - nx, bz - nz, u1, 0)
      dist = u1
    }
    if (!roundJoins || r < 0.6) continue
    // A disc at every vertex fills the gaps at joins and rounds the ends.
    const SEG = 10
    dist = 0
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      const [cx, cz] = pts[i]
      for (let s = 0; s < SEG; s++) {
        const a0 = (s / SEG) * Math.PI * 2
        const a1 = ((s + 1) / SEG) * Math.PI * 2
        push(cx, cz, dist, 0.5)
        push(cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, dist, 0.5)
        push(cx + Math.cos(a0) * r, cz + Math.sin(a0) * r, dist, 0.5)
      }
    }
  }
  return finish(pos, { uv: { data: uv, size: 2 } })
}

/** Short dashes along the middle of polylines (road center lines). */
export function dashesGeometry(lines: Flat[], y: number, width = 0.15, dash = 3, gap = 4) {
  const segs: { p: Flat; w: number }[] = []
  for (const p of lines) {
    let carry = 0
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i]
      const az = p[i + 1]
      const bx = p[i + 2]
      const bz = p[i + 3]
      const len = Math.hypot(bx - ax, bz - az)
      let d = carry
      while (d < len) {
        const e = Math.min(len, d + dash)
        const t0 = d / len
        const t1 = e / len
        segs.push({ p: [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1], w: width })
        d += dash + gap
      }
      carry = d - len
    }
  }
  return ribbonsGeometry(segs, y, false)
}

function inside(ring: [number, number][], x: number, z: number) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

const ROOF = [0x7d7187, 0x9a7b6a, 0x6c7f96, 0xa29c8c, 0x768a7a, 0xa8786a, 0x7c7d86, 0x8c96ab].map((c) => new THREE.Color(c))
const WALL = [0xe8e2d8, 0xd8cbbd, 0xc9d1dc, 0xf0ece4, 0xd5dccf, 0xe6d3c8, 0xcfcfd4, 0xdcdfe6].map((c) => new THREE.Color(c))

/** Extruded buildings: flat roofs plus walls, with per-building colors.
 *  Extra attributes for the window shader: aWall (1 on walls), aU (distance
 *  along the wall) and aTop (the building's height). */
export function buildingsGeometry(buildings: { p: Flat; h: number; v: number; ho?: Flat[] }[]) {
  const pos: number[] = []
  const col: number[] = []
  const wall: number[] = []
  const us: number[] = []
  const tops: number[] = []
  const vert = (x: number, y: number, z: number, c: THREE.Color, w: number, u: number, top: number) => {
    pos.push(x, y, z)
    col.push(c.r, c.g, c.b)
    wall.push(w)
    us.push(u)
    tops.push(top)
  }
  for (const b of buildings) {
    const outer = toPts(b.p)
    if (outer.length < 3) continue
    const holes = (b.ho ?? []).map(toPts).filter((h) => h.length >= 3)
    const h = b.h
    const roof = ROOF[b.v % ROOF.length]
    const wallC = WALL[b.v % WALL.length]

    // Roof.
    const contour = outer.map(([x, z]) => new THREE.Vector2(x, z))
    const holeVs = holes.map((ring) => ring.map(([x, z]) => new THREE.Vector2(x, z)))
    const all = [...contour, ...holeVs.flat()]
    for (const [a, bb, c] of THREE.ShapeUtils.triangulateShape(contour, holeVs)) {
      const A = all[a]
      const B = all[bb]
      const C = all[c]
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)
      const order = cross < 0 ? [A, B, C] : [A, C, B]
      for (const v of order) vert(v.x, h, v.y, roof, 0, 0, h)
    }

    // Walls, wound to face outward from the solid.
    for (const [ring, isHole] of [[outer, false], ...holes.map((r) => [r, true] as const)] as const) {
      const ccw = signedArea(ring) > 0
      const flip = ccw !== isHole
      let u = 0
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i]
        const [bx, bz] = ring[(i + 1) % ring.length]
        const len = Math.hypot(bx - ax, bz - az)
        const u0 = u
        const u1 = u + len
        u = u1
        const quad: [number, number, number, number][] = [
          [ax, 0, az, u0],
          [bx, 0, bz, u1],
          [bx, h, bz, u1],
          [ax, h, az, u0],
        ]
        const tri = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
        for (const k of tri) {
          const [x, y, z, uu] = quad[k]
          vert(x, y, z, wallC, 1, uu, h)
        }
      }
    }
  }
  // Rooftop clutter (AC units, water tanks, stair housings) on bigger roofs.
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().getAttribute('position')
  const grey = [new THREE.Color(0xb7b9bd), new THREE.Color(0x9fa3a8), new THREE.Color(0xd0cfca)]
  let seed = 7
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const b of buildings) {
    const ring = toPts(b.p)
    if (ring.length < 3) continue
    const area = Math.abs(signedArea(ring))
    if (area < 120) continue
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const [x, z] of ring) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    const n = Math.min(6, Math.floor(area / 250) + 1)
    for (let k = 0, tries = 0; k < n && tries < 20; tries++) {
      const sx = 1 + rand() * 2.2
      const sz = 1 + rand() * 2.2
      const sy = 0.7 + rand() * 1.3
      const cx = minX + rand() * (maxX - minX)
      const cz = minZ + rand() * (maxZ - minZ)
      // Keep the whole box on the roof.
      const corners: [number, number][] = [
        [cx - sx / 2 - 0.5, cz - sz / 2 - 0.5],
        [cx + sx / 2 + 0.5, cz - sz / 2 - 0.5],
        [cx + sx / 2 + 0.5, cz + sz / 2 + 0.5],
        [cx - sx / 2 - 0.5, cz + sz / 2 + 0.5],
      ]
      if (!corners.every(([x, z]) => inside(ring, x, z))) continue
      k++
      const c = grey[Math.floor(rand() * grey.length)]
      for (let i = 0; i < unit.count; i++) {
        vert(cx + unit.getX(i) * sx, b.h + (unit.getY(i) + 0.5) * sy, cz + unit.getZ(i) * sz, c, 0, 0, b.h)
      }
    }
  }

  const g = finish(pos, {
    color: { data: col, size: 3 },
    aWall: { data: wall, size: 1 },
    aU: { data: us, size: 1 },
    aTop: { data: tops, size: 1 },
  })
  return g
}
