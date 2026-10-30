// 發掘引擎 — DEV-PLAN-3 W1.3、R3§2。店由程式決定，Claude 只負責講（品味原則 T2）。
// 純函式、無 I/O、不碰 Date.now()／Math.random()：同樣的候選＋記憶＋種子 → 同一家店，離線重播與單元測試才重現得了。
//
// 流程（R3§2.2）：
//   1 硬過濾：品質保底 → 不再推薦 → 本次換掉的 → 最近 3 次出過的 → 預算外
//     「任一步剩 < 5 家就放寬該步」：把該步濾掉的店依該步自己的優先順序補回到 5 家，並記進 relaxed。
//     例外：「不再推薦」與「本次換掉的」永遠不放寬——使用者講過不要的店，放寬也不准回來（B3）。
//   2 方針：wildcard（偵察）只在沒見過的店裡挑；全面偵察只留沒見過且非連鎖，不夠 3 家 → exhausted、退回均衡打分。
//   3 打分（log 域）：Thompson 品質抽樣 + 細類偏好 Beta 抽樣 − λ·曝光 + 連鎖 ×0.6 − 步行/25 + 價位適配 + 今天不想吃這類 ×0.5 + 愛店（熟門熟路）×2
//   4 Efraimidis–Spirakis 加權隨機取一家。
import { ratingScore } from './places.ts'
import { effectiveBand, priceFit } from './price.ts'
import type { Band, Country, CuisineStats, Novelty, PickMode, PickResult, PlaceCandidate, PlaceMemSummary } from './types.ts'

// ── 亂數（可重現）──────────────────────────────────────────────────

export type Rng = () => number

/** mulberry32：32-bit 種子 → [0,1) 均勻亂數。夠快、夠均勻，重播 200 個種子不用等。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 標準常態（Box–Muller）。u 取 (0,1] 避免 log(0)。 */
export function gauss(rng: Rng): number {
  const u = 1 - rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gamma(k,1)：Marsaglia–Tsang；k<1 用 Gamma(k+1)·U^(1/k) 補。 */
function gammaSample(k: number, rng: Rng): number {
  if (k < 1) return gammaSample(k + 1, rng) * Math.pow(1 - rng(), 1 / k)
  const d = k - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do { x = gauss(rng); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = 1 - rng()
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v
  }
}

/** Beta(a,b) 抽樣。a、b 不合法時當 (1,1)。 */
export function betaSample(a: number, b: number, rng: Rng): number {
  const A = Number.isFinite(a) && a > 0 ? a : 1
  const B = Number.isFinite(b) && b > 0 ? b : 1
  const x = gammaSample(A, rng)
  const y = gammaSample(B, rng)
  return x + y > 0 ? x / (x + y) : 0.5
}

// ── 細類（我方歸群，不是 Google 內容）──────────────────────────────

export const CUISINE_GROUPS = ['ramen', 'jp', 'tw', 'cn', 'kr', 'western', 'noodle', 'hotpot', 'seafood', 'veg', 'sweet', 'cafe', 'fast', 'other'] as const
export type CuisineGroup = (typeof CUISINE_GROUPS)[number]

const TYPE_GROUP: Record<string, CuisineGroup> = {
  ramen_restaurant: 'ramen',
  japanese_restaurant: 'jp', sushi_restaurant: 'jp', japanese_izakaya_restaurant: 'jp', yakiniku_restaurant: 'jp',
  yakitori_restaurant: 'jp', tonkatsu_restaurant: 'jp', japanese_curry_restaurant: 'jp', udon_noodle_restaurant: 'jp', soba_noodle_shop: 'jp',
  taiwanese_restaurant: 'tw',
  chinese_restaurant: 'cn', dim_sum_restaurant: 'cn', cantonese_restaurant: 'cn',
  korean_restaurant: 'kr', korean_barbecue_restaurant: 'kr',
  italian_restaurant: 'western', american_restaurant: 'western', pizza_restaurant: 'western', steak_house: 'western',
  french_restaurant: 'western', brunch_restaurant: 'western', fine_dining_restaurant: 'western', mediterranean_restaurant: 'western',
  noodle_shop: 'noodle', chinese_noodle_restaurant: 'noodle',
  hot_pot_restaurant: 'hotpot',
  seafood_restaurant: 'seafood',
  vegetarian_restaurant: 'veg', vegan_restaurant: 'veg',
  bakery: 'sweet', ice_cream_shop: 'sweet', dessert_shop: 'sweet', dessert_restaurant: 'sweet', confectionery: 'sweet', donut_shop: 'sweet',
  cafe: 'cafe', coffee_shop: 'cafe', tea_house: 'cafe',
  fast_food_restaurant: 'fast', hamburger_restaurant: 'fast', sandwich_shop: 'fast',
}

/** primaryType 先、types 依序 → 細類鍵；都對不到 → 'other'。 */
export function cuisineOf(primaryType?: string, types?: string[]): CuisineGroup {
  for (const t of [primaryType, ...(types ?? [])]) {
    const g = t ? TYPE_GROUP[t] : undefined
    if (g) return g
  }
  return 'other'
}

// ── 參數（R3§2.4 起始值；只准在 R3§2.4 範圍內調，DEV-PLAN-3 A.3）──────────

export const PARAMS = {
  floor: 3.7, // 貝氏評分保底
  minCount: 5, // 評論數保底
  minPool: 5, // 硬過濾剩幾家以下就放寬
  sigma: 1.0, // Thompson：評論少 → 變異大
  // 半衰期（Team Lead 裁定 2026-10-22，重播校正）：10/21 天會把 7 天重複率壓到 1%、代價是平均評分多掉 0.05；
  // 3/7 天讓 7 天重複率約 7%（門檻 15%），好店回來得比較快。
  halfShownDays: 3, // 曝光半衰期（被出成口令）
  halfDoneDays: 7, // 曝光半衰期（去過）
  T: 0.25, // 溫度（R3 範圍 0.25–0.5）。重播調參：取下限，品質權重最大（擋門的是 oracleGap ≤0.08，見 tests/unit/discovery-replay.test.ts）
  chain: 0.6,
  walkD: 25,
  rejected: 0.5,
  fav: 2,
  cooldown: 3, // 最近幾次出過的店不再出
  reconMin: 3, // 全面偵察：沒見過的非連鎖店少於這個數 → exhausted
  // familiar λ=0.05：Team Lead 裁定接受（R3 修正 S-11／R2-08，2026-10-22）。
  //   計劃起始 0.6 時重播回訪率只有 0.12（門檻 0.35–0.65）；0.05 → 約 0.40。
  //   理由：「熟門熟路」的語意就是不怕回訪，曝光懲罰本來就該接近 0；
  //   連續派同一家仍由 cooldown（最近 3 次出過的店不再出）擋住，不靠 λ。
  //   0.05 低於 R3§2.4 建議範圍下緣，是裁定後的例外，不是調參漂移；balanced／recon 仍在範圍內。
  lambda: { familiar: 0.05, balanced: 0.8, recon: 1.2 } as Record<Novelty, number>,
  wildcard: { familiar: 0, balanced: 0.2, recon: 1 } as Record<Novelty, number>,
}

// ── 曝光 ────────────────────────────────────────────────────────────

const DAY = 86_400_000
const LN2 = Math.LN2

/**
 * Σ exp(−ln2·Δt/半衰期)：被出成口令（shown）半衰期 PARAMS.halfShownDays（目前 3 天）、
 * 去過（done）半衰期 PARAMS.halfDoneDays（目前 7 天）。未來的時間戳當作現在。
 * 打分時乘上 PARAMS.lambda[方針]（familiar 0.05／balanced 0.8／recon 1.2）。
 */
export function exposure(entry: Pick<PlaceMemSummary, 'sh' | 'dn'> | undefined, now: number): number {
  if (!entry) return 0
  let e = 0
  for (const t of entry.sh ?? []) e += Math.exp((-LN2 * Math.max(0, now - t)) / (PARAMS.halfShownDays * DAY))
  for (const t of entry.dn ?? []) e += Math.exp((-LN2 * Math.max(0, now - t)) / (PARAMS.halfDoneDays * DAY))
  return e
}

/** 貝氏評分（同 places.ts ratingScore：先驗 4.0、權重 20 則）。 */
export function bayes(p: Pick<PlaceCandidate, 'rating' | 'ratingCount'>): number {
  return ratingScore(p.rating, p.ratingCount)
}

// ── pickPlace ───────────────────────────────────────────────────────

export interface PickCtx {
  /** ms */
  now: number
  country: Country
  budget?: Band[]
  novelty: Novelty
  exclude: Set<string>
  rejectedCuisines: Set<string>
  /** clusterKeys(cands)：id → 品牌鍵或 'cluster:…'。有鍵 = 連鎖。 */
  clusters: Map<string, string>
  rng: Rng
}

/** PickResult 之外，給除錯畫面與匿名 log 的數字（不含 place_id）。 */
export interface PickOutcome extends PickResult {
  pool: number
  afterFilter: number
  /** 被選的店 14 天內有沒有任何事件（匿名 log 的 seen14d）。 */
  seen14d: boolean
  band: number | null
  bandEst: boolean
  cuisine: CuisineGroup
}

/** 一步硬過濾；剩 < minPool 就照 rank 從被濾掉的補回，並記 relaxed。原本的順序保持不變（亂數消耗順序要穩定）。 */
function stage<T extends { c: PlaceCandidate }>(
  list: T[],
  pass: (x: T) => boolean,
  rank: ((a: T, b: T) => number) | null,
  name: string,
  relaxed: string[],
): T[] {
  const kept = list.filter(pass)
  if (kept.length >= PARAMS.minPool || kept.length === list.length || rank === null) return kept
  const back = new Set(list.filter((x) => !pass(x)).sort(rank).slice(0, PARAMS.minPool - kept.length))
  relaxed.push(name)
  return list.filter((x) => pass(x) || back.has(x))
}

/**
 * 挑一家店。cands 已是「營業中或 60 分內開」（toCandidates）。mem 是前端送的記憶摘要（同模組）。
 * 回 null = 一家都不剩（全被「不再推薦」或「換掉」排除，或 cands 是空的）。
 */
export function pickPlace(
  cands: PlaceCandidate[],
  mem: PlaceMemSummary[] | undefined,
  cuisine: CuisineStats | undefined,
  ctx: PickCtx,
): PickOutcome | null {
  const now = ctx.now
  const rng = ctx.rng
  const memList = mem ?? []
  const memById = new Map(memList.map((m) => [m.id, m]))
  const memByBrand = new Map<string, PlaceMemSummary[]>()
  for (const m of memList) if (m.b) memByBrand.set(m.b, [...(memByBrand.get(m.b) ?? []), m])
  const idsByKey = new Map<string, string[]>()
  for (const c of cands) {
    const k = ctx.clusters.get(c.id)
    if (k) idsByKey.set(k, [...(idsByKey.get(k) ?? []), c.id])
  }

  /** 同品牌／同聚類的記憶一起算（今天摩斯 A 店，明天就不該派摩斯 B 店）。 */
  const merged = (id: string): PlaceMemSummary[] => {
    const out = new Map<string, PlaceMemSummary>()
    const own = memById.get(id)
    if (own) out.set(own.id, own)
    const k = ctx.clusters.get(id)
    if (k) {
      for (const m of memByBrand.get(k) ?? []) out.set(m.id, m)
      for (const other of idsByKey.get(k) ?? []) { const m = memById.get(other); if (m) out.set(m.id, m) }
    }
    return [...out.values()]
  }

  // 最近 3 次被出成口令的店（不分品牌）
  const lastShown = memList
    .flatMap((m) => (m.sh ?? []).map((t) => ({ id: m.id, t })))
    .sort((a, b) => b.t - a.t)
  const cooldown = new Set<string>()
  for (const s of lastShown) { if (cooldown.size >= PARAMS.cooldown) break; cooldown.add(s.id) }
  const lastShownAt = (id: string) => Math.max(0, ...(memById.get(id)?.sh ?? []))

  type Row = { c: PlaceCandidate; i: number; b: number; band: number | null; est: boolean; fit: number; E: number; seen: boolean; chain: boolean; g: CuisineGroup }
  let rows: Row[] = cands.map((c, i) => {
    const ms = merged(c.id)
    // Round 4：Google 沒有價位資料時用推估（關鍵字 lane 或店的類型），不再讓「價位未知」直接過預算關。
    const { band, est } = effectiveBand(c, ctx.country)
    return {
      c, i,
      b: bayes(c),
      band,
      est,
      fit: priceFit(band, ctx.budget),
      E: ms.reduce((s, m) => s + exposure(m, now), 0),
      seen: ms.some((m) => (m.sh?.length ?? 0) > 0 || (m.dn?.length ?? 0) > 0),
      chain: ctx.clusters.has(c.id),
      g: cuisineOf(c.primaryType, c.types),
    }
  })
  const pool = rows.length
  const relaxed: string[] = []

  // 1 硬過濾
  rows = stage(rows, (r) => r.b >= PARAMS.floor && (r.c.ratingCount ?? 0) >= PARAMS.minCount, (a, b) => b.b - a.b, 'floor', relaxed)
  rows = rows.filter((r) => { const x = memById.get(r.c.id)?.x; return !(x === 'forever' || (typeof x === 'number' && x > now)) })
  rows = rows.filter((r) => !ctx.exclude.has(r.c.id))
  rows = stage(rows, (r) => !cooldown.has(r.c.id), (a, b) => lastShownAt(a.c.id) - lastShownAt(b.c.id), 'cooldown', relaxed)
  if (ctx.budget?.length) {
    // Round 4（Cross 2026-10-30「沒辦法按照價格找店」）：只有預算內（Google 資料或推估）才算過。
    // 不夠 5 家才依適配度補回：價位未知（0.5）先於相鄰檔（0.35），再遠的不補（R3§4.4：本區沒這價位不硬塞）。
    rows = stage(rows, (r) => r.fit === 1, (a, b) => b.fit - a.fit, 'price', relaxed)
  }
  if (rows.length === 0) return null
  const afterFilter = rows.length

  // 2 方針
  let novelty = ctx.novelty
  let exhausted = false
  const wild = rng() < PARAMS.wildcard[novelty]
  let wildApplied = false
  if (novelty === 'recon') {
    const fresh = rows.filter((r) => !r.seen && !r.chain)
    if (fresh.length >= PARAMS.reconMin) { rows = fresh; wildApplied = true }
    else { exhausted = true; novelty = 'balanced' }
  } else if (wild) {
    const fresh = rows.filter((r) => !r.seen)
    if (fresh.length >= PARAMS.reconMin) { rows = fresh; wildApplied = true }
  }

  // 3 打分。細類偏好每個細類只抽一次（Thompson：抽的是「這類今天值不值得」，不是每家店各抽）。
  const groupDraw = new Map<string, number>()
  const pcOf = (g: string) => {
    let v = groupDraw.get(g)
    if (v === undefined) {
      const [a, b] = cuisine?.[g] ?? [1, 1]
      v = 0.4 + 0.6 * betaSample(a, b, rng)
      groupDraw.set(g, v)
    }
    return v
  }
  const lam = PARAMS.lambda[novelty]
  const favOn = novelty === 'familiar'
  const score = (r: Row, withPrice: boolean) => {
    const n = r.c.ratingCount ?? 0
    const theta = r.b + (gauss(rng) * PARAMS.sigma) / Math.sqrt(n + 4)
    const q = Math.min(1, Math.max(0, (theta - 3.5) / 1.5))
    let s = Math.log(0.15 + q) + Math.log(pcOf(r.g)) - lam * r.E
    if (r.chain) s += Math.log(PARAMS.chain)
    s -= (r.c.walkMin ?? 10) / PARAMS.walkD
    if (withPrice) s += Math.log(r.fit) // fit 0 → −∞：預算差兩檔以上的店不會被抽到
    if (ctx.rejectedCuisines.has(r.g)) s += Math.log(PARAMS.rejected)
    if (favOn && memById.get(r.c.id)?.fav) s += Math.log(PARAMS.fav)
    return s / PARAMS.T
  }

  // 4 Efraimidis–Spirakis：key = u^(1/w) 取最大。w = exp(s/T) 會溢位，改在 log 域比：
  //   argmax ln(u)/w = argmax [ln w − ln(−ln u)]（與 Gumbel-max 等價）。
  const draw = (withPrice: boolean) => {
    let best: Row | null = null
    let bestKey = -Infinity
    for (const r of rows) {
      const key = score(r, withPrice) - Math.log(-Math.log(1 - rng()))
      if (key > bestKey) { bestKey = key; best = r }
    }
    return best
  }
  let pick = draw(true)
  if (!pick) {
    // 剩下的店全部在預算兩檔外：照樣派一家，但要記下來（口令會講超出預算）。
    relaxed.push('price')
    pick = draw(false) ?? rows[0]!
  }

  const own = memById.get(pick.c.id)
  // 「第 N 次」：dn 只帶最近 ≤5 筆，N 會卡在 6；前端帶 dc（累計完成次數）就用 dc（S-5）。
  // 取 max：正常資料 dc ≥ dn.length，兩者一樣；萬一前端算錯 dc 偏小，也不會比看得到的完成紀錄還少。
  const done = Math.max(own?.dc ?? 0, own?.dn?.length ?? 0)
  const mode: PickMode = done > 0 ? 'revisit' : wildApplied && !pick.seen ? 'wildcard' : 'new'
  const seen14d = merged(pick.c.id).some((m) => [...(m.sh ?? []), ...(m.dn ?? [])].some((t) => now - t <= 14 * DAY))
  const uniq = [...new Set(relaxed)]
  if (uniq.length) console.warn(`[pick] 放寬：${uniq.join('、')}（pool=${pool} kept=${afterFilter}）`)

  return {
    place: pick.c,
    mode,
    visits: done + 1,
    relaxed: uniq,
    exhausted,
    pool,
    afterFilter,
    seen14d,
    band: pick.band,
    bandEst: pick.est,
    cuisine: pick.g,
  }
}
