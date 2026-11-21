import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../lib/cn'

/** The A−/A+ steps, same as the game's HUD (src/game/hud.ts). */
export const UI_SIZES = [1, 1.5, 2, 3, 4] as const

interface UiScale {
  scale: number
  setScale: (s: number) => void
  step: (dir: 1 | -1) => void
}

const UiScaleContext = createContext<UiScale>({ scale: 1, setScale: () => {}, step: () => {} })

/** Current UI scale and the A−/A+ stepper. */
export function useUiScale() {
  return useContext(UiScaleContext)
}

/**
 * Root for every piece of game UI. Sets the theme scope (.jg-ui) and scales
 * everything inside as one with CSS zoom, so layouts reflow at the bigger
 * size instead of overflowing. Controlled (`scale` + `onScaleChange`) or not.
 */
export function UiRoot({
  scale: controlled,
  defaultScale = 1,
  onScaleChange,
  className,
  style,
  children,
}: {
  scale?: number
  defaultScale?: number
  onScaleChange?: (s: number) => void
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const [own, setOwn] = useState(defaultScale)
  const scale = controlled ?? own
  const setScale = useCallback(
    (s: number) => {
      setOwn(s)
      onScaleChange?.(s)
    },
    [onScaleChange],
  )
  const step = useCallback(
    (dir: 1 | -1) => {
      const i = UI_SIZES.findIndex((v) => v >= scale)
      const next = UI_SIZES[Math.max(0, Math.min(UI_SIZES.length - 1, (i < 0 ? UI_SIZES.length - 1 : i) + dir))]
      setScale(next)
    },
    [scale, setScale],
  )
  const value = useMemo(() => ({ scale, setScale, step }), [scale, setScale, step])
  return (
    <UiScaleContext.Provider value={value}>
      <div className={cn('jg-ui', className)} style={{ zoom: scale, ...style }}>
        {children}
      </div>
    </UiScaleContext.Provider>
  )
}
