import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'

// The diorama look for hand-made models (landmarks, stations, shop
// interiors): every lit material is repainted once in the soft, warm toy
// palette, lifted toward warm white and made matte like painted clay.
// Signs and pictures (unlit, textured) keep their colors.

const WARM_SRGB = new THREE.Color().setRGB(1, 0.957, 0.902) // #fff4e6, not converted

/** A color lifted toward warm white, mixed the way a painter would (in
 *  sRGB), so dark navies stay blue instead of turning grey-brown. */
export function toyLift(c: THREE.Color, k: number) {
  return c.convertLinearToSRGB().lerp(WARM_SRGB, k).convertSRGBToLinear()
}

function toyMaterial(m: THREE.Material, lift: number) {
  if (m.userData.toy) return
  m.userData.toy = true
  if ((m as THREE.ShaderMaterial).isShaderMaterial) return
  const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial
  const c = (m as THREE.MeshStandardMaterial).color as THREE.Color | undefined
  if (!c) return
  if (basic && (m as THREE.MeshBasicMaterial).map) return
  toyLift(c, basic ? lift * 0.5 : lift)
  const std = m as THREE.MeshStandardMaterial
  if (std.isMeshStandardMaterial) {
    std.roughness = Math.max(std.roughness, 0.55)
    std.metalness = Math.min(std.metalness, 0.2)
  }
}

/** Repaints whatever it wraps in the toy palette, including parts added later. */
export function Toy({ children, lift = 0.16 }: { children: ReactNode; lift?: number }) {
  const group = useRef<THREE.Group>(null)
  const frame = useRef(0)
  useFrame(() => {
    // Models build over a few frames (and rooms load later), so look again
    // now and then; repainted materials are skipped.
    if (frame.current++ % 30 !== 0 || !group.current) return
    group.current.traverse((o) => {
      const mat = (o as THREE.Mesh).material
      if (!mat) return
      for (const m of Array.isArray(mat) ? mat : [mat]) toyMaterial(m, lift)
    })
  })
  return <group ref={group}>{children}</group>
}
