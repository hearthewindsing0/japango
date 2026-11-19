import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DPad } from './game/DPad'
import { LabelLayerSync, Labels } from './game/Labels'
import { loadMap, nearestPoi, streetNear, type GameMap } from './game/map'
import { MapLayer } from './game/MapLayer'
import { Minimap } from './game/Minimap'
import { Player, type PlayerState } from './game/Player'

const MIN_ZOOM = 6
const MAX_ZOOM = 64

function CameraSetup({ zoom }: { zoom: number }) {
  const camera = useThree((s) => s.camera)
  // R3F points a new camera at the origin; we want it looking straight down.
  useEffect(() => {
    camera.rotation.set(0, 0, 0)
  }, [camera])
  useEffect(() => {
    camera.zoom = zoom
    camera.updateProjectionMatrix()
  }, [camera, zoom])
  return null
}

export default function App() {
  const [map, setMap] = useState<GameMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<PlayerState | null>(null)
  const [zoom, setZoom] = useState(20)
  const [bigMap, setBigMap] = useState(false)
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  const labelLayer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    loadMap('roppongi')
      .then((m) => {
        setMap(m)
        setPos({ ...m.spawn, facing: 'down' })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))
      if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))
      if (e.key === 'm' || e.key === 'M') setBigMap((b) => !b)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-e.deltaY * 0.0015))))
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

  const street = streetNear(map, pos.x + 0.5, pos.y + 0.5)
  const place = nearestPoi(map, pos.x + 0.5, pos.y + 0.5)

  return (
    <div className="game" onWheel={onWheel}>
      <Canvas
        orthographic
        camera={{ zoom, position: [map.spawn.x + 0.5, -map.spawn.y - 0.5, 100], near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
      >
        <CameraSetup zoom={zoom} />
        <MapLayer map={map} />
        <Player map={map} start={map.spawn} onStep={setPos} />
        <LabelLayerSync layer={labelLayer} zoom={zoom} />
      </Canvas>

      <Labels map={map} x={pos.x} y={pos.y} zoom={zoom} viewW={view.w} viewH={view.h} layer={labelLayer} />

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
