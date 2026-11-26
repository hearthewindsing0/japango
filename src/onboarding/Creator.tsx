import { useMemo, useState, type ReactNode } from 'react'
import { Button, Panel, UiRoot, cn } from '../ui'
import { BUILDS, CLOTH_COLORS, EYES, GENDERS, GLASSES, HAIRS, HAIR_COLORS, HATS, HEIGHTS, OUTFITS, SKIN_TONES, presetFor, randomAvatar, type Avatar, type Choice, type Swatch } from '../game/avatar'
import { kanaReading, kanaRomaji, nameToKatakana, romajiToKatakana } from '../game/kana'
import { Turntable, type Shot } from './Turntable'

// The character creator: the figure on its turntable, and a panel of
// choices in four tabs (body, face, hair, clothes), then the name. Every
// choice is labelled in Japanese with its reading and English. Built to be
// reused (a clothes shop could open it on the clothes tab later).

type Tab = 'body' | 'face' | 'hair' | 'clothes'
const TABS: { v: Tab; ja: string; yomi: string; en: string; icon: string; shot: Shot }[] = [
  { v: 'body', ja: '体', yomi: 'からだ', en: 'Body', icon: '🧍', shot: 'full' },
  { v: 'face', ja: '顔', yomi: 'かお', en: 'Face', icon: '🙂', shot: 'face' },
  { v: 'hair', ja: '髪', yomi: 'かみ', en: 'Hair', icon: '💇', shot: 'face' },
  { v: 'clothes', ja: '服', yomi: 'ふく', en: 'Clothes', icon: '👕', shot: 'full' },
]

/** Japanese with its reading over it (ruby), when it has one. */
function Ja({ ja, yomi, className }: { ja: string; yomi?: string; className?: string }) {
  return (
    <span lang="ja" className={className}>
      {yomi ? (
        <ruby>
          {ja}
          <rt>{yomi}</rt>
        </ruby>
      ) : (
        ja
      )}
    </span>
  )
}

function Section({ ja, yomi, en, children }: { ja: string; yomi?: string; en: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 leading-none">
        <Ja ja={ja} yomi={yomi} className="text-lg font-bold" />
        <span className="text-sm text-paper-dim">{en}</span>
      </h3>
      {children}
    </section>
  )
}

/** Equal-width choice buttons, Japanese over English. */
function Choices<T extends string>({ items, value, onPick, cols = 3 }: { items: Choice<T>[]; value: T; onPick: (v: T) => void; cols?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((c) => (
        <button
          key={c.v}
          type="button"
          aria-pressed={c.v === value}
          onClick={() => onPick(c.v)}
          className={cn(
            'corner-sm flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center leading-tight transition-colors',
            c.v === value ? 'bg-kin text-sumi shadow-[inset_0_-3px_0_var(--color-kin-dark)] [&_rt]:text-sumi/70' : 'bg-ink-3 text-paper shadow-[inset_0_-3px_0_var(--color-ink)] hover:bg-ink-4',
          )}
        >
          <Ja ja={c.ja} yomi={c.yomi} className={cn('font-bold whitespace-nowrap', c.ja.length > 5 ? 'text-sm' : 'text-base')} />
          <span className={cn('text-xs', c.v === value ? 'text-sumi/75' : 'text-paper-dim')}>{c.en}</span>
        </button>
      ))}
    </div>
  )
}

/** Round color swatches in an even grid; the picked one's name below. */
function Swatches({ items, value, onPick, cols = 8 }: { items: Swatch[]; value: string; onPick: (c: string) => void; cols?: number }) {
  const picked = items.find((s) => s.c === value)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid justify-items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((s) => (
          <button
            key={s.c}
            type="button"
            aria-label={s.en}
            title={s.en}
            aria-pressed={s.c === value}
            onClick={() => onPick(s.c)}
            className={cn(
              'aspect-square w-full max-w-10 rounded-full transition-transform hover:scale-110',
              s.c === value ? 'shadow-[0_0_0_3px_var(--color-ink),0_0_0_5px_var(--color-kin)]' : 'shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.25)]',
            )}
            style={{ background: s.c }}
          />
        ))}
      </div>
      {picked && picked.ja !== 'はだ' && (
        <div className="text-sm text-paper-dim">
          <span lang="ja" className="text-paper">
            {picked.ja}
          </span>{' '}
          · {picked.en}
        </div>
      )}
    </div>
  )
}

function Yes({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Choices
      items={[
        { v: 'yes', ja: 'あり', en: 'Yes' },
        { v: 'no', ja: 'なし', en: 'No' },
      ]}
      value={value ? 'yes' : 'no'}
      onPick={(v) => onChange(v === 'yes')}
      cols={2}
    />
  )
}

function LookTab({ tab, a, set }: { tab: Tab; a: Avatar; set: (p: Partial<Avatar>) => void }) {
  switch (tab) {
    case 'body':
      return (
        <>
          <Section ja="性別" yomi="せいべつ" en="Gender">
            <Choices items={GENDERS} value={a.gender} onPick={(g) => g !== a.gender && set(presetFor(g, a))} />
          </Section>
          <Section ja="体型" yomi="たいけい" en="Build">
            <Choices items={BUILDS} value={a.build} onPick={(build) => set({ build })} />
          </Section>
          <Section ja="身長" yomi="しんちょう" en="Height">
            <Choices items={HEIGHTS} value={a.height} onPick={(height) => set({ height })} />
          </Section>
          <Section ja="肌の色" yomi="はだのいろ" en="Skin tone">
            <Swatches items={SKIN_TONES} value={a.skin} onPick={(skin) => set({ skin })} />
          </Section>
        </>
      )
    case 'face':
      return (
        <>
          <Section ja="目" yomi="め" en="Eyes">
            <Choices items={EYES} value={a.eyes} onPick={(eyes) => set({ eyes })} cols={4} />
          </Section>
          <Section ja="ほっぺ" en="Rosy cheeks">
            <Yes value={a.blush} onChange={(blush) => set({ blush })} />
          </Section>
          <Section ja="めがね" en="Glasses">
            <Choices items={GLASSES} value={a.glasses} onPick={(glasses) => set({ glasses })} />
          </Section>
        </>
      )
    case 'hair':
      return (
        <>
          <Section ja="髪型" yomi="かみがた" en="Hairstyle">
            <Choices items={HAIRS} value={a.hair} onPick={(hair) => set({ hair })} cols={4} />
          </Section>
          <Section ja="髪の色" yomi="かみのいろ" en="Hair color">
            <Swatches items={HAIR_COLORS} value={a.hairColor} onPick={(hairColor) => set({ hairColor })} cols={5} />
          </Section>
          <Section ja="ぼうし" en="Hat">
            <Choices items={HATS} value={a.hat} onPick={(hat) => set({ hat })} />
          </Section>
        </>
      )
    case 'clothes':
      return (
        <>
          <Section ja="服" yomi="ふく" en="Outfit">
            <Choices items={OUTFITS} value={a.outfit} onPick={(outfit) => set({ outfit })} />
          </Section>
          <Section ja="上の色" yomi="うえのいろ" en="Top color">
            <Swatches items={CLOTH_COLORS} value={a.top} onPick={(top) => set({ top })} />
          </Section>
          {a.outfit !== 'dress' && (
            <Section ja="下の色" yomi="したのいろ" en={a.outfit === 'skirt' ? 'Skirt color' : 'Pants color'}>
              <Swatches items={CLOTH_COLORS} value={a.bottom} onPick={(bottom) => set({ bottom })} />
            </Section>
          )}
          <Section ja="リュック" en="Backpack">
            <Yes value={a.backpack} onChange={(backpack) => set({ backpack })} />
          </Section>
          {(a.backpack || a.hat !== 'none' || a.hair === 'ponytail') && (
            <Section ja="小物の色" yomi="こもののいろ" en="Bag, hat and hair tie color">
              <Swatches items={CLOTH_COLORS} value={a.accent} onPick={(accent) => set({ accent })} />
            </Section>
          )}
        </>
      )
  }
}

function NameStep({ a, set }: { a: Avatar; set: (p: Partial<Avatar>) => void }) {
  // The katakana follows the name until the player types their own sound.
  const [sound, setSound] = useState('')
  const reading = useMemo(() => kanaReading(a.kana), [a.kana])
  return (
    <>
      <Section ja="お名前は？" yomi="おなまえは" en="What's your name?">
        <input
          autoFocus
          value={a.name}
          maxLength={20}
          placeholder="Your name"
          onChange={(e) => {
            const name = e.target.value
            set({ name, kana: sound ? a.kana : nameToKatakana(name) })
          }}
          className="corner-sm h-14 w-full bg-paper px-4 text-2xl text-ink outline-none placeholder:text-ink/40 focus-visible:shadow-[0_0_0_3px_var(--color-kin)]"
        />
      </Section>
      <div className="corner flex flex-col items-center gap-3 bg-ink-2 px-3 py-4 frame">
        <div className="text-xs tracking-wide text-paper-dim uppercase">In Japanese</div>
        <div lang="ja" className="min-h-12 text-center font-pixel text-5xl leading-none text-paper">
          {a.kana || '…'}
        </div>
        {reading.length > 0 && (
          <>
            <div className="flex flex-wrap justify-center gap-1.5">
              {reading.map((p, i) => (
                <div key={i} className="corner-sm flex min-w-11 flex-col items-center bg-ink-3 px-2 py-1">
                  <span lang="ja" className="text-xl leading-tight">
                    {p.kana}
                  </span>
                  <span className="text-sm text-gold">{p.romaji}</span>
                </div>
              ))}
            </div>
            <div className="text-paper-dim">
              Said <span className="font-semibold text-paper">{kanaRomaji(a.kana)}</span>
            </div>
          </>
        )}
      </div>
      <Section ja="ちがう？" en="Doesn't sound right? Type how it sounds">
        <input
          value={sound}
          placeholder={a.name ? 'e.g. henri-' : 'e.g. henri- (- makes a long sound)'}
          onChange={(e) => {
            const v = e.target.value
            setSound(v)
            set({ kana: v.trim() ? romajiToKatakana(v.trim()) : nameToKatakana(a.name) })
          }}
          className="corner-sm h-12 w-full bg-ink-3 px-4 text-lg text-paper outline-none placeholder:text-paper-dim/70 focus-visible:shadow-[0_0_0_3px_var(--color-kin)]"
        />
      </Section>
      <p className="text-sm leading-relaxed text-paper-dim">
        Names from other languages are written in <Ja ja="カタカナ" className="text-paper" /> (katakana), one of Japan's three scripts. A dash (ー) makes a sound long; a small ッ is a short pause.
      </p>
    </>
  )
}

/** Full-screen character creator. `onDone` gets the finished character. */
export function Creator({ initial, scale, width, height, onDone, onBack }: { initial: Avatar; scale: number; width: number; height: number; onDone: (a: Avatar) => void; onBack: () => void }) {
  const [a, setA] = useState(initial)
  const [tab, setTab] = useState<Tab>('body')
  const [step, setStep] = useState<'look' | 'name'>('look')
  const set = (p: Partial<Avatar>) => setA((old) => ({ ...old, ...p }))
  // Side by side on wide screens; the figure on top on tall ones.
  const wide = width >= 720 && width > height * 0.9
  const panelW = wide ? Math.min(440, width * 0.48) : width
  const stageH = wide ? height : Math.max(200, height * 0.4)
  const tabInfo = TABS.find((t) => t.v === tab)!
  const done = () => onDone({ ...a, name: a.name.trim(), kana: a.kana || nameToKatakana(a.name) })

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_35%_40%,#fff3df_0%,#f3dcc0_45%,#d9b99a_100%)]">
      {/* The stage, in real pixels (outside the zoomed UI). */}
      <div className="absolute top-0 left-0" style={{ width: wide ? `calc(100% - ${panelW * scale}px)` : '100%', height: wide ? '100%' : stageH * scale }}>
        <Turntable avatar={a} shot={step === 'name' ? 'full' : tabInfo.shot} wave={step === 'name'} />
      </div>
      <UiRoot scale={scale} className="pointer-events-none absolute top-0 left-0" style={{ width, height }}>
        {/* Title over the stage. */}
        <div className="absolute top-4 flex justify-center" style={{ left: 0, width: wide ? width - panelW : width }}>
          <div className="corner-sm bg-ink/85 px-4 py-2 text-center drop-hard">
            <div className="font-pixel text-2xl leading-tight" lang="ja">
              {step === 'look' ? 'キャラクターをつくろう' : 'よろしくね！'}
            </div>
            <div className="text-sm text-paper-dim">{step === 'look' ? 'Make your character · drag to spin' : 'Nice to meet you!'}</div>
          </div>
        </div>
        <div className="pointer-events-auto absolute right-0 bottom-0 flex flex-col p-3" style={{ width: panelW, height: wide ? height : height - stageH }}>
          <div className="min-h-0 flex-1 [&>[data-slot=panel]]:h-full">
            <Panel className="flex h-full min-h-0 flex-col gap-0 p-0">
              {step === 'look' && (
                <div className="grid grid-cols-4 gap-1.5 border-b border-paper/15 p-2">
                  {TABS.map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      aria-pressed={t.v === tab}
                      onClick={() => setTab(t.v)}
                      className={cn(
                        'corner-sm flex flex-col items-center justify-center gap-0.5 py-1.5 leading-tight',
                        t.v === tab ? 'bg-paper text-ink [&_rt]:text-ink/60' : 'text-paper-dim hover:bg-white/10 hover:text-paper',
                      )}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {t.icon}
                      </span>
                      <Ja ja={t.ja} yomi={t.yomi} className="text-lg font-bold" />
                      <span className="text-xs">{t.en}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="hud-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{step === 'look' ? <LookTab tab={tab} a={a} set={set} /> : <NameStep a={a} set={set} />}</div>
              <div className="grid grid-cols-2 gap-2 border-t border-paper/15 p-3">
                {step === 'look' ? (
                  <>
                    <Button size="lg" variant="secondary" onClick={() => setA((old) => randomAvatar(old))}>
                      🎲 <span>Random</span>
                    </Button>
                    <Button size="lg" variant="primary" onClick={() => setStep('name')}>
                      Next →
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" variant="secondary" onClick={() => setStep('look')}>
                      ← Back
                    </Button>
                    <Button size="lg" variant="primary" disabled={!a.name.trim()} onClick={done}>
                      Start!
                    </Button>
                  </>
                )}
              </div>
            </Panel>
          </div>
          {step === 'look' && (
            <button type="button" onClick={onBack} className="mt-2 self-center text-sm text-ink/70 underline hover:text-ink">
              Back to title
            </button>
          )}
        </div>
      </UiRoot>
    </div>
  )
}
