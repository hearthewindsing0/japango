import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DPad } from './game/DPad'
import { hoursToday, isOpen, tokyoWeekMinute } from './game/hours'
import { view } from './game/input'
import { LabelLayerSync, Labels } from './game/Labels'
import { discoveryNear, loadMap, nearestPoi, slopeNear, streetNear, type GameMap } from './game/map'
import { Discoveries } from './game/Discoveries'
import { useAmbience, useSoundCredits } from './game/ambience'
import { loadDict, type Dict } from './game/dict'
import { JaText, WordPopup, type WordPick } from './game/JaText'
import { Minimap } from './game/Minimap'
import { useHudScale } from './game/hud'
import { Player } from './game/Player'
import { World, type Focus } from './game/World'
import { loadAround, useTileStream } from './game/stream'
import { useProgressSync } from './game/progress'
import { Underground } from './game/station'
import { Stations } from './game/Stations'
import { WEATHER_WORDS, fetchWeather, japaneseTime, skyState, tokyoClock, tokyoTimeToday, weatherKind, type Weather, type WeatherKind } from './game/sky'

const MIN_DIST = 10
const MAX_DIST = 160

export default function App() {
  const [map, setMap] = useState<GameMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // Down in a station (off the street).
  const [under, setUnder] = useState(false)
  const [distance, setDistance] = useState(32)
  const focus = useRef<Focus>({ x: 0, y: 0 })
  // For poking at the player from the console while developing.
  if (import.meta.env.DEV) (window as unknown as { japango: unknown }).japango = { focus }
  const [bigMap, setBigMap] = useState(false)
  const labelLayer = useRef<HTMLDivElement>(null)

  // Places found and stamps collected, kept in this browser.
  const [found, setFound] = useState(() => loadSet('japango.found'))
  const [stamps, setStamps] = useState(() => loadSet('japango.stamps'))
  useProgressSync(found, stamps, (saved) => {
    setFound((f) => saveSet('japango.found', new Set([...f, ...saved.found])))
    setStamps((st) => saveSet('japango.stamps', new Set([...st, ...saved.stamps])))
  })
  const [book, setBook] = useState(false)
  const [credits, setCredits] = useState(false)
  // Controls list, opened with the Controls button or H; remembered.
  const [help, setHelpState] = useState(() => {
    try {
      return localStorage.getItem('japango.help') === '1'
    } catch {
      return false
    }
  })
  const setHelp = useCallback((v: boolean | ((h: boolean) => boolean)) => {
    setHelpState((h) => {
      const next = typeof v === 'function' ? v(h) : v
      try {
        localStorage.setItem('japango.help', next ? '1' : '0')
      } catch {
        // fine for this visit
      }
      return next
    })
  }, [])
  const [toast, setToast] = useState<string | null>(null)
  // Dictionary for furigana and tap-for-meaning.
  const [dict, setDict] = useState<Dict | null>(null)
  const [furigana, setFurigana] = useState(false)
  const [word, setWord] = useState<WordPick | null>(null)
  // A hint about word cards until the player opens their first one.
  const [wordHint, setWordHint] = useState(() => {
    try {
      return localStorage.getItem('japango.wordHint') !== 'done'
    } catch {
      return true
    }
  })
  useEffect(() => {
    if (!word || !wordHint) return
    setWordHint(false)
    try {
      localStorage.setItem('japango.wordHint', 'done')
    } catch {
      // Shown again next visit; fine.
    }
  }, [word, wordHint])
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
  const hud = useHudScale()
  const hudStep = useRef(hud.step)
  hudStep.current = hud.step

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
        const start = at && at.length >= 2 && at.every(Number.isFinite) ? { x: at[0], y: at[1] } : m.spawn
        focus.current = { ...start }
        // ?at=x,y,z starts underground at height z (in a station).
        if (at?.length === 3 && Number.isFinite(at[2])) focus.current = { ...start, z: at[2], under: true }
        // The tiles around the start, before the player appears.
        return loadAround(m, start.x, start.y, 32).then(() => {
          setMap(m)
          setPos({ ...start })
        })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const zoomBy = (f: number) => setDistance((d) => Math.min(MAX_DIST, Math.max(MIN_DIST, d * f)))
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd +/− would zoom the whole page (and shrink the map and info
      // boxes with it); zoom the camera instead.
      const zoomKey = ['+', '=', '-', '_', '0'].includes(e.key)
      if ((e.ctrlKey || e.metaKey) && zoomKey) e.preventDefault()
      if (e.key === '+' || e.key === '=') zoomBy(1 / 1.25)
      if (e.key === '-' || e.key === '_') zoomBy(1.25)
      if (e.ctrlKey || e.metaKey) return
      if (e.key === 'm' || e.key === 'M') setBigMap((b) => !b)
      if (e.key === 'b' || e.key === 'B') setBook((b) => !b)
      if (e.key === 'f' || e.key === 'F') setFurigana((f) => !f)
      if (e.key === 'n' || e.key === 'N') setMuted((m) => !m)
      if (e.key === 'h' || e.key === 'H') setHelp((h) => !h)
      if (e.key === ']') hudStep.current(1)
      if (e.key === '[') hudStep.current(-1)
      if (e.key === 'Escape') setWord(null)
    }
    // Scrolling and trackpad pinches zoom the camera, never the page. A
    // pinch arrives as a wheel event with ctrlKey set; it has to be stopped
    // in a non-passive listener or the browser zooms the page out.
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.stamp-book, .word-popup, .hud-discovery')) {
        if (e.ctrlKey) e.preventDefault()
        else return
      }
      e.preventDefault()
      zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
    }
    // Safari's own pinch gesture.
    let gestureScale = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gestureScale = 1
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const scale = (e as unknown as { scale: number }).scale
      zoomBy(gestureScale / scale)
      gestureScale = scale
    }
    // Two-finger pinch on touch screens.
    let pinch = 0
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = spread(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return
      e.preventDefault()
      const now = spread(e.touches)
      zoomBy(pinch / now)
      pinch = now
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = 0
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('gesturestart', onGestureStart)
    window.addEventListener('gesturechange', onGestureChange)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('gesturestart', onGestureStart)
      window.removeEventListener('gesturechange', onGestureChange)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
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
  const week = tokyoWeekMinute(now)
  const ug = useMemo(() => (map?.stations?.length ? new Underground(map.stations) : null), [map])
  useAmbience({ map, focus, under, hour, month: tokyoMonth(now), night: sky.night, rain: sky.rain, muted, credits: soundCredits })

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
  const street = under ? null : streetNear(map, pos.x, pos.y)
  const place = under ? null : nearestPoi(map, pos.x, pos.y)
  const slope = under ? null : slopeNear(map, pos.x, pos.y)
  const z = focus.current.z ?? 0
  const station = under && ug ? ug.stationAt(pos.x, pos.y, z) : null
  const sign = under && ug ? ug.signNear(pos.x, pos.y, z) : null
  const bg = under ? UNDERGROUND_BG : sky.background

  return (
    <div
      className="game"
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
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[bg, under ? distance * 2 : distance * 2.5 * sky.fogScale, under ? distance * 4 : distance * 6 * sky.fogScale]} />
        <World map={map} tiles={tiles} focus={focus} sky={sky} hour={hour} day={week.day} minute={week.minute} surface={!under} />
        {!under && <Discoveries map={map} tiles={tiles} found={found} stamps={stamps} />}
        {ug && <Stations ug={ug} focus={focus} under={under} />}
        <Player
          map={map}
          ug={ug}
          focus={focus}
          distance={distance}
          onMove={(x, y, u) => {
            setPos({ x, y })
            setUnder(u)
          }}
        />
        <LabelLayerSync layer={labelLayer} />
      </Canvas>

      {!under && <Labels scale={hud.labelScale} map={map} tiles={tiles} x={pos.x} y={pos.y} distance={distance} layer={labelLayer} />}

      <div
        className="hud-root"
        style={
          {
            width: hud.width,
            height: hud.height,
            transform: `scale(${hud.scale})`,
            '--hud-w': `${hud.width}px`,
            '--hud-h': `${hud.height}px`,
          } as React.CSSProperties
        }
      >
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
          {station && (
            <div className="hud-street">
              <span className="hud-line" style={{ background: station.line.colour }}>
                {station.line.ref}
              </span>{' '}
              <JaText text={`${station.name}駅`} dict={dict} furigana={furigana} onWord={setWord} /> <JaText text={station.line.ja} dict={dict} furigana={furigana} onWord={setWord} />{' '}
              <span>
                {station.nameEn} Station, {station.line.en}
              </span>
            </div>
          )}
          {place && (
            <div className="hud-near">
              近く: <JaText text={place.name} dict={dict} furigana={furigana} onWord={setWord} /> {place.nameEn && <span>{place.nameEn}</span>}
              {(place.cu || place.oh) && (
                <div className="hud-near-info">
                  {place.oh && (
                    <span className={`hud-open ${isOpen(place.oh, week.day, week.minute) ? 'open' : 'closed'}`}>
                      <JaText text={isOpen(place.oh, week.day, week.minute) ? '営業中' : '準備中'} dict={dict} furigana={furigana} onWord={setWord} />
                    </span>
                  )}
                  {place.cu && (
                    <span className="hud-cuisine">
                      <JaText text={place.cu} dict={dict} furigana={furigana} onWord={setWord} />
                    </span>
                  )}
                  {place.oh && (
                    <span className="hud-hours">
                      {/^\d+:/.test(hoursToday(place.oh, week.day)) ? (
                        <>
                          <JaText text="本日" dict={dict} furigana={furigana} onWord={setWord} /> {hoursToday(place.oh, week.day)}
                        </>
                      ) : (
                        <JaText text={hoursToday(place.oh, week.day)} dict={dict} furigana={furigana} onWord={setWord} />
                      )}
                    </span>
                  )}
                  <span className="hud-near-en">
                    {place.oh && (isOpen(place.oh, week.day, week.minute) ? 'open now' : 'closed now')}
                    {place.oh && place.cuEn && ' · '}
                    {place.cuEn}
                  </span>
                </div>
              )}
            </div>
          )}
          {wordHint && dict && (
            <div className="hud-word-hint">
              👆 Tap an <u>underlined</u> Japanese word for its word card: meaning, kanji and an example.
            </div>
          )}
        </div>

        <Minimap map={map} tiles={tiles} x={pos.x} y={pos.y} big={bigMap} />

        {rally.length > 0 && (
          <button className="hud-stamps" onClick={() => setBook((b) => !b)}>
            🎴 スタンプ {rally.filter((d) => stamps.has(d.id)).length}/{rally.length}
          </button>
        )}
        <div className="hud-size" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => hud.step(-1)} disabled={hud.size <= 1} aria-label="Smaller map and boxes" title="Smaller map and boxes ([)">
            A−
          </button>
          <button onClick={() => hud.step(1)} disabled={hud.size >= 4} aria-label="Bigger map and boxes" title="Bigger map and boxes (])">
            A+
          </button>
        </div>
        <button
          className={`hud-sound ${muted ? 'muted' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setMuted((m) => !m)
          }}
          aria-pressed={muted}
          title={muted ? 'Sound off. Click (or press N) to turn it on.' : 'Sound on. Click (or press N) to mute.'}
        >
          {muted ? '🔇 消音 Muted' : '🔊 音 Sound'}
        </button>
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

        {sign && (
          <div className="hud-slope">
            <div className="hud-slope-name">
              <JaText text={sign.s.t} dict={dict} furigana={furigana} onWord={setWord} />
            </div>
            <div className="hud-slope-en">{sign.s.en}</div>
            <div className="hud-slope-note">{sign.s.n ?? SIGN_NOTES[sign.s.k]}</div>
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

        {word && dict && <WordPopup key={word.key} pick={word} dict={dict} furigana={furigana} onWord={setWord} onClose={() => setWord(null)} />}

        <DPad />
        {help ? (
          <div className="hud-help" onClick={(e) => e.stopPropagation()}>
            <button className="hud-help-close" onClick={() => setHelp(false)} aria-label="Hide controls">
              ✕
            </button>
            <dl>
              {HELP.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <button
            className="hud-help-open"
            onClick={(e) => {
              e.stopPropagation()
              setHelp(true)
              setCredits(false)
            }}
          >
            ⌨ Controls (H)
          </button>
        )}
        <div className={`attribution ${credits ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
          {credits ? (
            <>
              <button className="attribution-close" onClick={() => setCredits(false)} aria-label="Hide credits">
                ✕
              </button>
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
                    JMdict and KANJIDIC2 (EDRDG, CC BY-SA)
                  </a>
                  {', '}
                  <a href="https://tatoeba.org/" target="_blank" rel="noreferrer">
                    Tatoeba
                  </a>{' '}
                  (CC BY 2.0 FR),{' '}
                  <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">
                    KanjiVG
                  </a>{' '}
                  (CC BY-SA)
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
            </>
          ) : (
            <>
              ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{' '}
              ·{' '}
              <button
                className="attribution-more"
                onClick={() => {
                  setCredits(true)
                  setHelp(false)
                }}
              >
                All credits
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** The controls, as [keys, what they do]. */
const HELP: [string, string][] = [
  ['Arrows / WASD', 'Move'],
  ['Shift', 'Run'],
  ['Scroll, pinch, + / −', 'Zoom'],
  ['Q / E, right-drag', 'Turn'],
  ['M', 'Big map'],
  ['B', 'Stamp book'],
  ['F', 'Furigana'],
  ['N', 'Sound on/off'],
  ['[ / ]', 'Smaller / bigger boxes'],
  ['H', 'Show/hide this list'],
  ['Tap a word', 'Word card'],
]

const UNDERGROUND_BG = new THREE.Color('#15171c')

/** A word or two of Japanese for each kind of station sign. */
const SIGN_NOTES: Record<string, string> = {
  exit: '出口 (でぐち) means exit. Exits are numbered; the number tells you which street corner you come up on.',
  gate: '改札口 (かいさつぐち): the ticket gates. Tap your IC card (Suica, PASMO) on the blue reader.',
  platform: '番線 (ばんせん) is the track number, and 方面 (ほうめん) means "toward": trains here head for that end of the line.',
  name: '次 (つぎ) means next. The board shows this station and the next one down the line.',
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
