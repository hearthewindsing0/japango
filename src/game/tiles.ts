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
// The diorama palette (see /looks/, option 2): warm, soft, a little pastel,
// like painted clay on a model board.
export const COLORS = {
  ground: '#e6d8c2',
  road: '#7b7c88',
  sidewalk: '#efe2cf',
  footway: '#ead8bb',
  crossing: '#f7efe2',
  laneLine: '#f7efe2',
  grass: '#93c871',
  woods: '#7ab862',
  pitch: '#88c46c',
  water: '#7fc0e6',
  parking: '#a9a9b4',
  shrine: '#e3d3ae',
  trunk: '#a0704a',
  leaves: ['#6cb257', '#7cc062', '#5ea64f', '#8bc96a'],
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
