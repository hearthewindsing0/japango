// The player's own character, made in the character creator at the start
// (src/onboarding/). Kept in this browser so returning players go straight
// back in. Everything a toy figure can wear is listed here with its
// Japanese name, so the creator doubles as a little vocabulary lesson and a
// clothes shop later can reuse the same lists.

export type Gender = 'man' | 'woman'
export type Build = 'slim' | 'average' | 'sturdy'
export type Height = 'short' | 'average' | 'tall'
export type Eyes = 'dot' | 'round' | 'smile' | 'sleepy'
export type HairStyle = 'short' | 'buzz' | 'spiky' | 'side' | 'bob' | 'long' | 'ponytail' | 'bun'
export type Outfit = 'tee' | 'hoodie' | 'shirt' | 'jacket' | 'dress' | 'skirt'
export type Glasses = 'none' | 'round' | 'square'
export type Hat = 'none' | 'cap' | 'beanie'

export interface Avatar {
  v: 1
  gender: Gender
  build: Build
  height: Height
  skin: string
  eyes: Eyes
  blush: boolean
  hair: HairStyle
  hairColor: string
  outfit: Outfit
  top: string
  bottom: string
  /** Cap, beanie and backpack. */
  accent: string
  glasses: Glasses
  hat: Hat
  backpack: boolean
  /** As typed (any script). */
  name: string
  /** The name in katakana (or as typed, if it was already Japanese). */
  kana: string
}

/** A choice in the creator: the value, its Japanese name and reading, and English. */
export interface Choice<T extends string> {
  v: T
  ja: string
  /** Reading, when ja has kanji. */
  yomi?: string
  en: string
}

export const GENDERS: Choice<Gender>[] = [
  { v: 'man', ja: '男性', yomi: 'だんせい', en: 'Man' },
  { v: 'woman', ja: '女性', yomi: 'じょせい', en: 'Woman' },
]
export const BUILDS: Choice<Build>[] = [
  { v: 'slim', ja: '細め', yomi: 'ほそめ', en: 'Slim' },
  { v: 'average', ja: 'ふつう', en: 'Average' },
  { v: 'sturdy', ja: 'がっしり', en: 'Sturdy' },
]
export const HEIGHTS: Choice<Height>[] = [
  { v: 'short', ja: '低め', yomi: 'ひくめ', en: 'Short' },
  { v: 'average', ja: 'ふつう', en: 'Average' },
  { v: 'tall', ja: '高め', yomi: 'たかめ', en: 'Tall' },
]
export const EYES: Choice<Eyes>[] = [
  { v: 'dot', ja: 'てん', en: 'Dots' },
  { v: 'round', ja: 'まんまる', en: 'Round' },
  { v: 'smile', ja: 'にこにこ', en: 'Smiling' },
  { v: 'sleepy', ja: 'ねむい', en: 'Sleepy' },
]
export const HAIRS: Choice<HairStyle>[] = [
  { v: 'short', ja: 'ショート', en: 'Short' },
  { v: 'buzz', ja: 'ぼうず', en: 'Buzz cut' },
  { v: 'spiky', ja: 'ツンツン', en: 'Spiky' },
  { v: 'side', ja: '七三', yomi: 'しちさん', en: 'Side part' },
  { v: 'bob', ja: 'ボブ', en: 'Bob' },
  { v: 'long', ja: 'ロング', en: 'Long' },
  { v: 'ponytail', ja: 'ポニーテール', en: 'Ponytail' },
  { v: 'bun', ja: 'おだんご', en: 'Bun' },
]
export const OUTFITS: Choice<Outfit>[] = [
  { v: 'tee', ja: 'Tシャツ', en: 'T-shirt' },
  { v: 'hoodie', ja: 'パーカー', en: 'Hoodie' },
  { v: 'shirt', ja: 'シャツ', en: 'Shirt' },
  { v: 'jacket', ja: 'ジャケット', en: 'Jacket' },
  { v: 'dress', ja: 'ワンピース', en: 'Dress' },
  { v: 'skirt', ja: 'スカート', en: 'Skirt' },
]
export const GLASSES: Choice<Glasses>[] = [
  { v: 'none', ja: 'なし', en: 'None' },
  { v: 'round', ja: '丸めがね', yomi: 'まるめがね', en: 'Round' },
  { v: 'square', ja: '四角', yomi: 'しかく', en: 'Square' },
]
export const HATS: Choice<Hat>[] = [
  { v: 'none', ja: 'なし', en: 'None' },
  { v: 'cap', ja: 'キャップ', en: 'Cap' },
  { v: 'beanie', ja: 'ニット帽', yomi: 'ニットぼう', en: 'Beanie' },
]

/** Swatches, each with its color word. */
export interface Swatch {
  c: string
  ja: string
  en: string
}
export const SKIN_TONES: Swatch[] = [
  { c: '#f8dcc2', ja: 'はだ', en: 'Very light' },
  { c: '#f2c9a0', ja: 'はだ', en: 'Light' },
  { c: '#e8b98e', ja: 'はだ', en: 'Light medium' },
  { c: '#d9a77c', ja: 'はだ', en: 'Medium' },
  { c: '#c68e63', ja: 'はだ', en: 'Tan' },
  { c: '#a8724c', ja: 'はだ', en: 'Brown' },
  { c: '#7c5236', ja: 'はだ', en: 'Dark brown' },
  { c: '#5a3a26', ja: 'はだ', en: 'Deep' },
]
export const HAIR_COLORS: Swatch[] = [
  { c: '#2b2320', ja: '黒', en: 'Black' },
  { c: '#3b2a20', ja: 'こげ茶', en: 'Dark brown' },
  { c: '#6b4a32', ja: '茶色', en: 'Brown' },
  { c: '#a0522d', ja: '赤茶', en: 'Auburn' },
  { c: '#d9b56a', ja: '金', en: 'Blonde' },
  { c: '#c9c3b8', ja: '銀', en: 'Silver' },
  { c: '#e58fa1', ja: 'ピンク', en: 'Pink' },
  { c: '#4f6fd1', ja: '青', en: 'Blue' },
  { c: '#6bb38a', ja: '緑', en: 'Green' },
  { c: '#8e5cc4', ja: '紫', en: 'Purple' },
]
export const CLOTH_COLORS: Swatch[] = [
  { c: '#e5484d', ja: '赤', en: 'Red' },
  { c: '#f08a3c', ja: 'オレンジ', en: 'Orange' },
  { c: '#f2c94c', ja: '黄色', en: 'Yellow' },
  { c: '#6fbf73', ja: '緑', en: 'Green' },
  { c: '#3d5a40', ja: '深緑', en: 'Forest' },
  { c: '#5fb8d6', ja: '水色', en: 'Sky blue' },
  { c: '#2f5fb3', ja: '青', en: 'Blue' },
  { c: '#273c75', ja: '紺', en: 'Navy' },
  { c: '#8e5cc4', ja: '紫', en: 'Purple' },
  { c: '#f39ab8', ja: 'ピンク', en: 'Pink' },
  { c: '#f4f1e8', ja: '白', en: 'White' },
  { c: '#c7b79c', ja: 'ベージュ', en: 'Beige' },
  { c: '#8e7c68', ja: '茶色', en: 'Brown' },
  { c: '#6b6f78', ja: 'グレー', en: 'Grey' },
  { c: '#2b3445', ja: 'チャコール', en: 'Charcoal' },
  { c: '#1b1b1f', ja: '黒', en: 'Black' },
]

/** Picking a gender starts from one of these; every piece stays open to everyone. */
const PRESETS: Record<Gender, Omit<Avatar, 'v' | 'gender' | 'name' | 'kana' | 'skin'>> = {
  man: {
    build: 'average',
    height: 'average',
    eyes: 'dot',
    blush: false,
    hair: 'short',
    hairColor: '#2b2320',
    outfit: 'tee',
    top: '#e5484d',
    bottom: '#2b3445',
    accent: '#f2c94c',
    glasses: 'none',
    hat: 'none',
    backpack: true,
  },
  woman: {
    build: 'average',
    height: 'average',
    eyes: 'dot',
    blush: true,
    hair: 'long',
    hairColor: '#3b2a20',
    outfit: 'skirt',
    top: '#f4f1e8',
    bottom: '#273c75',
    accent: '#f39ab8',
    glasses: 'none',
    hat: 'none',
    backpack: false,
  },
}

export function presetFor(gender: Gender, keep?: Partial<Avatar>): Avatar {
  return { v: 1, gender, skin: keep?.skin ?? SKIN_TONES[1].c, name: keep?.name ?? '', kana: keep?.kana ?? '', ...PRESETS[gender] }
}

export const DEFAULT_AVATAR: Avatar = presetFor('man')

/** A random look (the dice button). Keeps gender and name. */
export function randomAvatar(a: Avatar, rand = Math.random): Avatar {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const top = pick(CLOTH_COLORS).c
  let bottom = pick(CLOTH_COLORS).c
  if (bottom === top) bottom = '#2b3445'
  return {
    ...a,
    build: pick(BUILDS).v,
    height: pick(HEIGHTS).v,
    skin: pick(SKIN_TONES).c,
    eyes: pick(EYES).v,
    blush: rand() < 0.5,
    hair: pick(HAIRS).v,
    // Mostly natural colors, sometimes a bright one.
    hairColor: rand() < 0.75 ? pick(HAIR_COLORS.slice(0, 6)).c : pick(HAIR_COLORS.slice(6)).c,
    outfit: pick(OUTFITS).v,
    top,
    bottom,
    accent: pick(CLOTH_COLORS).c,
    glasses: rand() < 0.3 ? pick(GLASSES.slice(1)).v : 'none',
    hat: rand() < 0.25 ? pick(HATS.slice(1)).v : 'none',
    backpack: rand() < 0.4,
  }
}

const KEY = 'japango.player'

/** The saved character, or null for a new player. */
export function loadAvatar(): Avatar | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const a = JSON.parse(raw) as Partial<Avatar>
    if (a?.v !== 1 || (a.gender !== 'man' && a.gender !== 'woman')) return null
    // Fill anything added since it was saved.
    return { ...presetFor(a.gender), ...a } as Avatar
  } catch {
    return null
  }
}

export function saveAvatar(a: Avatar) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    // Not saved; they'll make it again next visit.
  }
}

export function forgetAvatar() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Overall scale for a height, and how wide the body is for a build. */
export const HEIGHT_SCALE: Record<Height, number> = { short: 0.92, average: 1, tall: 1.08 }
export const BUILD_WIDTH: Record<Build, number> = { slim: 0.86, average: 1, sturdy: 1.18 }
