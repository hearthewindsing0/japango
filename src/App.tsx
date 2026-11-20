import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DPad } from './game/DPad'
import { LabelLayerSync, Labels } from './game/Labels'
import { loadMap, nearestPoi, streetNear, type GameMap } from './game/map'
import { Minimap } from './game/Minimap'
import { Player } from './game/Player'
import { World, type Focus } from './game/World'

const MIN_DIST = 10
const MAX_DIST = 160

export default function App() {
  const [map, setMap] = useState<GameMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [distance, setDistance] = useState(32)
  const focus = useRef<Focus>({ x: 0, y: 0 })
  const [bigMap, setBigMap] = useState(false)
  const labelLayer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMap('roppongi')
      .then((m) => {
        focus.current = { ...m.spawn }
        setMap(m)
        setPos({ ...m.spawn })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setDistance((d) => Math.max(MIN_DIST, d / 1.25))
      if (e.key === '-' || e.key === '_') setDistance((d) => Math.min(MAX_DIST, d * 1.25))
      if (e.key === 'm' || e.key === 'M') setBigMap((b) => !b)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    setDistance((d) => Math.min(MAX_DIST, Math.max(MIN_DIST, d * Math.exp(e.deltaY * 0.0015))))
  }, [])

  if (error)
    return (
      <div className="center-msg">
        <h1>Map not found</h1>
        <p>{error}</p>
        <p>
          Generate it with <code>npm run map:fetch &amp;&amp; npm run map:build</code>.
        </p>
      </div>
    )
  if (!map || !pos) return <div className="center-msg">読み込み中… Loading Roppongi</div>

  const street = streetNear(map, pos.x, pos.y)
  const place = nearestPoi(map, pos.x, pos.y)

  return (
    <div className="game" onWheel={onWheel}>
      <Canvas
        shadows
        camera={{ fov: 38, near: 0.5, far: 2000 }}
        gl={{ antialias: true, localClippingEnabled: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#cfe3f2']} />
        <fog attach="fog" args={['#cfe3f2', distance * 2.5, distance * 6]} />
        <World map={map} focus={focus} />
        <Player map={map} focus={focus} distance={distance} onMove={(x, y) => setPos({ x, y })} />
        <LabelLayerSync layer={labelLayer} />
      </Canvas>

      <Labels map={map} x={pos.x} y={pos.y} distance={distance} layer={labelLayer} />

      <div className="hud-location">
        <div className="hud-area">
          {map.name} <span>{map.nameEn}</span>
        </div>
        {street && (
          <div className="hud-street">
            {street.name} {street.nameEn && <span>{street.nameEn}</span>}
          </div>
        )}
        {place && (
          <div className="hud-near">
            近く: {place.name} {place.nameEn && <span>{place.nameEn}</span>}
          </div>
        )}
      </div>

      <Minimap map={map} x={pos.x} y={pos.y} big={bigMap} />

      <div className="hud-help">
        Move: arrows / WASD · Run: Shift · Zoom: scroll or +/− · Map: M
      </div>
      <DPad />
      <div className="attribution">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
      </div>
    </div>
  )
}
