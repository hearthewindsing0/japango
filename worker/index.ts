// The japango Worker:
//   /tiles/ /dict/ /talk/ /life/ /trains/ /sounds/ /data/ /index/
//                         the game's generated data, from R2 under the same
//                         key (see scripts/data.mjs; falls back to a copy
//                         built into the site, if there is one)
//   /api/progress         a player's found places and stamps, in D1
//   /api/trains/live      live train delays and line status from ODPT
//                         (worker/trains-live.ts; key stays here)
//   /api/health           a quick check that the API is up
// Everything else is the game itself, from the static assets.

import { trainsLive } from './trains-live'

interface Env {
  ASSETS: Fetcher
  DATA: R2Bucket
  DB: D1Database
  /** ODPT developer key (Worker secret), for Tokyo Metro's live data. */
  ODPT_TOKEN?: string
}

const PLAYER = /^[0-9a-f-]{36}$/
const ITEM = /^[A-Za-z0-9_-]{1,40}$/
const MAX_ITEMS = 1000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/** Folders of generated data served from R2. */
const DATA = /^\/(tiles|dict|talk|life|trains|sounds|data|index)\/[A-Za-z0-9_.\/-]+$/
const TYPES: Record<string, string> = {
  json: 'application/json',
  mp3: 'audio/mpeg',
  webp: 'image/webp',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
}

async function data(req: Request, env: Env, url: URL) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const key = url.pathname.slice(1)
  if (key.includes('..')) return new Response('Not found', { status: 404 })
  const obj = await env.DATA.get(key)
  if (!obj) {
    // Not in R2: a copy built into the site, if any. Never the game's
    // index.html for a missing data file.
    const res = await env.ASSETS.fetch(req)
    const type = res.headers.get('content-type') ?? ''
    return res.ok && !type.includes('text/html') ? res : new Response('Not found', { status: 404 })
  }
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('content-type', TYPES[key.split('.').pop() ?? ''] ?? headers.get('content-type') ?? 'application/octet-stream')
  headers.set('access-control-allow-origin', '*')
  // Indexes and manifests change on every rebuild. Files asked for with a
  // version in ?v= (the build time or the file's hash) can be cached for good.
  headers.set(
    'cache-control',
    key.startsWith('index/')
      ? 'no-store'
      : key.endsWith('/manifest.json')
        ? 'public, max-age=60'
        : url.searchParams.has('v')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=300',
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
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (DATA.test(url.pathname)) return data(req, env, url)
    if (url.pathname === '/api/progress') return progress(req, env, url)
    if (url.pathname === '/api/trains/live') return trainsLive(url, env.ODPT_TOKEN, ctx)
    if (url.pathname === '/api/health') return json({ ok: true })
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404)
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
