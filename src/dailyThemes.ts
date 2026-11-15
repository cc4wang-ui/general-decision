// 探索主題（guide-1115）：今日行程的探索站不再固定是藝廊。前端與伺服器共用這一份白名單與查詢對應。
// 主題只決定「送給 Google Places 的查詢字串＋類型」；店是不是真的、開不開、多遠，照舊由伺服器的既有規則判斷。
import { AREA_NAMES, withinArea } from './areas.ts'

export const THEME_IDS = ['view_cafe', 'good_coffee', 'fun', 'park', 'new_area', 'destination_meal', 'art'] as const
export type ThemeId = typeof THEME_IDS[number]
/** query＝Places 文字查詢（日文，東京當地人的找法）；includedType＝Places 類型（沒有就不限）；
 * allowPrimary＝這個主題要找的類型：primaryType 在裡面的店，不因 types 帶 tourist_attraction 被當地標擋掉（公園常被這樣標）。 */
export type ThemeDef = { label: string; query: string; includedType?: string; allowPrimary?: readonly string[] }
export const THEMES: Record<ThemeId, ThemeDef> = {
  view_cafe: { label: '景觀好的咖啡', query: '眺めのいい カフェ テラス', includedType: 'cafe' },
  good_coffee: { label: '好喝的咖啡', query: 'スペシャルティコーヒー 自家焙煎', includedType: 'cafe' },
  fun: { label: '有趣的地方', query: '個性的な雑貨店 古書店 レコード店', includedType: 'store' },
  park: { label: '漂亮的公園', query: '公園 庭園 散歩', includedType: 'park', allowPrimary: ['park', 'garden', 'botanical_garden', 'national_park'] },
  new_area: { label: '沒去過的區域', query: '地元で人気 カフェ 雑貨 散策' },
  destination_meal: { label: '值得專程去的餐廳', query: 'わざわざ行きたい 名店', includedType: 'restaurant' },
  art: { label: '藝文展覽', query: 'art gallery exhibition', includedType: 'art_gallery' },
}
/** 哪一站可以用哪些主題：探索站全部；咖啡站只有兩種咖啡。其他站沒有主題。 */
export const STATION_THEMES: Record<string, readonly ThemeId[]> = { creative: THEME_IDS, coffee: ['view_cafe', 'good_coffee'] }

/** 白名單驗證：這一站可用的主題才回傳，其餘（未知字串、非字串、別站的主題）一律 undefined＝當沒帶。 */
export function themeFor(stopId: string, v: unknown): ThemeId | undefined {
  // hasOwn：站 id 是使用者送來的字串（'__proto__' 之類不能查到原型上的東西）。
  const allowed: readonly string[] = Object.hasOwn(STATION_THEMES, stopId) ? STATION_THEMES[stopId]! : []
  return typeof v === 'string' && allowed.includes(v) ? v as ThemeId : undefined
}
/** 這一站的區域覆寫：只有「沒去過的區域」主題、且是已知地區名才算。 */
export function themeAreaFor(theme: ThemeId | undefined, v: unknown): string | undefined {
  return theme === 'new_area' && typeof v === 'string' && AREA_NAMES.includes(v) ? v : undefined
}
/** 主題要找的類型（例：公園）不被地標規則擋掉。只看 Google 的 primaryType，不看店名。 */
export function themeAllows(theme: string | undefined, primaryType: string | undefined): boolean {
  const def = theme && (THEME_IDS as readonly string[]).includes(theme) ? THEMES[theme as ThemeId] : undefined
  return !!primaryType && !!def?.allowPrimary?.includes(primaryType)
}
/** 沒有店可顯示時的卡片標題。 */
export const themeTitle = (theme: ThemeId): string => '探索｜' + THEMES[theme].label

/** 導遊可以自動挑的主題。 */
export const themePool = (allowNewArea: boolean): ThemeId[] => THEME_IDS.filter(id => allowNewArea || id !== 'new_area')
/** 「讓導遊決定」：從今天還沒出過的主題裡挑一個。全都出過就重新一輪，但不連續挑同一個。
 * allowNewArea＝false 時不挑「沒去過的區域」（使用者開著「只在這一帶找店」，導遊不擅自帶去別區）。 */
export function pickTheme(used: readonly string[], opts: { allowNewArea: boolean; current?: string }, rand: () => number = Math.random): ThemeId {
  const pool = themePool(opts.allowNewArea)
  const fresh = pool.filter(id => !used.includes(id))
  const from = fresh.length ? fresh : pool.filter(id => id !== opts.current)
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))]!
}

// ── 去過的區域（只存本機） ──
export const VISITED_AREAS_KEY = 'decide.daily.areas.v1'
type VisitRecord = Record<string, { t: number; src: string }>
const loadVisits = (): VisitRecord => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VISITED_AREAS_KEY) || 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: VisitRecord = {}
    for (const [area, v] of Object.entries(raw as Record<string, { t?: unknown; src?: unknown } | null>)) {
      if (AREA_NAMES.includes(area) && v && typeof v.t === 'number' && Number.isFinite(v.t)) out[area] = { t: v.t, src: typeof v.src === 'string' ? v.src : '' }
    }
    return out
  } catch { return {} }
}
const saveVisits = (v: VisitRecord): void => { try { localStorage.setItem(VISITED_AREAS_KEY, JSON.stringify(v)) } catch { /* private mode */ } }
/** 去過的區域 → 最後一次去的時間（ms）。讀不到或形狀不對就當沒有紀錄。 */
export function loadVisitedAreas(): Record<string, number> {
  return Object.fromEntries(Object.entries(loadVisits()).map(([area, v]) => [area, v.t]))
}
/** 標記完成時記下這間店所在的區域：用店的座標對既有地區清單（中心 1 公里內），不另外打 API。 */
export function markAreasVisited(place: { lat: number; lng: number }, now: number, src: string): void {
  const hit = AREA_NAMES.filter(area => withinArea(area, place))
  if (!hit.length) return
  const all = loadVisits()
  for (const area of hit) all[area] = { t: now, src }
  saveVisits(all)
}
/** 取消「標記完成」：撤回同一筆紀錄。 */
export function unmarkAreasVisited(src: string): void {
  const all = loadVisits()
  const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => v.src !== src))
  if (Object.keys(kept).length !== Object.keys(all).length) saveVisits(kept)
}
/** 挑一個沒去過的區域；全都去過就挑最久沒去的。home＝使用者自己的生活圈，有別的可選時不挑它。 */
export function pickNewArea(visited: Record<string, number>, home?: string, rand: () => number = Math.random): string {
  const names = AREA_NAMES.filter(a => a !== home).length ? AREA_NAMES.filter(a => a !== home) : AREA_NAMES
  const fresh = names.filter(a => visited[a] === undefined)
  if (fresh.length) return fresh[Math.min(fresh.length - 1, Math.floor(rand() * fresh.length))]!
  return [...names].sort((a, b) => visited[a]! - visited[b]!)[0]!
}
