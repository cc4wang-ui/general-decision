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
  // 舊版存的種類鍵（第一輪直接把 primaryType 當種類鍵）；只用來顯示，新的不喜歡一律存短鍵。
  ramen_restaurant: '拉麵',
  sushi_restaurant: '壽司',
}

/** Google Table A 裡「本身就是一種料理」的類型 → 歸一化種類鍵。 */
const TYPE_KINDS: Record<string, string> = {
  ramen_restaurant: 'ramen',
  sushi_restaurant: 'sushi',
  yakiniku_restaurant: 'yakiniku',
  japanese_curry_restaurant: 'curry',
  tonkatsu_restaurant: 'tonkatsu',
  yakitori_restaurant: 'yakitori',
  noodle_shop: 'noodle',
  chinese_noodle_restaurant: 'ramen',
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
 * 2. 拉麵標記第 1 層 RAMEN_EXPLICIT（round 6 結構性修復）：明確的拉麵寫法，
 *    在蕎麥麵正則之前先判——「つけそば」「鶏蕎麦」這種名字裡有「そば／蕎麦」
 *    的拉麵店，必須在蕎麥麵之前先被認成拉麵（紅隊 round 5 F3）。
 *    Round 5 的單一集中表有一個反向缺陷（F6）：「麺処」這種前綴在蕎麥麵之前
 *    先判，會把真實蕎麥店（麺処、そば志ん、）誤判成拉麵。所以前綴移到第 4 步。
 *    順序注意：第 1 條的明確烏龍麵關鍵字在這張表之前：「麺処讃岐うどん」同時有
 *    拉麵標記（麺処）與烏龍麵關鍵字（讃岐）時，明確關鍵字贏，照樣是烏龍麵
 *    （round 3 既有行為，不能改）。
 * 3. 蕎麥麵：簡體「蕎麦」與繁體「蕎麥」單獨都能命中（紅隊 round 4 Finding 3）。
 *    壽司補片假名「スシ」（スシロー）與「鮨」（鮨 さいとう，紅隊 round 5 F5）；
 *    炸豬排補「とんかつ／トンカツ」（とんかつ和幸）；
 *    串燒補「焼鳥／やきとり／ヤキトリ／串焼」（紅隊 round 4 Finding 2）與
 *    「やき鳥／焼き鳥」（紅隊 round 5 F2：やき鳥 宮川、炭火焼き鳥 池袋 和み屋）；
 *    咖啡補「喫茶」（喫茶室ルノアール，F5）。
 * 4. 拉麵標記第 2 層 RAMEN_PREFIX：在蕎麥麵之後、其餘種類與弱訊號之前判。
 *    「麺処／麺や／麺匠／麺場／麺屋／手打麺」這類前綴本身是模糊的（烏龍麵／
 *    蕎麥麵／拉麵店都會用），名字裡沒有「そば／蕎麦」時預設判拉麵——拉麵店用得
 *    最多（麺処ほん田、麺や七彩、麺匠 竹虎、麺場 田所商店、手打麺 永吉皆是拉麵）；
 *    名字裡有「そば／蕎麦」時第 3 步已先判蕎麥麵，前綴不會誤傷（F6 修復）。
 *    「麺食堂」（麺食堂88，沾麵店）是本輪補進第 2 層的標記：紅隊 round 5 報告
 *    的修復清單只列了「らー麺／ら～麺模式」，第 2 層清單原樣寫不出 麺食堂88；
 *    它是拉麵／沾麵店常用的「麺食堂」命名，蕎麥店同名時仍由第 3 步先判蕎麥麵。
 * 5. 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵）。
 * 6. 最弱訊號（只有一個「麺」字，如麺喜やしま）：放最後，前面都沒命中才看。
 *    弱訊號不刪：麺喜やしま 沒有任何拉麵標記，刪了它就回 undefined。
 *
 * 殘留風險（誠實記錄）：兩層表仍是不完全列舉。任何不在表內的「麺」字拉麵店
 * （例如店名只有「麺」＋無訊號字），弱訊號仍會誤判成烏龍麵——第 4 輪修了 7 間，
 * 第 5 輪又冒出 3 間同方向的新誤判（F4）。真正的防線是 Google 類型優先
 * （primaryType／types 明確時不受店名影響）；店名只是備援。加新寫法時只改
 * RAMEN_EXPLICIT／RAMEN_PREFIX 兩張表，不再散到各處。
 *
 * 已知限制：名字完全沒有關鍵字的店（鳥貴族／川上庵／一蘭），店名啟發式無解，
 * 回 undefined——以 Google 的 primaryType／types 為準；認不出種類時 UI 只給
 * 單店排除，不假裝種類排除有生效。
 */
/** 明確的烏龍麵關鍵字。 */
const UDON_STRONG = /烏龍麵|うどん|udon|讃岐|さぬき|手打ち麺/i
/** 拉麵標記第 1 層：明確的拉麵寫法，在蕎麥麵之前先判。見上方說明。 */
const RAMEN_EXPLICIT = /らーめん|らぁ麺|らあめん|ラーメン|拉麵|拉麺|ramen|中華そば|中華蕎麦|支那そば|支那蕎麦|油そば|まぜそば|つけそば|つけ蕎麦|鶏蕎麦|担々麺|冷麺|つけ麺|中華麺|らー麺/i
/** 蕎麥麵。 */
const SOBA = /蕎麥麵|蕎麥|蕎麦|そば|soba/i
/** 拉麵標記第 2 層：模糊前綴，在蕎麥麵之後、其餘種類與弱訊號之前判。見上方說明。 */
const RAMEN_PREFIX = /麺処|麺や|麺匠|麺場|麺屋|麺食堂|手打麺/i
/** 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵，見上方兩層表）。 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/壽司|すし|スシ|寿司|鮨|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/とんかつ|トンカツ/i, 'tonkatsu'],
  [/焼き?鳥|やきとり|やき鳥|ヤキトリ|串焼/i, 'yakitori'],
  [/麵包|ベーカリー|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|喫茶|cafe|coffee/i, 'cafe'],
]

/** 最弱訊號：只有一個「麺」字、前面沒有明確關鍵字時才用（麺喜やしま）。 */
const WEAK_UDON = /(?<!つけ)麺(?!屋)/

/** 比對前正規化：長音／波浪／連字號（ー／～／〜／-／－）統一成「ー」，「らー麺／ら～麺／ら-麺」只寫一條規則。 */
const DASHES = /[ー～〜\-－]/g
const normalizeName = (name: string): string => name.replace(DASHES, 'ー')

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  const name = normalizeName(c.name ?? '')
  if (UDON_STRONG.test(name)) return 'udon'
  if (RAMEN_EXPLICIT.test(name)) return 'ramen'
  if (SOBA.test(name)) return 'soba'
  if (RAMEN_PREFIX.test(name)) return 'ramen'
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  // 最弱訊號放最後：前面都沒命中才看（麺喜やしま）。
  if (WEAK_UDON.test(name)) return 'udon'
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
