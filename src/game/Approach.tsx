import { useEffect, useState } from 'react'
import { ChoiceList, DialogueBox, Kbd, cn } from '../ui'
import type { Dict } from './dict'
import { inputLock } from './input'
import { jaSegments, pickWord, type WordPick } from './JaText'
import { lifeLive, type Approachable, type ApproachLine, type LifePerson } from './life'

// Walking up to someone: a "Join the conversation" prompt (Space, or tap
// it), then they greet you and you pick what to say from a few replies.
// They stop (and their group with them) while you talk, and carry on with
// their day after. Their lines come from the person's approach profile,
// written with the rest of their day (scripts/life/write-life.mjs).

type Step = 'greet' | 'recommend' | 'directions' | 'topic' | 'bye'

/** What the player can say, with the kind of answer each gets. */
const REPLIES: { step: Step; ja: string; en: string }[] = [
  { step: 'recommend', ja: 'このへんで、おすすめはありますか？', en: 'Anything around here you’d recommend?' },
  { step: 'directions', ja: 'すみません、道を教えてもらえますか？', en: 'Excuse me, could you tell me the way?' },
  { step: 'topic', ja: '最近どうですか？', en: 'How have you been?' },
  { step: 'bye', ja: 'ありがとうございました！', en: 'Thank you! (say goodbye)' },
]

interface Chat {
  person: LifePerson
  group: LifePerson[]
  step: Step
  line: ApproachLine
  /** How many times they've answered, to vary the lines. */
  turn: number
}

const lineFor = (p: LifePerson, step: Step, turn: number): ApproachLine => {
  const bank = p.approach?.lines[step] ?? []
  return bank[turn % Math.max(1, bank.length)] ?? { ja: 'こんにちは。', en: 'Hello.' }
}

export function Approach({
  near,
  dict,
  furigana,
  english,
  onWord,
  onChat,
}: {
  near: Approachable | null
  dict: Dict | null
  furigana: boolean
  english: boolean
  onWord: (w: WordPick) => void
  /** Called with true when a chat starts and false when it ends. */
  onChat: (on: boolean) => void
}) {
  const [chat, setChat] = useState<Chat | null>(null)

  const start = () => {
    if (!near || chat) return
    const turn = Math.floor(Math.random() * 3)
    setChat({ person: near.person, group: near.group, step: 'greet', line: lineFor(near.person, 'greet', turn), turn })
  }
  const end = () => setChat(null)

  // Space to join, Escape to leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!chat && near && e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        start()
      } else if (chat && (e.key === 'Escape' || (chat.step === 'bye' && (e.code === 'Space' || e.key === 'Enter')))) {
        e.preventDefault()
        end()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // While talking: they stand still facing you, you stand still, and the
  // one answering gestures.
  useEffect(() => {
    if (!chat) return
    const ids = chat.group.map((p) => p.id)
    for (const id of ids) lifeLive.paused.add(id)
    inputLock.on = true
    onChat(true)
    return () => {
      for (const id of ids) lifeLive.paused.delete(id)
      inputLock.on = false
      if (lifeLive.speaking?.outing === 'player') lifeLive.speaking = null
      onChat(false)
    }
  }, [chat?.person.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (chat) lifeLive.speaking = { outing: 'player', person: chat.person.id }
  }, [chat])

  if (!chat) {
    if (!near) return null
    const p = near.person
    const group = near.group.length > 1
    return (
      <button
        type="button"
        onClick={start}
        className="corner pointer-events-auto flex items-center gap-3 bg-ink/90 px-4 py-2 text-left text-paper frame drop-hard-sm"
      >
        <Kbd className="text-[0.8em]">Space</Kbd>
        <span className="flex flex-col leading-tight">
          <span className="text-[1.05em]">{group ? '会話に入る' : '話しかける'}</span>
          <span className="text-[0.8em] text-paper-dim">
            {group ? `Join the conversation · ${near.group.map((g) => g.name).join('、')}` : `Talk to ${p.family}${p.name} · ${p.age}, ${p.occupation}`}
          </span>
        </span>
      </button>
    )
  }

  const p = chat.person
  const bye = chat.step === 'bye'
  const choose = (i: number) => {
    const r = REPLIES[i]
    const turn = chat.turn + 1
    setChat({ ...chat, step: r.step, line: lineFor(p, r.step, turn), turn })
  }
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      <DialogueBox
        className="w-full"
        mode="talk"
        speaker={`${p.family}${p.name}`}
        speakerIndex={1}
        text={jaSegments(chat.line.ja, dict)}
        english={chat.line.en}
        showEnglish={english}
        furigana={furigana}
        typeSpeed={28}
        more={bye}
        onNext={bye ? end : undefined}
        onWord={pickWord(onWord)}
      />
      {!bye && (
        <ChoiceList
          key={`${chat.step}:${chat.turn}`}
          autoFocus
          numbered
          className={cn('corner bg-ink/95 p-2 frame')}
          items={REPLIES.map((r) => ({ label: r.ja, hint: english ? r.en : undefined }))}
          onChoose={choose}
        />
      )}
    </div>
  )
}
