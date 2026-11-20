// The japango Worker:
//   /tiles/<area>/<file>  map tiles from R2 (falls back to the copy built
//                         into the site, so it works before the first upload)
//   /api/progress         a player's found places and stamps, in D1
//   /api/health           a quick check that the API is up
// Everything else is the game itself, from the static assets.

interface Env {
  ASSETS: Fetcher
  TILES: R2Bucket
  DB: D1Database
}

const PLAYER = /^[0-9a-f-]{36}$/
const ITEM = /^[A-Za-z0-9_-]{1,40}$/
const MAX_ITEMS = 1000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

async function tiles(req: Request, env: Env, url: URL) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const key = url.pathname.slice('/tiles/'.length)
  if (!/^[a-z0-9-]+\/[A-Za-z0-9_.-]+\.json$/.test(key)) return new Response('Not found', { status: 404 })
  const obj = await env.TILES.get(key)
  if (!obj) return env.ASSETS.fetch(req)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('content-type', 'application/json')
  headers.set('access-control-allow-origin', '*')
  // The manifest changes on every rebuild; tiles are asked for with the
  // build time in ?v=, so each version can be cached for good.
  headers.set(
    'cache-control',
    key.endsWith('/manifest.json') ? 'public, max-age=60' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
  )
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers })
}

async function getProgress(env: Env, player: string) {
  const { results } = await env.DB.prepare('SELECT kind, item FROM progress WHERE player_id = ?').bind(player).all<{ kind: string; item: string }>()
  return {
    found: results.filter((r) => r.kind === 'found').map((r) => r.item),
    stamps: results.filter((r) => r.kind === 'stamp').map((r) => r.item),
  }
}

async function progress(req: Request, env: Env, url: URL) {
  if (req.method === 'GET') {
    const player = url.searchParams.get('player') ?? ''
    if (!PLAYER.test(player)) return json({ error: 'bad player id' }, 400)
    return json(await getProgress(env, player))
  }
  if (req.method === 'PUT') {
    let body: { player?: unknown; found?: unknown; stamps?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'bad json' }, 400)
    }
    const player = typeof body.player === 'string' ? body.player : ''
    if (!PLAYER.test(player)) return json({ error: 'bad player id' }, 400)
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ITEM.test(x)) : [])
    const found = list(body.found)
    const stamps = list(body.stamps)
    if (found.length + stamps.length > MAX_ITEMS) return json({ error: 'too many items' }, 413)
    // Progress only ever grows: add what's new, keep what's there.
    const add = env.DB.prepare('INSERT OR IGNORE INTO progress (player_id, kind, item) VALUES (?, ?, ?)')
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO players (id) VALUES (?) ON CONFLICT(id) DO UPDATE SET seen_at = datetime('now')",
      ).bind(player),
      ...found.map((i) => add.bind(player, 'found', i)),
      ...stamps.map((i) => add.bind(player, 'stamp', i)),
    ])
    return json(await getProgress(env, player))
  }
  return json({ error: 'method not allowed' }, 405)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/tiles/')) return tiles(req, env, url)
    if (url.pathname === '/api/progress') return progress(req, env, url)
    if (url.pathname === '/api/health') return json({ ok: true })
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404)
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
