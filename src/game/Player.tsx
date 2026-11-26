import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { AvatarFigure, emptyRig, type AvatarRig } from './AvatarFigure'
import type { Avatar } from './avatar'
import * as THREE from 'three'
import { autopilot, input, platformView, view } from './input'
import { circleBlocked, groundAt, isBlocked, type GameMap } from './map'
import type { Underground } from './station'
import type { Focus } from './World'

const WALK_SPEED = 4.5 // m/s
const RUN_SPEED = 9
const RADIUS = 0.3
const CAMERA_PITCH = (54 * Math.PI) / 180
/** On a platform: a low camera, at about eye height over the player's
 *  shoulder, looking a little down. */
const PLATFORM_PITCH = (14 * Math.PI) / 180
const PLATFORM_EYE = 2.1
/** The usual long lens from above (it flattens the city into a diorama),
 *  and a wider one on the platform. */
const FOV = 24
const PLATFORM_FOV = 62
/** How much further back the long lens sits than the old 38° one, to frame the same view. */
export const LENS = Math.tan((38 / 2) * (Math.PI / 180)) / Math.tan((FOV / 2) * (Math.PI / 180))

interface Props {
  /** How the player looks (made in the character creator). */
  avatar: Avatar
  map: GameMap
  /** The map's stations, for walking down into them. */
  ug: Underground | null
  focus: React.RefObject<Focus>
  /** Camera distance from the player, in meters. */
  distance: number
  /** Called when the player has moved at least a meter since the last call. */
  onMove: (x: number, y: number, under: boolean) => void
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Free movement with sliding collisions, a small 3D walker, and a camera
 *  that follows from behind and above. */
export function Player({ avatar, map, ug, focus, distance, onMove }: Props) {
  const root = useRef<THREE.Group>(null)
  const rig = useRef<AvatarRig>(emptyRig())
  const s = useRef({ heading: autopilot.heading ?? 0, phase: 0, speed: 0, ground: 0, lastX: focus.current.x, lastY: focus.current.y, lastUnder: false, stuck: 0 })
  const camera = useThree((st) => st.camera)
  const placed = useRef(false)
  const onPlatform = useRef<string | null>(null)

  /** One step: on the street, or underground once you've gone down an
   *  exit's stairs. */
  const tryMove = (nx: number, ny: number) => {
    const f = focus.current
    if (ug) ug.street = (x, y) => (isBlocked(map, x, y) ? null : groundAt(map, x, y))
    if (f.under && ug) {
      const at = ug.standCircle(nx, ny, f.z ?? 0, RADIUS)
      if (!at) return
      f.x = nx
      f.y = ny
      f.z = at.z
      if (at.street) f.under = false
      return
    }
    if (circleBlocked(map, nx, ny, RADIUS)) return
    const g = groundAt(map, nx, ny)
    if (ug) {
      const z = ug.exitStairsAt(nx, ny, g)
      if (z != null && ug.standCircle(nx, ny, z, RADIUS)) {
        f.x = nx
        f.y = ny
        f.z = z
        f.under = true
        return
      }
      if (ug.overStairwell(nx, ny, g)) return
    }
    f.x = nx
    f.y = ny
    f.z = g
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = s.current
    const f = focus.current
    let [ix, iy] = input.vector()
    // Walking on its own (the arrival scene): toward the next point.
    const auto = autopilot.path[0]
    if (auto) {
      const dx = auto[0] - f.x
      const dy = auto[1] - f.y
      const d = Math.hypot(dx, dy)
      st.stuck += dt
      if (d < 0.35 || st.stuck > 4) {
        autopilot.path.shift()
        st.stuck = 0
        if (!autopilot.path.length) autopilot.done?.()
        ix = iy = 0
      } else {
        ix = dx / d
        iy = dy / d
      }
    }
    const target = ix || iy ? (input.running() && !auto ? RUN_SPEED : auto ? WALK_SPEED * 0.75 : WALK_SPEED) : 0
    st.speed = damp(st.speed, target, 14, dt)

    if (ix || iy) {
      // Turn smoothly toward the input direction.
      const want = Math.atan2(ix, iy)
      let diff = want - st.heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      st.heading += diff * (1 - Math.exp(-18 * dt))
      const step = st.speed * dt
      // Move each axis on its own so the player slides along walls.
      tryMove(f.x + ix * step, f.y)
      tryMove(f.x, f.y + iy * step)
    }

    // Walk cycle.
    const moving = st.speed > 0.3
    st.phase += dt * st.speed * 2.4
    const swing = moving ? Math.sin(st.phase) * Math.min(1, st.speed / WALK_SPEED) * 0.7 : 0
    const r = rig.current
    if (r.legL) r.legL.rotation.x = swing
    if (r.legR) r.legR.rotation.x = -swing
    if (r.armL) r.armL.rotation.x = -swing * 0.8
    if (r.armR) r.armR.rotation.x = swing * 0.8
    if (r.body) r.body.position.y = moving ? Math.abs(Math.cos(st.phase)) * 0.05 : 0

    // Follow the ground smoothly up and down slopes.
    const gh = f.under ? (f.z ?? 0) : groundAt(map, f.x, f.y)
    st.ground = placed.current ? damp(st.ground, gh, 20, dt) : gh
    if (root.current) {
      root.current.position.set(f.x, st.ground, f.y)
      root.current.rotation.y = st.heading
    }

    // On a station platform, the camera comes down to eye level and, when
    // you step onto the platform, turns to look along it.
    const plat = f.under && ug ? ug.platformAt(f.x, f.y, f.z ?? 0) : null
    const key = plat ? `${plat.station.id}:${plat.frame.i}` : null
    if (key !== onPlatform.current) {
      onPlatform.current = key
      if (plat) {
        // Of the two ways along the track, the one nearer where you look.
        const a = Math.atan2(-plat.frame.ux, -plat.frame.uy)
        const turns = [a, a + Math.PI].map((t) => view.yaw + Math.atan2(Math.sin(t - view.yaw), Math.cos(t - view.yaw)))
        view.target = Math.abs(turns[0] - view.yaw) < Math.abs(turns[1] - view.yaw) ? turns[0] : turns[1]
      }
    }
    platformView.on = !!plat
    platformView.amount = placed.current ? damp(platformView.amount, plat ? 1 : 0, 4, dt) : plat ? 1 : 0
    const k = platformView.amount
    const cam = camera as THREE.PerspectiveCamera
    const fov = FOV + (PLATFORM_FOV - FOV) * k
    const near = 0.5 - 0.3 * k
    if (Math.abs(cam.fov - fov) > 0.05 || Math.abs(cam.near - near) > 0.01) {
      cam.fov = fov
      cam.near = near
      cam.updateProjectionMatrix()
    }

    // Camera: behind and above the player, turned by the view's yaw.
    view.yaw = placed.current ? damp(view.yaw, view.target, 7, dt) : view.target
    let low = Math.min(9, Math.max(4.5, distance * 0.3))
    // Don't back through the wall: stay over the platform.
    if (plat && ug) {
      for (let d = 1.5; d <= low; d += 0.5) {
        if (!ug.inHall(f.x + Math.sin(view.yaw) * d, f.y + Math.cos(view.yaw) * d, f.z ?? 0)) {
          low = Math.max(1.5, d - 0.6)
          break
        }
      }
    }
    const pitch = CAMERA_PITCH + (PLATFORM_PITCH - CAMERA_PITCH) * k
    // The long lens sits further back to frame the same "distance".
    const dist = distance * LENS + (low - distance * LENS) * k
    const back = Math.cos(pitch) * dist
    // Close in, a little higher, to see over the player's head.
    const rise = Math.sin(pitch) * dist * (1 - k) + (PLATFORM_EYE + Math.max(0, 4 - low) * 0.2) * k
    const cx = f.x + Math.sin(view.yaw) * back
    const cy = st.ground + rise
    const cz = f.y + Math.cos(view.yaw) * back
    if (!placed.current) {
      camera.position.set(cx, cy, cz)
      placed.current = true
    } else {
      camera.position.x = damp(camera.position.x, cx, 8, dt)
      camera.position.y = damp(camera.position.y, cy, 8, dt)
      camera.position.z = damp(camera.position.z, cz, 8, dt)
    }
    // Look at the player's chest from above; on a platform, ahead along it
    // at about head height, so the boards and signs are in view.
    const lookY = 0.8 * (1 - k) + 1.5 * k
    const ahead = back + 8 * k
    camera.lookAt(camera.position.x - Math.sin(view.yaw) * ahead, cy - rise + lookY + (camera.position.y - cy), camera.position.z - Math.cos(view.yaw) * ahead)

    if (Math.hypot(f.x - st.lastX, f.y - st.lastY) > 1 || st.lastUnder !== !!f.under) {
      st.lastX = f.x
      st.lastY = f.y
      st.lastUnder = !!f.under
      onMove(f.x, f.y, !!f.under)
    }
  })

  return (
    <group ref={root}>
      {/* soft blob shadow so the player reads even in building shade */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <AvatarFigure avatar={avatar} rig={rig} />
    </group>
  )
}
