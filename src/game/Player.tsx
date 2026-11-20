import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { input } from './input'
import { circleBlocked, type GameMap } from './map'
import type { Focus } from './World'

const WALK_SPEED = 4.5 // m/s
const RUN_SPEED = 9
const RADIUS = 0.3
const CAMERA_PITCH = (58 * Math.PI) / 180

interface Props {
  map: GameMap
  focus: React.RefObject<Focus>
  /** Camera distance from the player, in meters. */
  distance: number
  /** Called when the player has moved at least a meter since the last call. */
  onMove: (x: number, y: number) => void
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Free movement with sliding collisions, a small 3D walker, and a camera
 *  that follows from behind and above. */
export function Player({ map, focus, distance, onMove }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const s = useRef({ heading: 0, phase: 0, speed: 0, lastX: focus.current.x, lastY: focus.current.y })
  const camera = useThree((st) => st.camera)
  const placed = useRef(false)

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
      const nx = f.x + ix * step
      if (!circleBlocked(map, nx, f.y, RADIUS)) f.x = nx
      const ny = f.y + iy * step
      if (!circleBlocked(map, f.x, ny, RADIUS)) f.y = ny
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

    if (root.current) {
      root.current.position.set(f.x, 0, f.y)
      root.current.rotation.y = st.heading
    }

    // Camera: behind (south of) and above the player, looking at them.
    const cx = f.x
    const cy = Math.sin(CAMERA_PITCH) * distance
    const cz = f.y + Math.cos(CAMERA_PITCH) * distance
    if (!placed.current) {
      camera.position.set(cx, cy, cz)
      placed.current = true
    } else {
      camera.position.x = damp(camera.position.x, cx, 8, dt)
      camera.position.y = damp(camera.position.y, cy, 8, dt)
      camera.position.z = damp(camera.position.z, cz, 8, dt)
    }
    camera.lookAt(camera.position.x, 0.8, camera.position.z - Math.cos(CAMERA_PITCH) * distance)

    if (Math.hypot(f.x - st.lastX, f.y - st.lastY) > 1) {
      st.lastX = f.x
      st.lastY = f.y
      onMove(f.x, f.y)
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
