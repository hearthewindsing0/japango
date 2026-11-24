import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { groundAt, type GameMap } from './map'
import { lifeLive, tokyoMinute, whereabouts, type Life, type LifePerson, type Whereabouts } from './life'
import { Person, type PersonState } from './Talkers'

// The people of the area (src/game/life.ts) on the street: walking their
// day's walks, and standing in a ring where their group meets while they
// talk. At home, at work or inside somewhere, they aren't drawn.

const SEEN = 260 // meters: people further than this from the player aren't drawn

export function LifePeople({ life, map, focus, rain }: { life: Life; map: GameMap; focus: { current: { x: number; y: number } }; rain: boolean }) {
  const now = useRef(new Map<string, Whereabouts>())
  const last = useRef(0)
  useFrame(() => {
    const t = performance.now()
    if (t - last.current < 100) return // ten times a second is plenty for walking pace
    last.current = t
    const f = focus.current
    const next = new Map<string, Whereabouts>()
    for (const w of whereabouts(life, tokyoMinute(new Date()))) if (Math.hypot(w.x - f.x, w.y - f.y) < SEEN) next.set(w.person.id, w)
    now.current = next
  })
  return (
    <>
      {[...life.legsOf.keys()].map((id) => {
        const p = life.people.get(id)
        return p ? <Walker key={id} person={p} map={map} now={now} rain={rain} /> : null
      })}
    </>
  )
}

function Walker({ person, map, now, rain }: { person: LifePerson; map: GameMap; now: { current: Map<string, Whereabouts> }; rain: boolean }) {
  const group = useRef<THREE.Group>(null)
  const smooth = useRef<{ x: number; y: number; facing: number } | null>(null)
  const at = useRef<Whereabouts | null>(null)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const w = now.current.get(person.id) ?? null
    at.current = w
    g.visible = !!w
    if (!w) {
      smooth.current = null
      return
    }
    // Ease toward where they should be, so the 10 Hz updates don't step.
    const s = (smooth.current ??= { x: w.x, y: w.y, facing: w.facing })
    const k = Math.min(1, dt * 8)
    s.x += (w.x - s.x) * k
    s.y += (w.y - s.y) * k
    let df = w.facing - s.facing
    df = Math.atan2(Math.sin(df), Math.cos(df))
    s.facing += df * Math.min(1, dt * 6)
    g.position.set(s.x, groundAt(map, s.x, s.y), s.y)
    g.rotation.y = s.facing
  })
  const state = (): PersonState => {
    const w = at.current
    if (!w) return null
    if (w.walking) return 'walk'
    const sp = lifeLive.speaking
    if (!sp || sp.outing !== w.outing.id) return null
    return sp.person === person.id ? 'speak' : 'listen'
  }
  return (
    <group ref={group} visible={false}>
      <Person look={person.look} phase={(person.age * 1.37) % 6} rain={rain} state={state} />
    </group>
  )
}
