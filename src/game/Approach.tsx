import { useEffect, useRef, useState } from 'react'
import { Button, ChoiceList, DialogueBox, Furigana, Kbd, cn } from '../ui'
import { loadAi, npcReply, type AiSettings, type Turn } from './ai'
import type { Dict } from './dict'
import { inputLock } from './input'
import { NOT_CAUGHT, matchIntent } from './intent'
import { jaSegments, pickWord, type WordPick } from './JaText'
import { lifeLive, type Approachable, type ApproachLine, type LifePerson } from './life'
import { hush, speak, useListen } from './speech'

// Walking up to someone: a "Join the conversation" prompt (Space, or tap
// it), then they greet you and you talk back. Say it out loud (hold V, or
// the mic button), type it, or pick one of a few stock replies. They stop
// (and their group with them) while you talk, and carry on after.
//
// With the player's own AI connected (ai.ts) they answer whatever you say,
// in character. Without it, what you say is matched to the nearest stock
// reply and they answer with their scripted line (intent.ts), so it's free.

/** Fired to start talking to whoever is near, e.g. from the bubble over
 *  their head. */
export const TALK_EVENT = 'japango:talk'

type Step = 'greet' | 'recommend' | 'directions' | 'topic' | 'bye' | 'live' | 'again'

/** Stock replies, with the kind of answer each gets. */
const REPLIES: { step: Step; ja: string; en: string }[] = [
  { step: 'recommend', ja: 'このへんで、おすすめはありますか？', en: 'Anything around here you’d recommend?' },
  { step: 'directions', ja: 'すみません、道を教えてもらえますか？', en: 'Excuse me, could you tell me the way?' },
  { step: 'topic', ja: '最近どうですか？', en: 'How have you been?' },
  { step: 'bye', ja: 'ありがとうございました！', en: 'Thank you! (say goodbye)' },
]

/** What the player said last, as heard, with the AI's reading of it. */
interface Heard {
  ja: string
  en?: string
  tip?: string
  /** Free mode: which stock reply it was taken as. */
  as?: string
}

interface Chat {
  person: LifePerson
  group: LifePerson[]
  step: Step
  line: ApproachLine
  /** How many times they've answered, to vary the lines. */
  turn: number
  log: Turn[]
  heard: Heard | null
  thinking: boolean
  error: string | null
}

const lineFor = (p: LifePerson, step: Step, turn: number): ApproachLine => {
  if (step === 'again' || step === 'live') return NOT_CAUGHT[turn % NOT_CAUGHT.length]
  const bank = p.approach?.lines[step] ?? []
  return bank[turn % Math.max(1, bank.length)] ?? { ja: 'こんにちは。', en: 'Hello.' }
}

const AS: Record<string, string> = {
  recommend: 'asking for a recommendation',
  directions: 'asking the way',
  topic: 'asking how they are',
  bye: 'saying goodbye',
  greet: 'saying hello',
}

export function Approach({
  near,
  dict,
  furigana,
  english,
  muted,
  place,
  onWord,
  onChat,
  onAiSettings,
}: {
  near: Approachable | null
  dict: Dict | null
  furigana: boolean
  english: boolean
  /** Sound off: no voices either. */
  muted: boolean
  /** Where and when, for the AI: e.g. "Roppongi", "9:40 pm, light rain". */
  place: { where: string; time: string }
  onWord: (w: WordPick) => void
  /** Called with true when a chat starts and false when it ends. */
  onChat: (on: boolean) => void
  /** Open the AI settings window. */
  onAiSettings: () => void
}) {
  const [chat, setChat] = useState<Chat | null>(null)
  const chatRef = useRef(chat)
  chatRef.current = chat
  const [ai, setAi] = useState<AiSettings | null>(loadAi)
  useEffect(() => {
    const on = () => setAi(loadAi())
    window.addEventListener('japango:ai', on)
    return () => window.removeEventListener('japango:ai', on)
  }, [])
  const [typed, setTyped] = useState('')

  const start = () => {
    if (!near || chat) return
    const turn = Math.floor(Math.random() * 3)
    const line = lineFor(near.person, 'greet', turn)
    setChat({ person: near.person, group: near.group, step: 'greet', line, turn, log: [{ who: 'npc', ja: line.ja }], heard: null, thinking: false, error: null })
  }
  const end = () => {
    hush()
    setChat(null)
  }

  /** The player says something: out loud, typed, or a stock reply. */
  const say = async (ja: string, stock?: Step) => {
    const c = chatRef.current
    if (!c || c.thinking || !ja.trim()) return
    const log: Turn[] = [...c.log, { who: 'player', ja }]
    const turn = c.turn + 1
    if (ai) {
      setChat({ ...c, log, heard: { ja }, thinking: true, error: null })
      try {
        const r = await npcReply(ai, c.person, c.group, log, { place: place.where, time: place.time })
        setChat((now) =>
          now && now.person.id === c.person.id
            ? { ...now, step: r.end ? 'bye' : 'live', line: { ja: r.ja, en: r.en }, turn, log: [...log, { who: 'npc', ja: r.ja }], heard: { ja, en: r.heardEn, tip: r.tip }, thinking: false }
            : now,
        )
      } catch (e) {
        setChat((now) => (now ? { ...now, thinking: false, error: e instanceof Error ? e.message : String(e) } : now))
      }
      return
    }
    const intent = stock ?? matchIntent(ja)
    const step: Step = intent ?? 'again'
    const line = lineFor(c.person, step, turn)
    setChat({ ...c, step, line, turn, log: [...log, { who: 'npc', ja: line.ja }], heard: { ja, as: stock ? undefined : intent ? AS[intent] : undefined }, error: null })
  }

  const mic = useListen((text) => void say(text))

  // Space to join, Escape to leave, hold V to speak.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (!chat && near && e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        start()
      } else if (chat && (e.key === 'Escape' || (chat.step === 'bye' && (e.code === 'Space' || e.key === 'Enter')))) {
        e.preventDefault()
        end()
      } else if (chat && chat.step !== 'bye' && e.code === 'KeyV' && !e.repeat) {
        e.preventDefault()
        hush()
        mic.start()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (chat && e.code === 'KeyV' && mic.listening) mic.stop()
    }
    // Tapping the bubble over their head (ApproachMarker.tsx).
    const onTalk = () => start()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener(TALK_EVENT, onTalk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener(TALK_EVENT, onTalk)
    }
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

  // They say each line out loud.
  const said = chat && !chat.thinking ? chat.line.ja : null
  useEffect(() => {
    if (said && !muted && chatRef.current) speak(said, chatRef.current.person)
  }, [said, muted])
  useEffect(() => hush, [])

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
  const choose = (i: number) => void say(REPLIES[i].ja, REPLIES[i].step)
  const send = () => {
    const t = typed.trim()
    if (!t) return
    setTyped('')
    void say(t)
  }
  const h = chat.heard
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      {/* What you said, as the game heard it. */}
      {(h || mic.listening) && (
        <div className="corner-sm self-end max-w-[90%] bg-paper px-3 py-1.5 text-ink drop-hard-sm [&_rt]:text-ink/60">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-pixel text-[0.75em] text-shu">{mic.listening ? '🎤 …' : 'あなた'}</span>
            <span className="text-[1.1em] leading-[1.8]">
              {mic.listening ? (
                mic.interim || <span className="text-ink/50">聞いています… Listening</span>
              ) : (
                <Furigana text={jaSegments(h!.ja, dict)} furigana={furigana} onWord={pickWord(onWord)} />
              )}
            </span>
          </div>
          {!mic.listening && h?.en && english && <p className="text-[0.85em] text-ink/70">“{h.en}”</p>}
          {!mic.listening && h?.as && <p className="text-[0.8em] text-ink/60">Heard as {h.as}.</p>}
          {!mic.listening && h?.tip && <p className="mt-0.5 border-l-4 border-kin pl-2 text-[0.85em] text-ink/80">💡 {h.tip}</p>}
        </div>
      )}
      <DialogueBox
        className="w-full"
        mode="talk"
        speaker={`${p.family}${p.name}`}
        speakerIndex={1}
        text={chat.thinking ? '……' : jaSegments(chat.line.ja, dict)}
        english={chat.thinking ? undefined : chat.line.en}
        showEnglish={english}
        furigana={furigana}
        typeSpeed={chat.thinking ? 6 : 28}
        more={bye}
        onNext={bye ? end : undefined}
        onWord={pickWord(onWord)}
      />
      {chat.error && <div className="corner-sm bg-shu px-3 py-1.5 text-sm text-white">{chat.error}</div>}
      {mic.error && !mic.listening && <div className="corner-sm bg-ink-3 px-3 py-1.5 text-sm text-paper">🎤 {mic.error}</div>}
      {!bye && (
        <div className="corner flex flex-col gap-2 bg-ink/95 p-2 frame">
          <div className="flex items-center gap-2">
            {mic.supported && (
              <Button
                size="md"
                variant={mic.listening ? 'primary' : 'gold'}
                aria-pressed={mic.listening}
                disabled={chat.thinking}
                onClick={() => {
                  if (mic.listening) mic.stop()
                  else {
                    hush()
                    mic.start()
                  }
                }}
                title="Speak Japanese (hold V)"
              >
                🎤 <span className="hidden sm:inline">{mic.listening ? '話し中… tap to stop' : '話す'}</span>
                {!mic.listening && <Kbd className="hidden text-[0.7em] sm:inline-flex">V</Kbd>}
              </Button>
            )}
            <input
              className="corner-sm h-10 min-w-0 flex-1 bg-ink-3 px-3 text-paper placeholder:text-paper-dim/70 outline-none focus:shadow-[inset_0_0_0_2px_var(--color-kin)]"
              value={typed}
              lang="ja"
              placeholder={mic.supported ? 'または日本語で入力… or type' : '日本語で入力… type in Japanese'}
              disabled={chat.thinking}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                // Not while the IME is still choosing kanji.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
                if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
                e.stopPropagation()
              }}
            />
            <button
              type="button"
              onClick={onAiSettings}
              className={cn('corner-sm h-10 shrink-0 px-2 text-[0.75em] leading-tight', ai ? 'bg-matcha text-sumi' : 'bg-ink-3 text-paper-dim hover:text-paper')}
              title={ai ? 'Your AI answers for them. Click for AI settings.' : 'Connect your own AI so they can answer anything you say.'}
            >
              {ai ? '🤖 AI' : '🤖 Connect AI'}
            </button>
          </div>
          {!ai && chat.log.length <= 3 && (
            <p className="px-1 text-[0.75em] text-paper-dim">
              Say or type anything. Without your own AI they understand the four questions below; connect one and they answer whatever you say.
            </p>
          )}
          <ChoiceList
            key={`${chat.step}:${chat.turn}`}
            autoFocus={!typed}
            numbered
            items={REPLIES.map((r) => ({ label: r.ja, hint: english ? r.en : undefined, disabled: chat.thinking }))}
            onChoose={choose}
          />
        </div>
      )}
    </div>
  )
}
