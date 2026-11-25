import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// One character build shared by the player and the people on the street, so
// passers-by look like the player in different clothes. Each part is a
// geometry already placed in the body; limbs swing about a pivot (hip or
// shoulder) while walking.

export type PartName = 'legL' | 'legR' | 'torso' | 'armL' | 'armR' | 'head' | 'hair' | 'longHair' | 'eyes' | 'backpack' | 'umbrella'

/** What colors a part: clothes, skin, hair, or a fixed color. */
export type PartPaint = 'pants' | 'shirt' | 'skin' | 'hair' | 'bag' | 'umbrella' | 'eyes'

export interface PartSpec {
  name: PartName
  paint: PartPaint
  /** Hip or shoulder the part swings about, and how far relative to the
   *  walk swing (legs 1, arms -0.8 or 0.8). */
  pivot?: [number, number, number]
  swing?: number
  /** Not everyone has one (a backpack, long hair, an umbrella). */
  optional?: boolean
  shadow?: boolean
  /** detail 1 for the player; less for the crowd, where there are thousands. */
  make: (detail: number) => THREE.BufferGeometry
}

const n = (segments: number, detail: number, min = 3) => Math.max(min, Math.round(segments * detail))

// Diorama toy figures (see /looks/, option 2): soft rounded blocks, a big
// soft-cube head, dot eyes. About three heads tall.
const rbox = (w: number, h: number, d: number, r: number, detail: number) =>
  new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(3 * detail)), Math.min(r, Math.min(w, h, d) / 2 - 0.001))
/** Non-indexed, like RoundedBoxGeometry, so all parts merge together. */
const flat = (g: THREE.BufferGeometry) => {
  if (!g.index) return g
  const out = g.toNonIndexed()
  g.dispose()
  return out
}
const merge = (parts: THREE.BufferGeometry[]) => {
  const out = mergeGeometries(parts.map(flat))
  parts.forEach((g) => g.dispose())
  return out
}
/** A leg with its shoe, standing at x. */
const leg = (x: number, d: number) => merge([rbox(0.19, 0.46, 0.21, 0.07, d).translate(x, 0.33, 0), rbox(0.21, 0.14, 0.3, 0.06, d).translate(x, 0.07, 0.03)])
/** An arm with its hand, hanging from the shoulder at x. */
const arm = (x: number, d: number) => rbox(0.14, 0.42, 0.16, 0.065, d).translate(x, 0.84, 0)

const TOY_PARTS: PartSpec[] = [
  // Legs (and shoes) hang from the hips.
  { name: 'legL', paint: 'pants', pivot: [-0.12, 0.56, 0], swing: 1, shadow: true, make: (d) => leg(-0.12, d) },
  { name: 'legR', paint: 'pants', pivot: [0.12, 0.56, 0], swing: -1, shadow: true, make: (d) => leg(0.12, d) },
  { name: 'torso', paint: 'shirt', shadow: true, make: (d) => rbox(0.52, 0.56, 0.34, 0.13, d).translate(0, 0.82, 0) },
  { name: 'backpack', paint: 'bag', optional: true, shadow: true, make: (d) => rbox(0.36, 0.4, 0.16, 0.07, d).translate(0, 0.86, -0.24) },
  // Arms hang from the shoulders and swing against the legs.
  { name: 'armL', paint: 'shirt', pivot: [-0.34, 1.04, 0], swing: -0.8, shadow: true, make: (d) => arm(-0.34, d) },
  { name: 'armR', paint: 'shirt', pivot: [0.34, 1.04, 0], swing: 0.8, shadow: true, make: (d) => arm(0.34, d) },
  // Head and hands, in skin.
  {
    name: 'head',
    paint: 'skin',
    shadow: true,
    make: (d) =>
      merge([
        rbox(0.56, 0.52, 0.5, 0.2, d).translate(0, 1.37, 0),
        new THREE.SphereGeometry(0.075, n(12, d), n(8, d)).translate(-0.34, 0.6, 0),
        new THREE.SphereGeometry(0.075, n(12, d), n(8, d)).translate(0.34, 0.6, 0),
      ]),
  },
  // Short hair: a cap on top, a block at the back and a fringe.
  {
    name: 'hair',
    paint: 'hair',
    make: (d) =>
      merge([
        rbox(0.6, 0.2, 0.55, 0.09, d).translate(0, 1.6, -0.02),
        rbox(0.6, 0.32, 0.14, 0.06, d).translate(0, 1.47, -0.2),
        rbox(0.46, 0.1, 0.08, 0.035, d).translate(0.06, 1.53, 0.23),
      ]),
  },
  // Long hair down the back, with locks framing the face.
  {
    name: 'longHair',
    paint: 'hair',
    optional: true,
    make: (d) =>
      merge([
        rbox(0.6, 0.62, 0.16, 0.07, d).translate(0, 1.33, -0.19),
        rbox(0.1, 0.5, 0.42, 0.045, d).translate(-0.27, 1.3, 0.02),
        rbox(0.1, 0.5, 0.42, 0.045, d).translate(0.27, 1.3, 0.02),
      ]),
  },
  {
    name: 'eyes',
    paint: 'eyes',
    make: (d) => merge([new THREE.CapsuleGeometry(0.028, 0.04, 2, n(8, d)).translate(-0.11, 1.38, 0.252), new THREE.CapsuleGeometry(0.028, 0.04, 2, n(8, d)).translate(0.11, 1.38, 0.252)]),
  },
  {
    name: 'umbrella',
    paint: 'umbrella',
    optional: true,
    shadow: true,
    make: (d) => flat(new THREE.ConeGeometry(0.62, 0.3, n(10, d, 6)).translate(0.1, 2.15, 0.05)),
  },
]

/** Toys are drawn a bit bigger than life so people read from the diorama
 *  camera. */
const TOY_SCALE = 1.15

export const PARTS: PartSpec[] = TOY_PARTS.map((p) => ({
  ...p,
  pivot: p.pivot?.map((v) => v * TOY_SCALE) as PartSpec['pivot'],
  make: (d: number) => p.make(d).scale(TOY_SCALE, TOY_SCALE, TOY_SCALE),
}))

/** The player's look. */
export const PLAYER_LOOK: Look = {
  shirt: '#e5484d',
  pants: '#2b3445',
  skin: '#f2c9a0',
  hair: '#2a211c',
  bag: '#f0b429',
  backpack: true,
  longHair: false,
  height: 1,
}

export interface Look {
  shirt: string
  pants: string
  skin: string
  hair: string
  bag: string
  backpack: boolean
  longHair: boolean
  /** Overall scale, about 0.9 to 1.08. */
  height: number
}

// Tokyo street clothes run dark and neutral, with some color.
const SHIRTS = ['#1f2329', '#2f3542', '#57606f', '#a4b0be', '#f1f2f6', '#e9e4d8', '#1e3799', '#273c75', '#b33939', '#227093', '#6d214f', '#cc8e35', '#40407a', '#d1ccc0', '#3d5a40', '#8e7c68', '#c7a17a', '#e58fa1']
const PANTS = ['#1b1f27', '#2b3445', '#3a3f4b', '#4b5563', '#1e3a5f', '#334e68', '#5c4b3b', '#c2b59b', '#111111', '#6b6b6b']
const SKINS = ['#f2c9a0', '#eec19a', '#e8b98e', '#f6d3b3', '#d9a77c', '#c68e63', '#a8724c', '#7c5236']
const HAIRS = ['#1a1412', '#2a211c', '#2a211c', '#3b2a20', '#4a3426', '#6b4a32', '#8a6a4a', '#b8b2a8', '#d9c08a', '#141414']
const BAGS = ['#2f3542', '#111111', '#7f5539', '#f0b429', '#1e3799', '#b33939', '#57606f', '#e9e4d8']
export const UMBRELLAS = ['#f5f6fa', '#e9eef5', '#273c75', '#e84118', '#44bd32', '#353b48', '#fbc531', '#dfe6e9']

/** A seeded random look for someone on the street. */
export function randomLook(rand: () => number): Look {
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]
  return {
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    bag: pick(BAGS),
    backpack: rand() < 0.3,
    longHair: rand() < 0.4,
    height: 0.9 + rand() * 0.18,
  }
}

const EYES = '#1b1b1b'

/** The color a look gives a part. */
export function paintOf(look: Look, paint: PartPaint, umbrella = '#f5f6fa') {
  switch (paint) {
    case 'pants':
      return look.pants
    case 'shirt':
      return look.shirt
    case 'skin':
      return look.skin
    case 'hair':
      return look.hair
    case 'bag':
      return look.bag
    case 'umbrella':
      return umbrella
    case 'eyes':
      return EYES
  }
}

/** Whether a look has an optional part. */
export function hasPart(look: Look, name: PartName, rain: boolean) {
  if (name === 'backpack') return look.backpack
  if (name === 'longHair') return look.longHair
  if (name === 'umbrella') return rain
  return true
}

// --- The crowd as one mesh ----------------------------------------------------
// Thousands of people would be a dozen draw calls per tile if each body part
// were its own instanced mesh. Instead every part goes into one geometry that
// knows, per vertex, what paints it and which hip or shoulder it swings
// about; the vertex shader poses each person from three small per-person
// attributes. One draw call per tile, plus one for shadows.

const PAINT_INDEX: Record<PartPaint, number> = { pants: 0, shirt: 1, skin: 2, hair: 3, bag: 4, umbrella: 5, eyes: 6 }
const OPTIONAL_INDEX: Partial<Record<PartName, number>> = { backpack: 1, longHair: 2, umbrella: 3 }

/** All parts merged, with per-vertex paint, limb pivot and optional-part ids. */
export function crowdGeometry(detail = 0.5) {
  const pieces = PARTS.map((spec) => {
    const g = spec.make(detail)
    g.deleteAttribute('uv')
    const count = g.getAttribute('position').count
    const paint = new Float32Array(count).fill(PAINT_INDEX[spec.paint])
    const opt = new Float32Array(count).fill(OPTIONAL_INDEX[spec.name] ?? 0)
    const limb = new Float32Array(count * 4)
    const [px, py, pz] = spec.pivot ?? [0, 0, 0]
    for (let i = 0; i < count; i++) limb.set([px, py, pz, spec.swing ?? 0], i * 4)
    g.setAttribute('aPaint', new THREE.BufferAttribute(paint, 1))
    g.setAttribute('aOpt', new THREE.BufferAttribute(opt, 1))
    g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 4))
    return g
  })
  const merged = mergeGeometries(pieces)
  pieces.forEach((g) => g.dispose())
  return merged
}

/** A color as one float (0xRRGGBB), exact in a 32-bit float. */
export const packColor = (hex: string) => parseInt(hex.slice(1), 16)

/** Per person: colors packed as floats, and the pose. */
export function crowdAttributes(n: number) {
  return {
    // pants, shirt, skin
    iColorsA: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    // hair, bag, umbrella
    iColorsB: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    // limb swing (radians), backpack, long hair, umbrella (0 or 1)
    iPose: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage),
  }
}

const POSE_VERTEX = /* glsl */ `
  attribute float aPaint;
  attribute float aOpt;
  attribute vec4 aLimb;
  attribute vec3 iColorsA;
  attribute vec3 iColorsB;
  attribute vec4 iPose;
  vec3 crowdSwing(vec3 p) {
    float a = iPose.x * aLimb.w;
    float c = cos(a);
    float s = sin(a);
    vec3 q = p - aLimb.xyz;
    return aLimb.xyz + vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z);
  }
  float crowdShow() {
    if (aOpt < 0.5) return 1.0;
    if (aOpt < 1.5) return iPose.y;
    if (aOpt < 2.5) return iPose.z;
    return iPose.w;
  }
`

const UNPACK = /* glsl */ `
  vec3 crowdUnpack(float f) {
    float r = floor(f / 65536.0);
    float g = floor(mod(f, 65536.0) / 256.0);
    float b = mod(f, 256.0);
    return pow(vec3(r, g, b) / 255.0, vec3(2.2));
  }
`

function poseShader(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${POSE_VERTEX}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed = crowdSwing(transformed) * crowdShow();`)
}

/** Lit material for the crowd mesh. */
export function crowdMaterial(clip: THREE.Plane[]) {
  const m = new THREE.MeshLambertMaterial({ clippingPlanes: clip })
  m.onBeforeCompile = (shader) => {
    poseShader(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${UNPACK}\nvarying vec3 vPaint;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  { float a = iPose.x * aLimb.w; float c = cos(a); float s = sin(a);
    objectNormal = vec3(objectNormal.x, c * objectNormal.y - s * objectNormal.z, s * objectNormal.y + c * objectNormal.z); }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vPaint = aPaint < 0.5 ? crowdUnpack(iColorsA.x) : aPaint < 1.5 ? crowdUnpack(iColorsA.y) : aPaint < 2.5 ? crowdUnpack(iColorsA.z)
    : aPaint < 3.5 ? crowdUnpack(iColorsB.x) : aPaint < 4.5 ? crowdUnpack(iColorsB.y) : aPaint < 5.5 ? crowdUnpack(iColorsB.z) : vec3(0.012);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaint;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vPaint, opacity );')
  }
  m.customProgramCacheKey = () => 'crowd'
  return m
}

/** Shadow-casting material that poses people the same way. */
export function crowdDepthMaterial(clip: THREE.Plane[]) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, clippingPlanes: clip })
  m.onBeforeCompile = poseShader
  m.customProgramCacheKey = () => 'crowd-depth'
  return m
}
