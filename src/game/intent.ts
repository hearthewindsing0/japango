// Without the player's own AI, speech still works: what they said is
// matched to the closest scripted reply (ask for a recommendation, the way,
// how they are, or say goodbye), and the person answers with their
// scripted line for it. Free, and close enough for the stock questions.

export type Intent = 'recommend' | 'directions' | 'topic' | 'bye' | 'greet'

const RULES: [Intent, RegExp][] = [
  ['bye', /ありがと|さよう?なら|じゃあね|またね|失礼します|しつれいします|バイバイ|では|それじゃ|サンキュー/],
  ['recommend', /おすすめ|オススメ|お勧め|お薦め|すすめ|いい店|いいお店|おいしい|美味しい|ごはん|ご飯|食べ|たべ|飲み|のみ|カフェ|ラーメン|何がある|なにがある|見どころ|楽しい|たのしい|観光/],
  ['directions', /道|みち|どこ|どちら|どっち|駅|えき|行き方|いきかた|行きたい|いきたい|迷|まよ|場所|ばしょ|近く.*(?:ある|あり)|トイレ|コンビニ|教えて|おしえて/],
  ['topic', /元気|げんき|どう(?:です|でした|だった)?か?|最近|さいきん|調子|ちょうし|お仕事|しごと|天気|てんき|寒|さむ|暑|あつ|趣味|しゅみ|週末|しゅうまつ|何して|なにして/],
  ['greet', /こんにち|こんばん|おはよう|はじめまして|すみません|すいません|あの|もしもし|ハロー|やあ/],
]

/** The scripted reply closest to what they said, or null if nothing fits. */
export function matchIntent(text: string): Intent | null {
  const t = text.replace(/\s/g, '')
  for (const [intent, re] of RULES) if (re.test(t)) return intent
  return null
}

/** When nothing matched: the person didn't follow. */
export const NOT_CAUGHT = [
  { ja: 'すみません、もう一度言ってもらえますか？', en: 'Sorry, could you say that again?' },
  { ja: 'えっと…ごめんなさい、よくわからなかったです。', en: 'Um… sorry, I didn’t quite get that.' },
  { ja: 'ん？もう一回お願いします。', en: 'Hm? One more time, please.' },
]
