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

/** Which way the camera looks. yaw turns smoothly toward target (radians;
 *  0 = looking along the map's "up"). Q/E turn a quarter, R resets, and a
 *  right-drag on the view turns freely. */
export const view = { yaw: 0, target: 0 }
export const turnView = (quarters: number) => {
  view.target = Math.round(view.target / (Math.PI / 2) + quarters) * (Math.PI / 2)
}

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
    if (!e.repeat && e.code === 'KeyQ') turnView(-1)
    if (!e.repeat && e.code === 'KeyE') turnView(1)
    if (!e.repeat && e.code === 'KeyR') view.target = Math.round(view.yaw / (Math.PI * 2)) * Math.PI * 2
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
  /** Unit vector in map terms (x right, y down on the unturned map), after
   *  turning screen directions by the camera's yaw. Zero when idle. */
  vector(): [number, number] {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0)
    const len = Math.hypot(x, y)
    if (!len) return [0, 0]
    const c = Math.cos(view.yaw)
    const s = Math.sin(view.yaw)
    return [(x * c + y * s) / len, (-x * s + y * c) / len]
  },
  running: () => running,
  press,
  release,
}
