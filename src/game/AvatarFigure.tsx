import { RoundedBox } from '@react-three/drei'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { BUILD_WIDTH, HEIGHT_SCALE, type Avatar } from './avatar'

// The player's toy figure, built from their Avatar: the same soft blocks
// and proportions as the people on the street (character.ts), with the
// hairstyle, outfit, face and extras they picked in the creator. Used in
// the game (Player.tsx) and on the creator's turntable.

/** Limbs that swing while walking, and the body that bobs. */
export interface AvatarRig {
  legL: THREE.Group | null
  legR: THREE.Group | null
  armL: THREE.Group | null
  armR: THREE.Group | null
  body: THREE.Group | null
}

export const emptyRig = (): AvatarRig => ({ legL: null, legR: null, armL: null, armR: null, body: null })

/** Same as the street's people (character.ts TOY_SCALE). */
export const AVATAR_SCALE = 1.15

type V3 = [number, number, number]

const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString()
const mix = (a: string, b: string, k: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()

function B({ p, s, r, c, rot, shadow = true }: { p: V3; s: V3; r: number; c: string; rot?: V3; shadow?: boolean }) {
  return (
    <RoundedBox args={s} radius={Math.min(r, Math.min(...s) / 2 - 0.001)} smoothness={3} position={p} rotation={rot} castShadow={shadow}>
      <meshLambertMaterial color={c} />
    </RoundedBox>
  )
}

function Ball({ p, r, c, scale }: { p: V3; r: number; c: string; scale?: V3 }) {
  return (
    <mesh position={p} scale={scale} castShadow>
      <sphereGeometry args={[r, 16, 12]} />
      <meshLambertMaterial color={c} />
    </mesh>
  )
}

const INK = '#2a2320'

/** One player figure, standing at the origin facing +z. */
export function AvatarFigure({ avatar: a, rig, shadow = true }: { avatar: Avatar; rig?: React.RefObject<AvatarRig>; shadow?: boolean }) {
  const set = (k: keyof AvatarRig) => (g: THREE.Group | null) => {
    if (rig) rig.current[k] = g
  }
  const w = BUILD_WIDTH[a.build]
  const dz = 0.34 * (0.85 + 0.15 * w)
  const legX = 0.12 * (0.7 + 0.3 * w)
  const legW = 0.19 * (0.8 + 0.2 * w)
  const armX = 0.26 * w + 0.08
  const skirted = a.outfit === 'dress' || a.outfit === 'skirt'
  const legColor = skirted ? a.skin : a.bottom
  const shoe = a.outfit === 'tee' || a.outfit === 'hoodie' ? '#ece8df' : skirted ? (a.bottom === a.top ? '#3a3330' : shade(a.bottom, 0.6)) : '#3a3330'
  const sleeve = a.outfit === 'tee' || a.outfit === 'dress' ? 'short' : 'long'

  const leg = (x: number, k: 'legL' | 'legR') => (
    <group position={[x, 0.56, 0]} ref={set(k)}>
      <group position={[-x, -0.56, 0]}>
        <B p={[x, 0.33, 0]} s={[legW, 0.46, 0.21]} r={0.07} c={legColor} />
        <B p={[x, 0.07, 0.03]} s={[legW + 0.02, 0.14, 0.3]} r={0.06} c={shoe} />
      </group>
    </group>
  )
  const arm = (x: number, k: 'armL' | 'armR') => (
    <group position={[x, 1.04, 0]} ref={set(k)}>
      <group position={[-x, -1.04, 0]}>
        {sleeve === 'short' ? (
          <>
            <B p={[x, 0.96, 0]} s={[0.16, 0.18, 0.18]} r={0.07} c={a.top} />
            <B p={[x, 0.79, 0]} s={[0.12, 0.3, 0.14]} r={0.055} c={a.skin} />
          </>
        ) : (
          <B p={[x, 0.84, 0]} s={[0.14, 0.42, 0.16]} r={0.065} c={a.top} />
        )}
        <Ball p={[x, 0.6, 0]} r={0.075} c={a.skin} />
      </group>
    </group>
  )

  // Outfit details on the torso.
  const front = dz / 2 + 0.004
  const outfit: ReactNode[] = []
  if (a.outfit === 'hoodie') {
    outfit.push(<B key="hood" p={[0, 1.08, -dz / 2 + 0.02]} s={[0.46 * w, 0.18, 0.2]} r={0.08} c={a.top} />)
    outfit.push(<B key="pocket" p={[0, 0.68, front]} s={[0.32 * w, 0.13, 0.02]} r={0.01} c={shade(a.top, 0.82)} shadow={false} />)
    for (const x of [-0.07, 0.07]) outfit.push(<B key={`s${x}`} p={[x, 0.98, front + 0.005]} s={[0.025, 0.14, 0.02]} r={0.008} c="#f4f1e8" shadow={false} />)
  } else if (a.outfit === 'shirt') {
    for (const sx of [-1, 1])
      outfit.push(<B key={`c${sx}`} p={[sx * 0.08, 1.06, front - 0.02]} s={[0.15, 0.07, 0.05]} r={0.02} rot={[0, 0, sx * 0.35]} c={mix(a.top, '#ffffff', 0.55)} shadow={false} />)
    outfit.push(<B key="placket" p={[0, 0.8, front]} s={[0.035, 0.46, 0.015]} r={0.006} c={shade(a.top, 0.78)} shadow={false} />)
  } else if (a.outfit === 'jacket') {
    outfit.push(<B key="inner" p={[0, 0.84, front]} s={[0.15, 0.5, 0.015]} r={0.006} c={a.top === '#f4f1e8' ? '#2b3445' : '#f4f1e8'} shadow={false} />)
    for (const sx of [-1, 1]) outfit.push(<B key={`l${sx}`} p={[sx * 0.1, 0.96, front + 0.006]} s={[0.05, 0.22, 0.015]} r={0.006} rot={[0, 0, -sx * 0.25]} c={shade(a.top, 0.75)} shadow={false} />)
  } else if (skirted) {
    const c = a.outfit === 'dress' ? a.top : a.bottom
    outfit.push(
      <mesh key="skirt" position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.26 * w, 0.36 * w, 0.3, 20]} />
        <meshLambertMaterial color={c} />
      </mesh>,
    )
    if (a.outfit === 'skirt') outfit.push(<B key="band" p={[0, 0.64, 0]} s={[0.53 * w, 0.05, dz + 0.01]} r={0.02} c={shade(a.bottom, 0.8)} shadow={false} />)
  } else {
    // T-shirt: a ribbed neck.
    outfit.push(<B key="neck" p={[0, 1.09, 0.02]} s={[0.24, 0.03, 0.22]} r={0.012} c={shade(a.top, 0.85)} shadow={false} />)
  }

  // Hair, under a hat if there is one.
  const hc = a.hairColor
  const hatted = a.hat !== 'none'
  const hair: ReactNode[] = []
  const top = (h = 0.2) => !hatted && hair.push(<B key="top" p={[0, 1.6, -0.02]} s={[0.6, h, 0.55]} r={0.09} c={hc} />)
  const back = () => hair.push(<B key="back" p={[0, 1.47, -0.2]} s={[0.6, 0.32, 0.14]} r={0.06} c={hc} />)
  const fringe = () => !hatted && hair.push(<B key="fringe" p={[0.06, 1.53, 0.23]} s={[0.46, 0.1, 0.08]} r={0.035} c={hc} />)
  switch (a.hair) {
    case 'short':
      top()
      back()
      fringe()
      break
    case 'buzz':
      if (!hatted) hair.push(<B key="top" p={[0, 1.6, -0.01]} s={[0.585, 0.1, 0.53]} r={0.045} c={hc} />)
      hair.push(<B key="back" p={[0, 1.46, -0.215]} s={[0.585, 0.26, 0.09]} r={0.04} c={hc} />)
      break
    case 'spiky':
      top()
      back()
      if (!hatted) {
        const spikes: [number, number, number, number][] = [
          [-0.18, 0.02, 0.3, 0.2],
          [0, 0.06, 0, 0.24],
          [0.18, 0.02, -0.3, 0.2],
          [-0.1, -0.15, 0.2, 0.2],
          [0.1, -0.15, -0.2, 0.2],
        ]
        spikes.forEach(([x, z, tilt, h], i) =>
          hair.push(
            <mesh key={`sp${i}`} position={[x, 1.7 + h / 2 - 0.02, z]} rotation={[z < 0 ? -0.35 : 0.25, 0, tilt]} castShadow>
              <coneGeometry args={[0.09, h, 6]} />
              <meshLambertMaterial color={hc} />
            </mesh>,
          ),
        )
        hair.push(
          <mesh key="fr" position={[0, 1.58, 0.27]} rotation={[1.1, 0, 0]} castShadow>
            <coneGeometry args={[0.08, 0.16, 6]} />
            <meshLambertMaterial color={hc} />
          </mesh>,
        )
      }
      break
    case 'side':
      top()
      back()
      if (!hatted) {
        hair.push(<B key="sweep" p={[0.08, 1.56, 0.225]} s={[0.5, 0.12, 0.09]} r={0.04} rot={[0, 0, -0.18]} c={hc} />)
        hair.push(<B key="part" p={[-0.17, 1.69, -0.02]} s={[0.24, 0.07, 0.5]} r={0.03} c={hc} />)
      }
      break
    case 'bob':
      if (!hatted) hair.push(<B key="top" p={[0, 1.6, -0.02]} s={[0.62, 0.22, 0.57]} r={0.1} c={hc} />)
      hair.push(<B key="back" p={[0, 1.39, -0.205]} s={[0.62, 0.48, 0.15]} r={0.07} c={hc} />)
      for (const x of [-0.29, 0.29]) hair.push(<B key={`side${x}`} p={[x, 1.37, -0.01]} s={[0.1, 0.44, 0.5]} r={0.045} c={hc} />)
      if (!hatted) hair.push(<B key="fringe" p={[0, 1.54, 0.235]} s={[0.56, 0.12, 0.08]} r={0.035} c={hc} />)
      break
    case 'long':
      top()
      hair.push(<B key="back" p={[0, 1.31, -0.19]} s={[0.6, 0.66, 0.16]} r={0.07} c={hc} />)
      for (const x of [-0.27, 0.27]) hair.push(<B key={`lock${x}`} p={[x, 1.3, 0.02]} s={[0.1, 0.5, 0.42]} r={0.045} c={hc} />)
      fringe()
      break
    case 'ponytail':
      top()
      back()
      fringe()
      hair.push(<Ball key="band" p={[0, 1.5, -0.3]} r={0.055} c={a.accent} />)
      hair.push(
        <mesh key="tail" position={[0, 1.3, -0.35]} rotation={[0.25, 0, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.24, 4, 12]} />
          <meshLambertMaterial color={hc} />
        </mesh>,
      )
      break
    case 'bun':
      top()
      back()
      fringe()
      if (!hatted) hair.push(<Ball key="bun" p={[0, 1.79, -0.08]} r={0.14} c={hc} />)
      else hair.push(<Ball key="bun" p={[0, 1.45, -0.33]} r={0.12} c={hc} />)
      break
  }
  if (a.hat === 'cap') {
    hair.push(<B key="cap" p={[0, 1.65, -0.02]} s={[0.62, 0.22, 0.56]} r={0.1} c={a.accent} />)
    hair.push(<B key="brim" p={[0, 1.57, 0.3]} s={[0.5, 0.05, 0.22]} r={0.02} c={a.accent} />)
  } else if (a.hat === 'beanie') {
    hair.push(<B key="beanie" p={[0, 1.67, -0.01]} s={[0.62, 0.27, 0.56]} r={0.13} c={a.accent} />)
    hair.push(<B key="cuff" p={[0, 1.56, 0]} s={[0.64, 0.09, 0.58]} r={0.04} c={shade(a.accent, 0.8)} />)
    hair.push(<Ball key="pom" p={[0, 1.83, -0.01]} r={0.07} c={mix(a.accent, '#ffffff', 0.35)} />)
  }

  // Face: eyes, blush, glasses.
  const face: ReactNode[] = []
  for (const x of [-0.11, 0.11]) {
    if (a.eyes === 'dot')
      face.push(
        <mesh key={`e${x}`} position={[x, 1.38, 0.252]}>
          <capsuleGeometry args={[0.028, 0.04, 4, 8]} />
          <meshBasicMaterial color={INK} />
        </mesh>,
      )
    else if (a.eyes === 'round')
      face.push(
        <group key={`e${x}`} position={[x, 1.38, 0.25]}>
          <mesh scale={[1, 1.1, 0.35]}>
            <sphereGeometry args={[0.052, 16, 12]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[0.016, 0.02, 0.018]}>
            <sphereGeometry args={[0.016, 8, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>,
      )
    else if (a.eyes === 'smile')
      face.push(
        <mesh key={`e${x}`} position={[x, 1.365, 0.252]}>
          <torusGeometry args={[0.04, 0.012, 6, 16, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>,
      )
    else
      face.push(
        <mesh key={`e${x}`} position={[x, 1.37, 0.252]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.016, 0.05, 4, 8]} />
          <meshBasicMaterial color={INK} />
        </mesh>,
      )
  }
  if (a.blush)
    for (const x of [-0.18, 0.18])
      face.push(
        <mesh key={`b${x}`} position={[x, 1.3, 0.251]}>
          <circleGeometry args={[0.042, 16]} />
          <meshBasicMaterial color="#f4a3a3" transparent opacity={0.75} />
        </mesh>,
      )
  if (a.glasses !== 'none') {
    const sq = a.glasses === 'square'
    for (const x of [-0.11, 0.11])
      face.push(
        <mesh key={`g${x}`} position={[x, 1.385, 0.262]} rotation={[0, 0, sq ? Math.PI / 4 : 0]}>
          <torusGeometry args={[sq ? 0.082 : 0.066, 0.013, 6, sq ? 4 : 20]} />
          <meshBasicMaterial color={INK} />
        </mesh>,
      )
    face.push(
      <mesh key="bridge" position={[0, 1.395, 0.262]}>
        <boxGeometry args={[0.07, 0.014, 0.014]} />
        <meshBasicMaterial color={INK} />
      </mesh>,
    )
  }

  const s = AVATAR_SCALE * HEIGHT_SCALE[a.height]
  return (
    <group scale={s}>
      {leg(-legX, 'legL')}
      {leg(legX, 'legR')}
      <group ref={set('body')}>
        <B p={[0, 0.82, 0]} s={[0.52 * w, 0.56, dz]} r={0.13} c={a.top} shadow={shadow} />
        {outfit}
        {a.backpack && (
          <>
            <B p={[0, 0.86, -dz / 2 - 0.07]} s={[0.36, 0.4, 0.16]} r={0.07} c={a.accent} />
            {[-1, 1].map((sx) => (
              <B key={sx} p={[sx * 0.13 * w, 0.88, front]} s={[0.05, 0.4, 0.02]} r={0.01} c={shade(a.accent, 0.75)} shadow={false} />
            ))}
          </>
        )}
        <B p={[0, 1.37, 0]} s={[0.56, 0.52, 0.5]} r={0.2} c={a.skin} />
        {hair}
        {face}
      </group>
      {arm(-armX, 'armL')}
      {arm(armX, 'armR')}
    </group>
  )
}
