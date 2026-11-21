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
  // Roppongi plus: Hinokicho Park and the Akasaka 9-chome blocks around it
  // (north), Nishi-Azabu past Gonpachi (west), and Azabudai Hills (south).
  bbox: { south: 35.6495, west: 139.7154, north: 35.6755, east: 139.747 },
  center: { lat: 35.66252, lon: 139.73117 },
  // Roppongi-dori's bearing, counter-clockwise from east. Turning the map by
  // this much makes Roppongi-dori horizontal.
  rotationDeg: 30.7,
  width: 1920,
  height: 1940,
  // Collision and minimap grid resolution, in meters.
  cell: 1,
  // Where the player starts: Roppongi Crossing (六本木交差点).
  spawn: { lat: 35.663173, lon: 139.732354 },
}
