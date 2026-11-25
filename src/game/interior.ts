// Places you can walk into: a room (or rooms) below or behind a building's
// front door. The map build finds the door (scripts/interiors.mjs); the
// layout is written in the game, per place (src/game/interiors/). Walking
// works like the stations: flat floors, stairs from the street, and boxes
// you can't walk through (see station.ts).
import type { StationFloor, StationRamp, StationSign } from './station'
import { antnbeeLayout, ANTNBEE } from './interiors/antnbee'
import { donkiLayout, DONKI } from './interiors/donki'
import { nactLayout, NACT } from './interiors/nact'
import { starbucksLayout, STARBUCKS } from './interiors/starbucks'

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
  /** A ground-floor room worked out from the building's outline (landmarks
   *  found in the game, not the map build): its extent along the front and
   *  how deep it goes, in meters from the door. */
  room?: { a0: number; a1: number; depth: number }
  /** Or a free-form floor in map meters (flat x, y list), with named spots
   *  in it (map meters), for rooms that follow a curved wall. */
  poly?: number[]
  /** The first this many edges of `poly` are glass (the rest solid wall). */
  glass?: number
  spots?: Record<string, [number, number]>
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

/** What the HUD says about a place. */
export interface InteriorInfo {
  name: string
  nameEn: string
  kind: string
  kindEn: string
  floor: string
  /** Short floor chip (B1, 1F) and the floor in English. */
  chip: string
  floorEn: string
  /** The sign by the door, and how to go in. */
  door: { t: string; en: string; n: string }
  enter: string
}

export interface Interior extends InteriorLayout, InteriorInfo {
  id: string
  place: InteriorPlace
}

/** The places the game knows how to lay out, by id. */
const KNOWN: Record<string, { layout: (p: InteriorPlace) => InteriorLayout; info: InteriorInfo }> = {
  antnbee: {
    layout: antnbeeLayout,
    info: { ...ANTNBEE, chip: 'B1', floorEn: 'basement 1', door: ANTNBEE.signs.street, enter: 'Walk down the stairs to go in.' },
  },
  donki: { layout: donkiLayout, info: DONKI },
  nact: { layout: nactLayout, info: NACT },
  starbucks: { layout: starbucksLayout, info: STARBUCKS },
}

export function buildInteriors(places: InteriorPlace[] | undefined): Interior[] {
  const out: Interior[] = []
  for (const place of places ?? []) {
    const k = KNOWN[place.id]
    if (!k) continue
    const { name, nameEn, kind, kindEn, floor, chip, floorEn, door, enter } = k.info
    out.push({ id: place.id, name, nameEn, kind, kindEn, floor, chip, floorEn, door, enter, place, ...k.layout(place) })
  }
  return out
}
