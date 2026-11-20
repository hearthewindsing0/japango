import { useEffect, useRef } from 'react'
import type { GameMap } from './map'
import { MINIMAP_COLORS } from './tiles'

/** Whole-map overview drawn once to a canvas, one pixel per grid cell. */
export function Minimap({ map, x, y, big }: { map: GameMap; x: number; y: number; big: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(map.gridW, map.gridH)
    for (let i = 0; i < map.grid.length; i++) {
      const [r, g, b] = MINIMAP_COLORS[map.grid[i]] ?? [255, 0, 255]
      img.data.set([r, g, b, 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }, [map])

  return (
    <div className={`minimap ${big ? 'minimap-big' : ''}`}>
      <canvas ref={canvas} width={map.gridW} height={map.gridH} />
      <div className="minimap-dot" style={{ left: `${(x / map.width) * 100}%`, top: `${(y / map.height) * 100}%` }} />
      {/* The map is turned so the main street runs across; this points north. */}
      <svg className="compass" viewBox="-12 -12 24 24" style={{ transform: `rotate(${map.rotationDeg}deg)` }}>
        <title>North</title>
        <circle r="11" />
        <path d="M0 -8 L4 2 L0 0 L-4 2 Z" className="compass-n" />
        <path d="M0 8 L4 2 L0 0 L-4 2 Z" className="compass-s" />
      </svg>
    </div>
  )
}
