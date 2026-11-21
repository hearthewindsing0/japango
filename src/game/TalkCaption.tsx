import { JaText, type WordPick } from './JaText'
import type { Dict } from './dict'
import type { Caption } from './talk'

/** Subtitles for the people talking nearby: who is speaking and what they
 *  say, with furigana and word cards. Fades out as you walk away; once the
 *  conversation ends, a short note on its language or culture. */
export function TalkCaption({
  caption,
  dict,
  furigana,
  english,
  onWord,
  onEnglish,
}: {
  caption: Caption
  dict: Dict | null
  furigana: boolean
  english: boolean
  onWord: (w: WordPick) => void
  onEnglish: () => void
}) {
  const { conv, spot, line, clear } = caption
  const l = line >= 0 ? conv.lines[line] : null
  const speaker = l ? conv.speakers[l.s] : null
  return (
    <div className="hud-talk" style={{ opacity: 0.55 + 0.45 * clear }} onClick={(e) => e.stopPropagation()}>
      <div className="hud-talk-head">
        <span>👂 立ち聞き</span> {spot.name} · {conv.title}
        <button className={`hud-talk-en ${english ? 'on' : ''}`} onClick={onEnglish} title="English under each line (T)" aria-pressed={english}>
          EN
        </button>
      </div>
      {l && speaker && clear > 0.05 && (
        <div className={`hud-talk-line s${l.s}`}>
          <span className="hud-talk-name">
            <JaText text={speaker.name} dict={dict} furigana={furigana} onWord={onWord} />
          </span>
          <span className="hud-talk-ja">
            <JaText text={l.ja} dict={dict} furigana={furigana} onWord={onWord} />
          </span>
          {english && <div className="hud-talk-tr">{l.en}</div>}
        </div>
      )}
      {l && clear <= 0.05 && <div className="hud-talk-far">Two people are talking. Walk closer to make out what they say.</div>}
      {!l && (
        <div className="hud-talk-note">
          💡 {conv.note}
          {english && <div className="hud-talk-tr">{conv.summary}</div>}
        </div>
      )}
    </div>
  )
}
