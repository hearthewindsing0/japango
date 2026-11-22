import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * The basic HUD box: rounded, a thin frame line and a short hard shadow.
 * The shadow sits on an outer wrapper so it isn't clipped with the box.
 */
export const panelVariants = cva('corner relative p-4', {
  variants: {
    tone: {
      ink: 'bg-ink/90 text-paper frame',
      paper: 'jg-paper bg-paper text-ink [box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--color-ink)_12%,transparent)] [&_rt]:text-ink/60',
      gold: 'bg-ink/90 text-paper frame-gold',
      alert: 'bg-shu text-white',
      glass: 'bg-ink/70 text-paper backdrop-blur-sm [box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--color-paper)_25%,transparent)]',
    },
    size: {
      sm: 'p-2 text-sm',
      md: 'p-4 text-base',
      lg: 'p-6 text-lg',
    },
  },
  defaultVariants: { tone: 'ink', size: 'md' },
})

export type PanelProps = ComponentProps<'div'> & VariantProps<typeof panelVariants> & { shadow?: boolean }

export function Panel({ className, tone, size, shadow = true, children, ...props }: PanelProps) {
  return (
    <div className={cn(shadow && 'drop-hard', 'min-w-0')} data-slot="panel">
      <div className={cn(panelVariants({ tone, size }), className)} {...props}>
        {children}
      </div>
    </div>
  )
}

/** A label tab across the top of a panel, like an RPG window title. */
export function PanelTitle({
  className,
  children,
  aside,
  ...props
}: ComponentProps<'div'> & { aside?: ReactNode }) {
  return (
    <div className={cn('mb-3 flex items-center gap-2 border-b border-current/15 pb-2', className)} {...props}>
      <span className="font-arcade text-[0.62em] tracking-wider text-gold uppercase">{children}</span>
      {aside && <span className="ml-auto flex items-center gap-1">{aside}</span>}
    </div>
  )
}
