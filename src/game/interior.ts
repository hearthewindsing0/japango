// Places you can walk into: a room (or rooms) below or behind a building's
// front door. The map build finds the door (scripts/interiors.mjs); the
// layout is written in the game, per place (src/game/interiors/). Walking
// works like the stations: flat floors, stairs from the street, and boxes
// you can't walk through (see station.ts).
import type { StationFloor, StationRamp, StationSign } from './station'
import { antnbeeLayout, ANTNBEE } from './interiors/antnbee'

/** Where a place's front door is, from the map build. */
export interface InteriorPlace {
  id: string
  /** Middle of the front, on the building face. */
  x: number
  y: number
  /** Street height there. */
  z: number
  /** Along the building face; into the building is (-uy, ux). */
  ux: number
  uy: number
  /** Length of the building's front. */
  front: number
}

/** Furniture and counters you bump into: boxes like gate cabinets. */
export interface InteriorBlock {
  x: number
  y: number
  ax: number
  ay: number
  hl: number
  hd: number
  z: number
}

export interface InteriorLayout {
  /** Floor height. */
  z: number
  floors: StationFloor[]
  ramps: StationRamp[]
  blocks: InteriorBlock[]
  signs: StationSign[]
}

export interface Interior extends InteriorLayout {
  id: string
  name: string
  nameEn: string
  kind: string
  kindEn: string
  floor: string
  place: InteriorPlace
}

/** The places the game knows how to lay out, by id. */
const KNOWN: Record<string, { layout: (p: InteriorPlace) => InteriorLayout; info: { name: string; nameEn: string; kind: string; kindEn: string; floor: string } }> = {
  antnbee: { layout: antnbeeLayout, info: ANTNBEE },
}

export function buildInteriors(places: InteriorPlace[] | undefined): Interior[] {
  const out: Interior[] = []
  for (const place of places ?? []) {
    const k = KNOWN[place.id]
    if (!k) continue
    const { name, nameEn, kind, kindEn, floor } = k.info
    out.push({ id: place.id, name, nameEn, kind, kindEn, floor, place, ...k.layout(place) })
  }
  return out
}
