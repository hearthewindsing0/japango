import '@fontsource/shippori-mincho/700.css'
import '@fontsource/shippori-mincho/800.css'
import '@fontsource/yuji-syuku/400.css'
import '@fontsource/pacifico/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/900.css'
import '@fontsource/m-plus-rounded-1c/800.css'
import brandsJson from './signs/brands.json'
import roppongiJson from './signs/roppongi.json'

// What each shop's real sign looks like: colors, lettering, typeface and
// extras (stripes, a logo mark, an awning, a noren curtain, lanterns),
// worked out from street photos of the shop (scripts/fetch-sign-photos.mjs)
// and what's known about it. Chains are in signs/brands.json, matched by
// name; one-off shops in signs/<area>.json by their exact map name. Others
// get the usual look of their kind of shop when the name says what it is
// (genres in brands.json), or else a plain board in their kind's colors.

export type SignFont = 'gothic' | 'round' | 'mincho' | 'brush' | 'serif' | 'script'

export type SignStyle = {
  /** What the sign says, if not the shop's map name. "\n" splits two lines. */
  text?: string
  /** A smaller second line under the name (COFFEE, 中華そば...). */
  sub?: string
  bg: string
  fg: string
  /** Frame around the board. Default: the toy cream rim. "none": no frame. */
  rim?: string
  font?: SignFont
  weight?: number
  italic?: boolean
  /** Letter spacing in em, for wide spaced-out names. */
  spacing?: number
  /** Stripes across the bottom (or top) of the board, top to bottom. */
  bands?: string[]
  bandsTop?: string[]
  /** A round or square logo mark left of the name. */
  mark?: { shape: 'circle' | 'square' | 'diamond'; bg: string; fg?: string; text?: string }
  /** "letters": the name stands on the wall with no board behind it. */
  shape?: 'board' | 'letters'
  /** Board size: 1 is normal; bigger for flagship fronts. */
  size?: number
  /** Canvas awning over the shop front: its color, and a stripe color. */
  awning?: string
  awningStripe?: string
  /** Noren curtain in the doorway: its color, text color and text. */
  noren?: { bg: string; fg: string; text?: string }
  /** Red (or given color) paper lanterns either side of the door. */
  lanterns?: string
  /** Vertical sign: true/false to force it; colors if different from the board. */
  vertical?: boolean
  vbg?: string
  vfg?: string
  vtext?: string
}

type Entry = SignStyle & { match?: string; note?: string }
const compile = (list: Entry[] = []) => list.map((b) => ({ ...b, re: new RegExp(b.match ?? '^$', 'i') }))
const brands = compile((brandsJson as { brands: Entry[] }).brands)
// Kinds of shop recognised by their name (yakitori, ramen, sushi...), for
// shops nobody has looked up: the usual look of that kind of shop.
const genres = compile((brandsJson as { genres?: Entry[] }).genres)
const byName: Record<string, Entry> = (roppongiJson as { signs: Record<string, Entry> }).signs

const KIND_DEFAULT: Record<string, SignStyle> = {
  konbini: { bg: '#2b6cb0', fg: '#ffffff' },
  food: { bg: '#b91c1c', fg: '#fff7e6' },
  cafe: { bg: '#5b3a29', fg: '#f5e6c8' },
  bar: { bg: '#1f1235', fg: '#ff7ad9' },
}

/** The sign style for a shop: its own entry, its chain's, or its kind's default. */
export function signStyle(name: string, kind: string): SignStyle {
  const own = byName[name]
  if (own) return own
  const brand = brands.find((b) => b.re.test(name)) ?? genres.find((b) => b.re.test(name))
  if (brand) return brand
  return KIND_DEFAULT[kind] ?? { bg: '#f4f1ea', fg: '#222222' }
}

const FAMILY: Record<SignFont, string> = {
  gothic: '"M PLUS 1 Variable"',
  round: '"M PLUS Rounded 1c"',
  mincho: '"Shippori Mincho"',
  brush: '"Yuji Syuku"',
  serif: '"Playfair Display", "Shippori Mincho"',
  script: '"Pacifico", "M PLUS Rounded 1c"',
}
const FALLBACK = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'

export function fontOf(st: SignStyle, size: number) {
  const f = st.font ?? 'gothic'
  const weight = st.weight ?? (f === 'brush' || f === 'script' ? 400 : f === 'mincho' ? 800 : f === 'serif' ? 900 : 800)
  return `${st.italic ? 'italic ' : ''}${weight} ${size}px ${FAMILY[f]}, ${FALLBACK}`
}

/** Fonts (with the characters) every style on this tile needs, to wait for before drawing. */
export function fontLoads(items: { text: string; st: SignStyle }[]) {
  const by = new Map<string, string>()
  for (const { text, st } of items) {
    const key = fontOf(st, 36)
    by.set(key, (by.get(key) ?? '') + text + (st.sub ?? '') + (st.vtext ?? ''))
  }
  return [...by].map(([font, text]) => document.fonts.load(font, text))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

/** Text fitted into a width, shrinking the font as needed. */
function fitText(ctx: CanvasRenderingContext2D, st: SignStyle, text: string, cx: number, cy: number, maxW: number, size: number) {
  ctx.font = fontOf(st, size)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = st.spacing ? `${st.spacing * size}px` : '0px'
  const w = ctx.measureText(text).width
  if (w > maxW) {
    size = Math.max(10, Math.floor((size * maxW) / w))
    ctx.font = fontOf(st, size)
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = st.spacing ? `${st.spacing * size}px` : '0px'
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy, maxW)
  // The brush face is thin at sign sizes: go over it once to thicken the strokes.
  if (st.font === 'brush') {
    ctx.strokeStyle = ctx.fillStyle
    ctx.lineWidth = Math.max(1, size * 0.07)
    ctx.lineJoin = 'round'
    ctx.strokeText(text, cx, cy, maxW)
  }
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
  return size
}

/** A horizontal board (w × h slot) in the shop's style. */
export function drawBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, st: SignStyle) {
  const letters = st.shape === 'letters'
  let ix = x + 2
  let iy = y + 2
  let iw = w - 4
  let ih = h - 4
  let r = 14
  if (!letters) {
    if (st.rim !== 'none') {
      roundRect(ctx, ix, iy, iw, ih, r, st.rim ?? '#fbf3e4')
      ix += 4
      iy += 4
      iw -= 8
      ih -= 8
      r -= 4
    }
    roundRect(ctx, ix, iy, iw, ih, r, st.bg)
  }
  // Stripes, clipped to the board's rounded shape.
  if (!letters && (st.bands?.length || st.bandsTop?.length)) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(ix, iy, iw, ih, r)
    ctx.clip()
    const bh = Math.max(3, Math.round(ih * 0.1))
    st.bands?.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect(ix, iy + ih - bh * (st.bands!.length - i), iw, bh)
    })
    st.bandsTop?.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect(ix, iy + bh * i, iw, bh)
    })
    ctx.restore()
    if (st.bands?.length) ih -= bh * st.bands.length
    if (st.bandsTop?.length) {
      iy += bh * st.bandsTop.length
      ih -= bh * st.bandsTop.length
    }
  }
  let tx = ix + 10
  let tw = iw - 20
  if (st.mark) {
    const m = st.mark
    const s = ih * 0.78
    const mx = ix + 8
    const my = iy + (ih - s) / 2
    ctx.fillStyle = m.bg
    ctx.beginPath()
    if (m.shape === 'circle') ctx.arc(mx + s / 2, my + s / 2, s / 2, 0, Math.PI * 2)
    else if (m.shape === 'diamond') {
      ctx.moveTo(mx + s / 2, my)
      ctx.lineTo(mx + s, my + s / 2)
      ctx.lineTo(mx + s / 2, my + s)
      ctx.lineTo(mx, my + s / 2)
    } else ctx.roundRect(mx, my, s, s, s * 0.18)
    ctx.fill()
    if (m.text) {
      ctx.fillStyle = m.fg ?? st.fg
      fitText(ctx, st, m.text, mx + s / 2, my + s / 2 + 1, s * 0.8, Math.round(s * 0.62))
    }
    tx = mx + s + 6
    tw = ix + iw - 10 - tx
  }
  const text = st.text ?? name
  const [line1, line2] = text.split('\n')
  ctx.fillStyle = st.fg
  if (letters) {
    // Letters on the wall: a soft dark edge so they read on any facade.
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 3
  }
  const two = line2 ?? st.sub
  if (two) {
    const s1 = fitText(ctx, st, line1, tx + tw / 2, iy + ih * 0.38, tw, Math.round(ih * 0.5))
    fitText(ctx, { ...st, spacing: st.spacing ?? 0.12, font: line2 ? st.font : 'gothic', weight: line2 ? st.weight : 700 }, two, tx + tw / 2, iy + ih * 0.78, tw, Math.min(s1, Math.round(ih * 0.26)))
  } else fitText(ctx, st, line1, tx + tw / 2, iy + ih / 2 + 2, tw, Math.round(ih * 0.66))
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
}

/** A vertical sign (w × h slot): one character per line, top to bottom. */
export function drawVerticalBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, st: SignStyle) {
  const bg = st.vbg ?? st.bg
  const fg = st.vfg ?? st.fg
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 14, st.rim && st.rim !== 'none' ? st.rim : '#fbf3e4')
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 10, bg)
  ctx.fillStyle = fg
  const chars = [...(st.vtext ?? st.text?.replace('\n', '') ?? name)].slice(0, 8)
  const size = Math.min(40, Math.floor((h - 24) / chars.length))
  ctx.font = fontOf(st.font === 'script' || st.font === 'serif' ? { ...st, font: 'gothic' } : st, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chars.forEach((ch, i) => ctx.fillText(ch, x + w / 2, y + (h - size * chars.length) / 2 + size * (i + 0.5), w - 14))
}

/** Awning cloth: solid or with wide stripes running down it. */
export function drawAwning(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, st: SignStyle) {
  ctx.fillStyle = st.awning ?? '#888'
  ctx.fillRect(x, y, w, h)
  if (st.awningStripe) {
    ctx.fillStyle = st.awningStripe
    const n = 12
    for (let i = 0; i < n; i += 2) ctx.fillRect(x + (w / n) * i, y, w / n, h)
  }
  // Scalloped hem.
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(x, y + h - 6, w, 6)
}

/** Noren: a cloth with the name split across its panels, slits between. */
export function drawNoren(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, st: SignStyle) {
  const n = st.noren!
  const chars = [...(n.text ?? st.vtext ?? name)].filter((c) => c.trim()).slice(0, 4)
  const panels = Math.max(2, Math.min(4, chars.length || 3))
  const pw = w / panels
  ctx.clearRect(x, y, w, h)
  for (let i = 0; i < panels; i++) {
    ctx.fillStyle = n.bg
    ctx.fillRect(x + i * pw + 2, y, pw - 4, h)
    if (i === 0) ctx.fillRect(x, y, w, h * 0.12)
  }
  ctx.fillStyle = n.fg
  const size = Math.min(pw * 0.9, h * 0.62)
  ctx.font = fontOf({ ...st, font: st.font === 'script' || st.font === 'serif' ? 'mincho' : (st.font ?? 'mincho') }, Math.round(size))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const off = (panels - chars.length) / 2
  chars.forEach((c, i) => ctx.fillText(c, x + pw * (i + off + 0.5), y + h * 0.55, pw * 0.9))
}
