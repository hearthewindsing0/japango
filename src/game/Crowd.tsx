import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { UMBRELLAS, crowdAttributes, crowdDepthMaterial, crowdGeometry, crowdMaterial, packColor, randomLook, type Look } from './character'
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
  phase: number // walk cycle
  look: Look
  umbrella: string
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
        phase: rand() * Math.PI * 2,
        look: randomLook(rand),
        umbrella: UMBRELLAS[Math.floor(rand() * UMBRELLAS.length)],
      })
    }
    return out
  }, [lines])

  const level = crowdLevel(hour) * (rain > 0 ? 0.6 : 1)
  const count = Math.round(walkers.length * level)
  const wet = rain > 0

  // Everyone on the tile is one instanced mesh (see character.ts): the same
  // build as the player, in each walker's own clothes.
  const mat = useMemo(() => crowdMaterial(clip), [clip])
  const depthMat = useMemo(() => crowdDepthMaterial(clip), [clip])
  useEffect(
    () => () => {
      mat.dispose()
      depthMat.dispose()
    },
    [mat, depthMat],
  )
  // Each tile's crowd has its own copy of the body geometry, carrying its
  // people's colors and poses.
  const { geo, attrs } = useMemo(() => {
    const g = crowdGeometry(0.5)
    const a = crowdAttributes(Math.max(1, walkers.length))
    walkers.forEach((w, i) => {
      a.iColorsA.setXYZ(i, packColor(w.look.pants), packColor(w.look.shirt), packColor(w.look.skin))
      a.iColorsB.setXYZ(i, packColor(w.look.hair), packColor(w.look.bag), packColor(w.umbrella))
    })
    g.setAttribute('iColorsA', a.iColorsA)
    g.setAttribute('iColorsB', a.iColorsB)
    g.setAttribute('iPose', a.iPose)
    return { geo: g, attrs: a }
  }, [walkers])
  useEffect(() => () => geo.dispose(), [geo])
  const mesh = useRef<THREE.InstancedMesh>(null)

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
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
      // Walk cycle, like the player's: about one stride a second.
      w.phase += dt * w.speed * 4
      const swing = Math.sin(w.phase) * 0.45
      const bob = Math.abs(Math.cos(w.phase)) * 0.04
      p.set(x, tileGroundAt(tile, x, y) + bob, y)
      q.setFromAxisAngle(up, Math.atan2(dx * w.dir, dy * w.dir))
      scale.setScalar(w.look.height)
      m.compose(p, q, scale)
      mesh.current?.setMatrixAt(i, m)
      attrs.iPose.setXYZW(i, swing, w.look.backpack ? 1 : 0, w.look.longHair ? 1 : 0, wet ? 1 : 0)
    }
    if (mesh.current) {
      mesh.current.count = count
      mesh.current.instanceMatrix.needsUpdate = true
    }
    attrs.iPose.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geo, mat, Math.max(1, walkers.length)]}
      customDepthMaterial={depthMat}
      frustumCulled={false}
      castShadow
    />
  )
}
