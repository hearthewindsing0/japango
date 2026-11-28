// The gate in front of anything that spends Henry's money at runtime (an AI
// model, hosted speech, ...). The game itself stays open to everyone: the
// map, scripted conversations and the rest are already paid for. Only the
// /api/ai/* endpoints need a pass.
//
// Passes come from invite codes. INVITE_CODES is a Worker secret (the
// deploy Action copies it from the repository secret of the same name):
//
//   INVITE_CODES = "henry:some-long-phrase, mika:another-long-phrase"
//
// A player types their code once at /unlock/; the Worker answers with a
// signed cookie (30 days) naming whose code it was. Taking a code out of
// INVITE_CODES (or changing it) turns its passes off at the next deploy.
// Without INVITE_CODES nobody gets in: the gate fails closed.
//
// Every call through the gate is counted in D1 before it runs, and stops
// at a daily cap for each pass and for everyone together:
//   AI_DAILY_CAP       calls a day, all players (default 300)
//   AI_PASS_DAILY_CAP  calls a day, each pass   (default 100)
// The caps are [vars] in wrangler.toml; they're a backstop, not a budget.
// The real budget is the spend limit on the AI provider's side.
//
//   GET    /api/gate   { open, name?, left? }   is this browser let in?
//   POST   /api/gate   { code }                 trade a code for a pass
//   DELETE /api/gate                            forget the pass

export interface GateEnv {
  DB: D1Database
  INVITE_CODES?: string
  AI_DAILY_CAP?: string
  AI_PASS_DAILY_CAP?: string
}

const COOKIE = 'jg_pass'
const PASS_DAYS = 30
/** Wrong codes allowed from one address a day, before it's shut out. */
const MAX_FAILS = 20

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })

const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const today = () => new Date().toISOString().slice(0, 10)

/** "name:code" entries; a bare code is called "guest". Codes under 12
 *  characters are ignored, so a short one can't be guessed. */
export function parseCodes(raw: string | undefined) {
  const out = new Map<string, string>()
  for (const part of (raw ?? '').split(/[,\n]/)) {
    const s = part.trim()
    if (!s) continue
    const i = s.indexOf(':')
    const name = (i > 0 ? s.slice(0, i) : 'guest').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'guest'
    const code = (i > 0 ? s.slice(i + 1) : s).trim()
    if (code.length >= 12) out.set(code, name)
  }
  return out
}

/** The signing key comes from the codes themselves: change the codes and
 *  every old pass stops working. */
async function key(raw: string) {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(`japango-gate:${raw}`))
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(raw: string, payload: string) {
  return hex(await crypto.subtle.sign('HMAC', await key(raw), enc.encode(payload)))
}

/** Compares without leaking where the first difference is. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function makePass(raw: string, name: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + PASS_DAYS * 86400
  const payload = `${name}.${exp}`
  return `${payload}.${await sign(raw, payload)}`
}

/** The pass's name, if the cookie is a good, unexpired pass for a code
 *  that's still on the list. */
export async function readPass(raw: string | undefined, cookie: string | undefined, now = Date.now()) {
  if (!raw || !cookie) return null
  const m = /^([A-Za-z0-9_-]{1,32})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(cookie)
  if (!m) return null
  const [, name, exp, sig] = m
  if (Number(exp) * 1000 < now) return null
  if (![...parseCodes(raw).values()].includes(name)) return null
  return same(sig, await sign(raw, `${name}.${exp}`)) ? name : null
}

function cookieOf(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

const passCookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/api/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`

/** Adds n to today's count for `who` and returns the new count. */
async function bump(env: GateEnv, who: string, n = 1) {
  const row = await env.DB.prepare(
    `INSERT INTO usage (day, who, calls) VALUES (?, ?, ?)
     ON CONFLICT(day, who) DO UPDATE SET calls = calls + excluded.calls
     RETURNING calls`,
  )
    .bind(today(), who, n)
    .first<{ calls: number }>()
  return row?.calls ?? n
}

async function count(env: GateEnv, who: string) {
  const row = await env.DB.prepare('SELECT calls FROM usage WHERE day = ? AND who = ?').bind(today(), who).first<{ calls: number }>()
  return row?.calls ?? 0
}

const cap = (v: string | undefined, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : d
}

const caps = (env: GateEnv) => ({
  all: cap(env.AI_DAILY_CAP, 300),
  pass: cap(env.AI_PASS_DAILY_CAP, 100),
})

const ip = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown'

export async function gate(req: Request, env: GateEnv): Promise<Response> {
  if (req.method === 'GET') {
    const name = await readPass(env.INVITE_CODES, cookieOf(req, COOKIE))
    if (!name) return json({ open: false })
    const left = Math.max(0, caps(env).pass - (await count(env, `pass:${name}`)))
    return json({ open: true, name, left })
  }
  if (req.method === 'DELETE') return json({ open: false }, 200, { 'set-cookie': passCookie('', 0) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Same-site only: a page elsewhere can't post codes on a player's behalf.
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return json({ error: 'wrong origin' }, 403)
  const who = `fail:${ip(req)}`
  if ((await count(env, who)) >= MAX_FAILS) return json({ error: 'too many tries; try again tomorrow' }, 429)
  let code = ''
  try {
    const body = (await req.json()) as { code?: unknown }
    code = typeof body.code === 'string' ? body.code.trim().slice(0, 200) : ''
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const codes = parseCodes(env.INVITE_CODES)
  let name: string | null = null
  for (const [c, n] of codes) if (same(c, code)) name = n
  if (!name) {
    await bump(env, who)
    return json({ error: 'that code doesn’t work' }, 401)
  }
  return json({ open: true, name }, 200, { 'set-cookie': passCookie(await makePass(env.INVITE_CODES!, name), PASS_DAYS * 86400) })
}

/** For every endpoint that spends money: null when the call may go ahead
 *  (and it has been counted), else the response to send instead.
 *
 *    const stop = await guardPaid(req, env); if (stop) return stop
 *
 *  `cost` counts a call as more than one (say, a long reply). */
export async function guardPaid(req: Request, env: GateEnv, cost = 1): Promise<Response | null> {
  const name = await readPass(env.INVITE_CODES, cookieOf(req, COOKIE))
  if (!name) return json({ error: 'locked', unlock: '/unlock/' }, 401)
  const { all, pass } = caps(env)
  // Count first, then check, so a burst of calls can't all slip under.
  const [mine, everyone] = await Promise.all([bump(env, `pass:${name}`, cost), bump(env, '*', cost)])
  if (mine > pass) return json({ error: 'daily limit reached for this pass' }, 429)
  if (everyone > all) return json({ error: 'daily limit reached; back tomorrow' }, 429)
  return null
}
