// People talking at the map's talking spots (written ahead of time by
// scripts/fetch-conversations.mjs). Walk up and you hear them: each line
// plays from the speaker's head, panned and fading with distance, and the
// words show as subtitles once you're close enough to follow.
import { useEffect, useRef, useState } from 'react'
import { view } from './input'
import { cellAt, groundAt, isBlocked, tileAt, type GameMap } from './map'
import { T } from './tiles'

export interface TalkLine {
  /** Speaker: 0 or 1. */
  s: number
  ja: string
  en: string
  /** Clip under the site root, if the line was voiced. */
  audio?: string
}

export interface Conversation {
  id: string
  spot: string
  when: Band[]
  weather: 'any' | 'rain'
  title: string
  summary: string
  note: string
  speakers: { name: string; about: string; voice: string }[]
  lines: TalkLine[]
}

export interface Spot {
  id: string
  name: string
  nameEn: string
  x: number
  y: number
}

export interface Talk {
  attribution: string
  /** Credits for the voices used, e.g. "VOICEVOX:冥鳴ひまり". */
  voices?: string[]
  spots: Spot[]
  conversations: Conversation[]
}

export type Band = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night'

export function timeBand(hour: number): Band {
  if (hour >= 5 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 14) return 'lunch'
  if (hour >= 14 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export async function loadTalk(id: string): Promise<Talk | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}talk/${id}.json`)
    if (!res.ok) return null
    return (await res.json()) as Talk
  } catch {
    return null
  }
}

/** Where a spot's two people stand, worked out from the map once its tile
 *  is in. `facing` is the angle from a to b. */
export interface Place {
  a: { x: number; y: number }
  b: { x: number; y: number }
  ground: number
  facing: number
}

/** Shared with the 3D talkers: where each spot's people stand, and who is
 *  speaking right now. */
export const talkLive = {
  places: new Map<string, Place>(),
  speaking: null as { spot: string; s: number } | null,
  /** Which spot has a conversation going. */
  active: null as string | null,
  /** The names of each spot's two people in their latest conversation. */
  names: new Map<string, [string, string]>(),
}

const GAP = 0.6 // seconds between lines
const BETWEEN = 7 // seconds between conversations
const START = 30 // meters: they start talking when you're this close
const STOP = 45 // and stop at the end of a line once you're this far
const HEAR = 12 // full subtitles inside this
const FADE = 22 // no subtitles beyond this

/** Finds pavement near a spot with room for two people to stand and talk. */
export function placeAt(map: GameMap, spot: Spot): Place | null {
  // Wait for the spot's tile to load.
  if (!tileAt(map, spot.x, spot.y)) return null
  const pave = (x: number, y: number) => {
    const c = cellAt(map, x, y)
    return c === T.SIDEWALK || c === T.FOOTWAY || c === T.GROUND
  }
  // Room to stand: clear of walls and poles for a meter around.
  const roomy = (x: number, y: number) => {
    if (!pave(x, y)) return false
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      if (isBlocked(map, x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9)) return false
    }
    return true
  }
  let best: { x: number; y: number; a: number; d: number } | null = null
  for (let r = 0; r <= 14; r += 0.5) {
    for (let k = 0; k < Math.max(1, Math.round(r * 6)); k++) {
      const t = (k / Math.max(1, Math.round(r * 6))) * Math.PI * 2
      const x = spot.x + Math.cos(t) * r
      const y = spot.y + Math.sin(t) * r
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI
        const dx = Math.cos(a) * 0.7
        const dy = Math.sin(a) * 0.7
        if (roomy(x - dx, y - dy) && roomy(x + dx, y + dy)) {
          best = { x, y, a, d: r }
          break
        }
      }
      if (best) break
    }
    if (best) break
  }
  if (!best) return null
  const dx = Math.cos(best.a) * 0.7
  const dy = Math.sin(best.a) * 0.7
  return {
    a: { x: best.x - dx, y: best.y - dy },
    b: { x: best.x + dx, y: best.y + dy },
    ground: groundAt(map, best.x, best.y),
    facing: Math.atan2(dx, dy),
  }
}

export interface Caption {
  spot: Spot
  conv: Conversation
  /** Index of the line being said, or -1 between conversations (the note shows). */
  line: number
  /** 1 close enough to follow, 0 too far for subtitles. */
  clear: number
}

interface Inputs {
  map: GameMap | null
  talk: Talk | null
  focus: { current: { x: number; y: number; under?: boolean } }
  hour: number
  rain: number
  muted: boolean
}

/** Plays the nearest spot's conversations and returns what to show. */
export function useTalk(inputs: Inputs): Caption | null {
  const live = useRef(inputs)
  live.current = inputs
  const [caption, setCaption] = useState<Caption | null>(null)
  const { map, talk } = inputs

  useEffect(() => {
    if (!map || !talk?.conversations.length) return
    let closed = false
    let ctx: AudioContext | null = null
    let master: GainNode | null = null
    const buffers = new Map<string, Promise<AudioBuffer | null>>()
    const heard = loadHeard()

    // Browsers only allow sound after the player does something.
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      if (ctx || closed) return
      ctx = new AudioContext()
      master = ctx.createGain()
      master.connect(ctx.destination)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    const onVisible = () => {
      if (!ctx) return
      if (document.hidden) ctx.suspend()
      else ctx.resume()
    }
    document.addEventListener('visibilitychange', onVisible)

    const clip = (path: string) => {
      let p = buffers.get(path)
      if (!p && ctx) {
        const c = ctx
        p = fetch(`${import.meta.env.BASE_URL}${path}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => c.decodeAudioData(b))
          .catch(() => null)
        buffers.set(path, p)
      }
      return p ?? Promise.resolve(null)
    }

    // The conversation going on, if any.
    let cur: {
      spot: Spot
      conv: Conversation
      line: number
      /** Saying the line, the pause after it, or the note after the last. */
      phase: 'say' | 'gap' | 'note'
      /** When the current line (or pause) ends, in performance.now() ms. */
      until: number
      /** Sound nodes of the line being said. */
      nodes: { src: AudioBufferSourceNode; panner: PannerNode; filter: BiquadFilterNode } | null
    } | null = null
    let restAt = 0 // no new conversation before this
    let shown = ''

    const pick = (spot: Spot) => {
      const { hour, rain } = live.current
      const band = timeBand(hour)
      const wet = rain > 0.2
      const here = talk.conversations.filter((c) => c.spot === spot.id)
      const fits = here.filter((c) => c.when.includes(band) && (c.weather === 'any' || wet))
      // Rain talk first when it's raining, and ones not heard yet first.
      const pool = (fits.length ? fits : here).slice().sort((a, b) => score(b) - score(a))
      function score(c: Conversation) {
        return (heard.has(c.id) ? 0 : 10) + (wet && c.weather === 'rain' ? 5 : 0) + Math.random()
      }
      return pool[0] ?? null
    }

    const stopSound = () => {
      if (!cur?.nodes) return
      try {
        cur.nodes.src.stop()
      } catch {
        // already stopped
      }
      cur.nodes = null
    }

    const sayLine = (now: number) => {
      if (!cur) return
      const l = cur.conv.lines[cur.line]
      talkLive.speaking = { spot: cur.spot.id, s: l.s }
      // Without sound, give each line time to be read.
      const readTime = 1200 + [...l.ja].length * 170
      cur.until = now + readTime
      cur.phase = 'say'
      cur.nodes = null
      if (l.audio && ctx && master) {
        const mine = cur
        const idx = cur.line
        const c = ctx
        const m = master
        clip(l.audio).then((buf) => {
          if (!buf || cur !== mine || mine.line !== idx || mine.phase !== 'say' || closed) return
          const src = c.createBufferSource()
          src.buffer = buf
          const panner = new PannerNode(c, {
            panningModel: 'HRTF',
            distanceModel: 'inverse',
            refDistance: 4,
            rolloffFactor: 1.6,
            maxDistance: 80,
          })
          const filter = new BiquadFilterNode(c, { type: 'lowpass', frequency: 20000 })
          src.connect(filter).connect(panner).connect(m)
          const place = talkLive.places.get(mine.spot.id)
          if (place) {
            const p = l.s === 0 ? place.a : place.b
            panner.positionX.value = p.x
            panner.positionY.value = place.ground + 1.5
            panner.positionZ.value = p.y
          }
          src.start()
          mine.nodes = { src, panner, filter }
          mine.until = performance.now() + buf.duration * 1000
        })
        // Load the next line while this one plays.
        const next = cur.conv.lines[cur.line + 1]
        if (next?.audio) clip(next.audio)
      }
    }

    const tick = () => {
      const { focus, muted } = live.current
      const f = focus.current
      const now = performance.now()
      // Listener at the player's head, facing the way the camera looks.
      if (ctx && master) {
        const L = ctx.listener
        const gy = groundAt(map, f.x, f.y) + 1.6
        if (L.positionX) {
          L.positionX.value = f.x
          L.positionY.value = gy
          L.positionZ.value = f.y
          L.forwardX.value = -Math.sin(view.yaw)
          L.forwardY.value = 0
          L.forwardZ.value = -Math.cos(view.yaw)
          L.upX.value = 0
          L.upY.value = 1
          L.upZ.value = 0
        } else {
          L.setPosition(f.x, gy, f.y)
          L.setOrientation(-Math.sin(view.yaw), 0, -Math.cos(view.yaw), 0, 1, 0)
        }
        master.gain.setTargetAtTime(muted || f.under ? 0 : 1, ctx.currentTime, 0.1)
      }

      // Work out where people stand at spots that just came into reach.
      for (const s of talk.spots) {
        if (talkLive.places.has(s.id) || Math.hypot(s.x - f.x, s.y - f.y) > 120) continue
        const p = placeAt(map, s)
        if (p) talkLive.places.set(s.id, p)
      }
      const distTo = (s: Spot) => {
        const p = talkLive.places.get(s.id)
        return p ? Math.hypot((p.a.x + p.b.x) / 2 - f.x, (p.a.y + p.b.y) / 2 - f.y) : Infinity
      }

      if (!cur) {
        if (now < restAt || f.under) return publish(null, 0)
        const spot = talk.spots.filter((s) => distTo(s) < START).sort((a, b) => distTo(a) - distTo(b))[0]
        const conv = spot && pick(spot)
        if (!spot || !conv) return publish(null, 0)
        cur = { spot, conv, line: 0, phase: 'say', until: 0, nodes: null }
        talkLive.active = spot.id
        sayLine(now)
      }

      const d = distTo(cur.spot)
      // Muffle and fade with distance (the panner does the loudness).
      if (cur.nodes && ctx) {
        const freq = d < 6 ? 20000 : Math.max(1200, 20000 * Math.pow(6 / d, 2))
        cur.nodes.filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.15)
      }
      if (now >= cur.until) {
        if (cur.phase === 'say') {
          // Line over: a short pause, then the next one.
          stopSound()
          talkLive.speaking = null
          if (d > STOP || f.under) {
            cur = null
            talkLive.active = null
            restAt = now + 1500
            return publish(null, 0)
          }
          if (cur.line === cur.conv.lines.length - 1) {
            heard.add(cur.conv.id)
            saveHeard(heard)
            cur.phase = 'note'
            cur.until = now + BETWEEN * 1000
          } else {
            cur.phase = 'gap'
            cur.until = now + GAP * 1000
          }
        } else if (cur.phase === 'gap') {
          cur.line++
          sayLine(now)
        } else {
          cur = null
          talkLive.active = null
          restAt = now
          return publish(null, 0)
        }
      }
      const clear = Math.max(0, Math.min(1, (FADE - d) / (FADE - HEAR)))
      publish({ spot: cur.spot, conv: cur.conv, line: cur.phase === 'note' ? -1 : cur.line, clear }, clear)
    }

    function publish(c: Caption | null, clear: number) {
      const key = c ? `${c.conv.id}:${c.line}:${Math.round(clear * 10)}` : ''
      if (key === shown) return
      shown = key
      setCaption(c)
    }

    const timer = window.setInterval(tick, 100)
    return () => {
      closed = true
      clearInterval(timer)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisible)
      talkLive.speaking = null
      talkLive.active = null
      ctx?.close()
    }
  }, [map, talk])

  return caption
}

function loadHeard() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('japango.heard') ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

function saveHeard(set: Set<string>) {
  try {
    localStorage.setItem('japango.heard', JSON.stringify([...set]))
  } catch {
    // Kept for this visit only.
  }
}
