// The game's small Japanese dictionary (built by scripts/build-dict.mjs):
// each Japanese text in the map split into words, with readings and
// English meanings from JMdict, an example sentence from Tatoeba and a
// JLPT level; and, in a second file loaded on first use, each kanji's
// meanings, readings and stroke order.

/** [surface, dictionary key (or ''), reading in hiragana] */
export type Segment = [string, string?, string?]

export interface Word {
  /** Reading in kana. */
  r: string
  /** English meanings, one line per sense. */
  g: string[]
  /** JLPT level: 5 = N5 (easiest) … 1 = N1. */
  n?: number
  /** Example sentence: [Japanese, English, Tatoeba sentence id]. */
  ex?: [string, string, string]
}

export interface Dict {
  texts: Record<string, Segment[]>
  words: Record<string, Word>
}

export interface Kanji {
  /** English meanings. */
  m?: string[]
  on?: string[]
  kun?: string[]
  /** Stroke count and school grade (1-6, 8 = secondary school). */
  s?: number
  gr?: number
  /** Stroke paths in writing order (KanjiVG, 109×109 viewBox). */
  p?: string[]
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

let kanjiLoad: Promise<Record<string, Kanji>> | null = null
export function loadKanji(id: string): Promise<Record<string, Kanji>> {
  kanjiLoad ??= fetch(`${import.meta.env.BASE_URL}dict/${id}.kanji.json`)
    .then((res) => (res.ok ? res.json() : { kanji: {} }))
    .then((d: { kanji: Record<string, Kanji> }) => d.kanji)
    .catch(() => {
      kanjiLoad = null
      return {}
    })
  return kanjiLoad
}
