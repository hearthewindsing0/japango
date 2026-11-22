import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Kbd } from './Badge'
import { Button } from './Button'
import { Meter, Toggle } from './Controls'
import { UI_SIZES, useUiScale } from './UiRoot'

/* ------------------------------------------------------------------ */
/* A− / A+                                                             */
/* ------------------------------------------------------------------ */

/** The A−/A+ stepper. Reads and sets the scale of the nearest UiRoot. */
export function ScaleControl({ className }: { className?: string }) {
  const { scale, step } = useUiScale()
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Button size="sm" onClick={() => step(-1)} disabled={scale <= UI_SIZES[0]} aria-label="Smaller map and boxes" title="Smaller ([)">
        A−
      </Button>
      <span className="w-10 text-center font-arcade text-[0.6em] text-gold">{scale}×</span>
      <Button size="sm" onClick={() => step(1)} disabled={scale >= UI_SIZES[UI_SIZES.length - 1]} aria-label="Bigger map and boxes" title="Bigger (])">
        A+
      </Button>
    </div>
  )
}

/** Sound on / off. */
export function SoundToggle({ muted, onMutedChange }: { muted: boolean; onMutedChange: (m: boolean) => void }) {
  return (
    <Toggle pressed={!muted} onPressedChange={(on) => onMutedChange(!on)} aria-label="Sound" title="Sound (N)">
      {muted ? '🔇 消音' : '🔊 音'}
    </Toggle>
  )
}

/* ------------------------------------------------------------------ */
/* Minimap frame                                                       */
/* ------------------------------------------------------------------ */

/**
 * Frame around the minimap canvas: compass, coordinates and a big/small
 * toggle. Put the real map (a canvas) in `children`.
 */
export function MinimapFrame({
  size = 180,
  big = false,
  heading = 0,
  label,
  coords,
  onToggleBig,
  children,
  className,
}: {
  size?: number
  big?: boolean
  /** Camera heading in degrees, turns the N marker. */
  heading?: number
  label?: ReactNode
  coords?: string
  onToggleBig?: () => void
  children?: ReactNode
  className?: string
}) {
  const px = big ? size * 2.4 : size
  return (
    <div className={cn('relative drop-hard', className)} style={{ width: px }}>
      <div className="corner bg-ink p-[4px] frame">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-[#1d2a22]">
          {children}
          <span className="pointer-events-none absolute inset-0 [box-shadow:inset_0_0_24px_rgb(0_0_0/0.6)]" />
          <span className="pointer-events-none absolute top-1/2 left-1/2 size-2.5 -translate-1/2 bg-shu [box-shadow:0_0_0_2px_var(--color-paper)] [clip-path:polygon(50%_0,100%_100%,50%_75%,0_100%)]" />
        </div>
        <div className="mt-1 flex items-center gap-2 px-1 text-[0.75em]">
          <span
            className="grid size-6 place-items-center bg-paper font-arcade text-[0.7em] text-shu [clip-path:circle(50%)]"
            style={{ transform: `rotate(${-heading}deg)` }}
            title="North"
          >
            N
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {coords && <span className="font-arcade text-[0.65em] text-paper-dim">{coords}</span>}
          {onToggleBig && (
            <button className="corner-sm bg-ink-3 px-1.5 text-paper hover:bg-paper hover:text-ink" onClick={onToggleBig} aria-label={big ? 'Small map' : 'Big map'} title="Map (M)">
              {big ? '⤡' : '⤢'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** A stand-in map drawing for the playground and loading states. */
export function MinimapPlaceholder() {
  return (
    <svg viewBox="0 0 100 100" className="size-full pixelated" aria-hidden>
      <rect width="100" height="100" fill="#22302a" />
      {[12, 30, 48, 70, 88].map((y) => (
        <rect key={y} x="0" y={y} width="100" height={y === 48 ? 6 : 3} fill="#6d6a62" />
      ))}
      {[18, 42, 64, 84].map((x) => (
        <rect key={x} x={x} y="0" width={x === 42 ? 6 : 3} height="100" fill="#6d6a62" />
      ))}
      <rect x="0" y="22" width="100" height="5" fill="#3d3a46" opacity="0.9" />
      <rect x="50" y="54" width="12" height="10" fill="#2f855a" />
      <circle cx="70" cy="20" r="2.5" fill="#e8432e" />
      <circle cx="25" cy="60" r="2.5" fill="#f5c542" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Stamp book                                                          */
/* ------------------------------------------------------------------ */

export interface StampSpot {
  id: string
  ja: string
  en?: string
  got?: boolean
}

/** One hanko-style stamp: red seal when collected, ？ when not. */
export function Stamp({ spot, size = 88 }: { spot: StampSpot; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: size + 8 }}>
      <div
        className={cn(
          'grid place-items-center font-pixel text-[2em] leading-none',
          spot.got
            ? 'animate-stamp rotate-[-8deg] text-shu [box-shadow:inset_0_0_0_4px_var(--color-shu),inset_0_0_0_7px_transparent,inset_0_0_0_9px_var(--color-shu)] [clip-path:circle(50%)]'
            : 'text-ink/30 [box-shadow:inset_0_0_0_3px_color-mix(in_oklab,var(--color-ink)_25%,transparent)] [clip-path:circle(50%)] ',
        )}
        style={{ width: size, height: size }}
      >
        {spot.got ? '済' : '？'}
      </div>
      <div className="text-sm leading-tight text-ink">{spot.ja}</div>
      {spot.en && <div className="text-[0.7em] leading-tight text-ink/60">{spot.en}</div>}
    </div>
  )
}

/** The stamp rally page: a grid of stamps and a counter. Put it in a Window tone="paper". */
export function StampBook({ spots, found, total }: { spots: StampSpot[]; found?: number; total?: number }) {
  const got = spots.filter((s) => s.got).length
  return (
    <div className="text-ink">
      <p className="mb-3 text-sm text-ink/70">Find each place and walk up to its red marker.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] justify-items-center gap-3 bg-ink/5 p-3">
        {spots.map((s) => (
          <Stamp key={s.id} spot={s} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm [&_span]:text-ink">
        <Meter value={got} max={spots.length || 1} segments={Math.max(1, spots.length)} color="var(--color-shu)" label={<span>{got}/{spots.length}</span>} className="flex-1" />
        {total !== undefined && (
          <span>
            Places discovered: {found ?? 0} of {total}
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Controls help                                                       */
/* ------------------------------------------------------------------ */

/** Keyboard / touch controls as a list. Keys like "Q / E" become Kbd chips. */
export function ControlsHelp({ controls, className }: { controls: [keys: string, action: string][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5', className)}>
      {controls.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="flex flex-wrap items-center gap-1 justify-self-end text-sm text-paper-dim">
            {k.split(/(\s*[/,]\s*)/).map((part, i) =>
              /^\s*[/,]\s*$/.test(part) ? <span key={i}>/</span> : part.length <= 6 && !/\s/.test(part) ? <Kbd key={i}>{part}</Kbd> : <span key={i}>{part}</span>,
            )}
          </dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export const DEFAULT_CONTROLS: [string, string][] = [
  ['↑↓←→ / WASD', 'Move'],
  ['Shift', 'Run'],
  ['+ / −', 'Zoom'],
  ['Q / E', 'Turn'],
  ['M', 'Big map'],
  ['B', 'Stamp book'],
  ['F', 'Furigana'],
  ['N', 'Sound on/off'],
  ['T', 'English for overheard talk'],
  ['[ / ]', 'Smaller / bigger boxes'],
  ['H', 'Show/hide this list'],
]

/* ------------------------------------------------------------------ */
/* D-pad                                                               */
/* ------------------------------------------------------------------ */

export type PadDir = 'up' | 'down' | 'left' | 'right'

/** Touch D-pad. Presentational: wire onPress / onRelease to the game's input. */
export function DPad({
  onPress,
  onRelease,
  onTurn,
  size = 150,
  className,
}: {
  onPress?: (d: PadDir) => void
  onRelease?: (d: PadDir) => void
  onTurn?: (dir: -1 | 1) => void
  size?: number
  className?: string
}) {
  // A 3×3 grid with one gap size everywhere, so the four arrows sit the
  // same distance from the center and from each other.
  const gap = Math.max(3, Math.round(size / 40))
  const pad = gap
  const btn = (d: PadDir, label: string, col: number, row: number) => (
    <button
      aria-label={d}
      className="grid place-items-center rounded-md bg-ink-3 text-paper shadow-[inset_0_-3px_0_var(--color-ink-4)] active:translate-y-[2px] active:bg-shu active:text-white active:shadow-none"
      style={{ gridColumn: col + 1, gridRow: row + 1 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onPress?.(d)
      }}
      onPointerUp={() => onRelease?.(d)}
      onPointerCancel={() => onRelease?.(d)}
    >
      {label}
    </button>
  )
  const cell = (size - 2 * pad - 2 * gap) / 3
  return (
    <div className={cn('relative touch-none select-none drop-hard', className)} style={{ width: size, height: size }}>
      {/* The cross behind the buttons, with the same padding on every side. */}
      <span className="absolute rounded-lg bg-ink" style={{ left: pad + cell + gap - pad, top: 0, width: cell + 2 * pad, height: size }} />
      <span className="absolute rounded-lg bg-ink" style={{ left: 0, top: pad + cell + gap - pad, width: size, height: cell + 2 * pad }} />
      <div className="absolute grid" style={{ inset: pad, gap, gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
        {btn('up', '▲', 1, 0)}
        {btn('left', '◀', 0, 1)}
        {btn('right', '▶', 2, 1)}
        {btn('down', '▼', 1, 2)}
        <span className="relative rounded-md bg-ink-3" style={{ gridColumn: 2, gridRow: 2 }}>
          <span className="absolute inset-[30%] rounded-full bg-ink" />
        </span>
      </div>
      {onTurn && (
        <>
          <button className="corner-sm absolute -top-1 -left-1 size-9 bg-ink text-paper hover:bg-shu" style={{ fontSize: 18 }} aria-label="Turn view left" onClick={() => onTurn(-1)}>
            ⟲
          </button>
          <button className="corner-sm absolute -top-1 -right-1 size-9 bg-ink text-paper hover:bg-shu" style={{ fontSize: 18 }} aria-label="Turn view right" onClick={() => onTurn(1)}>
            ⟳
          </button>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bottom bar / hotbar                                                 */
/* ------------------------------------------------------------------ */

export interface HotbarSlot {
  id: string
  icon: ReactNode
  label: string
  shortcut?: string
  badge?: ReactNode
  active?: boolean
  onClick?: () => void
}

/** The row of actions along the bottom: map, stamps, phrasebook, settings... */
export function Hotbar({ slots, className }: { slots: HotbarSlot[]; className?: string }) {
  return (
    <nav className={cn('inline-block drop-hard', className)}>
      <div className="corner flex gap-1 bg-ink p-[6px] frame">
        {slots.map((s) => (
          <button
            key={s.id}
            onClick={s.onClick}
            aria-pressed={s.active}
            title={s.shortcut ? `${s.label} (${s.shortcut})` : s.label}
            className={cn(
              'corner-sm relative flex w-16 flex-col items-center gap-0.5 bg-ink-3 px-1 pt-2 pb-1 text-paper shadow-[inset_0_-2px_0_var(--color-ink)] hover:bg-ink-4',
              'aria-pressed:bg-kin aria-pressed:text-sumi aria-pressed:shadow-none',
            )}
          >
            <span className="text-2xl leading-none">{s.icon}</span>
            <span className="max-w-full truncate text-[0.7em]">{s.label}</span>
            {s.shortcut && <span className="absolute top-0.5 left-1 font-arcade text-[7px] opacity-60">{s.shortcut}</span>}
            {s.badge !== undefined && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 bg-shu px-1 font-arcade text-[8px] leading-5 text-white [clip-path:circle(60%)]">{s.badge}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / title                                                     */
/* ------------------------------------------------------------------ */

/** Full-screen loading screen with a segmented bar and a rotating tip. */
export function LoadingScreen({ progress, label = 'Loading map', tip }: { progress: number; label?: string; tip?: ReactNode }) {
  return (
    <div className="scanlines grid size-full place-items-center bg-ink p-6">
      <div className="w-full max-w-md text-center">
        <div className="font-arcade text-xs tracking-widest text-gold">NOW LOADING</div>
        <div className="mt-1 font-pixel text-3xl">
          ロード中<span className="animate-blink">…</span>
        </div>
        <Meter value={progress} className="mt-5" segments={16} color="var(--color-shu)" />
        <div className="mt-2 font-arcade text-[10px] text-paper-dim">
          {label} {Math.round(progress)}%
        </div>
        {tip && <div className="mt-6 text-sm text-paper-dim">💡 {tip}</div>}
      </div>
    </div>
  )
}

/** Title screen with a big logo and a menu slot. */
export function TitleScreen({ title = 'JAPANGO', subtitle = '六本木 · Roppongi', blink = 'PRESS START', children }: { title?: string; subtitle?: string; blink?: string; children?: ReactNode }) {
  return (
    <div className="relative grid size-full place-items-center overflow-hidden bg-ink p-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(transparent,rgb(232_67_46/0.25)),repeating-linear-gradient(90deg,rgb(95_211_230/0.25)_0_2px,transparent_2px_48px)] [transform:perspective(300px)_rotateX(60deg)] origin-bottom" />
      <div className="pointer-events-none absolute top-[12%] left-1/2 size-40 -translate-x-1/2 rounded-full bg-[repeating-linear-gradient(transparent_0_10px,var(--color-ink)_10px_14px),linear-gradient(var(--color-kin),var(--color-shu))]" />
      <div className="relative text-center">
        <h1 className="font-arcade text-5xl text-paper [text-shadow:4px_4px_0_var(--color-shu),8px_8px_0_var(--color-ink)]">{title}</h1>
        <div className="mt-3 text-xl text-gold">{subtitle}</div>
        {children ? <div className="mt-8 inline-block text-left">{children}</div> : <div className="mt-10 animate-blink font-arcade text-sm">{blink}</div>}
      </div>
    </div>
  )
}
