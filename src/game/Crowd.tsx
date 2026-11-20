import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { tileGroundAt, type MapTile } from './map'

// Passers-by walking the sidewalks and footpaths. How many are out depends
// on the hour in Tokyo (Roppongi is busy at lunch and late into the night)
// and the weather; in the rain they carry umbrellas.

// Most walkers a tile can hold (a busy 256 m square in Roppongi).
const MAX = 400
const PER_WALKER = 25

/** Share of the crowd out at a given Tokyo hour (0-23), 0..1. */
export function crowdLevel(hour: number) {
  // Rough shape of Roppongi foot traffic: a morning commute, a lunch peak,
  // and a long evening that runs past midnight.
  const curve = [0.35, 0.3, 0.22, 0.12, 0.06, 0.06, 0.12, 0.3, 0.55, 0.5, 0.45, 0.55, 0.8, 0.7, 0.55, 0.55, 0.6, 0.7, 0.85, 0.95, 1, 0.95, 0.8, 0.55]
  return curve[Math.max(0, Math.min(23, Math.floor(hour)))]
}

interface Walker {
  line: number[] // flat x, y points
  len: number[] // cumulative lengths
  d: number // distance along
  dir: 1 | -1
  speed: number
  side: number // lateral offset
}

/** Walkable lines: footpaths, plus a line down each sidewalk. */
function walkLines(map: MapTile) {
  // Sidewalks of the big streets are busiest.
  const lines: { p: number[]; busy: number }[] = []
  for (const p of map.paths) if (p.t !== 'crossing' && p.t !== 'steps') lines.push({ p: p.p, busy: p.t === 'pedestrian' ? 2 : 1 })
  for (const r of map.roads) {
    if (r.s <= 0 || r.b) continue
    const off = r.w / 2 + r.s / 2
    for (const sgn of [1, -1]) {
      const out: number[] = []
      for (let i = 0; i < r.p.length; i += 2) {
        const j = Math.min(i, r.p.length - 4)
        const dx = r.p[j + 2] - r.p[j]
        const dy = r.p[j + 3] - r.p[j + 1]
        const l = Math.hypot(dx, dy) || 1
        out.push(r.p[i] - (dy / l) * off * sgn, r.p[i + 1] + (dx / l) * off * sgn)
      }
      lines.push({ p: out, busy: r.t.startsWith('trunk') || r.t.startsWith('primary') ? 4 : 2 })
    }
  }
  return lines
    .map(({ p: line, busy }) => {
      const len = [0]
      for (let i = 2; i < line.length; i += 2) len.push(len[len.length - 1] + Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]))
      return { line, len, busy }
    })
    .filter((l) => l.len[l.len.length - 1] > 15)
}

const SHIRTS = ['#2f3542', '#57606f', '#a4b0be', '#1e3799', '#b33939', '#f1f2f6', '#227093', '#6d214f', '#33d9b2', '#cc8e35', '#40407a', '#d1ccc0']
const UMBRELLAS = ['#f5f6fa', '#273c75', '#e84118', '#44bd32', '#353b48', '#fbc531']

export function Crowd({ tile, clip, hour, rain }: { tile: MapTile; clip: THREE.Plane[]; hour: number; rain: number }) {
  const lines = useMemo(() => walkLines(tile), [tile])
  const walkers = useMemo<Walker[]>(() => {
    // Seeded so the same people appear each visit.
    let seed = 12345 + tile.col * 7919 + tile.row * 104729
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    // Longer lines get more people. Only the part of a line on this tile
    // counts, roughly: lines are shared with the neighbors.
    const onTile = (l: (typeof lines)[number]) => {
      let n = 0
      for (let i = 0; i < l.line.length; i += 2) if (l.line[i] >= tile.x0 && l.line[i] < tile.x1 && l.line[i + 1] >= tile.y0 && l.line[i + 1] < tile.y1) n++
      return n / (l.line.length / 2)
    }
    const weights = lines.map((l) => l.len[l.len.length - 1] * l.busy * onTile(l))
    const total = weights.reduce((a, w) => a + w, 0)
    const out: Walker[] = []
    // About one walker per 25 m of busy sidewalk.
    const n = Math.min(MAX, Math.round(total / PER_WALKER))
    for (let i = 0; i < n && total > 0; i++) {
      let pick = rand() * total
      let li = 0
      for (; li < lines.length - 1; li++) {
        const l = weights[li]
        if (pick <= l) break
        pick -= l
      }
      const l = lines[li]
      out.push({
        line: l.line,
        len: l.len,
        d: rand() * l.len[l.len.length - 1],
        dir: rand() < 0.5 ? 1 : -1,
        speed: 1.1 + rand() * 0.6,
        side: (rand() - 0.5) * 1.2,
      })
    }
    return out
  }, [lines])

  const level = crowdLevel(hour) * (rain > 0 ? 0.6 : 1)
  const count = Math.round(walkers.length * level)
  const body = useRef<THREE.InstancedMesh>(null)
  const head = useRef<THREE.InstancedMesh>(null)
  const umbrella = useRef<THREE.InstancedMesh>(null)
  const geos = useMemo(
    () => ({
      body: new THREE.CapsuleGeometry(0.2, 0.9, 3, 8).translate(0, 0.75, 0),
      head: new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.55, 0),
      umbrella: new THREE.ConeGeometry(0.6, 0.3, 10).translate(0, 2.05, 0),
    }),
    [],
  )
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])

  useEffect(() => {
    const c = new THREE.Color()
    walkers.forEach((_, i) => {
      body.current?.setColorAt(i, c.set(SHIRTS[(i * 7) % SHIRTS.length]))
      umbrella.current?.setColorAt(i, c.set(UMBRELLAS[(i * 5) % UMBRELLAS.length]))
    })
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true
    if (umbrella.current?.instanceColor) umbrella.current.instanceColor.needsUpdate = true
  }, [walkers, rain])

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const w = walkers[i]
      const end = w.len[w.len.length - 1]
      w.d += w.speed * w.dir * dt
      if (w.d > end) {
        w.d = end
        w.dir = -1
      } else if (w.d < 0) {
        w.d = 0
        w.dir = 1
      }
      // Find the segment.
      let k = 1
      while (k < w.len.length - 1 && w.len[k] < w.d) k++
      const a = (k - 1) * 2
      const segLen = w.len[k] - w.len[k - 1] || 1
      const f = (w.d - w.len[k - 1]) / segLen
      const dx = (w.line[a + 2] - w.line[a]) / segLen
      const dy = (w.line[a + 3] - w.line[a + 1]) / segLen
      const x = w.line[a] + dx * segLen * f - dy * w.side
      const y = w.line[a + 1] + dy * segLen * f + dx * w.side
      const bob = Math.abs(Math.sin(t * w.speed * 5 + i)) * 0.04
      p.set(x, tileGroundAt(tile, x, y) + bob, y)
      q.setFromAxisAngle(up, Math.atan2(dx * w.dir, dy * w.dir))
      m.compose(p, q, one)
      body.current?.setMatrixAt(i, m)
      head.current?.setMatrixAt(i, m)
      if (rain > 0) umbrella.current?.setMatrixAt(i, m)
    }
    for (const r of [body, head, umbrella]) {
      if (!r.current) continue
      r.current.count = r === umbrella && rain <= 0 ? 0 : count
      r.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={body} args={[geos.body, undefined, walkers.length]} frustumCulled={false} castShadow>
        <meshLambertMaterial clippingPlanes={clip} />
      </instancedMesh>
      <instancedMesh ref={head} args={[geos.head, undefined, walkers.length]} frustumCulled={false} castShadow>
        <meshLambertMaterial color="#e8c4a0" clippingPlanes={clip} />
      </instancedMesh>
      <instancedMesh ref={umbrella} args={[geos.umbrella, undefined, walkers.length]} frustumCulled={false} castShadow>
        <meshLambertMaterial clippingPlanes={clip} />
      </instancedMesh>
    </group>
  )
}
