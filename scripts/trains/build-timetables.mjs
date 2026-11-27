// Builds the train timetables for the subway stations on the map from the
// operators' static GTFS (GTFS-JP) feeds, into public/trains/<area>.json.
// The game runs each platform's trains from it, at the real times of day.
//
// Sources (see https://ckan.odpt.org, 公共交通オープンデータセンター):
//   - Toei Subway (Ōedo Line, E23): public, no key needed, CC BY 4.0.
//     https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip
//     Credit: 東京都交通局・公共交通オープンデータ協議会.
//   - Tokyo Metro (Hibiya Line, H04): needs an ODPT developer key
//     (ODPT_TOKEN), under the 公共交通オープンデータ基本ライセンス.
//     Without the key the game runs the Hibiya Line on an approximate
//     schedule (src/game/trains.ts).
//
// These are planned timetables. With the ODPT_TOKEN repository secret set
// this also builds Tokyo Metro's. Live delays and line status come from the
// Worker at play time (worker/trains-live.ts). See README "Trains".
//
// Usage: bun scripts/trains/build-timetables.mjs   (AREA=roppongi by default)
// Reads GTFS zips from data/gtfs/ if they are already there (for testing),
// otherwise downloads them.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const AREA = process.env.AREA || 'roppongi'
const TOKEN = process.env.ODPT_TOKEN || ''

/** Stations on each area's map: the map's station ref (from OSM), the
 *  feed, the stop's name in the feed and a pattern for the line. */
const AREAS = {
  roppongi: [
    { ref: 'E23', feed: 'toei', stop: '六本木', line: /大江戸|oedo/i },
    { ref: 'H04', feed: 'tokyometro', stop: '六本木', line: /日比谷|hibiya/i },
  ],
}

const FEEDS = {
  toei: {
    operator: '都営地下鉄',
    operatorEn: 'Toei Subway',
    url: 'https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit: '東京都交通局・公共交通オープンデータ協議会',
    creditEn: 'Bureau of Transportation, Tokyo Metropolitan Government / Association for Open Data of Public Transportation',
  },
  tokyometro: {
    operator: '東京メトロ',
    operatorEn: 'Tokyo Metro',
    // The key goes in the URL: only ever used here, never written out.
    url: TOKEN ? `https://api.odpt.org/api/v4/files/TokyoMetro/data/TokyoMetro-Train-GTFS.zip?acl:consumerKey=${TOKEN}` : null,
    publicUrl: 'https://api.odpt.org/api/v4/files/TokyoMetro/data/TokyoMetro-Train-GTFS.zip',
    license: '公共交通オープンデータ基本ライセンス',
    licenseUrl: 'https://developer.odpt.org/terms/data_basic_license.html',
    credit: '東京メトロ・公共交通オープンデータセンター',
    creditEn: 'Tokyo Metro / Public Transportation Open Data Center',
  },
}

/** CSV with quoted fields, as GTFS allows. Returns objects by header. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"'), i++
        else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(field), (field = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) row.push(field), rows.push(row)
  const head = (rows.shift() ?? []).map((h) => h.trim())
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}

/** "25:04:00" → seconds after the service day's midnight. */
const secs = (t) => {
  if (!t) return null
  const [h, m, s] = t.split(':').map(Number)
  return h * 3600 + m * 60 + (s || 0)
}

function readFeed(dir) {
  const f = (name) => (existsSync(join(dir, name)) ? parseCsv(readFileSync(join(dir, name), 'utf8')) : [])
  return {
    feedInfo: f('feed_info.txt')[0] ?? null,
    routes: f('routes.txt'),
    trips: f('trips.txt'),
    stops: f('stops.txt'),
    stopTimes: f('stop_times.txt'),
    calendar: f('calendar.txt'),
    calendarDates: f('calendar_dates.txt'),
    translations: f('translations.txt'),
  }
}

/** English names from translations.txt: both the GTFS-JP style (trans_id,
 *  lang, translation) and the GTFS style (field_value, language). */
function englishNames(feed) {
  const en = new Map()
  for (const t of feed.translations) {
    const lang = t.lang || t.language
    const key = t.trans_id || t.field_value
    if (lang === 'en' && key && t.translation) en.set(key, t.translation)
  }
  return en
}

/** One station's departures from a feed, grouped by platform (by the next
 *  stop, which says the direction). */
export function stationTimetable(feed, spec) {
  const stopName = new Map(feed.stops.map((s) => [s.stop_id, s.stop_name]))
  const here = new Set(feed.stops.filter((s) => s.stop_name === spec.stop || s.stop_name === spec.stop + '駅').map((s) => s.stop_id))
  if (!here.size) throw new Error(`No stop named ${spec.stop} in the feed`)
  const routeOk = new Set(
    feed.routes
      .filter((r) => spec.line.test(`${r.route_id} ${r.route_short_name} ${r.route_long_name} ${r.route_desc ?? ''}`))
      .map((r) => r.route_id),
  )
  if (!routeOk.size) console.warn(`  no route matches ${spec.line}; using every route that stops at ${spec.stop}`)
  const trips = new Map(feed.trips.filter((t) => !routeOk.size || routeOk.has(t.route_id)).map((t) => [t.trip_id, t]))
  // Each trip's stops in order.
  const byTrip = new Map()
  for (const st of feed.stopTimes) {
    if (!trips.has(st.trip_id)) continue
    let a = byTrip.get(st.trip_id)
    if (!a) byTrip.set(st.trip_id, (a = []))
    a.push(st)
  }
  const en = englishNames(feed)
  const platforms = {}
  const services = new Set()
  for (const [id, stops] of byTrip) {
    stops.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
    const k = stops.findIndex((s) => here.has(s.stop_id))
    if (k < 0 || k === stops.length - 1) continue // doesn't stop here, or ends here
    const trip = trips.get(id)
    const st = stops[k]
    const next = stopName.get(stops[k + 1].stop_id)
    const last = stopName.get(stops[stops.length - 1].stop_id)
    const to = (st.stop_headsign || trip.trip_headsign || last || '').replace(/行き?$/, '')
    const arr = secs(st.arrival_time) ?? secs(st.departure_time)
    const dep = secs(st.departure_time) ?? arr
    if (dep == null) continue
    ;(platforms[next] ??= []).push([trip.service_id, arr, dep, to, en.get(to) ?? en.get(last) ?? ''])
    services.add(trip.service_id)
  }
  for (const list of Object.values(platforms)) list.sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0]))
  return { platforms, services }
}

function serviceCalendar(feed, used) {
  const services = {}
  for (const c of feed.calendar) {
    if (!used.has(c.service_id)) continue
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (c[d] === '1' ? '1' : '0')).join('')
    services[c.service_id] = { days, start: c.start_date, end: c.end_date }
  }
  const dates = {}
  for (const d of feed.calendarDates) {
    if (!used.has(d.service_id)) continue
    const e = (dates[d.date] ??= { add: [], drop: [] })
    ;(d.exception_type === '1' ? e.add : e.drop).push(d.service_id)
    // A service only listed in calendar_dates runs on its dates alone.
    services[d.service_id] ??= { days: '0000000', start: '', end: '' }
  }
  return { services, dates }
}

async function download(name, url) {
  const local = join('data', 'gtfs', `${name}.zip`)
  if (existsSync(local) && !process.env.REFRESH) return local
  if (!url) return null
  console.log(`  downloading ${name}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  mkdirSync(join('data', 'gtfs'), { recursive: true })
  const tmp = join(mkdtempSync(join(tmpdir(), 'gtfs-')), `${name}.zip`)
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
  return tmp
}

function unzip(zip) {
  const dir = mkdtempSync(join(tmpdir(), 'gtfs-x-'))
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir])
  return dir
}

async function main() {
  const specs = AREAS[AREA]
  if (!specs) throw new Error(`No stations listed for area ${AREA}`)
  const out = { area: AREA, built: '', sources: [], stations: {} }
  const feeds = new Map()
  for (const spec of specs) {
    const info = FEEDS[spec.feed]
    if (!feeds.has(spec.feed)) {
      let zip = null
      try {
        zip = await download(spec.feed, info.url)
      } catch (e) {
        // Never print the URL: it carries the key.
        console.log(`::warning::${spec.ref}: couldn't download the ${info.operatorEn} timetable (${String(e.message).split('?')[0]}); keeping its fallback.`)
        if (!info.publicUrl) throw e
      }
      if (!zip) {
        console.log(`${spec.ref}: no ${info.operatorEn} key (ODPT_TOKEN), skipped; the game uses an approximate schedule.`)
        feeds.set(spec.feed, null)
        continue
      }
      const dir = unzip(zip)
      feeds.set(spec.feed, readFeed(dir))
      rmSync(dir, { recursive: true, force: true })
    }
    const feed = feeds.get(spec.feed)
    if (!feed) continue
    const { platforms, services } = stationTimetable(feed, spec)
    const cal = serviceCalendar(feed, services)
    const counts = Object.entries(platforms).map(([n, l]) => `${n} ${l.length}`)
    console.log(`${spec.ref}: ${counts.join(', ')} (services ${[...services].join(', ')})`)
    out.stations[spec.ref] = { feed: spec.feed, ...cal, platforms }
    if (!out.sources.some((s) => s.feed === spec.feed)) {
      const { url, publicUrl, ...rest } = info
      out.sources.push({
        feed: spec.feed,
        ...rest,
        url: publicUrl ?? url,
        version: feed.feedInfo?.feed_version ?? '',
        valid: [feed.feedInfo?.feed_start_date ?? '', feed.feedInfo?.feed_end_date ?? ''],
      })
    }
  }
  // The feeds' versions, not the time, so an unchanged feed makes no commit.
  out.built = out.sources.map((s) => `${s.feed}:${s.version}`).join(' ') || 'none'
  mkdirSync(join('public', 'trains'), { recursive: true })
  const file = join('public', 'trains', `${AREA}.json`)
  writeFileSync(file, JSON.stringify(out) + '\n')
  console.log(`Wrote ${file}`)
}

if (import.meta.main ?? process.argv[1]?.endsWith('build-timetables.mjs')) await main()
