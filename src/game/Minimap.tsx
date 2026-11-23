import { useEffect, useRef, type ReactNode } from 'react'
import { MinimapFrame } from '../ui'
import { view } from './input'
import type { GameMap, MapTile } from './map'
import { MINIMAP_COLORS } from './tiles'

/** Whole-map overview on a canvas, one pixel per grid cell. Each tile is
 *  painted in as it loads, and stays once seen. */
export function Minimap({
  map,
  tiles,
  x,
  y,
  big,
  label,
  actions,
  onToggleBig,
}: {
  map: GameMap
  tiles: MapTile[]
  x: number
  y: number
  big: boolean
  label?: ReactNode
  actions?: ReactNode
  onToggleBig: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const compass = useRef<HTMLSpanElement>(null)

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
    <MinimapFrame
      width={big ? 'min(calc(var(--hud-h) * 0.8 - 40px), calc(var(--hud-w) - 24px))' : 172}
      aspect={gw / gh}
      marker={false}
      northRef={compass}
      label={label}
      actions={actions}
      onToggleBig={onToggleBig}
      big={big}
      className="pointer-events-auto transition-[width] duration-200"
    >
      <canvas ref={canvas} width={gw} height={gh} className="pixelated block size-full" />
      {(map.places ?? []).map((p) => (
        <div
          key={p.id}
          className={`pointer-events-none absolute -translate-1/2 text-[11px] leading-none whitespace-nowrap [text-shadow:0_0_2px_#000,0_0_2px_#000] ${p.gone ? 'text-paper-dim' : 'text-kin'}`}
          style={{ left: `${(p.x / map.width) * 100}%`, top: `${(p.y / map.height) * 100}%` }}
          title={`${p.ja} ${p.en}`}
        >
          ★{big && <span className="ml-[3px] text-white">{p.en}</span>}
        </div>
      ))}
      <div
        className="absolute size-2.5 -translate-1/2 rounded-full bg-shu [box-shadow:0_0_0_2px_var(--color-paper)]"
        style={{ left: `${(x / map.width) * 100}%`, top: `${(y / map.height) * 100}%` }}
      />
    </MinimapFrame>
  )
}
