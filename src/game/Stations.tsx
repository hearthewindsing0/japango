import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { doorOpenings, gateBoxes, platformFrames, type Station, type StationFloor, type StationRamp, type StationSign, type Underground } from './station'
import type { Focus } from './World'
import { platformView, view } from './input'
import { Riders } from './PlatformRiders'
import type { RiderSource } from './riders'
import { patternedMaterial } from './patterns'
import { clockText, departures, nextDepartures, tokyoNow, type Timetable } from './trains'

// The stations, drawn as a cutaway: floors, low walls, stairs and
// escalators, ticket gates, platform doors, tracks with trains coming and
// going, and hanging signs. Only the floors at or below the player show, so
// the floor above never hides the one you're on. On the street, only the
// exits show: a covered stairwell with the line's sign.

const WALL_H = 2.0 // low, so the camera can see over them
/** On a platform, with the camera down at eye level, the walls go up to
 *  a ceiling this high over the platform. */
const HALL_H = 4.4
export const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'

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
function floorWalls(f: StationFloor, ug: Underground, z0 = f.z, z1 = f.z + WALL_H, skip?: (x: number, y: number) => boolean) {
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
      const open = k < steps && (ug.hasSurface(x + nx * 0.4, y + ny * 0.4, f.z) || !!skip?.(x + nx * 0.4, y + ny * 0.4))
      if (!open && run == null && k < steps) run = t
      if ((open || k === steps) && run != null) {
        out.push(wallBox(ax + (bx - ax) * run, ay + (by - ay) * run, x, y, z0, z1))
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
  /** Only with the camera down on a platform at this height: the upper
   *  walls and the ceiling. */
  hall?: number
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
      upper: new THREE.MeshLambertMaterial({ color: '#e9e6df' }),
      ceiling: new THREE.MeshLambertMaterial({ color: '#4a4f57', side: THREE.DoubleSide }),
      lights: new THREE.MeshBasicMaterial({ color: '#fdfcf4' }),
    }
    const pieces: Piece[] = []
    for (const st of stations) {
      const stripe = new THREE.MeshLambertMaterial({ color: st.line.colour })
      for (const f of st.floors) {
        pieces.push({ z: f.z, geo: floorGeo(f.p, f.z), mat: f.kind === 'platform' ? mats.platform : mats.floor })
        // Along a platform's edge the track side is open (the screen doors
        // stand there), so no wall over the track.
        const nearTrack = (x: number, y: number) =>
          f.kind === 'platform' &&
          st.tracks.some((t) => {
            if (Math.abs(t.z - f.z) > 0.3) return false
            const len = Math.hypot(t.bx - t.ax, t.by - t.ay) || 1
            return Math.abs(((x - t.ax) * (t.by - t.ay) - (y - t.ay) * (t.bx - t.ax)) / len) < 2.6
          })
        const walls = merged(floorWalls(f, ug, f.z, f.z + WALL_H, nearTrack))
        if (walls) pieces.push({ z: f.z, geo: walls, mat: mats.wall })
        if (f.kind !== 'platform') continue
        // The platform hall, for the low camera: walls up to the ceiling
        // (not over the track side), the ceiling, and a strip of lights.
        const upper = merged(floorWalls(f, ug, f.z + WALL_H, f.z + HALL_H, nearTrack))
        if (upper) pieces.push({ z: f.z, hall: f.z, geo: upper, mat: mats.upper })
        const roof = floorGeo(f.p, f.z + HALL_H)
        pieces.push({ z: f.z, hall: f.z, geo: roof, mat: mats.ceiling })
      }
      for (const fr of platformFrames(st)) {
        const lights: THREE.BufferGeometry[] = []
        const ceil: THREE.BufferGeometry[] = []
        // Over the track, out to the far wall.
        const over = new THREE.PlaneGeometry(fr.half * 2, 4.0).rotateX(Math.PI / 2)
        over.rotateY(-Math.atan2(fr.uy, fr.ux))
        over.translate(fr.mx, fr.z + HALL_H, fr.my)
        ceil.push(over)
        const lx = fr.mx + fr.nx * (fr.edge + fr.width * 0.45)
        const ly = fr.my + fr.ny * (fr.edge + fr.width * 0.45)
        for (let a = -fr.half + 4; a < fr.half - 4; a += 6) {
          const g = new THREE.BoxGeometry(3.6, 0.08, 0.35)
          g.rotateY(-Math.atan2(fr.uy, fr.ux))
          g.translate(lx + fr.ux * a, fr.z + HALL_H - 0.06, ly + fr.uy * a)
          lights.push(g)
        }
        pieces.push({ z: fr.z, hall: fr.z, geo: merged(ceil)!, mat: mats.ceiling })
        pieces.push({ z: fr.z, hall: fr.z, geo: merged(lights)!, mat: mats.lights })
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
        if (!shared) pieces.push({ z: t.z - 1.1, hall: t.z, geo: wallBox(fx - ux * len * 0.5, fy - uy * len * 0.5, fx + ux * len * 0.5, fy + uy * len * 0.5, t.z + WALL_H, t.z + HALL_H), mat: mats.upper })
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

/** What the trains run on: the timetable (null: approximate schedules
 *  only) and how far the game clock is from the real one (?time=). */
export interface TrainClock {
  timetable: Timetable | null
  offset: number
}

const LEAF = new THREE.Color('#aab3bd')
const DOORWAY = new THREE.Color('#262b31')

/** Trains: cars come in, wait with doors open, and leave, at the times in
 *  the timetable (src/game/trains.ts). */
function Trains({ station, show, focus, clock }: { station: Station; show: boolean; focus: React.RefObject<Focus>; clock: TrainClock }) {
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
        door: new THREE.MeshLambertMaterial({ color: '#ffffff', clippingPlanes: c }),
      })),
    [clips, bodyMat, stripeMat, winMat],
  )
  // Doors on the platform side, lined up with the openings in the screen
  // doors: two leaves each, that slide apart while the train stands.
  const doors = useMemo(
    () =>
      platformFrames(station).map((f) => {
        const t = station.tracks[f.i]
        // Along the train (its local x) and which side the platform is on
        // (its local z), from the track's direction and the platform's.
        const along = Math.sign(f.ux * t.dx + f.uy * t.dy) || 1
        const side = Math.sign(f.nx * -t.dy + f.ny * t.dx) || 1
        return { at: doorOpenings(t.half).map((a) => a * along), side, open: -1 }
      }),
    [station],
  )
  const doorGeo = useMemo(() => new THREE.BoxGeometry(0.66, 1.95, 0.06), [])
  useEffect(() => () => doorGeo.dispose(), [doorGeo])
  const doorMeshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const dm = useMemo(() => new THREE.Matrix4(), [])
  useEffect(() => () => mats.forEach((m) => Object.values(m).forEach((x) => x.dispose())), [mats])

  useFrame(() => {
    // Tokyo time (shifted by ?time=), so every player sees the same trains.
    const { day, sec } = tokyoNow(Date.now() + clock.offset)
    station.tracks.forEach((t, i) => {
      const g = groups.current[i]
      if (!g) return
      // The train due at this platform: it comes in over ARRIVE seconds
      // before its arrival time, stands with its doors open until its
      // departure time, then pulls out over LEAVE seconds.
      const ARRIVE = 14
      const LEAVE = 14
      const list = departures(clock.timetable, station, i, day)
      const d = list.find((x) => x.arr - ARRIVE <= sec && sec <= x.dep + LEAVE)
      const len = Math.hypot(t.bx - t.ax, t.by - t.ay)
      let s: number | null = null // where the train's middle is, from the platform middle
      if (d) {
        if (sec < d.arr) s = -((1 - (sec - (d.arr - ARRIVE)) / ARRIVE) ** 2) * (len + 40)
        else if (sec <= d.dep) s = 0
        else s = ((sec - d.dep) / LEAVE) ** 2 * (len + 40)
      }
      g.visible = show && s != null && t.z <= (focus.current.z ?? 0) + 1.2
      if (s == null) return
      const mx = (t.ax + t.bx) / 2
      const my = (t.ay + t.by) / 2
      g.position.set(mx + t.dx * s, t.z - 1.0, my + t.dy * s)
      g.rotation.y = -Math.atan2(t.dy, t.dx)
      // Doors: open from a second after it stops until 3 seconds before
      // it leaves, sliding over a second.
      const dd = doors[i]
      const im = doorMeshes.current[i]
      if (!dd || !im || !d) return
      const open = Math.max(0, Math.min(1, Math.min(sec - d.arr - 1, d.dep - 3 - sec)))
      if (Math.abs(open - dd.open) < 0.01) return
      dd.open = open
      dd.at.forEach((a, k) => {
        for (const [j, sgn] of [
          [0, -1],
          [1, 1],
        ] as const) {
          dm.makeTranslation(a + sgn * (0.33 + open * 0.62), 1.0 + 1.1, dd.side * 1.445)
          im.setMatrixAt(k * 3 + j, dm)
        }
        // The dark doorway behind the leaves.
        dm.makeScale(2, 1, 1).setPosition(a, 1.0 + 1.1, dd.side * 1.425)
        im.setMatrixAt(k * 3 + 2, dm)
        if (dd.open === open && !im.userData.painted) {
          im.setColorAt(k * 3, LEAF)
          im.setColorAt(k * 3 + 1, LEAF)
          im.setColorAt(k * 3 + 2, DOORWAY)
        }
      })
      if (!im.userData.painted && im.instanceColor) (im.userData.painted = true), (im.instanceColor.needsUpdate = true)
      im.instanceMatrix.needsUpdate = true
    })
  })

  return (
    <>
      {station.tracks.map((t, i) => {
        const cars = Math.max(1, Math.round((t.half * 2) / 16))
        const carLen = (t.half * 2) / cars
        return (
          <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
            {doors[i] && <instancedMesh ref={(el) => void (doorMeshes.current[i] = el)} args={[doorGeo, mats[i].door, doors[i].at.length * 3]} frustumCulled={false} />}
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
 *  so they read from above; down on a platform they hang straight. */
function Signs({ station }: { station: Station }) {
  const items = useMemo(
    () =>
      station.signs
        .filter((s) => s.k !== 'board' && !s.wall)
        .map((s) => {
          const tex = signTexture(s)
          return { s, tex, mat: new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }) }
        }),
    [station],
  )
  useEffect(() => () => items.forEach((i) => (i.tex.dispose(), i.mat.dispose())), [items])
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    const lean = -0.55 * (1 - platformView.amount)
    root.current?.children.forEach((c) => c.rotation.set(lean, view.yaw, 0, 'YXZ'))
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

/** Dark text or light text on a line's color. */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? '#1b1b1b' : '#ffffff'
}

/** A station name board (駅名標): the station number, the name in kanji,
 *  kana and English, and a band in the line's color with the previous
 *  and next stations, the next one on the side its trains go. */
function nameBoardTexture(s: StationSign) {
  const W = 1024
  const H = 320
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const nm = s.name!
  ctx.fillStyle = '#fbfbf8'
  ctx.fillRect(0, 0, W, H)
  // Station number: the line letter over the number, in a rounded square
  // ringed in the line's color.
  const bx = 34
  const by = 34
  const bs = 150
  ctx.fillStyle = s.c
  ctx.beginPath()
  ctx.roundRect(bx, by, bs, bs, 26)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(bx + 16, by + 16, bs - 32, bs - 32, 14)
  ctx.fill()
  ctx.fillStyle = '#1b1b1b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 38px ${FONT}`
  ctx.fillText(nm.here.ref[0], bx + bs / 2, by + 50)
  ctx.font = `800 56px ${FONT}`
  ctx.fillText(nm.here.ref.slice(1), bx + bs / 2, by + 102)
  // The name.
  const cx = W / 2 + 60
  ctx.fillStyle = '#3a3a3a'
  ctx.font = `600 34px ${FONT}`
  if (nm.here.kana) ctx.fillText(nm.here.kana, cx, 44)
  ctx.fillStyle = '#111111'
  ctx.font = `800 112px ${FONT}`
  ctx.fillText(nm.here.ja, cx, 124, 620)
  ctx.fillStyle = '#2b2b2b'
  ctx.font = `600 38px ${FONT}`
  ctx.fillText(nm.here.en, cx, 200)
  // The band: previous on one side, next on the other.
  const top = 230
  ctx.fillStyle = s.c
  ctx.fillRect(0, top, W, H - top)
  const ink = inkOn(s.c)
  const side = (st: NonNullable<typeof nm.next>, label: string, onRight: boolean) => {
    const y = top + (H - top) / 2
    ctx.fillStyle = ink
    ctx.textBaseline = 'middle'
    ctx.textAlign = onRight ? 'right' : 'left'
    const edge = onRight ? W - 28 : 28
    const dir = onRight ? -1 : 1
    // The arrow, at the outer edge.
    ctx.beginPath()
    const ax = edge
    ctx.moveTo(ax, y)
    ctx.lineTo(ax + dir * 34, y - 26)
    ctx.lineTo(ax + dir * 34, y + 26)
    ctx.closePath()
    ctx.fill()
    let x = edge + dir * 50
    ctx.font = `700 26px ${FONT}`
    // 次 or 前, in a small box.
    const lw = 40
    ctx.strokeStyle = ink
    ctx.lineWidth = 3
    ctx.strokeRect(onRight ? x - lw : x, y - 20, lw, 40)
    ctx.textAlign = 'center'
    ctx.fillText(label, onRight ? x - lw / 2 : x + lw / 2, y + 1)
    x += dir * (lw + 14)
    ctx.textAlign = onRight ? 'right' : 'left'
    ctx.font = `700 30px ${FONT}`
    ctx.fillText(st.ref, x, y)
    x += dir * (ctx.measureText(st.ref).width + 14)
    // The name, with its English under it.
    ctx.font = `800 36px ${FONT}`
    ctx.fillText(st.ja, x, y - 12)
    ctx.font = `600 20px ${FONT}`
    ctx.fillText(st.en, x, y + 23)
  }
  if (nm.next) side(nm.next, '次', nm.right)
  if (nm.prev) side(nm.prev, '前', !nm.right)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Name boards on the wall across the tracks, facing the platform. Low on
 *  the wall when you look from above, at eye height on the platform. */
function NameBoards({ station }: { station: Station }) {
  const items = useMemo(
    () =>
      station.signs
        .filter((s) => s.wall && s.name)
        .map((s) => {
          const tex = nameBoardTexture(s)
          return { s, tex, mat: new THREE.MeshBasicMaterial({ map: tex }) }
        }),
    [station],
  )
  useEffect(() => () => items.forEach((i) => (i.tex.dispose(), i.mat.dispose())), [items])
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    const k = platformView.amount
    root.current?.children.forEach((c, i) => {
      const w = items[i]?.s.wall
      if (w) c.position.y = w.z + 1.3 * (1 - k) + 2.55 * k
    })
  })
  return (
    <group ref={root}>
      {items.map(({ s, mat }, i) => (
        <group key={i} position={[s.wall!.x, s.wall!.z + 1.3, s.wall!.y]} rotation-y={s.r} userData={{ z: s.z }}>
          <mesh material={mat}>
            <planeGeometry args={[4.0, 1.25]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The words on a departure board, for the board and the sign card:
 *  先発 (the first train to leave) and 次発 (the one after), 各停 (a local
 *  train, stopping everywhere: every train on these lines is), the time
 *  and where each train is going (〜行, "bound for"). `arr`: seconds until
 *  it comes in (negative while it stands at the platform). */
export function boardRows(station: Station, platform: number, clock: TrainClock, ms: number) {
  const { day, sec } = tokyoNow(ms)
  const next = nextDepartures(clock.timetable, station, platform, day, sec, 2)
  // After the last train: 本日の運転は終了しました, and the first train
  // (始発) of the morning.
  const done = !!next[0] && next[0].dep - sec > 2 * 3600
  return (done ? next.slice(0, 1) : next).map((d, i) => ({
    label: done ? '始発' : i ? '次発' : '先発',
    kind: '各停',
    // The planned time, as real boards show it, with how late it is.
    time: clockText(d.dep - (d.late ?? 0)),
    late: Math.round((d.late ?? 0) / 60),
    to: `${d.to}行`,
    toEn: d.toEn,
    approx: !!d.approx,
    done,
    arr: Math.round(d.arr - sec),
  }))
}

/** The live word on a platform's trains, for the boards and the sign
 *  card: how late they are (約3分遅れ) and the line's status when something
 *  is wrong (運転見合わせ...). Null when all is normal or there's no live
 *  data. */
export function liveNote(station: Station, platform: number, clock: TrainClock): { ja: string; en: string } | null {
  const line = clock.timetable?.live?.lines[station.id]
  if (!line) return null
  const next = station.platforms[platform]?.next ?? ''
  const min = Math.round((line.delays[next] ?? 0) / 60)
  const bad = line.status && !/平常/.test(line.status)
  if (bad) return { ja: `${line.status}　${line.text}`, en: line.statusEn || line.textEn || `Service: ${line.status}` }
  if (min >= 1) return { ja: `ただいま 約${min}分 遅れて 運転しています`, en: `Trains are running about ${min} min late.` }
  return null
}

// LED departure board: a matrix of 16-dot-high characters, like the
// boards over Tokyo platforms. Text is drawn small, then each pixel is
// lit as one round dot.
const DOTS_W = 192
const DOTS_H = 64
const DOT = 4
const LED = {
  label: '#ff5a36',
  kind: '#35e05a',
  time: '#ffd23f',
  to: '#ff9b2f',
  en: '#9fe7ff',
  ticker: '#ffd23f',
  off: '#24160f',
}
let unlit: HTMLCanvasElement | null = null
function unlitDots() {
  if (unlit) return unlit
  unlit = document.createElement('canvas')
  unlit.width = DOTS_W * DOT
  unlit.height = DOTS_H * DOT
  const ctx = unlit.getContext('2d')!
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, unlit.width, unlit.height)
  ctx.fillStyle = LED.off
  for (let y = 0; y < DOTS_H; y++)
    for (let x = 0; x < DOTS_W; x++) {
      ctx.beginPath()
      ctx.arc(x * DOT + DOT / 2, y * DOT + DOT / 2, DOT * 0.36, 0, Math.PI * 2)
      ctx.fill()
    }
  return unlit
}

interface LedLine {
  parts: { t: string; c: string; x: number; en?: boolean }[]
  /** Scrolls right to left. */
  scroll?: boolean
}

/** What a board shows now: two trains, then a line that alternates (or
 *  scrolls) through announcements in Japanese and English. */
function ledLines(station: Station, platform: number, rows: ReturnType<typeof boardRows>, phase: number, note: { ja: string; en: string } | null): LedLine[] {
  const p = station.platforms[platform]
  const en = phase % 2 === 1
  if (rows[0]?.done) {
    const r = rows[0]
    return [
      { parts: [{ t: en ? 'No more trains' : '本日の運転は', c: LED.to, x: 4, en }] },
      { parts: [{ t: en ? 'today' : '終了しました', c: LED.to, x: 4, en }] },
      { parts: [{ t: en ? `First train ${r.time} for ${r.toEn}` : `始発 ${r.time} ${r.to}`, c: LED.ticker, x: 4, en }], scroll: true },
    ]
  }
  const train = (r: (typeof rows)[number] | undefined): LedLine => {
    if (!r) return { parts: [] }
    if (en)
      return {
        parts: [
          { t: r.label === '先発' ? '1st' : '2nd', c: LED.label, x: 2, en },
          { t: 'Local', c: LED.kind, x: 30, en },
          { t: r.time, c: LED.time, x: 74, en },
          { t: r.toEn, c: LED.to, x: 112, en },
        ],
      }
    return {
      parts: [
        { t: r.label, c: LED.label, x: 2 },
        { t: r.kind, c: LED.kind, x: 38 },
        { t: r.time, c: LED.time, x: 74 },
        { t: r.to.replace(/行$/, ''), c: LED.to, x: 114 },
      ],
    }
  }
  const first = rows[0]
  const num = p?.num ?? ''
  let ticker: string
  if (first && first.arr <= 60 && first.arr > -5)
    ticker = en ? `The train for ${first.toEn} is arriving on track ${num}.` : `まもなく ${num}番線に ${first.to}が まいります`
  else if (first && first.arr <= -5)
    ticker = en ? `The doors are closing. Please stand back.` : `${first.to} ドアが閉まります ご注意ください`
  else if (note) ticker = en ? note.en : note.ja
  else ticker = en ? `Track ${num}: trains ${p?.en ?? ''}` : `${num}番線 ${p?.ja ?? ''}`
  return [train(rows[0]), train(rows[1]), { parts: [{ t: ticker, c: LED.ticker, x: 2, en }], scroll: true }]
}

const ledSmall = typeof document !== 'undefined' ? document.createElement('canvas') : null
/** Draws the lines as lit dots onto a board's canvas. `t`: seconds, for
 *  the scrolling line. */
function drawLed(ctx: CanvasRenderingContext2D, lines: LedLine[], t: number) {
  const small = ledSmall!
  small.width = DOTS_W
  small.height = DOTS_H
  const sc = small.getContext('2d', { willReadFrequently: true })!
  sc.fillStyle = '#000'
  sc.fillRect(0, 0, DOTS_W, DOTS_H)
  sc.textBaseline = 'top'
  lines.forEach((ln, i) => {
    const y = 1 + i * 21
    for (const part of ln.parts) {
      sc.font = part.en ? `700 13px ${FONT}` : `700 15px ${FONT}`
      sc.fillStyle = part.c
      let x = part.x
      if (ln.scroll) {
        const w = sc.measureText(part.t).width
        if (w > DOTS_W - 4) x = DOTS_W - (((t * 24) % (w + DOTS_W)) | 0)
      }
      sc.fillText(part.t, x, y + (part.en ? 2 : 0))
    }
  })
  const img = sc.getImageData(0, 0, DOTS_W, DOTS_H).data
  ctx.drawImage(unlitDots(), 0, 0)
  for (let y = 0; y < DOTS_H; y++)
    for (let x = 0; x < DOTS_W; x++) {
      const k = (y * DOTS_W + x) * 4
      const m = Math.max(img[k], img[k + 1], img[k + 2])
      if (m < 100) continue
      // Full brightness in the text's own color.
      const f = 255 / m
      ctx.fillStyle = `rgb(${Math.min(255, img[k] * f) | 0},${Math.min(255, img[k + 1] * f) | 0},${Math.min(255, img[k + 2] * f) | 0})`
      ctx.beginPath()
      ctx.arc(x * DOT + DOT / 2, y * DOT + DOT / 2, DOT * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
}

/** Departure boards over the platforms: an LED board with the next two
 *  trains and an announcement line. They turn to face you from above, and
 *  hang square across the platform when you're on it. */
function DepartureBoards({ station, clock }: { station: Station; clock: TrainClock }) {
  const frames = useMemo(() => platformFrames(station), [station])
  const boards = useMemo(
    () =>
      station.signs
        .filter((s) => s.k === 'board')
        .map((s) => {
          const canvas = document.createElement('canvas')
          canvas.width = DOTS_W * DOT
          canvas.height = DOTS_H * DOT
          const tex = new THREE.CanvasTexture(canvas)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 8
          // Across the platform: the track's direction, either way.
          const f = frames.find((x) => x.i === (s.p ?? 0))
          const across = f ? Math.atan2(f.ux, f.uy) : 0
          return { s, canvas, tex, across, mat: new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), shown: '' }
        }),
    [station, frames],
  )
  useEffect(() => () => boards.forEach((b) => (b.tex.dispose(), b.mat.dispose())), [boards])
  const root = useRef<THREE.Group>(null)
  const last = useRef(0)
  useFrame(() => {
    const k = platformView.amount
    root.current?.children.forEach((c, i) => {
      const b = boards[i]
      let yaw = view.yaw
      if (k > 0.5 && b) {
        // Square across the platform, the face toward the camera.
        const d = Math.atan2(Math.sin(b.across - view.yaw), Math.cos(b.across - view.yaw))
        yaw = Math.abs(d) < Math.PI / 2 ? b.across : b.across + Math.PI
      }
      c.rotation.set(-0.55 * (1 - k), yaw, 0, 'YXZ')
    })
    const now = Date.now() + clock.offset
    // The scrolling line moves about 8 times a second, but only while
    // you're down on the platforms; otherwise once a second.
    if (now - last.current < (platformView.on ? 120 : 1000)) return
    last.current = now
    const t = now / 1000
    for (const b of boards) {
      const rows = boardRows(station, b.s.p ?? 0, clock, now)
      // Japanese and English take turns, 6 seconds each.
      const lines = ledLines(station, b.s.p ?? 0, rows, Math.floor(t / 6), liveNote(station, b.s.p ?? 0, clock))
      const scrolling = platformView.on && lines.some((l) => l.scroll)
      const key = JSON.stringify(lines) + (scrolling ? Math.floor(t * 8) : '')
      if (key === b.shown) continue
      b.shown = key
      drawLed(b.canvas.getContext('2d')!, lines, t)
      b.tex.needsUpdate = true
    }
  })
  return (
    <group ref={root}>
      {boards.map(({ s, mat }, i) => (
        <group key={i} position={[s.x, s.z + 3.0, s.y]} userData={{ z: s.z }}>
          <mesh material={mat}>
            <planeGeometry args={[3.3, 1.1]} />
          </mesh>
          {/* The board's case and the rods it hangs from. */}
          <mesh position={[0, 0, -0.09]}>
            <boxGeometry args={[3.5, 1.28, 0.16]} />
            <meshLambertMaterial color="#2a2d33" />
          </mesh>
          {[-1.2, 1.2].map((x) => (
            <mesh key={x} position={[x, 1.0, -0.09]}>
              <boxGeometry args={[0.05, 0.8, 0.05]} />
              <meshLambertMaterial color="#5b6068" />
            </mesh>
          ))}
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
export function Stations({ ug, focus, under, clock, riders }: { ug: Underground; focus: React.RefObject<Focus>; under: boolean; clock: TrainClock; riders?: RiderSource | null }) {
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
    const hall = platformView.amount > 0.05
    pieces.forEach((p, i) => {
      const m = meshes.current[i]
      if (m) m.visible = under && (p.hall != null ? hall && Math.abs(p.hall - z) < 0.6 : p.z <= z + 1.2)
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
        {ug.stations.map((s) => (
          <DepartureBoards key={s.id} station={s} clock={clock} />
        ))}
        {ug.stations.map((s) => (
          <NameBoards key={s.id} station={s} />
        ))}
      </group>
      {ug.stations.map((s) => (
        <Trains key={s.id} station={s} show={under} focus={focus} clock={clock} />
      ))}
      {riders &&
        ug.stations.map((s) => <Riders key={s.id} station={s} src={riders} timetable={clock.timetable} offset={clock.offset} focus={focus} show={under} />)}
      {!under && <ExitHoods stations={ug.stations} />}
      {under && <ambientLight intensity={0.6} color="#f4f6ff" />}
    </>
  )
}

