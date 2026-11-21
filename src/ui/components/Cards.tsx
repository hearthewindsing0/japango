import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Badge, JlptBadge, LineBadge } from './Badge'
import { Furigana, type JaSegment } from './Furigana'
import { Panel, PanelTitle } from './Panel'

/* ------------------------------------------------------------------ */
/* Word card                                                           */
/* ------------------------------------------------------------------ */

export interface WordCardKanji {
  char: string
  meanings: string[]
  on?: string[]
  kun?: string[]
  strokes?: number
}

/** The card for a tapped word: reading, meanings, JLPT level, kanji and an example. */
export function WordCard({
  word,
  reading,
  romaji,
  pos,
  meanings,
  jlpt,
  kanji = [],
  example,
  exampleEn,
  furigana = true,
  onClose,
  onWord,
  className,
}: {
  word: string
  reading?: string
  romaji?: string
  pos?: string
  meanings: string[]
  jlpt?: 1 | 2 | 3 | 4 | 5
  kanji?: WordCardKanji[]
  example?: string | JaSegment[]
  exampleEn?: string
  furigana?: boolean
  onClose?: () => void
  onWord?: (key: string, el: HTMLElement) => void
  className?: string
}) {
  return (
    <Panel tone="paper" className={cn('w-[22rem] max-w-full animate-pop', className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {reading && <div className="text-sm text-ink/60">{reading}</div>}
          <div className="text-4xl leading-tight" lang="ja">
            {word}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink/70">
            {jlpt && <JlptBadge level={jlpt} />}
            {romaji && <span className="italic">{romaji}</span>}
            {pos && <span className="notch-sm bg-ink/10 px-1.5">{pos}</span>}
          </div>
        </div>
        {onClose && (
          <button className="notch-sm grid size-8 place-items-center bg-ink text-paper hover:bg-shu" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <ol className="mt-3 list-none space-y-0.5">
        {meanings.map((m, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-arcade text-[0.6em] leading-[2.4] text-shu">{i + 1}.</span>
            {m}
          </li>
        ))}
      </ol>
      {kanji.length > 0 && (
        <div className="mt-3 grid gap-2">
          {kanji.map((k) => (
            <div key={k.char} className="flex items-center gap-3 bg-ink/5 p-2 [box-shadow:inset_0_0_0_2px_rgb(13_12_18/0.12)]">
              <span className="grid size-12 shrink-0 place-items-center bg-paper text-3xl [box-shadow:inset_0_0_0_2px_var(--color-ink)] [background-image:linear-gradient(rgb(232_67_46/0.25)_1px,transparent_1px),linear-gradient(90deg,rgb(232_67_46/0.25)_1px,transparent_1px)] [background-position:center] [background-size:50%_50%]">
                {k.char}
              </span>
              <div className="min-w-0 text-sm leading-snug">
                <div className="font-bold">{k.meanings.join(', ')}</div>
                {k.on?.length ? <div className="text-ink/70">音 {k.on.join('・')}</div> : null}
                {k.kun?.length ? <div className="text-ink/70">訓 {k.kun.join('・')}</div> : null}
                {k.strokes ? <div className="text-ink/50">{k.strokes} strokes</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {example && (
        <div className="mt-3 border-t-2 border-dashed border-ink/20 pt-2">
          <div className="text-lg leading-[1.9]">
            <Furigana text={example} furigana={furigana} onWord={onWord} />
          </div>
          {exampleEn && <div className="text-sm text-ink/60">{exampleEn}</div>}
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Place card (shop / bar / restaurant you are near)                   */
/* ------------------------------------------------------------------ */

export function PlaceCard({
  name,
  nameEn,
  status,
  cuisine,
  cuisineEn,
  hours,
  note,
  furigana = true,
  className,
}: {
  name: string
  nameEn?: string
  status?: 'open' | 'closed' | 'gone'
  cuisine?: string
  cuisineEn?: string
  hours?: string
  note?: ReactNode
  furigana?: boolean
  className?: string
}) {
  return (
    <Panel className={cn('w-80 max-w-full', className)}>
      <div className="text-[0.8em] text-paper-dim">近く · nearby</div>
      <div className="text-2xl leading-tight">
        <Furigana text={name} furigana={furigana} />
      </div>
      {nameEn && <div className="text-paper-dim">{nameEn}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {status === 'open' && <Badge variant="open">営業中</Badge>}
        {status === 'closed' && <Badge variant="closed">準備中</Badge>}
        {status === 'gone' && <Badge variant="closed">閉店</Badge>}
        {cuisine && <Badge variant="gold">{cuisine}</Badge>}
        {hours && <span className="text-sm">本日 {hours}</span>}
      </div>
      <div className="mt-1 text-sm text-paper-dim">
        {[status === 'open' ? 'open now' : status === 'closed' ? 'closed now' : status === 'gone' ? 'closed for good, shown where it used to be' : null, cuisineEn]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {note && <div className="mt-2 text-sm">{note}</div>}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Sign card (slopes 坂, station signs, door signs)                    */
/* ------------------------------------------------------------------ */

export function SignCard({
  title,
  kana,
  english,
  note,
  kind = 'slope',
  furigana = true,
  className,
}: {
  title: string
  kana?: string
  english?: ReactNode
  note?: ReactNode
  kind?: 'slope' | 'station' | 'door'
  furigana?: boolean
  className?: string
}) {
  const plate = kind === 'station' ? 'bg-paper text-ink' : kind === 'door' ? 'bg-shu text-paper' : 'bg-[#2c5e3f] text-paper'
  return (
    <div className={cn('w-80 max-w-full drop-hard', className)}>
      <div className={cn('notch px-4 py-3 [box-shadow:inset_0_0_0_3px_rgb(255_255_255/0.85),inset_0_0_0_5px_rgb(0_0_0/0.35)]', plate)}>
        <div className="flex items-baseline gap-2 text-3xl leading-tight">
          <Furigana text={title} furigana={furigana} />
          {kana && <span className="text-base opacity-75">{kana}</span>}
        </div>
        {english && <div className="mt-0.5 opacity-85">{english}</div>}
      </div>
      {note && <div className="mx-2 bg-ink/90 px-3 py-2 text-sm text-paper">{note}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Discovery card (Wikipedia places, stamp spots)                       */
/* ------------------------------------------------------------------ */

export function DiscoveryCard({
  name,
  nameEn,
  stamp = false,
  textJa,
  textEn,
  links,
  furigana = true,
  className,
}: {
  name: string
  nameEn?: string
  stamp?: boolean
  textJa?: string
  textEn?: string
  links?: { label: string; href: string }[]
  furigana?: boolean
  className?: string
}) {
  return (
    <Panel tone="gold" className={cn('w-[26rem] max-w-full', className)}>
      <PanelTitle aside={stamp && <Badge variant="shu">🎴 STAMP</Badge>}>Discovery ★</PanelTitle>
      <div className="text-2xl leading-tight">
        <Furigana text={name} furigana={furigana} /> {nameEn && <span className="text-base text-paper-dim">{nameEn}</span>}
      </div>
      {textJa && (
        <p className="mt-2 leading-[1.9]">
          <Furigana text={textJa} furigana={furigana} />
        </p>
      )}
      {textEn && <p className="mt-1 text-sm text-paper-dim">{textEn}</p>}
      {links && links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-sora underline decoration-2 underline-offset-4 hover:bg-sora hover:text-ink">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Location panel (top-left HUD)                                       */
/* ------------------------------------------------------------------ */

const WEATHER: Record<string, string> = { clear: '☀', cloudy: '☁', rain: '☂', snow: '❄', night: '☾' }

export function LocationPanel({
  area,
  areaEn,
  time,
  weather = 'clear',
  temp,
  street,
  streetEn,
  station,
  furigana = true,
  className,
}: {
  area: string
  areaEn?: string
  time?: string
  weather?: keyof typeof WEATHER
  temp?: number
  street?: string
  streetEn?: string
  station?: { name: string; nameEn: string; line: string; letter: string; color: string }
  furigana?: boolean
  className?: string
}) {
  return (
    <Panel size="sm" className={cn('w-72 max-w-full px-3', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl leading-tight">
          <Furigana text={area} furigana={furigana} />
        </span>
        {areaEn && <span className="text-sm text-paper-dim">{areaEn}</span>}
      </div>
      {(time || temp !== undefined) && (
        <div className="mt-1 flex items-center gap-2 font-arcade text-[0.65em] text-kin">
          {time && <span>{time}</span>}
          <span className="text-[1.6em] leading-none">{WEATHER[weather]}</span>
          {temp !== undefined && <span>{temp}°C</span>}
        </div>
      )}
      {street && (
        <div className="mt-1 text-sm">
          <Furigana text={street} furigana={furigana} /> {streetEn && <span className="text-paper-dim">{streetEn}</span>}
        </div>
      )}
      {station && (
        <div className="mt-1 flex items-center gap-1.5 text-sm">
          <LineBadge letter={station.letter} color={station.color} />
          <Furigana text={station.name} furigana={furigana} />
          <span className="text-paper-dim">
            {station.nameEn}, {station.line}
          </span>
        </div>
      )}
    </Panel>
  )
}
