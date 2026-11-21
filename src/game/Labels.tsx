import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { groundAt, poisNear, type GameMap, type MapTile, type PoiKind } from './map'

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
  /** Loaded tiles: labels come from them. */
  tiles: MapTile[]
  x: number
  y: number
  /** Camera distance, which sets how far around the player to label. */
  distance: number
  layer: RefObject<HTMLDivElement | null>
  /** Text size multiplier (HUD size and browser zoom-out). */
  scale?: number
}

/** Name tags for nearby places, in Japanese with English underneath. Plain
 *  DOM over the canvas; <LabelLayerSync> moves each tag to its spot on
 *  screen every frame. */
export function Labels({ map, tiles, x, y, distance, layer, scale = 1 }: Props) {
  const radius = Math.max(30, distance * 1.4)
  const limit = distance > 70 ? 18 : 40
  const qx = Math.round(x / 5)
  const qy = Math.round(y / 5)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pois = useMemo(() => poisNear(map, qx * 5, qy * 5, radius, limit), [map, tiles, qx, qy, radius, limit])
  return (
    <div className="label-layer" ref={layer} style={{ '--label': scale } as React.CSSProperties}>
      {pois.map((p) => (
        <div
          key={`${p.name}-${p.x}-${p.y}`}
          className={`label label-${p.kind}${p.fav ? ' label-fav' : ''}${p.gone ? ' label-gone' : ''}`}
          data-x={p.x}
          data-y={p.y}
          data-h={groundAt(map, p.x, p.y)}
          style={{ visibility: 'hidden' }}
        >
          <span className="label-ja">
            {p.fav ? '★' : ICON[p.kind]} {p.name}
            {p.ref ? ` ${p.ref}` : ''}
          </span>
          {p.nameEn && (
            <span className="label-en">
              {p.nameEn}
              {p.gone ? ' (closed now)' : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const v = new THREE.Vector3()

/** Lives inside the Canvas and places each label where its spot projects. */
export function LabelLayerSync({ layer }: { layer: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree()
  useFrame(() => {
    const el = layer.current
    if (!el) return
    for (const child of el.children as HTMLCollectionOf<HTMLElement>) {
      v.set(Number(child.dataset.x), Number(child.dataset.h ?? 0) + 2.2, Number(child.dataset.y)).project(camera)
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
      child.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) continue
      const sx = ((v.x + 1) / 2) * size.width
      const sy = ((1 - v.y) / 2) * size.height
      child.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`
    }
  })
  return null
}
