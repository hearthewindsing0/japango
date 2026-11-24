// Tokyo's real time of day, sun position and weather, turned into lighting.
import * as THREE from 'three'

const LAT = 35.6628
const LON = 139.731
const RAD = Math.PI / 180

/** Sun elevation and azimuth (from north, clockwise), in radians. */
export function sunPosition(date: Date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24
  const ha = ((gmst + LON / 15) * 15) * RAD - ra
  const lat = LAT * RAD
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha))
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha))
  return { elevation, azimuth: (azimuth + Math.PI * 2) % (Math.PI * 2) }
}

export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export interface Weather {
  kind: WeatherKind
  /** 0..1 */
  cloud: number
  tempC?: number
}

/** Japanese weather words, for the HUD. */
export const WEATHER_WORDS: Record<WeatherKind, { ja: string; kana: string; en: string; icon: string }> = {
  clear: { ja: '晴れ', kana: 'はれ', en: 'sunny', icon: '☀' },
  cloudy: { ja: '晴れ時々曇り', kana: 'はれときどきくもり', en: 'partly cloudy', icon: '⛅' },
  overcast: { ja: '曇り', kana: 'くもり', en: 'cloudy', icon: '☁' },
  fog: { ja: '霧', kana: 'きり', en: 'fog', icon: '🌫' },
  drizzle: { ja: '霧雨', kana: 'きりさめ', en: 'drizzle', icon: '🌦' },
  rain: { ja: '雨', kana: 'あめ', en: 'rain', icon: '☔' },
  snow: { ja: '雪', kana: 'ゆき', en: 'snow', icon: '❄' },
  storm: { ja: '雷雨', kana: 'らいう', en: 'thunderstorm', icon: '⛈' },
}

/** WMO weather code (as Open-Meteo reports it) → our kinds. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear'
  if (code === 2) return 'cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

/** Current weather in Roppongi from Open-Meteo (free, no key). */
export async function fetchWeather(): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,weather_code,cloud_cover&timezone=Asia%2FTokyo'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather: ${res.status}`)
  const j = await res.json()
  return {
    kind: weatherKind(j.current.weather_code),
    cloud: (j.current.cloud_cover ?? 0) / 100,
    tempC: j.current.temperature_2m,
  }
}

/** Hours and minutes in Tokyo. */
export function tokyoClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { h: get('hour'), m: get('minute') }
}

/** "午前10:25" / "午後0:05", the way clocks read in Japan. */
export function japaneseTime(date: Date) {
  const { h, m } = tokyoClock(date)
  const half = h < 12 ? '午前' : '午後'
  // Japanese clocks run 午前0時–11時 and 午後0時–11時.
  return `${half}${h % 12}:${String(m).padStart(2, '0')}`
}

/** A Date at the given Tokyo time today, for ?time=21:30. */
export function tokyoTimeToday(hhmm: string) {
  const [h, m, sec] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h)) return null
  const now = new Date()
  const { h: th, m: tm } = tokyoClock(now)
  let diff = (h * 60 + (m || 0) - (th * 60 + tm)) * 60000
  // With seconds (21:30:15), to the second: handy for catching a train.
  if (Number.isFinite(sec)) diff += sec * 1000 - (now.getTime() % 60000)
  return new Date(now.getTime() + diff)
}

export interface SkyState {
  /** Unit vector toward the sun (or moon at night), in world space. */
  lightDir: THREE.Vector3
  sun: { color: THREE.Color; intensity: number }
  hemi: { sky: THREE.Color; ground: THREE.Color; intensity: number }
  background: THREE.Color
  /** 0 by day, 1 at full night. */
  night: number
  rain: number
  snow: number
  /** Multiplies the fog distances. */
  fogScale: number
}

const c = (hex: number) => new THREE.Color(hex)
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)))
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Lighting for a moment and weather. rotationDeg is the map's turn from north. */
export function skyState(date: Date, weather: Weather, rotationDeg: number): SkyState {
  const { elevation, azimuth } = sunPosition(date)
  const s = Math.sin(elevation)
  const day = smooth(-0.1, 0.12, s) // 0 at night, 1 in daylight
  const low = 1 - smooth(0.05, 0.4, s) // warm light near sunrise and sunset
  const overcast = Math.max(weather.cloud * 0.6, ['overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm'].includes(weather.kind) ? 0.85 : 0)

  // Map frame: east and north as world (x, z) directions.
  const th = rotationDeg * RAD
  const east = new THREE.Vector2(Math.cos(th), Math.sin(th))
  const north = new THREE.Vector2(Math.sin(th), -Math.cos(th))
  // At night, light comes from a high, fixed "moon" so shadows stay readable.
  const az = day > 0.02 ? azimuth : 200 * RAD
  const el = day > 0.02 ? Math.max(elevation, 0.12) : 55 * RAD
  const horiz = east.multiplyScalar(Math.sin(az)).add(north.multiplyScalar(Math.cos(az)))
  const lightDir = new THREE.Vector3(horiz.x * Math.cos(el), Math.sin(el), horiz.y * Math.cos(el)).normalize()

  const sunColor = mix(c(0xfff4e2), c(0xffb36b), low * day)
  const moonColor = c(0x9fb4ff)
  const sun = {
    color: day > 0.02 ? sunColor : moonColor,
    intensity: day > 0.02 ? 1.7 * day * (1 - overcast * 0.75) : 0.5,
  }
  const daySky = mix(c(0xcfe3f2), c(0xc3c8cf), overcast)
  const duskSky = c(0xf0b98e)
  const nightSky = c(0x1c2540)
  const background = mix(mix(nightSky, daySky, day), duskSky, low * day * (1 - overcast) * 0.6)
  const hemi = {
    sky: mix(c(0x7486c4), mix(c(0xe3ecff), c(0xd6dae0), overcast), day),
    ground: mix(c(0x4a4452), c(0xb3a58c), day),
    intensity: 1.0 + day * (0.15 + overcast * 0.45),
  }
  const rain = weather.kind === 'rain' ? 1 : weather.kind === 'storm' ? 1.3 : weather.kind === 'drizzle' ? 0.4 : 0
  const snow = weather.kind === 'snow' ? 1 : 0
  const fogScale = weather.kind === 'fog' ? 0.35 : rain || snow ? 0.7 : 1
  return { lightDir, sun, hemi, background, night: 1 - day, rain, snow, fogScale }
}
