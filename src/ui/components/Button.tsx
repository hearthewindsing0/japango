import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

/** Arcade button: chamfered corners and a pressed-in bottom edge. */
export const buttonVariants = cva(
  [
    'notch-sm relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-pixel leading-none',
    'transition-[transform,filter] duration-75 active:translate-y-[2px] active:shadow-[inset_0_-1px_0_rgb(0_0_0/0.45)]',
    'disabled:opacity-40 disabled:saturate-0 disabled:active:translate-y-0',
    'aria-pressed:translate-y-[2px] aria-pressed:shadow-[inset_0_-1px_0_rgb(0_0_0/0.45),inset_0_0_0_2px_var(--color-kin)]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-shu text-paper shadow-[inset_0_-4px_0_var(--color-shu-dark),inset_0_2px_0_rgb(255_255_255/0.25)] hover:brightness-110',
        gold: 'bg-kin text-ink shadow-[inset_0_-4px_0_var(--color-kin-dark),inset_0_2px_0_rgb(255_255_255/0.4)] hover:brightness-105',
        secondary: 'bg-ink-3 text-paper shadow-[inset_0_-4px_0_var(--color-ink),inset_0_2px_0_rgb(255_255_255/0.12)] hover:bg-[#2f2b3d]',
        ghost: 'text-paper hover:bg-white/10',
        outline: 'text-paper shadow-[inset_0_0_0_2px_var(--color-paper)] hover:bg-paper hover:text-ink',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-14 px-6 text-xl',
        icon: 'size-10 text-lg',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
