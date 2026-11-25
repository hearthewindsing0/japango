import * as THREE from 'three'

// Sign faces drawn on a canvas in M PLUS 1, cached so each sign is made once.

export const SIGN_FONT = '"M PLUS 1 Variable", "Noto Sans JP", sans-serif'

const cache = new Map<string, THREE.CanvasTexture>()

export function signTexture(text: string, o: { bg: string; fg: string; vertical?: boolean; w: number; h: number }) {
  const key = `${text}|${o.bg}|${o.fg}|${o.vertical}|${o.w}|${o.h}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = o.w
  c.height = o.h
  const g = c.getContext('2d')!
  if (o.bg !== 'transparent') {
    g.fillStyle = o.bg
    g.fillRect(0, 0, o.w, o.h)
    // A thin inner border, like a lightbox frame.
    g.strokeStyle = o.fg
    g.globalAlpha = 0.35
    g.lineWidth = Math.max(2, Math.min(o.w, o.h) * 0.04)
    g.strokeRect(g.lineWidth, g.lineWidth, o.w - g.lineWidth * 2, o.h - g.lineWidth * 2)
    g.globalAlpha = 1
  }
  g.fillStyle = o.fg
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const chars = [...text]
  if (o.vertical) {
    const step = Math.min(o.w * 0.78, (o.h * 0.88) / chars.length)
    g.font = `800 ${step * 0.92}px ${SIGN_FONT}`
    const top = o.h / 2 - (step * chars.length) / 2 + step / 2
    chars.forEach((ch, i) => {
      // Long vowel marks turn upright in vertical text.
      if (ch === 'ー') {
        g.save()
        g.translate(o.w / 2, top + i * step)
        g.rotate(Math.PI / 2)
        g.fillText(ch, 0, 0)
        g.restore()
      } else g.fillText(ch, o.w / 2, top + i * step)
    })
  } else {
    let size = o.h * 0.68
    g.font = `800 ${size}px ${SIGN_FONT}`
    const width = g.measureText(text).width
    if (width > o.w * 0.86) size *= (o.w * 0.86) / width
    g.font = `800 ${size}px ${SIGN_FONT}`
    g.fillText(text, o.w / 2, o.h / 2 + size * 0.04)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(key, t)
  return t
}
