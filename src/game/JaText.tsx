import { useEffect, useState } from 'react'
import { Furigana, WordCard, type JaSegment } from '../ui'
import { AREA_ID } from './area'
import { loadKanji, type Dict, type Kanji } from './dict'
import { hudScale } from './hud'

export interface WordPick {
  key: string
  surface: string
  x: number
  y: number
}

/** A text from the map split into the UI kit's segments: furigana for each
 *  word, and a key only for words that have a word card. Plain text when
 *  the dictionary doesn't know it. */
export function jaSegments(text: string, dict: Dict | null): JaSegment[] {
  const segs = dict?.texts[text]
  if (!segs) return [[text]]
  return segs.map(([surface, key, reading]) => [surface, reading, key && dict.words[key] ? key : undefined])
}

/** Turns the UI kit's (key, element) into the game's WordPick. */
export function pickWord(onWord: (w: WordPick) => void) {
  return (key: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    onWord({ key, surface: el.textContent ?? key, x: r.left + r.width / 2, y: r.top })
  }
}

/** Japanese text with optional furigana; words in the dictionary can be
 *  tapped for their word card. Falls back to plain text. */
export function JaText({
  text,
  dict,
  furigana,
  onWord,
  className,
}: {
  text: string
  dict: Dict | null
  furigana: boolean
  onWord: (w: WordPick) => void
  className?: string
}) {
  return <Furigana text={jaSegments(text, dict)} furigana={furigana} onWord={pickWord(onWord)} className={className} />
}

const GRADES: Record<number, string> = { 8: 'secondary school', 9: 'name kanji', 10: 'name kanji' }

/** The word card for a tapped word: reading, meanings, JLPT level, an
 *  example sentence (itself tappable) and each kanji with its stroke order. */
export function WordPopup({
  pick,
  dict,
  furigana,
  onWord,
  onClose,
}: {
  pick: WordPick
  dict: Dict
  furigana: boolean
  onWord: (w: WordPick) => void
  onClose: () => void
}) {
  const w = dict.words[pick.key]
  const [kanji, setKanji] = useState<Record<string, Kanji> | null>(null)
  useEffect(() => {
    let live = true
    loadKanji(AREA_ID).then((k) => live && setKanji(k))
    return () => {
      live = false
    }
  }, [])
  if (!w) return null
  const chars = [...new Set([...pick.key].filter((c) => /[一-鿿]/.test(c)))]
  // Open below the word when it's in the top half of the screen. The card
  // sits in the scaled HUD layer, so work in its units.
  const px = pick.x / hudScale
  const py = pick.y / hudScale
  const hudW = window.innerWidth / hudScale
  const hudH = window.innerHeight / hudScale
  const below = py < hudH * 0.5
  const half = Math.min(184, hudW / 2 - 12)
  const left = Math.min(Math.max(px, half + 12), hudW - half - 12)
  return (
    <div
      className="hud-scroll pointer-events-auto absolute z-10 overflow-y-auto rounded-[12px]"
      style={{
        left,
        width: half * 2,
        transform: `translate(-50%, ${below ? '0' : '-100%'})`,
        top: below ? py + 28 : py - 8,
        maxHeight: (below ? hudH - py - 28 : py - 8) - 12,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <WordCard
        className="w-full"
        word={pick.key}
        reading={w.r !== pick.key ? w.r : undefined}
        meanings={w.g}
        jlpt={w.n as 1 | 2 | 3 | 4 | 5 | undefined}
        kanji={
          kanji
            ? chars.map((c) => {
                const k = kanji[c]
                return {
                  char: c,
                  meanings: k?.m?.slice(0, 3) ?? [],
                  on: k?.on,
                  kun: k?.kun,
                  strokes: k?.s,
                  glyph: <KanjiStrokes key={`${pick.key}-${c}`} char={c} k={k} />,
                }
              })
            : []
        }
        example={w.ex ? jaSegments(w.ex[0], dict) : undefined}
        exampleEn={w.ex?.[1]}
        furigana={furigana}
        onWord={pickWord(onWord)}
        onClose={onClose}
        footer={
          <>
            JMdict
            {w.ex?.[2] && (
              <>
                {' · '}
                <a href={`https://tatoeba.org/en/sentences/show/${w.ex[2]}`} target="_blank" rel="noreferrer" className="underline">
                  Tatoeba
                </a>
              </>
            )}
            {w.n && ' · JLPT list: J. Waller'}
            {chars.length > 0 && ' · KANJIDIC2 · KanjiVG'}
            {chars.some((c) => kanji?.[c]?.gr) && ` · ${chars.map((c) => kanji?.[c]?.gr && `${c}: ${GRADES[kanji[c].gr!] ?? `grade ${kanji[c].gr}`}`).filter(Boolean).join(', ')}`}
          </>
        }
      />
    </div>
  )
}

/** One kanji drawn stroke by stroke on squared practice paper. Tap to
 *  draw it again. */
function KanjiStrokes({ char, k }: { char: string; k?: Kanji }) {
  const [run, setRun] = useState(0)
  const box =
    'grid size-14 shrink-0 place-items-center rounded-md bg-paper [box-shadow:inset_0_0_0_1.5px_var(--color-ink)] [background-image:linear-gradient(rgb(232_67_46/0.25)_1px,transparent_1px),linear-gradient(90deg,rgb(232_67_46/0.25)_1px,transparent_1px)] [background-position:center] [background-size:50%_50%]'
  if (!k?.p) return <span className={`${box} text-4xl`}>{char}</span>
  return (
    <button type="button" className={box} onClick={() => setRun((r) => r + 1)} aria-label={`${char}: draw again`} title="Tap to draw again">
      <svg key={run} className="kanji-strokes size-full" viewBox="0 0 109 109" aria-hidden>
        {k.p.map((d, i) => (
          <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </svg>
    </button>
  )
}
