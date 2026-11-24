import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { groundAt, tileGroundAt, type GameMap, type MapTile } from '../map'
import { seeThroughUniforms } from '../seeThrough'
import type { Focus } from '../World'
import { Bin, findPoi, inside, ringOf, segDist, seeThrough } from './common'

// Maman (ママン), Louise Bourgeois's giant bronze spider on 66 Plaza at the
// foot of Mori Tower, Roppongi Hills, and the area's other classic meeting
// point ("クモの下で会いましょう", meet under the spider). The Roppongi cast is
// bronze, about 9.3 m tall, 10.2 m wide and 8.9 m deep, and carries 32
// white marble eggs in a ribbed sac under her body.
//
// Built from the published dimensions: eight knobbly, tapering legs rise
// from the body to high knees, then run down in long, slightly kinked lines
// to needle tips on the paving, so you walk right under her. Real size,
// since she is shorter than the towers the map squashes.

const NAME = 'ママン'
const HEIGHT = 9.3
/** Body (abdomen) center height and the bottom of the egg sac. */
const BODY_Y = 6.9
const SAC_BOTTOM = 5.2

const BRONZE = '#66574a'
const BRONZE_DARK = '#3a3029'
const MARBLE = '#eeebe4'

/**
 * A tube along a curve whose radius changes along it: tapering, with ridges
 * at each joint, like Maman's gnarled legs.
 */
function gnarledTube(points: THREE.Vector3[], radius: (t: number) => number, segs = 64, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false)
  const pos = geo.getAttribute('position')
  const c = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, c)
    const r = radius(t)
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c)
      pos.setXYZ(k, v.x, v.y, v.z)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** A pointed cap for the end of a leg. */
function tip(at: THREE.Vector3, dir: THREE.Vector3, r: number, len: number) {
  const geo = new THREE.ConeGeometry(r, len, 8)
  geo.translate(0, -len / 2, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize())
  geo.applyQuaternion(q)
  geo.translate(at.x, at.y, at.z)
  return geo
}

/** One leg in its own vertical plane: r outward from the body, y up. */
function legPoints(angle: number, reach: number, knee: number): THREE.Vector3[] {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  // [outward, up]; the knee is the highest point of the sculpture.
  const plane: [number, number][] = [
    [0.55, BODY_Y + 0.15],
    [1.3, BODY_Y + 1.25],
    [2.1 * reach, knee],
    [2.75 * reach, knee - 0.55],
    [3.45 * reach, knee - 3.0],
    [4.05 * reach, 3.1],
    [4.45 * reach, 1.2],
    [4.75 * reach, 0.18],
  ]
  return plane.map(([r, y]) => new THREE.Vector3(ca * r, y, sa * r))
}

const ridge = (t: number, n: number) => Math.pow(Math.max(0, Math.sin(t * n * Math.PI)), 6)

function buildMaman(bin: Bin, mats: { bronze: THREE.Material; dark: THREE.Material; marble: THREE.Material }) {
  const group = new THREE.Group()
  group.name = 'maman'
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    bin.add(geo)
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  // Four pairs of legs, the front ones reaching furthest, the back ones
  // trailing. Facing +x (local); the whole thing is turned when placed.
  const pairs: [number, number, number][] = [
    // [angle from the front, reach, knee height]
    [0.42, 1.08, HEIGHT - 0.05],
    [1.12, 1.0, HEIGHT - 0.35],
    [1.86, 0.97, HEIGHT - 0.5],
    [2.6, 1.03, HEIGHT - 0.25],
  ]
  for (const [a, reach, knee] of pairs)
    for (const side of [1, -1]) {
      const pts = legPoints(a * side, reach, knee)
      const geo = gnarledTube(
        pts,
        (t) => {
          // Thick at the body, thinning to a needle; knobbly joints.
          const base = 0.23 * (1 - t) + 0.045 * t
          return base * (1 + 0.32 * ridge(t, 7) + 0.12 * ridge(t + 0.37, 19))
        },
        96,
        10,
      )
      add(geo, mats.bronze)
      const end = pts[pts.length - 1]
      const before = pts[pts.length - 2]
      add(tip(end, end.clone().sub(before), 0.05, 0.2), mats.dark)
    }

  // The body: a small head-chest and a ribbed abdomen, like a wound turban.
  const abdomen = new THREE.SphereGeometry(1, 40, 28)
  {
    const p = abdomen.getAttribute('position')
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      // Horizontal ribs wound around it.
      const band = 1 + 0.06 * Math.sin((v.y + v.x * 0.25) * 22)
      v.set(v.x * 1.05 * band, v.y * 0.72, v.z * 0.86 * band)
      p.setXYZ(i, v.x, v.y, v.z)
    }
    abdomen.computeVertexNormals()
    abdomen.translate(-0.55, BODY_Y + 0.05, 0)
  }
  add(abdomen, mats.bronze)
  const thorax = new THREE.SphereGeometry(0.55, 24, 16).scale(1.1, 0.75, 0.95).translate(0.6, BODY_Y + 0.15, 0)
  add(thorax, mats.bronze)

  // The egg sac: a cage of bronze ribs hanging under the abdomen, holding
  // 32 marble eggs.
  const sacTop = BODY_Y - 0.55
  const sacMid = (sacTop + SAC_BOTTOM) / 2
  const sacR = 0.72
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      const y = sacTop - (sacTop - SAC_BOTTOM) * t
      const r = Math.sin(Math.PI * (0.12 + 0.88 * t)) * sacR + 0.05
      pts.push(new THREE.Vector3(-0.55 + Math.cos(a) * r, y, Math.sin(a) * r))
    }
    add(gnarledTube(pts, () => 0.035, 24, 5), mats.dark)
  }
  const eggGeo = bin.add(new THREE.SphereGeometry(0.15, 12, 9).scale(1, 1.25, 1))
  const eggs = new THREE.InstancedMesh(eggGeo, mats.marble, 32)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 32; i++) {
    // Packed in a ball: a golden-angle spiral, shrunk to fit inside the ribs.
    const t = (i + 0.5) / 32
    const y = 1 - 2 * t
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    const s = 0.48
    m4.makeTranslation(-0.55 + Math.cos(a) * r * s, sacMid + y * s * 1.15, Math.sin(a) * r * s)
    eggs.setMatrixAt(i, m4)
  }
  eggs.castShadow = true
  group.add(eggs)
  return group
}

/** The spot nearest (x, y), within 14 m, at least `r` meters from every building. */
function openSpot(tile: MapTile, x: number, y: number, r: number): [number, number] {
  const rings = tile.buildings.map((b) => ringOf(b.p)).filter((g) => g.some(([gx, gy]) => Math.abs(gx - x) < 60 && Math.abs(gy - y) < 60))
  const clearance = (qx: number, qy: number) => {
    let d = Infinity
    for (const g of rings) {
      if (inside(g, qx, qy)) return 0
      for (let i = 0; i < g.length; i++) {
        const [ax, ay] = g[i]
        const [bx, by] = g[(i + 1) % g.length]
        d = Math.min(d, segDist(qx, qy, ax, ay, bx, by))
      }
    }
    return d
  }
  if (clearance(x, y) >= r) return [x, y]
  let best: [number, number] = [x, y]
  let bd = Infinity
  for (let dx = -14; dx <= 14; dx += 1)
    for (let dy = -14; dy <= 14; dy += 1) {
      const d = Math.hypot(dx, dy)
      if (d >= bd || d > 14) continue
      if (clearance(x + dx, y + dy) >= r) [best, bd] = [[x + dx, y + dy], d]
    }
  return best
}

export function Maman({ map, tiles, focus, night }: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  const found = useMemo(() => findPoi(tiles, NAME), [tiles])
  const key = found ? `${found.poi.x},${found.poi.y}` : ''
  const uniforms = useMemo(() => seeThroughUniforms(), [])
  const built = useMemo(() => {
    if (!found || typeof document === 'undefined') return null
    const { tile, poi } = found
    // Stand her in the open: the nearest spot to the map's point with room
    // for her legs (the point itself can be a few meters off).
    const [px, py] = openSpot(tile, poi.x, poi.y, 5.3)
    const base = tileGroundAt(tile, px, py)
    const bin = new Bin()
    const mat = (color: string, emissive = '#000000') => {
      const m = bin.add(seeThrough(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0 }), uniforms, base))
      return m
    }
    const mats = { bronze: mat(BRONZE, '#8a6440'), dark: mat(BRONZE_DARK), marble: mat(MARBLE, '#ffffff') }
    const group = buildMaman(bin, mats)
    group.position.set(px, base, py)
    // She faces the walkway from the Metro Hat toward the tower (roughly
    // south-west on the map frame).
    group.rotation.y = 2.3
    return { group, mats, dispose: () => bin.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uniforms])
  useEffect(() => () => built?.dispose(), [built])
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const { x, y } = focus.current
    uniforms.uPlayer.value.set(x, groundAt(map, x, y) + 1.0, y)
    uniforms.uCam.value.copy(camera.position)
  })
  useEffect(() => {
    if (!built) return
    // Uplit from the paving after dark: warm on the bronze, the eggs glow.
    ;(built.mats.bronze as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.15
    ;(built.mats.marble as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.45
  }, [built, night])
  return built ? <primitive object={built.group} /> : null
}
