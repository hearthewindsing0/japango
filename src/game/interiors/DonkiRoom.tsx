import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Interior } from '../interior'
import { drawDonpen, drawGoods, drawPop } from '../landmarks/DonQuijote'
import { DONKI, donkiPlan } from './donki'

// Inside Don Quijote: a cutaway of the ground floor, drawn like the other
// walk-in places, with low walls so the camera can see in from above.
// Shelves packed to the top with goods, yellow POP cards, section signs
// hanging over the aisles, the checkout and the escalator at the back.

const WALL_H = 2.6
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

/** One section's goods: a shelf face 2 m wide, crammed. */
function goodsTex(seed: number) {
  return canvasTexture(
    256,
    280,
    (c) => {
      c.fillStyle = '#f2f2ee'
      c.fillRect(0, 0, 256, 280)
      drawGoods(c, 0, 0, 256, 280, seed, 46)
      // A couple of POP cards stuck to the shelf edges.
      drawPop(c, 60 + (seed % 3) * 40, 70, 26, DONKI.pops[seed % DONKI.pops.length], DONKI.prices[seed % DONKI.prices.length])
      drawPop(c, 190 - (seed % 2) * 50, 190, 24, DONKI.pops[(seed + 3) % DONKI.pops.length], DONKI.prices[(seed + 2) % DONKI.prices.length])
    },
    true,
  )
}

/** Hanging section sign: red text on yellow, English under it. */
function signTex(t: string, en: string) {
  return canvasTexture(512, 192, (c) => {
    c.fillStyle = '#ffd400'
    c.fillRect(0, 0, 512, 192)
    c.strokeStyle = '#e60012'
    c.lineWidth = 10
    c.strokeRect(5, 5, 502, 182)
    c.fillStyle = '#e60012'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `900 ${t.length > 5 ? 62 : 84}px ${GOTHIC}`
    c.fillText(t, 256, 78)
    c.fillStyle = '#0052a5'
    c.font = `700 34px ${GOTHIC}`
    c.fillText(en.toUpperCase(), 256, 154)
  })
}

function floorTex() {
  return canvasTexture(
    256,
    256,
    (c) => {
      c.fillStyle = '#e9eaec'
      c.fillRect(0, 0, 256, 256)
      c.fillStyle = '#d3d5d8'
      c.fillRect(0, 126, 256, 4)
      c.fillRect(126, 0, 4, 256)
      c.fillStyle = 'rgba(255,255,255,0.35)'
      c.fillRect(10, 10, 100, 40)
    },
    true,
  )
}

function regTex() {
  return canvasTexture(512, 128, (c) => {
    c.fillStyle = '#e60012'
    c.fillRect(0, 0, 512, 128)
    c.fillStyle = '#ffd400'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `900 70px ${GOTHIC}`
    c.fillText('レジ  REGISTER', 256, 66)
  })
}

function wallTex() {
  return canvasTexture(
    512,
    256,
    (c) => {
      c.fillStyle = '#f2f2ee'
      c.fillRect(0, 0, 512, 256)
      drawGoods(c, 0, 40, 512, 216, 11, 44)
      c.fillStyle = '#ffd400'
      c.fillRect(0, 0, 512, 40)
      c.fillStyle = '#e60012'
      c.textBaseline = 'middle'
      c.font = `900 30px ${GOTHIC}`
      c.fillText('驚安の殿堂 ドン・キホーテ', 70, 21)
      drawDonpen(c, 36, 22, 14)
    },
    true,
  )
}

export function DonkiRoom({ it }: { it: Interior }) {
  const plan = useMemo(() => donkiPlan(it.place), [it.place])
  const { room } = plan
  const tex = useMemo(
    () => ({
      floor: floorTex(),
      wall: wallTex(),
      reg: regTex(),
      goods: Array.from({ length: 7 }, (_, i) => goodsTex(i + 2)),
      signs: plan.signs.map(([k]) => signTex(DONKI.signs[k].t, DONKI.signs[k].en)),
      pops: DONKI.pops.map((t, i) =>
        canvasTexture(128, 128, (c) => {
          c.clearRect(0, 0, 128, 128)
          drawPop(c, 64, 64, 62, t, DONKI.prices[i % DONKI.prices.length])
        }),
      ),
    }),
    [plan],
  )
  useEffect(() => () => [tex.floor, tex.wall, tex.reg, ...tex.goods, ...tex.signs, ...tex.pops].forEach((t) => t.dispose()), [tex])
  const mats = useMemo(() => {
    tex.floor.repeat.set((room.a1 - room.a0) / 1.2, (room.b1 - room.b0) / 1.2)
    return {
      floor: new THREE.MeshLambertMaterial({ map: tex.floor }),
      wall: new THREE.MeshLambertMaterial({ map: tex.wall }),
      shelfTop: new THREE.MeshLambertMaterial({ color: '#c9cdd1' }),
      goods: tex.goods.map((map) => new THREE.MeshLambertMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.12 })),
      counter: new THREE.MeshLambertMaterial({ color: '#f4f4f2' }),
      reg: new THREE.MeshLambertMaterial({ map: tex.reg }),
      steel: new THREE.MeshLambertMaterial({ color: '#8d9399' }),
      dark: new THREE.MeshLambertMaterial({ color: '#2a2d31' }),
      signs: tex.signs.map((map) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })),
      pops: tex.pops.map((map) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })),
      wire: new THREE.MeshLambertMaterial({ color: '#555b61' }),
    }
  }, [tex, room])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) for (const x of Array.isArray(m) ? m : [m]) x.dispose()
    },
    [mats],
  )

  // Walls, with a gap for the door.
  const walls = useMemo(() => {
    const runs: [number, number, number, number][] = [
      [room.a0, room.b0, plan.door.a0, room.b0],
      [plan.door.a1, room.b0, room.a1, room.b0],
      [room.a0, room.b1, room.a1, room.b1],
      [room.a0, room.b0, room.a0, room.b1],
      [room.a1, room.b0, room.a1, room.b1],
    ]
    return runs.map(([a0, b0, a1, b1]) => {
      const len = Math.hypot(a1 - a0, b1 - b0) + 0.2
      const m = mats.wall.clone()
      m.map = mats.wall.map!.clone()
      m.map.repeat.set(len / 3, 1)
      m.map.needsUpdate = true
      return { a: (a0 + a1) / 2, b: (b0 + b1) / 2, len, ry: -Math.atan2(b1 - b0, a1 - a0), mat: m }
    })
  }, [room, plan, mats])
  useEffect(() => () => walls.forEach((w) => (w.mat.map?.dispose(), w.mat.dispose())), [walls])

  // Each shelf's goods, the texture repeated to the shelf's length.
  const shelfMats = useMemo(() => {
    const order = ['sweets', 'souvenirs', 'cosmetics', 'medicine', 'daily', 'drinks', 'party']
    return plan.boxes.map((s) => {
      if (s.kind !== 'shelf') return null
      const gm = mats.goods[Math.max(0, order.indexOf(s.section ?? 'daily')) % mats.goods.length].clone()
      gm.map = gm.map!.clone()
      gm.map.repeat.set((s.hb * 2) / 2, 1)
      gm.map.needsUpdate = true
      gm.emissiveMap = gm.map
      return gm
    })
  }, [plan, mats])
  useEffect(() => () => shelfMats.forEach((m) => (m?.map?.dispose(), m?.dispose())), [shelfMats])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(room.a0 + room.a1) / 2, 0.01, (room.b0 + room.b1) / 2]} material={mats.floor} receiveShadow>
        <planeGeometry args={[room.a1 - room.a0, room.b1 - room.b0]} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.a, WALL_H / 2, w.b]} rotation-y={w.ry} material={w.mat}>
          <boxGeometry args={[w.len, WALL_H, 0.2]} />
        </mesh>
      ))}
      {plan.boxes.map((s, i) => {
        if (s.kind === 'shelf') {
          const gm = shelfMats[i]!
          // Box faces: +x, -x, +y, -y, +z, -z: goods on the long sides.
          return (
            <mesh key={i} position={[s.a, s.h / 2, s.b]} material={[gm, gm, mats.shelfTop, mats.shelfTop, mats.goods[i % mats.goods.length], mats.goods[(i + 3) % mats.goods.length]]} castShadow>
              <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
            </mesh>
          )
        }
        if (s.kind === 'wagon')
          return (
            <group key={i} position={[s.a, 0, s.b]}>
              <mesh position={[0, s.h / 2, 0]} material={mats.wire}>
                <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
              </mesh>
              <mesh position={[0, s.h + 0.12, 0]} material={mats.goods[0]}>
                <boxGeometry args={[s.ha * 2 - 0.1, 0.25, s.hb * 2 - 0.1]} />
              </mesh>
            </group>
          )
        if (s.kind === 'counter')
          return (
            <group key={i} position={[s.a, 0, s.b]}>
              <mesh position={[0, s.h / 2, 0]} material={[mats.counter, mats.counter, mats.counter, mats.counter, mats.reg, mats.counter]} castShadow>
                <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
              </mesh>
            </group>
          )
        if (s.kind === 'escalator')
          return (
            <group key={i} position={[s.a, 0, s.b]}>
              {/* Steps climbing toward the back wall. */}
              {Array.from({ length: 8 }, (_, k) => (
                <mesh key={k} position={[0, 0.15 + k * 0.3, -s.hb + 0.25 + k * ((s.hb * 2 - 0.5) / 8)]} material={mats.steel}>
                  <boxGeometry args={[s.ha * 2 - 0.3, 0.3, (s.hb * 2) / 8]} />
                </mesh>
              ))}
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * (s.ha - 0.08), s.h / 2, 0]} material={mats.dark}>
                  <boxGeometry args={[0.16, s.h, s.hb * 2]} />
                </mesh>
              ))}
            </group>
          )
        return null
      })}
      {/* POP cards stuck up along the shelf tops. */}
      {plan.boxes.flatMap((s, i) =>
        s.kind !== 'shelf' || s.ha < 0.4
          ? []
          : Array.from({ length: Math.max(1, Math.floor((s.hb * 2) / 2.2)) }, (_, k) => (
              <mesh key={`${i}-${k}`} position={[s.a, s.h + 0.28, s.b - s.hb + 1.1 + k * 2.2]} rotation={[1.0, Math.PI, 0]} material={mats.pops[(i + k) % mats.pops.length]}>
                <planeGeometry args={[0.6, 0.6]} />
              </mesh>
            )),
      )}
      {/* Section signs hung over the aisles, tilted up so they read from above. */}
      {plan.signs.map(([, a, b], i) => (
        <mesh key={i} position={[a, WALL_H + 0.35, b]} rotation={[1.05, Math.PI, 0]} material={mats.signs[i]}>
          <planeGeometry args={[1.6, 0.6]} />
        </mesh>
      ))}
      {/* Strip lights. */}
      <pointLight position={[(room.a0 + room.a1) / 2, 3.2, (room.b0 + room.b1) / 2]} intensity={12} distance={30} decay={1.2} color="#fff8e8" />
      <pointLight position={[0, 3.2, 2]} intensity={6} distance={14} decay={1.2} color="#fff8e8" />
      <ambientLight intensity={0.35} />
    </group>
  )
}
