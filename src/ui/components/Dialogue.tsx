import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Furigana, parseFurigana, type JaSegment } from './Furigana'

/** Speaker name colors, one per person in a conversation. */
export const SPEAKER_COLORS = ['var(--color-sora)', 'var(--color-sakura)', 'var(--color-matcha)', 'var(--color-kin)']

/** Reveal `segs` a character at a time. Returns the visible prefix. */
function useTypewriter(segs: JaSegment[], cps: number, key: string) {
  const total = segs.reduce((n, s) => n + [...s[0]].length, 0)
  const [shown, setShown] = useState(cps > 0 ? 0 : total)
  useEffect(() => {
    if (cps <= 0) return setShown(total)
    setShown(0)
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const n = Math.min(total, Math.floor(((performance.now() - t0) / 1000) * cps))
      setShown(n)
      if (n < total) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, cps, total])
  const done = shown >= total
  let left = shown
  const visible: JaSegment[] = []
  for (const s of segs) {
    if (left <= 0) break
    const chars = [...s[0]]
    if (chars.length <= left) visible.push(s)
    else visible.push([chars.slice(0, left).join('')]) // half-typed word: no ruby yet
    left -= chars.length
  }
  return { visible, done, skip: () => setShown(total) }
}

/**
 * The main dialogue / subtitle box. Speaker nameplate, Japanese line with
 * furigana, optional English under it, typewriter reveal and a blinking ▼
 * when there is more.
 *
 * mode "talk": you are in the conversation (solid box at the bottom).
 * mode "overhear": eavesdropping; translucent, can fade with distance.
 */
export function DialogueBox({
  speaker,
  speakerIndex = 0,
  text,
  english,
  showEnglish = true,
  furigana = true,
  mode = 'talk',
  place,
  clarity = 1,
  typeSpeed = 30,
  more = true,
  onWord,
  onNext,
  className,
  actions,
}: {
  speaker?: ReactNode
  speakerIndex?: number
  text: string | JaSegment[]
  english?: ReactNode
  showEnglish?: boolean
  furigana?: boolean
  mode?: 'talk' | 'overhear'
  /** Where the conversation is, shown in overhear mode. */
  place?: ReactNode
  /** 0..1: how well you can hear them. Below 0.1 the words are lost. */
  clarity?: number
  /** Characters per second; 0 shows the line at once. */
  typeSpeed?: number
  more?: boolean
  onWord?: (key: string, el: HTMLElement) => void
  onNext?: () => void
  className?: string
  /** Extra buttons in the header (EN toggle...). */
  actions?: ReactNode
}) {
  const segs = typeof text === 'string' ? parseFurigana(text) : text
  const key = segs.map((s) => s[0]).join('')
  const { visible, done, skip } = useTypewriter(segs, typeSpeed, key)
  const faint = clarity < 0.1
  const overhear = mode === 'overhear'
  return (
    <div className={cn('relative drop-hard', className)} style={{ opacity: overhear ? 0.55 + 0.45 * clarity : 1 }}>
            {speaker && !overhear && !faint && (
              <div
                className="corner-sm absolute -top-3 left-4 z-10 px-2.5 py-0.5 font-pixel text-[0.9em] text-sumi drop-hard-sm"
                style={{ background: SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length] }}
              >
                {speaker}
              </div>
            )}
      <div
        className={cn('corner relative px-5 pt-3 pb-4', overhear ? 'bg-ink/80 [box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--color-paper)_30%,transparent)]' : 'bg-ink frame')}
        onClick={() => (done ? onNext?.() : skip())}
        role={onNext ? 'button' : undefined}
      >
        {(overhear || actions) && (
          <div className="mb-2 flex items-center gap-2 text-[0.8em] text-paper-dim">
            {overhear && (
              <>
                <span className="rounded-full bg-sora px-2 text-sumi">👂 立ち聞き</span>
                {place}
              </>
            )}
            <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
              {actions}
            </span>
          </div>
        )}
        {faint ? (
          <p className="text-paper-dim italic">Two people are talking. Walk closer to make out what they say.</p>
        ) : (
          <>
            {speaker && overhear && (
              <span className="mr-2 font-pixel text-[0.9em]" style={{ color: SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length] }}>
                {speaker}：
              </span>
            )}
            <p className={cn('text-[1.35em] leading-[1.9]', speaker && !overhear && 'mt-2', overhear && 'text-[1.2em]')}>
              <Furigana text={visible} furigana={furigana} onWord={done ? onWord : undefined} />
              {!done && <span className="animate-blink">▌</span>}
            </p>
            {showEnglish && english && done && <p className="mt-1 border-l-4 border-kin/60 pl-2 text-[0.85em] text-paper-dim">{english}</p>}
          </>
        )}
        {done && more && onNext && <span className="absolute right-4 bottom-1 animate-blink text-gold">▼</span>}
      </div>
    </div>
  )
}

/** A short culture / language note shown after a conversation ends. */
export function NoteBox({ children, english, className }: { children: ReactNode; english?: ReactNode; className?: string }) {
  return (
    <div className={cn('drop-hard', className)}>
      <div className="corner bg-kin px-4 py-3 text-sumi [&_rt]:text-sumi/60">
        <span className="mr-2 font-arcade text-[0.6em]">TIP</span>
        {children}
        {english && <p className="mt-1 text-[0.85em] opacity-75">{english}</p>}
      </div>
    </div>
  )
}
