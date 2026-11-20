import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
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
import { groundAt, type GameMap } from './map'
import { COLORS, T } from './tiles'
import type { SkyState } from './sky'
import { Weather as WeatherFx } from './Weather'

/** Shared state the world reads every frame: where the player is. */
export interface Focus {
  x: number
  y: number
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

function useClipPlanes(map: GameMap) {
  return useMemo(
    () => [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), map.width),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), map.height),
    ],
    [map],
  )
}

const heightFn = (map: GameMap): HeightFn => (x, z) => groundAt(map, x, z)
const cellOf = (map: GameMap) => map.ground?.cell ?? 4

/** The base ground: the terrain grid itself, each cell cut into two
 *  triangles the same way groundAt() reads it. */
function groundGeometry(map: GameMap) {
  const g = map.ground
  if (!g) {
    const rect = [0, 0, map.width, 0, map.width, map.height, 0, map.height]
    return polygonsGeometry([{ p: rect }], 0)
  }
  const pos = new Float32Array(g.width * g.height * 3)
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const i = (y * g.width + x) * 3
      pos[i] = x * g.cell
      pos[i + 1] = g.h[y * g.width + x]
      pos[i + 2] = y * g.cell
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

function useDisposable<T extends { dispose(): void }>(make: () => T, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(make, deps)
  useEffect(() => () => value.dispose(), [value])
  return value
}

function Ground({ map, clip, night }: { map: GameMap; clip: THREE.Plane[]; night: number }) {
  const areaLayers = useMemo(() => {
    const byType = new Map<number, GameMap['areas']>()
    for (const a of map.areas) byType.set(a.t, [...(byType.get(a.t) ?? []), a])
    // Footway plazas sit with the paths, above the other areas.
    return [...byType.entries()].map(([t, list]) => ({
      t,
      geo: drape(polygonsGeometry(list, t === T.FOOTWAY ? Y.path : Y.area + (t === T.WATER ? 0.005 : 0)), heightFn(map), cellOf(map)),
    }))
  }, [map])
  useEffect(() => () => areaLayers.forEach((l) => l.geo.dispose()), [areaLayers])

  const geos = useMemo(() => {
    const roads = map.roads
    const sidewalks = roads.filter((r) => r.s > 0).map((r) => ({ p: r.p, w: r.w + r.s * 2 }))
    const centerLines = roads.filter((r) => r.w >= 9).map((r) => r.p)
    const footways = map.paths.filter((p) => p.t !== 'crossing')
    const crossings = map.paths.filter((p) => p.t === 'crossing')
    const h = heightFn(map)
    const c = cellOf(map)
    return {
      base: groundGeometry(map),
      sidewalk: drape(ribbonsGeometry(sidewalks, Y.sidewalk), h, c),
      road: drape(ribbonsGeometry(roads, Y.road), h, c),
      line: drape(dashesGeometry(centerLines, Y.line), h, c),
      footway: drape(ribbonsGeometry(footways, Y.path), h, c),
      crossing: drape(ribbonsGeometry(crossings, Y.crossing, false), h, c),
    }
  }, [map])
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
            // Zebra bars run along the walking direction, 45 cm wide.
            float bar = step(0.5, fract(vUv.y * 4.0 / 0.9));
            if (bar < 0.5) discard;
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

function Buildings({
  map,
  clip,
  focus,
  night,
}: {
  map: GameMap
  clip: THREE.Plane[]
  focus: React.RefObject<Focus>
  night: number
}) {
  const geo = useDisposable(() => buildingsGeometry(map.buildings, heightFn(map)), [map])
  // Bridges and the Shuto Expressway viaducts: weathered concrete.
  const bridgeGeo = useDisposable(() => surfacesGeometry(map.bridges ?? [], '#a9aaa5'), [map])
  const viaductGeo = useDisposable(
    () => viaductsGeometry(map.viaducts ?? [], heightFn(map), { deck: '#a3a49f', side: '#d6d7d2', road: '#62646a' }),
    [map],
  )
  const camera = useThree((s) => s.camera)
  const uniforms = useMemo(
    () => ({ uPlayer: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uNight: { value: 0 } }),
    [],
  )

  const material = useDisposable(() => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aWall; attribute float aU; attribute float aTop; attribute float aBase;
          varying float vWall; varying float vU; varying float vTop; varying float vBase; varying vec3 vWorld;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vWall = aWall; vU = aU; vTop = aTop; vBase = aBase;
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uPlayer; uniform vec3 uCam; uniform float uNight;
          varying float vWall; varying float vU; varying float vTop; varying float vBase; varying vec3 vWorld;`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // See-through hole between the camera and the player, so buildings
          // never hide them. Dithered at the edge.
          {
            vec3 pa = vWorld - uPlayer;
            vec3 ba = uCam - uPlayer;
            float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            float d = length(pa - ba * t);
            // A cone with its tip at the camera: the hole stays the same
            // size on screen however far the wall is from the player.
            float r = 3.2 * (1.0 - t);
            float edge = smoothstep(r * 0.7, r, d);
            float dither = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
            if (t > 0.03 && vWorld.y - vBase > 0.7 && edge < dither) discard;
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float winGlow = 0.0;
          if (vWall > 0.5) {
            float y = vWorld.y - vBase;
            // Ground floor: shop fronts. Above: rows of windows every 3.2 m.
            float shop = step(0.5, y) * step(y, 2.6) * step(0.15, fract(vU / 4.0)) * step(fract(vU / 4.0), 0.92);
            float fy = fract((y - 3.0) / 3.2);
            float row = step(3.0, y) * step(y, vTop - 0.6) * step(0.3, fy) * step(fy, 0.78);
            float colw = step(0.2, fract(vU / 2.4)) * step(fract(vU / 2.4), 0.8);
            float win = max(shop, row * colw);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.55, 0.66), win * 0.85);
            // At night most shop fronts and some windows light up.
            float cellId = fract(sin(dot(vec2(floor(vU / 2.4), floor((y - 3.0) / 3.2)) + vTop * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
            float lit = shop > 0.5 ? step(0.15, cellId) : step(0.55, cellId);
            winGlow = win * lit * uNight;
            // Darker base and a band under the roof line.
            if (y < 0.4) diffuseColor.rgb *= 0.7;
            if (y > vTop - 0.35) diffuseColor.rgb *= 0.85;
          } else if (vWorld.y - vBase < vTop + 0.05) {
            // Roofs: weathered concrete panels.
            vec2 q = vWorld.xz / 3.0;
            vec2 g = abs(fract(q) - 0.5);
            float n = fract(sin(dot(floor(q), vec2(127.1, 311.7))) * 43758.5453);
            diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.08 - step(0.48, max(g.x, g.y)) * 0.06;
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * winGlow * 0.9;`,
        )
    }
    return m
  }, [uniforms])
  useLayoutEffect(() => {
    material.clippingPlanes = clip
  }, [material, clip])

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
      <mesh geometry={viaductGeo} material={material} castShadow receiveShadow />
    </>
  )
}

function Trees({ map, clip }: { map: GameMap; clip: THREE.Plane[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const count = map.trees.length / 3
  const trunkGeo = useDisposable(() => new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6).translate(0, 0.9, 0), [])
  const crownGeo = useDisposable(() => new THREE.IcosahedronGeometry(1.3, 1).scale(1, 1.15, 1).translate(0, 2.8, 0), [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const x = map.trees[i * 3]
      const z = map.trees[i * 3 + 1]
      const k = map.trees[i * 3 + 2]
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39996) % (Math.PI * 2))
      p.set(x, groundAt(map, x, z), z)
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
  }, [map, count])

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

export function World({ map, focus, sky }: { map: GameMap; focus: React.RefObject<Focus>; sky: SkyState }) {
  const clip = useClipPlanes(map)
  const height = useMemo(() => heightFn(map), [map])
  return (
    <>
      <Sun map={map} focus={focus} sky={sky} />
      <Ground map={map} clip={clip} night={sky.night} />
      <Buildings map={map} clip={clip} focus={focus} night={sky.night} />
      <Trees map={map} clip={clip} />
      <Props map={map} clip={clip} night={sky.night} />
      <Signs map={map} clip={clip} height={height} />
      <WeatherFx focus={focus} rain={sky.rain} snow={sky.snow} />
    </>
  )
}
