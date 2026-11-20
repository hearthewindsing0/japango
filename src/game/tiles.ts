// Tile types. Must match T in scripts/build-map.mjs.
export const T = {
  VOID: 0,
  GROUND: 1,
  ROAD: 2,
  FOOTWAY: 3,
  GRASS: 4,
  WATER: 5,
  BUILDING: 6,
  TREE: 7,
  CROSSING: 8,
  PARKING: 9,
  WOODS: 10,
  PITCH: 11,
  SHRINE: 12,
} as const

export const BLOCKED = new Set<number>([T.VOID, T.BUILDING, T.WATER, T.TREE])

// Flat colors, used by the minimap. The main map shader has its own palette.
export const MINIMAP_COLORS: Record<number, [number, number, number]> = {
  [T.VOID]: [20, 20, 24],
  [T.GROUND]: [214, 211, 204],
  [T.ROAD]: [96, 98, 106],
  [T.FOOTWAY]: [226, 208, 176],
  [T.GRASS]: [126, 186, 98],
  [T.WATER]: [92, 160, 222],
  [T.BUILDING]: [168, 148, 176],
  [T.TREE]: [62, 128, 64],
  [T.CROSSING]: [240, 240, 240],
  [T.PARKING]: [180, 180, 186],
  [T.WOODS]: [86, 150, 78],
  [T.PITCH]: [104, 170, 96],
  [T.SHRINE]: [210, 196, 160],
}
