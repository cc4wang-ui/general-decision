// 種類級排除：「不要烏龍麵」這種需求。
//
// Round 14 架構（2026-11-09；用戶 2026-11-09 00:46 決定：只留類型＋品牌，
// 刪掉店名判斷）：種類只從兩個來源判——(1) Google dish 級類型（TYPE_KINDS，
// 類型優先），(2) 品牌別名表（BRAND_KINDS，7 筆）。店名路徑整個刪掉：
// NAME_KINDS（全部家族）、RAMEN_EXPLICIT、UDON_STRONG、kindOfName、
// normalizeName 全部不存在。店名裡的任何字詞都不再決定種類。
//
// 為什麼刪（tests/REPORT-ROUND13.md，判決 DO NOT MERGE）：round 13 留下的
// 「定義上只屬於一種麵」的標記，三個各有一個真實店名反例，三種不同的結構原因——
// F1 讃岐／さぬき是地名不是菜名（讃岐ラーメン はまんど是香川拉麵排名第 1 的拉麵店，
// 卻被判 udon；「讃岐ラーメン」是真實的地方拉麵品類）；F2 白木屋是通用店名不是
// 封閉品牌（白木屋 しらきや是富山高岡的蕎麥麵店，卻被判 izakaya）；F3 冷麺是
// 兩種菜（盛岡冷麺 寿々苑是韓式冷麵專門店，卻被判 ramen）。12 輪換標記都失敗，
// 第 13 輪證明「挑更無歧義的標記」這條路走不通——地名、通用店名、一詞多菜永遠存在。
// 錯判只能靠刪掉猜的規則修（用戶條件 3：錯判永遠不接受），所以這次刪的是整條店名路徑，
// 不是再換一批標記。
//
// 品牌表也受同一條規則管：白木屋在 round 14 從品牌表刪掉（F2 的真實反例）。
// 剩下的 7 筆「沒找到反例」不是證明——round 13 搜過一蘭與魚民、round 14 快速搜過
// 丸亀製麺／鳥貴族／川上庵／かつや／磯丸水産，結果全是連鎖店本身；任何一筆日後
// 出現真實反例就刪掉，永遠不補反向規則。
//
// 誠實的代價（用戶決定 (a) 的直接結果）：
// - 大多數烏龍麵／蕎麥麵店變成「unknown」（漏判）：Google Table A 沒有
//   soba_restaurant 與 udon_restaurant，店名又不再判，所以「不要烏龍麵」／
//   「不要蕎麥麵」種類按鈕很少出現。擋這些店只能靠單店「不喜歡這間店」（仍然有效）。
// - 拉麵靠 ramen_restaurant 類型照樣認得出（類型優先），品牌表的一蘭也照樣是 ramen；
//   但名字裡有拉麵寫法、類型卻是泛用 restaurant 的拉麵店也變漏判（例如つけ麺 さなだ、
//   らぁ麺 飯田商店、中華そば 青葉）。
// - 其他家族也一樣：壽司／炸豬排／串燒／麵包／咖啡／居酒屋／天ぷら全部只剩類型與品牌。
//   例如スシロー、とんかつ和幸、やきとり大吉、鮨 さいとう、喫茶室ルノアール、
//   ブルーボトルコーヒー、パンとエスプレッソと、博多天ぷら たかお，類型是泛用時全部漏判。
//   這些家族 12 輪只出過漏判、從未錯判，但店名路徑刪的是整條——不是因為它們錯了，
//   是因為「店名字詞可以決定種類」這個前提本身被 F1–F3 證偽了。
// - 白木屋連鎖店本身也變漏判（品牌表刪掉之後）：排除 izakaya 時照選，只能靠單店排除。
//
// 殘留漏判清單（round 14 更新；用戶 21:21 條件之二：清單要寫在程式註解與報告裡）：
// - round 13 的 33 個名字（蕎麥麵 12＋拉麵 21）全部仍是漏判：藪蕎麦、よもだそば、
//   手打蕎麦ふじや、SOBA STAND そばうさ、鴨蕎麦尖、つけ蕎麦 安土／周庵／和だす、
//   手打ち蕎麦 さくら、蕎麦庵、麺処、そば志ん、えびすそば；煮干そば 流。、
//   とりそばトシゾー、鯛塩そば 灯花、鶏Soba Toraや、鶏そば 縁道、はまぐり鶏そば、
//   濃厚鶏そば、鶏白湯そば、煮干しそば、銀座鴨そば 九代目けいすけ、塩そば専門店 桑ばら、
//   塩そば 一榮、SOBA HOUSE 金色不如帰、えびそば一幻、えびそば緋彩、鯛そば・茶漬 磯LABO、
//   海老そば 一幻、つけそば 弐天、つけそば神田勝本、つけそば 周、特級鶏蕎麦 龍介。
// - round 13 反例店名（round 14 起店名不判，全部漏判）：讃岐ラーメン はまんど、
//   讃岐らぁ麺 伊吹いりこセンター、支那そば讃岐ロック、讃岐らーめん はまの、
//   讃岐ラーメン 根ッ子；白木屋 しらきや（與白木屋連鎖店本身）；盛岡冷麺 寿々苑、
//   冷麺ダイニングつるしこ。
// - 其他 round 13 還能靠店名判的名字（round 14 起全部漏判）：讃岐うどん 麺喜やしま、
//   手打ちうどん さくら、きしめん 住よし、ほうとう不動、つけ麺 さなだ、らぁ麺 飯田商店、
//   らぁ麺 はやし田、らあめん花月嵐、らー麺 大芽、ら～麺あけどや、中華そば 青葉、
//   中華蕎麦 喜多方、支那そばや 本店、油そば 東京油組総本店、台湾まぜそば はなび、
//   担々麺専門店、冷麺専門店、中華麺店、煮干中華ソバ イチカワ、つけ蕎麦 中華蕎麦 尚念。
// - 其他家族（round 14 起店名不判）：スシロー、寿し常、鮨 さいとう、とんかつ和幸、
//   トンカツ専門店、やきとり大吉、焼鳥 大吉、ヤキトリ 大吉、炭火串焼 さくら、
//   やき鳥 宮川、炭火焼き鳥 池袋 和み屋、串鳥、やきにくガッッツ、
//   居酒屋 てっぺん 渋谷女道場、居酒屋 和民、喫茶室ルノアール、
//   ブルーボトルコーヒー、スターバックスコーヒー、パンとエスプレッソと、
//   パン屋 渋谷店、ブーランジェリー ラ・テール、博多天ぷら たかお、てんぷら 天喜、
//   天婦羅 たかお。類型是 dish 級時類型優先照樣認（例如スシロー配 sushi_restaurant）。
// - 更早的無訊號店（維持漏判）：麺喜やしま、鳥竹総本店、純手打ち麺と未来、
//   叙々苑（店名單獨時；配 yakiniku_restaurant 類型時類型優先救回）。
//
// 歷史（誠實記錄，刪掉的東西不要加回來）：
// - Round 7 刪 RAMEN_PREFIX 與 WEAK_UDON（單一個「麺」字）；round 8 從 UDON_STRONG
//   拿掉「手打ち麺」；round 10 的字體消歧義（平假名つけそば＝拉麵、漢字つけ蕎麦＝蕎麥麵）
//   是錯的；round 11 改成歧義標記不判；round 13 刪 RAMEN_SOBA 整張表、裸 SOBA 正則、
//   AMBIGUOUS_NO_JUDGE、RAMEN_EXPLICIT 的つけそば／鶏蕎麦；round 14 刪整條店名路徑
//   （NAME_KINDS 全部家族、RAMEN_EXPLICIT、UDON_STRONG、kindOfName、normalizeName）
//   與品牌表的白木屋。
// - 規則（寫死）：任何品牌或標記只要錯判過一次，就刪掉，永遠不補反向關鍵字。
//   漏判可以靠加訊號修（類型、品牌），錯判不行。
//
// 只回傳一種 kind（第一個命中者）；沒有命中就回 undefined，表示這一站沒有可排除的
// 種類，UI 也就不顯示「不要這類」按鈕。伺服器（api/daily-route.ts）與前端
// （src/dailyDecision.tsx）共用同一份邏輯，兩邊判出的種類必須一致，否則前端說「不要這類」
// 、伺服器還繼續派同一類的店。
//
// 歸一化：類型用同一套短鍵（ramen、yakiniku……）。第一輪 kindOfCandidate 直接回
// primaryType（'ramen_restaurant'），跟短鍵 'ramen' 是兩個鍵，同一種店會因為判出路徑
// 不同而排除不到。舊版存的 'ramen_restaurant'／'sushi_restaurant' 用 normalizeKind
// 轉新鍵，舊的不喜歡才不會失效。

export const KIND_LABELS: Record<string, string> = {
  udon: '烏龍麵',
  soba: '蕎麥麵',
  ramen: '拉麵',
  sushi: '壽司',
  yakiniku: '燒肉',
  curry: '咖哩',
  bakery: '麵包',
  cafe: '咖啡',
  tonkatsu: '炸豬排',
  yakitori: '串燒',
  izakaya: '居酒屋',
  tempura: '天ぷら',
  noodle: '麵食',
  chinese: '中餐',
  pizza: '披薩',
  hamburger: '漢堡',
  dim_sum: '點心',
  steak: '牛排',
  sandwich: '三明治',
  ice_cream: '冰淇淋',
  seafood: '海鮮',
  hot_pot: '火鍋',
  dumpling: '餃子',
  soup: '湯',
  salad: '沙拉',
  taco: '塔可',
  tapas: '下酒菜',
  falafel: '法拉費',
  gyro: '希臘烤肉捲',
  shawarma: '沙威瑪',
  kebab: '烤肉串',
  fondue: '起司鍋',
  fish_and_chips: '炸魚薯條',
  burrito: '捲餅',
  barbecue: '美式燒烤',
  chicken: '雞肉',
  chicken_wings: '雞翅',
  hot_dog: '熱狗',
  korean_barbecue: '韓式燒烤',
  mongolian_barbecue: '蒙古烤肉',
  oyster: '生蠔',
  acai: '巴西莓',
  bagel: '貝果',
  cake: '蛋糕',
  candy: '糖果',
  chocolate: '巧克力',
  confectionery: '甜食',
  deli: '熟食',
  dessert: '甜點',
  donut: '甜甜圈',
  pastry: '糕點',
  juice: '果汁',
  tea: '茶',
  breakfast: '早餐',
  brunch: '早午餐',
  vegan: '純素',
  vegetarian: '素食',
  // 舊版存的種類鍵（第一輪直接把 primaryType 當種類鍵）；只用來顯示，新的不喜歡一律存短鍵。
  ramen_restaurant: '拉麵',
  sushi_restaurant: '壽司',
}

/**
 * Google Table A 裡「本身就是一種料理／飲品」的類型 → 歸一化種類鍵。
 * 類型優先於品牌與店名（round 7 結構性修復；round 14 店名路徑刪掉之後，類型是
 * 第一訊號，品牌是第二訊號）。只收「 dish 級」的類型：ramen_restaurant、
 * sushi_restaurant、pizza_restaurant 這種本身就是一道料理／一類食物的才進表；
 * japanese_restaurant、korean_restaurant、italian_restaurant 這種泛料理類型不收——
 * 它們沒有 dish 級訊號，收了只會發明使用者沒要的排除種類（例如「不要日式這類」
 * 會擋掉大部份定食店），那類店名又沒有明確標記時就回 undefined（漏判），只給單店排除。
 * 例外：chinese_restaurant 照收（round 7，刀削麺園靠它認成中餐）——中餐館在
 * 使用者語境裡多半是麵食／餃子店，與日式／韓式／義式那種「什麼都賣」的泛類型
 * 不同；收了之後「不要中餐這類」是使用者真的會按的排除。
 * Round 8 對照 Google 官方 Table A「Food and Drink」全表（2026-11-08 實查
 * developers.google.com  place-types 頁）補齊：dish 級的全收，泛料理類型
 * （american／asian／european／french／german／greek／indian／indonesian／italian／
 * japanese／korean／lebanese／malaysian／mediterranean／mexican／middle_eastern／
 * spanish／thai／turkish／vietnamese 等）與服務形式（fast_food_restaurant、
 * buffet／family／fine_dining／food_court、meal_delivery／meal_takeaway、
 * 酒吧類 bar／pub／wine_bar 等）刻意不收，見 tests/unit/placeKind.test.ts 的守衛測試。
 * Round 9（F2）再對照同一官方頁面（2026-11-08 實查）補四個：coffee_roastery／
 * cat_cafe／dog_cafe → cafe（咖啡變體）、japanese_izakaya_restaurant → izakaya
 * （居酒屋，在日本很常見的新種類鍵，標籤「居酒屋」）。服務形式 cafeteria／diner／
 * bistro 刻意不收（與 fast_food／buffet／food_court 同一政策：形式不是菜）。
 * pizza_delivery 也刻意不收（外送服務形式，與 meal_delivery／meal_takeaway 同類），
 * 但誠實更正：它確實在官方 Table A 裡（2026-11-08 實查頁面上有 `pizza_delivery`），
 * round 8 測試報告「pizza_delivery 也不在表裡」的說法是錯的——不在種類表是設計
 * 決定，不是表裡沒有。
 */
const TYPE_KINDS: Record<string, string> = {
  ramen_restaurant: 'ramen',
  sushi_restaurant: 'sushi',
  yakiniku_restaurant: 'yakiniku',
  japanese_curry_restaurant: 'curry',
  tonkatsu_restaurant: 'tonkatsu',
  yakitori_restaurant: 'yakitori',
  chinese_noodle_restaurant: 'ramen',
  chinese_restaurant: 'chinese',
  cafe: 'cafe',
  coffee_shop: 'cafe',
  coffee_stand: 'cafe',
  coffee_roastery: 'cafe',
  cat_cafe: 'cafe',
  dog_cafe: 'cafe',
  japanese_izakaya_restaurant: 'izakaya',
  bakery: 'bakery',
  pizza_restaurant: 'pizza',
  hamburger_restaurant: 'hamburger',
  dim_sum_restaurant: 'dim_sum',
  steak_house: 'steak',
  sandwich_shop: 'sandwich',
  ice_cream_shop: 'ice_cream',
  seafood_restaurant: 'seafood',
  hot_pot_restaurant: 'hot_pot',
  dumpling_restaurant: 'dumpling',
  soup_restaurant: 'soup',
  salad_shop: 'salad',
  taco_restaurant: 'taco',
  tapas_restaurant: 'tapas',
  falafel_restaurant: 'falafel',
  gyro_restaurant: 'gyro',
  shawarma_restaurant: 'shawarma',
  kebab_shop: 'kebab',
  fondue_restaurant: 'fondue',
  fish_and_chips_restaurant: 'fish_and_chips',
  burrito_restaurant: 'burrito',
  barbecue_restaurant: 'barbecue',
  chicken_restaurant: 'chicken',
  chicken_wings_restaurant: 'chicken_wings',
  hot_dog_restaurant: 'hot_dog',
  hot_dog_stand: 'hot_dog',
  korean_barbecue_restaurant: 'korean_barbecue',
  mongolian_barbecue_restaurant: 'mongolian_barbecue',
  oyster_bar_restaurant: 'oyster',
  acai_shop: 'acai',
  bagel_shop: 'bagel',
  cake_shop: 'cake',
  candy_store: 'candy',
  chocolate_shop: 'chocolate',
  chocolate_factory: 'chocolate',
  confectionery: 'confectionery',
  deli: 'deli',
  dessert_restaurant: 'dessert',
  dessert_shop: 'dessert',
  donut_shop: 'donut',
  pastry_shop: 'pastry',
  juice_shop: 'juice',
  tea_house: 'tea',
  breakfast_restaurant: 'breakfast',
  brunch_restaurant: 'brunch',
  vegan_restaurant: 'vegan',
  vegetarian_restaurant: 'vegetarian',
}

/**
 * 泛用類型（round 8；round 14 順序不變）：noodle_shop 是拉麵／蕎麥麵／烏龍麵共用的
 * 泛類型，分不出 dish。品牌表先判（丸亀製麺配 noodle_shop 時品牌贏，回 udon）；
 * 品牌也沒訊號時才回泛用鍵 'noodle'（例如只叫「麵店」的 noodle_shop；藪蕎麦＋
 * noodle_shop → 'noodle'，round 13 起就是這個行為）。F4 註解更正：這段之前寫
 * 「修正後：藪蕎麦＋noodle_shop → soba、麺処讃岐うどん＋noodle_shop → udon、
 * 中華そば 青葉＋noodle_shop → ramen」是 round 13 之前的舊行為——round 13 刪掉
 * 店名判蕎麥麵／拉麵標記之後，藪蕎麦與中華そば 青葉配 noodle_shop 都回 'noodle'；
 * round 14 刪掉整條店名路徑之後，麺処讃岐うどん配 noodle_shop 也回 'noodle'。
 * chinese_noodle_restaurant 不在這裡：中式麵館的菜是拉麵系（担担麺、雲吞麵），
 * 不會是蕎麥麵／烏龍麵，dish 級短路是安全的（見上方 TYPE_KINDS）。
 */
const GENERIC_TYPES: Record<string, string> = {
  noodle_shop: 'noodle',
}

/** 舊種類鍵／原始 Places 類型 → 歸一化種類鍵；對不上的原樣回傳。 */
export function normalizeKind(kind: string): string {
  return TYPE_KINDS[kind] ?? kind
}

/** 品牌別名表（round 11；round 14 剩 7 筆）。連鎖品牌名本身就是種類事實：Google
 * 類型只是泛用 restaurant 時，品牌名是唯一訊號。順序在泛用類型之前、dish 級類型
 * 之後：類型優先照舊（丸亀製麺配 ramen_restaurant 時類型贏）。
 * Round 14 刪掉白木屋：tests round 13 F2 證明它不是封閉品牌——白木屋 しらきや
 * （富山県高岡市，蕎麥麵店）被判成 izakaya。品牌名不是封閉集合的前提是錯的；
 * 任何一筆出現真實反例就刪掉，永遠不補反向規則。剩下的 7 筆「沒找到反例」不是證明：
 * round 13 搜過一蘭與魚民、round 14 快速搜過丸亀製麺／鳥貴族／川上庵／かつや／
 * 磯丸水産，結果全是連鎖店本身。殘留的無訊號店（麺喜やしま、鳥竹総本店、
 * 純手打ち麺と未来）不在這裡：收單店名當品牌，表會無限膨脹。 */
const BRAND_KINDS: Array<[string, string]> = [
  ['丸亀製麺', 'udon'],
  ['鳥貴族', 'izakaya'],
  ['一蘭', 'ramen'],
  ['川上庵', 'soba'],
  ['かつや', 'tonkatsu'],
  ['磯丸水産', 'izakaya'],
  ['魚民', 'izakaya'],
]

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  // 1. dish 級類型短路（TYPE_KINDS）：primaryType 先、types 依序。
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  // 2. 品牌別名表：店名含品牌名就回品牌種類（round 14：店名路徑只剩這一條）。
  //    白木屋已不在表裡（F2）；品牌名比泛用類型更具體，先判。
  const name = c.name ?? ''
  for (const [brand, kind] of BRAND_KINDS) if (name.includes(brand)) return kind
  // 3. 泛用類型 fallback：類型與品牌都沒訊號才回泛用鍵（例如只叫「麵店」的 noodle_shop）。
  if (c.primaryType && GENERIC_TYPES[c.primaryType]) return GENERIC_TYPES[c.primaryType]
  for (const t of c.types ?? []) if (GENERIC_TYPES[t]) return GENERIC_TYPES[t]
  // 沒有明確訊號就回 undefined（漏判），不猜：店名路徑已在 round 14 整條刪除。
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
