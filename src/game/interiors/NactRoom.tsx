import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Interior } from '../interior'
import { axes, CONES, NACT } from './nact'

// Inside the National Art Center: the atrium behind the wave of glass,
// drawn as a cutaway like the other walk-in places. A warm wooden floor,
// the glass wall low along the curve, the two inverted concrete cones with
// the brasserie and the tea room on top, the café by the glass, the ticket
// counter, information desk, lockers and the escalator up to the galleries.
// Everything is in map meters (the room follows the curved wall).

const WALL_H = 2.4
const GOTHIC = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "M PLUS 1 Variable", "Yu Gothic", sans-serif'

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const woodTex = () =>
  canvasTexture(
    256,
    256,
    (c) => {
      for (let i = 0; i < 8; i++) {
        const n = (Math.sin(i * 91.7) * 43758.5) % 1
        c.fillStyle = `rgb(${176 + n * 20},${132 + n * 14},${92 + n * 10})`
        c.fillRect(0, i * 32, 256, 32)
        c.fillStyle = 'rgba(80,50,30,0.25)'
        c.fillRect(0, i * 32, 256, 1)
        c.fillRect(((i * 97) % 200) + 20, i * 32, 1, 32)
      }
    },
    true,
  )

/** A museum sign: white on charcoal, English underneath. */
const signTex = (t: string, en: string) =>
  canvasTexture(512, 176, (c) => {
    c.fillStyle = '#2f3542'
    c.fillRect(0, 0, 512, 176)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `700 ${t.length > 10 ? 40 : t.length > 6 ? 54 : 72}px ${GOTHIC}`
    c.fillText(t, 256, 70, 490)
    c.fillStyle = '#c8d0d8'
    c.font = `500 28px ${GOTHIC}`
    c.fillText(en.length > 34 ? en.slice(0, en.indexOf('(')).trim() || en : en, 256, 140, 490)
  })

/** An inverted cone: narrow foot, flaring out to a round platform. */
function coneGeometry(r0: number, r1: number, h: number) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    // A slight curve, like the real cones' flared profile.
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 1.35), t * h))
  }
  pts.push(new THREE.Vector2(r1, h + 0.5))
  pts.push(new THREE.Vector2(0, h + 0.5))
  return new THREE.LatheGeometry(pts, 48)
}

export function NactRoom({ it }: { it: Interior }) {
  const p = it.place
  const z = it.z
  const { u, v } = axes(p)
  const spot = (k: string, du = 0, dv = 0): [number, number, number] => {
    const [x, y] = p.spots?.[k] ?? [p.x, p.y]
    return [x + u[0] * du + v[0] * dv, z, y + u[1] * du + v[1] * dv]
  }
  // Rotation that turns local +x along the wall (u) and +z into the room (v).
  const ry = Math.atan2(-u[1], u[0])

  const tex = useMemo(() => {
    const signs = Object.fromEntries(Object.entries(NACT.signs).map(([k, s]) => [k, signTex(s.t, s.en)]))
    return { wood: woodTex(), signs }
  }, [])
  useEffect(() => () => [tex.wood, ...Object.values(tex.signs)].forEach((t) => t.dispose()), [tex])

  const geo = useMemo(() => {
    const poly = p.poly ?? []
    const pts: THREE.Vector2[] = []
    for (let i = 0; i + 1 < poly.length; i += 2) pts.push(new THREE.Vector2(poly[i], -poly[i + 1]))
    const floor = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2)
    // UVs in meters, for the planks.
    const pos = floor.getAttribute('position')
    const uv = floor.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3)
    // Walls around the floor: glass along the wave, concrete at the back.
    const n = pts.length
    const glass: number[] = []
    const solid: number[] = []
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      // The wave is the first `glass` edges.
      const arr = i < (p.glass ?? n - 3) ? glass : solid
      const h = arr === glass ? WALL_H : WALL_H + 0.4
      arr.push(a.x, 0, -a.y, b.x, 0, -b.y, b.x, h, -b.y, a.x, 0, -a.y, b.x, h, -b.y, a.x, h, -a.y)
    }
    const wall = (arr: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      g.computeVertexNormals()
      return g
    }
    return {
      floor,
      glass: wall(glass),
      solid: wall(solid),
      big: coneGeometry(CONES.big.r0, CONES.big.r1, CONES.big.h),
      small: coneGeometry(CONES.small.r0, CONES.small.r1, CONES.small.h),
    }
  }, [p])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  const mats = useMemo(() => {
    tex.wood.repeat.set(1, 1)
    return {
      floor: new THREE.MeshLambertMaterial({ map: tex.wood }),
      glass: new THREE.MeshLambertMaterial({ color: '#8fc9c3', transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      solid: new THREE.MeshLambertMaterial({ color: '#d9d6cf', side: THREE.DoubleSide }),
      concrete: new THREE.MeshLambertMaterial({ color: '#c9c3b8' }),
      white: new THREE.MeshLambertMaterial({ color: '#f3f2ee' }),
      dark: new THREE.MeshLambertMaterial({ color: '#33363b' }),
      steel: new THREE.MeshLambertMaterial({ color: '#9aa1a8' }),
      cloth: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      rail: new THREE.MeshLambertMaterial({ color: '#cfe6e3', transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      signs: Object.fromEntries(Object.entries(tex.signs).map(([k, map]) => [k, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })])),
    }
  }, [tex])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) if (m instanceof THREE.Material) m.dispose()
      Object.values(mats.signs).forEach((m) => m.dispose())
    },
    [mats],
  )

  const cone = (k: 'coneBig' | 'coneSmall', c: { r0: number; r1: number; h: number }, g: THREE.BufferGeometry, tables: number) => {
    if (!p.spots?.[k]) return null
    const [x, , y] = spot(k)
    return (
      <group position={[x, z, y]}>
        <mesh geometry={g} material={mats.concrete} castShadow receiveShadow />
        {/* Glass railing and tables with white cloths on the platform. */}
        <mesh position={[0, c.h + 1.0, 0]} material={mats.rail}>
          <cylinderGeometry args={[c.r1 - 0.1, c.r1 - 0.1, 1.0, 48, 1, true]} />
        </mesh>
        {Array.from({ length: tables }, (_, i) => {
          const a = (i / tables) * Math.PI * 2
          const r = c.r1 * (i % 2 ? 0.62 : 0.35)
          return (
            <mesh key={i} position={[Math.cos(a) * r, c.h + 0.9, Math.sin(a) * r]} material={mats.cloth} castShadow>
              <cylinderGeometry args={[0.45, 0.45, 0.06, 16]} />
            </mesh>
          )
        })}
      </group>
    )
  }
  const box = (k: string, size: [number, number, number], m: THREE.Material, du = 0, dv = 0) => {
    if (!p.spots?.[k]) return null
    const [x, , y] = spot(k, du, dv)
    return (
      <mesh position={[x, z + size[1] / 2, y]} rotation-y={ry} material={m} castShadow>
        <boxGeometry args={size} />
      </mesh>
    )
  }
  return (
    <group>
      <group position={[0, z + 0.01, 0]}>
        <mesh geometry={geo.floor} material={mats.floor} receiveShadow />
        <mesh geometry={geo.glass} material={mats.glass} />
        <mesh geometry={geo.solid} material={mats.solid} />
      </group>
      {cone('coneBig', CONES.big, geo.big, 9)}
      {cone('coneSmall', CONES.small, geo.small, 6)}
      {box('ticket', [4.8, 1.05, 0.9], mats.white)}
      {box('info', [2.2, 1.0, 1.0], mats.white)}
      {box('lockers', [5, 1.9, 0.6], mats.steel)}
      {box('escalator', [1.4, 2.2, 5.2], mats.dark)}
      {/* Café tables by the glass. */}
      {[-3, 0, 3].map((du) => {
        if (!p.spots?.cafe) return null
        const [x, , y] = spot('cafe', du, 1.2)
        return (
          <mesh key={du} position={[x, z + 0.37, y]} material={mats.white} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.74, 16]} />
          </mesh>
        )
      })}
      {/* Signs, tilted up so they read from above. */}
      {it.signs.map((s, i) => {
        const key = Object.keys(NACT.signs).find((k) => NACT.signs[k as keyof typeof NACT.signs].t === s.t)
        const m = key ? mats.signs[key] : null
        if (!m) return null
        return (
          <group key={i} position={[s.x, z + WALL_H + 0.3, s.y]} rotation-y={ry}>
            <mesh rotation={[1.05, Math.PI, 0]} material={m}>
              <planeGeometry args={[1.9, 0.65]} />
            </mesh>
          </group>
        )
      })}
      <pointLight position={[spot('coneBig')[0], z + 6, spot('coneBig')[2]]} intensity={14} distance={40} decay={1.2} color="#fff3e0" />
      <pointLight position={[spot('coneSmall')[0], z + 6, spot('coneSmall')[2]]} intensity={10} distance={35} decay={1.2} color="#fff3e0" />
      <ambientLight intensity={0.4} />
    </group>
  )
}
