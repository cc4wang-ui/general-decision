// 種類級排除：「不要烏龍麵」這種需求。
//
// Google Places 沒有「烏龍麵」這種細類型（Table A 只有 ramen_restaurant、
// sushi_restaurant 這類），所以種類判斷靠兩層：具體的 primaryType／types，
// 再退到店名關鍵字。伺服器（api/daily-route.ts）與前端（src/dailyDecision.tsx）
// 共用同一份邏輯，兩邊判出的種類必須一致，否則前端說「不要這類」、伺服器
// 還繼續派同一類的店。
//
// 只回傳一種 kind（第一個命中者）；沒有命中就回 undefined，表示這一站
// 沒有可排除的種類，UI 也就不顯示「不要這類」按鈕。
//
// 歸一化：類型與店名用同一套短鍵（ramen、yakiniku……）。第一輪 kindOfCandidate
// 直接回 primaryType（'ramen_restaurant'），跟店名判出的 'ramen' 是兩個鍵，
// 同一種店會因為判出路徑不同而排除不到。舊版存的 'ramen_restaurant'／
// 'sushi_restaurant' 用 normalizeKind 轉新鍵，舊的不喜歡才不會失效。

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
 * 類型優先於店名（round 7 結構性修復）：店名啟發式只能認明確的寫法，
 * 模糊的字（麺処、單一個麺）分不出拉麵／烏龍麵／蕎麥麵，只有 Google 的
 * primaryType／types 能分——所以類型表要盡量全，店名只作備援。
 * 只收「 dish 級」的類型：ramen_restaurant、sushi_restaurant、pizza_restaurant
 * 這種本身就是一道料理／一類食物的才進表；japanese_restaurant、korean_restaurant、
 * italian_restaurant 這種泛料理類型不收——它們沒有 dish 級訊號，收了只會發明
 * 使用者沒要的排除種類（例如「不要日式這類」會擋掉大部份定食店），那類店名又
 * 沒有明確標記時就回 undefined（漏判），只給單店排除。
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
 * 泛用類型（round 8）：不短路——它們分不出 dish，店名先判，沒訊號才回泛用鍵。
 * noodle_shop 是拉麵／蕎麥麵／烏龍麵共用的泛類型（紅隊 round 7 A）：真實烏龍麵／
 * 蕎麥麵店在 Places 回的就是 noodle_shop，類型優先直接回 'noodle' 會把店名訊號
 * 遮掉，種類排除擋不住（藪蕎麦＋noodle_shop → noodle，排除 soba 也照選；
 * 前端還會給出「不要『麵食』這類」這種兩面不是人的按鈕）。修正後：
 * 藪蕎麦＋noodle_shop → soba、麺処讃岐うどん＋noodle_shop → udon、
 * 中華そば 青葉＋noodle_shop → ramen；店名真的沒訊號（例如只叫「麵店」）才回 'noodle'。
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

/**
 * 店名關鍵字 → kind，依序比對，第一個命中者勝。順序是設計本身，改順序前先看
 * 下面的說明與 tests/unit/placeKind.test.ts 的守衛測試。
 *
 * 0. 正規化：比對前先把長音／波浪／連字號（ー／～／〜／-／－）統一成「ー」。
 *    「らー麺／ら～麺／ら-麺」是同一種寫法，只寫一條規則（紅隊 round 5 F4：
 *    ら～麺あけどや）。「らあめん」的「あ」不是連字號，要另外列（F1）。
 * 1. 明確的烏龍麵關鍵字（讃岐／さぬき／うどん……）：烏龍麵／蕎麥麵沒有對應的
 *    Places 類型，只能靠名字認。手打ち麺是烏龍麵店常用的限定詞。
 * 2. 明確的拉麵寫法 RAMEN_EXPLICIT，在蕎麥麵正則之前先判——「つけそば」
 *    「鶏蕎麦」這種名字裡有「そば／蕎麦」的拉麵店，必須在蕎麥麵之前先被認成
 *    拉麵（紅隊 round 5 F3）。round 7 補平假名／拉丁「そば」拉麵標記
 *    RAMEN_SOBA（紅隊 round 6 N2）：煮干そば、とりそば、鯛塩そば、鶏そば、
 *    はまぐり鶏そば、濃厚鶏そば、鶏白湯そば、鶏Soba——第 6 輪只補了漢字
 *    鶏蕎麦，平假名與拉丁變體全數漏掉。另補「担担麺」（無 々，四川担担麺 阿吽，
 *    紅隊 round 6 N3）與「担担面」（六坊担担面，「面」不是「麺」，N5）。
 *    順序注意：第 1 條的明確烏龍麵關鍵字在這張表之前：「麺処讃岐うどん」同時有
 *    拉麵標記（麺処）與烏龍麵關鍵字（讃岐）時，明確關鍵字贏，照樣是烏龍麵
 *    （round 3 既有行為，不能改）。
 * 3. 蕎麥麵：簡體「蕎麦」與繁體「蕎麥」單獨都能命中（紅隊 round 4 Finding 3）。
 *    壽司補片假名「スシ」（スシロー）與「鮨」（鮨 さいとう，紅隊 round 5 F5）、
 *    平假名「寿し」（寿し常，紅隊 round 7 C／round 8）；
 *    炸豬排補「とんかつ／トンカツ」（とんかつ和幸）；
 *    串燒補「焼鳥／やきとり／ヤキトリ／串焼」（紅隊 round 4 Finding 2）與
 *    「やき鳥／焼き鳥」（紅隊 round 5 F2：やき鳥 宮川、炭火焼き鳥 池袋 和み屋）；
 *    咖啡補「喫茶」（喫茶室ルノアール，F5）與「コーヒー」（ブルーボトルコーヒー、
 *    スターバックスコーヒー，紅隊 round 6 N4）；
 *    麵包補「ブーランジェリー／boulangerie」（ブーランジェリー ラ・テール，
 *    紅隊 round 7 C／round 8）。
 * 4. 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵）。
 *
 * Round 7 刪掉的東西（誠實記錄，不要加回來）：
 * - RAMEN_PREFIX（麺処／麺や／麺匠／麺場／麺屋／麺食堂／手打麺）：這些前綴
 *   分不出拉麵和烏龍麵——麺処ほん田是拉麵，麺処 NAKAJIMA（紀尾井町，蕎麥麵・
 *   烏龍麵店）與自家製麺処 御用（東大阪，烏龍麵店）也是麺処，名字完全一樣
 *   的結構卻是兩種店（紅隊 round 6 N1）。只有 Google 類型能分：麺処ほん田
 *   的 primaryType 是 ramen_restaurant，第 1 步類型優先就認得出；類型也是
 *   泛用的 restaurant 時就回 undefined（漏判），不猜。
 * - WEAK_UDON（單一個「麺」字）：同一個問題的另一面。單一個麺分不出拉麵
 *   （三田製麺所——約 50 店連鎖、自家製麺 伊藤、刀削麺園、唐朝刀削麺，
 *   紅隊 round 6 N3）和烏龍麵（麺喜やしま、丸亀製麺），而誤判方向正好是
 *   使用者實際會按的「不要烏龍麵」：按了之後拉麵店被擋掉。刪掉之後，
 *   麺喜やしま與丸亀製麺都回 undefined（漏判）——這是結構性修復的代價，
 *   不是 bug：它們的 primaryType 只是泛用的 restaurant，Google 也沒給更細
 *   的類型，店名又沒有讃岐／うどん可認。擋它們只能靠單店「不喜歡這間店」。
 *   不要為了留住這兩間而把弱訊號加回來：加回來就是把 N3 的誤判加回來。
 *
 * 殘留風險（誠實記錄）：類型＋明確標記仍是不完全列舉。名字完全沒有關鍵字
 * 的店（鳥貴族／川上庵／一蘭）回 undefined，以 Google 的 primaryType／types
 * 為準；認不出種類時 UI 只給單店排除，不假裝種類排除有生效。
 *
 * 已知限制：名字完全沒有關鍵字的店（鳥貴族／川上庵／一蘭），店名啟發式無解，
 * 回 undefined——以 Google 的 primaryType／types 為準；認不出種類時 UI 只給
 * 單店排除，不假裝種類排除有生效。
 */
/** 明確的烏龍麵關鍵字。round 8 把「手打ち麺」拿掉：真正的烏龍麵店名一定有
 * うどん／讃岐可認；「手打ち麺」是拉麵店也常用的說法（純手打ち麺と未来是米其林
 * 拉麵，卻因這條被判烏龍麵——紅隊 round 7 C；分類結果還取決於店名有沒有那一個
 * 空格，太脆弱）。拿掉之後它回 undefined（漏判），不是烏龍麵，單店排除還擋得住。 */
const UDON_STRONG = /烏龍麵|うどん|udon|讃岐|さぬき/i
/** 明確的拉麵寫法，在蕎麥麵之前先判。見上方說明。 */
const RAMEN_EXPLICIT = /らーめん|らぁ麺|らあめん|ラーメン|拉麵|拉麺|ramen|中華そば|中華蕎麦|支那そば|支那蕎麦|油そば|まぜそば|つけそば|つけ蕎麦|鶏蕎麦|担々麺|担担麺|担担面|冷麺|つけ麺|中華麺|らー麺/i
/** 平假名／拉丁「そば」拉麵標記（round 7，紅隊 round 6 N2；round 8 補 5 間，
 * 紅隊 round 7 B）：「そば」是拉麵菜名的一部分時，必須在蕎麥麵正則之前先攔。
 * 煮干／とり／鶏／鯛塩／はまぐり／濃厚／白湯／塩／醤油／鴨都是拉麵湯頭或配料的
 * 說法，不是蕎麥麵的。round 8 補：煮干[し]?（煮干しそば，麺尊 RAGE 的菜名）、
 * 塩そば（塩そば専門店 桑ばら、塩そば 一榮）、醤油そば、平假名鴨そば
 * （銀座鴨そば 九代目けいすけ）、soba house（SOBA HOUSE 金色不如帰，米其林一星拉麵）。
 * 控制組：鴨蕎麦尖（真蕎麥割烹）寫的是漢字「蕎麦」，平假名「鴨そば」補丁碰不到它，
 * 照樣是 soba。殘留風險：名字啟發式仍是不完全列舉，每輪都可能再出新變體。 */
const RAMEN_SOBA = /(?:煮干[し]?|とり|鶏|鯛塩|はまぐり|濃厚|白湯|塩|醤油|鴨)そば|鶏soba|soba house/i
/** 蕎麥麵。 */
const SOBA = /蕎麥麵|蕎麥|蕎麦|そば|soba/i
/** 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵，見上方兩層表）。 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/壽司|すし|スシ|寿司|寿し|鮨|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/とんかつ|トンカツ/i, 'tonkatsu'],
  [/焼き?鳥|やきとり|やき鳥|ヤキトリ|串焼/i, 'yakitori'],
  [/麵包|ベーカリー|ブーランジェリー|boulangerie|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|喫茶|コーヒー|cafe|coffee/i, 'cafe'],
]

/** 比對前正規化：長音／波浪／連字號（ー／～／〜／-／－）統一成「ー」，「らー麺／ら～麺／ら-麺」只寫一條規則。 */
const DASHES = /[ー～〜\-－]/g
const normalizeName = (name: string): string => name.replace(DASHES, 'ー')

/** 店名關鍵字 → kind（不含類型判斷）。順序是設計本身，見檔案上方的說明。 */
function kindOfName(name: string): string | undefined {
  if (UDON_STRONG.test(name)) return 'udon'
  if (RAMEN_EXPLICIT.test(name) || RAMEN_SOBA.test(name)) return 'ramen'
  if (SOBA.test(name)) return 'soba'
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  return undefined
}

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  // 1. dish 級類型短路（TYPE_KINDS）：primaryType 先、types 依序。
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  // 2. 店名關鍵字。泛用類型（noodle_shop）不短路——先讓店名判，遮住店名訊號
  //    的是 round 7 A 的 bug（藪蕎麦＋noodle_shop 被判 'noodle'，排除 soba 也照選）。
  const nameKind = kindOfName(normalizeName(c.name ?? ''))
  if (nameKind) return nameKind
  // 3. 泛用類型 fallback：店名真的沒訊號才回泛用鍵（例如只叫「麵店」的 noodle_shop）。
  if (c.primaryType && GENERIC_TYPES[c.primaryType]) return GENERIC_TYPES[c.primaryType]
  for (const t of c.types ?? []) if (GENERIC_TYPES[t]) return GENERIC_TYPES[t]
  // 沒有明確訊號就回 undefined（漏判），不猜：模糊前綴與單一個「麺」字分不出
  // 拉麵／烏龍麵，猜了就是第 2–6 輪反覆出現的誤判（見上方說明）。
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
