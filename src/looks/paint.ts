import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

// Watercolor pass: a Kuwahara filter flattens shading into washes of color,
// a little noise wobbles the edges as if drawn by hand, dark ink follows the
// outlines, and paper grain and pigment blotches sit on top.

const frag = /* glsl */ `
uniform float radius;
uniform float ink;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = texelSize;
  vec2 q = uv * resolution;
  // Hand-drawn wobble.
  vec2 w = (vec2(fbm(q / 38.0), fbm(q / 38.0 + 11.7)) - 0.5) * px * 7.0;
  vec2 st = uv + w;

  // Kuwahara: pick the calmest of four quadrants.
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  const int R = 4;
  for (int j = -R; j <= R; j++) {
    for (int i = -R; i <= R; i++) {
      vec3 c = texture2D(inputBuffer, st + vec2(float(i), float(j)) * px * radius / 4.0).rgb;
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
      if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
      if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
      if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
    }
  }
  float n = float((R + 1) * (R + 1));
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  float v0 = dot(s0 / n - m0 * m0, vec3(1.0));
  float v1 = dot(s1 / n - m1 * m1, vec3(1.0));
  float v2 = dot(s2 / n - m2 * m2, vec3(1.0));
  float v3 = dot(s3 / n - m3 * m3, vec3(1.0));
  vec3 col = m0; float best = v0;
  if (v1 < best) { best = v1; col = m1; }
  if (v2 < best) { best = v2; col = m2; }
  if (v3 < best) { best = v3; col = m3; }

  // Ink lines from a Sobel on brightness.
  float e = 1.5;
  float tl = luma(texture2D(inputBuffer, st + px * vec2(-e,  e)).rgb);
  float  t = luma(texture2D(inputBuffer, st + px * vec2( 0,  e)).rgb);
  float tr = luma(texture2D(inputBuffer, st + px * vec2( e,  e)).rgb);
  float  l = luma(texture2D(inputBuffer, st + px * vec2(-e,  0)).rgb);
  float  r = luma(texture2D(inputBuffer, st + px * vec2( e,  0)).rgb);
  float bl = luma(texture2D(inputBuffer, st + px * vec2(-e, -e)).rgb);
  float  b = luma(texture2D(inputBuffer, st + px * vec2( 0, -e)).rgb);
  float br = luma(texture2D(inputBuffer, st + px * vec2( e, -e)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = smoothstep(0.12, 0.45, sqrt(gx * gx + gy * gy));

  // Pigment: lift toward paper, pool darker in blotches, grain.
  float blotch = fbm(q / 140.0);
  float grain = vnoise(q / 2.2);
  col = mix(col, vec3(1.0), 0.1);
  col *= 0.9 + 0.16 * blotch;
  col -= (grain - 0.5) * 0.06;
  col = mix(col, col * vec3(0.32, 0.3, 0.38), edge * ink);
  // Warm paper.
  col *= vec3(1.0, 0.982, 0.94);
  outputColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export class PaintEffect extends Effect {
  constructor({ radius = 5, ink = 0.75 } = {}) {
    super('PaintEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['radius', new Uniform(radius)],
        ['ink', new Uniform(ink)],
      ]),
    })
  }
}
