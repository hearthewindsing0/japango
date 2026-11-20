// City sounds from Freesound (freesound.org): for each kind of place, finds
// a well-rated recording under CC0 or CC BY and saves its MP3 preview to
// public/sounds/<kind>.mp3, with credits in public/sounds/credits.json.
// Needs a Freesound API key in FREESOUND_TOKEN (a GitHub secret in CI).
import { mkdir, writeFile } from 'node:fs/promises'

const TOKEN = process.env.FREESOUND_TOKEN
if (!TOKEN) throw new Error('Set FREESOUND_TOKEN to a Freesound API key')

// Searches are tried in order until one finds a usable recording.
const SOUNDS = {
  city: { min: 30, max: 150, queries: ['tokyo street ambience', 'tokyo street', 'japan street ambience', 'city street ambience pedestrians'] },
  night: { min: 30, max: 150, queries: ['tokyo night ambience', 'tokyo night street', 'japan night city', 'city night ambience'] },
  crossing: { min: 4, max: 60, queries: ['japan pedestrian crossing', 'tokyo crosswalk', 'japanese crosswalk signal', 'pedestrian crossing signal'] },
  rain: { min: 30, max: 150, queries: ['rain city street', 'rain on umbrella', 'tokyo rain', 'rain ambience'] },
  birds: { min: 30, max: 150, queries: ['japan park birds', 'tokyo park birds', 'japanese birds morning', 'park birds ambience'] },
  cicadas: { min: 20, max: 150, queries: ['japan cicadas', 'tokyo cicadas', 'semi cicada japan', 'cicadas'] },
}

const LICENSES = /publicdomain\/zero|licenses\/by\/[0-9.]+\/?$/ // CC0 or CC BY only (no NC/SA)
const api = (path, params) => {
  const u = new URL(`https://freesound.org/apiv2/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set('token', TOKEN)
  return u
}

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'japango-map-builder/0.1' } })
    if (res.ok) return res.json()
    if (res.status === 401 || res.status === 403) throw new Error(`Freesound refused the key (${res.status})`)
    await new Promise((r) => setTimeout(r, 2000))
  }
  return null
}

await mkdir('public/sounds', { recursive: true })
const credits = {}
for (const [kind, { min, max, queries }] of Object.entries(SOUNDS)) {
  let pick = null
  for (const q of queries) {
    const j = await getJson(
      api('search/text/', {
        query: q,
        filter: `duration:[${min} TO ${max}] license:("Creative Commons 0" OR "Attribution")`,
        sort: 'rating_desc',
        fields: 'id,name,username,license,duration,url,previews,num_ratings,avg_rating',
        page_size: '15',
      }),
    )
    const ok = (j?.results ?? []).filter((r) => LICENSES.test(r.license) && r.previews?.['preview-hq-mp3'])
    // Prefer recordings people have actually rated.
    pick = ok.find((r) => r.num_ratings >= 2 && r.avg_rating >= 3.5) ?? ok[0] ?? null
    if (pick) {
      console.log(`${kind}: "${pick.name}" by ${pick.username} (${Math.round(pick.duration)} s) for "${q}"`)
      break
    }
  }
  if (!pick) {
    console.log(`${kind}: nothing found`)
    continue
  }
  const res = await fetch(pick.previews['preview-hq-mp3'])
  if (!res.ok) {
    console.log(`${kind}: preview download failed (${res.status})`)
    continue
  }
  await writeFile(`public/sounds/${kind}.mp3`, Buffer.from(await res.arrayBuffer()))
  credits[kind] = {
    name: pick.name,
    author: pick.username,
    url: pick.url,
    license: /zero/.test(pick.license) ? 'CC0' : 'CC BY',
    licenseUrl: pick.license,
  }
}

await writeFile(
  'public/sounds/credits.json',
  JSON.stringify({ source: 'Freesound (freesound.org)', fetchedAt: new Date().toISOString(), sounds: credits }, null, 1),
)
console.log(`Saved ${Object.keys(credits).length} sounds to public/sounds`)
