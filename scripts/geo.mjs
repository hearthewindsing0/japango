// The map frame: local equirectangular meters around an area's center,
// turned by its rotationDeg, with (0, 0) at the top-left corner and y
// pointing down the screen. Same math as proj() in build-map.mjs.
const M_PER_DEG_LAT = 110574

const setup = (a) => {
  const th = ((a.rotationDeg ?? 0) * Math.PI) / 180
  return { th, mLon: 111320 * Math.cos((a.center.lat * Math.PI) / 180) }
}

/** [lat, lon] → frame [x, y] in meters. */
export function latLonToFrame(a, lat, lon) {
  const { th, mLon } = setup(a)
  const e = (lon - a.center.lon) * mLon
  const n = (lat - a.center.lat) * M_PER_DEG_LAT
  return [e * Math.cos(th) + n * Math.sin(th) + a.width / 2, -(-e * Math.sin(th) + n * Math.cos(th)) + a.height / 2]
}

/** Frame [x, y] in meters → [lat, lon]. */
export function frameToLatLon(a, x, y) {
  const { th, mLon } = setup(a)
  const fx = x - a.width / 2
  const fn = -(y - a.height / 2)
  const e = fx * Math.cos(th) - fn * Math.sin(th)
  const n = fx * Math.sin(th) + fn * Math.cos(th)
  return [a.center.lat + n / M_PER_DEG_LAT, a.center.lon + e / mLon]
}
