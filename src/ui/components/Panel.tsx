import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * The basic HUD box. A clean pixel frame with cut corners and a hard
 * shadow. The shadow sits on an outer wrapper because clip-path would cut it.
 */
export const panelVariants = cva('notch relative p-4', {
  variants: {
    tone: {
      ink: 'bg-ink/92 text-paper frame',
      paper: 'bg-paper text-ink [box-shadow:inset_0_0_0_2px_rgb(13_12_18/0.15)] [&_rt]:text-ink/60',
      gold: 'bg-ink/92 text-paper frame-gold',
      alert: 'bg-shu text-paper',
      glass: 'bg-ink/70 text-paper backdrop-blur-sm [box-shadow:inset_0_0_0_2px_rgb(244_236_216/0.35)]',
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
      <span className="font-arcade text-[0.7em] tracking-wider text-kin uppercase">{children}</span>
      {aside && <span className="ml-auto flex items-center gap-1">{aside}</span>}
    </div>
  )
}
