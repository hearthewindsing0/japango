import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useUiScale } from './UiRoot'

/**
 * Modal window with a title bar, for the stamp book, settings, pause menu.
 * Esc or the ✕ closes it. `trigger` is optional; control it with
 * `open` / `onOpenChange` instead if you like.
 */
export function Window({
  title,
  subtitle,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  footer,
  tone = 'ink',
  width = 520,
  modal = true,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  trigger?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  footer?: ReactNode
  tone?: 'ink' | 'paper'
  width?: number
  modal?: boolean
  children: ReactNode
}) {
  const { scale } = useUiScale()
  return (
    <Dialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        {modal && <Dialog.Overlay className="fixed inset-0 z-40 bg-[repeating-linear-gradient(45deg,rgb(13_12_18/0.75)_0_4px,rgb(13_12_18/0.6)_4px_8px)]" />}
        <Dialog.Content
          className="jg-ui fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[min(var(--w),calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-pop drop-hard"
          style={{ zoom: scale, ['--w' as string]: `${width}px` }}
          aria-describedby={undefined}
        >
          <div
            className={cn(
              'notch flex max-h-[inherit] flex-col overflow-hidden frame',
              tone === 'ink' ? 'bg-ink text-paper' : 'bg-paper text-ink [&_rt]:text-ink/60',
            )}
          >
            <div className="flex items-center gap-3 bg-shu px-4 py-2 text-paper m-[2px] mb-0">
              <Dialog.Title className="flex min-w-0 flex-1 items-baseline gap-2 text-lg leading-tight">
                <span className="truncate">{title}</span>
                {subtitle && <span className="truncate text-[0.75em] text-paper/75">{subtitle}</span>}
              </Dialog.Title>
              <Dialog.Close className="notch-sm grid size-7 place-items-center bg-ink text-paper hover:bg-paper hover:text-ink" aria-label="Close">
                ✕
              </Dialog.Close>
            </div>
            <div className="min-h-0 overflow-auto px-5 py-4 mx-[2px]">{children}</div>
            {footer && <div className="mx-[2px] mb-[2px] flex justify-end gap-2 border-t border-current/15 px-5 py-3">{footer}</div>}
            {!footer && <div className="h-[2px]" />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const WindowClose = Dialog.Close
