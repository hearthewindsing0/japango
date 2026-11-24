// Every place people in the area go: homes, offices, shops, bars, karaoke,
// station exits, and "away" spots at the map edge where people walk in from
// or out to the rest of Tokyo. Each place gets a stable id, a door (a paved
// cell people stand on in front of it) and its opening hours when known.
//
//   bun scripts/life/places.mjs      (AREA=<id> for another area)
//
// Writes public/life/<area>/places.json, which the day-plan generator picks
// from and the game reads.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { AREA, AREA_ID } from '../area.mjs'
import { latLonToFrame } from '../geo.mjs'
import { parseOpeningHours } from '../opening-hours.mjs'
import { cuisineLabel } from '../cuisine.mjs'
import { loadWalkGrid, nearestCell, PAVED } from './walk.mjs'

const grid = await loadWalkGrid(AREA_ID)
const { W, H, cells, main, map } = grid
const osm = JSON.parse(await readFile(`data/${AREA_ID}.osm.json`, 'utf8'))

/** What kind of place this is for people's days, or null to skip it. */
function kindOf(t) {
  if (t.amenity === 'karaoke_box' || t.leisure === 'karaoke') return 'karaoke'
  if (t.amenity === 'pub' || t.cuisine === 'izakaya') return 'izakaya'
  if (t.amenity === 'bar' || t.amenity === 'biergarten') return 'bar'
  if (t.amenity === 'nightclub') return 'club'
  if (t.amenity === 'restaurant') return /ramen|noodle|soba|udon/.test(t.cuisine ?? '') ? 'noodles' : 'restaurant'
  if (t.amenity === 'fast_food') return 'fastfood'
  if (t.amenity === 'cafe' || t.shop === 'coffee' || t.shop === 'bakery') return 'cafe'
  if (t.shop === 'convenience') return 'konbini'
  if (t.shop === 'supermarket') return 'supermarket'
  if (t.amenity === 'pharmacy' || t.shop === 'chemist') return 'drugstore'
  if (['doctors', 'dentist', 'clinic', 'hospital'].includes(t.amenity)) return 'clinic'
  if (['school', 'university', 'college', 'kindergarten'].includes(t.amenity)) return 'school'
  if (t.amenity === 'place_of_worship') return 'shrine'
  if (t.leisure === 'park' || t.leisure === 'playground') return 'park'
  if (t.leisure === 'fitness_centre' || t.leisure === 'sports_centre') return 'gym'
  if (['museum', 'gallery', 'attraction', 'viewpoint'].includes(t.tourism) || t.amenity === 'arts_centre' || t.amenity === 'theatre' || t.amenity === 'cinema') return 'sight'
  if (['hotel', 'hostel', 'guest_house'].includes(t.tourism)) return 'hotel'
  if (t.amenity === 'post_office' || t.amenity === 'bank' || t.amenity === 'police') return 'errand'
  if (t.shop && t.shop !== 'vacant') return 'shop'
  if (t.office || t.amenity === 'embassy' || ['office', 'commercial'].includes(t.building)) return t.name ? 'office' : null
  if (['apartments', 'residential', 'house', 'dormitory', 'detached', 'terrace'].includes(t.building)) return 'home'
  return null
}

const KIND_EN = {
  karaoke: 'Karaoke', izakaya: 'Izakaya', bar: 'Bar', club: 'Club', noodles: 'Noodles', restaurant: 'Restaurant',
  fastfood: 'Fast food', cafe: 'Café', konbini: 'Convenience store', supermarket: 'Supermarket', drugstore: 'Drugstore',
  clinic: 'Clinic', school: 'School', shrine: 'Shrine', park: 'Park', gym: 'Gym', sight: 'Sight', hotel: 'Hotel',
  errand: 'Errand', shop: 'Shop', office: 'Office', home: 'Apartments',
}

function where(el) {
  if (el.pos) return el.pos
  const pts = el.geom ?? el.members?.flatMap((m) => m.geom ?? [])
  if (!pts?.length) return null
  let la = 0
  let lo = 0
  for (const [a, b] of pts) {
    la += a
    lo += b
  }
  return [la / pts.length, lo / pts.length]
}

const paved = (i) => main[i] && PAVED.has(cells[i])
const places = []
const seen = new Set()

function add(p, x, y) {
  if (x < 2 || y < 2 || x > W - 2 || y > H - 2) return
  const door = nearestCell(grid, x, y, paved, 40)
  if (!door) return
  if (seen.has(p.id)) return
  seen.add(p.id)
  places.push({ ...p, x: +x.toFixed(1), y: +y.toFixed(1), door: { x: door.x, y: door.y } })
}

for (const el of osm.elements) {
  const t = el.tags
  if (!t) continue
  const kind = kindOf(t)
  if (!kind) continue
  if (kind !== 'home' && !t.name) continue
  const ll = where(el)
  if (!ll) continue
  const [x, y] = latLonToFrame(AREA, ll[0], ll[1])
  const p = { id: `${kind}-${el.type[0]}${el.id}`, kind, name: t.name ?? null, nameEn: t['name:en'] ?? null }
  if (kind === 'home') {
    p.name ??= t['addr:housename'] ?? null
    p.size = Math.max(1, Math.round((+t['building:levels'] || 3) * (el.geom?.length > 8 ? 3 : 1)))
  }
  if (t.cuisine) p.cuisine = cuisineLabel(t.cuisine)?.en ?? t.cuisine
  const oh = parseOpeningHours(t.opening_hours)
  if (oh) p.hours = oh
  add(p, x, y)
}

// Station exits, one per exit of each station on the map ("exit-H04-1b").
for (const st of map.stations)
  (st.exits ?? []).forEach((e, k) => {
    const ref = e.ref || `x${k}`
    const label = e.ref ? `${e.ref}番出口` : '出口'
    add({
      id: `exit-${st.id}-${ref}`.toLowerCase(), kind: 'exit', station: st.id,
      name: `${st.name}駅 ${label}`, nameEn: `${st.nameEn} Stn ${e.ref ? `Exit ${e.ref}` : 'exit'} (${st.line?.en ?? ''})`,
    }, e.x, e.y)
  })

// Away: where a street or footpath leaves the map, people come in from and
// leave to the rest of the city. One spot per street end (within 60 m).
function streetNear(x, y) {
  let best = null
  let bd = 60
  for (const s of map.streets)
    for (const [sx, sy] of s.pts) {
      const d = Math.hypot(sx - x, sy - y)
      if (d < bd) [bd, best] = [d, s]
    }
  return best
}
const SIDE_JA = { north: '北', south: '南', west: '西', east: '東' }
const ends = []
for (const r of [...map.roads.filter((r) => !r.b), ...map.paths])
  for (const k of [0, r.p.length - 2]) {
    const x = r.p[k]
    const y = r.p[k + 1]
    const side = y < 4 ? 'north' : y > H - 4 ? 'south' : x < 4 ? 'west' : x > W - 4 ? 'east' : null
    if (!side || ends.some((e) => Math.hypot(e.x - x, e.y - y) < 60)) continue
    const c = { north: [x, 3], south: [x, H - 3], west: [3, y], east: [W - 3, y] }[side]
    const door = nearestCell(grid, c[0], c[1], paved, 25) ?? nearestCell(grid, c[0], c[1], (i) => main[i], 25)
    if (!door) continue
    ends.push({ x, y })
    const s = streetNear(x, y)
    places.push({
      id: `away-${side}-${Math.round(side === 'north' || side === 'south' ? x : y)}`,
      kind: 'away',
      name: s ? `${s.name}（${SIDE_JA[side]}）` : `${SIDE_JA[side]}の端`,
      nameEn: s ? `${s.nameEn ?? s.name} (${side})` : `${side} edge`,
      x: door.x, y: door.y, door,
    })
  }

// Landmarks modelled by hand in the game (data/places/<area>.landmarks.json):
// each is a place people can go to, meet at, or work in. When OSM already
// gave the same spot a place, that place is tagged (and keeps its id, which
// older day plans use); otherwise the landmark gets one of its own.
const landmarksFile = `data/places/${AREA_ID}.landmarks.json`
if (existsSync(landmarksFile)) {
  const { landmarks } = JSON.parse(await readFile(landmarksFile, 'utf8'))
  const byOsm = new Map(osm.elements.map((e) => [`${e.type[0]}${e.id}`, e]))
  for (const lm of landmarks) {
    const ref = lm.osm ? `${(lm.osmType ?? 'node')[0]}${lm.osm}` : null
    const el = ref ? byOsm.get(ref) : null
    const ll = (el && where(el)) ?? (lm.lat != null ? [lm.lat, lm.lon] : null)
    if (!ll) {
      console.warn(`Landmark ${lm.id}: no position`)
      continue
    }
    const tag = { landmark: lm.id, name: lm.ja, nameEn: lm.en, kind: lm.life, ...(lm.meet ? { meet: true } : {}) }
    const old = ref ? places.find((p) => p.id.endsWith(`-${ref}`)) : null
    if (old) {
      Object.assign(old, tag)
      continue
    }
    const [x, y] = latLonToFrame(AREA, ll[0], ll[1])
    const p = { id: `landmark-${lm.id}`, ...tag }
    const oh = el && parseOpeningHours(el.tags?.opening_hours)
    if (oh) p.hours = oh
    if (lm.door) {
      const [dx, dy] = latLonToFrame(AREA, lm.door.lat, lm.door.lon)
      const door = nearestCell(grid, dx, dy, paved, 40)
      if (door && dx >= 2 && dy >= 2 && dx <= W - 2 && dy <= H - 2) {
        places.push({ ...p, x: +x.toFixed(1), y: +y.toFixed(1), door: { x: door.x, y: door.y } })
        continue
      }
    }
    add(p, x, y)
  }
}

const byKind = {}
for (const p of places) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1
await mkdir(`public/life/${AREA_ID}`, { recursive: true })
await writeFile(
  `public/life/${AREA_ID}/places.json`,
  JSON.stringify({ area: AREA_ID, about: 'Where people go. Made by scripts/life/places.mjs from OpenStreetMap; door = where people stand outside, hours = 7 days (Mon first) of [open, close] minutes.', kinds: KIND_EN, places }),
)
console.log(places.length, 'places', byKind)
