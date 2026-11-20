import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gateBoxes, type Station, type StationFloor, type StationRamp, type StationSign, type Underground } from './station'
import type { Focus } from './World'
import { view } from './input'
import { patternedMaterial } from './patterns'

// The stations, drawn as a cutaway: floors, low walls, stairs and
// escalators, ticket gates, platform doors, tracks with trains coming and
// going, and hanging signs. Only the floors at or below the player show, so
// the floor above never hides the one you're on. On the street, only the
// exits show: a covered stairwell with the line's sign.

const WALL_H = 2.0 // low, so the camera can see over them
const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'

/** A box between two points on the map, from height z0 to z1. */
function wallBox(ax: number, ay: number, bx: number, by: number, z0: number, z1: number, t = 0.25) {
  const len = Math.hypot(bx - ax, by - ay)
  const g = new THREE.BoxGeometry(len, z1 - z0, t)
  g.rotateY(-Math.atan2(by - ay, bx - ax))
  g.translate((ax + bx) / 2, (z0 + z1) / 2, (ay + by) / 2)
  return g
}

/** A floor polygon at height z. */
function floorGeo(p: number[], z: number) {
  // Drawn in (x, -y) and turned up, so the floor faces the sky.
  const shape = new THREE.Shape()
  shape.moveTo(p[0], -p[1])
  for (let i = 2; i < p.length; i += 2) shape.lineTo(p[i], -p[i + 1])
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(-Math.PI / 2)
  g.translate(0, z, 0)
  return g
}

/** Walls along a floor's edges, wherever the space doesn't carry on. */
function floorWalls(f: StationFloor, ug: Underground) {
  const out: THREE.BufferGeometry[] = []
  const p = f.p
  for (let i = 0; i < p.length; i += 2) {
    const ax = p[i]
    const ay = p[i + 1]
    const bx = p[(i + 2) % p.length]
    const by = p[(i + 3) % p.length]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 0.1) continue
    // Outward normal, whichever way the polygon winds.
    let nx = (by - ay) / len
    let ny = -(bx - ax) / len
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    if (ug.hasSurface(mx + nx * 0.05, my + ny * 0.05, f.z) && !ug.hasSurface(mx - nx * 0.4, my - ny * 0.4, f.z)) {
      nx = -nx
      ny = -ny
    }
    const steps = Math.max(1, Math.round(len / 0.5))
    let run: number | null = null
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      const open = k < steps && ug.hasSurface(x + nx * 0.4, y + ny * 0.4, f.z)
      if (!open && run == null && k < steps) run = t
      if ((open || k === steps) && run != null) {
        out.push(wallBox(ax + (bx - ax) * run, ay + (by - ay) * run, x, y, f.z, f.z + WALL_H))
        run = null
      }
    }
  }
  return out
}

/** Stairs as steps, or an escalator as a sloped belt with handrails. */
function rampGeo(r: StationRamp) {
  const dx = r.bx - r.ax
  const dy = r.by - r.ay
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const parts: THREE.BufferGeometry[] = []
  if (r.kind === 'stairs') {
    const n = Math.max(2, Math.round(len / 0.32))
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const z = r.za + (r.zb - r.za) * ((t0 + t1) / 2)
      const lo = Math.min(r.za, r.zb) - 0.2
      const g = new THREE.BoxGeometry(len / n, Math.max(0.05, z - lo), r.w)
      g.rotateY(-Math.atan2(uy, ux))
      g.translate(r.ax + dx * ((t0 + t1) / 2), (z + lo) / 2, r.ay + dy * ((t0 + t1) / 2))
      parts.push(g)
    }
  } else {
    const belt = new THREE.BoxGeometry(Math.hypot(len, r.zb - r.za), 0.12, r.w * 0.8)
    belt.rotateZ(Math.atan2(r.zb - r.za, len))
    belt.rotateY(-Math.atan2(uy, ux))
    belt.translate((r.ax + r.bx) / 2, (r.za + r.zb) / 2, (r.ay + r.by) / 2)
    parts.push(belt)
  }
  return parts
}

/** Side walls of a ramp: up to `top` for an exit's stairwell (street
 *  level), otherwise handrail-high panels that follow the slope. */
function rampSides(r: StationRamp, top: number | null) {
  const len = Math.hypot(r.bx - r.ax, r.by - r.ay)
  const ux = (r.bx - r.ax) / len
  const uy = (r.by - r.ay) / len
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const ox = -uy * (r.w / 2 + 0.15) * s
    const oy = ux * (r.w / 2 + 0.15) * s
    if (top == null) {
      // A sloped balustrade that follows the stairs.
      const g = new THREE.BoxGeometry(Math.hypot(len, r.zb - r.za), 1.1, 0.15)
      g.translate(0, 0.45, 0)
      g.rotateZ(Math.atan2(r.zb - r.za, len))
      g.rotateY(-Math.atan2(uy, ux))
      g.translate((r.ax + r.bx) / 2 + ox, (r.za + r.zb) / 2, (r.ay + r.by) / 2 + oy)
      parts.push(g)
      continue
    }
    // A stairwell from the street: walls up to the pavement.
    const n = Math.max(1, Math.round(len / 1.5))
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const zMid = r.za + (r.zb - r.za) * ((t0 + t1) / 2)
      parts.push(wallBox(r.ax + (r.bx - r.ax) * t0 + ox, r.ay + (r.by - r.ay) * t0 + oy, r.ax + (r.bx - r.ax) * t1 + ox, r.ay + (r.by - r.ay) * t1 + oy, zMid - 0.6, top, 0.2))
    }
  }
  return parts
}

function merged(parts: THREE.BufferGeometry[]) {
  if (!parts.length) return null
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
  parts.forEach((p) => p.dispose())
  return g
}

/** A hanging sign's face, drawn on a canvas. */
function signTexture(s: StationSign) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const ctx = c.getContext('2d')!
  const bg = s.k === 'exit' ? '#f2c230' : s.k === 'name' ? '#f7f7f4' : '#1d2433'
  const fg = s.k === 'exit' || s.k === 'name' ? '#111111' : '#ffffff'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 128)
  if (s.k !== 'exit') {
    ctx.fillStyle = s.c
    if (s.k === 'name') ctx.fillRect(0, 104, 512, 24)
    else {
      ctx.beginPath()
      ctx.arc(56, 64, 34, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  const left = s.k === 'exit' || s.k === 'name' ? 24 : 104
  ctx.font = `700 ${s.k === 'name' ? 50 : 44}px ${FONT}`
  ctx.fillText(s.t, left, s.k === 'name' ? 44 : 50, 512 - left - 16)
  ctx.font = `500 22px ${FONT}`
  ctx.fillText(s.en, left, s.k === 'name' ? 86 : 96, 512 - left - 16)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

interface Piece {
  /** Lowest height of this piece: it shows while the player is above it. */
  z: number
  geo: THREE.BufferGeometry
  mat: THREE.Material
}

function useStationPieces(stations: Station[], ug: Underground) {
  return useMemo(() => {
    const mats = {
      floor: patternedMaterial('#bfb9ad', 'slabs'),
      platform: patternedMaterial('#aaa69d', 'slabs'),
      wall: new THREE.MeshLambertMaterial({ color: '#f3f0e9' }),
      stairs: new THREE.MeshLambertMaterial({ color: '#9d978c' }),
      escalator: new THREE.MeshLambertMaterial({ color: '#7d838c' }),
      rail: new THREE.MeshLambertMaterial({ color: '#8b8f96' }),
      trench: new THREE.MeshLambertMaterial({ color: '#2b2d31', side: THREE.DoubleSide }),
      gate: new THREE.MeshLambertMaterial({ color: '#c4c8cf' }),
      gateTop: new THREE.MeshLambertMaterial({ color: '#2f6fd6' }),
      tactile: new THREE.MeshLambertMaterial({ color: '#f1c40f' }),
      door: new THREE.MeshLambertMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.85 }),
    }
    const pieces: Piece[] = []
    for (const st of stations) {
      const stripe = new THREE.MeshLambertMaterial({ color: st.line.colour })
      for (const f of st.floors) {
        pieces.push({ z: f.z, geo: floorGeo(f.p, f.z), mat: f.kind === 'platform' ? mats.platform : mats.floor })
        const walls = merged(floorWalls(f, ug))
        if (walls) pieces.push({ z: f.z, geo: walls, mat: mats.wall })
      }
      for (const r of st.ramps) {
        const g = merged(rampGeo(r))
        if (g) pieces.push({ z: Math.min(r.za, r.zb), geo: g, mat: r.kind === 'escalator' ? mats.escalator : mats.stairs })
        const sides = merged(rampSides(r, r.exit ? r.za + 1.0 : null))
        if (sides) pieces.push({ z: Math.min(r.za, r.zb), geo: sides, mat: r.exit ? stripe : mats.wall })
      }
      // Ticket gates: a row of cabinets with blue tops, and fare fence.
      for (const g of st.gates) {
        const body: THREE.BufferGeometry[] = []
        const tops: THREE.BufferGeometry[] = []
        for (const c of gateBoxes(g)) {
          const h = g.solid ? 1.1 : 1.0
          const b = new THREE.BoxGeometry(c.hl * 2, h, c.hd * 2)
          b.rotateY(-Math.atan2(c.ay, c.ax))
          b.translate(c.x, g.z + h / 2, c.y)
          body.push(b)
          if (g.solid) continue
          const t = new THREE.BoxGeometry(c.hl * 2 + 0.01, 0.06, c.hd * 2 + 0.01)
          t.rotateY(-Math.atan2(c.ay, c.ax))
          t.translate(c.x, g.z + 1.03, c.y)
          tops.push(t)
        }
        pieces.push({ z: g.z, geo: merged(body)!, mat: mats.gate })
        if (tops.length) pieces.push({ z: g.z, geo: merged(tops)!, mat: mats.gateTop })
      }
      // Tracks: a trench with rails, a wall behind with the line's stripe,
      // and platform doors along the edge.
      for (const t of st.tracks) {
        const len = Math.hypot(t.bx - t.ax, t.by - t.ay)
        const ux = (t.bx - t.ax) / len
        const uy = (t.by - t.ay) / len
        const plat = st.floors
          .filter((f) => f.kind === 'platform' && Math.abs(f.z - t.z) < 0.1)
          .map((f) => {
            let cx = 0
            let cy = 0
            for (let i = 0; i < f.p.length; i += 2) {
              cx += f.p[i]
              cy += f.p[i + 1]
            }
            return [cx / (f.p.length / 2), cy / (f.p.length / 2)]
          })
          .sort((a, b) => Math.hypot(a[0] - t.ax, a[1] - t.ay) + Math.hypot(a[0] - t.bx, a[1] - t.by) - (Math.hypot(b[0] - t.ax, b[1] - t.ay) + Math.hypot(b[0] - t.bx, b[1] - t.by)))[0]
        // Which side of the track the platform is on.
        const mx = (t.ax + t.bx) / 2
        const my = (t.ay + t.by) / 2
        const side = plat ? Math.sign(-uy * (plat[0] - mx) + ux * (plat[1] - my)) || 1 : 1
        const nx = -uy * side
        const ny = ux * side
        const trench = new THREE.PlaneGeometry(len, 3.6).rotateX(-Math.PI / 2)
        trench.rotateY(-Math.atan2(uy, ux))
        trench.translate(mx, t.z - 1.1, my)
        pieces.push({ z: t.z - 1.1, geo: trench, mat: mats.trench })
        const rails = merged(
          [-0.72, 0.72].map((o) => {
            const g = new THREE.BoxGeometry(len, 0.15, 0.08)
            g.rotateY(-Math.atan2(uy, ux))
            g.translate(mx - nx * o, t.z - 1.0, my - ny * o)
            return g
          }),
        )
        if (rails) pieces.push({ z: t.z - 1.1, geo: rails, mat: mats.rail })
        // Far wall, with a stripe in the line's color, unless another
        // track runs alongside on that side.
        const fx = mx - nx * 2.1
        const fy = my - ny * 2.1
        const shared = st.tracks.some((o) => o !== t && Math.abs(o.z - t.z) < 0.5 && Math.hypot((o.ax + o.bx) / 2 - (mx - nx * 4.4), (o.ay + o.by) / 2 - (my - ny * 4.4)) < 3)
        if (!shared) pieces.push({ z: t.z - 1.1, geo: wallBox(fx - ux * len * 0.5, fy - uy * len * 0.5, fx + ux * len * 0.5, fy + uy * len * 0.5, t.z - 1.1, t.z + WALL_H), mat: mats.wall })
        if (!shared) pieces.push({ z: t.z - 1.1, geo: wallBox(fx - ux * len * 0.5 + nx * 0.15, fy - uy * len * 0.5 + ny * 0.15, fx + ux * len * 0.5 + nx * 0.15, fy + uy * len * 0.5 + ny * 0.15, t.z + 0.9, t.z + 1.2, 0.05), mat: stripe })
        // Platform edge: yellow tactile strip and screen doors with gaps.
        const ex = mx + nx * 1.75
        const ey = my + ny * 1.75
        const half = t.half
        pieces.push({ z: t.z, geo: wallBox(ex - ux * half + nx * 0.6, ey - uy * half + ny * 0.6, ex + ux * half + nx * 0.6, ey + uy * half + ny * 0.6, t.z + 0.005, t.z + 0.03, 0.3), mat: mats.tactile })
        const doors: THREE.BufferGeometry[] = []
        for (let a = -half; a < half - 0.5; a += 4) {
          doors.push(wallBox(ex + ux * a, ey + uy * a, ex + ux * Math.min(half, a + 2.6), ey + uy * Math.min(half, a + 2.6), t.z, t.z + 1.3, 0.12))
        }
        const d = merged(doors)
        if (d) pieces.push({ z: t.z, geo: d, mat: mats.door })
      }
    }
    return { pieces, mats }
  }, [stations, ug])
}

/** Trains: cars come in, wait with doors open, and leave, on a loop. */
function Trains({ station, show, focus }: { station: Station; show: boolean; focus: React.RefObject<Focus> }) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#d7dbe0' }), [])
  const stripeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: station.line.colour }), [station])
  const winMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#33414f' }), [])
  // Each track's train only shows between the track's ends.
  const clips = useMemo(
    () =>
      station.tracks.map((t) => {
        const len = Math.hypot(t.bx - t.ax, t.by - t.ay)
        const ux = (t.bx - t.ax) / len
        const uy = (t.by - t.ay) / len
        return [
          new THREE.Plane(new THREE.Vector3(ux, 0, uy), -(ux * t.ax + uy * t.ay)),
          new THREE.Plane(new THREE.Vector3(-ux, 0, -uy), ux * t.bx + uy * t.by),
        ]
      }),
    [station],
  )
  const mats = useMemo(
    () =>
      clips.map((c) => ({
        body: Object.assign(bodyMat.clone(), { clippingPlanes: c }),
        stripe: Object.assign(stripeMat.clone(), { clippingPlanes: c }),
        win: Object.assign(winMat.clone(), { clippingPlanes: c }),
      })),
    [clips, bodyMat, stripeMat, winMat],
  )
  useEffect(() => () => mats.forEach((m) => Object.values(m).forEach((x) => x.dispose())), [mats])

  useFrame(() => {
    // On the wall clock, so trains run on the same timetable for everyone.
    const time = Date.now() / 1000
    station.tracks.forEach((t, i) => {
      const g = groups.current[i]
      if (!g) return
      // A train every 2½ minutes, each track at its own time.
      const PERIOD = 150
      const ph = (time + i * 61 + station.x) % PERIOD
      const ARRIVE = 14
      const DWELL = 25
      const LEAVE = 14
      const len = Math.hypot(t.bx - t.ax, t.by - t.ay)
      let s: number | null = null // where the train's middle is, from the platform middle
      if (ph < ARRIVE) s = -((1 - ph / ARRIVE) ** 2) * (len + 40)
      else if (ph < ARRIVE + DWELL) s = 0
      else if (ph < ARRIVE + DWELL + LEAVE) s = ((ph - ARRIVE - DWELL) / LEAVE) ** 2 * (len + 40)
      g.visible = show && s != null && t.z <= (focus.current.z ?? 0) + 1.2
      if (s == null) return
      const mx = (t.ax + t.bx) / 2
      const my = (t.ay + t.by) / 2
      g.position.set(mx + t.dx * s, t.z - 1.0, my + t.dy * s)
      g.rotation.y = -Math.atan2(t.dy, t.dx)
    })
  })

  return (
    <>
      {station.tracks.map((t, i) => {
        const cars = Math.max(1, Math.round((t.half * 2) / 16))
        const carLen = (t.half * 2) / cars
        return (
          <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
            {Array.from({ length: cars }, (_, c) => {
              const x = -t.half + carLen * (c + 0.5)
              return (
                <group key={c} position={[x, 0, 0]}>
                  <mesh material={mats[i].body} position={[0, 1.7, 0]}>
                    <boxGeometry args={[carLen - 0.5, 3.0, 2.8]} />
                  </mesh>
                  <mesh material={mats[i].stripe} position={[0, 1.15, 0]}>
                    <boxGeometry args={[carLen - 0.45, 0.25, 2.84]} />
                  </mesh>
                  <mesh material={mats[i].win} position={[0, 2.25, 0]}>
                    <boxGeometry args={[carLen - 1.5, 0.8, 2.83]} />
                  </mesh>
                </group>
              )
            })}
          </group>
        )
      })}
    </>
  )
}

/** Hanging signs. They turn to face the camera and lean back a little,
 *  so they read from above. */
function Signs({ station }: { station: Station }) {
  const items = useMemo(
    () =>
      station.signs.map((s) => {
        const tex = signTexture(s)
        return { s, tex, mat: new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }) }
      }),
    [station],
  )
  useEffect(() => () => items.forEach((i) => (i.tex.dispose(), i.mat.dispose())), [items])
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    root.current?.children.forEach((c) => c.rotation.set(-0.55, view.yaw, 0, 'YXZ'))
  })
  return (
    <group ref={root}>
      {items.map(({ s, mat }, i) => (
        <group key={i} position={[s.x, s.z + 2.6, s.y]} userData={{ z: s.z }}>
          <mesh material={mat}>
            <planeGeometry args={[3.2, 0.8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** On the street: a canopy over each exit's stairs, with a sign post. */
function ExitHoods({ stations }: { stations: Station[] }) {
  const built = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; colour: string; open: THREE.BufferGeometry; post: [number, number, number]; label: THREE.CanvasTexture }[] = []
    for (const st of stations)
      for (const e of st.exits) {
        const r = st.ramps[e.ramp]
        if (!r) continue
        const len = Math.hypot(r.bx - r.ax, r.by - r.ay)
        const ux = (r.bx - r.ax) / len
        const uy = (r.by - r.ay) / len
        const top = r.za
        // Canopy over the top few meters, on two thin walls.
        const parts: THREE.BufferGeometry[] = []
        const cover = Math.min(len, 4)
        for (const s of [-1, 1]) {
          const ox = -uy * (r.w / 2 + 0.15) * s
          const oy = ux * (r.w / 2 + 0.15) * s
          parts.push(wallBox(r.ax + ox, r.ay + oy, r.ax + ux * len + ox, r.ay + uy * len + oy, top - 0.1, top + 1.0, 0.18))
          parts.push(wallBox(r.ax + ux * cover * 0.3 + ox, r.ay + uy * cover * 0.3 + oy, r.ax + ux * cover + ox, r.ay + uy * cover + oy, top + 1.0, top + 2.4, 0.18))
        }
        const roof = new THREE.BoxGeometry(cover + 0.4, 0.12, r.w + 0.7)
        roof.rotateY(-Math.atan2(uy, ux))
        roof.translate(r.ax + (ux * cover) / 2, top + 2.45, r.ay + (uy * cover) / 2)
        parts.push(roof)
        // Back wall at the far end, so it reads as a stairwell.
        parts.push(wallBox(r.bx - uy * (r.w / 2 + 0.25), r.by + ux * (r.w / 2 + 0.25), r.bx + uy * (r.w / 2 + 0.25), r.by - ux * (r.w / 2 + 0.25), top - 0.1, top + 1.0, 0.18))
        // The dark opening, just above the pavement.
        const open = new THREE.PlaneGeometry(len, r.w).rotateX(-Math.PI / 2)
        open.rotateY(-Math.atan2(uy, ux))
        open.translate((r.ax + r.bx) / 2, top + 0.03, (r.ay + r.by) / 2)
        // Sign post at the entrance, to one side.
        const post: [number, number, number] = [r.ax - uy * (r.w / 2 + 0.6) - ux * 0.3, top, r.ay + ux * (r.w / 2 + 0.6) - uy * 0.3]
        const c = document.createElement('canvas')
        c.width = 128
        c.height = 128
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 128, 128)
        ctx.fillStyle = st.line.colour
        ctx.beginPath()
        ctx.arc(64, 50, 40, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `700 40px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(st.line.ref[0], 64, 52)
        ctx.fillStyle = '#111'
        ctx.font = `700 26px ${FONT}`
        ctx.fillText(e.ref ? `出口 ${e.ref}` : '出入口', 64, 110)
        const label = new THREE.CanvasTexture(c)
        label.colorSpace = THREE.SRGBColorSpace
        out.push({ geo: merged(parts)!, colour: st.line.colour, open, post, label })
      }
    return out
  }, [stations])
  useEffect(() => () => built.forEach((b) => (b.geo.dispose(), b.open.dispose(), b.label.dispose())), [built])
  return (
    <>
      {built.map((b, i) => (
        <group key={i}>
          <mesh geometry={b.geo} castShadow receiveShadow>
            <meshLambertMaterial color="#a3a9b0" />
          </mesh>
          <mesh geometry={b.open}>
            <meshBasicMaterial color="#1a1c20" />
          </mesh>
          <mesh position={[b.post[0], b.post[1] + 1.1, b.post[2]]} castShadow>
            <boxGeometry args={[0.12, 2.2, 0.12]} />
            <meshLambertMaterial color="#3b4048" />
          </mesh>
          <group position={[b.post[0], b.post[1] + 2.6, b.post[2]]}>
            {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry) => (
              <mesh key={ry} rotation-y={ry} position={[Math.sin(ry) * 0.46, 0, Math.cos(ry) * 0.46]}>
                <planeGeometry args={[0.9, 0.9]} />
                <meshBasicMaterial map={b.label} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </>
  )
}

/** All the map's stations. `under`: the player is down in one. */
export function Stations({ ug, focus, under }: { ug: Underground; focus: React.RefObject<Focus>; under: boolean }) {
  const { pieces, mats } = useStationPieces(ug.stations, ug)
  useEffect(
    () => () => {
      pieces.forEach((p) => p.geo.dispose())
      Object.values(mats).forEach((m) => m.dispose())
    },
    [pieces, mats],
  )
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const signRoot = useRef<THREE.Group>(null)
  // Show what's at or below the player, so the floor above never hides them.
  useFrame(() => {
    const z = focus.current.z ?? 0
    pieces.forEach((p, i) => {
      const m = meshes.current[i]
      if (m) m.visible = under && p.z <= z + 1.2
    })
    signRoot.current?.traverse((o) => {
      if (o.userData.z != null) o.visible = under && o.userData.z <= z + 1.2
    })
  })
  return (
    <>
      {pieces.map((p, i) => (
        <mesh key={i} ref={(el) => void (meshes.current[i] = el)} geometry={p.geo} material={p.mat} visible={false} />
      ))}
      <group ref={signRoot}>
        {ug.stations.map((s) => (
          <Signs key={s.id} station={s} />
        ))}
      </group>
      {ug.stations.map((s) => (
        <Trains key={s.id} station={s} show={under} focus={focus} />
      ))}
      {!under && <ExitHoods stations={ug.stations} />}
      {under && <ambientLight intensity={0.6} color="#f4f6ff" />}
    </>
  )
}

