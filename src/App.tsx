import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AREA_ID } from './game/area'
import { hoursToday, isOpen, tokyoWeekMinute } from './game/hours'
import { input, turnView, view } from './game/input'
import { LabelLayerSync, Labels } from './game/Labels'
import { discoveryNear, loadMap, nearestPoi, slopeNear, streetNear, type GameMap } from './game/map'
import { Discoveries } from './game/Discoveries'
import { useAmbience, useSoundCredits } from './game/ambience'
import { loadDict, type Dict } from './game/dict'
import { ControlsHelp, DPad, DiscoveryCard, Hotbar, Panel, PanelTitle, PlaceCard, SignCard, StampBook, Toaster, UiRoot, Window, cn, toast } from './ui'
import { JaText, WordPopup, jaSegments, pickWord, type WordPick } from './game/JaText'
import { Minimap } from './game/Minimap'
import { useHudScale } from './game/hud'
import { Player } from './game/Player'
import { World, type Focus } from './game/World'
import { loadAround, useTileStream } from './game/stream'
import { useProgressSync } from './game/progress'
import { Underground, type Station } from './game/station'
import { Stations, boardRows } from './game/Stations'
import { useTimetable, type Timetable } from './game/trains'
import { buildInteriors } from './game/interior'
import { Interiors, type Glass } from './game/Interiors'
import { BarMenu } from './game/BarMenu'
import { ANTNBEE, ORDER_SPOT, toLocal } from './game/interiors/antnbee'
import { Talkers } from './game/Talkers'
import { TalkCaption } from './game/TalkCaption'
import { loadTalk, useTalk, type Talk } from './game/talk'
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
  // Beers you've ordered at the bar, until you pay.
  const [glasses, setGlasses] = useState<Glass[]>([])
  // The bar's menu is open (it takes the bottom of the screen).
  const [barOpen, setBarOpen] = useState(false)
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
    loadDict(AREA_ID).then(setDict)
  }, [])
  // People talking at the talking spots, and English under what they say.
  const [talk, setTalk] = useState<Talk | null>(null)
  useEffect(() => {
    loadTalk('roppongi').then(setTalk)
  }, [])
  const [english, setEnglish] = useState(() => {
    try {
      return localStorage.getItem('japango.english') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('japango.english', english ? '1' : '0')
    } catch {
      // Not saved; fine for this visit.
    }
  }, [english])
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
  // Touch screens get the D-pad instead of the keyboard list.
  const coarse = useMemo(() => matchMedia('(pointer: coarse)').matches, [])
  const hud = useHudScale()
  const hudStep = useRef(hud.step)
  hudStep.current = hud.step

  // Tokyo time and weather, live. ?time=21:30 and ?weather=rain (or a WMO
  // code) override them for testing.
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [now, setNow] = useState(() => new Date())
  const [weather, setWeather] = useState<Weather>({ kind: 'clear', cloud: 0.1 })
  // How far the game clock runs from the real one (0 unless ?time=).
  const clockOffset = useMemo(() => {
    const fixed = params.get('time')
    const start = fixed ? tokyoTimeToday(fixed) : null
    return start ? start.getTime() - Date.now() : 0
  }, [params])
  useEffect(() => {
    const offset = clockOffset
    const tick = () => setNow(new Date(Date.now() + offset))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [clockOffset])
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
    loadMap(AREA_ID)
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
      if (e.key === 't' || e.key === 'T') setEnglish((v) => !v)
      if (e.key === 'h' || e.key === 'H') setHelp((h) => !h)
      if (e.key === ']') hudStep.current(1)
      if (e.key === '[') hudStep.current(-1)
      if (e.key === 'Escape') setWord(null)
    }
    // Scrolling and trackpad pinches zoom the camera, never the page. A
    // pinch arrives as a wheel event with ctrlKey set; it has to be stopped
    // in a non-passive listener or the browser zooms the page out.
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.hud-scroll, [role=dialog]')) {
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
      toast({ kind: 'stamp', title: 'スタンプゲット！', body: here.ja })
    }
  }, [here, found, stamps])

  const sky = useMemo(() => skyState(now, weather, map?.rotationDeg ?? 0), [now, weather, map])
  const tiles = useTileStream(map, focus, distance)
  const clock = tokyoClock(now)
  const hour = clock.h + clock.m / 60
  const week = tokyoWeekMinute(now)
  const timetable = useTimetable(map?.id)
  const trainClock = useMemo(() => ({ timetable, offset: clockOffset }), [timetable, clockOffset])
  const ug = useMemo(() => {
    const interiors = buildInteriors(map?.interiors)
    return map?.stations?.length || interiors.length ? new Underground(map?.stations ?? [], interiors) : null
  }, [map])
  useAmbience({ map, focus, under, hour, month: tokyoMonth(now), night: sky.night, rain: sky.rain, muted, credits: soundCredits })
  const caption = useTalk({ map, talk, focus, hour, rain: sky.rain, muted })
  // Each spot's people look like the voices of their latest conversation.
  const [voices, setVoices] = useState<Record<string, [string, string]>>({})
  const talkingConv = caption?.conv
  useEffect(() => {
    if (!talkingConv) return
    const v: [string, string] = [talkingConv.speakers[0]?.voice ?? '', talkingConv.speakers[1]?.voice ?? '']
    setVoices((old) => (old[talkingConv.spot]?.join() === v.join() ? old : { ...old, [talkingConv.spot]: v }))
  }, [talkingConv])

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
  if (!map || !pos) return <div className="center-msg">読み込み中… Loading</div>

  const words = WEATHER_WORDS[weather.kind]
  const rally = (map.discoveries ?? []).filter((d) => d.stamp)
  const street = under ? null : streetNear(map, pos.x, pos.y)
  const place = under ? null : nearestPoi(map, pos.x, pos.y)
  const slope = under ? null : slopeNear(map, pos.x, pos.y)
  const z = focus.current.z ?? 0
  const inside = under && ug ? ug.interiorAt(pos.x, pos.y, z) : null
  const station = under && ug && !inside ? ug.stationAt(pos.x, pos.y, z) : null
  // Local spot in the bar, to tell if you're at the counter.
  const barAt = inside ? toLocal(inside.place, pos.x, pos.y) : null
  const atCounter = !!barAt && barAt[0] < ORDER_SPOT.a && barAt[1] > ORDER_SPOT.b0 && barAt[1] < ORDER_SPOT.b1
  // On the street, right by a walk-in place's door.
  const door = !under && ug ? ug.interiors.find((it) => Math.hypot(it.place.x - pos.x, it.place.y - pos.y) < 7) : null
  const sign = under && ug ? ug.signNear(pos.x, pos.y, z) : null
  // A departure board's card reads out its next trains.
  const board = sign?.s.k === 'board' ? boardRows(sign.st as Station, sign.s.p ?? 0, trainClock, Date.now() + clockOffset) : null
  const bg = under ? UNDERGROUND_BG : sky.background
  const ja = (t: string) => <JaText text={t} dict={dict} furigana={furigana} onWord={setWord} />
  const seg = (t: string) => jaSegments(t, dict)
  const tap = pickWord(setWord)
  // Room for the credits in the bottom-left corner, beside the hotbar.
  const wide = hud.width >= 700
  const creditsBox = credits ? (
            <Panel size="sm" className="hud-scroll pointer-events-auto max-h-[calc(var(--hud-h)*0.5)] w-[min(32rem,calc(var(--hud-w)-24px))] overflow-y-auto px-3 py-2.5 text-xs leading-relaxed [&_a]:text-sora [&_a]:underline">
              <PanelTitle
                className="mb-2"
                aside={
                  <button className="corner-sm grid size-6 place-items-center bg-ink-3 hover:bg-shu" onClick={() => setCredits(false)} aria-label="Hide credits">
                    ✕
                  </button>
                }
              >
                Credits
              </PanelTitle>
              <Credits map={map} dict={dict} talk={talk} soundCredits={soundCredits} liveWeather={!params.get('weather')} timetable={timetable} />
            </Panel>
          ) : (
            <div className="corner-sm pointer-events-auto bg-ink/80 px-2 py-0.5 text-[11px] text-paper-dim">
              ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                OpenStreetMap
              </a>{' '}
              ·{' '}
              <button
                className="underline"
                onClick={() => {
                  setCredits(true)
                  setHelp(false)
                }}
              >
                Credits
              </button>
            </div>
          )

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
        {ug && <Stations ug={ug} focus={focus} under={under} clock={trainClock} />}
        {ug && ug.interiors.length > 0 && <Interiors interiors={ug.interiors} focus={focus} under={under} night={sky.night > 0.5} glasses={glasses} />}
        {talk && !under && <Talkers talk={talk} voices={voices} rain={sky.rain > 0.2} />}
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

      <UiRoot
        scale={hud.scale}
        className="pointer-events-none absolute top-0 left-0"
        style={{ width: hud.width, height: hud.height, '--hud-w': `${hud.width}px`, '--hud-h': `${hud.height}px` } as React.CSSProperties}
      >
        {/* Top left: where you are, and the place you're next to. */}
        <div className="absolute top-3 left-3 flex w-[min(22rem,calc(100%-220px))] min-w-[150px] flex-col gap-2">
          <Panel size="sm" className="pointer-events-auto px-3.5 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-pixel text-2xl leading-tight">{ja(map.name)}</span>
              <span className="text-sm text-paper-dim">{map.nameEn}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
              <span className="font-pixel text-gold">{japaneseTime(now)}</span>
              <span>
                {words.icon} {ja(words.ja)}
              </span>
              <span className="text-[0.85em] text-paper-dim">
                {words.kana} ({words.en}){weather.tempC != null && `, ${Math.round(weather.tempC)}°C`}
              </span>
            </div>
            {street && (
              <div className="mt-1 border-t border-paper/15 pt-1">
                {ja(street.name)} {street.nameEn && <span className="text-[0.85em] text-paper-dim">{street.nameEn}</span>}
              </div>
            )}
            {station && (
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 border-t border-paper/15 pt-1">
                <Chip color={station.line.colour}>{station.line.ref}</Chip>
                {ja(`${station.name}駅`)} {ja(station.line.ja)}
                <span className="text-[0.85em] text-paper-dim">
                  {station.nameEn} Station, {station.line.en}
                </span>
              </div>
            )}
            {inside && (
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 border-t border-paper/15 pt-1">
                <Chip color="var(--color-kin)">
                  B1
                </Chip>
                {ja(inside.name)} {ja(inside.kind)}
                <span className="text-[0.85em] text-paper-dim">
                  {inside.nameEn}, {inside.kindEn} ({inside.floor}, basement 1)
                </span>
              </div>
            )}
          </Panel>
          {place && (
            <PlaceCard
              className="pointer-events-auto w-full p-3"
              name={seg(place.name)}
              nameEn={place.nameEn}
              status={place.gone ? 'gone' : place.oh ? (isOpen(place.oh, week.day, week.minute) ? 'open' : 'closed') : undefined}
              cuisine={place.cu ? seg(place.cu) : undefined}
              cuisineEn={place.cuEn}
              hours={place.oh ? hoursToday(place.oh, week.day) : undefined}
              furigana={furigana}
              onWord={tap}
            />
          )}
          {wordHint && dict && (
            <div className="corner-sm animate-pulse bg-kin px-3 py-1.5 text-sm text-sumi drop-hard-sm motion-reduce:animate-none">
              👆 Tap an <u>underlined</u> Japanese word for its word card: meaning, kanji and an example.
            </div>
          )}
          {!wide && <div className="flex flex-col items-start" onClick={(e) => e.stopPropagation()}>{creditsBox}</div>}
        </div>

        {/* Top right: the map, with the A−/A+ buttons under it. */}
        <div className={cn('absolute top-3 right-3 max-w-[calc(100%-24px)]', bigMap && 'z-[5]')} onClick={(e) => e.stopPropagation()}>
          <Minimap
            map={map}
            tiles={tiles}
            x={pos.x}
            y={pos.y}
            big={bigMap}
            label={bigMap ? (under ? '地下 · underground' : (street?.nameEn ?? map.nameEn)) : null}
            actions={
              <>
                <SizeButton onClick={() => hud.step(-1)} disabled={hud.size <= 1} label="Smaller map and boxes ([)">
                  A−
                </SizeButton>
                <SizeButton onClick={() => hud.step(1)} disabled={hud.size >= 4} label="Bigger map and boxes (])">
                  A+
                </SizeButton>
              </>
            }
            onToggleBig={() => setBigMap((b) => !b)}
          />
        </div>

        {/* Bottom middle: overheard talk, a discovery, a sign. Stacked so
            they never overlap, above the hotbar. */}
        <div
          className={cn(
            'absolute flex flex-col gap-3',
            coarse && hud.width < 680 ? 'bottom-[228px]' : 'bottom-[76px]',
            // On a short screen, beside the map instead of under it.
            hud.height < 430 ? 'left-3 w-[min(34rem,calc(100%-220px))] items-start' : 'left-1/2 w-[min(34rem,calc(100%-24px))] -translate-x-1/2 items-center',
          )}
        >
          {caption && !book && !(barOpen && inside) && (
            <TalkCaption caption={caption} dict={dict} furigana={furigana} english={english} onWord={setWord} onEnglish={() => setEnglish((v) => !v)} />
          )}
          {here && !book && !(barOpen && inside) && (
            <DiscoveryCard
              className="pointer-events-auto w-full"
              name={seg(here.ja)}
              nameEn={here.en}
              stamp={!!here.stamp}
              textJa={here.jt ? seg(here.jt) : undefined}
              textEn={here.et}
              links={[
                { label: `Wikipedia 日本語${here.ew ? '' : ' (CC BY-SA)'}`, href: `https://ja.wikipedia.org/wiki/${encodeURIComponent(here.jw)}` },
                ...(here.ew ? [{ label: 'English (CC BY-SA)', href: `https://en.wikipedia.org/wiki/${encodeURIComponent(here.ew)}` }] : []),
              ]}
              furigana={furigana}
              onWord={tap}
            />
          )}
          {sign && !(barOpen && inside) && (
            <SignCard
              className="pointer-events-auto w-[min(26rem,100%)]"
              kind="station"
              title={seg(board?.[0] ? (board[0].done ? `本日の運転は終了しました　始発 ${board[0].time} ${board[0].to}` : `先発 ${board[0].time} ${board[0].to}`) : sign.s.t)}
              english={
                board?.[0]
                  ? (board[0].done
                      ? `No more trains tonight. First train (始発): ${board[0].time} for ${board[0].toEn || board[0].to}`
                      : `Next train: ${board[0].time} for ${board[0].toEn || board[0].to}` +
                        (board[1] ? `. After that (次発): ${board[1].time} for ${board[1].toEn || board[1].to}` : '')) + (board[0].approx ? ' (approximate times)' : '')
                  : sign.s.en
              }
              note={sign.s.n ?? SIGN_NOTES[sign.s.k]}
              furigana={furigana}
              onWord={tap}
            />
          )}
          {door && !sign && (
            <SignCard
              className="pointer-events-auto w-[min(26rem,100%)]"
              kind="door"
              title={[...seg(door.name), [' '], ...seg(ANTNBEE.signs.street.t)]}
              english={`${door.nameEn}: ${ANTNBEE.signs.street.en}. Walk down the stairs to go in.`}
              note={ANTNBEE.signs.street.n}
              furigana={furigana}
              onWord={tap}
            />
          )}
          {slope && !here && !door && !caption && (
            <SignCard
              className="pointer-events-auto w-[min(26rem,100%)]"
              kind="slope"
              title={seg(slope.slope.name)}
              kana={slope.slope.kana}
              english={slope.slope.en && `${slope.slope.en}: “${slope.slope.gloss}”`}
              note={`坂 (さか) means slope.${slope.slope.rise >= 2 ? ` It ${slope.top ? 'drops' : 'climbs'} about ${Math.round(slope.slope.rise)} m from here.` : ''}`}
              furigana={furigana}
              onWord={tap}
            />
          )}
        </div>

        {inside && (
          <BarMenu
            open={barOpen}
            onOpenChange={setBarOpen}
            atCounter={atCounter}
            dict={dict}
            furigana={furigana}
            onWord={setWord}
            onServe={(color) => setGlasses((g) => [...g.slice(-8), { b: barAt ? Math.min(ORDER_SPOT.b1 - 1, Math.max(ORDER_SPOT.b0 + 0.3, barAt[1])) : 7, color }])}
            onPaid={() => setGlasses([])}
          />
        )}

        {wide && (
          <div className="absolute bottom-3 left-3 flex flex-col items-start" onClick={(e) => e.stopPropagation()}>
            {creditsBox}
          </div>
        )}

        {/* Bottom: the hotbar, and the D-pad on touch screens. */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2" onClick={(e) => e.stopPropagation()}>
          <Hotbar
            compact
            className="pointer-events-auto"
            slots={[
              { id: 'map', icon: '🗺', label: 'Map', shortcut: 'M', active: bigMap, onClick: () => setBigMap((b) => !b) },
              ...(rally.length > 0
                ? [{ id: 'stamps', icon: '🎴', label: 'Stamps', shortcut: 'B', active: book, badge: `${rally.filter((d) => stamps.has(d.id)).length}/${rally.length}`, onClick: () => setBook((b) => !b) }]
                : []),
              { id: 'furigana', icon: 'あ', label: 'ふりがな', shortcut: 'F', active: furigana, onClick: () => setFurigana((f) => !f) },
              { id: 'english', icon: 'EN', label: 'English', shortcut: 'T', active: english, onClick: () => setEnglish((v) => !v) },
              { id: 'sound', icon: muted ? '🔇' : '🔊', label: muted ? 'Muted' : 'Sound', shortcut: 'N', active: !muted, onClick: () => setMuted((m) => !m) },
              ...(coarse
                ? []
                : [
                    {
                      id: 'keys',
                      icon: '⌨',
                      label: 'Keys',
                      shortcut: 'H',
                      active: help,
                      onClick: () => {
                        setHelp((h) => !h)
                        setCredits(false)
                      },
                    },
                  ]),
            ]}
          />
        </div>
        {coarse && (
          <div className={`pointer-events-auto absolute right-3 ${hud.width >= 680 ? 'bottom-3' : 'bottom-[76px]'}`} onClick={(e) => e.stopPropagation()}>
            <DPad size={140} onPress={input.press} onRelease={input.release} onTurn={turnView} />
          </div>
        )}

        {word && dict && <WordPopup key={word.key} pick={word} dict={dict} furigana={furigana} onWord={setWord} onClose={() => setWord(null)} />}

        <Window
          open={book}
          onOpenChange={setBook}
          tone="paper"
          width={560}
          title="スタンプラリー"
          subtitle="Stamp rally · B closes"
        >
          <StampBook stampSize={68} spots={rally.map((d) => ({ id: d.id, ja: d.ja, en: d.en, got: stamps.has(d.id) }))} found={found.size} total={map.discoveries?.length ?? 0} />
        </Window>
        <Window open={help && !coarse} onOpenChange={setHelp} width={440} title="操作" subtitle="Controls · H closes">
          <ControlsHelp controls={HELP} />
        </Window>
        <Toaster />
      </UiRoot>
    </div>
  )
}

/** A station number like the ones on Tokyo Metro signs (H04): the line's
 *  color as a ring on white. */
function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="corner-sm inline-block bg-white px-1.5 py-1 font-arcade text-[0.55em] leading-none text-[#1d1a24]"
      style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
    >
      {children}
    </span>
  )
}

/** A− / A+ in the map's bottom row. */
function SizeButton({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      className="corner-sm grid h-6 min-w-8 place-items-center bg-ink-3 px-1.5 text-[0.85em] font-bold text-paper hover:bg-paper hover:text-ink disabled:opacity-35 disabled:hover:bg-ink-3 disabled:hover:text-paper"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

/** Everything the game is built from, with links and licenses. */
function Credits({
  map,
  dict,
  talk,
  soundCredits,
  liveWeather,
  timetable,
}: {
  map: GameMap
  dict: Dict | null
  talk: Talk | null
  soundCredits: ReturnType<typeof useSoundCredits>
  liveWeather: boolean
  timetable: Timetable | null
}) {
  return (
    <>
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
      {timetable?.sources.map((src) => (
        <span key={src.feed}>
          {' · '}Train timetables: {src.credit} ({src.creditEn}),{' '}
          <a href={src.licenseUrl} target="_blank" rel="noreferrer">
            {src.license}
          </a>
        </span>
      ))}
      {liveWeather && (
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
      {talk && (
        <>
          {' · '}
          {talk.attribution}
          {talk.voices?.length ? (
            <>
              {'; voices: '}
              <a href="https://voicevox.hiroshiba.jp/" target="_blank" rel="noreferrer">
                {talk.voices.join(', ')}
              </a>
            </>
          ) : null}
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
  )
}

/** The controls, as [keys, what they do]. */
const HELP: [string, string][] = [
  ['↑↓←→ / WASD', 'Move'],
  ['Shift', 'Run'],
  ['+ / −, mouse wheel', 'Zoom'],
  ['Q / E, right-drag', 'Turn'],
  ['M', 'Big map'],
  ['B', 'Stamp book'],
  ['F', 'Furigana'],
  ['N', 'Sound on/off'],
  ['T', 'English under talk'],
  ['[ / ]', 'Smaller / bigger'],
  ['H', 'This list'],
  ['Tap a word', 'Word card'],
]

const UNDERGROUND_BG = new THREE.Color('#15171c')

/** A word or two of Japanese for each kind of station sign. */
const SIGN_NOTES: Record<string, string> = {
  exit: '出口 (でぐち) means exit. Exits are numbered; the number tells you which street corner you come up on.',
  gate: '改札口 (かいさつぐち): the ticket gates. Tap your IC card (Suica, PASMO) on the blue reader.',
  platform: '番線 (ばんせん) is the track number, and 方面 (ほうめん) means "toward": trains here head for that end of the line.',
  name: '次 (つぎ) means next. The board shows this station and the next one down the line.',
  board: '発車案内 (はっしゃあんない): departures. 先発 (せんぱつ) is the next train to leave, 次発 (じはつ) the one after, 〜行 (ゆき) means "bound for", and 始発 (しはつ) is the first train of the day.',
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
