import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PARTS, hasPart, paintOf, type Look } from './character'
import type { Interior } from './interior'
import { DonkiRoom } from './interiors/DonkiRoom'
import { NactRoom } from './interiors/NactRoom'
import { ANTNBEE, BARTENDER, CHAIRS, COUNTER, DEPTH, ROOM, SOLID, STAIR_A, STAIR_BOTTOM, STAIR_TOP, STAIR_W, STOOLS, toLocal } from './interiors/antnbee'
import { FONT } from './Stations'
import type { Focus } from './World'

// The walk-in places, drawn like the stations: a cutaway room with low
// walls while you're down there, and the front door (a stairwell with a
// sign) while you're on the street. So far there's one: Ant 'n Bee.

const WALL_H = 2.2

/** A glass of beer on the counter, ordered from the menu. */
export interface Glass {
  /** Along the counter (local b). */
  b: number
  color: string
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** The bar's mark: a black dot and a yellow-and-black striped one. */
function drawLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#151515'
  ctx.beginPath()
  ctx.arc(cx - r * 1.12, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx + r * 1.12, cy, r, 0, Math.PI * 2)
  ctx.clip()
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#f2b705' : '#151515'
    ctx.fillRect(cx, cy - r + (i * 2 * r) / 5, r * 2.4, (2 * r) / 5 + 1)
  }
  ctx.restore()
}

function logoBoard(sub?: string) {
  return canvasTexture(512, 320, (ctx) => {
    ctx.fillStyle = '#f4f1ea'
    ctx.fillRect(0, 0, 512, 320)
    // Whitewashed wood grain.
    ctx.strokeStyle = 'rgba(120,100,80,0.12)'
    for (let y = 8; y < 320; y += 22) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 3)
      ctx.stroke()
    }
    drawLogo(ctx, 256, 120, 70)
    ctx.fillStyle = '#222'
    ctx.textAlign = 'center'
    ctx.font = `500 44px ${FONT}`
    ctx.fillText("ANT 'N BEE", 256, 250)
    if (sub) {
      ctx.font = `700 34px ${FONT}`
      ctx.fillText(sub, 256, 300)
    }
  })
}

/** The day's list, chalk on a blackboard. */
function tapBoard() {
  return canvasTexture(512, 640, (ctx) => {
    ctx.fillStyle = '#23272a'
    ctx.fillRect(0, 0, 512, 640)
    ctx.strokeStyle = '#7a5a3a'
    ctx.lineWidth = 18
    ctx.strokeRect(9, 9, 494, 622)
    ctx.fillStyle = '#f4f1ea'
    ctx.textAlign = 'center'
    ctx.font = `700 46px ${FONT}`
    ctx.fillText(ANTNBEE.signs.taps.t, 256, 72)
    ctx.textAlign = 'left'
    let y = 128
    for (const b of ANTNBEE.beers) {
      ctx.fillStyle = b.tap
      ctx.beginPath()
      ctx.arc(46, y - 10, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f4f1ea'
      ctx.font = `600 27px ${FONT}`
      ctx.fillText(b.ja, 66, y, 420)
      ctx.fillStyle = '#c9c4b8'
      ctx.font = `400 19px ${FONT}`
      ctx.fillText(`${b.brewery}（${b.pref}）`, 66, y + 25, 420)
      y += 54
    }
    ctx.fillStyle = '#f2b705'
    ctx.font = `600 22px ${FONT}`
    ctx.fillText(ANTNBEE.sizes.map((s) => `${s.ja} ¥${s.yen}`).join('  '), 30, 616, 452)
  })
}

function posterTex(title: string, sub: string, bg: string, fg: string) {
  return canvasTexture(256, 360, (ctx) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 256, 360)
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.font = `800 52px ${FONT}`
    ctx.fillText(title, 128, 120, 236)
    ctx.beginPath()
    ctx.arc(128, 220, 54, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = bg
    ctx.font = `800 40px ${FONT}`
    ctx.fillText('🍺', 128, 236)
    ctx.fillStyle = fg
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(sub, 128, 320, 236)
  })
}

/** A plate on the wall: Japanese over English. */
function plateTex(ja: string, en: string, bg = '#f4f1ea', fg = '#222') {
  return canvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 160)
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.font = `700 64px ${FONT}`
    ctx.fillText(ja, 256, 82, 480)
    ctx.font = `500 30px ${FONT}`
    ctx.fillText(en, 256, 136, 480)
  })
}

function tvTex() {
  return canvasTexture(320, 180, (ctx) => {
    ctx.fillStyle = '#2f7d3b'
    ctx.fillRect(0, 0, 320, 180)
    ctx.strokeStyle = '#e8f5e9'
    ctx.lineWidth = 3
    ctx.strokeRect(14, 14, 292, 152)
    ctx.beginPath()
    ctx.moveTo(160, 14)
    ctx.lineTo(160, 166)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(160, 90, 26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(14, 14, 120, 26)
    ctx.fillStyle = '#fff'
    ctx.font = `700 18px ${FONT}`
    ctx.fillText('LIVE 1 - 0', 22, 33)
  })
}

/** Brick for the walls, repeated along each one. */
function brickTex() {
  const tex = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#cbbf9f'
    ctx.fillRect(0, 0, 256, 128)
    const shades = ['#ece0c2', '#e6d7b5', '#f1e7cf', '#e0d0ad', '#eadcbd']
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 32 : 0
      for (let i = -1; i < 4; i++) {
        ctx.fillStyle = shades[(row * 3 + i + 5) % shades.length]
        ctx.fillRect(off + i * 64 + 2, row * 32 + 2, 60, 28)
      }
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function planksTex() {
  const tex = canvasTexture(256, 256, (ctx) => {
    const shades = ['#5b3b25', '#654129', '#53351f', '#6b462c']
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = shades[i % shades.length]
      ctx.fillRect(0, i * 32, 256, 31)
      ctx.fillStyle = '#3c2616'
      ctx.fillRect(((i * 97) % 200) + 20, i * 32, 2, 31)
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

const STAFF: Look = { shirt: '#1d1d1f', pants: '#2b2b2b', skin: '#eec19a', hair: '#1a1412', bag: '#f2b705', backpack: false, longHair: true, height: 0.98 }
const GUESTS: { look: Look; at: [number, number]; face: number }[] = [
  { look: { shirt: '#227093', pants: '#2b3445', skin: '#f2c9a0', hair: '#3b2a20', bag: '#000', backpack: false, longHair: false, height: 1.04 }, at: [1.0, 5.75], face: 0 },
  { look: { shirt: '#e9e4d8', pants: '#1b1f27', skin: '#d9a77c', hair: '#141414', bag: '#000', backpack: false, longHair: true, height: 0.95 }, at: [1.55, 6.55], face: -Math.PI / 2 },
  { look: { shirt: '#6d214f', pants: '#3a3f4b', skin: '#f6d3b3', hair: '#8a6a4a', bag: '#000', backpack: false, longHair: false, height: 1.0 }, at: [1.0, 9.6], face: Math.PI },
  { look: { shirt: '#cc8e35', pants: '#1e3a5f', skin: '#e8b98e', hair: '#2a211c', bag: '#000', backpack: false, longHair: false, height: 1.0 }, at: [3.55, 8.2], face: Math.PI / 2 },
]

/** One person, standing still: same build as everyone else. */
function Person({ look, position, face, refCb }: { look: Look; position: [number, number, number]; face: number; refCb?: (g: THREE.Group | null) => void }) {
  const parts = useMemo(() => PARTS.filter((p) => hasPart(look, p.name, false)).map((spec) => ({ spec, geo: spec.make(0.8) })), [look])
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts])
  return (
    <group position={position} rotation-y={face} scale={look.height} ref={refCb}>
      {parts.map(({ spec, geo }) => (
        <mesh key={spec.name} geometry={geo}>
          {spec.paint === 'eyes' ? <meshBasicMaterial color={paintOf(look, spec.paint)} /> : <meshLambertMaterial color={paintOf(look, spec.paint)} />}
        </mesh>
      ))}
    </group>
  )
}

/** A box in local (a, b) meters, from height y0 up h. */
function B({ a, b, ha, hb, y0 = 0, h, color, mat }: { a: number; b: number; ha: number; hb: number; y0?: number; h: number; color?: string; mat?: THREE.Material }) {
  return (
    <mesh position={[a, y0 + h / 2, b]} material={mat}>
      <boxGeometry args={[ha * 2, h, hb * 2]} />
      {!mat && <meshLambertMaterial color={color} />}
    </mesh>
  )
}

/** A flat picture on a wall. `n`: the way it faces, in local (a, b). */
function Pic({ a, b, y, w, h, n, tex, glow = false }: { a: number; b: number; y: number; w: number; h: number; n: [number, number]; tex: THREE.Texture; glow?: boolean }) {
  const ry = Math.atan2(n[0], n[1])
  return (
    <mesh position={[a + n[0] * 0.02, y, b + n[1] * 0.02]} rotation-y={ry}>
      <planeGeometry args={[w, h]} />
      {glow ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshLambertMaterial map={tex} />}
    </mesh>
  )
}

function AntNBeeRoom({ it, focus, glasses }: { it: Interior; focus: React.RefObject<Focus>; glasses: Glass[] }) {
  const tex = useMemo(
    () => ({
      brick: brickTex(),
      planks: planksTex(),
      logo: logoBoard(),
      board: tapBoard(),
      tv: tvTex(),
      posters: [posterTex('地ビール', 'CRAFT BEER FES', '#f2b705', '#1d1d1f'), posterTex('IPA', '箕面ビール', '#1e3a5f', '#f4f1ea'), posterTex('乾杯!', 'KANPAI', '#b33939', '#f4f1ea')],
      nosmoking: plateTex(ANTNBEE.signs.nosmoking.t, 'NO SMOKING'),
      toilet: plateTex(ANTNBEE.signs.toilet.t, 'RESTROOM', '#2f3542', '#f4f1ea'),
      exit: plateTex(ANTNBEE.signs.exit.t, 'EXIT ↑', '#2e7d32', '#ffffff'),
    }),
    [],
  )
  useEffect(
    () => () => {
      Object.values(tex)
        .flat()
        .forEach((t) => t.dispose())
    },
    [tex],
  )
  const mats = useMemo(() => {
    const floor = new THREE.MeshLambertMaterial({ map: tex.planks.clone() })
    floor.map!.repeat.set((ROOM.a1 - ROOM.a0) / 2.2, (ROOM.b1 - ROOM.b0) / 2.2)
    floor.map!.needsUpdate = true
    return {
      floor,
      wood: new THREE.MeshLambertMaterial({ color: '#4a2f1c' }),
      top: new THREE.MeshLambertMaterial({ color: '#7a5233' }),
      steel: new THREE.MeshLambertMaterial({ color: '#b9bec4' }),
      dark: new THREE.MeshLambertMaterial({ color: '#1d1d1f' }),
      leather: new THREE.MeshLambertMaterial({ color: '#6e2b22' }),
      step: new THREE.MeshLambertMaterial({ color: '#3a3330' }),
      bulb: new THREE.MeshBasicMaterial({ color: '#ffd38a', toneMapped: false }),
      shade: new THREE.MeshLambertMaterial({ color: '#b0813a', side: THREE.DoubleSide }),
      beer: new THREE.MeshLambertMaterial({ color: '#e0a031', transparent: true, opacity: 0.9 }),
    }
  }, [tex])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  // Brick walls, each with its own repeat so the bricks stay the same size.
  const walls = useMemo(() => {
    const door0 = STAIR_A - STAIR_W / 2 - 0.1
    const door1 = STAIR_A + STAIR_W / 2 + 0.1
    // [a0, b0, a1, b1]
    const runs: [number, number, number, number][] = [
      [ROOM.a0, ROOM.b0, door0, ROOM.b0],
      [door1, ROOM.b0, ROOM.a1, ROOM.b0],
      [ROOM.a0, ROOM.b1, ROOM.a1, ROOM.b1],
      [ROOM.a0, ROOM.b0, ROOM.a0, ROOM.b1],
      [ROOM.a1, ROOM.b0, ROOM.a1, ROOM.b1],
    ]
    return runs.map(([a0, b0, a1, b1]) => {
      const len = Math.hypot(a1 - a0, b1 - b0) + 0.24
      const map = tex.brick.clone()
      map.repeat.set(len / 1.0, WALL_H / 0.5)
      map.needsUpdate = true
      return { a: (a0 + a1) / 2, b: (b0 + b1) / 2, len, ry: -Math.atan2(b1 - b0, a1 - a0), mat: new THREE.MeshLambertMaterial({ map }) }
    })
  }, [tex])
  useEffect(() => () => walls.forEach((w) => (w.mat.map?.dispose(), w.mat.dispose())), [walls])

  // Steps down from the street, and the stairwell's sloped side walls.
  const stairs = useMemo(() => {
    const run = STAIR_BOTTOM - STAIR_TOP
    const n = Math.round(run / 0.26)
    return Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n
      const y = DEPTH * (1 - t)
      return { b: STAIR_TOP + run * t, y, d: run / n }
    })
  }, [])
  const slope = Math.atan2(DEPTH, STAIR_BOTTOM - STAIR_TOP)
  const stairLen = Math.hypot(DEPTH, STAIR_BOTTOM - STAIR_TOP)

  // Twenty taps on the back wall, in the beers' colors.
  const taps = useMemo(() => Array.from({ length: 20 }, (_, i) => ({ b: COUNTER.b0 + 0.6 + i * ((COUNTER.b1 - COUNTER.b0 - 1.2) / 19), color: ANTNBEE.beers[i % ANTNBEE.beers.length].tap })), [])

  // The bartender turns to whoever's at the bar.
  const staff = useRef<THREE.Group | null>(null)
  useFrame(() => {
    const g = staff.current
    if (!g) return
    const [pa, pb] = toLocal(it.place, focus.current.x, focus.current.y)
    const want = Math.atan2(pa - BARTENDER[0], pb - BARTENDER[1])
    let d = want - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * 0.08
    g.position.y = Math.sin(performance.now() / 700) * 0.01
  })

  const ledgeB0 = SOLID[3].b - SOLID[3].hb
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[(ROOM.a0 + ROOM.a1) / 2, 0.005, (ROOM.b0 + ROOM.b1) / 2]} material={mats.floor}>
        <planeGeometry args={[ROOM.a1 - ROOM.a0, ROOM.b1 - ROOM.b0]} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.a, WALL_H / 2, w.b]} rotation-y={w.ry} material={w.mat}>
          <boxGeometry args={[w.len, WALL_H, 0.24]} />
        </mesh>
      ))}

      {/* Stairs */}
      {stairs.map((s, i) => (
        <B key={i} a={STAIR_A} b={s.b} ha={STAIR_W / 2} hb={s.d / 2 + 0.01} y0={-0.2} h={s.y + 0.2} mat={mats.step} />
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[STAIR_A + side * (STAIR_W / 2 + 0.1), DEPTH / 2 + 0.55, (STAIR_TOP + STAIR_BOTTOM) / 2]} rotation-x={slope} material={walls[0].mat}>
          <boxGeometry args={[0.2, 1.3, stairLen]} />
        </mesh>
      ))}
      <Pic a={STAIR_A} b={ROOM.b0 + 0.13} y={1.95} w={0.9} h={0.28} n={[0, 1]} tex={tex.exit} glow />

      {/* L-shaped counter: dark wood with a lighter top */}
      {SOLID.slice(0, 2).map((s, i) => (
        <group key={i}>
          <B a={s.a} b={s.b} ha={s.ha} hb={s.hb} h={1.0} mat={mats.wood} />
          <B a={s.a + (i === 0 ? 0.06 : 0)} b={s.b + (i === 1 ? 0.06 : 0)} ha={s.ha + (i === 0 ? 0.1 : 0.02)} hb={s.hb + (i === 1 ? 0.1 : 0.02)} y0={1.0} h={0.06} mat={mats.top} />
        </group>
      ))}
      {/* Fridge and register at the front end */}
      <B a={SOLID[2].a} b={SOLID[2].b} ha={SOLID[2].ha} hb={SOLID[2].hb} h={1.6} mat={mats.steel} />
      <B a={SOLID[2].a + 0.3} b={SOLID[2].b + 0.3} ha={0.2} hb={0.16} y0={1.6} h={0.22} mat={mats.dark} />

      {/* Back bar: low cabinet, tap panel with twenty taps, shelves of bottles */}
      <B a={ROOM.a0 + 0.25} b={(COUNTER.b0 + COUNTER.b1) / 2} ha={0.25} hb={(COUNTER.b1 - COUNTER.b0) / 2} h={0.9} mat={mats.wood} />
      <B a={ROOM.a0 + 0.06} b={(COUNTER.b0 + COUNTER.b1) / 2} ha={0.06} hb={(COUNTER.b1 - COUNTER.b0) / 2 - 0.2} y0={0.9} h={0.55} mat={mats.steel} />
      {taps.map((t, i) => (
        <group key={i} position={[ROOM.a0 + 0.14, 1.2, t.b]}>
          <mesh position={[0.06, 0, 0]}>
            <boxGeometry args={[0.12, 0.04, 0.04]} />
            <meshLambertMaterial color="#d7dbe0" />
          </mesh>
          <mesh position={[0.11, 0.13, 0]}>
            <boxGeometry args={[0.035, 0.22, 0.05]} />
            <meshLambertMaterial color={t.color} />
          </mesh>
        </group>
      ))}
      {[1.62, 1.95].map((y) => (
        <group key={y}>
          <B a={ROOM.a0 + 0.16} b={COUNTER.b0 + 1.0} ha={0.16} hb={0.9} y0={y} h={0.03} mat={mats.top} />
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[ROOM.a0 + 0.16, y + 0.14, COUNTER.b0 + 0.25 + i * 0.19]}>
              <cylinderGeometry args={[0.04, 0.045, 0.24, 8]} />
              <meshLambertMaterial color={['#2e5e3a', '#6b3a1e', '#c9a24a', '#1f2c4a', '#7a2230'][(i + y * 10) % 5 | 0]} />
            </mesh>
          ))}
        </group>
      ))}
      <Pic a={ROOM.a0 + 0.12} b={7.6} y={1.82} w={1.4} h={0.88} n={[1, 0]} tex={tex.logo} />
      <Pic a={ROOM.a0 + 0.12} b={9.6} y={1.6} w={1.2} h={1.5} n={[1, 0]} tex={tex.board} />

      {/* Stools along the counter */}
      {STOOLS.map(([a, b], i) => (
        <group key={i} position={[a, 0, b]}>
          <mesh position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.03, 0.05, 0.74, 6]} />
            <meshLambertMaterial color="#2a2a2a" />
          </mesh>
          <mesh position={[0, 0.76, 0]}>
            <cylinderGeometry args={[0.19, 0.17, 0.07, 14]} />
            <meshLambertMaterial color="#6e2b22" />
          </mesh>
        </group>
      ))}
      {/* Pendant lamps over the counter */}
      {[5.4, 7.0, 8.6, 10.2].map((b) => (
        <group key={b} position={[COUNTER.front - 0.3, 0, b]}>
          <mesh position={[0, 2.05, 0]} material={mats.shade}>
            <coneGeometry args={[0.14, 0.16, 14, 1, true]} />
          </mesh>
          <mesh position={[0, 1.95, 0]} material={mats.bulb}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        </group>
      ))}
      {/* Glasses: the regulars', and whatever you've ordered */}
      {[5.85, 7.6, 9.1].map((b) => (
        <mesh key={b} position={[COUNTER.front - 0.22, 1.15, b]} material={mats.beer}>
          <cylinderGeometry args={[0.045, 0.035, 0.16, 10]} />
        </mesh>
      ))}
      {glasses.map((g, i) => (
        <group key={i} position={[COUNTER.front - 0.2, 1.06, g.b + ((i % 3) - 1) * 0.12]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.05, 0.04, 0.16, 12]} />
            <meshLambertMaterial color={g.color} transparent opacity={0.92} />
          </mesh>
          <mesh position={[0, 0.175, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
            <meshLambertMaterial color="#fbf6ea" />
          </mesh>
        </group>
      ))}

      {/* Standing tables and the ledge with the TV over it */}
      {SOLID.slice(4, 6).map((s, i) => (
        <group key={i} position={[s.a, 0, s.b]}>
          <mesh position={[0, 0.52, 0]}>
            <cylinderGeometry args={[0.04, 0.2, 1.04, 8]} />
            <meshLambertMaterial color="#2a2a2a" />
          </mesh>
          <mesh position={[0, 1.05, 0]} material={mats.top}>
            <cylinderGeometry args={[0.34, 0.34, 0.05, 18]} />
          </mesh>
          <mesh position={[0.1, 1.16, 0.08]} material={mats.beer}>
            <cylinderGeometry args={[0.045, 0.035, 0.16, 10]} />
          </mesh>
        </group>
      ))}
      <B a={SOLID[3].a} b={SOLID[3].b} ha={SOLID[3].ha} hb={SOLID[3].hb} y0={1.02} h={0.05} mat={mats.top} />
      <B a={ROOM.a1 - 0.05} b={SOLID[3].b} ha={0.05} hb={0.5} y0={1.45} h={0.62} mat={mats.dark} />
      <Pic a={ROOM.a1 - 0.1} b={SOLID[3].b} y={1.76} w={0.92} h={0.52} n={[-1, 0]} tex={tex.tv} glow />
      <Pic a={ROOM.a1 - 0.12} b={ledgeB0 - 0.7} y={1.55} w={0.6} h={0.84} n={[-1, 0]} tex={tex.posters[0]} />
      <Pic a={ROOM.a1 - 0.12} b={10.65} y={1.95} w={0.8} h={0.25} n={[-1, 0]} tex={tex.toilet} />
      <B a={ROOM.a1 - 0.06} b={10.65} ha={0.05} hb={0.42} h={1.8} mat={mats.wood} />
      <Pic a={3.0} b={ROOM.b0 + 0.12} y={1.6} w={0.7} h={0.22} n={[0, 1]} tex={tex.nosmoking} />
      <Pic a={-0.6} b={ROOM.b1 - 0.12} y={1.55} w={0.6} h={0.84} n={[0, -1]} tex={tex.posters[1]} />
      <Pic a={2.6} b={ROOM.b1 - 0.12} y={1.55} w={0.6} h={0.84} n={[0, -1]} tex={tex.posters[2]} />

      {/* Back room: partition, bench along the back wall, tables and chairs */}
      <B a={SOLID[10].a} b={SOLID[10].b} ha={SOLID[10].ha} hb={SOLID[10].hb} h={1.3} mat={mats.wood} />
      <B a={SOLID[6].a} b={SOLID[6].b} ha={SOLID[6].ha} hb={SOLID[6].hb} h={0.45} mat={mats.leather} />
      <B a={SOLID[6].a} b={ROOM.b1 - 0.08} ha={SOLID[6].ha} hb={0.08} y0={0.45} h={0.5} mat={mats.leather} />
      {SOLID.slice(7, 10).map((s, i) => (
        <group key={i}>
          <B a={s.a} b={s.b} ha={s.ha} hb={s.hb} y0={0.68} h={0.05} mat={mats.top} />
          <B a={s.a} b={s.b} ha={0.04} hb={0.04} h={0.68} mat={mats.dark} />
          <mesh position={[s.a - 0.15, 0.81, s.b + 0.1]} material={mats.beer}>
            <cylinderGeometry args={[0.045, 0.035, 0.16, 10]} />
          </mesh>
        </group>
      ))}
      {CHAIRS.map(([a, b], i) => (
        <group key={i} position={[a, 0, b]}>
          <B a={0} b={0} ha={0.2} hb={0.2} y0={0.42} h={0.05} mat={mats.wood} />
          <B a={0} b={-0.18} ha={0.2} hb={0.03} y0={0.47} h={0.45} mat={mats.wood} />
          <B a={0} b={0} ha={0.03} hb={0.03} h={0.42} mat={mats.dark} />
        </group>
      ))}

      {/* People: the bartender and a few regulars */}
      <Person look={STAFF} position={[BARTENDER[0], 0, BARTENDER[1]]} face={Math.PI / 2} refCb={(g) => void (staff.current = g)} />
      {GUESTS.map((g, i) => (
        <Person key={i} look={g.look} position={[g.at[0], 0, g.at[1]]} face={g.face} />
      ))}

      {/* Warm light */}
      <pointLight position={[COUNTER.front - 0.3, 2.0, 6.2]} color="#ffbf73" intensity={6} distance={7} decay={1.4} />
      <pointLight position={[COUNTER.front - 0.3, 2.0, 9.4]} color="#ffbf73" intensity={6} distance={7} decay={1.4} />
      <pointLight position={[1.6, 2.1, 12.8]} color="#ffc98a" intensity={5} distance={7} decay={1.4} />
      <pointLight position={[2.0, 2.1, 5.0]} color="#ffd9a8" intensity={3} distance={6} decay={1.4} />
    </>
  )
}

/** On the street: the stairwell down, with the bar's signs. */
function AntNBeeFront({ glow }: { glow: boolean }) {
  const tex = useMemo(
    () => ({
      board: logoBoard('B1 ↓'),
      small: logoBoard(),
      plate: plateTex(ANTNBEE.signs.street.t, "CRAFT BEER BAR · ANT 'N BEE B1"),
      stripes: canvasTexture(256, 64, (ctx) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#f2b705' : '#151515'
          ctx.fillRect(i * 32, 0, 32, 64)
        }
      }),
    }),
    [],
  )
  // Steps from the pavement down; the building hides all but the top few.
  const steps = useMemo(() => {
    const run = STAIR_BOTTOM - STAIR_TOP
    const n = Math.round(run / 0.26)
    return Array.from({ length: n }, (_, i) => ({ b: STAIR_TOP + run * ((i + 0.5) / n), y: DEPTH * (1 - (i + 0.5) / n), d: run / n }))
  }, [])
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex])
  const top = DEPTH
  return (
    <>
      {/* The steep steps going down into the dark, with a metal railing around the top */}
      {steps.map((st, i) => (
        <B key={i} a={STAIR_A} b={st.b} ha={STAIR_W / 2} hb={st.d / 2 + 0.01} y0={st.y - 0.3} h={0.3} color={i % 2 ? '#4a423c' : '#3f3833'} />
      ))}
      <mesh position={[STAIR_A, top - 1.4, (STAIR_TOP + 0) / 2 + 1.2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[STAIR_W, 3]} />
        <meshBasicMaterial color="#0e0b09" />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <B a={STAIR_A + s * (STAIR_W / 2 + 0.05)} b={STAIR_TOP / 2} ha={0.02} hb={-STAIR_TOP / 2} y0={top + 0.9} h={0.04} color="#8b8f96" />
          {[STAIR_TOP, STAIR_TOP / 2].map((b) => (
            <B key={b} a={STAIR_A + s * (STAIR_W / 2 + 0.05)} b={b} ha={0.02} hb={0.02} y0={top} h={0.92} color="#8b8f96" />
          ))}
          <B a={STAIR_A + s * (STAIR_W / 2 + 0.05)} b={STAIR_TOP / 2} ha={0.05} hb={-STAIR_TOP / 2} y0={top} h={0.1} color="#6b6f76" />
        </group>
      ))}
      <B a={STAIR_A} b={STAIR_TOP} ha={STAIR_W / 2 + 0.05} hb={0.02} y0={top + 0.9} h={0.04} color="#8b8f96" />
      {/* Doorway in the building face, and a striped canopy over it */}
      <mesh position={[STAIR_A, top + 1.1, -0.03]} rotation-y={Math.PI}>
        <planeGeometry args={[STAIR_W + 0.2, 2.2]} />
        <meshBasicMaterial color="#120f0c" />
      </mesh>
      <mesh position={[STAIR_A, top + 2.45, -0.3]} rotation-x={0.15}>
        <boxGeometry args={[STAIR_W + 0.5, 0.05, 0.6]} />
        <meshLambertMaterial map={tex.stripes} />
      </mesh>
      <Pic a={STAIR_A} b={-0.06} y={top + 2.85} w={1.6} h={0.4} n={[0, -1]} tex={tex.plate} glow={glow} />
      {/* Standing lightbox sign on the pavement */}
      <group position={[STAIR_A - STAIR_W / 2 - 0.55, top, -0.55]}>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.56, 1.3, 0.22]} />
          <meshLambertMaterial color="#f4f1ea" emissive={glow ? '#5a5240' : '#000'} />
        </mesh>
        {[0, Math.PI].map((ry) => (
          <mesh key={ry} position={[0, 0.85, ry ? 0.115 : -0.115]} rotation-y={ry + Math.PI}>
            <planeGeometry args={[0.52, 0.33]} />
            {glow ? <meshBasicMaterial map={tex.board} toneMapped={false} /> : <meshLambertMaterial map={tex.board} />}
          </mesh>
        ))}
      </group>
      {/* Hanging sign over the door, sticking out so you see it down the street */}
      <group position={[STAIR_A + STAIR_W / 2 + 0.45, top + 3.4, -0.45]}>
        <mesh position={[0, 0.3, 0.3]}>
          <boxGeometry args={[0.04, 0.04, 0.7]} />
          <meshLambertMaterial color="#222" />
        </mesh>
        {[Math.PI / 2, -Math.PI / 2].map((ry) => (
          <mesh key={ry} rotation-y={ry} position={[ry > 0 ? 0.02 : -0.02, 0, 0]}>
            <planeGeometry args={[0.8, 0.5]} />
            {glow ? <meshBasicMaterial map={tex.small} toneMapped={false} /> : <meshLambertMaterial map={tex.small} />}
          </mesh>
        ))}
      </group>
    </>
  )
}

/** The walk-in places. `under`: the player is below the street. */
export function Interiors({ interiors, focus, under, night, glasses }: { interiors: Interior[]; focus: React.RefObject<Focus>; under: boolean; night: boolean; glasses: Glass[] }) {
  return (
    <>
      {interiors.map((it) => {
        const len = Math.hypot(it.place.ux, it.place.uy) || 1
        const ry = Math.atan2(-it.place.uy / len, it.place.ux / len)
        if (it.id === 'nact') return under ? <NactRoom key={it.id} it={it} /> : null
        if (it.id === 'donki')
          return under ? (
            <group key={it.id} position={[it.place.x, it.z, it.place.y]} rotation-y={ry}>
              <DonkiRoom it={it} />
            </group>
          ) : null
        if (it.id !== 'antnbee') return null
        return (
          <group key={it.id} position={[it.place.x, it.z, it.place.y]} rotation-y={ry}>
            {under ? <AntNBeeRoom it={it} focus={focus} glasses={glasses} /> : <AntNBeeFront glow={night} />}
          </group>
        )
      })}
    </>
  )
}
