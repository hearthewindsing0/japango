// The browser side of the gate (worker/gate.ts): anything that spends the
// game's own money (an AI model, hosted speech...) goes through /api/ai/*,
// and only works for a player who has unlocked it with an invite code at
// /unlock/. Players who bring their own AI key call their provider
// directly and never need this.

export interface GateStatus {
  open: boolean
  name?: string
  /** AI calls left today on this pass. */
  left?: number
}

export const UNLOCK_URL = '/unlock/'

export async function gateStatus(): Promise<GateStatus> {
  try {
    const res = await fetch('/api/gate')
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { open: false }
    return (await res.json()) as GateStatus
  } catch {
    return { open: false } // no API here (local dev) or offline
  }
}

/** Why a paid call didn't happen: no pass (`locked`) or the day's cap. */
export class GateError extends Error {
  reason: 'locked' | 'limit'
  constructor(reason: 'locked' | 'limit', message: string) {
    super(message)
    this.reason = reason
  }
}

/** Calls a paid endpoint, `name` being the part after /api/ai/. Throws a
 *  GateError when the gate says no. */
export async function aiFetch(name: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api/ai/${name}`, { credentials: 'same-origin', ...init })
  if (res.status === 401 || res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new GateError(res.status === 401 ? 'locked' : 'limit', body.error ?? 'locked')
  }
  return res
}
