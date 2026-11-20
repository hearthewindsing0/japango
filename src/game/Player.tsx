import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { DELTA, input, type Dir } from './input'
import { isBlocked, type GameMap } from './map'

const WALK_TILES_PER_SEC = 4
const RUN_TILES_PER_SEC = 8

export interface PlayerState {
  x: number
  y: number
  facing: Dir
}

interface Props {
  map: GameMap
  start: { x: number; y: number }
  /** Called each time the player arrives on a new tile. */
  onStep: (s: PlayerState) => void
}

const FACING_ANGLE: Record<Dir, number> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 }

// Classic grid movement: the player is always either standing on a tile or
// sliding to the next one. Input is only read while standing.
export function Player({ map, start, onStep }: Props) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const nose = useRef<THREE.Group>(null)
  const state = useRef({ x: start.x, y: start.y, fromX: start.x, fromY: start.y, t: 1, facing: 'down' as Dir, bob: 0 })
  const camera = useThree((s) => s.camera)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const s = state.current
    const speed = input.running() ? RUN_TILES_PER_SEC : WALK_TILES_PER_SEC
    let moving = s.t < 1
    if (moving) {
      s.t = Math.min(1, s.t + dt * speed)
      if (s.t >= 1) onStep({ x: s.x, y: s.y, facing: s.facing })
    }
    if (s.t >= 1) {
      const d = input.dir()
      if (d) {
        s.facing = d
        const [dx, dy] = DELTA[d]
        if (!isBlocked(map, s.x + dx, s.y + dy)) {
          s.fromX = s.x
          s.fromY = s.y
          s.x += dx
          s.y += dy
          s.t = 0
          moving = true
        }
      }
    }
    const px = s.fromX + (s.x - s.fromX) * s.t + 0.5
    const py = -(s.fromY + (s.y - s.fromY) * s.t) - 0.5
    s.bob = moving ? s.bob + dt * speed * Math.PI : 0
    if (group.current) group.current.position.set(px, py, 1)
    if (body.current) body.current.position.y = Math.abs(Math.sin(s.bob)) * 0.08
    if (nose.current) nose.current.rotation.z = FACING_ANGLE[s.facing]
    // Camera follows the player, smoothed a little.
    camera.position.x += (px - camera.position.x) * Math.min(1, dt * 10)
    camera.position.y += (py - camera.position.y) * Math.min(1, dt * 10)
  })

  return (
    <group ref={group}>
      {/* drop shadow */}
      <mesh position={[0.06, -0.12, 0]} scale={[1, 0.6, 1]}>
        <circleGeometry args={[0.36, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
      <group ref={body}>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[0.38, 24]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[0.32, 24]} />
          <meshBasicMaterial color="#e5484d" />
        </mesh>
        <group ref={nose} position={[0, 0, 0.03]}>
          <mesh position={[0, 0.17, 0]} rotation={[0, 0, Math.PI / 2]}>
            <circleGeometry args={[0.1, 3]} />
            <meshBasicMaterial color="#fff" />
          </mesh>
        </group>
      </group>
    </group>
  )
}
