import { useEffect, useRef, useState } from 'react'
import { ANTNBEE } from './interiors/antnbee'
import { JaText, type WordPick } from './JaText'
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
  atCounter,
  dict,
  furigana,
  onWord,
  onServe,
  onPaid,
}: {
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
  const [open, setOpen] = useState(false)
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

  return (
    <div className={`bar-menu ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className="bar-menu-toggle" onClick={() => setOpen((o) => !o)}>
        🍺 メニュー <span>{open ? '✕' : 'menu'}</span>
        {tab.length > 0 && <b> · ¥{total.toLocaleString('en-US')}</b>}
      </button>
      {open && (
        <div className="bar-menu-body">
          <div className="bar-talk">
            {lines.map((l, i) => (
              <div key={i} className={`bar-line ${l.who}`}>
                <span className="bar-who">{l.who === 'you' ? 'あなた' : '店員'}</span>
                <div>
                  <div className="bar-ja">{ja(l.ja)}</div>
                  <div className="bar-kana">{l.kana}</div>
                  <div className="bar-en">{l.en}</div>
                </div>
              </div>
            ))}
          </div>

          {!atCounter && <div className="bar-hint">Walk up to the カウンター (counter) to order from the bartender.</div>}

          <div className="bar-section">
            {ja(ANTNBEE.signs.taps.t)} <span className="bar-small">({ANTNBEE.listDate}) · tap a beer, then a size</span>
          </div>
          <div className="bar-beers">
            {ANTNBEE.styles.map((st) => (
              <div key={st.id} className="bar-style">
                <div className="bar-style-name">
                  {ja(st.ja)} <span>{st.en}</span>
                </div>
                {ANTNBEE.beers
                  .filter((b) => b.style === st.id)
                  .map((b) => (
                    <button key={b.ja + b.brewery} className={`bar-beer ${b === beer ? 'on' : ''}`} onClick={() => setBeer(b)}>
                      <i style={{ background: b.tap }} />
                      <span className="bar-ja">{ja(b.ja)}</span>
                      <span className="bar-small">
                        {b.brewery} · {b.breweryEn}, {b.en}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="bar-sizes">
            {ANTNBEE.sizes.map((s) => (
              <button key={s.id} disabled={!atCounter} onClick={() => order(s)} title={s.en}>
                {ja(s.ja)}
                <span>¥{s.yen.toLocaleString('en-US')}</span>
              </button>
            ))}
          </div>
          <div className="bar-small">{ANTNBEE.listNote} Prices are before tax.</div>

          <div className="bar-section">Say something</div>
          <div className="bar-phrases">
            <button onClick={() => simple('call')}>{ja(phrase('call').ja)}</button>
            <button disabled={!atCounter} onClick={recommend}>
              {ja(phrase('recommend').ja)}
            </button>
            <button disabled={!atCounter} onClick={again}>
              {ja(phrase('again').ja)}
            </button>
            <button onClick={() => simple('cheers')}>{ja(phrase('cheers').ja)}</button>
            <button onClick={() => simple('tasty')}>{ja(phrase('tasty').ja)}</button>
            <button disabled={!atCounter} onClick={bill}>
              {ja(phrase('bill').ja)}
            </button>
            <button onClick={() => simple('thanks')}>{ja(phrase('thanks').ja)}</button>
          </div>

          <div className="bar-section">
            おつまみ <span className="bar-small">(otsumami: snacks to go with your beer)</span>
          </div>
          <div className="bar-food">
            {ANTNBEE.food.map((f) => (
              <span key={f.ja}>
                {ja(f.ja)} <em>{f.en}</em>
              </span>
            ))}
          </div>
          <div className="bar-small">
            {ANTNBEE.address} · {ANTNBEE.hours} ({ANTNBEE.hoursEn})
          </div>
        </div>
      )}
    </div>
  )
}
