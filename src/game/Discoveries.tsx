import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { groundAt, type Discovery, type GameMap } from './map'

const HOVER = 2.8

/** Floating markers over discoveries: small gold gems for places, red stamp
 *  seals for the stamp rally (green once collected). */
export function Discoveries({ map, found, stamps }: { map: GameMap; found: Set<string>; stamps: Set<string> }) {
  const list = useMemo(() => map.discoveries ?? [], [map])
  const places = useMemo(() => list.filter((d) => !d.stamp), [list])
  const rally = useMemo(() => list.filter((d) => d.stamp), [list])
  return (
    <>
      <Markers map={map} items={places} kind="gem" done={found} />
      <Markers map={map} items={rally} kind="stamp" done={stamps} />
    </>
  )
}

function Markers({
  map,
  items,
  kind,
  done,
}: {
  map: GameMap
  items: Discovery[]
  kind: 'gem' | 'stamp'
  done: Set<string>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(
    () =>
      kind === 'gem'
        ? new THREE.OctahedronGeometry(0.35, 0).scale(1, 1.5, 1)
        : new THREE.CylinderGeometry(0.6, 0.6, 0.16, 28).rotateX(Math.PI / 2),
    [kind],
  )
  const bases = useMemo(() => items.map((d) => groundAt(map, d.x, d.y) + HOVER), [map, items])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const s = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useLayoutEffect(() => {
    const c = new THREE.Color()
    items.forEach((d, i) => {
      const got = done.has(d.id)
      if (kind === 'gem') c.set(got ? '#9aa7b8' : '#ffc94d')
      else c.set(got ? '#3fae6a' : '#e0393e')
      mesh.current?.setColorAt(i, c)
    })
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [items, done, kind])

  useFrame((state) => {
    const im = mesh.current
    if (!im) return
    const t = state.clock.elapsedTime
    items.forEach((d, i) => {
      q.setFromAxisAngle(up, t * 1.2 + i)
      p.set(d.x, bases[i] + Math.sin(t * 2 + i) * 0.15, d.y)
      m.compose(p, q, s)
      im.setMatrixAt(i, m)
    })
    im.instanceMatrix.needsUpdate = true
  })

  useLayoutEffect(() => () => geo.dispose(), [geo])
  if (!items.length) return null
  return (
    <instancedMesh ref={mesh} args={[geo, undefined, items.length]} frustumCulled={false} castShadow>
      <meshLambertMaterial emissive={kind === 'gem' ? '#5a3d00' : '#3a0505'} />
    </instancedMesh>
  )
}
