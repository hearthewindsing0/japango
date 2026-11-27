// Live train status for the game's stations, from the Public Transportation
// Open Data Center (ODPT, https://developer.odpt.org):
//   odpt:Train             where each train is and how late (odpt:delay, s)
//   odpt:TrainInformation  each line's service status (遅延, 運転見合わせ...)
//
// Toei's live data is public (api-public.odpt.org, no key). Tokyo Metro's
// needs the ODPT developer key, which stays on the server: the Worker
// secret ODPT_TOKEN (the deploy Action copies it from the repository secret
// of the same name). Without it the Hibiya Line just has no live data and
// runs on its timetable.
//
// GET /api/trains/live?area=roppongi →
//   { at, lines: { H04: { text, textEn, status, statusEn, delays: { 神谷町: 120, 広尾: 0 } }, ... } }
// `delays` is keyed by each platform's next stop (like the timetable's
// platforms), in seconds: how late the trains coming into this station that
// way are now. Cached for 30 s, so ODPT sees at most a couple of calls a
// minute however many players there are.

type Operator = 'Toei' | 'TokyoMetro'

interface LineSpec {
  operator: Operator
  railway: string
  /** By the platform's next stop: the trains' odpt:railDirection (its last
   *  part) and the stations a train coming in that way is at or between
   *  (the last part of odpt:fromStation), nearest last. */
  platforms: Record<string, { dir: string; near: string[] }>
}

export const LIVE_LINES: Record<string, Record<string, LineSpec>> = {
  roppongi: {
    H04: {
      operator: 'TokyoMetro',
      railway: 'odpt.Railway:TokyoMetro.Hibiya',
      platforms: {
        神谷町: { dir: 'KitaSenju', near: ['NakaMeguro', 'Ebisu', 'Hiroo', 'Roppongi'] },
        広尾: { dir: 'NakaMeguro', near: ['Kasumigaseki', 'ToranomonHills', 'Kamiyacho', 'Roppongi'] },
      },
    },
    E23: {
      operator: 'Toei',
      railway: 'odpt.Railway:Toei.Oedo',
      platforms: {
        // The inner loop runs Tochōmae → Shinjuku → Roppongi → Daimon...
        麻布十番: { dir: 'InnerLoop', near: ['Shinjuku', 'Yoyogi', 'KokuritsuKyogijo', 'AoyamaItchome', 'Roppongi'] },
        青山一丁目: { dir: 'OuterLoop', near: ['Shiodome', 'Daimon', 'Akabanebashi', 'AzabuJuban', 'Roppongi'] },
      },
    },
  },
}

const BASE: Record<Operator, string> = {
  Toei: 'https://api-public.odpt.org/api/v4/',
  TokyoMetro: 'https://api.odpt.org/api/v4/',
}

type Text = { ja?: string; en?: string } | undefined
interface OdptTrain {
  'odpt:railway'?: string
  'odpt:railDirection'?: string
  'odpt:fromStation'?: string | null
  'odpt:toStation'?: string | null
  'odpt:delay'?: number
}
interface OdptInfo {
  'odpt:railway'?: string
  'odpt:trainInformationText'?: Text
  'odpt:trainInformationStatus'?: Text
}

export interface LiveLine {
  text: string
  textEn: string
  status: string
  statusEn: string
  delays: Record<string, number>
}

const last = (id: string | null | undefined) => (id ? id.slice(id.lastIndexOf('.') + 1) : '')
/** "odpt.RailDirection:TokyoMetro.KitaSenju" and "odpt.RailDirection:OuterLoop" alike. */
const dirName = (id: string | undefined) => (id ? id.slice(Math.max(id.lastIndexOf('.'), id.lastIndexOf(':')) + 1) : '')

/** How late the trains coming in to a platform are: the latest of the
 *  trains at or between the stations just before it, going its way. */
export function platformDelay(trains: OdptTrain[], railway: string, p: { dir: string; near: string[] }) {
  let delay = 0
  for (const t of trains) {
    if (t['odpt:railway'] !== railway || dirName(t['odpt:railDirection']) !== p.dir) continue
    if (!p.near.includes(last(t['odpt:fromStation']))) continue
    delay = Math.max(delay, Number(t['odpt:delay']) || 0)
  }
  return delay
}

export function lineStatus(spec: LineSpec, trains: OdptTrain[], info: OdptInfo[]): LiveLine {
  const i = info.find((x) => x['odpt:railway'] === spec.railway)
  const delays: Record<string, number> = {}
  for (const [next, p] of Object.entries(spec.platforms)) delays[next] = platformDelay(trains, spec.railway, p)
  return {
    text: i?.['odpt:trainInformationText']?.ja ?? '',
    textEn: i?.['odpt:trainInformationText']?.en ?? '',
    status: i?.['odpt:trainInformationStatus']?.ja ?? '',
    statusEn: i?.['odpt:trainInformationStatus']?.en ?? '',
    delays,
  }
}

async function odpt<T>(op: Operator, type: string, query: string, token: string | undefined): Promise<T[] | null> {
  if (op !== 'Toei' && !token) return null
  const url = `${BASE[op]}${type}?${query}${token && op !== 'Toei' ? `&acl:consumerKey=${encodeURIComponent(token)}` : ''}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body) ? (body as T[]) : null
  } catch {
    return null
  }
}

export async function trainsLive(url: URL, token: string | undefined, ctx?: { waitUntil(p: Promise<unknown>): void }) {
  const area = url.searchParams.get('area') ?? ''
  const lines = LIVE_LINES[area]
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=30', 'access-control-allow-origin': '*' }
  if (!lines) return new Response(JSON.stringify({ error: 'unknown area' }), { status: 404, headers })
  // One shared copy for every player, for 30 s.
  const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default
  const key = new Request(`https://cache.japango/api/trains/live?area=${area}`)
  const hit = await cache?.match(key)
  if (hit) return hit

  const out: Record<string, LiveLine> = {}
  await Promise.all(
    Object.entries(lines).map(async ([ref, spec]) => {
      const q = `odpt:railway=${spec.railway}`
      const [trains, info] = await Promise.all([
        odpt<OdptTrain>(spec.operator, 'odpt:Train', q, token),
        odpt<OdptInfo>(spec.operator, 'odpt:TrainInformation', q, token),
      ])
      if (!trains && !info) return
      out[ref] = lineStatus(spec, trains ?? [], info ?? [])
    }),
  )
  const res = new Response(JSON.stringify({ at: Date.now(), lines: out }), { headers })
  if (cache) {
    const put = cache.put(key, res.clone())
    if (ctx) ctx.waitUntil(put)
    else await put
  }
  return res
}
