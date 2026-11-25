import { Environment, Lightformer, OrbitControls, OrthographicCamera, PerspectiveCamera, SoftShadows, Stars } from '@react-three/drei'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, SSAO, TiltShift2, Vignette } from '@react-three/postprocessing'
import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { PaintEffect } from './paint'
import { FOCUS, type LookStyle, type MatProps, type Role } from './scene'

// The five candidate looks. Each is the same block with its own materials,
// colors, light, camera and post-processing.

export interface LookDef {
  id: string
  name: string
  ja: string
  blurb: string
  style: LookStyle
  /** Canvas settings that differ per look. */
  shadows: 'soft' | 'percentage' | 'basic' | 'variance'
  flat?: boolean
  /** CSS behind a see-through canvas (null = the scene draws its own). */
  backdrop?: string
  /** Camera, lights, sky and post effects. */
  Stage: () => ReactNode
}

const color = new THREE.Color()
const hsl = { h: 0, s: 0, l: 0 }
function adjust(c: string, f: (h: { h: number; s: number; l: number }) => void) {
  color.set(c).getHSL(hsl)
  f(hsl)
  return '#' + color.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s)), Math.min(1, Math.max(0, hsl.l))).getHexString()
}

function Controls({ minPolar = 0.35, maxPolar = 1.2, target = FOCUS }: { minPolar?: number; maxPolar?: number; target?: [number, number, number] }) {
  return <OrbitControls makeDefault target={target} minPolarAngle={minPolar} maxPolarAngle={maxPolar} enableDamping maxDistance={160} minDistance={6} />
}

/** A camera position at a distance, compass angle (0 = from the south) and height angle. */
function orbit(dist: number, yawDeg: number, pitchDeg: number, focus = FOCUS): [number, number, number] {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  return [focus[0] + Math.sin(yaw) * Math.cos(pitch) * dist, focus[1] + Math.sin(pitch) * dist, focus[2] + Math.cos(yaw) * Math.cos(pitch) * dist]
}

function Sun({ pos, color = '#ffffff', intensity = 2.5, size = 60, mapSize = 4096, bias = -0.0004, radius }: { pos: [number, number, number]; color?: string; intensity?: number; size?: number; mapSize?: number; bias?: number; radius?: number }) {
  return (
    <directionalLight position={pos} color={color} intensity={intensity} castShadow shadow-mapSize={[mapSize, mapSize]} shadow-bias={bias} shadow-normalBias={0.04} shadow-radius={radius}>
      <orthographicCamera attach="shadow-camera" args={[-size, size, size, -size, 1, 300]} />
    </directionalLight>
  )
}

// ---- 1. Cel-shaded comic ------------------------------------------------

function useToonRamp() {
  return useMemo(() => {
    const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255])
    const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
    t.minFilter = THREE.NearestFilter
    t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }, [])
}

let toonRamp: THREE.DataTexture | null = null
function ToonMat({ color, map, glow, role }: MatProps) {
  if (role === 'paint' || role === 'sign' || role === 'lamp') return <meshBasicMaterial color={color} map={map} transparent={!!map} alphaTest={map ? 0.4 : 0} toneMapped={false} />
  return <meshToonMaterial color={color} map={map} gradientMap={toonRamp} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.3 : 0} />
}

function Cloud({ p, s }: { p: [number, number, number]; s: number }) {
  return (
    <group position={p} scale={s}>
      {[
        [0, 0, 0, 3],
        [3, -0.6, 0.5, 2.2],
        [-3, -0.8, 0, 2],
        [1.2, 1.4, -0.5, 2.1],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 20, 14]} />
          <meshToonMaterial color="#ffffff" gradientMap={toonRamp} />
        </mesh>
      ))}
    </group>
  )
}

function ToonStage() {
  toonRamp = useToonRamp()
  return (
    <>
      <PerspectiveCamera makeDefault fov={34} position={orbit(44, -16, 42)} />
      <Controls />
      <color attach="background" args={['#7cc7f2']} />
      <fog attach="fog" args={['#bfe6ff', 90, 260]} />
      {/* Cool violet fill so shadow tones read as comic-book blue, not grey. */}
      <ambientLight intensity={1.1} color="#b6b4ff" />
      <Sun pos={[-40, 70, 50]} intensity={2.4} color="#fff1d6" />
      <Cloud p={[-60, 55, -150]} s={3} />
      <Cloud p={[40, 70, -170]} s={4} />
      <Cloud p={[110, 45, -140]} s={2.5} />
    </>
  )
}

const toon: LookDef = {
  id: 'cel',
  name: 'Cel-shaded comic',
  ja: 'マンガ調',
  blurb: 'Bold ink outlines, two-tone shading and a bright summer sky, like a hand-inked comic page come to life.',
  shadows: 'basic',
  flat: true,
  style: {
    Mat: (p) => <ToonMat {...p} />,
    tint: (role, c) => (role === 'glass' ? '#9fd8ff' : role === 'road' ? '#4a4f5c' : adjust(c, (h) => ((h.s *= 1.35), (h.l = h.l * 0.92 + 0.06)))),
    outline: { color: '#1d1b26', thickness: 3.5, person: 2.2 },
    surroundings: true,
  },
  Stage: ToonStage,
}

// ---- 2. Soft toy diorama ------------------------------------------------

function DioramaMat({ color, map, glow, role }: MatProps) {
  if (role === 'paint') return <meshStandardMaterial color={color} map={map} transparent={!!map} alphaTest={map ? 0.4 : 0} roughness={0.9} />
  return <meshStandardMaterial color={color} map={map} roughness={role === 'glass' ? 0.25 : 0.82} metalness={0} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.25 : 0} />
}

/** ?focus=people zooms the diorama in on the people chatting outside the konbini. */
const PEOPLE_FOCUS: [number, number, number] = [-13.2, 1.3, -8.2]
const closeUp = new URLSearchParams(location.search).get('focus') === 'people'

function DioramaStage() {
  const focus = closeUp ? PEOPLE_FOCUS : FOCUS
  return (
    <>
      <OrthographicCamera makeDefault zoom={closeUp ? 95 : 20} position={orbit(120, closeUp ? -28 : -38, closeUp ? 24 : 38, focus)} near={-200} far={600} />
      <Controls minPolar={0.4} maxPolar={1.25} target={focus} />
      <SoftShadows size={18} samples={14} focus={0.6} />
      <hemisphereLight args={['#fff4e2', '#b9a389', 1.4]} />
      <Sun pos={[-55, 45, 30]} intensity={2.4} color="#ffd9a8" size={50} />
      <directionalLight position={[40, 30, -40]} intensity={0.5} color="#b8d4ff" />
      <EffectComposer multisampling={4}>
        <Vignette offset={0.3} darkness={0.35} />
      </EffectComposer>
    </>
  )
}

const diorama: LookDef = {
  id: 'diorama',
  name: 'Soft toy diorama',
  ja: 'ジオラマ',
  blurb: 'Rounded, pastel, clay-like pieces on a floating slab of earth under warm late-afternoon light, a city you could hold.',
  shadows: 'soft',
  backdrop: 'radial-gradient(ellipse at 50% 40%, #fff7ea 0%, #f2e2cc 55%, #dcc6a8 100%)',
  style: {
    Mat: (p) => <DioramaMat {...p} />,
    tint: (role, c) => {
      if (role === 'road') return '#7d7f8c'
      if (role === 'walk') return '#efe2cf'
      if (role === 'glass') return '#a9cfe6'
      if (role === 'dirt') return '#a77c57'
      if (role === 'hair') return adjust(c, (h) => (h.l = h.l * 0.85 + 0.08))
      return adjust(c, (h) => ((h.s = h.s * 0.85 + 0.12), (h.l = h.l * 0.7 + 0.3)))
    },
    rounded: 0.35,
    facetedTrees: true,
    toyPeople: true,
    surroundings: false,
  },
  Stage: DioramaStage,
}

// ---- 3. Watercolor sketchbook ------------------------------------------

function PaintMat({ color, map, role }: MatProps) {
  if (role === 'paint' || role === 'sign') return <meshBasicMaterial color={color} map={map} transparent={!!map} alphaTest={map ? 0.4 : 0} toneMapped={false} />
  return <meshLambertMaterial color={color} map={map} />
}

function PaintStage() {
  const effect = useMemo(() => new PaintEffect({ radius: 5, ink: 0.85 }), [])
  return (
    <>
      <PerspectiveCamera makeDefault fov={32} position={orbit(46, -14, 40)} />
      <Controls />
      <color attach="background" args={['#f3ede1']} />
      <fog attach="fog" args={['#f3ede1', 60, 200]} />
      <hemisphereLight args={['#fffaf0', '#d8cbb3', 2.1]} />
      <Sun pos={[-45, 60, 40]} intensity={1.3} color="#fff1dc" />
      <EffectComposer multisampling={0}>
        <primitive object={effect} />
        <Vignette offset={0.35} darkness={0.3} />
      </EffectComposer>
    </>
  )
}

const watercolor: LookDef = {
  id: 'watercolor',
  name: 'Watercolor sketchbook',
  ja: '水彩スケッチ',
  blurb: 'Washes of soft color on warm paper with loose ink lines, like a travel sketch you would make sitting in a Tokyo café.',
  shadows: 'soft',
  flat: true,
  style: {
    Mat: (p) => <PaintMat {...p} />,
    tint: (role, c) => {
      if (role === 'road') return '#8f95a8'
      if (role === 'walk') return '#e6ddcc'
      if (role === 'glass') return '#8fb3cc'
      return adjust(c, (h) => ((h.s = Math.min(1, h.s * 1.15 + 0.08)), (h.l = h.l * 0.72 + 0.24)))
    },
    surroundings: true,
  },
  Stage: PaintStage,
}

// ---- 4. Tilt-shift miniature --------------------------------------------

function MiniMat({ color, map, glow, role }: MatProps) {
  if (role === 'paint') return <meshStandardMaterial color={color} map={map} transparent={!!map} alphaTest={map ? 0.4 : 0} roughness={0.6} />
  return <meshStandardMaterial color={color} map={map} roughness={role === 'glass' ? 0.08 : role === 'road' ? 0.7 : 0.32} metalness={role === 'glass' ? 0.3 : 0} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.4 : 0} envMapIntensity={1} />
}

function MiniStage() {
  return (
    <>
      <PerspectiveCamera makeDefault fov={13} position={orbit(150, -22, 56)} far={1000} />
      <Controls minPolar={0.3} maxPolar={1.0} />
      <color attach="background" args={['#cfe7f7']} />
      <fog attach="fog" args={['#dceef9', 200, 420]} />
      <hemisphereLight args={['#eaf6ff', '#a49a88', 0.5]} />
      {/* Low morning sun for long shadows, and soft studio panels for a glossy, toy-like sheen. */}
      <Sun pos={[-70, 45, 20]} intensity={2.6} color="#ffe6c4" size={70} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={0.9} color="#ffffff" position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[60, 60, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffe7c7" position={[-40, 15, 20]} rotation={[0, Math.PI / 2, 0]} scale={[40, 20, 1]} />
        <Lightformer form="rect" intensity={0.4} color="#cfe6ff" position={[40, 15, -20]} rotation={[0, -Math.PI / 2, 0]} scale={[40, 20, 1]} />
      </Environment>
      <EffectComposer multisampling={0} enableNormalPass>
        <SSAO samples={21} radius={0.08} intensity={22} luminanceInfluence={0.5} worldDistanceThreshold={40} worldDistanceFalloff={10} worldProximityThreshold={4} worldProximityFalloff={2} />
        <TiltShift2 blur={0.45} taper={0.6} start={[0.5, 0.48]} end={[0.5, 0.62]} samples={16} />
        <HueSaturation saturation={0.28} />
        <BrightnessContrast brightness={0.03} contrast={0.12} />
        <Vignette offset={0.35} darkness={0.4} />
      </EffectComposer>
    </>
  )
}

const miniature: LookDef = {
  id: 'miniature',
  name: 'Tilt-shift miniature',
  ja: 'ミニチュア',
  blurb: 'A real-looking street seen through a long lens with blurred edges and punchy color, so the city looks like a glossy model railway set.',
  shadows: 'percentage',
  style: {
    Mat: (p) => <MiniMat {...p} />,
    tint: (role, c) => (role === 'road' || role === 'walk' || role === 'curb' || role === 'paint' ? c : adjust(c, (h) => (h.s *= 1.25))),
    surroundings: true,
  },
  Stage: MiniStage,
}

// ---- 5. Neon night ------------------------------------------------------

function NightMat({ color, map, glow, role }: MatProps) {
  if (role === 'paint') return <meshStandardMaterial color={color} map={map} transparent={!!map} alphaTest={map ? 0.4 : 0} roughness={0.3} />
  if (glow) return <meshStandardMaterial color={color} map={map} emissive={map ? '#ffffff' : color} emissiveMap={map} emissiveIntensity={glow} roughness={0.4} toneMapped={false} />
  const roughness: Partial<Record<Role, number>> = { road: 0.22, walk: 0.55, curb: 0.6, glass: 0.08, metal: 0.4 }
  return <meshStandardMaterial color={color} map={map} roughness={roughness[role] ?? 0.75} metalness={role === 'road' ? 0.45 : role === 'glass' ? 0.4 : 0.05} />
}

function NightStage() {
  return (
    <>
      <PerspectiveCamera makeDefault fov={34} position={orbit(42, -18, 32)} />
      <Controls />
      <color attach="background" args={['#0b1233']} />
      <fog attach="fog" args={['#141c46', 50, 190]} />
      <Stars radius={180} depth={40} count={1500} factor={5} fade speed={0.5} />
      <hemisphereLight args={['#5d74e0', '#2a1d48', 1.6]} />
      {/* Colored panels only the shiny road and glass reflect: the wet-street look. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={0.9} color="#ff3d9a" position={[10, 8, -30]} scale={[60, 10, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#35d7ff" position={[-30, 8, 20]} rotation={[0, Math.PI / 2, 0]} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffb347" position={[30, 6, 20]} rotation={[0, -Math.PI / 2, 0]} scale={[20, 6, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#3a4fa8" position={[0, 40, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[80, 80, 1]} />
      </Environment>
      <Sun pos={[50, 60, -40]} intensity={0.7} color="#8fa8ff" />
      {/* Pink and cyan wash from the sign street. */}
      <pointLight position={[8, 16, -12]} color="#ff4fa0" intensity={150} distance={40} />
      <pointLight position={[-24, 8, -8]} color="#ffb347" intensity={120} distance={26} />
      <pointLight position={[18, 4, 9]} color="#46e0ff" intensity={80} distance={20} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={1.4} luminanceThreshold={0.8} luminanceSmoothing={0.2} radius={0.75} />
        <HueSaturation saturation={0.15} />
        <Vignette offset={0.25} darkness={0.6} />
      </EffectComposer>
    </>
  )
}

const neon: LookDef = {
  id: 'neon',
  name: 'Neon night',
  ja: 'ネオンの夜',
  blurb: 'Deep blue evening, glowing signs, lit windows and a rain-slick road that catches every light, cinematic and moody.',
  shadows: 'soft',
  style: {
    Mat: (p) => <NightMat {...p} />,
    tint: (role, c) => {
      if (role === 'road') return '#1c2033'
      if (role === 'walk') return '#3a3d52'
      if (role === 'glass') return '#1b2440'
      if (role === 'sign' || role === 'lamp' || role === 'skin' || role === 'cloth' || role === 'hair' || role === 'paint') return c
      return adjust(c, (h) => ((h.l = h.l * 0.55), (h.h = h.h * 0.6 + 0.65 * 0.4), (h.s = h.s * 0.6 + 0.12)))
    },
    night: true,
    surroundings: true,
  },
  Stage: NightStage,
}

export const LOOKS: LookDef[] = [toon, diorama, watercolor, miniature, neon]
