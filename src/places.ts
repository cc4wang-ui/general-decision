// Places 呼叫規則 — 第 8 節。純邏輯放這裡，實際 fetch 在 api/order.ts。
import { hhmmIn, weekdayMondayIndex, type Tz } from './tz.ts'
import type { ModuleCard, PlaceCandidate, PriceLevel } from './types.ts'

/** 第 8 節：固定 fieldMask，這組落在 Enterprise SKU。Round 3 加 types／priceLevel／priceRange（同 SKU，R3§0-3）。 */
export const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.currentOpeningHours.openNow',
  'places.currentOpeningHours.nextOpenTime',
  // Round 5（checker 2026-11-01）：還剩多久關門。久坐的情境不派快打烊的店。
  'places.currentOpeningHours.nextCloseTime',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.primaryType',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.priceLevel',
  'places.priceRange',
].join(',')

/** 向 Places 一次要幾筆：Nearby 的 maxResultCount 與 Text Search 的 pageSize 上限都是 20（R3§1.3）。 */
export const FETCH_COUNT = 20
/** 「即將營業」的容忍：nextOpenTime 在這幾分鐘內就算。 */
export const OPENING_SOON_MIN = 60
/** 第一次有效候選不足 → 第二次半徑放大這個倍數（800 → 2000m）。 */
export const WIDEN_FACTOR = 2.5
/** 第 8 節硬上限：每日 40 次之後前端就不帶定位了。 */
export const DAILY_PLACES_CAP = 40

/** Google 的 Money：units 是字串形式的整數，nanos 是 10^-9。 */
export interface RawMoney { currencyCode?: string; units?: string | number; nanos?: number }

export interface RawPlace {
  id?: string
  displayName?: { text?: string }
  location?: { latitude?: number; longitude?: number }
  currentOpeningHours?: { openNow?: boolean; nextOpenTime?: string; nextCloseTime?: string }
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  primaryType?: string
  rating?: number
  userRatingCount?: number
  types?: string[]
  priceLevel?: PriceLevel
  priceRange?: { startPrice?: RawMoney; endPrice?: RawMoney }
}

/** Money → 數字；沒有 units 也沒有 nanos → undefined。 */
export function moneyToNumber(m: RawMoney | undefined): number | undefined {
  if (!m || (m.units == null && m.nanos == null)) return undefined
  const n = Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9
  return Number.isFinite(n) ? n : undefined
}

/** priceRange（Money）→ PlaceCandidate.priceRange；start 缺就當沒有（end 缺 = 無上限）。 */
function toPriceRange(r: RawPlace['priceRange']): PlaceCandidate['priceRange'] {
  const start = moneyToNumber(r?.startPrice)
  if (start === undefined) return undefined
  const end = moneyToNumber(r?.endPrice)
  const currency = r?.startPrice?.currencyCode ?? r?.endPrice?.currencyCode
  return { start, ...(end !== undefined ? { end } : {}), ...(currency ? { currency } : {}) }
}

/**
 * 店名 → Google Maps 連結（DEV-PLAN-2 階段 B）。
 * 用 Google 官方 Maps URLs scheme：query 是 query_place_id 失效時的後備，兩個都帶。
 * 只能拿 Places API 回來的真 id 來組；模型講的 id 不可信。
 */
export function placeMapUrl(id: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`
}

/**
 * 依使用者的「想吃」決定 Places 查什麼類型。甜食 → 麵包／咖啡／冰店；其餘照卡片預設。
 * 只用 Places API (New) Table A 裡長期存在的類型，避免一個不合法的 type 讓整次查詢 400。
 */
export function placesTypesFor(defaultTypes: string[], choices: Record<string, string | number>): string[] {
  return choices.taste === '甜食' ? ['bakery', 'cafe', 'ice_cream_shop'] : defaultTypes
}

/** 這次要怎麼查 Places：Nearby（照 type）或 Text Search（照中文關鍵字）。 */
export type PlacesSearch =
  | { kind: 'nearby'; includedTypes: string[]; radius: number }
  | { kind: 'text'; textQuery: string; radius: number }

/**
 * 卡片 + 使用者選擇 → 查法。有 textQuery 設定就走 Text Search：選項對不到關鍵字時用該欄 default 的關鍵字，
 * 再對不到就退回 Nearby。沒有 textQuery 的卡照舊走 Nearby（eat 的甜食改 type 也在這裡）。
 */
export function placesSearchFor(
  card: Pick<ModuleCard, 'intake' | 'placesQuery'>,
  choices: Record<string, string | number>,
): PlacesSearch {
  const radius = card.placesQuery?.radiusByTransport?.default ?? 800
  const tq = card.placesQuery?.textQuery
  if (tq) {
    const fallback = card.intake.find((f) => f.key === tq.key)?.default
    const q = tq.byOption[String(choices[tq.key] ?? '')] ?? tq.byOption[String(fallback ?? '')]
    if (q) return { kind: 'text', textQuery: q, radius }
  }
  return { kind: 'nearby', includedTypes: placesTypesFor(card.placesQuery?.includedTypes ?? [], choices), radius }
}

/** 公尺 → 步行分鐘（80 m/min，無條件進位，至少 1）。 */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / 80))
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** 今天是星期幾的營業時間字串裡，抓最後一個 HH:MM 當關門時間。「今天」以店家所在時區算（伺服器在 UTC 也要對）。 */
export function closingTime(descriptions: string[] | undefined, now: Date, tz: Tz = 'Asia/Taipei'): string | undefined {
  if (!descriptions?.length) return undefined
  const idx = weekdayMondayIndex(now, tz) // Google 的 weekdayDescriptions 從星期一開始
  const line = descriptions[idx]
  if (!line) return undefined
  const times = [...line.matchAll(/(\d{1,2}):(\d{2})/g)]
  const last = times.at(-1)
  if (!last) return undefined
  return `${last[1]!.padStart(2, '0')}:${last[2]}`
}

/** nextOpenTime（RFC3339）距現在幾分鐘；沒有就 undefined。 */
function minutesUntilOpen(p: RawPlace, now: Date): number | undefined {
  const t = p.currentOpeningHours?.nextOpenTime
  if (!t) return undefined
  const ms = new Date(t).getTime() - now.getTime()
  return Number.isFinite(ms) ? Math.round(ms / 60000) : undefined
}

/**
 * 營業中的店還剩幾分鐘關門。優先用 Google 的 nextCloseTime；沒有就用今天營業時間的最後一個 HH:MM
 * （比現在早就當作跨過午夜）。24 小時營業或沒資料 → undefined（不限制）。
 */
export function minutesUntilClose(p: RawPlace, now: Date, openUntil: string | undefined, tz: Tz): number | undefined {
  const t = p.currentOpeningHours?.nextCloseTime
  if (t) {
    const ms = new Date(t).getTime() - now.getTime()
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 60000)
  }
  if (!openUntil) return undefined
  const [ch, cm] = openUntil.split(':').map(Number)
  const [nh, nm] = hhmmIn(now.toISOString(), tz).split(':').map(Number)
  if (![ch, cm, nh, nm].every((x) => Number.isFinite(x))) return undefined
  let d = (ch! * 60 + cm!) - (nh! * 60 + nm!)
  if (d < 0) d += 24 * 60
  return d
}

/**
 * 評價分數：貝氏平均，把「5 顆星但只有 3 則」壓下去、「4.4 顆星 800 則」抬上來。
 * 先驗 4.0 分、權重 20 則。沒有評分視為 0，排最後。
 */
export function ratingScore(rating?: number, count?: number): number {
  if (!rating || !count) return 0
  return (rating * count + 4.0 * 20) / (count + 20)
}

/**
 * 第 8 節（2026-09-18 改；Round 3 再改）：候選 = 營業中，或 60 分鐘內開門；濾掉 exclude。
 * 照貝氏平均排序（除錯畫面好讀），**全部保留**：品質保底與挑店都移到 src/discovery.ts pickPlace（DEV-PLAN-3 W1.1）。
 * tz 是店家所在地的時區（src/tz.ts tzOf），營業到幾點／幾點開都用當地時間。
 */
/** 主類別是住宿的店不當餐廳派（Places Table A 的 lodging 類）。 */
export const LODGING_TYPES = new Set([
  'lodging', 'hotel', 'resort_hotel', 'motel', 'hostel', 'inn', 'guest_house', 'bed_and_breakfast', 'extended_stay_hotel',
  'japanese_inn', 'budget_japanese_inn', 'farmstay', 'cottage', 'private_guest_room', 'campground', 'camping_cabin', 'rv_park', 'mobile_home_park',
])

export function toCandidates(
  raw: RawPlace[],
  origin: { lat: number; lng: number },
  now: Date,
  exclude: string[] = [],
  tz: Tz = 'Asia/Taipei',
): PlaceCandidate[] {
  const all = raw
    .filter((p) => p.id && p.displayName?.text)
    .filter((p) => !exclude.includes(p.id!))
    // 正式站實測：查 restaurant 會撈回飯店（東京半島酒店、旅店），叫人「去吃飯店」不是口令。主類別是住宿的一律拿掉。
    .filter((p) => !LODGING_TYPES.has(p.primaryType ?? ''))
    .filter((p) => {
      if (p.currentOpeningHours?.openNow === true) return true
      const m = minutesUntilOpen(p, now)
      return m !== undefined && m >= 0 && m <= OPENING_SOON_MIN
    })
    .map((p) => {
      const loc = p.location
      const meters = loc?.latitude != null && loc?.longitude != null ? haversineMeters(origin, { lat: loc.latitude, lng: loc.longitude }) : undefined
      const walkMin = meters !== undefined ? walkMinutes(meters) : undefined
      const open = p.currentOpeningHours?.openNow === true
      const c: PlaceCandidate = {
        id: p.id!,
        name: p.displayName!.text!,
        walkMin,
        ...(meters !== undefined ? { distM: Math.round(meters) } : {}),
        openUntil: open ? closingTime(p.regularOpeningHours?.weekdayDescriptions, now, tz) : undefined,
        opensAt: open ? undefined : hhmmIn(p.currentOpeningHours!.nextOpenTime!, tz),
        primaryType: p.primaryType,
        rating: p.rating,
        ratingCount: p.userRatingCount,
      }
      if (open) {
        const closeIn = minutesUntilClose(p, now, c.openUntil, tz)
        if (closeIn !== undefined) c.closeInMin = closeIn
      } else {
        const opensIn = minutesUntilOpen(p, now)
        if (opensIn !== undefined) c.opensInMin = opensIn
      }
      if (p.types?.length) c.types = p.types
      if (p.priceLevel) c.priceLevel = p.priceLevel
      const range = toPriceRange(p.priceRange)
      if (range) c.priceRange = range
      return c
    })
  return all.sort((a, b) => ratingScore(b.rating, b.ratingCount) - ratingScore(a.rating, a.ratingCount) || (a.walkMin ?? 99) - (b.walkMin ?? 99))
}

/** 兩次 Places 的結果合併：同 id 只留第一次出現的那筆，再照貝氏排序。 */
export function mergeCandidates(a: PlaceCandidate[], b: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set(a.map((c) => c.id))
  return [...a, ...b.filter((c) => !seen.has(c.id))]
    .sort((x, y) => ratingScore(y.rating, y.ratingCount) - ratingScore(x.rating, x.ratingCount) || (x.walkMin ?? 99) - (y.walkMin ?? 99))
}

/** 模型寫的店對回真實候選（id 或店名相同）。Round 3 起只用來判斷模型有沒有寫錯店（dbg.forced），店一律由 pickPlace 決定。 */
export function matchPlace(place: { id?: string; name?: string } | undefined, places: PlaceCandidate[]): PlaceCandidate | undefined {
  if (!place) return undefined
  return places.find((p) => p.id === place.id || p.name === place.name)
}
