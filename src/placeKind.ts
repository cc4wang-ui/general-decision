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
 * 店名關鍵字 → kind，依序比對，第一個命中者勝。
 * 烏龍麵／蕎麥麵沒有對應的 Places 類型，只能靠名字認：讃岐／さぬき／手打ち麺是
 * 烏龍麵店常用的限定詞；蕎麥麵補簡體「蕎麦」（藪蕎麦這類店名才認得到）。
 * 壽司補片假名「スシ」（スシロー）；炸豬排補「とんかつ／トンカツ」（とんかつ和幸）。
 * 最後一條是最弱訊號（只有一個「麺」字，如麺喜やしま），不放在這張表裡，
 * 而是在 kindOfCandidate 末尾加拉麵守衛後才看：店名含麺処／麺や／担々麺／
 * 中華麺／冷麺時不判為烏龍麵（紅隊 round 2：麺処ほん田／麺や七彩／担々麺／
 * 中華麺都是拉麵／中華麵；守衛只擋弱訊號，前面已有明確關鍵字命中時不受影響，
 * 例如「麺処讃岐うどん」照樣是烏龍麵）。麺屋（拉麵店常用，如麺屋武蔵）與
 * つけ麺本來就不在弱訊號裡。
 *
 * 已知限制：名字完全沒有關鍵字的店（鳥貴族／川上庵／一蘭），店名啟發式無解，
 * 回 undefined——以 Google 的 primaryType／types 為準；認不出種類時 UI 只給
 * 單店排除，不假裝種類排除有生效。
 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/烏龍麵|うどん|udon|讃岐|さぬき|手打ち麺/i, 'udon'],
  // 中華そば是拉麵的傳統名稱（小麥麵＋醬油湯），不是蕎麥麵：名字裡的「そば」
  // 會命中下一條蕎麥麵正則，所以這條必須放在蕎麥麵之前先判（紅隊 round 3
  // Finding B：中華そば 青葉被誤判成 soba，按「不要蕎麥麵」會把拉麵店擋到 422）。
  // 異體字「中華蕎麦」同理。類型優先於店名，primaryType 明確時不受影響。
  [/中華そば|中華蕎麦/i, 'ramen'],
  [/蕎麥麵|蕎麦|そば|soba/i, 'soba'],
  [/拉麵|拉麺|らーめん|ラーメン|ramen/i, 'ramen'],
  [/壽司|すし|スシ|寿司|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/とんかつ|トンカツ/i, 'tonkatsu'],
  [/麵包|ベーカリー|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|cafe|coffee/i, 'cafe'],
]

/** 拉麵標記：弱「麺」訊號的守衛。店名含這些詞，弱訊號不判為烏龍麵。 */
const RAMEN_GUARD = /麺処|麺や|担々麺|中華麺|冷麺/
/** 最弱訊號：只有一個「麺」字、前面沒有明確關鍵字時才用（麺喜やしま）。 */
const WEAK_UDON = /麺処|(?<!つけ)麺(?!屋)/

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  const name = c.name ?? ''
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  // 最弱訊號放最後：前面都沒命中才看，且有拉麵標記時不用（見上方守衛說明）。
  if (WEAK_UDON.test(name) && !RAMEN_GUARD.test(name)) return 'udon'
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
