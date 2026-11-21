import { Toast as RxToast } from 'radix-ui'
import { useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useUiScale } from './UiRoot'

export type ToastKind = 'stamp' | 'info' | 'discovery' | 'warn'

interface ToastItem {
  id: number
  kind: ToastKind
  title: ReactNode
  body?: ReactNode
  duration: number
}

// A tiny store so any code (game loop included) can call toast().
let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Show a toast from anywhere: toast({ kind: 'stamp', title: 'スタンプ GET!' }). */
export function toast(t: { kind?: ToastKind; title: ReactNode; body?: ReactNode; duration?: number }) {
  const item = { id: nextId++, kind: t.kind ?? 'info', title: t.title, body: t.body, duration: t.duration ?? 3500 }
  items = [...items.slice(-3), item]
  emit()
  return item.id
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

const ICON: Record<ToastKind, string> = { stamp: '🎴', info: '✦', discovery: '★', warn: '!' }
const TONE: Record<ToastKind, string> = {
  stamp: 'bg-shu text-paper',
  info: 'bg-ink text-paper frame',
  discovery: 'bg-ink text-paper frame-gold',
  warn: 'bg-kin text-ink',
}

/** Renders toasts. Put one inside your UiRoot. */
export function Toaster({ position = 'top' }: { position?: 'top' | 'bottom' }) {
  const list = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => items,
  )
  const { scale } = useUiScale()
  return (
    <RxToast.Provider swipeDirection="up">
      {list.map((t) => (
        <RxToast.Root
          key={t.id}
          duration={t.duration}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="animate-pop drop-hard data-[state=closed]:opacity-0 data-[swipe=end]:-translate-y-[var(--radix-toast-swipe-end-y)]"
        >
          <div className={cn('corner flex items-center gap-3 px-5 py-3', TONE[t.kind])}>
            <span className={cn('text-2xl', t.kind === 'stamp' && 'animate-stamp')}>{ICON[t.kind]}</span>
            <div className="min-w-0">
              <RxToast.Title className="text-xl leading-tight">{t.title}</RxToast.Title>
              {t.body && <RxToast.Description className="text-sm opacity-80">{t.body}</RxToast.Description>}
            </div>
          </div>
        </RxToast.Root>
      ))}
      <RxToast.Viewport
        className={cn(
          'jg-ui fixed left-1/2 z-50 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 outline-none',
          position === 'top' ? 'top-[18%]' : 'bottom-[18%]',
        )}
        style={{ zoom: scale }}
      />
    </RxToast.Provider>
  )
}
