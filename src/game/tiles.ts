// Grid cell types. Must match T in scripts/build-map.mjs.
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
  SIDEWALK: 13,
} as const

export const BLOCKED = new Set<number>([T.VOID, T.BUILDING, T.WATER, T.TREE])

/** Shared palette for the 3D world and the minimap. */
export const COLORS = {
  ground: '#d6d3cc',
  road: '#5d6068',
  sidewalk: '#cbc4b8',
  footway: '#dfcdab',
  crossing: '#f2f2f0',
  laneLine: '#f4f4f0',
  grass: '#8cc46a',
  woods: '#6fa95a',
  pitch: '#7cbd64',
  water: '#6eb2e4',
  parking: '#b8b8be',
  shrine: '#dccfac',
  trunk: '#7a5a3c',
  leaves: ['#4f9a4a', '#5aa652', '#3f8a44', '#68b05a'],
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

export const MINIMAP_COLORS: Record<number, [number, number, number]> = {
  [T.VOID]: [20, 20, 24],
  [T.GROUND]: rgb(COLORS.ground),
  [T.ROAD]: rgb(COLORS.road),
  [T.FOOTWAY]: rgb(COLORS.footway),
  [T.GRASS]: rgb(COLORS.grass),
  [T.WATER]: rgb(COLORS.water),
  [T.BUILDING]: [160, 146, 172],
  [T.TREE]: [62, 128, 64],
  [T.CROSSING]: rgb(COLORS.crossing),
  [T.PARKING]: rgb(COLORS.parking),
  [T.WOODS]: rgb(COLORS.woods),
  [T.PITCH]: rgb(COLORS.pitch),
  [T.SHRINE]: rgb(COLORS.shrine),
  [T.SIDEWALK]: rgb(COLORS.sidewalk),
}
