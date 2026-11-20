import type { Dict } from './dict'

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

/** The meaning popup for a tapped word. */
export function WordPopup({ pick, dict, onClose }: { pick: WordPick; dict: Dict; onClose: () => void }) {
  const w = dict.words[pick.key]
  if (!w) return null
  return (
    <div className="word-popup" style={{ left: pick.x, top: pick.y }} onClick={onClose}>
      <div className="word-popup-head">
        {pick.key}
        {w.r !== pick.key && <span>{w.r}</span>}
      </div>
      <ol>
        {w.g.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      <div className="word-popup-src">JMdict</div>
    </div>
  )
}
