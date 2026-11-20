// The game's small Japanese dictionary (built by scripts/build-dict.mjs):
// each Japanese text in the map split into words, with readings and
// English meanings from JMdict.

/** [surface, dictionary key (or ''), reading in hiragana] */
export type Segment = [string, string?, string?]

export interface Dict {
  texts: Record<string, Segment[]>
  words: Record<string, { r: string; g: string[] }>
}

export async function loadDict(id: string): Promise<Dict | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}dict/${id}.json`)
    if (!res.ok) return null
    return (await res.json()) as Dict
  } catch {
    return null
  }
}
