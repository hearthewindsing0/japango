// Background sound: a street bed that follows the crowd, night air, rain,
// birds (and cicadas in summer) near parks, and the crossing chimes near
// pedestrian crossings. Recordings come from Freesound (see
// scripts/fetch-sounds.mjs); any that are missing are simply silent. The
// cars going past are made here: a rush of filtered noise for each of the
// nearest ones, panned to where it is on screen (see traffic.ts).
import { useEffect, useRef, useState } from 'react'
import { crowdLevel } from './Crowd'
import { cellAt, type GameMap, type MapTile } from './map'
import { T } from './tiles'
import { view } from './input'
import { trafficSound } from './traffic'

const KINDS = ['city', 'night', 'crossing', 'rain', 'birds', 'cicadas'] as const
type Kind = (typeof KINDS)[number]

export interface SoundCredit {
  name: string
  author: string
  url: string
  license: string
  licenseUrl: string
}

/** Credits for the recordings that exist, or {} before they're fetched. */
export function useSoundCredits() {
  const [credits, setCredits] = useState<Partial<Record<Kind, SoundCredit>>>({})
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}sounds/credits.json`)
      .then((r) => (r.ok ? r.json() : { sounds: {} }))
      .then((j) => setCredits(j.sounds ?? {}), () => {})
  }, [])
  return credits
}

interface Inputs {
  map: GameMap | null
  focus: { current: { x: number; y: number } }
  /** Down in a station: the street goes quiet and muffled. */
  under: boolean
  hour: number
  month: number // 1-12, Tokyo
  night: number
  rain: number
  muted: boolean
  credits: Partial<Record<Kind, SoundCredit>>
}

/** Share of park ground (grass, woods) around a point, 0..1. */
function greenAround(map: GameMap, x: number, y: number) {
  let n = 0
  let g = 0
  for (let dy = -18; dy <= 18; dy += 6)
    for (let dx = -18; dx <= 18; dx += 6) {
      const c = cellAt(map, x + dx, y + dy)
      n++
      if (c === T.GRASS || c === T.WOODS) g++
    }
  return g / n
}

export function useAmbience(inputs: Inputs) {
  // Latest inputs for the update loop, without restarting it.
  const live = useRef(inputs)
  live.current = inputs
  const { map, credits } = inputs

  useEffect(() => {
    const have = KINDS.filter((k) => credits[k])
    if (!map) return
    const m = map
    // Crossing points of each loaded tile, worked out once per tile.
    const crossingCache = new WeakMap<MapTile, number[]>()
    const crossingsOf = (t: MapTile) => {
      let c = crossingCache.get(t)
      if (!c) {
        c = []
        for (const p of t.paths) if (p.t === 'crossing') for (let i = 0; i < p.p.length; i += 2) c.push(p.p[i], p.p[i + 1])
        crossingCache.set(t, c)
      }
      return c
    }

    let ctx: AudioContext | null = null
    let master: GainNode | null = null
    const gains: Partial<Record<Kind, GainNode>> = {}
    let timer = 0
    let carTimer = 0
    const voices: { g: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode }[] = []
    let closed = false

    // Browsers only allow sound after the player does something.
    const start = async () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      if (ctx || closed) return
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)
      timer = window.setInterval(update, 250)
      startCars(ctx, master)
      for (const k of have) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}sounds/${k}.mp3`)
          if (!res.ok || closed || !ctx || !master) continue
          const buf = await ctx.decodeAudioData(await res.arrayBuffer())
          if (closed) return
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.loop = true
          const g = ctx.createGain()
          g.gain.value = 0
          src.connect(g).connect(master)
          // Start each loop somewhere different so they don't line up.
          src.start(0, Math.random() * buf.duration)
          gains[k] = g
        } catch {
          // A sound that won't load just stays silent.
        }
      }
    }

    // Passing cars: brown noise through a low-pass filter that opens up
    // with speed, louder the closer the car.
    const startCars = (ac: AudioContext, out: AudioNode) => {
      const noise = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate)
      const data = noise.getChannelData(0)
      let last = 0
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        data[i] = last * 3.5
      }
      for (let i = 0; i < 4; i++) {
        const src = ac.createBufferSource()
        src.buffer = noise
        src.loop = true
        src.playbackRate.value = 0.8 + i * 0.12
        const lp = ac.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 400
        const g = ac.createGain()
        g.gain.value = 0
        const pan = ac.createStereoPanner()
        src.connect(lp).connect(g).connect(pan).connect(out)
        src.start(0, Math.random() * noise.duration)
        voices.push({ g, lp, pan })
      }
      carTimer = window.setInterval(updateCars, 100)
    }

    const updateCars = () => {
      if (!ctx) return
      const { focus, under } = live.current
      const { x, y } = focus.current
      const t = ctx.currentTime
      // Screen right, from the camera's turn.
      const rx = Math.cos(view.yaw)
      const ry = -Math.sin(view.yaw)
      voices.forEach((vo, i) => {
        const c = trafficSound.near[i]
        let gain = 0
        if (c && !under) {
          const heavy = c.kind === 'bus' || c.kind === 'truck' ? 1.7 : c.kind === 'kei' ? 0.7 : 1
          gain = 0.55 * heavy * Math.min(1, c.v / 12) ** 0.7 / (1 + (c.dist / 7) ** 2)
          vo.lp.frequency.setTargetAtTime(250 + c.v * 55 + (heavy > 1 ? -60 : 0), t, 0.1)
          const side = ((c.x - x) * rx + (c.y - y) * ry) / Math.max(4, c.dist)
          vo.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, side)), t, 0.1)
        }
        vo.g.gain.setTargetAtTime(gain, t, 0.12)
      })
    }

    const update = () => {
      if (!ctx || !master) return
      const { focus, hour, month, night, rain, muted, under } = live.current
      const { x, y } = focus.current
      const day = 1 - night
      const crowd = crowdLevel(hour)
      const green = greenAround(m, x, y)
      let near = Infinity
      for (const tile of m.tiles.values()) {
        const crossings = crossingsOf(tile)
        for (let i = 0; i < crossings.length; i += 2) near = Math.min(near, Math.hypot(crossings[i] - x, crossings[i + 1] - y))
      }
      const wet = Math.min(1, rain)
      const hasNight = !!gains.night
      const target: Record<Kind, number> = {
        // The street bed carries the night too when there's no night recording.
        // The recorded street follows the crowd and the traffic around you.
        city: (0.1 + 0.3 * crowd + 0.25 * trafficSound.busy) * (1 - 0.6 * green) * (hasNight ? 1 - 0.7 * night : 1) * (1 - 0.4 * wet),
        night: (0.2 + 0.35 * crowd) * night * (1 - 0.5 * green) * (1 - 0.4 * wet),
        crossing: Math.max(0, 1 - near / 30) * 0.45 * (0.3 + 0.7 * day),
        rain: wet * 0.7,
        birds: Math.min(1, green * 2) * 0.55 * day * (1 - 0.7 * wet) * (month >= 11 || month <= 2 ? 0.6 : 1),
        cicadas: month >= 7 && month <= 9 ? Math.min(1, green * 2 + 0.15) * 0.5 * day * (1 - wet) : 0,
      }
      if (under) {
        // Underground: a distant hum of the street, no weather or birds.
        target.city *= 0.25
        target.night *= 0.25
        target.rain = 0
        target.birds = 0
        target.cicadas = 0
        target.crossing = 0
      }
      const t = ctx.currentTime
      for (const k of KINDS) gains[k]?.gain.setTargetAtTime(target[k], t, 0.6)
      master.gain.setTargetAtTime(muted || document.hidden ? 0 : 0.8, t, muted ? 0.05 : 0.4)
    }

    // Stop using the speakers (and the CPU) while the tab is hidden.
    const onVisible = () => {
      if (!ctx) return
      if (document.hidden) ctx.suspend()
      else ctx.resume()
    }

    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      closed = true
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
      clearInterval(carTimer)
      ctx?.close()
    }
  }, [map, credits])
}
