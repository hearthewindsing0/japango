// The traffic lights: every light runs the same cycle, by the Tokyo clock,
// so the cars (traffic.ts) and the people walking (life.ts) see the same
// colours. Along a street the lights are staggered a little, a green wave.

/** Signal cycle, seconds: green, amber and all-red for the east-west
 *  streets, then the same for north-south. */
const GREEN = 28
const AMBER = 3
const ALL_RED = 3
const CYCLE = 2 * (GREEN + AMBER + ALL_RED)

/** 0: green, 1: amber, 2: red, for a light on a street along `axis` at x. */
export function signalState(time: number, axis: 0 | 1, x: number) {
  let t = (time + x / 14) % CYCLE
  if (t < 0) t += CYCLE
  if (axis === 1) t = (t + CYCLE / 2) % CYCLE
  return t < GREEN ? 0 : t < GREEN + AMBER ? 1 : 2
}

/** Whether the green man is lit at a zebra across a street along `axis`
 *  at x: while the cross streets have green. */
export function walkSignal(time: number, axis: 0 | 1, x: number) {
  return signalState(time, axis === 0 ? 1 : 0, x) === 0
}
