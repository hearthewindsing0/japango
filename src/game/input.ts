// Keyboard + on-screen d-pad input. Holds the most recently pressed direction
// so that pressing a second arrow key while holding the first turns the player.
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

const held: Dir[] = []
let running = false

const press = (d: Dir) => {
  const i = held.indexOf(d)
  if (i >= 0) held.splice(i, 1)
  held.push(d)
}
const release = (d: Dir) => {
  const i = held.indexOf(d)
  if (i >= 0) held.splice(i, 1)
}

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
    held.length = 0
    running = false
  })
}

export const input = {
  dir: (): Dir | null => held.at(-1) ?? null,
  running: () => running,
  press,
  release,
  setRunning: (v: boolean) => {
    running = v
  },
}

export const DELTA: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}
