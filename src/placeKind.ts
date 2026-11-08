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
 * Round 13 架構重構（2026-11-08；用戶指令「找 root cause，不是打 patch」）：
 * 根本原因——第 2–10 輪所有「錯判」都是拉麵／蕎麥麵／烏龍麵混淆。三種麵共用
 * 同一套字詞（そば／蕎麦／麺），Google Table A 有 ramen_restaurant，卻沒有
 * soba_restaurant 與 udon_restaurant，所以店名是唯一的訊號——而同一個字串
 * 兩邊都是真店（つけ蕎麦尚念是拉麵店，つけ蕎麦 安土是蕎麥麵店）。關鍵字列舉
 * 在歧義輸入上不可能收斂：每輪補一個變體，下一輪紅隊就找到下一個。
 * 其他家族（壽司／燒肉／咖哩／炸豬排／串燒／麵包／咖啡／居酒屋／天ぷら）
 * 12 輪只出過漏判，從未錯判。規則：漏判靠加訊號修；錯判只能靠刪掉猜的規則修。
 *
 * 本輪的結構性改變只有「刪」：
 * - RAMEN_SOBA 整張表刪掉。「そば」前面加什麼料（煮干／とり／鶏／鯛塩／鯛／
 *   はまぐり／濃厚／白湯／塩／醤油／鴨／えび／海老／soba house）都是「沒找到
 *   蕎麥麵店用這個寫法」的賭注——round 10 報告自己承認反例出現時店名分不出來。
 *   刪掉之後，這些名字全部回 undefined（漏判），不再猜拉麵。
 * - 裸 SOBA 正則刪掉。店名裡的「そば／蕎麦／蕎麥／soba」什麼都不決定——
 *   蕎麥麵從此只能靠品牌表（川上庵）或 Google dish 級類型（Table A 沒有 soba
 *   類型，所以實務上只有品牌表）。
 * - AMBIGUOUS_NO_JUDGE 刪掉（SOBA 正則沒了之後是死碼：名字沒有其他訊號時
 *   本來就回 undefined）。
 * - RAMEN_EXPLICIT 拿掉つけそば與鶏蕎麦：沾麵拉麵與沾蕎麥麵共用寫法，雞湯
 *   拉麵與雞蕎麥麵共用寫法——「兩輪搜尋沒找到反例」不是證明（round 10 的
 *   つけ蕎麦尚念就是教訓）。留下的拉麵標記全是「菜名本身就是拉麵」的寫法，
 *   留下的烏龍麵標記也一樣（見下方順序）。
 * - 規則寫死：任何家族的標記只要錯判過一次，就刪掉，永遠不補反向關鍵字。
 *   漏判可以靠加訊號修，錯判不行。
 *
 * 順序（現在）：
 * 0. 正規化：比對前先把長音／波浪／連字號（ー／～／〜／-／－）統一成「ー」。
 *    「らー麺／ら～麺／ら-麺」是同一種寫法，只寫一條規則（紅隊 round 5 F4：
 *    ら～麺あけどや）。「らあめん」的「あ」不是連字號，要另外列（F1）。
 *    片假名ソバ／ウドン／サヌキ在 normalizeName 統一轉平假名（round 10 B3）：
 *    中華ソバ→中華そば（煮干中華ソバ イチカワ是拉麵，靠中華そば認）。
 * 1. 品牌別名表 BRAND_KINDS：品牌身份比店名字詞更具體，先判。
 * 2. 明確的烏龍麵關鍵字 UDON_STRONG：うどん／烏龍麵／udon、讃岐／さぬき、
 *    きしめん、ほうとう——全是菜名本身就是烏龍麵的寫法。
 * 3. 明確的拉麵寫法 RAMEN_EXPLICIT：らーめん／らぁ麺／らあめん／ラーメン／
 *    拉麵／拉麺／ramen、中華そば／中華蕎麦、支那そば／支那蕎麦、担々麺／
 *    担担麺／担担面、冷麺、つけ麺、中華麺、油そば、まぜそば——全是菜名本身
 *    就是拉麵的寫法。順序注意：第 2 條的明確烏龍麵關鍵字在這張表之前：
 *    「麺処讃岐うどん」同時有拉麵標記與烏龍麵關鍵字（讃岐）時，明確關鍵字贏，
 *    照樣是烏龍麵（round 3 既有行為，不能改）。
 * 4. 其餘種類關鍵字 NAME_KINDS（不含拉麵／蕎麥麵／烏龍麵）：壽司補片假名
 *    「スシ」（スシロー）與「鮨」（鮨 さいとう，紅隊 round 5 F5）、平假名「寿し」
 *    （寿し常，紅隊 round 7 C／round 8）；炸豬排補「とんかつ／トンカツ」
 *    （とんかつ和幸）；串燒補「焼鳥／やきとり／ヤキトリ／串焼」（紅隊 round 4
 *    Finding 2）與「やき鳥／焼き鳥」（紅隊 round 5 F2）與「串鳥」（串鳥，
 *    札幌燒鳥連鎖，紅隊 round 9 B4）與「焼きとり」（紅隊 round 10 N4）；
 *    燒肉補平假名「やきにく」（やきにくガッッツ，紅隊 round 9 B4）；
 *    咖啡補「喫茶」（喫茶室ルノアール，F5）與「コーヒー」（ブルーボトルコーヒー、
 *    スターバックスコーヒー，紅隊 round 6 N4）；麵包補「ブーランジェリー／
 *    boulangerie」（ブーランジェリー ラ・テール，紅隊 round 7 C／round 8），
 *    裸「パン」放寬時有排除正則擋鬆餅店與香檳酒吧（紅隊 round 10 N6）。
 *
 * 歷史（誠實記錄，刪掉的東西不要加回來）：
 * - Round 7 刪 RAMEN_PREFIX（麺処／麺や／麺匠／麺場／麺屋／麺食堂／手打麺）：
 *   這些前綴分不出拉麵和烏龍麵——麺処ほん田是拉麵，麺処 NAKAJIMA（紀尾井町，
 *   蕎麥麵・烏龍麵店）與自家製麺処 御用（東大阪，烏龍麵店）也是麺処。只有
 *   Google 類型能分：麺処ほん田的 primaryType 是 ramen_restaurant，第 1 步
 *   類型優先就認得出；類型也是泛用的 restaurant 時就回 undefined（漏判），不猜。
 * - Round 7 刪 WEAK_UDON（單一個「麺」字）：同一個問題的另一面。單一個麺分不出
 *   拉麵（三田製麺所——約 50 店連鎖、自家製麺 伊藤、刀削麺園、唐朝刀削麺，
 *   紅隊 round 6 N3）和烏龍麵（麺喜やしま、丸亀製麺），而誤判方向正好是使用者
 *   實際會按的「不要烏龍麵」。刪掉之後，麺喜やしま與丸亀製麺都回 undefined
 *   （漏判）——丸亀製麺後來由品牌表認回，麺喜やしま仍是漏判。不要為了留住它們
 *   而把弱訊號加回來：加回來就是把 N3 的誤判加回來。
 * - Round 8 從 UDON_STRONG 拿掉「手打ち麺」：真正的烏龍麵店名一定有うどん／
 *   讃岐可認；「手打ち麺」是拉麵店也常用的說法（純手打ち麺と未来是米其林拉麵，
 *   卻因這條被判烏龍麵——紅隊 round 7 C）。
 * - Round 10 的字體消歧義（平假名つけそば＝拉麵、漢字つけ蕎麦＝蕎麥麵）是錯的：
 *   紅隊 round 10 查到真拉麵店つけ蕎麦尚念（松本，とみ田出身）。Round 11 改成
 *   歧義標記不判；round 13 連平假名つけそば也不判——「沒找到反例」不是證明。
 * - Round 10 的 (c) 海鮮前綴＋そば是拉麵（えび／海老／鯛）與 round 7–8 的
 *   RAMEN_SOBA 補齊（煮干／とり／鶏／鯛塩／はまぐり／濃厚／白湯／塩／醤油／鴨／
 *   soba house）：round 13 整張表刪掉——每一條都是「沒找到反例」的賭注。
 *
 * 已知限制（round 13 更新；用戶 2026-11-08 21:21 有條件接受「無訊號店家漏判率」
 * 為產品決定，條件之二是這份清單要寫在程式註解與報告裡——「接受」不能變成「不知道」）：
 * - 蕎麥麵店名全部漏判（round 13 刪掉 SOBA 正則之後）：藪蕎麦、よもだそば、
 *   手打蕎麦ふじや、SOBA STAND そばうさ、鴨蕎麦尖、つけ蕎麦 安土／周庵／和だす、
 *   手打ち蕎麥 さくら、蕎麥庵、麺処、そば志ん、、えびすそば。唯一例外是品牌表的
 *   川上庵。代價：使用者按「不要蕎麥麵」時，這些店照樣出現，只能靠單店排除。
 *   這是用戶條件 3（錯判永遠不接受）的直接結果——蕎麥麵沒有 dish 級類型，
 *   店名又分不出來，錯判與漏判只能選一個，選漏判。
 * - 以下拉麵店名也漏判（round 13 刪掉 RAMEN_SOBA 與つけそば／鶏蕎麦之後）：
 *   煮干そば 流。、とりそばトシゾー、鯛塩そば 灯花、鶏Soba Toraや、鶏そば 縁道、
 *   はまぐり鶏そば、濃厚鶏そば、鶏白湯そば、煮干しそば、銀座鴨そば 九代目けいすけ、
 *   塩そば専門店 桑ばら、塩そば 一榮、SOBA HOUSE 金色不如帰、えびそば一幻、
 *   えびそば緋彩、鯛そば・茶漬 磯LABO、海老そば 一幻、つけそば 弐天、つけそば神田勝本、
 *   つけそば 周、特級鶏蕎麦 龍介。例外：名字裡另有明確拉麵標記時照判（例如
 *   「つけ蕎麦 中華蕎麦 尚念」裡的中華蕎麦；「煮干中華ソバ イチカワ」裡的中華ソバ）。
 * - 其他無訊號店（round 11 已有）：麺喜やしま（烏龍麵）、鳥竹総本店（串燒）、
 *   純手打ち麺と未来（拉麵）、叙々苑（燒肉，店名單獨時；配 yakiniku_restaurant
 *   類型時類型優先救回）。單店排除擋得住。
 */
/** 明確的烏龍麵關鍵字。round 8 把「手打ち麺」拿掉：真正的烏龍麵店名一定有
 * うどん／讃岐可認；「手打ち麺」是拉麵店也常用的說法（純手打ち麺と未来是米其林
 * 拉麵，卻因這條被判烏龍麵——紅隊 round 7 C；分類結果還取決於店名有沒有那一個
 * 空格，太脆弱）。拿掉之後它回 undefined（漏判），不是烏龍麵，單店排除還擋得住。
 * round 11 補 `きしめん`（紅隊 round 10 N1：きしめん 住よし，名古屋名駅的烏龍麵店；
 * きしめん本身就是名古屋平打烏龍麵，查不到非烏龍麵店用這個詞）與 `ほうとう`
 * （紅隊 round 10 N2：ほうとう不動，山梨鄉土料理，味噌煮平打烏龍麵；ほうとう
 * 就是那道菜的名字，查不到非烏龍麵的用法）。 */
const UDON_STRONG = /烏龍麵|うどん|udon|讃岐|さぬき|きしめん|ほうとう/i
/** 品牌別名表（round 11；用戶 2026-11-08 21:21 有條件接受「無訊號店家漏判率」為產品決定，
 * 條件之一就是這張表）。連鎖品牌名本身就是種類事實：店名沒有關鍵字、Google 類型又只是
 * 泛用 restaurant 時，品牌名是唯一訊號。只收無歧義的連鎖品牌（封閉集合，8 個）：
 * 品牌名是封閉集合，跟每輪冒出新變體的拼字列舉不同——這張表不會越補越長。
 * 每筆都以真實店名＋伺服器雙向測試驗證過（見 tests/unit/placeKind.test.ts 與
 * tests/unit/daily-route.test.ts 的 round 11 測試）。順序在關鍵字之前：品牌身份比
 * 店名字詞更具體（例如「鳥貴族」三個字本身沒有任何種類訊號，但那間店就是居酒屋）。
 * 殘留的無訊號店（麺喜やしま、鳥竹総本店、純手打ち麺と未来）不在這裡：前者名字只有
 * 一個「麺」字、後兩者是單店名不是連鎖品牌——收了就是拿單店名當品牌，表會無限膨脹。 */
const BRAND_KINDS: Array<[string, string]> = [
  ['丸亀製麺', 'udon'],
  ['鳥貴族', 'izakaya'],
  ['一蘭', 'ramen'],
  ['川上庵', 'soba'],
  ['かつや', 'tonkatsu'],
  ['磯丸水産', 'izakaya'],
  ['魚民', 'izakaya'],
  ['白木屋', 'izakaya'],
]
/** 明確的拉麵寫法（round 13：只留「菜名本身就是拉麵」的寫法）。つけそば與
 * 鶏蕎麦 round 13 拿掉——沾麵拉麵與沾蕎麥麵共用寫法，雞湯拉麵與雞蕎麥麵共用
 * 寫法，「兩輪搜尋沒找到反例」不是證明（round 10 的つけ蕎麦尚念就是教訓）。
 * 刪掉的 RAMEN_SOBA 整張表與裸 SOBA 正則見上方說明——錯判靠刪規則修，不靠
 * 補關鍵字。 */
const RAMEN_EXPLICIT = /らーめん|らぁ麺|らあめん|ラーメン|拉麵|拉麺|ramen|中華そば|中華蕎麦|支那そば|支那蕎麦|油そば|まぜそば|担々麺|担担麺|担担面|冷麺|つけ麺|中華麺|らー麺/i
/** 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵，見上方兩層表）。
 * 第三欄是「排除正則」：命中種類正則、但也命中排除正則時，這一條不算（不是回別的
 * 種類，是跳過這一條、繼續往下比）。目前只有麵包用：round 11（紅隊 round 10 N6）
 * 把 `パン屋` 放寬成裸 `パン`（パンとエスプレッソと，表參道麵包店），但裸 `パン`
 * 會誤判鬆餅店（幸せのパンケーキ 渋谷店是鬆餅專門店，不是麵包店）與香檳酒吧
 * （シャンパン／champagne 裡有「パン」）——排除正則擋掉這兩類，店名就回 undefined
 * （漏判），不發明「鬆餅」這個種類鍵。 */
const NAME_KINDS: Array<[RegExp, string, RegExp?]> = [
  [/壽司|すし|スシ|寿司|寿し|鮨|sushi/i, 'sushi'],
  [/燒肉|焼肉|やきにく|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/とんかつ|トンカツ/i, 'tonkatsu'],
  [/焼き?鳥|やきとり|やき鳥|ヤキトリ|串焼|串鳥|焼きとり/i, 'yakitori'],
  [/麵包|ベーカリー|ブーランジェリー|boulangerie|パン屋|パン|bakery/i, 'bakery', /パンケーキ|パンケーク|pancake|シャンパン|champagne/i],
  [/咖啡|カフェ|珈琲|喫茶|コーヒー|cafe|coffee/i, 'cafe'],
  [/居酒屋|いざかや|izakaya/i, 'izakaya'],
  [/天ぷら|てんぷら|天婦羅|tempura/i, 'tempura'],
]

/** 比對前正規化：長音／波浪／連字號（ー／～／〜／-／－）統一成「ー」，「らー麺／ら～麺／ら-麺」只寫一條規則。
 * round 10（紅隊 round 9 B3）：片假名 `ソバ`／`ウドン`／`サヌキ` 也在這裡統一轉
 * 成平假名 `そば`／`うどん`／`さぬき`——同一種寫法不該因為字體不同就漏判
 * （`煮干中華ソバ イチカワ` 的 `中華ソバ` 轉成 `中華そば` 後，RAMEN_EXPLICIT
 * 就認得出是拉麵）。這是正規化層的結構性修法，不是再補一條關鍵字：兩條正則
 * （UDON_STRONG／RAMEN_EXPLICIT）裡所有 `そば`／`うどん`／
 * `さぬき` 的比對一次全覆蓋，不用每條正則各補一次片假名。其他片假名不動——
 * `ラーメン`／`スシ`／`トンカツ`／`ヤキトリ`／`カレー`／`コーヒー` 各正則裡本來就有。 */
const DASHES = /[ー～〜\-－]/g
const normalizeName = (name: string): string =>
  name.replace(DASHES, 'ー').replace(/ソバ/g, 'そば').replace(/ウドン/g, 'うどん').replace(/サヌキ/g, 'さぬき')

/** 店名關鍵字 → kind（不含類型判斷）。順序是設計本身，見檔案上方的說明。 */
function kindOfName(name: string): string | undefined {
  // 0. 品牌別名表（round 11）：品牌身份比店名字詞更具體，先判。
  for (const [brand, kind] of BRAND_KINDS) if (name.includes(brand)) return kind
  if (UDON_STRONG.test(name)) return 'udon'
  if (RAMEN_EXPLICIT.test(name)) return 'ramen'
  for (const [re, kind, not] of NAME_KINDS) if (re.test(name) && !(not && not.test(name))) return kind
  return undefined
}

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  // 1. dish 級類型短路（TYPE_KINDS）：primaryType 先、types 依序。
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  // 2. 店名關鍵字。泛用類型（noodle_shop）不短路——先讓店名判，遮住店名訊號
  //    的是 round 7 A 的 bug（中華そば 青葉＋noodle_shop 被判 'noodle'，排除 ramen
  //    也照選）。店名真的沒訊號時（例如藪蕎麦，round 13 起「蕎麦」不再判），
  //    才落到第 3 步的泛用 fallback 回 'noodle'。
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
