import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DPad } from './game/DPad'
import { view } from './game/input'
import { LabelLayerSync, Labels } from './game/Labels'
import { discoveryNear, loadMap, nearestPoi, slopeNear, streetNear, type GameMap } from './game/map'
import { Discoveries } from './game/Discoveries'
import { useAmbience, useSoundCredits } from './game/ambience'
import { loadDict, type Dict } from './game/dict'
import { JaText, WordPopup, type WordPick } from './game/JaText'
import { Minimap } from './game/Minimap'
import { Player } from './game/Player'
import { World, type Focus } from './game/World'
import { loadAround, useTileStream } from './game/stream'
import { WEATHER_WORDS, fetchWeather, japaneseTime, skyState, tokyoClock, tokyoTimeToday, weatherKind, type Weather, type WeatherKind } from './game/sky'

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

  // Places found and stamps collected, kept in this browser.
  const [found, setFound] = useState(() => loadSet('japango.found'))
  const [stamps, setStamps] = useState(() => loadSet('japango.stamps'))
  const [book, setBook] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Dictionary for furigana and tap-for-meaning.
  const [dict, setDict] = useState<Dict | null>(null)
  const [furigana, setFurigana] = useState(false)
  const [word, setWord] = useState<WordPick | null>(null)
  useEffect(() => {
    loadDict('roppongi').then(setDict)
  }, [])
  // Background sound, on unless the player turned it off.
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('japango.muted') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('japango.muted', muted ? '1' : '0')
    } catch {
      // Not saved; fine for this visit.
    }
  }, [muted])
  const soundCredits = useSoundCredits()

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
        // The tiles around the start, before the player appears.
        return loadAround(m, start.x, start.y, 32).then(() => {
          setMap(m)
          setPos({ ...start })
        })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setDistance((d) => Math.max(MIN_DIST, d / 1.25))
      if (e.key === '-' || e.key === '_') setDistance((d) => Math.min(MAX_DIST, d * 1.25))
      if (e.key === 'm' || e.key === 'M') setBigMap((b) => !b)
      if (e.key === 'b' || e.key === 'B') setBook((b) => !b)
      if (e.key === 'f' || e.key === 'F') setFurigana((f) => !f)
      if (e.key === 'n' || e.key === 'N') setMuted((m) => !m)
      if (e.key === 'Escape') setWord(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    setDistance((d) => Math.min(MAX_DIST, Math.max(MIN_DIST, d * Math.exp(e.deltaY * 0.0015))))
  }, [])

  // Walking up to a discovery finds it; a stamp gets stamped.
  const here = map && pos ? discoveryNear(map, pos.x, pos.y) : null
  useEffect(() => {
    if (!here) return
    if (!found.has(here.id)) setFound((f) => saveSet('japango.found', new Set(f).add(here.id)))
    if (here.stamp && !stamps.has(here.id)) {
      setStamps((st) => saveSet('japango.stamps', new Set(st).add(here.id)))
      setToast(`スタンプゲット！ ${here.ja}`)
    }
  }, [here, found, stamps])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  const sky = useMemo(() => skyState(now, weather, map?.rotationDeg ?? 0), [now, weather, map])
  const tiles = useTileStream(map, focus, distance)
  const clock = tokyoClock(now)
  const hour = clock.h + clock.m / 60
  useAmbience({ map, focus, hour, month: tokyoMonth(now), night: sky.night, rain: sky.rain, muted, credits: soundCredits })

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
  const rally = (map.discoveries ?? []).filter((d) => d.stamp)
  const street = streetNear(map, pos.x, pos.y)
  const place = nearestPoi(map, pos.x, pos.y)
  const slope = slopeNear(map, pos.x, pos.y)

  return (
    <div
      className="game"
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => setWord(null)}
      onPointerMove={(e) => {
        // Right-drag (or Ctrl-drag) turns the view freely.
        if (e.buttons === 2 || (e.buttons === 1 && e.ctrlKey)) {
          view.target += e.movementX * 0.006
          view.yaw = view.target
        }
      }}
    >
      <Canvas
        shadows
        camera={{ fov: 38, near: 0.5, far: 2000 }}
        gl={{ antialias: true, localClippingEnabled: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[sky.background]} />
        <fog attach="fog" args={[sky.background, distance * 2.5 * sky.fogScale, distance * 6 * sky.fogScale]} />
        <World map={map} tiles={tiles} focus={focus} sky={sky} hour={hour} />
        <Discoveries map={map} tiles={tiles} found={found} stamps={stamps} />
        <Player map={map} focus={focus} distance={distance} onMove={(x, y) => setPos({ x, y })} />
        <LabelLayerSync layer={labelLayer} />
      </Canvas>

      <Labels map={map} tiles={tiles} x={pos.x} y={pos.y} distance={distance} layer={labelLayer} />

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
            <JaText text={street.name} dict={dict} furigana={furigana} onWord={setWord} /> {street.nameEn && <span>{street.nameEn}</span>}
          </div>
        )}
        {place && (
          <div className="hud-near">
            近く: <JaText text={place.name} dict={dict} furigana={furigana} onWord={setWord} /> {place.nameEn && <span>{place.nameEn}</span>}
          </div>
        )}
      </div>

      <Minimap map={map} tiles={tiles} x={pos.x} y={pos.y} big={bigMap} />

      {rally.length > 0 && (
        <button className="hud-stamps" onClick={() => setBook((b) => !b)}>
          🎴 スタンプ {rally.filter((d) => stamps.has(d.id)).length}/{rally.length}
        </button>
      )}
      {Object.keys(soundCredits).length > 0 && (
        <button className="hud-sound" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Sound on' : 'Sound off'}>
          {muted ? '🔇' : '🔊'}
        </button>
      )}
      {toast && <div className="toast">{toast}</div>}
      {book && (
        <div className="stamp-book" onClick={() => setBook(false)}>
          <div className="stamp-book-inner" onClick={(e) => e.stopPropagation()}>
            <h2>
              スタンプラリー <span>Stamp rally</span>
            </h2>
            <p>Find each place and walk up to its red marker. Press B to close.</p>
            <div className="stamp-grid">
              {rally.map((d) => (
                <div key={d.id} className={`stamp ${stamps.has(d.id) ? 'got' : ''}`}>
                  <div className="stamp-seal">{stamps.has(d.id) ? '済' : '？'}</div>
                  <div className="stamp-name">{d.ja}</div>
                  {d.en && <div className="stamp-en">{d.en}</div>}
                </div>
              ))}
            </div>
            <p className="stamp-found">
              Places discovered: {found.size} of {map.discoveries?.length ?? 0}
            </p>
          </div>
        </div>
      )}

      {here && !book && (
        <div className="hud-discovery">
          <div className="hud-discovery-name">
            {here.stamp ? '🎴' : '✦'} <JaText text={here.ja} dict={dict} furigana={furigana} onWord={setWord} />
            {here.en && <span>{here.en}</span>}
          </div>
          {here.jt && (
            <p className="hud-discovery-ja">
              <JaText text={here.jt} dict={dict} furigana={furigana} onWord={setWord} />
            </p>
          )}
          {here.et && <p className="hud-discovery-en">{here.et}</p>}
          <div className="hud-discovery-links">
            Wikipedia:{' '}
            <a href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(here.jw)}`} target="_blank" rel="noreferrer">
              日本語
            </a>
            {here.ew && (
              <>
                {' · '}
                <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(here.ew)}`} target="_blank" rel="noreferrer">
                  English
                </a>
              </>
            )}{' '}
            (CC BY-SA)
          </div>
        </div>
      )}

      {slope && !here && (
        <div className="hud-slope">
          <div className="hud-slope-name">
            <JaText text={slope.slope.name} dict={dict} furigana={furigana} onWord={setWord} />
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

      {word && dict && <WordPopup pick={word} dict={dict} onClose={() => setWord(null)} />}

      <div className="hud-help">
        Move: arrows / WASD · Run: Shift · Zoom: scroll or +/− · Turn: Q/E or right-drag · Map: M · Stamps: B · Furigana: F · Sound: N · Tap a word for its meaning
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
        {dict && (
          <>
            {' · '}Dictionary:{' '}
            <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
              JMdict (EDRDG, CC BY-SA)
            </a>
          </>
        )}
        {map.credits?.some((c) => c.includes('国土地理院')) && (
          <>
            {' · '}Roof colors:{' '}
            <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">
              出典：国土地理院ウェブサイト
            </a>
          </>
        )}
        {Object.keys(soundCredits).length > 0 && (
          <>
            {' · '}Sounds from Freesound:{' '}
            {Object.values(soundCredits).map((c, i) => (
              <span key={c.url}>
                {i > 0 && ', '}
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.name}
                </a>{' '}
                by {c.author} (
                <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                  {c.license}
                </a>
                )
              </span>
            ))}
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

function tokyoMonth(date: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format(date))
}

function loadSet(key: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    // Private mode or storage full: keep it for this visit only.
  }
  return set
}
