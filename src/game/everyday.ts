// A stand-in for the everyday tier of people, for the station platforms.
//
// The people of the area are written by Claude into public/life/<area>/
// (people.json, outings.json): the full tier with whole days and
// conversations, and later an everyday tier of ~1,500 people with slimmer
// records. Until that everyday tier exists, this makes one up the same way
// every time: each person has a name, an age, a job, their own clothes,
// the station along the line where they live, and a plan for the day that
// makes sense (in to work in the morning and home in the evening; out from
// Roppongi and back; in for lunch or shopping; in for a night out and home
// before the last train). riders.ts turns the plans into rides on real
// trains. It switches off once people.json has everyday people.
import { randomLook } from './character'
import type { Ride, Rider, RiderSource } from './riders'
import type { Station } from './station'

/** How many of the everyday tier ride the subway through Roppongi, in
 *  this stand-in. The real station sees about 100,000 people a day, so any
 *  number we can draw is a small sample; this many keeps every platform
 *  with someone on it at busy times. */
const RIDERS = 3000

const FAMILY: [string, string][] = [
  ['佐藤', 'Satō'], ['鈴木', 'Suzuki'], ['高橋', 'Takahashi'], ['田中', 'Tanaka'], ['伊藤', 'Itō'], ['渡辺', 'Watanabe'],
  ['山本', 'Yamamoto'], ['中村', 'Nakamura'], ['小林', 'Kobayashi'], ['加藤', 'Katō'], ['吉田', 'Yoshida'], ['山田', 'Yamada'],
  ['佐々木', 'Sasaki'], ['山口', 'Yamaguchi'], ['松本', 'Matsumoto'], ['井上', 'Inoue'], ['木村', 'Kimura'], ['林', 'Hayashi'],
  ['斎藤', 'Saitō'], ['清水', 'Shimizu'], ['山崎', 'Yamazaki'], ['森', 'Mori'], ['池田', 'Ikeda'], ['橋本', 'Hashimoto'],
  ['阿部', 'Abe'], ['石川', 'Ishikawa'], ['山下', 'Yamashita'], ['中島', 'Nakajima'], ['石井', 'Ishii'], ['小川', 'Ogawa'],
  ['前田', 'Maeda'], ['岡田', 'Okada'], ['長谷川', 'Hasegawa'], ['藤田', 'Fujita'], ['後藤', 'Gotō'], ['近藤', 'Kondō'],
]
const GIVEN_F: [string, string][] = [
  ['陽菜', 'Hina'], ['結衣', 'Yui'], ['美咲', 'Misaki'], ['さくら', 'Sakura'], ['葵', 'Aoi'], ['真由美', 'Mayumi'],
  ['恵子', 'Keiko'], ['裕子', 'Yūko'], ['明美', 'Akemi'], ['彩', 'Aya'], ['舞', 'Mai'], ['千尋', 'Chihiro'],
  ['奈々', 'Nana'], ['由美', 'Yumi'], ['香織', 'Kaori'], ['麻衣', 'Mai'], ['理恵', 'Rie'], ['美穂', 'Miho'],
]
const GIVEN_M: [string, string][] = [
  ['翔太', 'Shōta'], ['大輝', 'Daiki'], ['拓海', 'Takumi'], ['健太', 'Kenta'], ['誠', 'Makoto'], ['浩', 'Hiroshi'],
  ['隆', 'Takashi'], ['直樹', 'Naoki'], ['亮', 'Ryō'], ['陸', 'Riku'], ['蓮', 'Ren'], ['和也', 'Kazuya'],
  ['達也', 'Tatsuya'], ['修', 'Osamu'], ['悠真', 'Yūma'], ['健一', 'Ken\'ichi'], ['剛', 'Tsuyoshi'], ['聡', 'Satoshi'],
]
const JOBS = {
  office: ['office worker', 'sales rep', 'software engineer', 'accountant', 'marketing planner', 'bank clerk', 'consultant', 'designer', 'lawyer', 'HR coordinator'],
  service: ['hotel staff', 'restaurant cook', 'shop clerk', 'hairdresser', 'bartender', 'konbini part-timer', 'nurse', 'security guard', 'cleaner'],
  other: ['university student', 'high school student', 'retiree', 'homemaker', 'freelance writer', 'tourist from Osaka', 'musician'],
}

/** Stations either way along each line from Roppongi, where people live.
 *  Side 0: the end trains on platform index 0 come from (so they get off
 *  on platform 0 and go home from platform 1). */
const HOMES: Record<string, [string[], string[]]> = {
  // Hibiya Line: platform 0 runs to Kita-senju, so its trains come from
  // the Naka-meguro end.
  H04: [
    ['広尾', '恵比寿', '中目黒', '祐天寺', '学芸大学', '武蔵小杉'],
    ['神谷町', '霞ケ関', '銀座', '秋葉原', '上野', '北千住', '南千住'],
  ],
  // Ōedo Line: platform 0 (2番線) runs to Daimon, so its trains come from
  // Aoyama-itchōme and Shinjuku.
  E23: [
    ['青山一丁目', '国立競技場', '代々木', '新宿', '中野坂上', '練馬', '光が丘'],
    ['麻布十番', '大門', '月島', '門前仲町', '清澄白河', '両国', '森下'],
  ],
}

type Kind = 'commuter' | 'resident' | 'midday' | 'night' | 'transfer'

/** Minutes after midnight, around a time, roughly bell-shaped. */
function around(r: () => number, mid: number, spread: number) {
  return Math.round(mid + ((r() + r() + r()) / 3 - 0.5) * 2 * spread)
}

export function everydayTier(stations: Station[]): RiderSource {
  const riders = new Map<string, Rider>()
  const rides: Ride[] = []
  const lines = stations.filter((s) => HOMES[s.id] && s.platforms.length >= 2)
  if (!lines.length) return { riders, rides }
  let seed = 20261124
  const r = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]
  for (let i = 0; i < RIDERS; i++) {
    const id = `everyday-${String(i + 1).padStart(4, '0')}`
    const st = lines[r() < 0.55 || lines.length < 2 ? 0 : 1]
    const female = r() < 0.5
    const [fam, famEn] = pick(FAMILY)
    const [giv, givEn] = pick(female ? GIVEN_F : GIVEN_M)
    const roll = r()
    const kind: Kind = roll < 0.47 ? 'commuter' : roll < 0.58 ? 'resident' : roll < 0.7 ? 'midday' : roll < 0.84 ? 'night' : 'transfer'
    const age = kind === 'night' ? 20 + Math.floor(r() * 25) : kind === 'midday' ? 18 + Math.floor(r() * 60) : 20 + Math.floor(r() * 45)
    const job = age >= 66 ? 'retiree' : kind === 'commuter' ? pick(r() < 0.7 ? JOBS.office : JOBS.service) : kind === 'midday' ? pick(JOBS.other) : pick([...JOBS.office, ...JOBS.service])
    const look = randomLook(r)
    look.longHair = female ? r() < 0.7 : r() < 0.08
    if (job.includes('office') || job === 'sales rep' || job === 'bank clerk' || job === 'consultant' || job === 'lawyer' || job === 'accountant') {
      // Suits: dark jackets, white or pale shirts don't show, so dark tops.
      look.shirt = pick(['#1f2633', '#2b3445', '#1b1f27', '#3a3f4b', '#e9eef5'])
      look.pants = pick(['#1b1f27', '#2b3445', '#1f2633'])
    }
    // Which way along the line they live.
    const side = r() < 0.5 ? 0 : 1
    const home = pick(HOMES[st.id][side])
    riders.set(id, {
      id,
      name: `${fam}${giv}`,
      nameEn: `${givEn} ${famEn}`,
      age,
      occupation: job,
      look,
      tier: 'everyday',
      home,
    })
    // Coming in: off a train on the platform whose trains come from their
    // side (index `side`). Going home: on the other platform.
    const off = (min: number, days?: 0 | 1) => rides.push({ who: id, station: st.id, platform: side, board: false, at: min * 60, days })
    const on = (min: number, days?: 0 | 1) => rides.push({ who: id, station: st.id, platform: 1 - side, board: true, at: min * 60, days })
    // Living near Roppongi: out from the far platform, back on the near one.
    const outOn = (min: number, days?: 0 | 1) => rides.push({ who: id, station: st.id, platform: 1 - side, board: true, at: min * 60, days })
    const backOff = (min: number, days?: 0 | 1) => rides.push({ who: id, station: st.id, platform: side, board: false, at: min * 60, days })
    switch (kind) {
      case 'commuter': {
        // Weekdays; some work weekends too (shops, hotels).
        const days = job && JOBS.service.includes(job) ? undefined : 0
        const start = around(r, 8 * 60 + 40, 70)
        const late = r() < 0.25
        off(start - 8, days)
        on(late ? around(r, 21 * 60 + 30, 70) : around(r, 18 * 60 + 40, 60), days)
        break
      }
      case 'resident':
        outOn(around(r, 8 * 60 + 15, 60), 0)
        backOff(around(r, 19 * 60 + 15, 80), 0)
        break
      case 'midday': {
        // Shopping and lunch: more of them on weekends.
        const days = r() < 0.6 ? 1 : undefined
        off(around(r, 11 * 60 + 45, 75), days)
        on(around(r, 15 * 60 + 45, 90), days)
        break
      }
      case 'transfer': {
        // Changing between the Hibiya and Ōedo lines at Roppongi, to work
        // and back: off one line, a few minutes' walk, on the other.
        const other = lines.find((x) => x !== st)
        if (!other) break
        const plat = r() < 0.5 ? 0 : 1
        const days = r() < 0.75 ? 0 : undefined
        const t1 = around(r, 8 * 60 + 30, 80)
        const t2 = around(r, 19 * 60, 100)
        const walk = 5 + Math.floor(r() * 4)
        off(t1, days)
        rides.push({ who: id, station: other.id, platform: plat, board: true, at: (t1 + walk) * 60, days })
        rides.push({ who: id, station: other.id, platform: 1 - plat, board: false, at: t2 * 60, days })
        on(t2 + walk, days)
        break
      }
      case 'night': {
        const days = r() < 0.4 ? 1 : undefined
        off(around(r, 19 * 60 + 45, 75), days)
        // Home before the last train, most of them.
        on(Math.min(24 * 60 + 15, around(r, 23 * 60 + 10, 60)), days)
        break
      }
    }
  }
  return { riders, rides }
}
