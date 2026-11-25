import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { toyLift } from './Toy'
import { tileGroundAt, type MapTile, type PropKind, type Slope } from './map'

// Street furniture, drawn where Mapillary's detectors found it in street
// photos. Each kind is built from a few simple parts; every part is one
// instanced mesh, so thousands of props cost a handful of draw calls.
//
// Parts are modeled facing +X (toward the road), then turned by the prop's
// rotation.

interface Part {
  geo: () => THREE.BufferGeometry
  color: string
  at: [number, number, number]
  basic?: boolean
}

// Diorama: chunky, rounded-off toy pieces.
const cyl = (r: number, h: number, seg = 12) => () => new THREE.CylinderGeometry(r * 1.3, r * 1.3, h, seg)
const box = (x: number, y: number, z: number) => () => new RoundedBoxGeometry(x, y, z, 2, Math.min(0.08, Math.min(x, y, z) / 2 - 0.005))

const PARTS: Record<PropKind, Part[]> = {
  // Minato-ku's slope signs: a short stone post with the name on a plate.
  slopesign: [
    { geo: box(0.22, 1.25, 0.22), color: '#b9b2a3', at: [0, 0.62, 0] },
    { geo: box(0.06, 0.55, 0.42), color: '#3b4a5e', at: [0.13, 0.92, 0] },
    { geo: box(0.07, 0.42, 0.3), color: '#f1ede2', at: [0.15, 0.92, 0], basic: true },
  ],
  streetlight: [
    { geo: cyl(0.07, 7), color: '#8e9399', at: [0, 3.5, 0] },
    { geo: box(1.6, 0.08, 0.08), color: '#8e9399', at: [0.8, 6.95, 0] },
    { geo: box(0.55, 0.14, 0.26), color: '#fff3c4', at: [1.5, 6.85, 0], basic: true },
  ],
  // Japan's concrete utility poles, with a crossarm and a transformer.
  pole: [
    { geo: cyl(0.15, 10.5), color: '#a3a29b', at: [0, 5.25, 0] },
    { geo: box(0.12, 0.12, 1.8), color: '#6f6f6a', at: [0, 9.6, 0] },
    { geo: box(0.12, 0.12, 1.4), color: '#6f6f6a', at: [0, 8.9, 0] },
    { geo: cyl(0.28, 0.9), color: '#8d9196', at: [0.35, 7.6, 0] },
  ],
  trafficlight: [
    { geo: cyl(0.1, 5.2), color: '#8e9399', at: [0, 2.6, 0] },
    { geo: box(2.2, 0.1, 0.1), color: '#8e9399', at: [1.1, 5.1, 0] },
    { geo: box(0.3, 0.35, 1.1), color: '#3a3d42', at: [2.1, 5.05, 0] },
    { geo: box(0.05, 0.22, 0.22), color: '#3ddc84', at: [2.26, 5.05, -0.33], basic: true },
  ],
  sign: [
    { geo: cyl(0.04, 2.7), color: '#9aa0a6', at: [0, 1.35, 0] },
    { geo: () => new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24).rotateZ(Math.PI / 2), color: '#5b86e0', at: [0.05, 2.45, 0] },
  ],
  bench: [
    { geo: box(0.45, 0.07, 1.6), color: '#9b6b43', at: [0, 0.45, 0] },
    { geo: box(0.4, 0.42, 0.08), color: '#55585c', at: [0, 0.21, -0.7] },
    { geo: box(0.4, 0.42, 0.08), color: '#55585c', at: [0, 0.21, 0.7] },
  ],
  bin: [{ geo: cyl(0.25, 0.85, 12), color: '#5d7a63', at: [0, 0.43, 0] }],
  hydrant: [
    { geo: cyl(0.13, 0.65, 10), color: '#d4312f', at: [0, 0.33, 0] },
    { geo: () => new THREE.SphereGeometry(0.13, 10, 8), color: '#d4312f', at: [0, 0.66, 0] },
  ],
  // Japan Post's red post box.
  postbox: [
    { geo: box(0.45, 1.1, 0.42), color: '#d32630', at: [0, 0.55, 0] },
    { geo: () => new THREE.CylinderGeometry(0.21, 0.21, 0.45, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), color: '#d32630', at: [0, 1.1, 0] },
  ],
  bikerack: [{ geo: box(0.3, 0.12, 2.2), color: '#8e9399', at: [0, 0.3, 0] }],
  manhole: [{ geo: () => new THREE.CylinderGeometry(0.32, 0.32, 0.02, 16), color: '#4b4d52', at: [0, 0.1, 0] }],
  phonebooth: [
    { geo: box(0.95, 2.2, 0.95), color: '#a8d5b5', at: [0, 1.1, 0] },
    { geo: box(1.05, 0.12, 1.05), color: '#5f9e72', at: [0, 2.26, 0] },
  ],
}

/** Diorama paint: every color lifted a little toward warm white. */
const toyPaint = (c: string) => toyLift(new THREE.Color(c), 0.18)

function PropKindMesh({ tile, items, parts, clip }: { tile: MapTile; items: MapTile['props']; parts: Part[]; clip: THREE.Plane[] }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const geos = useMemo(() => parts.map((p) => p.geo()), [parts])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const local = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    parts.forEach((part, pi) => {
      const mesh = refs.current[pi]
      if (!mesh) return
      items.forEach((it, i) => {
        // Map rotation is measured with y pointing down the screen, which is
        // world +Z; Three's Y rotation turns +X toward -Z, so negate it.
        q.setFromAxisAngle(up, -it.r)
        m.compose(new THREE.Vector3(it.x, tileGroundAt(tile, it.x, it.y), it.y), q, new THREE.Vector3(1, 1, 1))
        local.makeTranslation(...part.at)
        mesh.setMatrixAt(i, m.clone().multiply(local))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [tile, items, parts])

  useLayoutEffect(() => () => geos.forEach((g) => g.dispose()), [geos])

  return (
    <>
      {parts.map((part, pi) => (
        <instancedMesh
          key={pi}
          ref={(el) => {
            refs.current[pi] = el
          }}
          args={[geos[pi], undefined, items.length]}
          castShadow={!part.basic}
        >
          {part.basic ? (
            <meshBasicMaterial color={part.color} clippingPlanes={clip} />
          ) : (
            <meshLambertMaterial color={toyPaint(part.color)} clippingPlanes={clip} />
          )}
        </instancedMesh>
      ))}
    </>
  )
}

/** Pools of warm light under street lights, fading in after dark. */
function LampGlow({ tile, night }: { tile: MapTile; night: number }) {
  const lamps = useMemo(() => tile.props.filter((p) => p.k === 'streetlight'), [tile])
  const on = night >= 0.05
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.CircleGeometry(4.5, 24).rotateX(-Math.PI / 2), [])
  const mat = useMemo(() => {
    // Bright in the middle, fading to nothing at the edge.
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uAlpha: { value: 0 } },
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = position.xz / 4.5;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha;
        varying vec2 vP;
        void main() {
          float f = 1.0 - smoothstep(0.0, 1.0, length(vP));
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * f * uAlpha, 1.0);
        }`,
    })
    return m
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    lamps.forEach((it, i) => {
      // The lamp head hangs 1.5 m out from the pole, toward the road.
      const x = it.x + Math.cos(it.r) * 1.5
      const y = it.y + Math.sin(it.r) * 1.5
      m.makeTranslation(x, tileGroundAt(tile, x, y) + 0.12, y)
      mesh.current?.setMatrixAt(i, m)
    })
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
  }, [tile, lamps, on])
  useLayoutEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat])
  mat.uniforms.uAlpha.value = night * 0.55
  if (!on) return null
  return <instancedMesh ref={mesh} args={[geo, mat, lamps.length]} frustumCulled={false} />
}

export function Props({ tile, slopes, clip, night = 0 }: { tile: MapTile; slopes: Slope[]; clip: THREE.Plane[]; night?: number }) {
  const byKind = useMemo(() => {
    const out = new Map<PropKind, MapTile['props']>()
    // Slope signs come with the map, not the tile: draw the ones on it.
    const slopeSigns = slopes
      .flatMap((s) => s.signs.map((g) => ({ k: 'slopesign' as const, ...g })))
      .filter((g) => g.x >= tile.x0 && g.x < tile.x1 && g.y >= tile.y0 && g.y < tile.y1)
    for (const p of [...tile.props, ...slopeSigns]) {
      if (!PARTS[p.k]) continue
      out.set(p.k, [...(out.get(p.k) ?? []), p])
    }
    return [...out.entries()]
  }, [tile, slopes])
  return (
    <group>
      {byKind.map(([kind, list]) => (
        <PropKindMesh key={kind} tile={tile} items={list} parts={PARTS[kind]} clip={clip} />
      ))}
      <LampGlow tile={tile} night={night} />
    </group>
  )
}
