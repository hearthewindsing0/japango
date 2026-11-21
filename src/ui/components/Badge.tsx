import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

/** A keyboard key, for control hints. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'corner-sm inline-flex h-[1.7em] min-w-[1.7em] items-center justify-center bg-paper px-[0.45em] font-arcade text-[0.62em] leading-none text-ink',
        'shadow-[inset_0_-2px_0_var(--color-paper-dim)]',
        className,
      )}
      {...props}
    />
  )
}

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-[0.6em] py-[0.1em] text-[0.85em] font-medium leading-snug whitespace-nowrap', {
  variants: {
    variant: {
      /** 営業中: red on white, like a real noren sign. */
      open: 'bg-paper text-shu font-bold',
      /** 準備中 / 閉店 */
      closed: 'bg-ink-3 text-paper-dim',
      gold: 'bg-kin text-ink',
      shu: 'bg-shu text-paper',
      outline: 'shadow-[inset_0_0_0_1px_currentColor]',
      neon: 'text-sora shadow-[inset_0_0_0_1.5px_var(--color-sora),0_0_8px_rgb(95_211_230/0.5)]',
    },
  },
  defaultVariants: { variant: 'outline' },
})

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** Train line bullet, like the Hibiya line's grey H or the Oedo line's magenta E. */
export function LineBadge({ letter, color, text = '#fff', className }: { letter: string; color: string; text?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex size-[1.6em] items-center justify-center rounded-full font-arcade text-[0.6em] leading-none', className)}
      style={{ background: '#fff', boxShadow: `inset 0 0 0 0.28em ${color}`, color: text === '#fff' ? color : text }}
    >
      {letter}
    </span>
  )
}

const JLPT: Record<number, string> = { 5: '#2f855a', 4: '#2b6cb0', 3: '#b7791f', 2: '#c05621', 1: '#9b2c2c' }

/** JLPT level chip, N5 (easiest) to N1. */
export function JlptBadge({ level, className }: { level: 1 | 2 | 3 | 4 | 5; className?: string }) {
  return (
    <span className={cn('corner-sm inline-block px-[0.45em] py-[0.15em] font-arcade text-[0.6em] text-white', className)} style={{ background: JLPT[level] }}>
      N{level}
    </span>
  )
}
