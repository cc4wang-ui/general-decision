// 什麼不是可拜訪的店家：車站／地標／商場……。
//
// 伺服器（api/daily-route.ts）與前端（src/dailyDecision.tsx）共用同一份判斷：
// 舊版殘留的車站候選要兩邊一起清，否則一邊清、一邊留。類型判斷（primaryType／
// types）與種類判斷（src/placeKind.ts）是兩回事：這裡只判斷「是不是店家」。
export type VenueLike = { types?: string[]; primaryType?: string }

/** primaryType 在這裡面的，一律不是可拜訪的店家。
 * round 11 補 `point_of_interest`：很多小地標的 primaryType 就是這個泛用類型
 * （Google 沒給它們更細的類型）。只放 primary，不放 types——`point_of_interest`
 * 幾乎出現在每一間真店的 types 陣列裡（餐廳的 types 通常是
 * [restaurant, food, point_of_interest, establishment]），放進 DENY_ANY 會把
 * 真店全擋掉。真店的 primaryType 是它自己的具體類型（restaurant、cafe……），
 * 不會是 point_of_interest；primaryType 是 point_of_interest 的地方，本身就
 * 不是一間可以走進去消費的店。 */
export const DENY_PRIMARY = new Set([
  'transit_station', 'train_station', 'subway_station', 'bus_station',
  'tourist_attraction', 'point_of_interest', 'shopping_mall', 'department_store', 'lodging',
  'hospital', 'university', 'school', 'place_of_worship', 'church', 'mosque',
  'synagogue', 'hindu_temple', 'city_hall', 'courthouse', 'embassy', 'police',
  'fire_station', 'post_office', 'atm', 'bank', 'gas_station', 'parking', 'airport',
])

/** types 陣列裡出現任一個，就不是店家（車站／地標即使 primaryType 不是，也擋）。
 * 注意 `point_of_interest` 不在這裡：它幾乎出現在每一間真店的 types 陣列裡，
 * 放進來會把真店全擋掉（見上方 DENY_PRIMARY 的說明）。 */
export const DENY_ANY = new Set([
  'transit_station', 'train_station', 'subway_station', 'bus_station', 'tourist_attraction',
])

/** 這個候選是不是非店家（車站／地標……）。types 或 primaryType 缺了就當作不是（不亂擋）。 */
export function isDeniedCandidate(c: VenueLike): boolean {
  return (!!c.primaryType && DENY_PRIMARY.has(c.primaryType)) || (c.types ?? []).some((t) => DENY_ANY.has(t))
}

/**
 * 地標名稱封閉清單（round 11；用戶 2026-11-08 21:22 決定：壁畫地標不是合法停靠點，
 * 地標一般也不是）。類型過濾擋不住「明日の神話」——Google 把它歸類為 art_gallery
 * （Wanderlog／Voyapon 的分類也是 Art Gallery，★4.6），而 creative 站本來就是找
 * art_gallery：類型上它跟真藝廊（DIESEL ART GALLERY）分不出來。所以這類「Google
 * 誤分類為藝廊的公共藝術」要靠名稱規則擋。只收已核實的案例（目前只有明日の神話
 * 一筆），不要發明——名稱規則是類型規則補不到的缺口，不是拼字列舉。
 * 比對用子字串：Google 回的店名可能是「岡本太郎「明日の神話」」或「明日の神話」，
 * 兩種都含「明日の神話」。 */
export const LANDMARK_NAMES = ['明日の神話', 'Myth of Tomorrow']

/** 店名是不是已知地標（公共藝術／壁畫等非店家）。名稱缺了就當作不是（不亂擋）。 */
export function isDeniedName(name: string | undefined): boolean {
  if (!name) return false
  return LANDMARK_NAMES.some((n) => name.includes(n))
}

/**
 * 候選店家最低評論數（單一真相來源）。伺服器（api/daily-route.ts）與前端
 * （src/dailyDecision.tsx）共用同一份，兩邊判出來的「夠不夠格」才會一致。
 * 使用者開的條件：評論數 50 則以上才派；userRatingCount 拿不到＝無法驗證＝不派。
 */
export const MIN_REVIEWS = 50
