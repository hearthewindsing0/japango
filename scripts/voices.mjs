// The VOICEVOX voices the people at the talking spots speak with. Each is a
// VOICEVOX character (and style) whose terms allow use in a public game with
// a credit line, "VOICEVOX:<name>". Checked 2026-11-22 against each voice's
// terms in the engine's /speaker_info; some (もち子さん, No.7) are left out
// because their terms exclude games or commercial use.
// `about` is what the conversation writer sees when it casts the speakers.
export const VOICES = {
  冥鳴ひまり: { style: 'ノーマル', female: true, about: 'woman, 20s, calm and gentle' },
  春日部つむぎ: { style: 'ノーマル', female: true, about: 'young woman, late teens to early 20s, bright and casual' },
  九州そら: { style: 'ノーマル', female: true, about: 'woman, 20s-30s, clear and composed' },
  東北イタコ: { style: 'ノーマル', female: true, older: true, about: 'woman, 30s-40s, soft-spoken and mature' },
  玄野武宏: { style: 'ノーマル', about: 'young man, 20s, friendly' },
  雀松朱司: { style: 'ノーマル', about: 'man, 20s-30s, calm and gentle' },
  青山龍星: { style: 'ノーマル', about: 'man, 30s-40s, deep and steady' },
  麒ヶ島宗麟: { style: 'ノーマル', older: true, about: 'man, 50s-60s, dignified' },
}

/** The credit each voice's terms ask for. */
export const credit = (name) => `VOICEVOX:${name}`
