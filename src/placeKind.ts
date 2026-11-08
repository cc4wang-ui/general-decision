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
 * 1. 明確的烏龍麵關鍵字（讃岐／さぬき／うどん……）：烏龍麵／蕎麥麵沒有對應的
 *    Places 類型，只能靠名字認。手打ち麺是烏龍麵店常用的限定詞。
 * 2. 拉麵標記集中表（round 5 結構性修復）：所有拉麵店名標記收在一處，在蕎麥麵
 *    正則與弱「麺」訊號之前先判——任何拉麵標記都勝過弱烏龍麵與蕎麥麵。
 *    這是第三次同一類缺陷（round 2 Finding 1 → round 3 Finding B → round 4
 *    Finding 1）：之前每輪補一個店名模式，下一輪又冒出新的（らぁ麺、支那そば、
 *    油そば、まぜそば、麺匠、麺場……）。現在全部收在這裡，之後新的拉麵寫法只
 *    加進這張表，不再散到各處。
 *    順序注意：第 1 條的明確烏龍麵關鍵字在這張表之前：「麺処讃岐うどん」同時有
 *    拉麵標記（麺処）與烏龍麵關鍵字（讃岐）時，明確關鍵字贏，照樣是烏龍麵
 *    （round 3 既有行為，不能改）。
 *    取捨：麺処／麺や／麺匠／麺場這類「○○麺」前綴本身是模糊的（烏龍麵／蕎麥麵／
 *    拉麵店都會用），沒有其他關鍵字時這裡預設判拉麵——拉麵店用得最多（麺処ほん田、
 *    麺や七彩、麺匠 竹虎、麺場 田所商店皆是拉麵）；純「麺処＋無其他關鍵字」的
 *    烏龍麵店會被誤判成拉麵。真正的解法仍是 Google 類型優先，店名只是備援。
 * 3. 蕎麥麵：簡體「蕎麦」與繁體「蕎麥」單獨都能命中（紅隊 round 4 Finding 3：
 *    繁體「蕎麥」原本必須後面接「麵」才命中，手打ち蕎麥 さくら、蕎麥庵漏判）。
 *    壽司補片假名「スシ」（スシロー）；炸豬排補「とんかつ／トンカツ」（とんかつ和幸）；
 *    串燒補「焼鳥／やきとり／ヤキトリ／串焼」（紅隊 round 4 Finding 2：やきとり大吉）。
 * 4. 最弱訊號（只有一個「麺」字，如麺喜やしま）：放最後，前面都沒命中才看。
 *    弱訊號不刪：麺喜やしま 沒有任何拉麵標記，刪了它就回 undefined。拉麵標記
 *    在第 2 步已先判，這裡不需要守衛（round 2–4 的 RAMEN_GUARD 已併進集中表）。
 *
 * 已知限制：名字完全沒有關鍵字的店（鳥貴族／川上庵／一蘭），店名啟發式無解，
 * 回 undefined——以 Google 的 primaryType／types 為準；認不出種類時 UI 只給
 * 單店排除，不假裝種類排除有生效。
 */
/** 明確的烏龍麵關鍵字。 */
const UDON_STRONG = /烏龍麵|うどん|udon|讃岐|さぬき|手打ち麺/i
/** 拉麵標記集中表：見上方說明。 */
const RAMEN_MARKERS = /らーめん|らぁ麺|ラーメン|拉麵|拉麺|ramen|中華そば|中華蕎麦|支那そば|支那蕎麦|油そば|まぜそば|担々麺|麺処|麺や|麺匠|麺場|中華麺|冷麺|つけ麺|麺屋/i
/** 蕎麥麵。 */
const SOBA = /蕎麥麵|蕎麥|蕎麦|そば|soba/i
/** 其餘種類關鍵字（不含拉麵／蕎麥麵／烏龍麵，見上方集中表）。 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/壽司|すし|スシ|寿司|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/とんかつ|トンカツ/i, 'tonkatsu'],
  [/焼鳥|やきとり|ヤキトリ|串焼/i, 'yakitori'],
  [/麵包|ベーカリー|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|cafe|coffee/i, 'cafe'],
]

/** 最弱訊號：只有一個「麺」字、前面沒有明確關鍵字時才用（麺喜やしま）。 */
const WEAK_UDON = /(?<!つけ)麺(?!屋)/

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  const name = c.name ?? ''
  if (UDON_STRONG.test(name)) return 'udon'
  if (RAMEN_MARKERS.test(name)) return 'ramen'
  if (SOBA.test(name)) return 'soba'
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  // 最弱訊號放最後：前面都沒命中才看（麺喜やしま）。
  if (WEAK_UDON.test(name)) return 'udon'
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
