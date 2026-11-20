// The real-world area the game map covers. Change these and re-run
// `npm run map:fetch && npm run map:build` to cover a different area.
export const AREA = {
  id: 'roppongi',
  name: '六本木',
  nameEn: 'Roppongi',
  // Roughly Nishi-Azabu / Roppongi Hills in the west to Tokyo Midtown in the north-east.
  bbox: { south: 35.6565, west: 139.7235, north: 35.669, east: 139.7385 },
  // Meters per tile. 2m ≈ one person per tile, like a classic top-down RPG.
  tileSize: 2,
  // Where the player starts: Roppongi Crossing (六本木交差点).
  spawn: { lat: 35.66275, lon: 139.73157 },
}
