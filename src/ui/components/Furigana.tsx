import { cn } from '../lib/cn'

/** One piece of Japanese text: what is written, its reading, and an optional
 *  dictionary key that makes it tappable. Same shape as the game's dict. */
export type JaSegment = [surface: string, reading?: string, key?: string]

/**
 * Parse the handy bracket notation used in stories and hand-written
 * content: "六本木[ろっぽんぎ]で待[ま]ってる". A word followed by [reading]
 * gets furigana and becomes tappable; everything else is plain.
 */
export function parseFurigana(text: string): JaSegment[] {
  const out: JaSegment[] = []
  const re = /([^\s[\]]+?)\[([^\]]+)\]/g
  let last = 0
  for (let m; (m = re.exec(text)); ) {
    // Only the kanji run right before the bracket gets the reading.
    const before = text.slice(last, m.index) + m[1]
    const k = before.match(/[\p{Script=Han}々〆ヶ]+$/u)
    const base = k ? k[0] : m[1]
    const plain = before.slice(0, before.length - base.length)
    if (plain) out.push([plain])
    out.push([base, m[2], base])
    last = re.lastIndex
  }
  if (last < text.length) out.push([text.slice(last)])
  return out
}

/**
 * Japanese text with optional furigana over the kanji. Words with a key
 * are underlined with dots and call `onWord` when tapped (to open a
 * WordCard).
 */
export function Furigana({
  text,
  furigana = true,
  onWord,
  className,
}: {
  text: string | JaSegment[]
  furigana?: boolean
  onWord?: (key: string, el: HTMLElement) => void
  className?: string
}) {
  const segs = typeof text === 'string' ? parseFurigana(text) : text
  return (
    <span className={cn('ja', className)} lang="ja">
      {segs.map(([surface, reading, key], i) => {
        const body =
          furigana && reading ? (
            <ruby>
              {surface}
              <rt>{reading}</rt>
            </ruby>
          ) : (
            surface
          )
        if (!key || !onWord) return <span key={i}>{body}</span>
        return (
          <button
            key={i}
            type="button"
            className="rounded-sm underline decoration-current/35 decoration-1 underline-offset-[5px] hover:bg-kin hover:text-sumi hover:decoration-transparent"
            onClick={(e) => {
              e.stopPropagation()
              onWord(key, e.currentTarget)
            }}
          >
            {body}
          </button>
        )
      })}
    </span>
  )
}
