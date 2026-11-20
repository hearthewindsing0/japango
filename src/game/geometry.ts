// Builders that turn the map's flat coordinate lists into Three.js geometry.
// Map coordinates (x, y) in meters become world (X = x, Z = y), with Y up.
import * as THREE from 'three'

type Flat = number[]

/** Ground height at a map point, in meters. */
export type HeightFn = (x: number, z: number) => number

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

/** Lays flat, non-indexed ground geometry over the terrain. The terrain is
 *  flat inside each triangle of its grid (cells of `cell` meters cut along
 *  the x + z diagonal), so every triangle here is cut along those grid lines
 *  first: each piece then lies exactly on the ground, and layers a few
 *  centimeters apart never poke through each other. Normals follow the
 *  smooth slope. */
export function drape(g: THREE.BufferGeometry, height: HeightFn, cell: number) {
  const src = g.getAttribute('position')
  const uvAttr = g.getAttribute('uv')
  const pos: number[] = []
  const uv: number[] = []
  // A vertex: x, y, z, u, v.
  type V = number[]
  const lerp = (a: V, b: V, t: number) => a.map((v, i) => v + (b[i] - v) * t)
  // Cut a convex polygon by the lines f(p) = k·cell for every integer k.
  const cutAll = (poly: V[], f: (p: V) => number): V[][] => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of poly) {
      lo = Math.min(lo, f(p))
      hi = Math.max(hi, f(p))
    }
    let pieces = [poly]
    for (let k = Math.floor(lo / cell) + 1; k * cell < hi; k++) {
      const c = k * cell
      const next: V[][] = []
      for (const pc of pieces) {
        const below: V[] = []
        const above: V[] = []
        for (let i = 0; i < pc.length; i++) {
          const A = pc[i]
          const B = pc[(i + 1) % pc.length]
          const fa = f(A) - c
          const fb = f(B) - c
          if (fa <= 0) below.push(A)
          if (fa >= 0) above.push(A)
          if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
            const m = lerp(A, B, fa / (fa - fb))
            below.push(m)
            above.push(m)
          }
        }
        if (below.length >= 3) next.push(below)
        if (above.length >= 3) next.push(above)
      }
      pieces = next
    }
    return pieces
  }
  const fx = (p: V) => p[0]
  const fz = (p: V) => p[2]
  const fd = (p: V) => p[0] + p[2]
  for (let i = 0; i + 2 < src.count; i += 3) {
    const tri: V[] = [0, 1, 2].map((k) => [
      src.getX(i + k),
      src.getY(i + k),
      src.getZ(i + k),
      uvAttr ? uvAttr.getX(i + k) : 0,
      uvAttr ? uvAttr.getY(i + k) : 0,
    ])
    for (const a of cutAll(tri, fx))
      for (const b of cutAll(a, fz))
        for (const c of cutAll(b, fd))
          for (let k = 1; k + 1 < c.length; k++)
            for (const v of [c[0], c[k], c[k + 1]]) {
              pos.push(v[0], v[1], v[2])
              uv.push(v[3], v[4])
            }
  }

  const normals = new Float32Array(pos.length)
  const e = cell / 2
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]
    const z = pos[i + 2]
    pos[i + 1] += height(x, z)
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e)
    const dz = (height(x, z + e) - height(x, z - e)) / (2 * e)
    const l = Math.hypot(dx, 1, dz)
    normals[i] = -dx / l
    normals[i + 1] = 1 / l
    normals[i + 2] = -dz / l
  }
  g.dispose()
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (uvAttr) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.computeBoundingSphere()
  return out
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

/** The height a building stands at: the lowest ground under its outline,
 *  a little lower so no gap shows where the ground dips between corners. */
export function buildingBase(p: Flat, height: HeightFn) {
  const ring = toPts(p)
  if (ring.length < 3) return 0
  let m = Infinity
  let cx = 0
  let cz = 0
  for (const [x, z] of ring) {
    m = Math.min(m, height(x, z))
    cx += x / ring.length
    cz += z / ring.length
  }
  return Math.min(m, height(cx, cz)) - 0.3
}

/** Extruded buildings: flat roofs plus walls, with per-building colors.
 *  Extra attributes for the window shader: aWall (1 on walls), aU (distance
 *  along the wall), aTop (the building's height) and aBase (the ground
 *  height it stands on). */
export function buildingsGeometry(
  buildings: { p: Flat; h: number; v: number; ho?: Flat[]; c?: [number, number, number] }[],
  height: HeightFn = () => 0,
) {
  const pos: number[] = []
  const col: number[] = []
  const wall: number[] = []
  const us: number[] = []
  const tops: number[] = []
  const bases: number[] = []
  // Each building stands on the lowest ground under its outline; walls run
  // from there, so on a slope the uphill side is partly buried, as in life.
  let base = 0
  const vert = (x: number, y: number, z: number, c: THREE.Color, w: number, u: number, top: number) => {
    pos.push(x, y + base, z)
    col.push(c.r, c.g, c.b)
    wall.push(w)
    us.push(u)
    tops.push(top)
    bases.push(base)
  }
  const baseByBuilding = buildings.map((b) => buildingBase(b.p, height))
  for (const [bi, b] of buildings.entries()) {
    const outer = toPts(b.p)
    if (outer.length < 3) continue
    base = baseByBuilding[bi]
    const holes = (b.ho ?? []).map(toPts).filter((h) => h.length >= 3)
    const h = b.h
    const roof = ROOF[b.v % ROOF.length]
    // Use the color measured from street photos when there is one.
    const wallC = b.c
      ? new THREE.Color().setRGB(b.c[0] / 255, b.c[1] / 255, b.c[2] / 255, THREE.SRGBColorSpace)
      : WALL[b.v % WALL.length]

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
  for (const [bi, b] of buildings.entries()) {
    const ring = toPts(b.p)
    if (ring.length < 3) continue
    base = baseByBuilding[bi]
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
    aBase: { data: bases, size: 1 },
  })
  return g
}

/** 3D surfaces (bridges) from rings of [x, y, height] map points, in the
 *  attribute layout of buildingsGeometry so they share its material. Each
 *  ring is flattened onto its own plane, triangulated, and wound the way the
 *  ring runs (CityGML rings run counter-clockwise seen from outside). */
export function surfacesGeometry(rings: Flat[], color: THREE.ColorRepresentation) {
  const pos: number[] = []
  const c = new THREE.Color(color)
  const n = new THREE.Vector3()
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (const ring of rings) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i + 2 < ring.length; i += 3) pts.push(new THREE.Vector3(ring[i], ring[i + 2], ring[i + 1]))
    const a = pts[0]
    const b = pts[pts.length - 1]
    if (pts.length > 3 && a.distanceToSquared(b) < 1e-6) pts.pop()
    if (pts.length < 3) continue
    // Newell's method: the ring's normal, robust for any planar polygon.
    n.set(0, 0, 0)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      n.x += (p.y - q.y) * (p.z + q.z)
      n.y += (p.z - q.z) * (p.x + q.x)
      n.z += (p.x - q.x) * (p.y + q.y)
    }
    if (n.lengthSq() < 1e-8) continue
    n.normalize()
    u.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize()
    v.crossVectors(n, u)
    const flat = pts.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)))
    // (u, v, n) is right-handed, so a counter-clockwise ring in (u, v)
    // faces +n; ShapeUtils may reorder, so wind each triangle explicitly.
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(flat, [])) {
      const A = flat[i]
      const B = flat[j]
      const C = flat[k]
      const ccw = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0
      for (const idx of ccw ? [i, j, k] : [i, k, j]) pos.push(pts[idx].x, pts[idx].y, pts[idx].z)
    }
  }
  const count = pos.length / 3
  const fill = (x: number) => new Array(count).fill(x)
  return finish(pos, {
    color: { data: Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), size: 3 },
    aWall: { data: fill(0), size: 1 },
    aU: { data: fill(0), size: 1 },
    aTop: { data: fill(-1000), size: 1 },
    aBase: { data: fill(0), size: 1 },
  })
}

/** Elevated expressway decks along polylines of [x, y, deck height] points:
 *  road surface, underside, side walls with parapets, and a pier every
 *  ~30 m. Same attribute layout as buildingsGeometry. */
export function viaductsGeometry(
  viaducts: { p: Flat; w: number }[],
  height: HeightFn,
  colors: { deck: THREE.ColorRepresentation; side: THREE.ColorRepresentation; road: THREE.ColorRepresentation },
) {
  const pos: number[] = []
  const col: number[] = []
  const deck = new THREE.Color(colors.deck)
  const side = new THREE.Color(colors.side)
  const road = new THREE.Color(colors.road)
  const THICK = 1.3
  const PARAPET = 0.9
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    // a-b-c-d run clockwise seen from the side the quad faces.
    for (const v of [a, c, b, a, d, c]) {
      pos.push(v[0], v[1], v[2])
      col.push(color.r, color.g, color.b)
    }
  }
  const box = (cx: number, cz: number, y0: number, y1: number, sx: number, sz: number, ang: number, color: THREE.Color) => {
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const corner = (i: number, j: number, y: number) => [cx + ca * sx * i - sa * sz * j, y, cz + sa * sx * i + ca * sz * j]
    const ring = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k]
      const [i1, j1] = ring[(k + 1) % 4]
      quad(corner(i0, j0, y0), corner(i1, j1, y0), corner(i1, j1, y1), corner(i0, j0, y1), color)
    }
  }
  for (const vd of viaducts) {
    const pts: [number, number, number][] = []
    for (let i = 0; i + 2 < vd.p.length; i += 3) pts.push([vd.p[i], vd.p[i + 1], vd.p[i + 2]])
    if (pts.length < 2) continue
    const r = vd.w / 2
    // Mitered side offsets at every point.
    const offs = pts.map((_, i) => {
      const seg = (k: number) => {
        const [ax, az] = pts[k]
        const [bx, bz] = pts[k + 1]
        const l = Math.hypot(bx - ax, bz - az) || 1
        return [-(bz - az) / l, (bx - ax) / l]
      }
      const n0 = seg(Math.max(0, i - 1))
      const n1 = seg(Math.min(pts.length - 2, i))
      let nx = n0[0] + n1[0]
      let nz = n0[1] + n1[1]
      const l = Math.hypot(nx, nz) || 1
      nx /= l
      nz /= l
      const cos = Math.max(0.5, nx * n1[0] + nz * n1[1])
      return [(nx * r) / cos, (nz * r) / cos]
    })
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az, ah] = pts[i]
      const [bx, bz, bh] = pts[i + 1]
      const [anx, anz] = offs[i]
      const [bnx, bnz] = offs[i + 1]
      // Left (+n) and right (-n) edges.
      const aL = [ax + anx, az + anz]
      const aR = [ax - anx, az - anz]
      const bL = [bx + bnx, bz + bnz]
      const bR = [bx - bnx, bz - bnz]
      const P = (p: number[], y: number) => [p[0], y, p[1]]
      // Road surface (facing up) and underside (facing down).
      quad(P(aR, ah), P(bR, bh), P(bL, bh), P(aL, ah), road)
      quad(P(aL, ah - THICK), P(bL, bh - THICK), P(bR, bh - THICK), P(aR, ah - THICK), deck)
      // Outer side walls, up to the parapet top.
      quad(P(aL, ah - THICK), P(aL, ah + PARAPET), P(bL, bh + PARAPET), P(bL, bh - THICK), side)
      quad(P(bR, bh - THICK), P(bR, bh + PARAPET), P(aR, ah + PARAPET), P(aR, ah - THICK), side)
      // Inner faces of the parapets, seen from the road.
      quad(P(bL, bh), P(bL, bh + PARAPET), P(aL, ah + PARAPET), P(aL, ah), side)
      quad(P(aR, ah), P(aR, ah + PARAPET), P(bR, bh + PARAPET), P(bR, bh), side)
    }
    // Piers: one every ~30 m where the deck is well off the ground.
    let next = 15
    let dist = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az, ah] = pts[i]
      const [bx, bz, bh] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const ang = Math.atan2(bz - az, bx - ax)
      while (next <= dist + len) {
        const t = (next - dist) / (len || 1)
        const x = ax + (bx - ax) * t
        const z = az + (bz - az) * t
        const top = ah + (bh - ah) * t - THICK
        const g = height(x, z)
        if (top - g > 2.5) {
          box(x, z, g - 0.3, top, 0.8, Math.min(1.6, r * 0.35), ang, deck)
          // A crossbeam under the deck.
          box(x, z, top - 0.9, top, 0.7, r * 0.85, ang, deck)
        }
        next += 30
      }
      dist += len
    }
  }
  const count = pos.length / 3
  const fill = (x: number) => new Array(count).fill(x)
  return finish(pos, {
    color: { data: col, size: 3 },
    aWall: { data: fill(0), size: 1 },
    aU: { data: fill(0), size: 1 },
    aTop: { data: fill(-1000), size: 1 },
    aBase: { data: fill(0), size: 1 },
  })
}
