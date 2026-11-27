// Everyone on the street is someone you can talk to. The people with whole
// days written for them (life.ts) have their own approach lines; the rest of
// the passers-by (Crowd.tsx) and the pairs at the talking spots (Talkers.tsx)
// get a seeded identity here (same person every visit) and stock lines that
// fit their age and manner, until the everyday tier of people is written.
// All scripted, so talking to them is free.
import type { Look } from './character'
import { FAMILY, GIVEN_F, GIVEN_M, JOBS } from './everyday'
import type { Approach, ApproachLine, LifePerson } from './life'

type Bank = Approach['lines']
const L = (ja: string, en: string): ApproachLine => ({ ja, en })

/** Polite: most adults talking to a stranger. */
const POLITE: Bank = {
  greet: [
    L('はい、こんにちは。どうしましたか？', 'Yes, hello. What is it?'),
    L('あ、こんにちは。何かお困りですか？', 'Oh, hello. Do you need help with something?'),
    L('こんにちは。日本語、上手ですね。', 'Hello. Your Japanese is good.'),
    L('はい？ あ、こんにちは。', 'Yes? Oh, hello.'),
  ],
  recommend: [
    L('ミッドタウンの公園は、散歩にいいですよ。', 'The park at Midtown is nice for a walk.'),
    L('六本木ヒルズの展望台、景色がきれいですよ。', 'The observation deck at Roppongi Hills has a beautiful view.'),
    L('この近くのラーメン屋さん、おいしいですよ。', 'There’s a good ramen shop near here.'),
    L('国立新美術館は、建物だけでも見る価値がありますよ。', 'The National Art Center is worth seeing just for the building.'),
  ],
  directions: [
    L('駅ならあっちです。交差点を渡ってすぐですよ。', 'The station is that way. Right after you cross the intersection.'),
    L('この道をまっすぐ行って、信号を右です。', 'Go straight along this road and turn right at the lights.'),
    L('すみません、私もこのへんはあまり詳しくなくて…', 'Sorry, I don’t really know this area well either…'),
    L('地図を見ると早いですよ。Mキーで開けます。', 'Looking at a map is quickest. (Press M for the map.)'),
  ],
  topic: [
    L('まあまあです。仕事がちょっと忙しいですね。', 'So-so. Work’s a bit busy.'),
    L('元気ですよ。今日はいい天気ですね。', 'I’m well. Nice weather today, isn’t it.'),
    L('最近、寒くなってきましたね。', 'It’s been getting cold lately, hasn’t it.'),
    L('おかげさまで。週末が楽しみです。', 'Fine, thanks. I’m looking forward to the weekend.'),
  ],
  bye: [
    L('いいえ。じゃあ、気をつけて。', 'Not at all. Take care, then.'),
    L('どういたしまして。楽しんでくださいね。', 'You’re welcome. Enjoy yourself.'),
    L('はい、またどこかで。', 'Sure, see you around.'),
  ],
}

/** Casual: younger people, friendly. */
const CASUAL: Bank = {
  greet: [
    L('あ、こんにちは！どうしたの？', 'Oh, hi! What’s up?'),
    L('え、日本語話せるの？すごい！', 'Wait, you speak Japanese? Amazing!'),
    L('こんにちは〜。観光？', 'Hi~. Sightseeing?'),
  ],
  recommend: [
    L('ドンキ、おもしろいよ！なんでも売ってる。', 'Don Quijote is fun! They sell everything.'),
    L('夜の六本木、けっこう楽しいよ。', 'Roppongi at night is pretty fun.'),
    L('ヒルズのけやき坂、冬はイルミネーションがきれいだよ。', 'Keyakizaka at Roppongi Hills has pretty lights in winter.'),
    L('このへんのカフェなら、スタバが一番わかりやすいかな。', 'For a café around here, Starbucks is the easiest to find.'),
  ],
  directions: [
    L('駅？あっちだよ。すぐそこ。', 'The station? That way. Right over there.'),
    L('うーん、ごめん、わかんないや。', 'Hmm, sorry, no idea.'),
    L('まっすぐ行って、コンビニの角を曲がって。', 'Go straight and turn at the convenience store corner.'),
  ],
  topic: [
    L('元気だよ！今から友だちとごはん。', 'I’m good! Off to eat with friends now.'),
    L('バイトが忙しくて、ちょっと疲れた〜。', 'My part-time job’s been busy, I’m a bit tired.'),
    L('いい感じ！最近、カメラにはまってるんだ。', 'Pretty good! I’m into photography lately.'),
  ],
  bye: [
    L('うん、じゃあね！', 'Yeah, bye!'),
    L('どういたしまして〜。楽しんでね！', 'No problem~. Have fun!'),
    L('またね！', 'See you!'),
  ],
}

/** Busy: in a hurry, short answers. */
const BUSY: Bank = {
  greet: [
    L('あ、すみません、ちょっと急いでて…', 'Oh, sorry, I’m in a bit of a hurry…'),
    L('はい、なんでしょう？手短にお願いします。', 'Yes, what is it? Please make it quick.'),
  ],
  recommend: [L('うーん、ヒルズかミッドタウンですかね。', 'Hmm, Roppongi Hills or Midtown, I suppose.')],
  directions: [L('駅はあっちです。じゃあ。', 'The station’s that way. Bye.')],
  topic: [L('いや、今日はバタバタで…すみません。', 'Ah, today’s been hectic… sorry.')],
  bye: [L('いえいえ。失礼します。', 'Not at all. Excuse me.')],
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

/** A passer-by: who they are and what they say if you walk up. */
export function passerby(id: string, seed: number, look: Look, female?: boolean, heardAs?: string): LifePerson {
  const r = seeded(seed)
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]
  const woman = female ?? (look.longHair ? r() < 0.85 : r() < 0.25)
  let [family, familyEn] = pick(FAMILY)
  let [name, nameEn] = pick(woman ? GIVEN_F : GIVEN_M)
  // Someone you overheard keeps the name you heard (no honorific).
  const heard = heardAs?.replace(/(さん|くん|ちゃん|様)$/, '').trim()
  if (heard) [family, familyEn, name, nameEn] = ['', '', heard, heard]
  const age = Math.round(18 + r() * r() * 55)
  const job = age < 23 ? pick(JOBS.other.slice(0, 2)) : age > 66 ? 'retiree' : pick(r() < 0.6 ? JOBS.office : r() < 0.7 ? JOBS.service : JOBS.other)
  const busy = r() < 0.15
  const casual = !busy && age < 30
  return {
    id,
    name,
    family,
    nameEn: `${nameEn} ${familyEn}`,
    age,
    gender: woman ? 'female' : 'male',
    occupation: job,
    personality: '',
    mood: '',
    look,
    voice: '',
    approach: {
      openness: busy ? 'busy' : casual ? 'chatty' : 'polite-brief',
      register: casual ? 'casual' : 'polite',
      topics: [],
      knows: [],
      avoids: '',
      lines: busy ? BUSY : casual ? CASUAL : POLITE,
    },
  }
}

export function hashId(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
