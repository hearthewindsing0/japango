import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { crowdAttributes, crowdGeometry, crowdMaterial, packColor } from './character'
import { dayTracks, trackAt, type RiderSource, type Track } from './riders'
import { platformFrames, type Station } from './station'
import { holidayLike, tokyoNow, type Timetable } from './trains'
import type { Focus } from './World'

// The people on a station's platforms (see riders.ts): one instanced mesh,
// the same build as the people on the street, each in their own clothes.

const MAX = 320

export function Riders({ station, src, timetable, offset, focus, show }: { station: Station; src: RiderSource; timetable: Timetable | null; offset: number; focus: React.RefObject<Focus>; show: boolean }) {
  const frames = useMemo(() => platformFrames(station), [station])
  // Tracks for the Tokyo day, worked out once a day.
  const day = useRef<{ day: number; tracks: Track[] } | null>(null)
  useEffect(() => void (day.current = null), [src, timetable, station])
  const mat = useMemo(() => crowdMaterial([]), [])
  const { geo, attrs } = useMemo(() => {
    const g = crowdGeometry(0.5)
    const a = crowdAttributes(MAX)
    g.setAttribute('iColorsA', a.iColorsA.setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('iColorsB', a.iColorsB.setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('iPose', a.iPose)
    return { geo: g, attrs: a }
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  const mesh = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(), s: new THREE.Vector3() }), [])
  const shown = useRef<string[]>([])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const pz = focus.current.z ?? 0
    // Only while you're down in this station.
    const near = show && Math.hypot(focus.current.x - station.x, focus.current.y - station.y) < 260
    if (!near) {
      m.count = 0
      return
    }
    const now = Date.now() + offset
    const { day: d, sec } = tokyoNow(now)
    if (day.current?.day !== d) day.current = { day: d, tracks: dayTracks(src, timetable, station, frames, d, holidayLike(timetable, d)) }
    const tracks = day.current.tracks
    let n = 0
    const ids = shown.current
    // Tracks are sorted by start; none lasts more than about 12 minutes.
    let lo = 0
    let hi = tracks.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tracks[mid].t[0] < sec - 900) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < tracks.length && n < MAX; i++) {
      const tr = tracks[i]
      if (tr.t[0] > sec) break
      const at = trackAt(tr, sec)
      if (!at) continue
      // Hidden on the floors above you, like the station itself.
      if (at.z > pz + 1.2) continue
      const who = src.riders.get(tr.who)
      if (!who) continue
      if (ids[n] !== tr.who) {
        ids[n] = tr.who
        attrs.iColorsA.setXYZ(n, packColor(who.look.pants), packColor(who.look.shirt), packColor(who.look.skin))
        attrs.iColorsB.setXYZ(n, packColor(who.look.hair), packColor(who.look.bag), 0)
        attrs.iColorsA.needsUpdate = true
        attrs.iColorsB.needsUpdate = true
      }
      const phase = (now / 1000) * 5.2 + i
      tmp.p.set(at.x, at.z + (at.moving ? Math.abs(Math.cos(phase)) * 0.04 : 0), at.y)
      tmp.q.setFromAxisAngle(tmp.up, Math.atan2(at.hx, at.hy))
      tmp.s.setScalar(who.look.height ?? 1)
      tmp.m.compose(tmp.p, tmp.q, tmp.s)
      m.setMatrixAt(n, tmp.m)
      attrs.iPose.setXYZW(n, at.moving ? Math.sin(phase) * 0.45 : 0, who.look.backpack ? 1 : 0, who.look.longHair ? 1 : 0, 0)
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    attrs.iPose.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geo, mat, MAX]} frustumCulled={false} />
}
