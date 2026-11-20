// Background sound: a street bed that follows the crowd, night air, rain,
// birds (and cicadas in summer) near parks, and the crossing chimes near
// pedestrian crossings. Recordings come from Freesound (see
// scripts/fetch-sounds.mjs); any that are missing are simply silent.
import { useEffect, useRef, useState } from 'react'
import { crowdLevel } from './Crowd'
import { cellAt, type GameMap } from './map'
import { T } from './tiles'

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
    if (!map || !have.length) return
    const m = map
    const crossings: number[] = []
    for (const p of m.paths)
      if (p.t === 'crossing')
        for (let i = 0; i < p.p.length; i += 2) crossings.push(p.p[i], p.p[i + 1])

    let ctx: AudioContext | null = null
    let master: GainNode | null = null
    const gains: Partial<Record<Kind, GainNode>> = {}
    let timer = 0
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

    const update = () => {
      if (!ctx || !master) return
      const { focus, hour, month, night, rain, muted } = live.current
      const { x, y } = focus.current
      const day = 1 - night
      const crowd = crowdLevel(hour)
      const green = greenAround(m, x, y)
      let near = Infinity
      for (let i = 0; i < crossings.length; i += 2) near = Math.min(near, Math.hypot(crossings[i] - x, crossings[i + 1] - y))
      const wet = Math.min(1, rain)
      const hasNight = !!gains.night
      const target: Record<Kind, number> = {
        // The street bed carries the night too when there's no night recording.
        city: (0.15 + 0.45 * crowd) * (1 - 0.6 * green) * (hasNight ? 1 - 0.7 * night : 1) * (1 - 0.4 * wet),
        night: (0.2 + 0.35 * crowd) * night * (1 - 0.5 * green) * (1 - 0.4 * wet),
        crossing: Math.max(0, 1 - near / 30) * 0.45 * (0.3 + 0.7 * day),
        rain: wet * 0.7,
        birds: Math.min(1, green * 2) * 0.55 * day * (1 - 0.7 * wet) * (month >= 11 || month <= 2 ? 0.6 : 1),
        cicadas: month >= 7 && month <= 9 ? Math.min(1, green * 2 + 0.15) * 0.5 * day * (1 - wet) : 0,
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
      ctx?.close()
    }
  }, [map, credits])
}
