// The real-world area the game map covers.
//
// `bbox` is what scripts/fetch-osm.mjs downloads. The playable map is a
// `width` × `height` meter rectangle centered on `center` and turned by
// `rotationDeg`, so that the main street runs straight across the screen.
// It must fit inside the downloaded bbox. To grow it, enlarge the bbox too
// and re-run `npm run map:fetch && npm run map:build`.
export const AREA = {
  id: 'roppongi',
  name: '六本木',
  nameEn: 'Roppongi',
  bbox: { south: 35.6565, west: 139.7235, north: 35.669, east: 139.7385 },
  center: { lat: 35.66275, lon: 139.731 },
  // Roppongi-dori's bearing, counter-clockwise from east. Turning the map by
  // this much makes Roppongi-dori horizontal.
  rotationDeg: 30.7,
  width: 1100,
  height: 800,
  // Collision and minimap grid resolution, in meters.
  cell: 1,
  // Where the player starts: Roppongi Crossing (六本木交差点).
  spawn: { lat: 35.66275, lon: 139.73157 },
}
