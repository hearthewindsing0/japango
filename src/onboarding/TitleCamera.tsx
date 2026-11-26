import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { groundAt, type GameMap } from '../game/map'

/** For the title screen: the camera circles slowly over the diorama around
 *  a point (the start), high up with the long lens, like a turning model. */
export function TitleCamera({ map, at, distance = 150 }: { map: GameMap; at: { x: number; y: number }; distance?: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05)
    // One turn in about four minutes, starting from the south-west.
    const a = 2.4 + t.current * ((Math.PI * 2) / 240)
    const pitch = (38 * Math.PI) / 180
    const g = groundAt(map, at.x, at.y)
    if (camera.fov !== 24) {
      camera.fov = 24
      camera.near = 0.5
      camera.updateProjectionMatrix()
    }
    camera.position.set(at.x + Math.sin(a) * Math.cos(pitch) * distance, g + Math.sin(pitch) * distance, at.y + Math.cos(a) * Math.cos(pitch) * distance)
    camera.lookAt(at.x, g + 6, at.y)
  })
  return null
}
