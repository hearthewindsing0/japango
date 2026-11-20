import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Focus } from './World'

const AREA = 70 // meters around the player
const TOP = 40

/** Falling rain streaks or snowflakes in a box that follows the player. */
export function Weather({ focus, rain, snow }: { focus: React.RefObject<Focus>; rain: number; snow: number }) {
  const amount = Math.max(rain, snow)
  const count = Math.round(2500 * Math.min(1.3, amount))
  const mesh = useRef<THREE.InstancedMesh>(null)
  const isSnow = snow > 0
  const geo = useMemo(
    () => (isSnow ? new THREE.IcosahedronGeometry(0.07, 0) : new THREE.BoxGeometry(0.025, 0.9, 0.025)),
    [isSnow],
  )
  useEffect(() => () => geo.dispose(), [geo])
  // Each drop: offset in the box and a speed.
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * AREA,
        y: Math.random() * TOP,
        z: Math.random() * AREA,
        v: isSnow ? 1.2 + Math.random() * 0.8 : 16 + Math.random() * 6,
        p: Math.random() * Math.PI * 2,
      })),
    [count, isSnow],
  )
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 1).normalize(), 0.12), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const p = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dtRaw) => {
    const im = mesh.current
    if (!im) return
    const dt = Math.min(dtRaw, 0.05)
    const { x, y } = focus.current
    const t = state.clock.elapsedTime
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]
      d.y -= d.v * dt
      if (d.y < 0) d.y += TOP
      // Wrap into the box around the player, so drops never run out.
      const wx = x - AREA / 2 + ((((d.x - x) % AREA) + AREA) % AREA)
      const wz = y - AREA / 2 + ((((d.z - y) % AREA) + AREA) % AREA)
      const sway = isSnow ? Math.sin(t * 0.8 + d.p) * 0.6 : 0
      p.set(wx + sway, d.y, wz)
      m.compose(p, isSnow ? new THREE.Quaternion() : q, one)
      im.setMatrixAt(i, m)
    }
    im.instanceMatrix.needsUpdate = true
  })

  if (!count) return null
  return (
    <instancedMesh key={`${count}-${isSnow}`} ref={mesh} args={[geo, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial
        color={isSnow ? '#ffffff' : '#b8c7d9'}
        transparent
        opacity={isSnow ? 0.9 : 0.45}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
