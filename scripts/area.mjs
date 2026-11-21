// The real-world area the game map covers, read from areas/<id>.json. Pick
// the area with the AREA environment variable (default: roppongi). Make a
// new one with scripts/add-area.mjs.
//
// The playable map is a `width` × `height` meter rectangle centered on
// `center` and turned by `rotationDeg` (counter-clockwise from east), so a
// main street can run straight across the screen. `bbox`, what the fetch
// scripts download, is worked out from that rectangle plus a margin.
import { readFileSync } from 'node:fs'
import { frameToLatLon } from './geo.mjs'

export const AREA_ID = process.env.AREA || 'roppongi'
if (!/^[a-z0-9-]+$/.test(AREA_ID)) throw new Error(`Bad area id "${AREA_ID}"`)

const config = JSON.parse(readFileSync(new URL(`../areas/${AREA_ID}.json`, import.meta.url), 'utf8'))

/** Downloads reach this far past the playable rectangle, in meters. */
const MARGIN = 80

export const AREA = {
  cell: 1,
  rotationDeg: 0,
  spawn: config.center,
  ...config,
  bbox: config.bbox ?? frameBbox(config, MARGIN),
}

function frameBbox(a, m) {
  const corners = [
    [-m, -m],
    [a.width + m, -m],
    [-m, a.height + m],
    [a.width + m, a.height + m],
  ].map(([x, y]) => frameToLatLon(a, x, y))
  const r = (v) => Math.round(v * 1e5) / 1e5
  return {
    south: r(Math.min(...corners.map((c) => c[0]))),
    west: r(Math.min(...corners.map((c) => c[1]))),
    north: r(Math.max(...corners.map((c) => c[0]))),
    east: r(Math.max(...corners.map((c) => c[1]))),
  }
}
