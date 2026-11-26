// Names in katakana, for the name step of the character creator: a
// table of common names, a rough English-spelling-to-sound guess for the
// rest, and a romaji-to-katakana converter so players can type how their
// name sounds ("henrii" → ヘンリイ, "henri-" → ヘンリー). Plus the way back,
// katakana to romaji, to show the reading of each kana.

const BASE: Record<string, string> = {
  a: 'ア',
  i: 'イ',
  u: 'ウ',
  e: 'エ',
  o: 'オ',
  ka: 'カ',
  ki: 'キ',
  ku: 'ク',
  ke: 'ケ',
  ko: 'コ',
  ga: 'ガ',
  gi: 'ギ',
  gu: 'グ',
  ge: 'ゲ',
  go: 'ゴ',
  sa: 'サ',
  si: 'シ',
  shi: 'シ',
  su: 'ス',
  se: 'セ',
  so: 'ソ',
  za: 'ザ',
  zi: 'ジ',
  ji: 'ジ',
  zu: 'ズ',
  ze: 'ゼ',
  zo: 'ゾ',
  ta: 'タ',
  ti: 'ティ',
  chi: 'チ',
  tu: 'トゥ',
  tsu: 'ツ',
  te: 'テ',
  to: 'ト',
  da: 'ダ',
  di: 'ディ',
  du: 'ドゥ',
  de: 'デ',
  do: 'ド',
  na: 'ナ',
  ni: 'ニ',
  nu: 'ヌ',
  ne: 'ネ',
  no: 'ノ',
  ha: 'ハ',
  hi: 'ヒ',
  hu: 'フ',
  fu: 'フ',
  he: 'ヘ',
  ho: 'ホ',
  ba: 'バ',
  bi: 'ビ',
  bu: 'ブ',
  be: 'ベ',
  bo: 'ボ',
  pa: 'パ',
  pi: 'ピ',
  pu: 'プ',
  pe: 'ペ',
  po: 'ポ',
  ma: 'マ',
  mi: 'ミ',
  mu: 'ム',
  me: 'メ',
  mo: 'モ',
  ya: 'ヤ',
  yu: 'ユ',
  ye: 'イェ',
  yo: 'ヨ',
  ra: 'ラ',
  ri: 'リ',
  ru: 'ル',
  re: 'レ',
  ro: 'ロ',
  la: 'ラ',
  li: 'リ',
  lu: 'ル',
  le: 'レ',
  lo: 'ロ',
  wa: 'ワ',
  wi: 'ウィ',
  we: 'ウェ',
  wo: 'ウォ',
  va: 'ヴァ',
  vi: 'ヴィ',
  vu: 'ヴ',
  ve: 'ヴェ',
  vo: 'ヴォ',
  fa: 'ファ',
  fi: 'フィ',
  fe: 'フェ',
  fo: 'フォ',
  kya: 'キャ',
  kyu: 'キュ',
  kyo: 'キョ',
  gya: 'ギャ',
  gyu: 'ギュ',
  gyo: 'ギョ',
  sha: 'シャ',
  shu: 'シュ',
  she: 'シェ',
  sho: 'ショ',
  ja: 'ジャ',
  ju: 'ジュ',
  je: 'ジェ',
  jo: 'ジョ',
  cha: 'チャ',
  chu: 'チュ',
  che: 'チェ',
  cho: 'チョ',
  nya: 'ニャ',
  nyu: 'ニュ',
  nyo: 'ニョ',
  hya: 'ヒャ',
  hyu: 'ヒュ',
  hyo: 'ヒョ',
  bya: 'ビャ',
  byu: 'ビュ',
  byo: 'ビョ',
  pya: 'ピャ',
  pyu: 'ピュ',
  pyo: 'ピョ',
  mya: 'ミャ',
  myu: 'ミュ',
  myo: 'ミョ',
  rya: 'リャ',
  ryu: 'リュ',
  ryo: 'リョ',
  tsa: 'ツァ',
  tse: 'ツェ',
  tso: 'ツォ',
  dyu: 'デュ',
  tyu: 'テュ',
  fyu: 'フュ',
}
const MAX_KEY = 3

/** Romaji (Hepburn, plus the usual spellings for foreign sounds) to
 *  katakana. "-" is the long-vowel mark; "nn" or "n'" is ン. */
export function romajiToKatakana(input: string) {
  const s = input.toLowerCase()
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '-' || ch === 'ー' || ch === '~') {
      out += 'ー'
      i++
      continue
    }
    if (ch === ' ' || ch === '・' || ch === '.') {
      out += '・'
      i++
      continue
    }
    if (!/[a-z']/.test(ch)) {
      // Kana and anything else pass through (katakana for hiragana).
      out += toKatakana(ch)
      i++
      continue
    }
    if (ch === "'") {
      i++
      continue
    }
    // ン: n before a consonant, at the end, or written nn / n'.
    if (ch === 'n') {
      const nx = s[i + 1]
      if (nx === 'n' || nx === "'") {
        out += 'ン'
        i += 2
        continue
      }
      if (!nx || !/[aiueoy]/.test(nx)) {
        out += 'ン'
        i++
        continue
      }
    }
    if (ch === 'm' && s[i + 1] && /[bpm]/.test(s[i + 1])) {
      out += 'ン'
      i++
      continue
    }
    // ッ: a doubled consonant ("tt", "kk", "tch").
    if (s[i + 1] === ch && /[bcdfghjkpqstvwxz]/.test(ch)) {
      out += 'ッ'
      i++
      continue
    }
    if (ch === 't' && s.startsWith('tch', i)) {
      out += 'ッ'
      i++
      continue
    }
    let hit = ''
    for (let len = MAX_KEY; len > 0; len--) {
      const k = s.slice(i, i + len)
      if (BASE[k]) {
        hit = k
        break
      }
    }
    if (hit) {
      out += BASE[hit]
      i += hit.length
      continue
    }
    // A lone consonant: give it the vowel Japanese would (o after t and d).
    const lone: Record<string, string> = {
      t: 'ト',
      d: 'ド',
      k: 'ク',
      g: 'グ',
      s: 'ス',
      z: 'ズ',
      b: 'ブ',
      p: 'プ',
      m: 'ム',
      r: 'ル',
      l: 'ル',
      f: 'フ',
      v: 'ヴ',
      h: 'フ',
      j: 'ジ',
      c: 'ク',
      q: 'ク',
      w: 'ウ',
      y: 'イ',
      x: 'クス',
    }
    if (s.startsWith('sh', i)) {
      out += 'シュ'
      i += 2
      continue
    }
    if (s.startsWith('ch', i)) {
      out += 'チ'
      i += 2
      continue
    }
    if (s.startsWith('ts', i)) {
      out += 'ツ'
      i += 2
      continue
    }
    out += lone[ch] ?? ''
    i++
  }
  return out
}

const isKana = (s: string) => /^[\p{Script=Katakana}\p{Script=Hiragana}ー・\s]+$/u.test(s)
/** Already written in Japanese (kana or kanji): used as it is. */
export const isJapanese = (s: string) => /[\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Han}]/u.test(s)

/** Hiragana to katakana; everything else unchanged. */
export function toKatakana(s: string) {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

// Common given names whose spelling doesn't say how they sound.
const NAMES: Record<string, string> = {
  aaron: 'アーロン',
  adam: 'アダム',
  adrian: 'エイドリアン',
  aidan: 'エイダン',
  alan: 'アラン',
  albert: 'アルバート',
  alex: 'アレックス',
  alexander: 'アレクサンダー',
  alexandra: 'アレクサンドラ',
  alice: 'アリス',
  alicia: 'アリシア',
  alison: 'アリソン',
  amanda: 'アマンダ',
  amber: 'アンバー',
  amelia: 'アメリア',
  amy: 'エイミー',
  andrea: 'アンドレア',
  andrew: 'アンドリュー',
  andy: 'アンディ',
  angela: 'アンジェラ',
  anna: 'アナ',
  anne: 'アン',
  anthony: 'アンソニー',
  ashley: 'アシュリー',
  austin: 'オースティン',
  ava: 'エイヴァ',
  barbara: 'バーバラ',
  ben: 'ベン',
  benjamin: 'ベンジャミン',
  beth: 'ベス',
  betty: 'ベティ',
  bill: 'ビル',
  bob: 'ボブ',
  brandon: 'ブランドン',
  brian: 'ブライアン',
  bryan: 'ブライアン',
  brooke: 'ブルック',
  caleb: 'ケイレブ',
  cameron: 'キャメロン',
  carl: 'カール',
  carlos: 'カルロス',
  carol: 'キャロル',
  caroline: 'キャロライン',
  catherine: 'キャサリン',
  charles: 'チャールズ',
  charlie: 'チャーリー',
  charlotte: 'シャーロット',
  chloe: 'クロエ',
  chris: 'クリス',
  christian: 'クリスチャン',
  christina: 'クリスティーナ',
  christine: 'クリスティーン',
  christopher: 'クリストファー',
  claire: 'クレア',
  cody: 'コーディ',
  connor: 'コナー',
  craig: 'クレイグ',
  daniel: 'ダニエル',
  danny: 'ダニー',
  david: 'デイビッド',
  dave: 'デイブ',
  dennis: 'デニス',
  diana: 'ダイアナ',
  diego: 'ディエゴ',
  dylan: 'ディラン',
  edward: 'エドワード',
  elena: 'エレナ',
  eli: 'イーライ',
  elijah: 'イライジャ',
  elizabeth: 'エリザベス',
  ella: 'エラ',
  ellie: 'エリー',
  emily: 'エミリー',
  emma: 'エマ',
  eric: 'エリック',
  erin: 'エリン',
  ethan: 'イーサン',
  eva: 'エヴァ',
  evan: 'エヴァン',
  frank: 'フランク',
  fred: 'フレッド',
  gabriel: 'ガブリエル',
  gary: 'ゲイリー',
  george: 'ジョージ',
  grace: 'グレース',
  greg: 'グレッグ',
  hannah: 'ハンナ',
  harry: 'ハリー',
  heather: 'ヘザー',
  helen: 'ヘレン',
  henry: 'ヘンリー',
  hugo: 'ヒューゴ',
  ian: 'イアン',
  isaac: 'アイザック',
  isabella: 'イザベラ',
  isabel: 'イザベル',
  jack: 'ジャック',
  jacob: 'ジェイコブ',
  jake: 'ジェイク',
  james: 'ジェームズ',
  jamie: 'ジェイミー',
  jane: 'ジェーン',
  janet: 'ジャネット',
  jason: 'ジェイソン',
  jeff: 'ジェフ',
  jennifer: 'ジェニファー',
  jenny: 'ジェニー',
  jeremy: 'ジェレミー',
  jessica: 'ジェシカ',
  jesse: 'ジェシー',
  jim: 'ジム',
  joe: 'ジョー',
  john: 'ジョン',
  jon: 'ジョン',
  jonathan: 'ジョナサン',
  jordan: 'ジョーダン',
  jose: 'ホセ',
  joseph: 'ジョセフ',
  josh: 'ジョシュ',
  joshua: 'ジョシュア',
  juan: 'フアン',
  julia: 'ジュリア',
  julie: 'ジュリー',
  justin: 'ジャスティン',
  karen: 'カレン',
  kate: 'ケイト',
  katie: 'ケイティ',
  kayla: 'ケイラ',
  keith: 'キース',
  kelly: 'ケリー',
  kevin: 'ケビン',
  kim: 'キム',
  kyle: 'カイル',
  laura: 'ローラ',
  lauren: 'ローレン',
  leo: 'レオ',
  liam: 'リアム',
  lily: 'リリー',
  linda: 'リンダ',
  lisa: 'リサ',
  logan: 'ローガン',
  louis: 'ルイス',
  lucas: 'ルーカス',
  lucy: 'ルーシー',
  luis: 'ルイス',
  luke: 'ルーク',
  madison: 'マディソン',
  maria: 'マリア',
  mark: 'マーク',
  martin: 'マーティン',
  mary: 'メアリー',
  mason: 'メイソン',
  matt: 'マット',
  matthew: 'マシュー',
  max: 'マックス',
  megan: 'ミーガン',
  melissa: 'メリッサ',
  mia: 'ミア',
  michael: 'マイケル',
  michelle: 'ミシェル',
  mike: 'マイク',
  miguel: 'ミゲル',
  molly: 'モリー',
  monica: 'モニカ',
  nancy: 'ナンシー',
  natalie: 'ナタリー',
  nathan: 'ネイサン',
  nicholas: 'ニコラス',
  nick: 'ニック',
  nicole: 'ニコール',
  noah: 'ノア',
  oliver: 'オリバー',
  olivia: 'オリビア',
  oscar: 'オスカー',
  owen: 'オーウェン',
  patrick: 'パトリック',
  paul: 'ポール',
  peter: 'ピーター',
  philip: 'フィリップ',
  phillip: 'フィリップ',
  rachel: 'レイチェル',
  ray: 'レイ',
  rebecca: 'レベッカ',
  richard: 'リチャード',
  rick: 'リック',
  robert: 'ロバート',
  rob: 'ロブ',
  ryan: 'ライアン',
  rose: 'ローズ',
  ruby: 'ルビー',
  sam: 'サム',
  samantha: 'サマンサ',
  samuel: 'サミュエル',
  sara: 'サラ',
  sarah: 'サラ',
  scott: 'スコット',
  sean: 'ショーン',
  shawn: 'ショーン',
  sophia: 'ソフィア',
  sophie: 'ソフィー',
  stephanie: 'ステファニー',
  stephen: 'スティーブン',
  steve: 'スティーブ',
  steven: 'スティーブン',
  susan: 'スーザン',
  taylor: 'テイラー',
  thomas: 'トーマス',
  tim: 'ティム',
  timothy: 'ティモシー',
  tom: 'トム',
  tony: 'トニー',
  tyler: 'タイラー',
  victor: 'ビクター',
  victoria: 'ビクトリア',
  vincent: 'ビンセント',
  william: 'ウィリアム',
  will: 'ウィル',
  zach: 'ザック',
  zoe: 'ゾーイ',
}

/** A rough guess at how an English spelling sounds, as romaji for
 *  romajiToKatakana. Good for most short names; players can fix the rest. */
function englishToRomaji(word: string) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  // Silent e after one consonant makes the vowel before it long (Mike, Kate, Rose).
  w = w
    .replace(/a([^aeiou])e$/, 'ei$1')
    .replace(/i([^aeiou])e$/, 'ai$1')
    .replace(/o([^aeiou])e$/, 'o-$1')
    .replace(/u([^aeiou])e$/, 'yu-$1')
    .replace(/e([^aeiou])e$/, 'i-$1')
  const rules: [RegExp, string][] = [
    [/tion/g, 'shon'],
    [/ph/g, 'f'],
    [/th/g, 's'],
    [/ck/g, 'kk'],
    [/qu/g, 'kw'],
    [/x/g, 'kks'],
    [/c(?=[eiy])/g, 's'],
    [/c/g, 'k'],
    [/kk(?=[^aeiou]|$)/g, 'kk'],
    [/ee|ea/g, 'i-'],
    [/oo/g, 'u-'],
    [/ou|ow(?![aeiou])/g, 'au'],
    [/ai|ay/g, 'ei'],
    [/ie$/g, 'i-'],
    [/([^aeiou])y$/g, '$1i-'],
    [/ey$/g, 'i-'],
    [/([^aeiou])y(?=[^aeiou])/g, '$1i'],
    [/er$|or$|ar$/g, 'a-'],
    [/er(?=[^aeiou])/g, 'a-'],
    [/ir|ur/g, 'a-'],
    [/l/g, 'r'],
    [/v/g, 'b'],
    [/w(?=[^aeiou]|$)/g, ''],
    [/h(?=[^aeiou]|$)/g, ''],
  ]
  w = w.replace(/ll|rr|nn/g, (m) => m[0])
  for (const [re, to] of rules) w = w.replace(re, to)
  return w
}

/** A name in katakana: Japanese input as it is, a known name from the table,
 *  or a guess from its spelling. Each word separately, joined with ・. */
export function nameToKatakana(name: string) {
  const t = name.trim()
  if (!t) return ''
  if (isJapanese(t)) return isKana(t) ? toKatakana(t) : t
  return t
    .split(/\s+/)
    .map((word) => NAMES[word.toLowerCase().replace(/[^a-z]/g, '')] ?? romajiToKatakana(englishToRomaji(word)))
    .join('・')
}

// --- Katakana to romaji, kana by kana -----------------------------------------

const BACK: Record<string, string> = {}
for (const [k, v] of Object.entries(BASE)) {
  // The Hepburn spelling wins (shi over si, ji over zi, fu over hu, chi, tsu).
  if (!BACK[v] || ['shi', 'ji', 'fu', 'chi', 'tsu', 'ra', 'ri', 'ru', 're', 'ro'].includes(k)) BACK[v] = k
}
BACK['ン'] = 'n'
BACK['ヲ'] = 'o'
BACK['ヂ'] = 'ji'
BACK['ヅ'] = 'zu'

/** The katakana split into the pieces you'd read (ティ, ッ, ー together with
 *  the kana before them), each with its romaji. */
export function kanaReading(kana: string): { kana: string; romaji: string }[] {
  const out: { kana: string; romaji: string }[] = []
  const k = toKatakana(kana)
  let i = 0
  while (i < k.length) {
    const two = k.slice(i, i + 2)
    let piece = BACK[two] ? two : k[i]
    let romaji = BACK[piece] ?? (piece === '・' ? '·' : piece)
    i += piece.length
    // Small tsu doubles the next sound; it reads with the kana after it.
    if (piece === 'ッ') {
      const next2 = k.slice(i, i + 2)
      const next = BACK[next2] ? next2 : k[i]
      if (next && BACK[next]) {
        const r = BACK[next]
        piece += next
        romaji = (r.startsWith('ch') ? 't' : r[0]) + r
        i += next.length
      } else romaji = '(pause)'
    }
    // The long-vowel mark stretches the vowel before it.
    while (k[i] === 'ー') {
      piece += 'ー'
      const v = romaji.match(/[aiueo]$/)?.[0]
      romaji = v ? romaji.slice(0, -1) + { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' }[v] : romaji + '-'
      i++
    }
    out.push({ kana: piece, romaji })
  }
  return out
}

/** The whole reading as one romaji word ("ヘンリー" → "henrī"). */
export function kanaRomaji(kana: string) {
  const parts = kanaReading(kana)
  // n' when ン comes before a vowel or y (ケンイチ → ken'ichi).
  return parts.map((p, i) => (p.kana === 'ン' && /^[aiueoāīūēōy]/.test(parts[i + 1]?.romaji ?? '') ? "n'" : p.romaji)).join('')
}
