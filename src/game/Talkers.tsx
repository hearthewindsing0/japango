import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PARTS, UMBRELLAS, hasPart, paintOf, randomLook, type Look } from './character'
import { streetLive } from './life'
import { hashId, passerby } from './passersby'
import { talkLive, type Talk } from './talk'

// The two people talking at each talking spot: standing on the pavement,
// facing each other, the one speaking gesturing a little. Their looks follow
// the voices of the conversation going on (or the last one).

// VOICEVOX voices (scripts/voices.mjs).
const FEMALE = /冥鳴ひまり|春日部つむぎ|九州そら|東北イタコ/
const OLDER = /東北イタコ|麒ヶ島宗麟/

/** A look that fits a voice: same voice, same person. */
function lookFor(voice: string): Look {
  let seed = 7
  for (const c of voice) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const look = randomLook(rand)
  const female = FEMALE.test(voice)
  look.longHair = female
  look.backpack = /春日部つむぎ|玄野武宏/.test(voice)
  look.height = female ? 0.92 + rand() * 0.06 : 1 + rand() * 0.06
  if (OLDER.test(voice)) look.hair = female ? '#3b2a20' : '#8f8a84'
  else if (look.hair === '#b8b2a8') look.hair = '#2a211c' // grey hair only for the older voices
  return look
}

export function Talkers({ talk, voices, rain }: { talk: Talk; voices: Record<string, [string, string]>; rain: boolean }) {
  // You can walk up to each pair and talk to them (Approach.tsx).
  useEffect(() => {
    const keys = talk.spots.map((s) => {
      const key = `spot:${s.id}`
      const vs = voices[s.id] ?? defaultVoices(talk, s.id)
      streetLive.set(key, () => {
        const place = talkLive.places.get(s.id)
        if (!place) return []
        return [place.a, place.b].map((at, i) => ({
          id: `${key}:${i}`,
          x: at.x,
          y: at.y,
          walking: false,
          group: key,
          // Named as you heard them in their conversation.
          person: () => passerby(`${key}:${i}`, hashId(vs[i]), lookFor(vs[i]), FEMALE.test(vs[i]), talkLive.names.get(s.id)?.[i]),
        }))
      })
      return key
    })
    return () => {
      for (const k of keys) streetLive.delete(k)
    }
  }, [talk, voices])
  return (
    <>
      {talk.spots.map((s) => (
        <SpotPair key={s.id} spot={s.id} voices={voices[s.id] ?? defaultVoices(talk, s.id)} rain={rain} />
      ))}
    </>
  )
}

function defaultVoices(talk: Talk, spot: string): [string, string] {
  const c = talk.conversations.find((c) => c.spot === spot)
  return [c?.speakers[0]?.voice ?? '玄野武宏', c?.speakers[1]?.voice ?? '冥鳴ひまり']
}

function SpotPair({ spot, voices, rain }: { spot: string; voices: [string, string]; rain: boolean }) {
  const group = useRef<THREE.Group>(null)
  const a = useRef<THREE.Group>(null)
  const b = useRef<THREE.Group>(null)
  useFrame(() => {
    const place = talkLive.places.get(spot)
    if (!group.current) return
    group.current.visible = !!place
    if (!place) return
    a.current?.position.set(place.a.x, place.ground, place.a.y)
    b.current?.position.set(place.b.x, place.ground, place.b.y)
    if (a.current) a.current.rotation.y = place.facing
    if (b.current) b.current.rotation.y = place.facing + Math.PI
  })
  return (
    <group ref={group} visible={false}>
      <group ref={a}>
        <Person look={lookFor(voices[0])} phase={0} rain={rain} state={() => stateOf(spot, 0)} />
      </group>
      <group ref={b}>
        <Person look={lookFor(voices[1])} phase={3.7} rain={rain} state={() => stateOf(spot, 1)} />
      </group>
    </group>
  )
}

function stateOf(spot: string, who: number): PersonState {
  const s = talkLive.speaking
  return s?.spot !== spot ? null : s.s === who ? 'speak' : 'listen'
}

type Limb = 'armL' | 'armR'

/** What someone is doing, for how they move. */
export type PersonState = 'speak' | 'listen' | 'walk' | null

/** One person, standing on the spot: talking hands when they speak, a nod
 *  when they listen, arms swinging when they walk. */
export function Person({ look, phase, rain, state }: { look: Look; phase: number; rain: boolean; state: () => PersonState }) {
  const body = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const limbs: Partial<Record<string, React.RefObject<THREE.Group | null>>> = { armL, armR }
  const umbrella = UMBRELLAS[Math.floor(look.height * 1000) % UMBRELLAS.length]
  const parts = useMemo(
    () => PARTS.filter((p) => hasPart(look, p.name, rain)).map((spec) => ({ spec, geo: spec.make(0.8) })),
    [look, rain],
  )
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts])
  const t = useRef(phase)

  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05)
    const time = t.current
    const st = state()
    const speaking = st === 'speak'
    const listening = st === 'listen'
    const walking = st === 'walk'
    // Talking hands and a bobbing head; the listener nods now and then; a
    // walker swings their arms and bobs with each step.
    const swing = Math.sin(time * 8.5) * 0.45
    if (armR.current) armR.current.rotation.x = speaking ? -0.5 - Math.sin(time * 5) * 0.25 : walking ? swing : 0
    if (armL.current) armL.current.rotation.x = speaking ? -0.2 - Math.sin(time * 3.3 + 1) * 0.15 : walking ? -swing : 0
    if (body.current) {
      body.current.rotation.x = speaking ? Math.sin(time * 6) * 0.03 : listening ? Math.max(0, Math.sin(time * 1.7)) * 0.05 : 0
      body.current.position.y = walking ? Math.abs(Math.sin(time * 8.5)) * 0.04 : Math.sin(time * 1.3) * 0.006
    }
  })

  return (
    <group scale={look.height}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <circleGeometry args={[0.4, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {parts.map(({ spec, geo }) => {
          const color = paintOf(look, spec.paint, umbrella)
          const mat = spec.paint === 'eyes' ? <meshBasicMaterial color={color} /> : <meshLambertMaterial color={color} />
          const limb = spec.pivot ? limbs[spec.name as Limb] : undefined
          if (!spec.pivot || !limb)
            return (
              <mesh key={spec.name} geometry={geo} castShadow={spec.shadow}>
                {mat}
              </mesh>
            )
          const [px, py, pz] = spec.pivot
          return (
            <group key={spec.name} ref={limb} position={spec.pivot}>
              <mesh geometry={geo} position={[-px, -py, -pz]} castShadow={spec.shadow}>
                {mat}
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}
