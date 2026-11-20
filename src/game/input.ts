// Keyboard + on-screen d-pad input, read as a movement vector.
export type Dir = 'up' | 'down' | 'left' | 'right'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const held = new Set<Dir>()
let running = false

const press = (d: Dir) => held.add(d)
const release = (d: Dir) => held.delete(d)

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running = true
    const d = KEYS[e.code]
    if (d) {
      e.preventDefault()
      press(d)
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running = false
    const d = KEYS[e.code]
    if (d) release(d)
  })
  window.addEventListener('blur', () => {
    held.clear()
    running = false
  })
}

export const input = {
  /** Unit vector in screen terms: x right, y down. Zero when idle. */
  vector(): [number, number] {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0)
    const len = Math.hypot(x, y)
    return len ? [x / len, y / len] : [0, 0]
  },
  running: () => running,
  press,
  release,
}
