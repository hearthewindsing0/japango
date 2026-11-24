import { useEffect, useState } from 'react'

// How big the HUD (map, info boxes, buttons, labels) is drawn.
//
// Two parts: the player's chosen size, and a correction for browser zoom.
// If the page was zoomed out (Ctrl/Cmd −), everything in the DOM shrinks
// and the browser remembers it for the site; we can't undo that from the
// page, but we can draw the HUD bigger by the same factor so it stays
// readable.

const KEY = 'japango.hudSize'
export const HUD_SIZES = [1, 1.25, 1.5, 2, 3, 4]

/** Current overall HUD scale, for code that converts screen coordinates. */
export let hudScale = 1

/** Browser page zoom below 100%, as a factor ≤ 1 (1 when not zoomed out). */
function pageZoom() {
  if (matchMedia('(pointer: coarse)').matches) return 1
  const z = window.outerWidth / window.innerWidth
  // Docked dev tools or sidebars make the ratio > 1; only zoom-out counts.
  return Number.isFinite(z) && z > 0.2 && z < 0.92 ? z : 1
}

function loadSize() {
  try {
    const v = Number(localStorage.getItem(KEY))
    if (HUD_SIZES.includes(v)) return v
  } catch {
    // ignore
  }
  // By default, the biggest size that still leaves the HUD room to lay out
  // like a laptop screen (at least 600×560), so boxes don't pile up.
  const fits = HUD_SIZES.filter((s) => window.innerWidth / s >= 600 && window.innerHeight / s >= 560)
  return fits.length ? fits[fits.length - 1] : 1
}

export function useHudScale() {
  const [size, setSize] = useState(loadSize)
  const [zoom, setZoom] = useState(pageZoom)
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => {
      setZoom(pageZoom())
      setWin({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(size))
    } catch {
      // ignore
    }
  }, [size])
  // Never so big that the HUD's own layout gets smaller than a phone
  // (narrower than 380, or shorter than 460, where boxes start to overlap).
  const scale = Math.max(0.5, Math.min(size / zoom, win.w / 380, win.h / 460))
  hudScale = scale
  const step = (dir: 1 | -1) =>
    setSize((s) => HUD_SIZES[Math.max(0, Math.min(HUD_SIZES.length - 1, HUD_SIZES.indexOf(s) + dir))] ?? s)
  return { scale, size, step, width: win.w / scale, height: win.h / scale, labelScale: (1 + (size - 1) * 0.5) / zoom }
}
