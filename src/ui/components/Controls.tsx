import { Progress as RxProgress, Slider as RxSlider, Switch as RxSwitch, Tabs as RxTabs, Toggle as RxToggle, Tooltip as RxTooltip } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { buttonVariants } from './Button'
import { useUiScale } from './UiRoot'

/** ON/OFF switch that looks like a hardware slider. */
export function Switch({ className, ...props }: ComponentProps<typeof RxSwitch.Root>) {
  return (
    <RxSwitch.Root
      className={cn(
        'corner-sm group relative inline-flex h-7 w-16 shrink-0 items-center bg-ink-3 rounded-full shadow-[inset_0_2px_0_rgb(0_0_0/0.4)]',
        'data-[state=checked]:bg-matcha/80 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 font-arcade text-[8px] text-ink opacity-0 group-data-[state=checked]:opacity-100">ON</span>
      <span className="pointer-events-none absolute right-1.5 font-arcade text-[8px] text-paper-dim group-data-[state=checked]:opacity-0">OFF</span>
      <RxSwitch.Thumb className="block h-5 w-6 rounded-full translate-x-1 bg-paper shadow-[inset_0_-3px_0_var(--color-paper-dim)] transition-transform duration-100 data-[state=checked]:translate-x-9" />
    </RxSwitch.Root>
  )
}

/** A switch with its label, for settings lists. */
export function SwitchRow({ label, hint, ...props }: ComponentProps<typeof RxSwitch.Root> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-[0.8em] text-paper-dim">{hint}</span>}
      </span>
      <Switch {...props} />
    </label>
  )
}

/** Push-on / push-off button (furigana, English, sound...). */
export function Toggle({ className, size = 'sm', ...props }: ComponentProps<typeof RxToggle.Root> & { size?: 'sm' | 'md' | 'icon' }) {
  return (
    <RxToggle.Root
      className={cn(
        buttonVariants({ variant: 'secondary', size }),
        'data-[state=on]:bg-kin data-[state=on]:text-ink data-[state=on]:shadow-[inset_0_-1px_0_var(--color-kin-dark)] data-[state=on]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

/** Chunky stepped slider (volume, text speed). */
export function Slider({ className, ...props }: ComponentProps<typeof RxSlider.Root>) {
  return (
    <RxSlider.Root className={cn('relative flex h-7 w-full touch-none items-center select-none', className)} {...props}>
      <RxSlider.Track className="relative h-2.5 grow overflow-hidden rounded-full bg-ink-3">
        <RxSlider.Range className="absolute h-full rounded-full bg-kin" />
      </RxSlider.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <RxSlider.Thumb
          key={i}
          className="block size-5 rounded-full bg-paper shadow-[inset_0_-3px_0_var(--color-paper-dim)] focus-visible:outline-2"
          aria-label="Value"
        />
      ))}
    </RxSlider.Root>
  )
}

/** Segmented bar like an RPG HP meter. Good for loading, progress, streaks. */
export function Meter({
  value,
  max = 100,
  segments = 10,
  color = 'var(--color-matcha)',
  label,
  className,
}: {
  value: number
  max?: number
  segments?: number
  color?: string
  label?: ReactNode
  className?: string
}) {
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * segments)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <span className="font-arcade text-[0.6em] text-kin">{label}</span>}
      <RxProgress.Root value={value} max={max} className="flex flex-1 gap-[3px] rounded-md bg-ink/80 p-[3px] shadow-[inset_0_0_0_1px_rgb(244_236_216/0.3)]">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className="h-2.5 flex-1 rounded-[2px]" style={{ background: i < filled ? color : 'var(--color-ink-3)' }} />
        ))}
      </RxProgress.Root>
    </div>
  )
}

/** Tabbed pages, with tabs styled like index cards. */
export const Tabs = RxTabs.Root

export function TabsList({ className, ...props }: ComponentProps<typeof RxTabs.List>) {
  return <RxTabs.List className={cn('flex gap-1 border-b border-paper/40', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RxTabs.Trigger>) {
  return (
    <RxTabs.Trigger
      className={cn(
        '-mb-px rounded-t-md px-3 pt-1.5 pb-1 text-paper-dim',
        'bg-ink-3 hover:text-paper data-[state=active]:bg-paper data-[state=active]:font-semibold data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RxTabs.Content>) {
  return <RxTabs.Content className={cn('pt-3', className)} {...props} />
}

/** Hover / focus hint. Wrap the app (or playground) in TooltipProvider once. */
export const TooltipProvider = RxTooltip.Provider

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const { scale } = useUiScale()
  return (
    <RxTooltip.Root>
      <RxTooltip.Trigger asChild>{children}</RxTooltip.Trigger>
      <RxTooltip.Portal>
        <RxTooltip.Content side={side} sideOffset={6} className="jg-ui z-50 animate-pop drop-hard-sm" style={{ zoom: scale }}>
          <div className="corner-sm bg-paper px-2.5 py-1 text-sm text-ink">{content}</div>
        </RxTooltip.Content>
      </RxTooltip.Portal>
    </RxTooltip.Root>
  )
}
