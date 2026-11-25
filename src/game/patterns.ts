import * as THREE from 'three'

export type Pattern = 'slabs' | 'bricks' | 'pavers' | 'asphalt' | 'grass' | 'gravel'

// Each pattern darkens or lightens the base color a little, based on world
// position, so flat ground reads as paving, asphalt or grass up close.
const PATTERNS: Record<Pattern, string> = {
  slabs: `
    vec2 q = p / vec2(0.9, 0.9);
    vec2 g = abs(fract(q) - 0.5);
    float line = step(0.47, max(g.x, g.y));
    shade = (hash2(floor(q)) - 0.5) * 0.06 - line * 0.07;`,
  bricks: `
    vec2 q = p / vec2(0.6, 0.3);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 g = abs(fract(q) - 0.5);
    float line = step(0.45, g.x) + step(0.42, g.y);
    shade = (hash2(floor(q)) - 0.5) * 0.08 - min(line, 1.0) * 0.08;`,
  pavers: `
    vec2 q = p / vec2(0.4, 0.2);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 g = abs(fract(q) - 0.5);
    float line = step(0.44, g.x) + step(0.4, g.y);
    shade = (hash2(floor(q)) - 0.5) * 0.12 - min(line, 1.0) * 0.07;`,
  asphalt: `
    shade = (hash2(floor(p * 9.0)) - 0.5) * 0.05 + (hash2(floor(p * 0.5)) - 0.5) * 0.03;`,
  grass: `
    float n = hash2(floor(p * 1.3)) * 0.6 + hash2(floor(p * 4.0)) * 0.4;
    shade = (n - 0.5) * 0.14;`,
  gravel: `
    shade = (hash2(floor(p * 6.0)) - 0.5) * 0.12;`,
}

/** A Lambert material with a procedural world-space ground pattern. */
export function patternedMaterial(color: string, pattern: Pattern, clip?: THREE.Plane[]) {
  const m = new THREE.MeshLambertMaterial({ color, clippingPlanes: clip ?? null })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGroundPos;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vGroundPos;
          float shade = 0.0;
          ${PATTERNS[pattern]}
          // Diorama: patterns are a soft hint, not a texture.
          diffuseColor.rgb *= 1.0 + shade * 0.5;
        }`,
      )
  }
  m.customProgramCacheKey = () => `pattern-${pattern}`
  return m
}
