import type { ReactNode } from 'react'

/** A tweakable prop, shown as a control in the props panel. */
export type Control =
  | { type: 'text'; default: string; multiline?: boolean }
  | { type: 'boolean'; default: boolean }
  | { type: 'select'; default: string; options: string[] }
  | { type: 'number'; default: number; min: number; max: number; step?: number }
  | { type: 'color'; default: string }

export type Controls = Record<string, Control>

export type PropsOf<C extends Controls> = {
  [K in keyof C]: C[K] extends { type: 'boolean' } ? boolean : C[K] extends { type: 'number' } ? number : string
}

/** Logs an event (a callback prop firing) to the Actions panel. */
export type Log = (name: string, ...args: unknown[]) => void

export interface Story<C extends Controls = Controls> {
  id: string
  group: string
  name: string
  /** Component name, for the JSX snippet. */
  component: string
  description: string
  controls: C
  /** Props never shown as controls but printed in the snippet. */
  fixed?: string
  /** "fill" stories (screens) take the whole stage. */
  layout?: 'center' | 'fill'
  render: (props: PropsOf<C>, log: Log) => ReactNode
}

/** Helper that keeps the controls' types for render(). */
export function story<C extends Controls>(s: Story<C>): Story {
  return s as unknown as Story
}
