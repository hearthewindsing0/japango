// Bring your own AI: live, unscripted replies when the player talks to
// someone. Off by default; scripted lines stay free for everyone.
//
// The player connects their own account: "Sign in with OpenRouter" (OAuth
// with PKCE, which hands the page a key of theirs), or a pasted OpenRouter
// or Anthropic key. The key stays in this browser and calls go straight
// from the browser to the provider, so there is no server of ours and no
// cost to the game.
import { loadAvatar } from './avatar'
import type { LifePerson } from './life'

export interface AiSettings {
  provider: 'openrouter' | 'anthropic'
  key: string
  model: string
  /** How they connected, for the settings window. */
  via: 'signin' | 'key'
}

const KEY = 'japango.ai'
const VERIFIER = 'japango.ai.verifier'
/** Defaults: small, quick and cheap is right for one-line replies. */
export const DEFAULT_MODEL = { openrouter: 'anthropic/claude-haiku-5.5', anthropic: 'claude-haiku-5-5' }

export function loadAi(): AiSettings | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AiSettings | null
    return s?.key ? s : null
  } catch {
    return null
  }
}

export function saveAi(s: AiSettings | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // Private window: works until the page closes.
  }
  window.dispatchEvent(new Event('japango:ai'))
}

/** A pasted key: which provider it's for, from its prefix. */
export function aiFromKey(key: string): AiSettings | null {
  const k = key.trim()
  if (k.startsWith('sk-ant-')) return { provider: 'anthropic', key: k, model: DEFAULT_MODEL.anthropic, via: 'key' }
  if (k.startsWith('sk-or-')) return { provider: 'openrouter', key: k, model: DEFAULT_MODEL.openrouter, via: 'key' }
  return null
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** Off to OpenRouter's sign-in page; it comes back here with ?code=. */
export async function signInOpenRouter() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(VERIFIER, verifier)
  const back = `${location.origin}${location.pathname}`
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(back)}&code_challenge=${challenge}&code_challenge_method=S256`
}

/** On load: finish an OpenRouter sign-in if we've just come back from one. */
export async function finishSignIn(): Promise<'connected' | 'failed' | null> {
  const q = new URLSearchParams(location.search)
  const code = q.get('code')
  const verifier = sessionStorage.getItem(VERIFIER)
  if (!code || !verifier) return null
  sessionStorage.removeItem(VERIFIER)
  q.delete('code')
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    })
    const { key } = (await res.json()) as { key?: string }
    if (!res.ok || !key) return 'failed'
    saveAi({ provider: 'openrouter', key, model: DEFAULT_MODEL.openrouter, via: 'signin' })
    return 'connected'
  } catch {
    return 'failed'
  }
}

/** One turn of the conversation, from either side. */
export interface Turn {
  who: 'player' | 'npc'
  ja: string
}

export interface Reply {
  /** What they say back. */
  ja: string
  en: string
  /** What the player's words mean, so they can check they were understood. */
  heardEn: string
  /** A gentle note on the player's Japanese, when there's something to say. */
  tip: string
  /** They're wrapping up (goodbye, or they have to go). */
  end: boolean
}

function persona(p: LifePerson, group: LifePerson[], place: string, time: string) {
  const a = p.approach
  const others = group.filter((g) => g.id !== p.id)
  const me = loadAvatar()
  return [
    `You are ${p.family}${p.name} (${p.nameEn}), a ${p.age}-year-old ${p.gender} ${p.occupation} out in ${place}, Tokyo. It is ${time}.`,
    `Personality: ${p.personality}. Mood right now: ${p.mood}.`,
    others.length ? `You're with ${others.map((o) => `${o.family}${o.name} (${o.age}, ${o.occupation})`).join(' and ')}.` : '',
    a
      ? [
          `With strangers you are ${a.openness}, and speak in ${a.register} Japanese.`,
          a.topics.length ? `You like talking about: ${a.topics.join(', ')}.` : '',
          a.knows.length ? `You know about: ${a.knows.join(', ')}.` : '',
          a.avoids ? `You avoid: ${a.avoids}.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
    `A foreigner learning Japanese${me?.kana ? ` called ${me.kana}` : ''} has walked up and is talking to you. Their words reach you through speech recognition, so they may be garbled or missing particles: guess the likely meaning, and if you really can't tell, ask them to say it again the way a real person would.`,
    'Stay in character as a real person on the street, not a teacher or an assistant. React to what they actually said. Keep each reply to one or two short spoken sentences, in natural Japanese they can follow (about JLPT N4–N3 unless they speak at a higher level). No romaji, no emoji, no stage directions.',
    a?.openness === 'busy' ? 'You are in a hurry: after a couple of exchanges, excuse yourself and go.' : 'If the chat runs its course or they say goodbye, say goodbye naturally.',
    'Answer with JSON only, no other text: {"ja": your reply in Japanese, "en": its English translation, "heard_en": a short English rendering of what they just said, "tip": one short friendly English note if their Japanese had a mistake or a more natural way to say it (else ""), "end": true if you are saying goodbye}',
  ]
    .filter(Boolean)
    .join('\n')
}

const parse = (text: string): Reply => {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  const j = JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const ja = str(j.ja)
  if (!ja) throw new Error('empty reply')
  return { ja, en: str(j.en), heardEn: str(j.heard_en), tip: str(j.tip), end: j.end === true }
}

/** Ask the player's AI what this person says next. */
export async function npcReply(
  ai: AiSettings,
  p: LifePerson,
  group: LifePerson[],
  turns: Turn[],
  ctx: { place: string; time: string },
): Promise<Reply> {
  const system = persona(p, group, ctx.place, ctx.time)
  // Recent turns only: enough to follow the thread, cheap to send.
  const recent = turns.slice(-16)
  // The conversation has to start with the player for the APIs.
  while (recent[0]?.who === 'npc' && recent.length > 1) recent.shift()
  const messages = recent.map((t) => ({ role: t.who === 'player' ? 'user' : 'assistant', content: t.ja }))
  let res: Response
  if (ai.provider === 'anthropic') {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: ai.model, max_tokens: 400, system, messages }),
    })
  } else {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.key}`,
        'X-Title': 'JapanGo',
        'HTTP-Referer': location.origin,
      },
      body: JSON.stringify({ model: ai.model, max_tokens: 400, messages: [{ role: 'system', content: system }, ...messages] }),
    })
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string } | string
    content?: { type: string; text?: string }[]
    choices?: { message?: { content?: string } }[]
  }
  if (!res.ok) {
    const msg = typeof body.error === 'string' ? body.error : body.error?.message
    throw new Error(res.status === 401 ? 'Your AI key was refused. Reconnect it in AI settings.' : (msg ?? `AI request failed (${res.status})`))
  }
  const text = ai.provider === 'anthropic' ? (body.content?.find((c) => c.type === 'text')?.text ?? '') : (body.choices?.[0]?.message?.content ?? '')
  return parse(text)
}

/** OpenRouter's models, for the picker in AI settings (public list). */
export async function openRouterModels(): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models')
  const { data } = (await res.json()) as { data: { id: string }[] }
  return data.map((m) => m.id)
}
