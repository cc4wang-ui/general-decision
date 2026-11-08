// 種類級排除：「不要烏龍麵」這種需求。
//
// Google Places 沒有「烏龍麵」這種細類型（Table A 只有 ramen_restaurant、
// sushi_restaurant 這類），所以種類判斷靠兩層：具體的 primaryType／types，
// 再退到店名關鍵字。伺服器（api/daily-route.ts）與前端（src/dailyDecision.tsx）
// 共用同一份邏輯，兩邊判出來的種類必須一致，否則前端說「不要這類」、伺服器
// 還繼續派同一類的店。
//
// 只回傳一種 kind（第一個命中者）；沒有命中就回 undefined，表示這一站
// 沒有可排除的種類，UI 也就不顯示「不要這類」按鈕。

export const KIND_LABELS: Record<string, string> = {
  udon: '烏龍麵',
  soba: '蕎麥麵',
  ramen: '拉麵',
  sushi: '壽司',
  yakiniku: '燒肉',
  curry: '咖哩',
  bakery: '麵包',
  cafe: '咖啡',
  ramen_restaurant: '拉麵',
  sushi_restaurant: '壽司',
}

/** Google Table A 裡「本身就是一種料理」的類型，直接當 kind 用。 */
const TYPE_KINDS = new Set(['ramen_restaurant', 'sushi_restaurant'])

/** 店名關鍵字 → kind。烏龍麵沒有對應的 Places 類型，只能靠名字認。 */
const NAME_KINDS: Array<[RegExp, string]> = [
  [/烏龍麵|うどん|udon/i, 'udon'],
  [/蕎麥麵|そば|soba/i, 'soba'],
  [/拉麵|拉麺|らーめん|ラーメン|ramen/i, 'ramen'],
  [/壽司|すし|寿司|sushi/i, 'sushi'],
  [/燒肉|焼肉|yakiniku/i, 'yakiniku'],
  [/咖哩|カレー|curry/i, 'curry'],
  [/麵包|ベーカリー|パン屋|bakery/i, 'bakery'],
  [/咖啡|カフェ|珈琲|cafe|coffee/i, 'cafe'],
]

export function kindOfCandidate(c: { name?: string; types?: string[]; primaryType?: string }): string | undefined {
  if (c.primaryType && TYPE_KINDS.has(c.primaryType)) return c.primaryType
  for (const t of c.types ?? []) if (TYPE_KINDS.has(t)) return t
  const name = c.name ?? ''
  for (const [re, kind] of NAME_KINDS) if (re.test(name)) return kind
  return undefined
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
