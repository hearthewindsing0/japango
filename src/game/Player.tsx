import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { input, view } from './input'
import { circleBlocked, groundAt, isBlocked, type GameMap } from './map'
import type { Underground } from './station'
import type { Focus } from './World'

const WALK_SPEED = 4.5 // m/s
const RUN_SPEED = 9
const RADIUS = 0.3
const CAMERA_PITCH = (63 * Math.PI) / 180

interface Props {
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
export function Player({ map, ug, focus, distance, onMove }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const s = useRef({ heading: 0, phase: 0, speed: 0, ground: 0, lastX: focus.current.x, lastY: focus.current.y, lastUnder: false })
  const camera = useThree((st) => st.camera)
  const placed = useRef(false)

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
    const [ix, iy] = input.vector()
    const target = ix || iy ? (input.running() ? RUN_SPEED : WALK_SPEED) : 0
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
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    if (body.current) body.current.position.y = moving ? Math.abs(Math.cos(st.phase)) * 0.05 : 0

    // Follow the ground smoothly up and down slopes.
    const gh = f.under ? (f.z ?? 0) : groundAt(map, f.x, f.y)
    st.ground = placed.current ? damp(st.ground, gh, 20, dt) : gh
    if (root.current) {
      root.current.position.set(f.x, st.ground, f.y)
      root.current.rotation.y = st.heading
    }

    // Camera: behind and above the player, turned by the view's yaw.
    view.yaw = placed.current ? damp(view.yaw, view.target, 7, dt) : view.target
    const back = Math.cos(CAMERA_PITCH) * distance
    const cx = f.x + Math.sin(view.yaw) * back
    const cy = st.ground + Math.sin(CAMERA_PITCH) * distance
    const cz = f.y + Math.cos(view.yaw) * back
    if (!placed.current) {
      camera.position.set(cx, cy, cz)
      placed.current = true
    } else {
      camera.position.x = damp(camera.position.x, cx, 8, dt)
      camera.position.y = damp(camera.position.y, cy, 8, dt)
      camera.position.z = damp(camera.position.z, cz, 8, dt)
    }
    camera.lookAt(
      camera.position.x - Math.sin(view.yaw) * back,
      camera.position.y - Math.sin(CAMERA_PITCH) * distance + 0.8,
      camera.position.z - Math.cos(view.yaw) * back,
    )

    if (Math.hypot(f.x - st.lastX, f.y - st.lastY) > 1 || st.lastUnder !== !!f.under) {
      st.lastX = f.x
      st.lastY = f.y
      st.lastUnder = !!f.under
      onMove(f.x, f.y, !!f.under)
    }
  })

  const skin = '#f2c9a0'
  return (
    <group ref={root}>
      {/* soft blob shadow so the player reads even in building shade */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {/* legs pivot at the hip */}
        <group ref={legL} position={[-0.11, 0.78, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.6, 4, 8]} />
            <meshLambertMaterial color="#2b3445" />
          </mesh>
        </group>
        <group ref={legR} position={[0.11, 0.78, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.6, 4, 8]} />
            <meshLambertMaterial color="#2b3445" />
          </mesh>
        </group>
        {/* torso */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.42, 4, 12]} />
          <meshLambertMaterial color="#e5484d" />
        </mesh>
        {/* backpack */}
        <mesh position={[0, 1.15, -0.2]} castShadow>
          <boxGeometry args={[0.32, 0.4, 0.14]} />
          <meshLambertMaterial color="#f0b429" />
        </mesh>
        {/* arms pivot at the shoulder */}
        <group ref={armL} position={[-0.27, 1.32, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.42, 4, 8]} />
            <meshLambertMaterial color="#e5484d" />
          </mesh>
        </group>
        <group ref={armR} position={[0.27, 1.32, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.42, 4, 8]} />
            <meshLambertMaterial color="#e5484d" />
          </mesh>
        </group>
        {/* head */}
        <mesh position={[0, 1.62, 0]} castShadow>
          <sphereGeometry args={[0.2, 20, 16]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        {/* hair */}
        <mesh position={[0, 1.66, -0.02]} scale={[1.05, 0.9, 1.08]}>
          <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color="#2a211c" />
        </mesh>
        {/* eyes, on the +Z side, which is "forward" */}
        <mesh position={[-0.07, 1.63, 0.18]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[0.07, 1.63, 0.18]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color="#1b1b1b" />
        </mesh>
      </group>
    </group>
  )
}
