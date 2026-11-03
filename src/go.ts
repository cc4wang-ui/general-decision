/**
 * Round 10 X2：「去」卡查真地點（docs/ROADMAP.md X2；docs/round3/STRATEGY.md §5「店由程式決定、數字不編」）。
 *
 * 以前 go 卡 needsPlaces:false，地點由模型憑常識編，交通與「可接受」只進 prompt、沒有作用。現在：
 *   交通＋可接受 → 搜尋半徑（goRadius，下表）→ 依當地時段挑目的地關鍵字（GO_DESTS）→ Text Search（深夜才帶 openNow）
 *   → 候選過濾（goKeep：不派吃喝、車站、雜事店；到了要還開著；深夜不派登山、還沒開的）→ src/discovery.ts pickPlace 挑一家。
 * 第二次（src/lanes.ts widenPlan → goWiden）：半徑不放大（使用者選了單程上限）、換通用關鍵字、只要營業中。
 * 第三次照舊超商救援（src/lanes.ts rescuePlan）。
 * 純函式，不碰 I/O。前後端都可以 import。
 */
import type { LanePlan, TextRank } from './lanes.ts'
import type { Country, PickMode, PlaceCandidate } from './types.ts'
import type { Rng } from './discovery.ts'

export type Transport = '走路' | '捷運' | '計程車' | '開車'
export type Minutes = 15 | 30 | 60
/** 當地時段：day 06–17、evening 17–22、late 22–06。 */
export type Daypart = 'day' | 'evening' | 'late'

export const TRANSPORTS: Transport[] = ['走路', '捷運', '計程車', '開車']
export const MINUTES: Minutes[] = [15, 30, 60]
/** go 卡選項沒送或送了不認得的值時用（跟 src/cards.ts 的預設一致）。 */
const DEFAULT_TRANSPORT: Transport = '捷運'
const DEFAULT_MINUTES: Minutes = 30

/**
 * 交通＋可接受（單程分鐘）→ 搜尋半徑（公尺，直線）。
 * 半徑 ≈（單程分鐘 − 固定耗損）× 直線速度，取整到 500 m，最少 500 m。直線速度＝實際速度 × 0.8（路不是直的）。
 *
 * | 交通   | 固定耗損                   | 直線速度 | 15 分 | 30 分 | 60 分  |
 * |--------|----------------------------|----------|-------|-------|--------|
 * | 走路   | 0                          | 65 m/分  | 1,000 | 2,000 | 4,000  |  步行 80 m/分（src/places.ts walkMinutes）× 0.8
 * | 捷運   | 10 分（走到站、等車、出站）| 400 m/分 | 2,000 | 8,000 | 20,000 |  表定約 30 km/h ≈ 500 m/分 × 0.8
 * | 計程車 | 5 分（叫車、上下車）       | 300 m/分 | 3,000 | 7,500 | 16,500 |  市區平均約 22 km/h ≈ 370 m/分 × 0.8
 * | 開車   | 10 分（走到車、找停車位）  | 300 m/分 | 1,500 | 6,000 | 15,000 |  同計程車，多了找停車位
 *
 * 同一個「可接受」下四種交通的半徑都不一樣 → 四種交通的 Places 查詢指紋互不相同（tests/unit/go.test.ts）。
 * 走路的 walkMin 上限：半徑 ÷ 80 m/分 ≤ 可接受（1,000 m → 13 分 ≤ 15 分）。
 */
const SPEED: Record<Transport, { overhead: number; mPerMin: number }> = {
  走路: { overhead: 0, mPerMin: 65 },
  捷運: { overhead: 10, mPerMin: 400 },
  計程車: { overhead: 5, mPerMin: 300 },
  開車: { overhead: 10, mPerMin: 300 },
}

export function goRadius(transport: Transport, minutes: Minutes): number {
  const s = SPEED[transport]
  return Math.max(500, Math.round(((minutes - s.overhead) * s.mPerMin) / 500) * 500)
}

export function daypartOf(hour: number): Daypart {
  if (hour >= 6 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'late'
}

/** 到了至少還要能待這麼久（分鐘）：關門時間要晚於「現在＋單程上限＋這個數」。 */
export const GO_STAY_MIN = 30

export interface GoTrip { transport: Transport; minutes: Minutes; radius: number; part: Daypart }

/** 使用者選的交通；沒送或不認得 → 卡片預設。 */
export function transportOf(choices: Record<string, string | number>): Transport {
  const t = String(choices.transport ?? '')
  return (TRANSPORTS as string[]).includes(t) ? (t as Transport) : DEFAULT_TRANSPORT
}

/** 使用者選的「可接受」（「30 分」→ 30）；沒送或不認得 → 卡片預設。 */
export function minutesOf(choices: Record<string, string | number>): Minutes {
  const m = Number.parseInt(String(choices.minutes ?? ''), 10)
  return (MINUTES as number[]).includes(m) ? (m as Minutes) : DEFAULT_MINUTES
}

/** 使用者的選項＋當地小時 → 這一趟的條件。 */
export function goTrip(choices: Record<string, string | number>, hour: number): GoTrip {
  const transport = transportOf(choices)
  const minutes = minutesOf(choices)
  return { transport, minutes, radius: goRadius(transport, minutes), part: daypartOf(hour) }
}

/**
 * 目的地關鍵字。q 是各國的關鍵字（日本用日文，比照 src/scene.ts restBase：用 languageCode=ja 查中文字會撈錯）；
 * 該國沒有這一類就不寫（日本沒有夜市、老街）。when＝哪些時段可以派。深夜只留公園、夜景（另帶 openNow）。
 * 一律走 Text Search：關鍵字不會讓整次查詢 400（新的 type 會，見 src/lanes.ts 開頭），也才帶得了 openNow。
 */
export interface GoDest { id: string; q: Partial<Record<Country, string>>; when: Daypart[] }

export const GO_DESTS: GoDest[] = [
  { id: 'park', q: { TW: '公園', JP: '公園', other: 'park' }, when: ['day', 'evening', 'late'] },
  { id: 'art', q: { TW: '美術館', JP: '美術館', other: 'art museum' }, when: ['day'] },
  { id: 'museum', q: { TW: '博物館', JP: '博物館', other: 'museum' }, when: ['day'] },
  { id: 'garden', q: { TW: '植物園', JP: '庭園', other: 'botanical garden' }, when: ['day'] },
  { id: 'trail', q: { TW: '步道', JP: 'ハイキングコース', other: 'hiking trail' }, when: ['day'] },
  { id: 'books', q: { TW: '書店', JP: '本屋', other: 'bookstore' }, when: ['day', 'evening'] },
  { id: 'view', q: { TW: '觀景台', JP: '展望台', other: 'observation deck' }, when: ['day', 'evening'] },
  { id: 'street', q: { TW: '老街', JP: '商店街', other: 'old town' }, when: ['day', 'evening'] },
  { id: 'temple', q: { TW: '寺廟', JP: '神社', other: 'temple' }, when: ['day', 'evening'] },
  { id: 'riverside', q: { TW: '河濱公園' }, when: ['day', 'evening'] },
  { id: 'nightmarket', q: { TW: '夜市', other: 'night market' }, when: ['evening'] },
  { id: 'nightview', q: { TW: '夜景', JP: '夜景スポット', other: 'night view' }, when: ['evening', 'late'] },
]

/** 第二次（擴大）時的通用關鍵字（＋openNow）。 */
const GO_WIDEN: Record<Country, string[]> = {
  TW: ['景點', '公園'],
  JP: ['観光スポット', '公園'],
  other: ['tourist attraction', 'park'],
}

/** go 的 lane id 都以這個開頭（widenPlan 靠它認；lane id 不放使用者的字）。 */
export const GO_LANE_PREFIX = 'go:'

/** 這個時段、這個國家可以派的目的地。 */
export function goDests(country: Country, part: Daypart): GoDest[] {
  return GO_DESTS.filter((d) => d.when.includes(part) && d.q[country])
}

/** 第一次查詢：時段內的目的地均勻抽一個，DISTANCE／RELEVANCE 交替；深夜只要營業中。 */
export function goPlan(trip: GoTrip, country: Country, rng: Rng): LanePlan {
  const pool = goDests(country, trip.part)
  const d = pool[Math.floor(rng() * pool.length)]!
  const rank: TextRank = rng() < 0.5 ? 'DISTANCE' : 'RELEVANCE'
  return {
    kind: 'text', lane: `${GO_LANE_PREFIX}${d.id}`, textQuery: d.q[country]!, radius: trip.radius, rank, restrict: true,
    ...(trip.part === 'late' ? { openNow: true } : {}),
  }
}

/** 第二次：同半徑、換通用關鍵字、換排序、只要營業中。沒帶 rng（舊呼叫端）固定第一個關鍵字。 */
export function goWiden(first: LanePlan, country: Country, rng?: Rng): LanePlan {
  const words = GO_WIDEN[country]
  const word = rng ? words[Math.floor(rng() * words.length)]! : words[0]!
  const rank: TextRank = first.rank === 'DISTANCE' ? 'RELEVANCE' : 'DISTANCE'
  return { kind: 'text', lane: `${GO_LANE_PREFIX}open-now`, textQuery: word, radius: first.radius, rank, restrict: true, openNow: true }
}

/** 所有 go lane 的查法（src/probe.ts mode=lanes 一條一條實測用）。半徑用走路 30 分。 */
export function goLanePlans(country: Country): LanePlan[] {
  const radius = goRadius('走路', 30)
  const firsts = GO_DESTS.filter((d) => d.q[country]).map((d): LanePlan => (
    { kind: 'text', lane: `${GO_LANE_PREFIX}${d.id}`, textQuery: d.q[country]!, radius, rank: 'RELEVANCE', restrict: true }
  ))
  const widen = GO_WIDEN[country].map((w): LanePlan => (
    { kind: 'text', lane: `${GO_LANE_PREFIX}open-now:${w}`, textQuery: w, radius, rank: 'DISTANCE', restrict: true, openNow: true }
  ))
  return [...firsts, ...widen]
}

// ── 候選過濾 ──────────────────────────────────────────────────────────

/** 吃喝的店：「去」不是「吃」（關鍵字「公園」會撈到店名有公園的冰店）。*_restaurant 另外判。 */
const FOOD_DRINK = new Set([
  'restaurant', 'food', 'food_court', 'cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'ice_cream_shop', 'confectionery',
  'candy_store', 'donut_shop', 'bagel_shop', 'juice_shop', 'tea_house', 'chocolate_shop', 'pastry_shop', 'cake_shop',
  'sandwich_shop', 'meal_takeaway', 'meal_delivery', 'deli', 'diner', 'bistro', 'bar', 'pub', 'wine_bar', 'cocktail_bar',
  'lounge_bar', 'sports_bar', 'hookah_bar', 'bar_and_grill', 'beer_hall', 'brewery', 'brewpub', 'winery', 'night_club',
])
/** 辦事的地方：不是「去哪走走」（超商只在救援時派）。 */
const ERRANDS = new Set([
  'convenience_store', 'supermarket', 'grocery_store', 'liquor_store', 'drugstore', 'pharmacy', 'parking', 'atm', 'bank',
  'post_office', 'real_estate_agency', 'car_rental', 'car_repair', 'car_wash', 'bus_stop', 'transit_depot',
])
/** 深夜不派（原 prompt「深夜不排登山」，現在由程式擋）。 */
const LATE_AVOID = new Set(['hiking_area', 'national_park', 'state_park', 'campground', 'mountain_peak', 'beach', 'marina'])

/** 這個主類別能不能當「去」的目的地。沒有主類別 → 可以（不憑空擋）。 */
export function isGoDestination(primaryType: string | undefined): boolean {
  if (!primaryType) return true
  if (FOOD_DRINK.has(primaryType) || primaryType.endsWith('_restaurant')) return false
  // 車站（關鍵字「大安森林公園」會撈到捷運站）、加油站都是 *_station。
  if (ERRANDS.has(primaryType) || primaryType.endsWith('_station')) return false
  return true
}

type GoCand = Pick<PlaceCandidate, 'primaryType' | 'opensAt' | 'closeInMin' | 'walkMin'>

/** 單一地點是否符合這一趟（src/probe.ts mode=go 也拿來判）。 */
export function goPasses(c: GoCand, trip: GoTrip): boolean {
  if (!isGoDestination(c.primaryType)) return false
  if (trip.part === 'late') {
    // 深夜只派營業中的：還沒開門（「HH:MM 開」）的不算；登山、海邊不派。
    if (c.opensAt) return false
    if (c.primaryType && LATE_AVOID.has(c.primaryType)) return false
  }
  // 到了要還開著：單程上限＋至少待 30 分鐘（沒有關門資料或 24 小時營業 → 不限制）。
  if (typeof c.closeInMin === 'number' && c.closeInMin < trip.minutes + GO_STAY_MIN) return false
  return true
}

/**
 * 每一次 Places 回來的候選：救援（超商）不過濾，其餘只留 goPasses 的。
 * 不是走路就拿掉 walkMin：口令卡與 prompt 才不會寫「步行 120 分」；pickPlace 的步行扣分也不該罰搭車去的遠處。
 */
export function goKeep<T extends GoCand>(cands: T[], trip: GoTrip, rescue = false): T[] {
  const kept = rescue ? cands : cands.filter((c) => goPasses(c, trip))
  if (trip.transport === '走路') return kept
  return kept.map((c) => {
    if (c.walkMin === undefined) return c
    const copy = { ...c }
    delete copy.walkMin
    return copy
  })
}

/**
 * 去沒有到訪記憶（前端只記吃、歇；src/app.tsx isMemModule），pickPlace 給的「新據點／第 N 次」沒有根據。
 * 一律當偵察任務（mode=wildcard、visits=1）：口令講「偵察」，不宣稱使用者去過或沒去過（數字不編）。
 */
export function goPick<T extends { mode: PickMode; visits: number; exhausted: boolean }>(pick: T): T {
  return { ...pick, mode: 'wildcard', visits: 1, exhausted: false }
}

// ── 口令 ──────────────────────────────────────────────────────────────

/** steps 有沒有寫到這種交通（JP 的「電車」算捷運；localizeOrder 會把「捷運」改成「電車」）。 */
export const TRANSPORT_RE: Record<Transport, RegExp> = {
  走路: /走路|步行|徒步|走過去|走去|走\s*\d+\s*分/,
  捷運: /捷運|地鐵|地下鐵|電車|MRT/i,
  計程車: /計程車|小黃|叫車|taxi|タクシー/i,
  開車: /開車|自駕|停車/,
}
/** steps 沒寫到選的交通時，補在第一步前面的話。 */
export const TRANSPORT_HEAD: Record<Transport, string> = {
  走路: '走路過去，',
  捷運: '搭捷運過去，',
  計程車: '叫計程車過去，',
  開車: '開車過去，',
}
/** prompt 用：每種交通第一步怎麼寫。 */
export const TRANSPORT_HOW: Record<Transport, string> = {
  走路: '走路過去，照地圖走',
  捷運: '搭捷運（人在日本寫電車）過去',
  計程車: '叫計程車，跟司機報地點名',
  開車: '開車過去，到了先找停車位',
}

export function mentionsTransport(steps: string[], transport: Transport): boolean {
  return steps.some((s) => TRANSPORT_RE[transport].test(s))
}

/**
 * 口令一定寫到使用者選的交通（伺服器保證，不只靠 prompt；src/rules.ts enforceRules 呼叫）。
 * 已經寫到 → 原樣回傳。沒寫到 → 寫到別種車（捷運／計程車／開車）的步驟拿掉（不准跟使用者選的打架；
 * 「下車走過去」這種步行不算別種），再在第一步前面補「搭捷運過去，」這類開頭。
 */
export function goTransportSteps(steps: string[], transport: Transport): string[] {
  if (mentionsTransport(steps, transport)) return steps
  const otherRide = (s: string) => TRANSPORTS.some((t) => t !== transport && t !== '走路' && TRANSPORT_RE[t].test(s))
  const rest = steps.filter((s) => !otherRide(s))
  const head = TRANSPORT_HEAD[transport]
  return rest.length ? [head + rest[0]!, ...rest.slice(1)] : [head.replace(/，$/, '。')]
}
