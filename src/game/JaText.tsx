import { hudScale } from './hud'
import { useEffect, useState } from 'react'
import { loadKanji, type Dict, type Kanji } from './dict'

export interface WordPick {
  key: string
  surface: string
  x: number
  y: number
}

/** Japanese text with optional furigana; words in the dictionary can be
 *  tapped for their meaning. Falls back to plain text. */
export function JaText({
  text,
  dict,
  furigana,
  onWord,
}: {
  text: string
  dict: Dict | null
  furigana: boolean
  onWord: (w: WordPick) => void
}) {
  const segs = dict?.texts[text]
  if (!segs) return <span className="ja">{text}</span>
  return (
    <span className="ja">
      {segs.map(([surface, key, reading], i) => {
        const body = furigana && reading ? (
          <ruby>
            {surface}
            <rt>{reading}</rt>
          </ruby>
        ) : (
          surface
        )
        if (!key || !dict?.words[key]) return <span key={i}>{body}</span>
        return (
          <span
            key={i}
            className="ja-word"
            onClick={(e) => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onWord({ key, surface, x: r.left + r.width / 2, y: r.top })
            }}
          >
            {body}
          </span>
        )
      })}
    </span>
  )
}

const JLPT_COLORS: Record<number, string> = { 5: '#2f855a', 4: '#2b6cb0', 3: '#b7791f', 2: '#c05621', 1: '#9b2c2c' }
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
    loadKanji('roppongi').then((k) => live && setKanji(k))
    return () => {
      live = false
    }
  }, [])
  if (!w) return null
  const chars = [...new Set([...pick.key].filter((c) => /[一-鿿]/.test(c)))]
  // Open below the word when it's in the top half of the screen.
  // The popup sits in the scaled HUD layer, so work in its units.
  const px = pick.x / hudScale
  const py = pick.y / hudScale
  const below = py < (window.innerHeight / hudScale) * 0.5
  const left = Math.min(Math.max(px, 170), window.innerWidth / hudScale - 170)
  return (
    <div
      className={`word-popup ${below ? 'below' : ''}`}
      style={{ left, top: below ? py + 28 : py }}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="word-popup-head">
        {pick.key}
        {w.r !== pick.key && <span>{w.r}</span>}
        {w.n && (
          <span className="word-jlpt" style={{ background: JLPT_COLORS[w.n] }} title={`On the JLPT N${w.n} word list`}>
            N{w.n}
          </span>
        )}
      </div>
      <ol>
        {w.g.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      {w.ex && (
        <div className="word-example" onClick={(e) => e.stopPropagation()}>
          <div className="word-example-ja">
            <JaText text={w.ex[0]} dict={dict} furigana={furigana} onWord={onWord} />
          </div>
          <div className="word-example-en">{w.ex[1]}</div>
        </div>
      )}
      {chars.length > 0 && kanji && (
        <div className="word-kanji">
          {chars.map((c) => (
            <KanjiCard key={`${pick.key}-${c}`} char={c} k={kanji[c]} />
          ))}
        </div>
      )}
      <div className="word-popup-src">
        JMdict
        {w.ex?.[2] && (
          <>
            {' · '}
            <a href={`https://tatoeba.org/en/sentences/show/${w.ex[2]}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              Tatoeba
            </a>
          </>
        )}
        {w.n && ' · JLPT list: J. Waller'}
        {chars.length > 0 && ' · KANJIDIC2 · KanjiVG'}
      </div>
    </div>
  )
}

/** One kanji: its strokes drawn in order, then meanings and readings. */
function KanjiCard({ char, k }: { char: string; k?: Kanji }) {
  // Redraw the strokes when the card is tapped.
  const [run, setRun] = useState(0)
  return (
    <div
      className="kanji-card"
      onClick={(e) => {
        e.stopPropagation()
        setRun((r) => r + 1)
      }}
    >
      {k?.p ? (
        <svg key={run} className="kanji-strokes" viewBox="0 0 109 109" aria-label={char}>
          {k.p.map((d, i) => (
            <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * 0.35}s` }} />
          ))}
        </svg>
      ) : (
        <div className="kanji-glyph">{char}</div>
      )}
      <div className="kanji-info">
        {k?.m && <div className="kanji-meaning">{k.m.slice(0, 3).join(', ')}</div>}
        {k?.on && k.on.length > 0 && <div>音 {k.on.join('、')}</div>}
        {k?.kun && k.kun.length > 0 && <div>訓 {k.kun.join('、')}</div>}
        {k?.s && (
          <div className="kanji-meta">
            {k.s} strokes{k.gr ? ` · ${GRADES[k.gr] ?? `grade ${k.gr}`}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
