// 什麼不是可拜訪的店家：車站／地標／商場……。
//
// 伺服器（api/daily-route.ts）與前端（src/dailyDecision.tsx）共用同一份判斷：
// 舊版殘留的車站候選要兩邊一起清，否則一邊清、一邊留。類型判斷（primaryType／
// types）與種類判斷（src/placeKind.ts）是兩回事：這裡只判斷「是不是店家」。
export type VenueLike = { types?: string[]; primaryType?: string }

/** primaryType 在這裡面的，一律不是可拜訪的店家。 */
export const DENY_PRIMARY = new Set([
  'transit_station', 'train_station', 'subway_station', 'bus_station',
  'tourist_attraction', 'shopping_mall', 'department_store', 'lodging',
  'hospital', 'university', 'school', 'place_of_worship', 'church', 'mosque',
  'synagogue', 'hindu_temple', 'city_hall', 'courthouse', 'embassy', 'police',
  'fire_station', 'post_office', 'atm', 'bank', 'gas_station', 'parking', 'airport',
])

/** types 陣列裡出現任一個，就不是店家（車站／地標即使 primaryType 不是，也擋）。 */
export const DENY_ANY = new Set([
  'transit_station', 'train_station', 'subway_station', 'bus_station', 'tourist_attraction',
])

/** 這個候選是不是非店家（車站／地標……）。types 或 primaryType 缺了就當作不是（不亂擋）。 */
export function isDeniedCandidate(c: VenueLike): boolean {
  return (!!c.primaryType && DENY_PRIMARY.has(c.primaryType)) || (c.types ?? []).some((t) => DENY_ANY.has(t))
}

/**
 * 候選店家最低評論數（單一真相來源）。伺服器（api/daily-route.ts）與前端
 * （src/dailyDecision.tsx）共用同一份，兩邊判出來的「夠不夠格」才會一致。
 * 使用者開的條件：評論數 50 則以上才派；userRatingCount 拿不到＝無法驗證＝不派。
 */
export const MIN_REVIEWS = 50
