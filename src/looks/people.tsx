import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { PLAYER_LOOK, randomLook, type Look } from '../game/character'
import { CURB, useLook, type Role } from './scene'
import { signTexture } from './signs'

// Toy figures for the diorama look: chunky rounded blocks like a wooden or
// vinyl figurine, a big head (about three heads tall), dot eyes and a little
// blush. Colors come from the same random looks as the game's crowd.

type V3 = [number, number, number]

function Piece({ p, s, r, role, color }: { p: V3; s: V3; r: number; role: Role; color: string }) {
  const look = useLook()
  const c = look.tint ? look.tint(role, color) : color
  return (
    <RoundedBox args={s} radius={Math.min(r, Math.min(...s) / 2 - 0.001)} smoothness={4} position={p} castShadow receiveShadow>
      {look.Mat({ role, color: c })}
    </RoundedBox>
  )
}

const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString()

export interface FigureRig {
  legL: THREE.Group | null
  legR: THREE.Group | null
  armL: THREE.Group | null
  armR: THREE.Group | null
  body: THREE.Group | null
}

/** One toy figure, standing, about 1.75 m before scaling. */
export function ToyFigure({ look, rig }: { look: Look; rig: React.RefObject<FigureRig> }) {
  const style = useLook()
  const set = (k: keyof FigureRig) => (g: THREE.Group | null) => void (rig.current[k] = g)
  const leg = (x: number, k: 'legL' | 'legR') => (
    <group position={[x, 0.56, 0]} ref={set(k)}>
      <group position={[0, -0.56, 0]}>
        <Piece p={[0, 0.33, 0]} s={[0.19, 0.46, 0.21]} r={0.07} role="cloth" color={look.pants} />
        <Piece p={[0, 0.07, 0.03]} s={[0.21, 0.14, 0.3]} r={0.06} role="cloth" color={shade(look.pants, 0.55)} />
      </group>
    </group>
  )
  const arm = (x: number, k: 'armL' | 'armR') => (
    <group position={[x, 1.04, 0]} ref={set(k)}>
      <group position={[-x, -1.04, 0]}>
        <Piece p={[x, 0.84, 0]} s={[0.14, 0.42, 0.16]} r={0.065} role="cloth" color={look.shirt} />
        <mesh position={[x, 0.6, 0]} castShadow>
          <sphereGeometry args={[0.075, 16, 12]} />
          {style.Mat({ role: 'skin', color: style.tint ? style.tint('skin', look.skin) : look.skin })}
        </mesh>
      </group>
    </group>
  )
  // Hairstyle and extras vary per person, picked from their look so they stay put.
  const h = [...(look.shirt + look.hair + look.pants)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const hat = !look.longHair && h % 4 === 0
  const bun = look.longHair && h % 3 === 0
  const glasses = h % 5 === 1
  const hair = (
    <>
      {!hat && <Piece p={[0, 1.6, -0.02]} s={[0.6, 0.2, 0.55]} r={0.09} role="hair" color={look.hair} />}
      {look.longHair && !bun ? (
        <>
          <Piece p={[0, 1.33, -0.19]} s={[0.6, 0.62, 0.16]} r={0.07} role="hair" color={look.hair} />
          {/* Side locks frame the face from the front. */}
          {[-0.27, 0.27].map((x) => (
            <Piece key={x} p={[x, 1.3, 0.02]} s={[0.1, 0.5, 0.42]} r={0.045} role="hair" color={look.hair} />
          ))}
        </>
      ) : (
        <Piece p={[0, 1.47, -0.2]} s={[0.6, 0.32, 0.14]} r={0.06} role="hair" color={look.hair} />
      )}
      {bun && (
        <mesh position={[0, 1.78, -0.1]} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
          {style.Mat({ role: 'hair', color: style.tint ? style.tint('hair', look.hair) : look.hair })}
        </mesh>
      )}
      {hat ? (
        <>
          <Piece p={[0, 1.65, -0.02]} s={[0.62, 0.22, 0.56]} r={0.1} role="cloth" color={look.bag} />
          <Piece p={[0, 1.57, 0.3]} s={[0.5, 0.05, 0.22]} r={0.02} role="cloth" color={look.bag} />
        </>
      ) : (
        <Piece p={[0.06, 1.53, 0.23]} s={[0.46, 0.1, 0.08]} r={0.035} role="hair" color={look.hair} />
      )}
      {glasses &&
        [-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 1.39, 0.262]}>
            <torusGeometry args={[0.065, 0.014, 6, 20]} />
            <meshBasicMaterial color="#2a2320" />
          </mesh>
        ))}
    </>
  )
  return (
    <group>
      {leg(-0.12, 'legL')}
      {leg(0.12, 'legR')}
      <group ref={set('body')}>
        <Piece p={[0, 0.82, 0]} s={[0.52, 0.56, 0.34]} r={0.13} role="cloth" color={look.shirt} />
        {look.backpack && <Piece p={[0, 0.86, -0.24]} s={[0.36, 0.4, 0.16]} r={0.07} role="cloth" color={look.bag} />}
        {/* Head: a soft cube reads more toy-like than a ball. */}
        <Piece p={[0, 1.37, 0]} s={[0.56, 0.52, 0.5]} r={0.2} role="skin" color={look.skin} />
        {hair}
        {/* Face */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 1.38, 0.252]}>
            <capsuleGeometry args={[0.028, 0.04, 4, 8]} />
            <meshBasicMaterial color="#2a2320" />
          </mesh>
        ))}
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 1.3, 0.251]} rotation={[0, 0, Math.PI / 2]}>
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial color="#f4a3a3" transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
      {arm(-0.34, 'armL')}
      {arm(0.34, 'armR')}
    </group>
  )
}

interface Walker {
  look: Look
  from: [number, number]
  to: [number, number]
  speed: number
  phase: number
}

interface Talker {
  look: Look
  at: [number, number]
  /** Facing angle (0 = +z, toward the camera side). */
  turn: number
  say?: string
  phase: number
}

const SCALE = 1.25

function useRig() {
  return useRef<FigureRig>({ legL: null, legR: null, armL: null, armR: null, body: null })
}

function WalkingToy({ w }: { w: Walker }) {
  const root = useRef<THREE.Group>(null)
  const rig = useRig()
  const span = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1])
  const heading = Math.atan2(w.to[0] - w.from[0], w.to[1] - w.from[1])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + w.phase
    const u = (t * w.speed) % (span * 2)
    const forward = u < span
    const d = (forward ? u : span * 2 - u) / span
    const g = root.current
    if (g) {
      g.position.set(w.from[0] + (w.to[0] - w.from[0]) * d, CURB + Math.abs(Math.sin(t * 6)) * 0.06, w.from[1] + (w.to[1] - w.from[1]) * d)
      g.rotation.y = forward ? heading : heading + Math.PI
    }
    const s = Math.sin(t * 6) * 0.6
    const r = rig.current
    if (r.legL) r.legL.rotation.x = s
    if (r.legR) r.legR.rotation.x = -s
    if (r.armL) r.armL.rotation.x = -s * 0.8
    if (r.armR) r.armR.rotation.x = s * 0.8
    // A little side-to-side waddle sells the toy look.
    if (r.body) r.body.rotation.z = Math.sin(t * 6) * 0.04
  })
  return (
    <group ref={root} scale={SCALE}>
      <ToyFigure look={w.look} rig={rig} />
    </group>
  )
}

function TalkingToy({ p }: { p: Talker }) {
  const rig = useRig()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + p.phase
    const r = rig.current
    // Idle sway, and a talking hand now and then.
    if (r.body) r.body.rotation.z = Math.sin(t * 1.4) * 0.03
    const talk = Math.max(0, Math.sin(t * 0.9))
    if (r.armR) {
      r.armR.rotation.x = -talk * 1.1 + Math.sin(t * 7) * 0.08 * talk
      r.armR.rotation.z = talk * 0.25
    }
    if (r.armL) r.armL.rotation.x = 0
  })
  const bubble = useMemo(() => (p.say ? signTexture(p.say, { bg: '#ffffff', fg: '#3a3028', w: 480, h: 160 }) : null), [p.say])
  return (
    <group position={[p.at[0], CURB, p.at[1]]} rotation={[0, p.turn, 0]}>
      <group scale={SCALE}>
        <ToyFigure look={p.look} rig={rig} />
      </group>
      {bubble && <Bubble map={bubble} turn={-p.turn} />}
    </group>
  )
}

/** A speech bubble that always faces the default camera. */
function Bubble({ map, turn }: { map: THREE.Texture; turn: number }) {
  const look = useLook()
  return (
    <group position={[0, 2.75, 0]} rotation={[0, turn - 0.66, 0]}>
      <RoundedBox args={[2.1, 0.75, 0.12]} radius={0.05} smoothness={4} castShadow>
        {look.Mat({ role: 'sign', color: '#ffffff' })}
      </RoundedBox>
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[1.95, 0.62]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[-0.35, -0.46, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.14, 0.22, 4]} />
        {look.Mat({ role: 'sign', color: '#ffffff' })}
      </mesh>
    </group>
  )
}

/** Toy people around the block: walkers on every sidewalk, and two people chatting outside the konbini. */
export function ToyPeople() {
  const { walkers, talkers } = useMemo(() => {
    let s = 11
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const walkers: Walker[] = [
      { look: PLAYER_LOOK, from: [-20, 8], to: [-7, 8], speed: 1.3, phase: 0 },
      { look: randomLook(rand), from: [9, 8.3], to: [30, 8.3], speed: 1.2, phase: 3 },
      { look: randomLook(rand), from: [-30, -7.3], to: [-9, -7.3], speed: 1.1, phase: 4 },
      { look: randomLook(rand), from: [-5.8, 11], to: [-5.8, 30], speed: 1.25, phase: 5 },
      { look: randomLook(rand), from: [5.8, -30], to: [5.8, -10], speed: 1.15, phase: 1 },
      { look: randomLook(rand), from: [10, -7.6], to: [28, -7.6], speed: 1.35, phase: 12 },
      { look: randomLook(rand), from: [26, 9.2], to: [12, 9.2], speed: 1.0, phase: 7 },
    ]
    const talkers: Talker[] = [
      { look: randomLook(rand), at: [-13.9, -8.7], turn: Math.PI / 2 - 0.5, say: 'ねえ、ひま？', phase: 0 },
      { look: randomLook(rand), at: [-12.5, -8.7], turn: -Math.PI / 2 + 0.5, phase: 2.2 },
    ]
    return { walkers, talkers }
  }, [])
  const out: ReactNode[] = []
  walkers.forEach((w, i) => out.push(<WalkingToy key={`w${i}`} w={w} />))
  talkers.forEach((p, i) => out.push(<TalkingToy key={`t${i}`} p={p} />))
  return <group>{out}</group>
}

function Posed({ look, x, wave }: { look: Look; x: number; wave?: boolean }) {
  const rig = useRig()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + x
    const r = rig.current
    if (r.body) r.body.rotation.z = Math.sin(t * 1.3) * 0.03
    if (wave && r.armR) {
      r.armR.rotation.z = 2.6 + Math.sin(t * 6) * 0.25
    }
  })
  return (
    <group position={[x, 0.3, 0]} scale={SCALE * look.height}>
      <ToyFigure look={look} rig={rig} />
    </group>
  )
}

/** ?focus=lineup: a row of figures on a little stand, like a character sheet. */
export function Lineup() {
  const looks = useMemo(() => {
    let s = 5
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const out = [PLAYER_LOOK]
    while (out.length < 6) out.push(randomLook(rand))
    out[2] = { ...out[2], longHair: true }
    out[4] = { ...out[4], longHair: true, backpack: false }
    out[5] = { ...out[5], longHair: false }
    return out
  }, [])
  const style = useLook()
  return (
    <group>
      <RoundedBox args={[14, 0.6, 3.4]} radius={0.25} smoothness={4} receiveShadow castShadow>
        {style.Mat({ role: 'walk', color: '#efe2cf' })}
      </RoundedBox>
      {looks.map((l, i) => (
        <Posed key={i} look={l} x={(i - 2.5) * 2.1} wave={i === 0} />
      ))}
    </group>
  )
}
