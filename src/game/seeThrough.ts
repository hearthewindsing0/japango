import * as THREE from 'three'

// Buildings (and the Shuto viaducts) get a see-through hole between the
// camera and the player, so they never hide you. Shared by World's
// buildings and hand-made landmarks such as ALMOND.

export interface SeeThroughUniforms {
  uPlayer: { value: THREE.Vector3 }
  uCam: { value: THREE.Vector3 }
}

export const seeThroughUniforms = (): SeeThroughUniforms => ({
  uPlayer: { value: new THREE.Vector3() },
  uCam: { value: new THREE.Vector3() },
})

/**
 * GLSL for the fragment shader, after clipping. Needs `vWorld` (world
 * position), `vBase` (ground height under the wall) and the uniforms above.
 *
 * `cone`: a hole shaped like a cone with its tip at the camera, so it stays
 * the same size on screen however far the wall is from the player.
 * `overhead`: also cut a cylinder this wide (meters) around the line of
 * sight through anything well above the player. That is for the Shuto
 * Expressway decks, which run just under the camera over Roppongi-dori and
 * would otherwise hide the whole pavement in front of ALMOND.
 */
export function seeThroughGlsl({ cone = 3.2, overhead = 0 } = {}) {
  return /* glsl */ `
  {
    vec3 pa = vWorld - uPlayer;
    vec3 ba = uCam - uPlayer;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * t);
    float r = ${cone.toFixed(2)} * (1.0 - t);
    float edge = smoothstep(r * 0.7, r, d);
    ${
      overhead > 0
        ? // A wide cut (the diorama's view of the Shuto) takes the piers in front too, not just the decks.
          `if ((${overhead >= 30 ? 'true' : 'false'} || vWorld.y > uPlayer.y + 3.0) && t > 0.05) edge = min(edge, smoothstep(${(overhead * 0.6).toFixed(2)}, ${overhead.toFixed(2)}, d));`
        : ''
    }
    float dither = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
    if (t > 0.03 && vWorld.y - vBase > 0.7 && edge < dither) discard;
  }`
}
