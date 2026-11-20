import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { GameMap } from './map'

// The whole map is one plane. A data texture holds one texel per tile
// (R = tile type, G = variant) and the fragment shader draws each tile's
// pattern procedurally, so even a 700×700 tile map is a single draw call.
//
// World space: tile (x, y) covers x..x+1 and -y-1..-y, so north stays up.

const vertexShader = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp usampler2D;
  uniform usampler2D uTiles;
  uniform vec2 uSize;
  in vec2 vUv;
  out vec4 fragColor;

  const uint VOID = 0u, GROUND = 1u, ROAD = 2u, FOOTWAY = 3u, GRASS = 4u, WATER = 5u,
    BUILDING = 6u, TREE = 7u, CROSSING = 8u, PARKING = 9u, WOODS = 10u, PITCH = 11u, SHRINE = 12u;

  uvec2 tileAt(ivec2 t) {
    if (t.x < 0 || t.y < 0 || t.x >= int(uSize.x) || t.y >= int(uSize.y)) return uvec2(VOID, 0u);
    return texelFetch(uTiles, t, 0).rg;
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Thin lines at tile edges, for paving.
  float grid(vec2 f, float w) {
    vec2 g = step(vec2(w), f) * step(f, vec2(1.0 - w));
    return 1.0 - g.x * g.y;
  }

  vec3 roofColor(uint v) {
    vec3 c[8] = vec3[8](
      vec3(0.62, 0.56, 0.66), vec3(0.70, 0.62, 0.56), vec3(0.55, 0.62, 0.70), vec3(0.74, 0.72, 0.66),
      vec3(0.60, 0.66, 0.62), vec3(0.78, 0.66, 0.62), vec3(0.58, 0.58, 0.62), vec3(0.68, 0.70, 0.76));
    return c[v % 8u];
  }

  vec3 ground(uint type, vec2 p, vec2 f, ivec2 t) {
    float n = hash(vec2(t));
    if (type == ROAD) {
      vec3 c = vec3(0.36, 0.37, 0.40) + (n - 0.5) * 0.02;
      return c;
    }
    if (type == CROSSING) {
      float stripe = step(0.5, fract(p.x * 1.0 + p.y * 1.0));
      return mix(vec3(0.38, 0.39, 0.42), vec3(0.93), stripe);
    }
    if (type == FOOTWAY) {
      vec3 c = vec3(0.87, 0.80, 0.68) + (n - 0.5) * 0.04;
      return mix(c, c * 0.88, grid(fract(p * 2.0), 0.04));
    }
    if (type == GRASS || type == PITCH || type == WOODS || type == TREE) {
      vec3 c = type == WOODS ? vec3(0.34, 0.58, 0.31) : vec3(0.49, 0.73, 0.39);
      float speck = step(0.82, hash(floor(p * 4.0)));
      c = mix(c, c * 0.86, speck);
      if (type == PITCH) c = mix(c, vec3(0.92), grid(fract(p / 8.0), 0.012));
      return c;
    }
    if (type == WATER) {
      float wave = step(0.92, fract(p.y * 1.5 + sin(p.x * 1.3) * 0.25));
      return mix(vec3(0.36, 0.63, 0.87), vec3(0.62, 0.81, 0.95), wave);
    }
    if (type == PARKING) {
      vec3 c = vec3(0.66, 0.66, 0.69);
      float line = step(0.94, fract(p.x / 1.25)) * step(0.5, fract(p.y / 5.0 + 0.25));
      return mix(c, vec3(0.95), line);
    }
    if (type == SHRINE) {
      vec3 c = vec3(0.84, 0.78, 0.64);
      return mix(c, c * 0.9, step(0.7, hash(floor(p * 6.0))));
    }
    if (type == VOID) return vec3(0.08, 0.08, 0.1);
    // GROUND: grey paving stones.
    vec3 c = vec3(0.84, 0.83, 0.80) + (n - 0.5) * 0.03;
    return mix(c, c * 0.9, grid(f, 0.03));
  }

  void main() {
    vec2 p = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y); // tile units, y grows south
    ivec2 t = ivec2(floor(p));
    vec2 f = fract(p);
    uvec2 here = tileAt(t);
    uint type = here.r;
    vec3 col;

    if (type == BUILDING) {
      bool southOpen = tileAt(t + ivec2(0, 1)).r != BUILDING;
      bool northOpen = tileAt(t + ivec2(0, -1)).r != BUILDING;
      bool westOpen = tileAt(t + ivec2(-1, 0)).r != BUILDING;
      bool eastOpen = tileAt(t + ivec2(1, 0)).r != BUILDING;
      vec3 roof = roofColor(here.g);
      col = roof;
      // Faux 3/4 view: the south-most row of each building is its front wall.
      if (southOpen) {
        vec3 wall = roof * 0.62;
        float win = step(0.2, f.y) * step(f.y, 0.62) * step(0.25, fract(p.x)) * step(fract(p.x), 0.75);
        col = mix(wall, vec3(0.62, 0.78, 0.9), win * 0.85);
        if (f.y > 0.9) col *= 0.7;
      } else {
        if (northOpen && f.y < 0.12) col = roof * 1.15;
        if (westOpen && f.x < 0.08) col = roof * 0.82;
        if (eastOpen && f.x > 0.92) col = roof * 0.82;
        // Shadow under the roof edge right above the wall.
        if (tileAt(t + ivec2(0, 2)).r != BUILDING && f.y > 0.85) col *= 0.9;
      }
    } else {
      col = ground(type, p, f, t);
      // Buildings cast a short shadow to the south-east.
      if (tileAt(t + ivec2(0, -1)).r == BUILDING && f.y < 0.35) col *= 0.82;
      else if (tileAt(t + ivec2(-1, 0)).r == BUILDING && f.x < 0.2) col *= 0.88;
      if (type == TREE) {
        vec2 d = f - vec2(0.5, 0.45);
        float r = length(d);
        float shadow = 1.0 - smoothstep(0.38, 0.46, length(f - vec2(0.56, 0.55)));
        col = mix(col, col * 0.7, shadow);
        float canopy = 1.0 - smoothstep(0.40, 0.44, r);
        vec3 leaf = mix(vec3(0.20, 0.47, 0.24), vec3(0.33, 0.62, 0.30), smoothstep(0.3, -0.2, d.x + d.y));
        col = mix(col, leaf, canopy);
      }
    }
    fragColor = vec4(col, 1.0);
  }
`

export function MapLayer({ map }: { map: GameMap }) {
  const texture = useMemo(() => {
    const data = new Uint8Array(map.width * map.height * 2)
    for (let i = 0; i < map.tiles.length; i++) {
      data[i * 2] = map.tiles[i]
      data[i * 2 + 1] = map.variants[i]
    }
    const tex = new THREE.DataTexture(data, map.width, map.height, THREE.RGIntegerFormat, THREE.UnsignedByteType)
    tex.internalFormat = 'RG8UI'
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [map])

  useEffect(() => () => texture.dispose(), [texture])

  const uniforms = useMemo(
    () => ({ uTiles: { value: texture }, uSize: { value: new THREE.Vector2(map.width, map.height) } }),
    [texture, map],
  )

  return (
    <mesh position={[map.width / 2, -map.height / 2, 0]}>
      <planeGeometry args={[map.width, map.height]} />
      <shaderMaterial
        glslVersion={THREE.GLSL3}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}
