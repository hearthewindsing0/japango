import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, type RefObject } from 'react'
import { poisIn, type GameMap, type PoiKind } from './map'

const ICON: Record<PoiKind, string> = {
  station: '🚇',
  exit: '⬇',
  konbini: '🏪',
  shrine: '⛩',
  food: '🍜',
  cafe: '☕',
  bar: '🍶',
  park: '🌳',
  sight: '★',
  shop: '🛍',
  amenity: '•',
  building: '🏢',
}

interface Props {
  map: GameMap
  x: number
  y: number
  zoom: number
  viewW: number
  viewH: number
  layer: RefObject<HTMLDivElement | null>
}

/** Name tags for places on screen, in Japanese with English underneath.
 *  Plain DOM over the canvas: each tag sits at (tile × zoom) px inside a layer
 *  that <LabelLayerSync> moves with the camera every frame. */
export function Labels({ map, x, y, zoom, viewW, viewH, layer }: Props) {
  const halfW = viewW / zoom / 2 + 4
  const halfH = viewH / zoom / 2 + 4
  const limit = zoom < 14 ? 15 : 45
  const qx = Math.round(x / 4)
  const qy = Math.round(y / 4)
  const pois = useMemo(
    () => poisIn(map, qx * 4 - halfW, qy * 4 - halfH, qx * 4 + halfW, qy * 4 + halfH, limit),
    [map, qx, qy, halfW, halfH, limit],
  )
  return (
    <div className="label-layer" ref={layer}>
      {pois.map((p) => (
        <div
          key={`${p.name}-${p.x}-${p.y}`}
          className={`label label-${p.kind}`}
          style={{ left: p.x * zoom, top: p.y * zoom }}
        >
          <span className="label-ja">
            {ICON[p.kind]} {p.name}
            {p.ref ? ` ${p.ref}` : ''}
          </span>
          {p.nameEn && <span className="label-en">{p.nameEn}</span>}
        </div>
      ))}
    </div>
  )
}

/** Lives inside the Canvas and keeps the label layer aligned with the camera. */
export function LabelLayerSync({ layer, zoom }: { layer: RefObject<HTMLDivElement | null>; zoom: number }) {
  const { camera, size } = useThree()
  useFrame(() => {
    const el = layer.current
    if (!el) return
    const tx = size.width / 2 - camera.position.x * zoom
    const ty = size.height / 2 + camera.position.y * zoom
    el.style.transform = `translate(${tx}px, ${ty}px)`
  })
  return null
}
