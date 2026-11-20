// Saves found places and stamps to the game's API (Cloudflare D1), so they
// survive a cleared browser. The browser keeps its own copy too and stays
// the source of truth while offline; the two are merged (progress only
// grows). Players are anonymous: a random id kept in this browser.
import { useEffect, useRef } from 'react'

const KEY = 'japango.player'

function playerId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return null
  }
}

interface Saved {
  found: string[]
  stamps: string[]
}

async function call(init?: RequestInit): Promise<Saved | null> {
  const id = playerId()
  if (!id) return null
  try {
    const res = await fetch(init ? '/api/progress' : `/api/progress?player=${id}`, init)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    return (await res.json()) as Saved
  } catch {
    return null // no API here (local dev) or offline: the browser copy is enough
  }
}

/** Merges saved progress in once at start, then saves whenever it grows. */
export function useProgressSync(found: Set<string>, stamps: Set<string>, merge: (saved: Saved) => void) {
  const ready = useRef(false)
  const mergeRef = useRef(merge)
  mergeRef.current = merge

  useEffect(() => {
    call().then((saved) => {
      if (saved) mergeRef.current(saved)
      ready.current = true
    })
  }, [])

  const size = found.size + stamps.size
  useEffect(() => {
    if (!ready.current || size === 0) return
    const id = playerId()
    if (!id) return
    // A little delay so a burst of finds goes up as one save.
    const t = setTimeout(
      () =>
        void call({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ player: id, found: [...found], stamps: [...stamps] }),
        }),
      1500,
    )
    return () => clearTimeout(t)
  }, [size, found, stamps])
}
