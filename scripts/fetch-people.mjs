// How many people are around the area, measured: MLIT's people-flow open
// data (全国の人流オープンデータ, 1kmメッシュ別の滞在人口). It counts the
// people present in each 1 km mesh square (国土 3次メッシュ), as a daily
// average for every month of 2019-2021, split into weekdays and holidays
// (Sat, Sun and public holidays) and three times of day:
//   昼   midday, the average over 11:00-14:59
//   深夜 the small hours, the average over 1:00-4:59
//   終日 the whole day, the average over 0:00-23:59
// The numbers are Agoop's estimates from phone location data, scaled up to
// the whole population. We keep 2019, the last year before the pandemic.
//
// Saves data/<area>.people.json: the mesh squares that touch the area, each
// with its outline in map meters and its numbers by month. build-map.mjs
// passes it on to the tile manifest, and src/game/people-flow.ts turns it
// into an hour-by-hour estimate.
//
// Source: https://www.geospatial.jp/ckan/dataset/mlit-1km-fromto
// License: 政府標準利用規約（第2.0版）, compatible with CC BY 4.0. Credit:
// 「全国の人流オープンデータ」（国土交通省）.
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AREA } from './area.mjs'
import { latLonToFrame } from './geo.mjs'

const YEAR = Number(process.env.PEOPLE_YEAR || 2019)
const DATASET = 'mlit-1km-fromto'
const CKAN = 'https://www.geospatial.jp/ckan/api/3/action'
// The files themselves sit in G空間情報センター's public S3 bucket. Used
// when the catalog can't be reached.
const BUCKET = 'https://gsic-opendata.s3.amazonaws.com/ckan/resources'
const KNOWN = { 13: '3b69ffab-2fb8-4901-9cf3-9da2c19e3351' }
const UA = { 'User-Agent': 'japango-map-builder/0.1 (game map data script)' }

async function get(url, as = 'json', tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (res.ok) return as === 'json' ? res.json() : new Uint8Array(await res.arrayBuffer())
      if (res.status === 404) return null
      console.warn(`${res.status} ${url}; retrying`)
    } catch (e) {
      console.warn(`${e.message} ${url}; retrying`)
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
  }
  return null
}

// ── Which mesh squares the area touches ────────────────────────────────
// A 3rd-order mesh code is pp uu q v r w: 40′ × 1° first-order squares,
// split 8 × 8, then 10 × 10, so each square is 30″ of latitude by 45″ of
// longitude (about 925 m × 1.13 km here).
const LAT = 1 / 120
const LON = 1 / 80
function meshOf(lat, lon) {
  const p = Math.floor(lat * 1.5)
  const u = Math.floor(lon - 100)
  const q = Math.floor((lat * 1.5 - p) * 8)
  const v = Math.floor((lon - 100 - u) * 8)
  const r = Math.floor(((lat * 1.5 - p) * 8 - q) * 10)
  const w = Math.floor(((lon - 100 - u) * 8 - v) * 10)
  return `${p}${String(u).padStart(2, '0')}${q}${v}${r}${w}`
}
function meshSouthWest(code) {
  const p = +code.slice(0, 2)
  const u = +code.slice(2, 4)
  const q = +code[4]
  const v = +code[5]
  const r = +code[6]
  const w = +code[7]
  return [p / 1.5 + q / 12 + r / 120, u + 100 + v / 8 + w / 80]
}

const { south, west, north, east } = AREA.bbox
const codes = new Set()
for (let lat = south; lat < north + LAT; lat += LAT / 2)
  for (let lon = west; lon < east + LON; lon += LON / 2) codes.add(meshOf(Math.min(lat, north), Math.min(lon, east)))

// ── Which prefecture's file to read ────────────────────────────────────
async function prefecture() {
  if (AREA.pref) return Number(AREA.pref)
  const { lat, lon } = AREA.center
  const j = await get(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`)
  const muni = j?.results?.muniCd
  if (muni) return Number(String(muni).slice(0, -3))
  console.warn('Could not look up the prefecture; assuming Tokyo (13). Set "pref" in the area file to choose.')
  return 13
}
const pref = await prefecture()
const pp = String(pref).padStart(2, '0')

async function download() {
  const pkg = await get(`${CKAN}/package_show?id=${DATASET}`)
  const res = pkg?.result?.resources?.find((r) => r.name?.startsWith(`monthly_mdp_mesh1km_${pp}`))
  if (res?.url) {
    const zip = await get(res.url, 'bytes')
    if (zip) return { zip, url: res.url }
  }
  const id = res?.id ?? KNOWN[pref]
  if (!id) throw new Error(`No people-flow file found for prefecture ${pp}`)
  const url = `${BUCKET}/${id}/monthly_mdp_mesh1km_${pp}.zip`
  const zip = await get(url, 'bytes')
  if (!zip) throw new Error(`Download failed: ${url}`)
  return { zip, url }
}

console.log(`People flow for ${AREA.nameEn}: ${codes.size} mesh squares in prefecture ${pp}, ${YEAR}`)
const { zip } = await download()

// The prefecture zip holds one zip per month, each with one CSV.
const dir = await mkdtemp(join(tmpdir(), 'people-'))
const months = {}
try {
  await writeFile(join(dir, 'all.zip'), zip)
  for (let m = 1; m <= 12; m++) {
    const inner = `${pp}/${YEAR}/${String(m).padStart(2, '0')}/monthly_mdp_mesh1km.csv.zip`
    const monthZip = execFileSync('unzip', ['-p', join(dir, 'all.zip'), inner], { maxBuffer: 1 << 28 })
    await writeFile(join(dir, 'm.zip'), monthZip)
    months[m] = execFileSync('unzip', ['-p', join(dir, 'm.zip')], { maxBuffer: 1 << 28 }).toString('utf8')
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}

// mesh → { wd | ho } → month (0-11) → [midday, small hours, whole day]
const DAY = { 0: 'ho', 1: 'wd' } // dayflag: 0 休日, 1 平日 (2 全日 is skipped)
const TZ = { 0: 0, 1: 1, 2: 2 } // timezone: 0 昼, 1 深夜, 2 終日
const found = new Map()
for (const [m, csv] of Object.entries(months)) {
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [mesh, , , , , dayflag, timezone, population] = line.split(',')
    if (!codes.has(mesh) || !(dayflag in DAY)) continue
    const rec = found.get(mesh) ?? { wd: [], ho: [] }
    found.set(mesh, rec)
    const k = DAY[dayflag]
    rec[k][m - 1] ??= [0, 0, 0]
    rec[k][m - 1][TZ[timezone]] = Number(population)
  }
}

const round = (v) => Math.round(v * 10) / 10
const meshes = [...found]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, rec]) => {
    const [s, w] = meshSouthWest(id)
    // Outline in map meters (a slightly turned rectangle).
    const corners = [
      [s, w],
      [s, w + LON],
      [s + LAT, w + LON],
      [s + LAT, w],
    ].flatMap(([la, lo]) => latLonToFrame(AREA, la, lo).map(round))
    const center = latLonToFrame(AREA, s + LAT / 2, w + LON / 2).map(round)
    // A month missing from the file borrows its neighbor's numbers.
    for (const k of ['wd', 'ho'])
      for (let m = 0; m < 12; m++) rec[k][m] ??= rec[k][(m + 11) % 12] ?? rec[k][(m + 1) % 12] ?? [0, 0, 0]
    return { id, c: center, p: corners, wd: rec.wd, ho: rec.ho }
  })

if (!meshes.length) throw new Error('None of the area\'s mesh squares are in the file')
const out = {
  source: '全国の人流オープンデータ（1kmメッシュ別の滞在人口）',
  url: 'https://www.geospatial.jp/ckan/dataset/mlit-1km-fromto',
  attribution: '「全国の人流オープンデータ」（国土交通省）を加工して作成',
  license: '政府標準利用規約（第2.0版）/ CC BY 4.0',
  year: YEAR,
  fetchedAt: new Date().toISOString(),
  meshes,
}
await writeFile(`data/${AREA.id}.people.json`, JSON.stringify(out))
const peak = Math.max(...meshes.flatMap((m) => m.wd.map((v) => v[0])))
console.log(`Saved ${meshes.length} squares → data/${AREA.id}.people.json (busiest weekday midday: ${peak.toLocaleString()} people)`)
