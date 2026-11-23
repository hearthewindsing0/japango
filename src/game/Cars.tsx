import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildNetwork, Traffic as Sim, type Network } from './traffic'
import { KINDS, vehicleGeometries, type VehicleKind } from './vehicles'
import type { GameMap, MapTile } from './map'
import type { Focus } from './World'

// Cars, taxis, vans, trucks and buses driving the streets around the player
// (see traffic.ts). Each kind is three instanced meshes sharing one set of
// instance matrices: painted body, trim, and lamps that glow.

interface KindMeshes {
  body: THREE.InstancedMesh
  trim: THREE.InstancedMesh
  lamps: THREE.InstancedMesh
  /** Slot each instance was last painted for, to repaint only on change. */
  painted: (string | null)[]
  used: number
}

const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

export function Cars({
  map,
  tiles,
  focus,
  hour,
  night,
  distance,
}: {
  map: GameMap
  tiles: MapTile[]
  focus: React.RefObject<Focus>
  hour: number
  night: number
  distance: number
}) {
  const sim = useMemo(() => new Sim(), [])
  if (import.meta.env.DEV)
    Object.assign(window, {
      traffic: sim,
      // Fast-forward the traffic, for testing: n steps of 0.1 s.
      trafficRun: (n: number) => {
        for (let i = 0; i < n; i++) sim.step(0.1, map, focus.current.x, focus.current.y, !focus.current.under, hour, 200)
      },
    })
  useEffect(() => {
    sim.setNetwork(buildNetwork(tiles, sim.net as Network | null))
  }, [sim, tiles])

  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), [])
  const trimMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), [])
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), [])
  // Lamps glow at night and are just colored glass by day.
  useEffect(() => {
    lampMat.color.setScalar(0.55 + 0.6 * night)
  }, [lampMat, night])

  const meshes = useMemo(() => {
    const out = {} as Record<VehicleKind, KindMeshes>
    for (const kind of KINDS) {
      const g = vehicleGeometries(kind)
      const body = new THREE.InstancedMesh(g.body, bodyMat, Sim.slots)
      const trim = new THREE.InstancedMesh(g.trim, trimMat, Sim.slots)
      const lamps = new THREE.InstancedMesh(g.lamps, lampMat, Sim.slots)
      // One set of matrices drives all three.
      trim.instanceMatrix = body.instanceMatrix
      lamps.instanceMatrix = body.instanceMatrix
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      for (let i = 0; i < Sim.slots; i++) {
        body.setMatrixAt(i, hidden)
        body.setColorAt(i, new THREE.Color('#ffffff'))
      }
      for (const m of [body, trim, lamps]) {
        m.count = 0
        m.frustumCulled = false
      }
      body.castShadow = true
      trim.castShadow = true
      body.receiveShadow = true
      out[kind] = { body, trim, lamps, painted: new Array(Sim.slots).fill(null), used: 0 }
    }
    return out
  }, [bodyMat, trimMat, lampMat])
  useEffect(
    () => () => {
      for (const k of KINDS) {
        const m = meshes[k]
        m.body.geometry.dispose()
        m.trim.geometry.dispose()
        m.lamps.geometry.dispose()
        m.body.dispose()
      }
      bodyMat.dispose()
      trimMat.dispose()
      lampMat.dispose()
    },
    [meshes, bodyMat, trimMat, lampMat],
  )

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0), c: new THREE.Color() }),
    [],
  )

  useFrame((_, dt) => {
    const f = focus.current
    // Simulate a bit past the fog, and further when zoomed out.
    const radius = Math.min(420, Math.max(200, distance * 3.2))
    sim.step(dt, map, f.x, f.y, !f.under, hour, radius)
    const seen = new Map<VehicleKind, number>()
    for (const k of KINDS) {
      const m = meshes[k]
      // Hide everything last drawn; the live cars are drawn again below.
      for (let i = 0; i < m.used; i++) m.body.setMatrixAt(i, hidden)
      seen.set(k, 0)
    }
    for (const c of sim.cars) {
      const m = meshes[c.kind]
      tmp.p.set(c.x, c.z + 0.02, c.y)
      tmp.q.setFromAxisAngle(tmp.up, c.heading)
      tmp.m.compose(tmp.p, tmp.q, tmp.s)
      m.body.setMatrixAt(c.slot, tmp.m)
      if (m.painted[c.slot] !== c.color) {
        m.painted[c.slot] = c.color
        m.body.setColorAt(c.slot, tmp.c.set(c.color))
        m.body.instanceColor!.needsUpdate = true
      }
      seen.set(c.kind, Math.max(seen.get(c.kind)!, c.slot + 1))
    }
    for (const k of KINDS) {
      const m = meshes[k]
      const used = Math.max(seen.get(k)!, 0)
      // Clear slots past the new end too (they were hidden above).
      m.used = used
      m.body.count = used
      m.trim.count = used
      m.lamps.count = used
      m.body.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {KINDS.map((k) => (
        <group key={k}>
          <primitive object={meshes[k].body} />
          <primitive object={meshes[k].trim} />
          <primitive object={meshes[k].lamps} />
        </group>
      ))}
    </>
  )
}
