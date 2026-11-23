import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ANTNBEE } from './interiors/antnbee'
import { Badge, Button, Furigana, Panel, PanelTitle, cn } from '../ui'
import { JaText, jaSegments, type WordPick } from './JaText'
import type { Dict } from './dict'

// Ordering at the bar: the day's tap list, sizes and prices, and the
// phrases you'd use, as a little back-and-forth with the bartender. Every
// line shows the Japanese, its reading and what it means.

type Beer = (typeof ANTNBEE.beers)[number]
type Size = (typeof ANTNBEE.sizes)[number]
interface Line {
  who: 'you' | 'staff'
  ja: string
  kana: string
  en: string
}

const DIGITS = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう']

/** Read a yen amount (under 100,000) aloud in kana. */
function yenKana(n: number) {
  const man = Math.floor(n / 10000)
  const sen = Math.floor((n % 10000) / 1000)
  const hyaku = Math.floor((n % 1000) / 100)
  const ju = Math.floor((n % 100) / 10)
  const ichi = n % 10
  let out = ''
  if (man) out += DIGITS[man] + 'まん'
  if (sen) out += sen === 1 ? 'せん' : sen === 3 ? 'さんぜん' : sen === 8 ? 'はっせん' : DIGITS[sen] + 'せん'
  if (hyaku) out += hyaku === 1 ? 'ひゃく' : hyaku === 3 ? 'さんびゃく' : hyaku === 6 ? 'ろっぴゃく' : hyaku === 8 ? 'はっぴゃく' : DIGITS[hyaku] + 'ひゃく'
  if (ju) out += ju === 1 ? 'じゅう' : DIGITS[ju] + 'じゅう'
  if (ichi) out += DIGITS[ichi]
  return out || 'ぜろ'
}

function fill(t: { ja: string; kana: string; en: string }, v: Record<string, string>) {
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')
  return { ja: sub(t.ja), kana: sub(t.kana), en: sub(t.en) }
}

const phrase = (id: string) => ANTNBEE.phrases.find((p) => p.id === id)!

export function BarMenu({
  open,
  onOpenChange,
  atCounter,
  dict,
  furigana,
  onWord,
  onServe,
  onPaid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Close enough to the counter to order. */
  atCounter: boolean
  dict: Dict | null
  furigana: boolean
  onWord: (w: WordPick) => void
  /** A beer arrives (its tap color). */
  onServe: (color: string) => void
  /** The tab's settled: clear the glasses. */
  onPaid: () => void
}) {
  const [beer, setBeer] = useState<Beer>(ANTNBEE.beers[0])
  const [lines, setLines] = useState<Line[]>([{ who: 'staff', ...ANTNBEE.staff.welcome }])
  const [tab, setTab] = useState<{ beer: Beer; size: Size }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const say = (...ls: Line[]) => setLines((old) => [...old, ...ls].slice(-4))
  const later = (l: Line, then?: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      say(l)
      then?.()
    }, 1400)
  }
  const vars = (b: Beer, s: Size) => ({ beer: b.ja, beerKana: b.kana, beerEn: b.en, size: s.ja, sizeKana: s.kana, sizeEn: s.en.split(',')[0].toLowerCase() })

  const order = (s: Size, b = beer) => {
    const v = vars(b, s)
    say({ who: 'you', ...fill(phrase('order'), v) }, { who: 'staff', ...fill(ANTNBEE.staff.confirm, v) })
    setTab((t) => [...t, { beer: b, size: s }])
    later({ who: 'staff', ...ANTNBEE.staff.serve }, () => onServe(b.tap))
  }
  const again = () => {
    const last = tab[tab.length - 1]
    if (!last) return say({ who: 'you', ...phrase('again') }, { who: 'staff', ...ANTNBEE.staff.nothing })
    say({ who: 'you', ...phrase('again') }, { who: 'staff', ...fill(ANTNBEE.staff.confirm, vars(last.beer, last.size)) })
    setTab((t) => [...t, last])
    later({ who: 'staff', ...ANTNBEE.staff.serve }, () => onServe(last.beer.tap))
  }
  const recommend = () => {
    // The day's first pick on the printed list.
    const pick = ANTNBEE.beers.find((b) => b.ja === 'ゴールデンエール') ?? ANTNBEE.beers[0]
    setBeer(pick)
    say({ who: 'you', ...phrase('recommend') }, { who: 'staff', ...fill(ANTNBEE.staff.recommend, { beer: pick.ja, beerKana: pick.kana, beerEn: pick.en }) })
  }
  const total = tab.reduce((s, o) => s + o.size.yen, 0)
  const bill = () => {
    if (!tab.length) return say({ who: 'you', ...phrase('bill') }, { who: 'staff', ...ANTNBEE.staff.nothing })
    const t = total.toLocaleString('en-US')
    say({ who: 'you', ...phrase('bill') }, { who: 'staff', ...fill(ANTNBEE.staff.bill, { total: t, totalKana: yenKana(total) }) })
    later({ who: 'staff', ...ANTNBEE.staff.bye }, () => {
      setTab([])
      onPaid()
    })
  }
  const simple = (id: 'cheers' | 'tasty' | 'thanks' | 'call') => {
    const reply = id === 'cheers' ? ANTNBEE.staff.cheers : id === 'tasty' ? ANTNBEE.staff.tasty : id === 'thanks' ? ANTNBEE.staff.bye : { ja: 'はーい！', kana: 'はーい', en: 'Coming!' }
    say({ who: 'you', ...phrase(id) }, { who: 'staff', ...reply })
  }

  const ja = (t: string) => <JaText text={t} dict={dict} furigana={furigana} onWord={onWord} />
  // Inside a button: furigana, but no word buttons nested in it.
  const label = (t: string) => <Furigana text={jaSegments(t, dict)} furigana={furigana} />

  const section = (title: ReactNode, aside?: ReactNode) => (
    <div className="mt-4 mb-1.5 flex flex-wrap items-baseline gap-x-2 border-b border-paper/15 pb-1">
      <span className="font-pixel text-lg text-gold">{title}</span>
      {aside && <span className="text-xs text-paper-dim">{aside}</span>}
    </div>
  )

  return (
    <div
      className="pointer-events-none absolute bottom-[76px] left-3 z-[2] flex w-[min(26rem,calc(100%-24px))] flex-col-reverse gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Button variant={open ? 'gold' : 'secondary'} className="pointer-events-auto self-start" onClick={() => onOpenChange(!open)}>
        🍺 メニュー <span className="text-sm font-normal opacity-75">{open ? '✕ close' : 'menu'}</span>
        {tab.length > 0 && <Badge variant="shu">¥{total.toLocaleString('en-US')}</Badge>}
      </Button>
      {open && (
        <Panel tone="gold" size="sm" className="hud-scroll pointer-events-auto max-h-[calc(var(--hud-h)-250px)] overflow-y-auto px-3 py-3 leading-snug">
          <PanelTitle>Ant 'n Bee · Bar</PanelTitle>
          <div className="flex flex-col gap-1.5">
            {lines.map((l, i) => (
              <div key={i} className={cn('corner-sm flex gap-2.5 px-2.5 py-1.5', l.who === 'you' ? 'bg-kin/15' : 'bg-white/5')}>
                <span className="w-10 shrink-0 pt-1 font-pixel text-xs text-gold">{l.who === 'you' ? 'あなた' : '店員'}</span>
                <div className="min-w-0">
                  <div className="text-base font-bold">{ja(l.ja)}</div>
                  <div className="text-xs text-paper-dim">{l.kana}</div>
                  <div className="text-xs text-paper-dim/80 italic">{l.en}</div>
                </div>
              </div>
            ))}
          </div>

          {!atCounter && (
            <div className="corner-sm mt-2 bg-shu/20 px-2.5 py-1.5 text-xs [box-shadow:inset_0_0_0_1px_var(--color-shu)]">
              Walk up to the カウンター (counter) to order from the bartender.
            </div>
          )}

          {section(ja(ANTNBEE.signs.taps.t), `(${ANTNBEE.listDate}) · tap a beer, then a size`)}
          <div>
            {ANTNBEE.styles.map((st) => (
              <div key={st.id} className="mt-1.5">
                <div className="text-sm font-bold">
                  {ja(st.ja)} <span className="font-normal text-paper-dim">{st.en}</span>
                </div>
                {ANTNBEE.beers
                  .filter((b) => b.style === st.id)
                  .map((b) => (
                    <button
                      key={b.ja + b.brewery}
                      className={cn(
                        'corner-sm my-0.5 grid w-full grid-cols-[10px_1fr] items-center gap-x-2.5 px-2 py-1 text-left hover:bg-white/5',
                        b === beer && 'bg-kin/15 [box-shadow:inset_0_0_0_1.5px_var(--color-kin)]',
                      )}
                      onClick={() => setBeer(b)}
                    >
                      <i className="row-span-2 h-6 w-2.5 rounded-[3px]" style={{ background: b.tap }} />
                      <span className="text-sm font-bold">{label(b.ja)}</span>
                      <span className="text-xs text-paper-dim">
                        {b.brewery} · {b.breweryEn}, {b.en}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ANTNBEE.sizes.map((s) => (
              <Button key={s.id} size="sm" className="h-auto flex-col gap-0.5 py-1.5" disabled={!atCounter} onClick={() => order(s)} title={s.en}>
                {label(s.ja)}
                <span className="font-arcade text-[9px] text-gold">¥{s.yen.toLocaleString('en-US')}</span>
              </Button>
            ))}
          </div>
          <div className="mt-1 text-xs text-paper-dim">{ANTNBEE.listNote} Prices are before tax.</div>

          {section('Say something')}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => simple('call')}>{label(phrase('call').ja)}</Button>
            <Button size="sm" disabled={!atCounter} onClick={recommend}>
              {label(phrase('recommend').ja)}
            </Button>
            <Button size="sm" disabled={!atCounter} onClick={again}>
              {label(phrase('again').ja)}
            </Button>
            <Button size="sm" onClick={() => simple('cheers')}>{label(phrase('cheers').ja)}</Button>
            <Button size="sm" onClick={() => simple('tasty')}>{label(phrase('tasty').ja)}</Button>
            <Button size="sm" disabled={!atCounter} onClick={bill}>
              {label(phrase('bill').ja)}
            </Button>
            <Button size="sm" onClick={() => simple('thanks')}>{label(phrase('thanks').ja)}</Button>
          </div>

          {section('おつまみ', '(otsumami: snacks to go with your beer)')}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {ANTNBEE.food.map((f) => (
              <span key={f.ja}>
                {ja(f.ja)} <em className="text-xs text-paper-dim not-italic">{f.en}</em>
              </span>
            ))}
          </div>
          <div className="mt-3 text-xs text-paper-dim">
            {ANTNBEE.address} · {ANTNBEE.hours} ({ANTNBEE.hoursEn})
          </div>
        </Panel>
      )}
    </div>
  )
}
