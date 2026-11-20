import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DPad } from './game/DPad'
import { LabelLayerSync, Labels } from './game/Labels'
import { loadMap, nearestPoi, slopeNear, streetNear, type GameMap } from './game/map'
import { Minimap } from './game/Minimap'
import { Player } from './game/Player'
import { World, type Focus } from './game/World'
import { WEATHER_WORDS, fetchWeather, japaneseTime, skyState, tokyoTimeToday, weatherKind, type Weather, type WeatherKind } from './game/sky'

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

  // Tokyo time and weather, live. ?time=21:30 and ?weather=rain (or a WMO
  // code) override them for testing.
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [now, setNow] = useState(() => new Date())
  const [weather, setWeather] = useState<Weather>({ kind: 'clear', cloud: 0.1 })
  useEffect(() => {
    const fixed = params.get('time')
    const start = fixed ? tokyoTimeToday(fixed) : null
    const offset = start ? start.getTime() - Date.now() : 0
    const tick = () => setNow(new Date(Date.now() + offset))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [params])
  useEffect(() => {
    const forced = params.get('weather')
    if (forced) {
      const kind = (Number.isFinite(Number(forced)) ? weatherKind(Number(forced)) : forced) as WeatherKind
      if (WEATHER_WORDS[kind]) setWeather({ kind, cloud: kind === 'clear' ? 0.1 : 0.9 })
      return
    }
    const load = () => fetchWeather().then(setWeather, () => {})
    load()
    const id = setInterval(load, 15 * 60000)
    return () => clearInterval(id)
  }, [params])

  useEffect(() => {
    loadMap('roppongi')
      .then((m) => {
        // ?at=x,y starts somewhere else (map meters), handy for testing.
        const at = new URLSearchParams(location.search).get('at')?.split(',').map(Number)
        const start = at?.length === 2 && at.every(Number.isFinite) ? { x: at[0], y: at[1] } : m.spawn
        focus.current = { ...start }
        setMap(m)
        setPos({ ...start })
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

  const sky = useMemo(() => skyState(now, weather, map?.rotationDeg ?? 0), [now, weather, map])

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

  const words = WEATHER_WORDS[weather.kind]
  const street = streetNear(map, pos.x, pos.y)
  const place = nearestPoi(map, pos.x, pos.y)
  const slope = slopeNear(map, pos.x, pos.y)

  return (
    <div className="game" onWheel={onWheel}>
      <Canvas
        shadows
        camera={{ fov: 38, near: 0.5, far: 2000 }}
        gl={{ antialias: true, localClippingEnabled: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[sky.background]} />
        <fog attach="fog" args={[sky.background, distance * 2.5 * sky.fogScale, distance * 6 * sky.fogScale]} />
        <World map={map} focus={focus} sky={sky} />
        <Player map={map} focus={focus} distance={distance} onMove={(x, y) => setPos({ x, y })} />
        <LabelLayerSync layer={labelLayer} />
      </Canvas>

      <Labels map={map} x={pos.x} y={pos.y} distance={distance} layer={labelLayer} />

      <div className="hud-location">
        <div className="hud-area">
          {map.name} <span>{map.nameEn}</span>
        </div>
        <div className="hud-time">
          {japaneseTime(now)} · {words.icon} {words.ja}
          <span>
            {words.kana} ({words.en}){weather.tempC != null && `, ${Math.round(weather.tempC)}°C`}
          </span>
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

      {slope && (
        <div className="hud-slope">
          <div className="hud-slope-name">
            {slope.slope.name}
            {slope.slope.kana && <span className="hud-slope-kana">{slope.slope.kana}</span>}
          </div>
          {slope.slope.en && (
            <div className="hud-slope-en">
              {slope.slope.en}: “{slope.slope.gloss}”
            </div>
          )}
          <div className="hud-slope-note">
            坂 (さか) means slope.
            {slope.slope.rise >= 2 &&
              ` It ${slope.top ? 'drops' : 'climbs'} about ${Math.round(slope.slope.rise)} m from here.`}
          </div>
        </div>
      )}

      <div className="hud-help">
        Move: arrows / WASD · Run: Shift · Zoom: scroll or +/− · Map: M
      </div>
      <DPad />
      <div className="attribution">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        {map.credits?.some((c) => c.includes('Mapillary')) && (
          <>
            {' · '}Street-level data ©{' '}
            <a href="https://www.mapillary.com" target="_blank" rel="noreferrer">
              Mapillary
            </a>{' '}
            contributors,{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
              CC BY-SA
            </a>
          </>
        )}
        {!params.get('weather') && (
          <>
            {' · '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Weather data by Open-Meteo.com
            </a>
          </>
        )}
        {map.credits?.some((c) => c.includes('PLATEAU')) && (
          <>
            {' · '}Buildings and terrain:{' '}
            <a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noreferrer">
              3D都市モデル（Project PLATEAU）国土交通省
            </a>
          </>
        )}
      </div>
    </div>
  )
}
