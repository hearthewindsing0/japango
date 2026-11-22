import { DropdownMenu } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Kbd } from './Badge'
import { useUiScale } from './UiRoot'

export interface MenuItem {
  label: ReactNode
  hint?: ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onSelect?: () => void
}

const itemClass = cn(
  'group relative flex cursor-pointer items-center gap-3 rounded-md py-1.5 pr-3 pl-7 outline-none select-none',
  'data-[highlighted]:bg-paper data-[highlighted]:text-ink data-[disabled]:cursor-default data-[disabled]:opacity-40',
)

/** The blinking ▶ cursor next to the focused item. */
function Cursor() {
  return <span className="absolute left-2 hidden animate-blink text-shu group-data-[highlighted]:inline group-data-[active=true]:inline">▶</span>
}

/** Drop-down menu from a button (settings, options...). */
export function Menu({ trigger, items, label }: { trigger: ReactNode; items: MenuItem[]; label?: ReactNode }) {
  const { scale, theme } = useUiScale()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="start" className="jg-ui z-50 min-w-48 animate-pop drop-hard" data-theme={theme} style={{ zoom: scale }}>
          <div className="corner bg-ink py-1.5 frame">
            <div className="px-1.5">
              {label && <DropdownMenu.Label className="px-3 pb-1 font-arcade text-[0.6em] text-gold">{label}</DropdownMenu.Label>}
              {items.map((it, i) => (
                <DropdownMenu.Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={cn(itemClass, it.danger && 'text-shu')}>
                  <Cursor />
                  <span className="flex-1">
                    {it.label}
                    {it.hint && <span className="block text-[0.75em] opacity-70">{it.hint}</span>}
                  </span>
                  {it.shortcut && <Kbd>{it.shortcut}</Kbd>}
                </DropdownMenu.Item>
              ))}
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * Always-open RPG command list (pause menu, title screen, replies in a
 * conversation). Arrow keys or W/S move, Enter/Space picks, number keys
 * jump straight to an item.
 */
export function ChoiceList({
  items,
  onChoose,
  numbered = false,
  autoFocus = false,
  className,
}: {
  items: MenuItem[]
  onChoose?: (index: number) => void
  numbered?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((i) => !i.disabled)))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  const pick = (i: number) => {
    const it = items[i]
    if (!it || it.disabled) return
    setActive(i)
    it.onSelect?.()
    onChoose?.(i)
  }
  const move = (dir: 1 | -1) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (active + dir * n + items.length) % items.length
      if (!items[i].disabled) return setActive(i)
    }
  }
  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={`choice-${active}`}
      className={cn('outline-none', className)}
      onKeyDown={(e) => {
        const k = e.key
        if (k === 'ArrowDown' || k === 's' || k === 'S') move(1)
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') move(-1)
        else if (k === 'Enter' || k === ' ') pick(active)
        else if (/^[1-9]$/.test(k)) pick(Number(k) - 1)
        else return
        e.preventDefault()
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          id={`choice-${i}`}
          role="option"
          aria-selected={i === active}
          aria-disabled={it.disabled}
          data-active={i === active}
          data-disabled={it.disabled ? '' : undefined}
          onPointerEnter={() => !it.disabled && setActive(i)}
          onClick={() => pick(i)}
          className={cn(itemClass, 'data-[active=true]:bg-paper data-[active=true]:text-ink', it.danger && 'text-shu')}
        >
          <Cursor />
          {numbered && <span className="font-arcade text-[0.6em] opacity-60">{i + 1}</span>}
          <span className="flex-1">
            {it.label}
            {it.hint && <span className="block text-[0.75em] opacity-70">{it.hint}</span>}
          </span>
          {it.shortcut && <Kbd>{it.shortcut}</Kbd>}
        </div>
      ))}
    </div>
  )
}
