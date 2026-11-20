import { useEffect, useRef } from 'react'
import { view } from './input'
import type { GameMap, MapTile } from './map'
import { MINIMAP_COLORS } from './tiles'

/** Whole-map overview on a canvas, one pixel per grid cell. Each tile is
 *  painted in as it loads, and stays once seen. */
export function Minimap({ map, tiles, x, y, big }: { map: GameMap; tiles: MapTile[]; x: number; y: number; big: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const compass = useRef<SVGSVGElement>(null)

  // The compass follows the camera as it turns.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (compass.current)
        compass.current.style.transform = `rotate(${map.rotationDeg + (view.yaw * 180) / Math.PI}deg)`
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [map])

  const painted = useRef(new Set<string>())
  useEffect(() => {
    painted.current.clear()
  }, [map])
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    for (const t of tiles) {
      if (painted.current.has(t.key) || !t.gridW || !t.gridH) continue
      painted.current.add(t.key)
      const img = ctx.createImageData(t.gridW, t.gridH)
      for (let i = 0; i < t.grid.length; i++) {
        const [r, g, b] = MINIMAP_COLORS[t.grid[i]] ?? [255, 0, 255]
        img.data.set([r, g, b, 255], i * 4)
      }
      ctx.putImageData(img, t.gx, t.gy)
    }
  }, [map, tiles])
  const gw = Math.round(map.width / map.cell)
  const gh = Math.round(map.height / map.cell)

  return (
    <div className={`minimap ${big ? 'minimap-big' : ''}`}>
      <canvas ref={canvas} width={gw} height={gh} />
      <div className="minimap-dot" style={{ left: `${(x / map.width) * 100}%`, top: `${(y / map.height) * 100}%` }} />
      {/* The map is turned so the main street runs across; this points north. */}
      <svg ref={compass} className="compass" viewBox="-12 -12 24 24">
        <title>North</title>
        <circle r="11" />
        <path d="M0 -8 L4 2 L0 0 L-4 2 Z" className="compass-n" />
        <path d="M0 8 L4 2 L0 0 L-4 2 Z" className="compass-s" />
      </svg>
    </div>
  )
}
