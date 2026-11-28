// The player's voice in, the NPC's voice out, both in the browser.
//
// In: the Web Speech API (SpeechRecognition, lang ja-JP). Free and built in:
// Chrome and Edge send the audio to their maker's speech service, Safari
// recognises on the device. Firefox has none, so there the player types.
// Out: speechSynthesis with a Japanese system voice, pitched by who is
// talking. Scripted scenes keep their VOICEVOX clips; live lines can't be
// voiced ahead of time, and VOICEVOX would need an engine running on a
// server for that.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LifePerson } from './life'

/** The bits of SpeechRecognition used here (not in TS's DOM types yet). */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

const Ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canListen = () => typeof window !== 'undefined' && !!Ctor()

const ERRORS: Record<string, string> = {
  'not-allowed': 'The microphone is blocked. Allow it in the address bar, then try again.',
  'service-not-allowed': 'This browser won’t do speech recognition here. Type instead.',
  'no-speech': 'Didn’t hear anything. Try again a little closer to the mic.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs the internet (the browser sends the audio to its speech service).',
}

/**
 * Listen for one Japanese sentence. `start()` opens the mic; it stops by
 * itself after a pause, or on `stop()` (let go of V). `heard` gets the
 * final words.
 */
export function useListen(heard: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const got = useRef('')
  const mid = useRef('')
  const heardRef = useRef(heard)
  heardRef.current = heard

  const start = useCallback(() => {
    const C = Ctor()
    if (!C || rec.current) return
    const r = new C()
    r.lang = 'ja-JP'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    got.current = ''
    mid.current = ''
    r.onresult = (e) => {
      let fin = ''
      let now = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) fin += res[0].transcript
        else now += res[0].transcript
      }
      got.current = fin || got.current
      mid.current = fin + now
      setInterim(fin + now)
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? `Speech recognition failed (${e.error}).`)
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
      setInterim('')
      const text = (got.current || mid.current).trim()
      if (text) heardRef.current(text)
    }
    rec.current = r
    setError(null)
    setInterim('')
    setListening(true)
    try {
      r.start()
    } catch {
      rec.current = null
      setListening(false)
    }
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])
  useEffect(() => () => rec.current?.abort(), [])
  return { supported: canListen(), listening, interim, error, start, stop }
}

let jaVoice: SpeechSynthesisVoice | null | undefined
const pickVoice = () => {
  if (jaVoice) return jaVoice
  const all = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('ja'))
  // Prefer the nicer network / enhanced voices where the system has them.
  jaVoice = all.find((v) => /google|natural|enhanced|premium|kyoko|o-ren/i.test(v.name)) ?? all[0] ?? null
  return jaVoice
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => (jaVoice = undefined))

/** Say a line out loud in a voice that roughly fits the person. */
export function speak(text: string, p: LifePerson | null, onEnd?: () => void) {
  if (typeof speechSynthesis === 'undefined') return onEnd?.()
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  const v = pickVoice()
  if (v) u.voice = v
  // One system voice for everyone, so pitch and pace tell people apart.
  const female = p?.gender?.startsWith('f')
  const age = p?.age ?? 35
  u.pitch = Math.min(2, Math.max(0.1, (female ? 1.25 : 0.75) + (age < 25 ? 0.15 : age > 60 ? -0.15 : 0)))
  u.rate = age > 60 ? 0.9 : age < 25 ? 1.1 : 1
  if (onEnd) {
    u.onend = () => onEnd()
    u.onerror = () => onEnd()
  }
  speechSynthesis.speak(u)
}

export const hush = () => {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
