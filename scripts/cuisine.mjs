// Japanese names for OpenStreetMap's cuisine=* values, the way restaurant
// signs and guides write them: [Japanese, English].
export const CUISINE = {
  japanese: ['和食', 'Japanese food'],
  ramen: ['ラーメン', 'ramen'],
  chinese: ['中華料理', 'Chinese food'],
  italian: ['イタリア料理', 'Italian food'],
  coffee_shop: ['コーヒー', 'coffee'],
  noodle: ['麺類', 'noodles'],
  sushi: ['寿司', 'sushi'],
  burger: ['ハンバーガー', 'burgers'],
  french: ['フランス料理', 'French food'],
  pizza: ['ピザ', 'pizza'],
  indian: ['インド料理', 'Indian food'],
  american: ['アメリカ料理', 'American food'],
  steak_house: ['ステーキ', 'steak'],
  beef_steak: ['ステーキ', 'steak'],
  steak: ['ステーキ', 'steak'],
  barbecue: ['バーベキュー', 'barbecue'],
  regional: ['郷土料理', 'regional food'],
  asian: ['アジア料理', 'Asian food'],
  yakitori: ['焼き鳥', 'yakitori (grilled chicken)'],
  brazilian: ['ブラジル料理', 'Brazilian food'],
  sandwich: ['サンドイッチ', 'sandwiches'],
  beef_bowl: ['牛丼', 'beef bowls'],
  singaporean: ['シンガポール料理', 'Singaporean food'],
  curry: ['カレー', 'curry'],
  israeli: ['イスラエル料理', 'Israeli food'],
  moroccan: ['モロッコ料理', 'Moroccan food'],
  persian: ['ペルシャ料理', 'Persian food'],
  korean: ['韓国料理', 'Korean food'],
  western: ['洋食', 'Western-style food'],
  seafood: ['海鮮料理', 'seafood'],
  pasta: ['パスタ', 'pasta'],
  vietnamese: ['ベトナム料理', 'Vietnamese food'],
  vetnamise: ['ベトナム料理', 'Vietnamese food'],
  teppanyaki: ['鉄板焼き', 'teppanyaki'],
  mediterranean: ['地中海料理', 'Mediterranean food'],
  dessert: ['デザート', 'desserts'],
  falafel: ['ファラフェル', 'falafel'],
  international: ['多国籍料理', 'international food'],
  pancake: ['パンケーキ', 'pancakes'],
  ice_cream: ['アイスクリーム', 'ice cream'],
  greek: ['ギリシャ料理', 'Greek food'],
  thai: ['タイ料理', 'Thai food'],
  swedish: ['スウェーデン料理', 'Swedish food'],
  fish: ['魚料理', 'fish dishes'],
  fish_and_chips: ['フィッシュアンドチップス', 'fish and chips'],
  chicken: ['鶏料理', 'chicken dishes'],
  bistro: ['ビストロ', 'bistro'],
  yakiniku: ['焼肉', 'yakiniku (grilled meat)'],
  donut: ['ドーナツ', 'doughnuts'],
  soba: ['そば', 'soba noodles'],
  udon: ['うどん', 'udon noodles'],
  tempura: ['天ぷら', 'tempura'],
  tonkatsu: ['とんかつ', 'tonkatsu (pork cutlet)'],
  izakaya: ['居酒屋', 'izakaya (Japanese pub)'],
  okonomiyaki: ['お好み焼き', 'okonomiyaki'],
  shabu_shabu: ['しゃぶしゃぶ', 'shabu-shabu'],
  'shabu-shabu': ['しゃぶしゃぶ', 'shabu-shabu'],
  sukiyaki: ['すき焼き', 'sukiyaki'],
  unagi: ['うなぎ', 'eel'],
  kaiseki: ['懐石料理', 'kaiseki (course meal)'],
  spanish: ['スペイン料理', 'Spanish food'],
  mexican: ['メキシコ料理', 'Mexican food'],
  german: ['ドイツ料理', 'German food'],
  kebab: ['ケバブ', 'kebab'],
  vegan: ['ヴィーガン料理', 'vegan food'],
  bagel: ['ベーグル', 'bagels'],
  crepe: ['クレープ', 'crêpes'],
  cake: ['ケーキ', 'cake'],
  tea: ['お茶', 'tea'],
  bubble_tea: ['タピオカ', 'bubble tea'],
  breakfast: ['朝食', 'breakfast'],
}

/** [Japanese, English] for a cuisine=* value (up to two kinds), or null. */
export function cuisineLabel(value) {
  if (!value) return null
  const seen = new Set()
  const ja = []
  const en = []
  for (const raw of value.split(/[;,]/)) {
    const c = CUISINE[raw.trim().toLowerCase()]
    if (!c || seen.has(c[0])) continue
    seen.add(c[0])
    ja.push(c[0])
    en.push(c[1])
    if (ja.length === 2) break
  }
  return ja.length ? [ja.join('・'), en.join(', ')] : null
}
