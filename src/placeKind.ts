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
 * 最後一條是最弱訊號，放最後：前面都沒命中才看。麺喜やしま這種店名只有一個
 * 「麺」字，沒有讃岐／うどん可認；麺屋（拉麵店常用，如麺屋武蔵）與つけ麺除外，
 * 避免誤傷拉麵店。殘留風險：麺処是烏龍麵／蕎麥麵／拉麵店都會用的名字（例如拉麵
 * 店「麺処ほん田」），沒有其他關鍵字時會被算成烏龍麵；認不出種類時 UI 只給單店
 * 排除，不假裝種類排除有生效。
 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/烏龍麵|うどん|udon|讃岐|さぬき|手打ち麺/i, 'udon'],
  [/蕎麥麵|蕎麦|そば|soba/i, 'soba'],
  [/拉麵|拉麺|らーめん|ラーメン|ramen/i, 'ramen'],
  [/壽司|すし|寿司|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/麵包|ベーカリー|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|cafe|coffee/i, 'cafe'],
  [/麺処|(?<!つけ)麺(?!屋)/, 'udon'],
]

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  if (c.primaryType && TYPE_KINDS[c.primaryType]) return TYPE_KINDS[c.primaryType]
  for (const t of c.types ?? []) if (TYPE_KINDS[t]) return TYPE_KINDS[t]
  const name = c.name ?? ''
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
