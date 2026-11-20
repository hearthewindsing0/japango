import { useEffect, useRef } from 'react'
import type { GameMap } from './map'
import { MINIMAP_COLORS } from './tiles'

/** Whole-map overview drawn once to a canvas, one pixel per tile. */
export function Minimap({ map, x, y, big }: { map: GameMap; x: number; y: number; big: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(map.width, map.height)
    for (let i = 0; i < map.tiles.length; i++) {
      const [r, g, b] = MINIMAP_COLORS[map.tiles[i]] ?? [255, 0, 255]
      img.data.set([r, g, b, 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }, [map])

  return (
    <div className={`minimap ${big ? 'minimap-big' : ''}`}>
      <canvas ref={canvas} width={map.width} height={map.height} />
      <div className="minimap-dot" style={{ left: `${(x / map.width) * 100}%`, top: `${(y / map.height) * 100}%` }} />
    </div>
  )
}
