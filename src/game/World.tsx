import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Props } from './Props'
import { Signs } from './Signs'
import { patternedMaterial, type Pattern } from './patterns'
import {
  buildingsGeometry,
  dashesGeometry,
  drape,
  polygonsGeometry,
  ribbonsGeometry,
  surfacesGeometry,
  viaductsGeometry,
  type HeightFn,
} from './geometry'
import { Crowd } from './Crowd'
import { Cars } from './Cars'
import type { FlowTime } from './people-flow'
import { cutAtZebras, laneLines } from './traffic'
import { groundAt, tileGroundAt, type GameMap, type MapTile } from './map'
import { COLORS, T } from './tiles'
import type { SkyState } from './sky'
import { Weather as WeatherFx } from './Weather'
import { LANDMARK_SIGNS } from './Almond'
import { Landmarks } from './Landmarks'
import { Toy } from './Toy'
import { seeThroughGlsl, seeThroughUniforms, type SeeThroughUniforms } from './seeThrough'

/** Shared state the world reads every frame: where the player is. */
export interface Focus {
  x: number
  y: number
  /** Height you're standing at; underground, set by the stations. */
  z?: number
  /** True once you've gone down into a station. */
  under?: boolean
}

// Ground layers are stacked a few centimeters apart so they never z-fight.
const Y = { ground: 0, area: 0.02, sidewalk: 0.04, road: 0.06, line: 0.07, path: 0.08, crossing: 0.09 }

const AREA_PATTERN: Record<number, Pattern | undefined> = {
  [T.GRASS]: 'grass',
  [T.WOODS]: 'grass',
  [T.PITCH]: 'grass',
  [T.PARKING]: 'asphalt',
  [T.SHRINE]: 'gravel',
  [T.FOOTWAY]: 'pavers',
}

const AREA_COLOR: Record<number, string> = {
  [T.GRASS]: COLORS.grass,
  [T.WOODS]: COLORS.woods,
  [T.PITCH]: COLORS.pitch,
  [T.WATER]: COLORS.water,
  [T.PARKING]: COLORS.parking,
  [T.SHRINE]: COLORS.shrine,
  [T.FOOTWAY]: COLORS.footway,
}

/** Everything a tile draws is clipped to its own square. */
function useClipPlanes(tile: MapTile) {
  return useMemo(
    () => [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -tile.x0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), tile.x1),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -tile.y0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), tile.y1),
    ],
    [tile],
  )
}

const heightFn = (tile: MapTile): HeightFn => (x, z) => tileGroundAt(tile, x, z)
const cellOf = (tile: MapTile) => tile.ground?.cell ?? 4

/** The base ground: the terrain grid itself, each cell cut into two
 *  triangles the same way groundAt() reads it. */
function groundGeometry(tile: MapTile) {
  const g = tile.ground
  if (!g) {
    const rect = [tile.x0, tile.y0, tile.x1, tile.y0, tile.x1, tile.y1, tile.x0, tile.y1]
    return polygonsGeometry([{ p: rect }], 0)
  }
  const pos = new Float32Array(g.width * g.height * 3)
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const i = (y * g.width + x) * 3
      pos[i] = (g.ox + x) * g.cell
      pos[i + 1] = g.h[y * g.width + x]
      pos[i + 2] = (g.oy + y) * g.cell
    }
  const index: number[] = []
  for (let y = 0; y + 1 < g.height; y++)
    for (let x = 0; x + 1 < g.width; x++) {
      const a = y * g.width + x
      const b = a + 1
      const c = a + g.width
      const d = c + 1
      // Wound to face +Y; the diagonal runs from b to c.
      index.push(a, c, b, b, c, d)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** Crosswalks cut to the part over the roadway: OpenStreetMap's crossing
 *  ways often run onto the sidewalks, where nobody paints stripes. */
function crossingsOnRoad(tile: MapTile) {
  // Road segments as [ax, ay, bx, by, half width].
  const segs: number[][] = []
  for (const r of tile.roads) {
    if (r.b) continue
    for (let i = 0; i + 3 < r.p.length; i += 2) segs.push([r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], r.w / 2])
  }
  let near: number[][] = []
  const onRoad = (x: number, y: number) => {
    for (const [ax, ay, bx, by, half] of near) {
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy || 1e-9
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < half) return true
    }
    return false
  }
  const out: { p: number[]; w: number }[] = []
  const STEP = 0.3
  for (const c of tile.paths) {
    if (c.t !== 'crossing') continue
    // Only the roads around this crossing.
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < c.p.length; i += 2) {
      x0 = Math.min(x0, c.p[i])
      x1 = Math.max(x1, c.p[i])
      y0 = Math.min(y0, c.p[i + 1])
      y1 = Math.max(y1, c.p[i + 1])
    }
    near = segs.filter(([ax, ay, bx, by, half]) => Math.max(ax, bx) + half > x0 && Math.min(ax, bx) - half < x1 && Math.max(ay, by) + half > y0 && Math.min(ay, by) - half < y1)
    let run: number[] = []
    const flush = () => {
      if (run.length >= 4 && Math.hypot(run[run.length - 2] - run[0], run[run.length - 1] - run[1]) > 1.5) out.push({ p: run, w: Math.max(c.w, 4) })
      run = []
    }
    for (let i = 0; i + 3 < c.p.length; i += 2) {
      const ax = c.p[i]
      const ay = c.p[i + 1]
      const len = Math.hypot(c.p[i + 2] - ax, c.p[i + 3] - ay)
      const n = Math.max(1, Math.ceil(len / STEP))
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const x = ax + ((c.p[i + 2] - ax) * k) / n
        const y = ay + ((c.p[i + 3] - ay) * k) / n
        if (onRoad(x, y)) run.push(x, y)
        else flush()
      }
    }
    flush()
  }
  return out
}

function useDisposable<T extends { dispose(): void }>(make: () => T, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(make, deps)
  useEffect(() => () => value.dispose(), [value])
  return value
}

function Ground({ tile, clip, night }: { tile: MapTile; clip: THREE.Plane[]; night: number }) {
  const areaLayers = useMemo(() => {
    const byType = new Map<number, MapTile['areas']>()
    for (const a of tile.areas) byType.set(a.t, [...(byType.get(a.t) ?? []), a])
    // Footway plazas sit with the paths, above the other areas.
    return [...byType.entries()].map(([t, list]) => ({
      t,
      geo: drape(polygonsGeometry(list, t === T.FOOTWAY ? Y.path : Y.area + (t === T.WATER ? 0.005 : 0)), heightFn(tile), cellOf(tile)),
    }))
  }, [tile])
  useEffect(() => () => areaLayers.forEach((l) => l.geo.dispose()), [areaLayers])

  const geos = useMemo(() => {
    const roads = tile.roads
    const sidewalks = roads.filter((r) => r.s > 0).map((r) => ({ p: r.p, w: r.w + r.s * 2 }))
    const footways = tile.paths.filter((p) => p.t !== 'crossing')
    const crossings = crossingsOnRoad(tile)
    // Lane lines where the cars drive (see traffic.ts), stopping at the
    // crosswalks.
    const centerLines = cutAtZebras(laneLines(roads), crossings)
    const h = heightFn(tile)
    const c = cellOf(tile)
    return {
      base: groundGeometry(tile),
      sidewalk: drape(ribbonsGeometry(sidewalks, Y.sidewalk), h, c),
      road: drape(ribbonsGeometry(roads, Y.road), h, c),
      line: drape(dashesGeometry(centerLines, Y.line), h, c),
      footway: drape(ribbonsGeometry(footways, Y.path), h, c),
      crossing: drape(ribbonsGeometry(crossings, Y.crossing, false), h, c),
    }
  }, [tile])
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])

  const mats = useMemo(() => {
    const areas = Object.fromEntries(
      Object.entries(AREA_COLOR).map(([t, color]) => {
        const pattern = AREA_PATTERN[Number(t)]
        const m = pattern
          ? patternedMaterial(color, pattern, clip)
          : new THREE.MeshLambertMaterial({ color, clippingPlanes: clip })
        return [t, m]
      }),
    )
    return {
      areas,
      ground: patternedMaterial(COLORS.ground, 'slabs', clip),
      sidewalk: patternedMaterial(COLORS.sidewalk, 'bricks', clip),
      road: patternedMaterial(COLORS.road, 'asphalt', clip),
      footway: patternedMaterial(COLORS.footway, 'pavers', clip),
    }
  }, [clip])
  useEffect(
    () => () => {
      Object.values(mats.areas).forEach((m) => m.dispose())
      mats.ground.dispose()
      mats.sidewalk.dispose()
      mats.road.dispose()
      mats.footway.dispose()
    },
    [mats],
  )

  const crossingMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        clipping: true,
        uniforms: { uBright: { value: 1 } },
        vertexShader: /* glsl */ `
          #include <clipping_planes_pars_vertex>
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            #include <clipping_planes_vertex>
            gl_Position = projectionMatrix * mvPosition;
          }`,
        fragmentShader: /* glsl */ `
          #include <clipping_planes_pars_fragment>
          uniform float uBright;
          varying vec2 vUv;
          void main() {
            #include <clipping_planes_fragment>
            // Zebra bars as painted in Japan: 45 cm white bars with 45 cm
            // gaps, each spanning the crossing's width, so you step across
            // them as you walk (u runs along the walk, in meters).
            if (fract(vUv.x / 0.9) > 0.5) discard;
            // A little asphalt either side of the bars.
            if (vUv.y < 0.04 || vUv.y > 0.96) discard;
            gl_FragColor = vec4(vec3(0.93) * uBright, 1.0);
          }`,
      }),
    [],
  )
  useLayoutEffect(() => {
    crossingMat.clippingPlanes = clip
  }, [crossingMat, clip])
  // Painted lines are unlit, so dim them by hand after dark.
  const bright = 1 - night * 0.6
  useLayoutEffect(() => {
    crossingMat.uniforms.uBright.value = bright
  }, [crossingMat, bright])
  const lineColor = useMemo(() => new THREE.Color(COLORS.laneLine).multiplyScalar(bright), [bright])

  return (
    <group>
      <mesh geometry={geos.base} material={mats.ground} receiveShadow />
      {areaLayers.map((l) => (
        <mesh key={l.t} geometry={l.geo} material={mats.areas[l.t]} receiveShadow />
      ))}
      <mesh geometry={geos.sidewalk} material={mats.sidewalk} receiveShadow />
      <mesh geometry={geos.road} material={mats.road} receiveShadow />
      <mesh geometry={geos.line}>
        <meshBasicMaterial color={lineColor} clippingPlanes={clip} />
      </mesh>
      <mesh geometry={geos.footway} material={mats.footway} receiveShadow />
      <mesh geometry={geos.crossing} material={crossingMat} />
    </group>
  )
}

/** The buildings' look: windows, shop fronts, roof panels, and the
 *  see-through hole around the player (see seeThrough.ts). */
function buildingMaterial(uniforms: SeeThroughUniforms & { uNight: { value: number } }, opts: Parameters<typeof seeThroughGlsl>[0] = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aWall; attribute float aU; attribute float aTop; attribute float aBase; attribute vec2 aSeg;
        varying float vWall; varying float vU; varying float vTop; varying float vBase; varying vec3 vWorld; varying vec2 vSeg;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWall = aWall; vU = aU; vTop = aTop; vBase = aBase; vSeg = aSeg;
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uPlayer; uniform vec3 uCam; uniform float uNight;
        varying float vWall; varying float vU; varying float vTop; varying float vBase; varying vec3 vWorld; varying vec2 vSeg;
        float roundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${seeThroughGlsl(opts)}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winGlow = 0.0;
        // Diorama: lift every color toward warm white and give it a little
        // more color, like painted clay rather than concrete.
        {
          float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 1.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.88), 0.15);
        }
        if (vWall > 1.5) {
          // Cornice trim: plain, with a light edge at the corners.
          float d = min(vU - vSeg.x, vSeg.y - vU);
          diffuseColor.rgb *= 1.0 + 0.1 * (1.0 - smoothstep(0.0, 0.3, d));
        } else if (vWall > 0.5) {
          float y = vWorld.y - vBase;
          // Ground floor: shop fronts with rounded tops. Above: rows of
          // rounded windows every 3.2 m.
          vec2 sp = vec2((fract(vU / 4.0) - 0.535) * 4.0, y - 1.55);
          float shop = 1.0 - smoothstep(-0.02, 0.02, roundBox(sp, vec2(1.54, 1.05), 0.3));
          float fy = fract((y - 3.0) / 3.2);
          vec2 wp = vec2((fract(vU / 2.4) - 0.5) * 2.4, (fy - 0.54) * 3.2);
          float wd = roundBox(wp, vec2(0.68, 0.74), 0.26);
          float rowOk = step(3.0, y) * step(y, vTop - 0.6);
          float row = rowOk * (1.0 - smoothstep(-0.02, 0.02, wd));
          // A soft frame round each window.
          float frame = rowOk * (1.0 - smoothstep(0.06, 0.11, abs(wd - 0.04)));
          float win = max(shop, row);
          diffuseColor.rgb *= 1.0 - frame * 0.08;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.74, 0.82), win * 0.85);
          // At night most shop fronts and some windows light up.
          float cellId = fract(sin(dot(vec2(floor(vU / 2.4), floor((y - 3.0) / 3.2)) + vTop * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = shop > 0.5 ? step(0.15, cellId) : step(0.55, cellId);
          winGlow = win * lit * uNight;
          // Bevel: walls catch a little light near their corners and top,
          // so the blocks look rounded off.
          if (vSeg.y > vSeg.x) {
            float d = min(vU - vSeg.x, vSeg.y - vU);
            diffuseColor.rgb *= 1.0 + 0.09 * (1.0 - smoothstep(0.0, 0.5, d));
          }
          // Soft shade at the foot of the wall, as if from the ground.
          diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 1.6, y));
        } else if (vWorld.y - vBase < vTop + 0.05) {
          // Roofs: big soft panels.
          vec2 q = vWorld.xz / 3.0;
          vec2 g = abs(fract(q) - 0.5);
          float n = fract(sin(dot(floor(q), vec2(127.1, 311.7))) * 43758.5453);
          diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.04 - step(0.48, max(g.x, g.y)) * 0.03;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * winGlow * 0.9;`,
      )
  }
  // Different see-through options need their own shader program.
  m.customProgramCacheKey = () => `building-${JSON.stringify(opts)}`
  return m
}

function Buildings({
  map,
  tile,
  clip,
  focus,
  night,
}: {
  map: GameMap
  tile: MapTile
  clip: THREE.Plane[]
  focus: React.RefObject<Focus>
  night: number
}) {
  const geo = useDisposable(() => buildingsGeometry(tile.buildings, heightFn(tile)), [tile])
  // Bridges and the Shuto Expressway viaducts: weathered concrete.
  const bridgeGeo = useDisposable(() => surfacesGeometry(tile.bridges, '#a9aaa5'), [tile])
  const viaductGeo = useDisposable(
    () => viaductsGeometry(tile.viaducts, heightFn(tile), { deck: '#a3a49f', side: '#d6d7d2', road: '#62646a' }),
    [tile],
  )
  const camera = useThree((s) => s.camera)
  const uniforms = useMemo(
    () => ({ ...seeThroughUniforms(), uNight: { value: 0 } }),
    [],
  )

  const material = useDisposable(() => buildingMaterial(uniforms), [uniforms])
  // The Shuto decks also open up overhead, so the pavement under them shows.
  // The diorama's lower, longer view looks across a lot of deck, so all of
  // it in front of the player opens up.
  const viaductMaterial = useDisposable(() => buildingMaterial(uniforms, { overhead: 60 }), [uniforms])
  useLayoutEffect(() => {
    material.clippingPlanes = clip
    viaductMaterial.clippingPlanes = clip
  }, [material, viaductMaterial, clip])

  useFrame(() => {
    const { x, y } = focus.current
    uniforms.uPlayer.value.set(x, groundAt(map, x, y) + 1.0, y)
    uniforms.uCam.value.copy(camera.position)
    uniforms.uNight.value = night
  })

  return (
    <>
      <mesh geometry={geo} material={material} castShadow receiveShadow />
      <mesh geometry={bridgeGeo} material={material} castShadow receiveShadow />
      <mesh geometry={viaductGeo} material={viaductMaterial} castShadow receiveShadow />
    </>
  )
}

function Trees({ tile, clip }: { tile: MapTile; clip: THREE.Plane[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const count = tile.trees.length / 3
  const trunkGeo = useDisposable(() => new THREE.CylinderGeometry(0.14, 0.18, 1.8, 8).translate(0, 0.9, 0), [])
  // Diorama trees: a cluster of faceted gems, like the model-railway kind.
  const crownGeo = useDisposable(
    () =>
      mergeGeometries([
        new THREE.IcosahedronGeometry(1.2, 0).translate(0, 2.9, 0),
        new THREE.IcosahedronGeometry(0.85, 0).rotateY(0.6).translate(0.6, 2.5, 0.35),
        new THREE.IcosahedronGeometry(0.8, 0).rotateY(1.3).translate(-0.55, 2.55, -0.25),
      ]),
    [],
  )

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const x = tile.trees[i * 3]
      const z = tile.trees[i * 3 + 1]
      const k = tile.trees[i * 3 + 2]
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39996) % (Math.PI * 2))
      p.set(x, tileGroundAt(tile, x, z), z)
      s.set(k, k, k)
      m.compose(p, q, s)
      trunks.current?.setMatrixAt(i, m)
      crowns.current?.setMatrixAt(i, m)
      crowns.current?.setColorAt(i, c.set(COLORS.leaves[i % COLORS.leaves.length]))
    }
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true
      crowns.current.computeBoundingSphere()
    }
    trunks.current?.computeBoundingSphere()
  }, [tile, count])

  return (
    <group>
      <instancedMesh ref={trunks} args={[trunkGeo, undefined, count]} castShadow>
        <meshLambertMaterial color={COLORS.trunk} clippingPlanes={clip} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeo, undefined, count]} castShadow receiveShadow>
        <meshLambertMaterial flatShading clippingPlanes={clip} />
      </instancedMesh>
    </group>
  )
}

/** Sun (or moon) with a shadow box that follows the player. */
function Sun({ map, focus, sky }: { map: GameMap; focus: React.RefObject<Focus>; sky: SkyState }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const l = light.current
    if (!l) return
    const { x, y } = focus.current
    const h = groundAt(map, x, y)
    target.position.set(x, h, y)
    target.updateMatrixWorld()
    l.position.set(x + sky.lightDir.x * 90, h + sky.lightDir.y * 90, y + sky.lightDir.z * 90)
  })
  return (
    <>
      <hemisphereLight color={sky.hemi.sky} groundColor={sky.hemi.ground} intensity={sky.hemi.intensity} />
      <directionalLight
        ref={light}
        target={target}
        intensity={sky.sun.intensity}
        color={sky.sun.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <primitive object={target} />
    </>
  )
}

/** One square of the map: everything on it, clipped to its edges. */
function TileView({ map, tile, focus, sky, when, day, minute }: { map: GameMap; tile: MapTile; focus: React.RefObject<Focus>; sky: SkyState; when: FlowTime; day: number; minute: number }) {
  const clip = useClipPlanes(tile)
  const height = useMemo(() => heightFn(tile), [tile])
  // Landmarks bring their own signs.
  const signTile = useMemo(() => (tile.signs.some((s) => LANDMARK_SIGNS.has(s.t)) ? { ...tile, signs: tile.signs.filter((s) => !LANDMARK_SIGNS.has(s.t)) } : tile), [tile])
  return (
    <>
      <Ground tile={tile} clip={clip} night={sky.night} />
      <Buildings map={map} tile={tile} clip={clip} focus={focus} night={sky.night} />
      <Trees tile={tile} clip={clip} />
      <Props tile={tile} slopes={map.slopes} clip={clip} night={sky.night} />
      <Signs tile={signTile} clip={clip} height={height} day={day} minute={minute} night={sky.night} />
      <Crowd tile={tile} clip={clip} flow={map.peopleFlow} when={when} rain={sky.rain} />
    </>
  )
}

export function World({
  map,
  tiles,
  focus,
  sky,
  when,
  day,
  minute,
  surface = true,
  distance = 32,
}: {
  map: GameMap
  /** The loaded tiles; a new array whenever one loads or unloads. */
  tiles: MapTile[]
  focus: React.RefObject<Focus>
  sky: SkyState
  /** Tokyo month, hour and whether it's a holiday, for how many people are out. */
  when: FlowTime
  /** Tokyo weekday (0 = Monday) and minute of the day, for shop hours. */
  day: number
  minute: number
  /** False while the player is down in a station: the street is hidden. */
  surface?: boolean
  /** Camera distance, for how far around the player cars drive. */
  distance?: number
}) {
  return (
    <>
      <Sun map={map} focus={focus} sky={sky} />
      <group visible={surface}>
        {tiles.map((t) => (
          <TileView key={t.key} map={map} tile={t} focus={focus} sky={sky} when={when} day={day} minute={minute} />
        ))}
        <Toy>
          <Landmarks map={map} tiles={tiles} focus={focus} night={sky.night} />
        </Toy>
        <Cars map={map} tiles={tiles} focus={focus} hour={when.hour} night={sky.night} distance={distance} />
      </group>
      <WeatherFx focus={focus} rain={sky.rain} snow={sky.snow} />
    </>
  )
}
