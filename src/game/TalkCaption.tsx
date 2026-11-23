import { DialogueBox, NoteBox, Toggle } from '../ui'
import { JaText, jaSegments, pickWord, type WordPick } from './JaText'
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
  const en = (
    <Toggle size="sm" className="h-7 px-2.5" pressed={english} onPressedChange={onEnglish} title="English under each line (T)" aria-label="English">
      EN
    </Toggle>
  )
  if (!l)
    return (
      <NoteBox className="pointer-events-auto w-full" english={english ? conv.summary : undefined}>
        {conv.note}
      </NoteBox>
    )
  return (
    <DialogueBox
      className="pointer-events-auto w-full"
      mode="overhear"
      place={
        <span className="min-w-0 truncate">
          {spot.name} · {conv.title}
        </span>
      }
      actions={en}
      speaker={speaker && <JaText text={speaker.name} dict={dict} furigana={furigana} onWord={onWord} />}
      speakerIndex={l.s}
      text={jaSegments(l.ja, dict)}
      english={l.en}
      showEnglish={english}
      furigana={furigana}
      clarity={clear}
      typeSpeed={24}
      more={false}
      onWord={pickWord(onWord)}
    />
  )
}
