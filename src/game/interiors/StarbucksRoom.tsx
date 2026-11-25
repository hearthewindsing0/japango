import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Interior } from '../interior'
import { drawSiren } from '../landmarks/Midtown'
import { STARBUCKS, starbucksPlan } from './starbucks'

// Inside the Starbucks at Midtown: a cutaway of the café with low walls so
// the camera can see in. Warm wood floor, the counter with its pastry case
// and the espresso bar behind, chalkboard menus above, tables, a long
// shared table and armchairs by the glass, under pendant lights.

const WALL_H = 2.6
const GREEN = '#00704a'
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

/** Oak planks. */
function floorTex() {
  return canvasTexture(
    256,
    256,
    (c) => {
      for (let i = 0; i < 8; i++) {
        const n = Math.abs(Math.sin(i * 91.7) * 43758.5) % 1
        c.fillStyle = `rgb(${150 + n * 30},${108 + n * 22},${70 + n * 16})`
        c.fillRect(0, i * 32, 256, 32)
        c.fillStyle = 'rgba(60,35,15,0.35)'
        c.fillRect(0, i * 32, 256, 2)
        c.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32)
      }
      c.strokeStyle = 'rgba(90,55,25,0.18)'
      for (let y = 6; y < 256; y += 9) {
        c.beginPath()
        c.moveTo(0, y)
        c.bezierCurveTo(80, y + 3, 170, y - 3, 256, y + 1)
        c.stroke()
      }
    },
    true,
  )
}

/** Walls: dark wood wainscot, warm plaster, a band of framed art. */
function wallTex() {
  return canvasTexture(
    512,
    256,
    (c) => {
      c.fillStyle = '#e9dcc6'
      c.fillRect(0, 0, 512, 256)
      c.fillStyle = '#4b3424'
      c.fillRect(0, 150, 512, 106)
      c.fillStyle = 'rgba(255,255,255,0.08)'
      for (let x = 0; x < 512; x += 32) c.fillRect(x, 150, 2, 106)
      // Prints of coffee farms in black frames.
      const art = ['#7b8f5a', '#b5835a', '#5f7f8a', '#a46d4b']
      for (let k = 0; k < 3; k++) {
        const x = 40 + k * 165
        c.fillStyle = '#1e1a17'
        c.fillRect(x, 40, 110, 80)
        c.fillStyle = art[k % art.length]
        c.fillRect(x + 6, 46, 98, 68)
        c.fillStyle = 'rgba(255,255,255,0.25)'
        c.beginPath()
        c.arc(x + 70, 70, 14, 0, Math.PI * 2)
        c.fill()
      }
    },
    true,
  )
}

/** The menu boards above the bar: chalk on black. */
function boardTex() {
  return canvasTexture(1024, 320, (c) => {
    c.fillStyle = '#1d1f1e'
    c.fillRect(0, 0, 1024, 320)
    c.strokeStyle = '#7a6a55'
    c.lineWidth = 10
    c.strokeRect(5, 5, 1014, 310)
    c.fillStyle = '#f4efe4'
    c.textBaseline = 'middle'
    const menu = STARBUCKS.menu
    const half = Math.ceil(menu.length / 2)
    menu.forEach(([ja, en], i) => {
      const x = i < half ? 40 : 540
      const y = 50 + (i % half) * 62
      c.font = `700 34px ${GOTHIC}`
      c.fillStyle = '#f4efe4'
      c.fillText(ja, x, y)
      c.font = `400 20px ${GOTHIC}`
      c.fillStyle = '#c9c0ae'
      c.fillText(en, x + 4, y + 26)
    })
    // Sizes along the bottom, small to large.
    c.fillStyle = '#d7f0e3'
    c.font = `700 24px ${GOTHIC}`
    c.fillText(STARBUCKS.sizes.join('  ·  '), 290, 296)
  })
}

/** Hanging sign: white on the green, English under it. */
function signTex(t: string, en: string) {
  return canvasTexture(512, 192, (c) => {
    c.fillStyle = GREEN
    c.fillRect(0, 0, 512, 192)
    c.strokeStyle = '#f4efe4'
    c.lineWidth = 6
    c.strokeRect(10, 10, 492, 172)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `800 ${t.length > 6 ? 56 : 76}px ${GOTHIC}`
    c.fillText(t, 256, 80)
    c.font = `600 32px ${GOTHIC}`
    c.fillText(en.toUpperCase(), 256, 150)
  })
}

/** Pastry case front: glass over rows of pastries. */
function caseTex() {
  return canvasTexture(512, 192, (c) => {
    c.fillStyle = '#3a2a1e'
    c.fillRect(0, 0, 512, 192)
    c.fillStyle = '#f6efe2'
    c.fillRect(8, 8, 496, 120)
    const cols = ['#c98b45', '#e0b36a', '#8c5a32', '#efd7a8', '#b06f3d', '#7c9b4a']
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 11; k++) {
        c.fillStyle = cols[(k + row * 3) % cols.length]
        c.beginPath()
        c.ellipse(34 + k * 44, 46 + row * 52, 17, 12, 0, 0, Math.PI * 2)
        c.fill()
      }
    c.fillStyle = 'rgba(255,255,255,0.25)'
    c.fillRect(8, 8, 496, 18)
  })
}

/** Counter front: wood slats with the mark. */
function counterTex() {
  return canvasTexture(512, 128, (c) => {
    c.fillStyle = '#5a3e2b'
    c.fillRect(0, 0, 512, 128)
    c.fillStyle = 'rgba(0,0,0,0.25)'
    for (let x = 0; x < 512; x += 24) c.fillRect(x, 0, 3, 128)
    drawSiren(c, 256, 64, 42)
  })
}

export function StarbucksRoom({ it }: { it: Interior }) {
  const plan = useMemo(() => starbucksPlan(it.place), [it.place])
  const { room } = plan
  const tex = useMemo(
    () => ({
      floor: floorTex(),
      wall: wallTex(),
      board: boardTex(),
      pastry: caseTex(),
      counter: counterTex(),
      signs: plan.signs.map(([k]) => signTex(STARBUCKS.signs[k].t, STARBUCKS.signs[k].en)),
    }),
    [plan],
  )
  useEffect(() => () => [tex.floor, tex.wall, tex.board, tex.pastry, tex.counter, ...tex.signs].forEach((t) => t.dispose()), [tex])
  const mats = useMemo(() => {
    tex.floor.repeat.set((room.a1 - room.a0) / 2.4, (room.b1 - room.b0) / 2.4)
    return {
      floor: new THREE.MeshLambertMaterial({ map: tex.floor }),
      wall: new THREE.MeshLambertMaterial({ map: tex.wall }),
      glass: new THREE.MeshLambertMaterial({
        color: '#a9cbc4',
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
      board: new THREE.MeshBasicMaterial({
        map: tex.board,
        side: THREE.DoubleSide,
      }),
      pastry: new THREE.MeshLambertMaterial({
        map: tex.pastry,
        emissive: '#ffffff',
        emissiveMap: tex.pastry,
        emissiveIntensity: 0.25,
      }),
      counterFront: new THREE.MeshLambertMaterial({ map: tex.counter }),
      wood: new THREE.MeshLambertMaterial({ color: '#6b4a32' }),
      top: new THREE.MeshLambertMaterial({ color: '#2c2a28' }),
      steel: new THREE.MeshLambertMaterial({ color: '#b9bcbf' }),
      table: new THREE.MeshLambertMaterial({ color: '#8a6243' }),
      chair: new THREE.MeshLambertMaterial({ color: '#3b2b20' }),
      leather: new THREE.MeshLambertMaterial({ color: '#6e3b25' }),
      cup: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
      signs: tex.signs.map((map) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })),
    }
  }, [tex, room])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) for (const x of Array.isArray(m) ? m : [m]) x.dispose()
    },
    [mats],
  )
  // Walls: glass at the front (with the door gap), wood and plaster round
  // the other three sides.
  const walls = useMemo(() => {
    const runs: [number, number, number, number, boolean][] = [
      [room.a0, room.b0, plan.door.a0, room.b0, true],
      [plan.door.a1, room.b0, room.a1, room.b0, true],
      [room.a0, room.b1, room.a1, room.b1, false],
      [room.a0, room.b0, room.a0, room.b1, false],
      [room.a1, room.b0, room.a1, room.b1, false],
    ]
    return runs.map(([a0, b0, a1, b1, glass]) => {
      const len = Math.hypot(a1 - a0, b1 - b0) + 0.2
      let mat: THREE.Material = mats.glass
      if (!glass) {
        const m = mats.wall.clone()
        m.map = mats.wall.map!.clone()
        m.map.repeat.set(len / 4, 1)
        m.map.needsUpdate = true
        mat = m
      }
      return {
        a: (a0 + a1) / 2,
        b: (b0 + b1) / 2,
        len,
        ry: -Math.atan2(b1 - b0, a1 - a0),
        mat,
        glass,
      }
    })
  }, [room, plan, mats])
  useEffect(() => () => walls.forEach((w) => !w.glass && ((w.mat as THREE.MeshLambertMaterial).map?.dispose(), w.mat.dispose())), [walls])
  const lamps = useMemo(() => {
    const out: [number, number][] = []
    for (let a = room.a0 + 1.5; a < room.a1 - 1; a += 3) for (let b = 1.8; b < room.b1 - 0.8; b += 3) out.push([a, b])
    return out
  }, [room])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(room.a0 + room.a1) / 2, 0.01, (room.b0 + room.b1) / 2]} material={mats.floor} receiveShadow>
        <planeGeometry args={[room.a1 - room.a0, room.b1 - room.b0]} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.a, (w.glass ? WALL_H + 0.4 : WALL_H) / 2, w.b]} rotation-y={w.ry} material={w.mat}>
          <boxGeometry args={[w.len, w.glass ? WALL_H + 0.4 : WALL_H, w.glass ? 0.06 : 0.2]} />
        </mesh>
      ))}
      {plan.boxes.map((s, i) => {
        const at: [number, number, number] = [s.a, 0, s.b]
        switch (s.kind) {
          case 'counter':
            // Box faces: +x, -x, +y, -y, +z, -z; the front faces -z (the door).
            return (
              <mesh key={i} position={[s.a, s.h / 2, s.b]} material={[mats.wood, mats.wood, mats.top, mats.wood, mats.wood, mats.counterFront]} castShadow>
                <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
              </mesh>
            )
          case 'case':
            return (
              <mesh key={i} position={[s.a, s.h / 2, s.b]} material={[mats.wood, mats.wood, mats.glass, mats.wood, mats.wood, mats.pastry]} castShadow>
                <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
              </mesh>
            )
          case 'backbar':
            return (
              <group key={i} position={at}>
                <mesh position={[0, s.h / 2, 0]} material={mats.wood}>
                  <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
                </mesh>
                {/* Espresso machines and grinders. */}
                {[-0.3, 0.3].map((f) => (
                  <mesh key={f} position={[f * s.ha * 2, s.h + 0.25, 0]} material={mats.steel}>
                    <boxGeometry args={[0.8, 0.5, 0.45]} />
                  </mesh>
                ))}
              </group>
            )
          case 'condiment':
            return (
              <mesh key={i} position={[s.a, s.h / 2, s.b]} material={mats.wood}>
                <boxGeometry args={[s.ha * 2, s.h, s.hb * 2]} />
              </mesh>
            )
          case 'table':
            return (
              <group key={i} position={at}>
                <mesh position={[0, s.h, 0]} material={mats.table} castShadow>
                  <cylinderGeometry args={[0.36, 0.36, 0.04, 20]} />
                </mesh>
                <mesh position={[0, s.h / 2, 0]} material={mats.top}>
                  <cylinderGeometry args={[0.04, 0.04, s.h, 6]} />
                </mesh>
                {[-1, 1].map((k) => (
                  <mesh key={k} position={[k * 0.55, 0.23, 0]} material={mats.chair} castShadow>
                    <boxGeometry args={[0.38, 0.46, 0.4]} />
                  </mesh>
                ))}
                <mesh position={[0.1, s.h + 0.07, 0.05]} material={mats.cup}>
                  <cylinderGeometry args={[0.045, 0.035, 0.11, 10]} />
                </mesh>
              </group>
            )
          case 'long':
            return (
              <group key={i} position={at}>
                <mesh position={[0, s.h, 0]} material={mats.table} castShadow>
                  <boxGeometry args={[s.ha * 2, 0.06, s.hb * 2]} />
                </mesh>
                {[-1, 1].map((k) => (
                  <mesh key={k} position={[0, s.h / 2, k * (s.hb - 0.3)]} material={mats.top}>
                    <boxGeometry args={[s.ha * 1.6, s.h, 0.08]} />
                  </mesh>
                ))}
                {Array.from({ length: Math.max(2, Math.floor((s.hb * 2) / 0.8)) }, (_, k) =>
                  [-1, 1].map((side) => (
                    <mesh key={`${k}${side}`} position={[side * (s.ha + 0.3), 0.33, -s.hb + 0.4 + k * 0.8]} material={mats.chair}>
                      <boxGeometry args={[0.36, 0.66, 0.36]} />
                    </mesh>
                  )),
                )}
              </group>
            )
          case 'armchair':
            return (
              <group key={i} position={at}>
                <mesh position={[0, 0.22, 0]} material={mats.leather} castShadow>
                  <boxGeometry args={[s.ha * 2, 0.44, s.hb * 2]} />
                </mesh>
                <mesh position={[0, 0.55, s.hb - 0.1]} material={mats.leather}>
                  <boxGeometry args={[s.ha * 2, 0.6, 0.2]} />
                </mesh>
              </group>
            )
          default:
            return null
        }
      })}
      {/* Menu boards above the espresso bar, tilted to read from above. */}
      <mesh position={[plan.boards.a, WALL_H + 0.5, room.b1 - 0.3]} rotation={[0.75, Math.PI, 0]} material={mats.board}>
        <planeGeometry args={[Math.min(plan.boards.w, 6), Math.min(plan.boards.w, 6) * 0.31]} />
      </mesh>
      {plan.signs.map(([, a, b], i) =>
        b < 0 ? null : (
          <mesh key={i} position={[a, WALL_H + 0.3, b]} rotation={[1.05, Math.PI, 0]} material={mats.signs[i]}>
            <planeGeometry args={[1.5, 0.56]} />
          </mesh>
        ),
      )}
      {/* Pendant lights. */}
      {lamps.map(([a, b], i) => (
        <mesh key={i} position={[a, 2.35, b]} material={mats.lamp}>
          <sphereGeometry args={[0.14, 10, 8]} />
        </mesh>
      ))}
      <pointLight position={[(room.a0 + room.a1) / 2, 3.0, room.b1 / 2]} intensity={10} distance={24} decay={1.2} color="#ffe2b8" />
      <pointLight position={[plan.boards.a, 2.8, room.b1 - 2]} intensity={6} distance={12} decay={1.2} color="#fff0d8" />
      <ambientLight intensity={0.3} />
    </group>
  )
}
