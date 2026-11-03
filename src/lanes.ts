// 候選池 lane — DEV-PLAN-3 W1.2、R3§1.3。
// Nearby Search 沒有分頁、預設照 POPULARITY 排，同一個 type 永遠回同樣 20 家；
// 輪替「細類 type × rankPreference」才撈得到不同的 20 家，池子擴了，pickPlace 才有得挑。
// 鐵則：只在 verified 的 lane 裡挑。新 type 沒實測過可能讓整次查詢 400（R2 風險），
// 只有 Team Lead／Cross 跑完 `npm run probe:lanes` 回 200 才把 verified 翻成 true。
import { betaSample, cuisineOf, type Rng } from './discovery.ts'
import { GO_LANE_PREFIX, goPlan, goTrip, goWiden } from './go.ts'
import { WIDEN_FACTOR } from './places.ts'
import { priceFit } from './price.ts'
import { SCENE_OTHER, SCENE_QUERIES, eatOtherQuery, restBase, restQuery, type Scene } from './scene.ts'
import type { Band, Country, CuisineStats, ModuleCard } from './types.ts'

export interface Lane {
  id: string
  types: string[]
  /** src/discovery.ts cuisineOf 的細類鍵；細類偏好 Beta 抽樣以它為單位。 */
  group: string
  verified: boolean
  /** 這個 type 何時進 Table A（R3§1.3；新型別的批次是粗標，以 probe-lanes 實測為準）。 */
  since: '2023' | '2024-11' | '2026-02'
  /** 只在這個國家用（例：台式料理在日本撈不到幾家）。 */
  only?: Country
}

const L = (id: string, verified: boolean, since: Lane['since'], extra: Partial<Lane> = {}): Lane =>
  ({ id, types: [id], group: cuisineOf(id), verified, since, ...extra })

export const LANES: Lane[] = [
  // 2023 就在 Table A：已驗證
  L('ramen_restaurant', true, '2023'),
  L('sushi_restaurant', true, '2023'),
  L('japanese_restaurant', true, '2023'),
  L('chinese_restaurant', true, '2023'),
  L('korean_restaurant', true, '2023'),
  L('italian_restaurant', true, '2023'),
  L('thai_restaurant', true, '2023'),
  L('vietnamese_restaurant', true, '2023'),
  L('indian_restaurant', true, '2023'),
  L('american_restaurant', true, '2023'),
  L('pizza_restaurant', true, '2023'),
  L('hamburger_restaurant', true, '2023'),
  L('seafood_restaurant', true, '2023'),
  L('steak_house', true, '2023'),
  L('vegetarian_restaurant', true, '2023'),
  L('vegan_restaurant', true, '2023'),
  L('breakfast_restaurant', true, '2023'),
  L('brunch_restaurant', true, '2023'),
  L('fast_food_restaurant', true, '2023'),
  L('bakery', true, '2023'),
  L('cafe', true, '2023'),
  L('coffee_shop', true, '2023'),
  L('ice_cream_shop', true, '2023'),
  // R3§1.3 標為新增：未實測，pickLane 不挑
  L('taiwanese_restaurant', false, '2026-02', { only: 'TW' }),
  L('noodle_shop', false, '2026-02'),
  L('chinese_noodle_restaurant', false, '2026-02'),
  L('hot_pot_restaurant', false, '2026-02'),
  L('japanese_izakaya_restaurant', false, '2026-02'),
  L('yakiniku_restaurant', false, '2026-02'),
  L('yakitori_restaurant', false, '2026-02'),
  L('tonkatsu_restaurant', false, '2026-02'),
  L('japanese_curry_restaurant', false, '2026-02'),
  L('fine_dining_restaurant', false, '2024-11'),
]

/** 第二次呼叫與 400 退路用的泛用 lane。 */
export const RESTAURANT_LANE: Lane = { id: 'restaurant', types: ['restaurant'], group: 'other', verified: true, since: '2023' }
/** 甜食的退路：沿用 Round 2 的三種 type 一次查（placesTypesFor）。 */
export const SWEET_LANE: Lane = { id: 'sweet', types: ['bakery', 'cafe', 'ice_cream_shop'], group: 'sweet', verified: true, since: '2023' }
/** 吃素：素食＋純素一次查。第二次也不准退回 restaurant（會派到牛排館）。 */
export const VEG_LANE: Lane = { id: 'veg', types: ['vegetarian_restaurant', 'vegan_restaurant'], group: 'veg', verified: true, since: '2023' }

/**
 * Round 4：Text Search 的料理關鍵字 lane。
 * 正式站 Round 3 之後 Cross 仍回報「反覆推同一家」：Nearby 的 2023 type 在台灣撈不到便當、麵店、小吃，
 * 第一次常常不到 5 家 → 第二次一律「餐廳＋營業中＋依距離」→ 每次都是最近的同一批 20 家。
 * 關鍵字查法：不會 400（不像未驗證的新 type）、每個關鍵字撈回不同的 20 家，用 locationRestriction 方框限在步行範圍內。
 * est＝我方推估的價位檔（1–4，可為 x.5，切點見 src/price.ts CUTS），只在 Google 沒有價位資料時用，畫面標「推估」。
 * block＝這個忌口時不排（只擋 lane；個別店家的衝突不在這裡判）。
 */
export interface QueryLane { q: string; group: string; est: number; block?: string[]; lunchOnly?: boolean }

export const QUERY_LANES: Record<'TW' | 'JP', QueryLane[]> = {
  TW: [
    { q: '便當', group: 'tw', est: 1 },
    { q: '小吃', group: 'tw', est: 1 },
    { q: '滷肉飯', group: 'tw', est: 1 },
    { q: '粥', group: 'tw', est: 1 },
    { q: '熱炒', group: 'tw', est: 2.5 },
    { q: '麵店', group: 'noodle', est: 1 },
    { q: '牛肉麵', group: 'noodle', est: 2, block: ['不吃牛'] },
    { q: '水餃 鍋貼', group: 'cn', est: 1 },
    { q: '港式 燒臘', group: 'cn', est: 1.5 },
    { q: '拉麵', group: 'ramen', est: 2 },
    { q: '日式定食', group: 'jp', est: 2 },
    { q: '丼飯', group: 'jp', est: 2 },
    { q: '咖哩飯', group: 'jp', est: 2 },
    { q: '壽司', group: 'jp', est: 2.5 },
    { q: '鐵板燒', group: 'jp', est: 2.5 },
    { q: '燒肉', group: 'jp', est: 3, block: ['不吃牛'] },
    { q: '火鍋', group: 'hotpot', est: 2.5 },
    { q: '韓式料理', group: 'kr', est: 2, block: ['不辣'] },
    { q: '泰式料理', group: 'other', est: 2, block: ['不辣'] },
    { q: '越南河粉', group: 'other', est: 2 },
    { q: '義大利麵', group: 'western', est: 2.5 },
    { q: '早午餐', group: 'western', est: 2, lunchOnly: true },
    { q: '漢堡', group: 'fast', est: 2 },
    { q: '素食', group: 'veg', est: 1.5 },
  ],
  JP: [
    { q: 'ラーメン', group: 'ramen', est: 1.5 },
    { q: '定食', group: 'jp', est: 1.5 },
    { q: 'そば', group: 'jp', est: 1 },
    { q: 'うどん', group: 'jp', est: 1 },
    { q: '牛丼', group: 'fast', est: 1, block: ['不吃牛'] },
    { q: 'カレー', group: 'jp', est: 1 },
    { q: 'とんかつ', group: 'jp', est: 2 },
    { q: '寿司', group: 'jp', est: 2.5 },
    { q: '焼肉', group: 'jp', est: 3, block: ['不吃牛'] },
    { q: '焼き鳥', group: 'jp', est: 2.5 },
    { q: '天ぷら', group: 'jp', est: 2.5 },
    { q: 'お好み焼き', group: 'jp', est: 2 },
    { q: '中華料理', group: 'cn', est: 1.5 },
    { q: '餃子', group: 'cn', est: 1 },
    { q: '洋食', group: 'western', est: 2 },
    { q: 'イタリアン', group: 'western', est: 2.5 },
    { q: '韓国料理', group: 'kr', est: 2, block: ['不辣'] },
    { q: '海鮮丼', group: 'seafood', est: 2 },
  ],
}
/** 甜食、吃素的關鍵字 lane（跟 Nearby 的甜食／素食 lane 輪替）。 */
export const SWEET_QUERIES: Record<'TW' | 'JP', QueryLane[]> = {
  TW: [{ q: '甜點', group: 'sweet', est: 1 }, { q: '豆花', group: 'sweet', est: 1 }, { q: '冰店', group: 'sweet', est: 1 }, { q: '麵包店', group: 'sweet', est: 1 }],
  JP: [{ q: 'スイーツ', group: 'sweet', est: 1 }, { q: 'ケーキ', group: 'sweet', est: 1.5 }, { q: 'パン屋', group: 'sweet', est: 1 }, { q: '和菓子', group: 'sweet', est: 1 }],
}
export const VEG_QUERIES: Record<'TW' | 'JP', QueryLane[]> = {
  TW: [{ q: '素食', group: 'veg', est: 1.5 }, { q: '蔬食', group: 'veg', est: 2 }],
  JP: [{ q: 'ヴィーガン', group: 'veg', est: 2 }, { q: 'ベジタリアン', group: 'veg', est: 2 }],
}

/** 關鍵字 lane 的 id：`q:便當`。第二次呼叫與推估價位都靠這個前綴認。 */
export const queryLaneId = (q: string) => `q:${q}`
const ALL_QUERY = [...QUERY_LANES.TW, ...QUERY_LANES.JP, ...SWEET_QUERIES.TW, ...SWEET_QUERIES.JP, ...VEG_QUERIES.TW, ...VEG_QUERIES.JP, ...SCENE_QUERIES]
/** lane id → 我方推估的價位檔；不是關鍵字 lane 就 undefined。 */
export function laneEst(lane: string | undefined): number | undefined {
  if (!lane?.startsWith('q:')) return undefined
  return ALL_QUERY.find((l) => queryLaneId(l.q) === lane)?.est
}

/**
 * 預算 → Text Search 的 priceLevels（R3§0-3：Nearby 沒有這個參數）。對應跟 src/price.ts LEVEL_BAND 同一套：
 * 平價 1.5、中價 2.5、偏高 3.5、高價 4 → 第 1 檔＝平價；第 2 檔＝平價＋中價；第 3 檔＝中價＋偏高；第 4 檔＝偏高＋高價。
 */
export function priceLevelsFor(budget: Band[] | undefined): string[] | undefined {
  if (!budget?.length) return undefined
  const map: Record<Band, string[]> = {
    1: ['PRICE_LEVEL_INEXPENSIVE'],
    2: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'],
    3: ['PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE'],
    4: ['PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'],
  }
  return [...new Set(budget.flatMap((b) => map[b]))]
}

const SWEET_GROUPS = new Set(['sweet', 'cafe'])
const BREAKFAST = new Set(['breakfast_restaurant', 'brunch_restaurant'])
/** 忌口 → 主力就是踩雷的 lane。只排除 lane（撈池子），個別店家的衝突不在這裡判。 */
const DIET_BLOCK: Record<string, Set<string>> = {
  不吃牛: new Set(['steak_house']),
  不辣: new Set(['thai_restaurant', 'indian_restaurant']),
}

export type NearbyRank = 'POPULARITY' | 'DISTANCE'
export type TextRank = 'DISTANCE' | 'RELEVANCE'
export type LanePlan =
  | { kind: 'nearby'; lane: string; includedTypes: string[]; radius: number; rank: NearbyRank }
  | { kind: 'text'; lane: string; textQuery: string; radius: number; rank: TextRank; openNow?: boolean; restrict?: boolean; priceLevels?: string[] }

/** eat 卡（非甜食、非素）可輪替的 lane。 */
export function mealLanes(choices: Record<string, string | number>, country: Country, hour?: number): Lane[] {
  const block = DIET_BLOCK[String(choices.diet ?? '')]
  return LANES.filter((l) =>
    l.verified
    && !SWEET_GROUPS.has(l.group)
    && (!l.only || l.only === country)
    && !block?.has(l.id)
    && !(hour !== undefined && hour >= 14 && BREAKFAST.has(l.id)),
  )
}

/**
 * 這次第一個 Places 呼叫查什麼。
 * - rest 卡：Text Search（居酒屋、熱炒沒有 type），rankPreference 在 DISTANCE／RELEVANCE 交替。
 * - eat 甜食 → 甜食 lane 組；忌口「素」→ 素食 lane（STRATEGY §2 次要問題：以前素食者會被派去一般餐廳）。
 *   台灣／日本另有關鍵字 lane（甜點、豆花…；素食、蔬食…）一半一半輪替。
 * - 其餘：Nearby 的 type lane 與關鍵字 lane（QUERY_LANES）放在一起，
 *   75% 依細類偏好 Beta 抽樣挑細類、再在細類內均勻挑 lane；25% 所有 lane 均勻隨機。
 *   Nearby 的 rankPreference 在 POPULARITY／DISTANCE 交替；關鍵字在 DISTANCE／RELEVANCE 交替。
 * - 有預算（Round 4）：只走關鍵字 lane（Nearby 沒有價位篩選），只挑推估價位對得上的關鍵字，並帶 priceLevels。
 * hour = 當地小時（14 點後不排早午餐 lane，省得撈回一堆打烊的店、多花第二次呼叫）。
 * - 情境（Round 5，src/scene.ts）：半徑照情境；吃的一般情況只在情境的關鍵字池裡挑（一個人快吃 → 便當、麵店…），
 *   不排 Nearby lane；宵夜第一次就只要營業中；「其他」→ 使用者的字＋基本詞（餐廳／甜點／素食）。
 *   甜食、吃素照原本的 lane，只換半徑。歇：情境改寫「喝什麼」的關鍵字（工作讀書 → 不限時 咖啡廳）。
 * - 去（Round 10 X2，src/go.ts）：交通＋可接受決定半徑，時段決定目的地關鍵字（深夜只要營業中）。
 */
export function pickLane(
  card: Pick<ModuleCard, 'id' | 'intake' | 'placesQuery'>,
  choices: Record<string, string | number>,
  cuisine: CuisineStats | undefined,
  country: Country,
  rng: Rng,
  hour?: number,
  budget?: Band[],
  scene: Scene | null = null,
): LanePlan {
  const radius = scene?.rule.radius ?? card.placesQuery?.radiusByTransport?.default ?? 800
  const tq = card.placesQuery?.textQuery
  if (tq) {
    const fallback = card.intake.find((f) => f.key === tq.key)?.default
    const drink = String(choices[tq.key] ?? '')
    const base0 = tq.byOption[drink] ?? tq.byOption[String(fallback ?? '')]
    const base = base0 ? restBase(base0, country) : base0
    if (base) {
      const q = restQuery(scene, tq.byOption[drink] ? drink : String(fallback ?? ''), base, country)
      // lane id 不放使用者打的字（會進伺服器 log）：有情境就標情境名。
      return { kind: 'text', lane: scene ? `text:${base}@${scene.id}` : `text:${q}`, textQuery: q, radius, rank: rng() < 0.5 ? 'DISTANCE' : 'RELEVANCE' }
    }
  }
  const nearbyRank = (): NearbyRank => (rng() < 0.5 ? 'POPULARITY' : 'DISTANCE')
  const plan = (l: Lane): LanePlan => ({ kind: 'nearby', lane: l.id, includedTypes: l.types, radius, rank: nearbyRank() })
  const levels = priceLevelsFor(budget)
  const openNow = scene?.rule.openNow ? { openNow: true } : {}
  const query = (l: QueryLane): LanePlan => ({
    kind: 'text', lane: queryLaneId(l.q), textQuery: l.q, radius, rank: rng() < 0.5 ? 'DISTANCE' : 'RELEVANCE', restrict: true,
    ...openNow, ...(levels ? { priceLevels: levels } : {}),
  })
  const local = country === 'TW' || country === 'JP' ? country : null

  if (card.id === 'go') return goPlan(goTrip(choices, hour ?? 12), country, rng)
  if (card.id !== 'eat') {
    // 目前只有 eat 用 lane；其他需要 Places 的卡照卡片設定的 type。
    return { kind: 'nearby', lane: (card.placesQuery?.includedTypes ?? ['restaurant']).join('|'), includedTypes: card.placesQuery?.includedTypes ?? ['restaurant'], radius, rank: nearbyRank() }
  }
  if (scene?.id === SCENE_OTHER && scene.text) {
    // 「其他」：使用者自己寫的需求就是關鍵字（第二次 widenPlan 也保留同一個關鍵字）。
    const q = eatOtherQuery(scene.text, choices, country)
    return { kind: 'text', lane: `scene:${SCENE_OTHER}`, textQuery: q, radius, rank: rng() < 0.5 ? 'DISTANCE' : 'RELEVANCE', restrict: true, ...(levels ? { priceLevels: levels } : {}) }
  }
  if (choices.taste === '甜食') {
    if (local && rng() < 0.5) { const qs = SWEET_QUERIES[local]; return query(qs[Math.floor(rng() * qs.length)]!) }
    const sweet = LANES.filter((l) => l.verified && SWEET_GROUPS.has(l.group))
    const all = [SWEET_LANE, ...sweet]
    return plan(all[Math.floor(rng() * all.length)]!)
  }
  if (choices.diet === '素') {
    if (local && rng() < 0.5) { const qs = VEG_QUERIES[local]; return query(qs[Math.floor(rng() * qs.length)]!) }
    return plan(VEG_LANE)
  }

  const diet = String(choices.diet ?? '')
  const late = hour !== undefined && hour >= 14
  const scenePool = local ? scene?.rule.queries?.[local].filter((l) => !l.block?.includes(diet)) : undefined
  const sceneOnly = !!scenePool?.length
  let queries = sceneOnly ? scenePool! : local ? QUERY_LANES[local].filter((l) => !l.block?.includes(diet) && !(late && l.lunchOnly)) : []
  // 有預算：只排推估價位對得上（命中或相鄰）的關鍵字；一個都沒有就不限關鍵字，價位交給 priceLevels 與 pickPlace。
  if (budget?.length && queries.length) {
    const fit = queries.filter((l) => priceFit(l.est, budget) > 0)
    if (fit.length) queries = fit
  }
  type Opt = { group: string; make: () => LanePlan }
  const opts: Opt[] = [
    ...queries.map((l): Opt => ({ group: l.group, make: () => query(l) })),
    // 有預算時不排 Nearby lane：它沒有價位篩選，撈回來的價位未知店最多。
    // 有情境關鍵字池時也不排：Nearby 的 type 分不出「快吃」「聚餐」。
    ...((budget?.length && queries.length) || sceneOnly ? [] : mealLanes(choices, country, hour).map((l): Opt => ({ group: l.group, make: () => plan(l) }))),
  ]
  if (opts.length === 0) return plan(RESTAURANT_LANE)
  if (rng() < 0.75) {
    // 細類 Thompson：每個細類抽一次 Beta(a,b)，取最大；沒有統計的細類當 (1,1)。
    const groups = [...new Set(opts.map((o) => o.group))]
    let best = groups[0]!
    let bestV = -1
    for (const g of groups) {
      const [a, b] = cuisine?.[g] ?? [1, 1]
      const v = betaSample(a, b, rng)
      if (v > bestV) { bestV = v; best = g }
    }
    const inGroup = opts.filter((o) => o.group === best)
    return inGroup[Math.floor(rng() * inGroup.length)]!.make()
  }
  return opts[Math.floor(rng() * opts.length)]!.make()
}

/** 第二次呼叫的通用關鍵字。帶 rng 時輪替（不再每次都是「餐廳＋依距離」那同一批最近的 20 家）。 */
const GENERIC: Record<Country, string[]> = { TW: ['餐廳', '美食', '小吃'], JP: ['レストラン', '食堂', '定食'], other: ['restaurant'] }

/**
 * 第二次呼叫（有效候選 < 5，或第一次失敗）：半徑 ×2.5、換另一種 rankPreference、只要營業中。
 * - rest 的 Text Search：同一個關鍵字。
 * - Nearby 一般 lane、eat 的關鍵字 lane：改 Text Search 通用關鍵字（餐廳／美食／小吃；レストラン…）＋ openNow
 *   （深夜也查得到營業中的店）。帶 rng 就輪替關鍵字與排序；不帶（舊呼叫端）固定「餐廳＋依距離」。
 *   甜食／素食保留自己的 type 或關鍵字（不然會派甜食的人去吃牛排）。
 * - forceRestaurant：第一次回 400（lane 的 type 不被接受）→ 一律退回營業中的餐廳 Text Search。
 * - 預算的 priceLevels 第二次保留（Round 4 實測）；只有 dropPrice（預算內一家都撈不到的後備）才拿掉。
 * - 關鍵字不是 q: 開頭的 Text Search（歇、吃的「其他」）：同一個關鍵字擴大再查一次。
 * - words（Round 5 情境）：一般餐廳的通用關鍵字換成情境自己的（朋友聚餐 → 餐廳／熱炒／火鍋）。
 * - 去（go: 開頭，Round 10）：半徑不放大（使用者選了單程上限）、換通用關鍵字（景點／公園）、只要營業中；400 也不退回餐廳。
 */
export function widenPlan(first: LanePlan, opts: { forceRestaurant?: boolean; country?: Country; rng?: Rng; dropPrice?: boolean; words?: string[] } = {}): LanePlan {
  if (first.lane.startsWith(GO_LANE_PREFIX)) return goWiden(first, opts.country ?? 'TW', opts.rng)
  const radius = Math.round(first.radius * WIDEN_FACTOR)
  const country = opts.country ?? 'TW'
  // Round 4 實測（2026-11-01 內湖 09:00）：第二次不帶 priceLevels → 撈回 20 家最近的平價早餐店，
  // 預算 3、4 檔四次錯三次。有預算就保留 priceLevels；只有「預算內一家都撈不到」的後備（dropPrice）才拿掉。
  const levels = first.kind === 'text' && first.priceLevels && !opts.dropPrice ? { priceLevels: first.priceLevels } : {}
  const generic = (): LanePlan => {
    const words = opts.words?.length && !opts.forceRestaurant ? opts.words : GENERIC[country]
    const word = opts.rng ? words[Math.floor(opts.rng() * words.length)]! : words[0]!
    const rank: TextRank = opts.rng && opts.rng() < 0.5 ? 'RELEVANCE' : 'DISTANCE'
    return { kind: 'text', lane: 'text:open-now', textQuery: word, radius, rank, openNow: true, ...levels }
  }
  // 正式站實測（2026-10-26 深夜，東京站／台北市府）：Nearby 照熱門排序撈回的 20 家幾乎全打烊 → no_places。
  // 第二次一律要求「現在營業中」（Text Search 才有 openNow；Nearby 沒有）。
  if (first.kind === 'text') {
    if (first.lane.startsWith('q:')) {
      const keep = !opts.forceRestaurant && (first.lane in KEEP_QUERY)
      if (!keep) return generic()
      return { kind: 'text', lane: first.lane, textQuery: first.textQuery, radius, rank: first.rank === 'DISTANCE' ? 'RELEVANCE' : 'DISTANCE', openNow: true, ...levels }
    }
    const { priceLevels: _drop, ...rest } = first
    return { ...rest, radius, rank: first.rank === 'DISTANCE' ? 'RELEVANCE' : 'DISTANCE', openNow: true, ...levels }
  }
  const rank: NearbyRank = first.rank === 'POPULARITY' ? 'DISTANCE' : 'POPULARITY'
  const sweet = first.lane === SWEET_LANE.id || LANES.some((l) => l.id === first.lane && SWEET_GROUPS.has(l.group))
  const veg = first.lane === VEG_LANE.id
  const keep = !opts.forceRestaurant && (sweet || veg)
  if (keep) {
    const lane = sweet ? SWEET_LANE : VEG_LANE
    return { kind: 'nearby', lane: lane.id, includedTypes: lane.types, radius, rank }
  }
  // 一般餐廳的廣域後備：Text Search 通用關鍵字 ＋ openNow。
  return generic()
}

/** 甜食、吃素的關鍵字 lane：第二次保留同一個關鍵字（不准退回一般餐廳）。 */
const KEEP_QUERY: Record<string, true> = Object.fromEntries(
  [...SWEET_QUERIES.TW, ...SWEET_QUERIES.JP, ...VEG_QUERIES.TW, ...VEG_QUERIES.JP].map((l) => [queryLaneId(l.q), true]),
)

/**
 * Round 4 第三次（救援）呼叫：前兩次之後一家都派不出去 → 查營業中的便利商店。
 * Cross 2026-09-18：只講類別一律視為失敗、一定要真店；超商是地圖上查得到、24 小時營業的真店，比「查不到」強。
 */
export function rescuePlan(country: Country): LanePlan {
  const q = country === 'JP' ? 'コンビニ' : country === 'TW' ? '便利商店' : 'convenience store'
  // 半徑 3000（Round 4 checker 2026-11-01）：STOP 1「方圓 3 km 內真的沒有營業中的店」才准空手，救援就要查到 3 km。
  return { kind: 'text', lane: 'rescue', textQuery: q, radius: 3000, rank: 'DISTANCE', openNow: true }
}

const VEG_TYPES = new Set(VEG_LANE.types)
// 只認明確的詞（checker 2026-11-01）：單字「素／蔬／齋」會誤中元素、樸素、素描、鮮蔬火鍋、時蔬熱炒、齋藤。
const VEG_NAME = /素食|蔬食|素菜|純素|全素|蛋奶素|奶蛋素|五辛素|齋菜|齋食|斋菜|vegan|vegetarian|veggie|plant[- ]?based|ヴィーガン|ベジタリアン|ベジ料理|精進料理/i

/**
 * 忌口「素」的硬過濾（Round 4 checker 2026-11-01）：關鍵字 Text Search（素食、蔬食…）沒有店家類型限制，
 * 實測板橋「蔬食」撈到壽司關東煮店。只留 Google 類型是素食／純素、或店名看得出是素的店。超商救援不過濾。
 */
export function looksVeg(c: { name: string; primaryType?: string; types?: string[] }): boolean {
  if ([c.primaryType, ...(c.types ?? [])].some((t) => t !== undefined && VEG_TYPES.has(t))) return true
  return VEG_NAME.test(c.name)
}
