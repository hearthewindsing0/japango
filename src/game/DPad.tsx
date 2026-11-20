import { input, turnView, type Dir } from './input'

/** On-screen arrows for touch screens. */
export function DPad() {
  const btn = (d: Dir, label: string) => (
    <button
      className={`dpad-${d}`}
      aria-label={d}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        input.press(d)
      }}
      onPointerUp={() => input.release(d)}
      onPointerCancel={() => input.release(d)}
    >
      {label}
    </button>
  )
  return (
    <div className="dpad">
      {btn('up', '▲')}
      {btn('left', '◀')}
      {btn('right', '▶')}
      {btn('down', '▼')}
      <button className="dpad-turn-l" aria-label="Turn view left" onClick={() => turnView(-1)}>
        ⟲
      </button>
      <button className="dpad-turn-r" aria-label="Turn view right" onClick={() => turnView(1)}>
        ⟳
      </button>
    </div>
  )
}
