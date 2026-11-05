// 正式站行為的量測工具（Round 4 #1／#3）。只給 api/probe.ts 用，前端不 import；api/probe.ts 只在 preview 環境運作。
//
// 兩種量法，走的都是正式的 handleOrder（同一份程式，不是另寫一套模擬）：
//   matrix：一個地點 × 一組情境，真 Places、真 Claude，同時打。量「有沒有給解答」「價位資料覆蓋率」「預算命中」。
//   sim   ：一個地點 × N 天 × 每天 2 餐，記憶照前端的規則累積。Places 用真資料但同一個請求只打一次（快取），
//           Claude 換成固定假回應（店由程式決定，Claude 不影響挑哪一家）。量「反覆推同一家」。
//   scene／geocode：Round 5／6（見各段）。lanes：每條 lane 打一次真 Places（Round 10 X5）。go：四種交通各派一次（Round 10 X2）。
// 回傳裡的店名只給人看報表，不寫進 repo（Google 條款：店家資料不落地，R4）。
import { FIELD_MASK, WIDEN_FACTOR, haversineMeters } from './places.ts'
import { geocodeLookup } from './geocode.ts'
import {
  LANES, QUERY_LANES, RESTAURANT_LANE, SWEET_LANE, SWEET_QUERIES, VEG_LANE, VEG_QUERIES,
  mealLanes, pickLane, queryLaneId, rescuePlan, widenPlan, type LanePlan, type NearbyRank,
} from './lanes.ts'
import { TRANSPORTS, daypartOf, goLanePlans, goRadius, isGoDestination, mentionsTransport, type Daypart, type Minutes, type Transport } from './go.ts'
import { countryOf } from './price.ts'
import { hourIn, tzOf } from './tz.ts'
import { handleOrder, placesLanguage, placesRequest, type OrderIo } from './orderHandler.ts'
import { SCENE_OTHER, localizeNeed, sceneOf, sceneOptions, scenePasses } from './scene.ts'
import { STATION_RE } from './rules.ts'
import { CARD_BY_ID } from './cards.ts'
import type { Band, Country, ModuleId, Order, OrderDebug, OrderRequest, PlaceMemSummary } from './types.ts'

export const PROBE_LOCS: Record<string, { lat: number; lng: number; label: string; station?: string }> = {
  xinyi: { lat: 25.0408, lng: 121.565, label: '台北信義（市府）' },
  neihu: { lat: 25.079, lng: 121.575, label: '台北內湖科學園區' },
  daan: { lat: 25.0265, lng: 121.543, label: '台北大安住宅區' },
  banqiao: { lat: 25.0137, lng: 121.4627, label: '新北板橋' },
  tokyo: { lat: 35.6795, lng: 139.77, label: '東京八重洲' },
  shinjuku: { lat: 35.6896, lng: 139.7006, label: '東京新宿駅', station: '新宿駅' }, // Round 6：當「下車的站」送（loc.label）
}

interface Scenario { id: string; module: ModuleId; choices: Record<string, string>; budget?: Band[] }

const EAT = { diet: '都可以', taste: '都可以' }
export const SCENARIOS: Scenario[] = [
  { id: 'eat', module: 'eat', choices: EAT },
  { id: 'eat-sweet', module: 'eat', choices: { ...EAT, taste: '甜食' } },
  { id: 'eat-salty', module: 'eat', choices: { ...EAT, taste: '鹹食' } },
  { id: 'eat-veg', module: 'eat', choices: { ...EAT, diet: '素' } },
  { id: 'eat-nobeef', module: 'eat', choices: { ...EAT, diet: '不吃牛' } },
  { id: 'eat-nospicy', module: 'eat', choices: { ...EAT, diet: '不辣' } },
  { id: 'eat-b1', module: 'eat', choices: EAT, budget: [1] },
  { id: 'eat-b2', module: 'eat', choices: EAT, budget: [2] },
  { id: 'eat-b3', module: 'eat', choices: EAT, budget: [3] },
  { id: 'eat-b4', module: 'eat', choices: EAT, budget: [4] },
  { id: 'rest-coffee', module: 'rest', choices: { drink: '咖啡' } },
  { id: 'rest-bar', module: 'rest', choices: { drink: '酒吧' } },
  { id: 'rest-izakaya', module: 'rest', choices: { drink: '居酒屋' } },
  { id: 'rest-bbq', module: 'rest', choices: { drink: '熱炒燒烤' } },
  // Round 10 X2：去也查真地點（沒派到地點算失敗）。
  { id: 'go', module: 'go', choices: { transport: '捷運', minutes: '30 分' } },
  // 不查 Places 的卡：只量 Claude 這一段會不會空手。
  { id: 'attend', module: 'attend', choices: { occasion: '飯局', stars: '4' } },
  { id: 'sleep', module: 'sleep', choices: { wake: '07:30' } },
  { id: 'reply', module: 'reply', choices: { target: '同事' } },
  { id: 'buy', module: 'buy', choices: { amount: '500–1,500' } },
]

type Body = Order & { debug?: OrderDebug; error?: string; message?: string }

const post = (body: Partial<OrderRequest>) =>
  new Request('http://probe.local/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** 被派的店（x.5 = 跨兩檔）有沒有落在預算內。null = 價位未知。 */
function budgetHit(band: number | null | undefined, wanted: Band[] | undefined): 'hit' | 'miss' | 'unknown' | null {
  if (!wanted?.length) return null
  if (band === null || band === undefined) return 'unknown'
  const covered = Number.isInteger(band) ? [band] : [Math.floor(band), Math.ceil(band)]
  return covered.some((b) => wanted.includes(b as Band)) ? 'hit' : 'miss'
}

export interface MatrixRow {
  id: string
  status: number
  ok: boolean
  error?: string
  message?: string
  picked?: string
  priceText?: string
  band?: number | null
  budget?: Band[]
  fit: 'hit' | 'miss' | 'unknown' | null
  priceKnown?: number
  candidates?: number
  how?: string
  relaxed?: string[]
  forced?: boolean
  retry?: string
  ms?: number
}

/** 一個地點把整組情境同時打一次（真 Places、真 Claude）。now 預設現在。 */
export async function runMatrix(locKey: string, now = new Date(), io?: OrderIo): Promise<{ loc: string; localHour: number; rows: MatrixRow[]; summary: Record<string, unknown> }> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const rows = await Promise.all(SCENARIOS.map(async (s): Promise<MatrixRow> => {
    const t = Date.now()
    const res = await handleOrder(post({
      module: s.module, level: 1, choices: s.choices, loc: { lat: loc.lat, lng: loc.lng }, now: now.toISOString(), recentOrders: [],
      ...(s.budget ? { budget: s.budget } : {}),
      ...(s.module === 'eat' || s.module === 'rest' ? { novelty: 'balanced' as const } : {}),
    }), io)
    const b = (await res.json().catch(() => ({}))) as Body
    const d = b.debug
    const picked = d?.places?.candidates.find((c) => c.name === b.place?.name)
    const needsPlace = CARD_BY_ID[s.module].needsPlaces
    return {
      id: s.id,
      status: res.status,
      ok: res.status === 200 && (!needsPlace || !!b.place?.id),
      ...(b.error ? { error: b.error, message: b.message } : {}),
      ...(b.place ? { picked: b.place.name, priceText: b.place.priceText, band: picked?.band ?? b.place.band ?? null } : {}),
      ...(s.budget ? { budget: s.budget } : {}),
      fit: b.place ? budgetHit(picked?.band ?? b.place.band, s.budget) : s.budget ? 'miss' : null,
      ...(d?.price ? { priceKnown: d.price.known, candidates: d.price.total } : {}),
      ...(d?.places ? { how: d.places.how } : {}),
      ...(d?.pick?.relaxed?.length ? { relaxed: d.pick.relaxed } : {}),
      ...(d?.forced ? { forced: true } : {}),
      ...(d?.retry ? { retry: d.retry } : {}),
      ms: Date.now() - t,
    }
  }))
  const placeRows = rows.filter((r) => r.id.startsWith('eat') || r.id.startsWith('rest'))
  const budgetRows = rows.filter((r) => r.budget)
  const known = placeRows.reduce((s, r) => s + (r.priceKnown ?? 0), 0)
  const total = placeRows.reduce((s, r) => s + (r.candidates ?? 0), 0)
  return {
    loc: loc.label,
    localHour: hourIn(now, tzOf(loc)),
    rows,
    summary: {
      scenarios: rows.length,
      ok: rows.filter((r) => r.ok).length,
      failed: rows.filter((r) => !r.ok).map((r) => `${r.id}:${r.error ?? r.status}`),
      priceCoverage: total ? +(known / total).toFixed(2) : null,
      budgetHit: budgetRows.filter((r) => r.fit === 'hit').length,
      budgetUnknown: budgetRows.filter((r) => r.fit === 'unknown').length,
      budgetMiss: budgetRows.filter((r) => r.fit === 'miss').length,
      maxMs: Math.max(...rows.map((r) => r.ms ?? 0)),
    },
  }
}

// ── scene（Round 5）：每一種情境 × 一個地點，真 Places、真 Claude ─────────────

/** 「其他」量測用的手動輸入（常見、Google 查得到的那種）。 */
export const SCENE_TEXT_PROBE = { eat: '吃到飽', rest: '有插座' } as const

export interface SceneRow {
  id: string
  module: 'eat' | 'rest'
  scene: string
  status: number
  ok: boolean
  /** 派到的店符合情境的規則（排除速食、評分、步行；宵夜要營業中；不是超商救援）。 */
  pass: boolean
  why?: string
  error?: string
  picked?: string
  type?: string
  rating?: number
  walkMin?: number
  distM?: number
  radiusM?: number
  opensAt?: string
  closeIn?: number
  how?: string
  dbg?: OrderDebug['scene']
  /** Round 11：附近沒有一家過評分，派的是走得到的店裡最高分的（規則本身的放寬）。 */
  ratingRelaxed?: boolean
  /** Round 11：約會的全部候選（量測腳本重算用）。 */
  cands?: Array<{ name: string; type?: string; rating?: number; walkMin?: number; closeIn?: number; opensAt?: string; types?: string[] }>
  /** Round 14：主類別是外帶店的候選與完整 types。 */
  takeaways?: Array<{ name: string; types: string[] }>
  steps?: string[]
  bot?: string
  ms?: number
}

type DbgCand = NonNullable<OrderDebug['places']>['candidates'][number]
const asCand = (x: DbgCand) => ({ name: x.name, primaryType: x.type, rating: x.rating, walkMin: x.walkMin, closeInMin: x.closeIn, opensAt: x.opensAt, opensInMin: x.opensIn })

/** 一個地點把吃、歇的每一種情境同時打一次。歇一律「咖啡」（情境修飾詞主要加在咖啡）。 */
export async function runSceneMatrix(locKey: string, now = new Date(), io?: OrderIo): Promise<{ loc: string; localHour: number; rows: SceneRow[]; summary: Record<string, unknown> }> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const cases = (['eat', 'rest'] as const).flatMap((m) => sceneOptions(m).map((scene) => ({ m, scene })))
  const rows = await Promise.all(cases.map(async ({ m, scene }): Promise<SceneRow> => {
    const t = Date.now()
    const choices: Record<string, string> = m === 'eat' ? { scene, diet: '都可以', taste: '都可以' } : { scene, drink: '咖啡' }
    if (scene === SCENE_OTHER) choices.sceneText = SCENE_TEXT_PROBE[m]
    const res = await handleOrder(post({
      module: m, level: 1, choices, loc: { lat: loc.lat, lng: loc.lng, ...(loc.station ? { label: loc.station } : {}) }, now: now.toISOString(), recentOrders: [], novelty: 'balanced',
    }), io)
    const b = (await res.json().catch(() => ({}))) as Body
    const d = b.debug
    const c = d?.places?.candidates.find((x) => x.name === b.place?.name)
    const rule = sceneOf(m, choices)
    const fails: string[] = []
    if (!b.place?.id) fails.push('沒派店')
    if (d?.rescue) fails.push('超商救援')
    const all = (d?.places?.candidates ?? []).map(asCand)
    let ratingRelaxed = false
    if (b.place && c && !scenePasses(asCand(c), rule)) {
      // Round 11：附近沒有一家過評分時，派「走得到的店裡評分最高的」（差 0.2★ 內）是規則本身（sceneFilter 只放寬評分），不算錯。
      const soft = rule?.rule.minRating !== undefined ? { ...rule, rule: { ...rule.rule, minRating: undefined } } : null
      const softPool = soft ? all.filter((x) => scenePasses(x, soft)) : []
      const best = Math.max(0, ...softPool.map((x) => x.rating ?? 0))
      if (soft && !all.some((x) => scenePasses(x, rule)) && scenePasses(asCand(c), soft) && (c.rating ?? 0) >= best - 0.2) ratingRelaxed = true
      else fails.push(`不符規則（${c.type ?? '?'}／${c.rating ?? '?'}★／${c.walkMin ?? '?'}分／剩 ${c.closeIn ?? '?'} 分關門）`)
    }
    if (rule?.rule.openNow && c?.opensAt) fails.push(`還沒開（${c.opensAt}）`)
    // Round 10：日本會把手打的中文需求換成日文（localizeNeed），查詞裡要看到的是換過的字。
    if (scene === SCENE_OTHER && !d?.places?.how.includes(localizeNeed(SCENE_TEXT_PROBE[m], countryOf(loc)))) fails.push('關鍵字沒用到手動輸入')
    // Round 6 checker：店離起點要 ≤ 情境半徑（第二次查詢用擴大後的半徑）；報了站，口令第一步要從出站寫起。
    const widened = (d?.places?.how.split('→').length ?? 1) > 1
    const radiusM = rule ? Math.round(rule.rule.radius * (widened ? WIDEN_FACTOR : 1)) : undefined
    if (c?.distM !== undefined && radiusM !== undefined && !d?.rescue && c.distM > radiusM) fails.push(`超出半徑（${c.distM} m > ${radiusM} m）`)
    if (loc.station && b.place?.id && !(b.steps ?? []).some((s) => STATION_RE.test(s) || s.includes(loc.station!))) fails.push('口令沒從出站寫起')
    return {
      id: `${m}:${scene}`, module: m, scene, status: res.status, ok: res.status === 200 && !!b.place?.id,
      pass: fails.length === 0, ...(fails.length ? { why: fails.join('；') } : {}),
      ...(b.error ? { error: b.error } : {}),
      ...(b.place ? { picked: b.place.name } : {}),
      ...(c ? { type: c.type, rating: c.rating, walkMin: c.walkMin, ...(c.distM !== undefined ? { distM: c.distM } : {}), ...(radiusM !== undefined ? { radiusM } : {}), ...(c.opensAt ? { opensAt: c.opensAt } : {}), ...(c.closeIn !== undefined ? { closeIn: c.closeIn } : {}) } : {}),
      ...(d?.places ? { how: d.places.how } : {}),
      ...(d?.scene ? { dbg: d.scene } : {}),
      ...(ratingRelaxed ? { ratingRelaxed: true } : {}),
      // Round 11：約會附上全部候選，給量測整理腳本自己重算「15 分內最高分」（不靠 scene.ts）。
      ...(scene === '約會吃好一點' && d?.places ? { cands: d.places.candidates.map((x) => ({ name: x.name, type: x.type, rating: x.rating, walkMin: x.walkMin, ...(x.closeIn !== undefined ? { closeIn: x.closeIn } : {}), ...(x.opensAt ? { opensAt: x.opensAt } : {}), ...(x.types ? { types: x.types } : {}) })) } : {}),
      // Round 14：每一格都列出主類別是外帶店的候選與完整 types（量「其實能坐下吃」的判斷規則用）。
      ...(d?.places?.candidates.some((x) => x.types) ? { takeaways: d.places.candidates.filter((x) => x.types).map((x) => ({ name: x.name, types: x.types! })) } : {}),
      ...(b.steps ? { steps: b.steps, bot: b.meme?.bot } : {}),
      ms: Date.now() - t,
    }
  }))
  return {
    loc: loc.label,
    localHour: hourIn(now, tzOf(loc)),
    rows,
    summary: {
      scenarios: rows.length,
      ok: rows.filter((r) => r.ok).length,
      pass: rows.filter((r) => r.pass).length,
      failed: rows.filter((r) => !r.pass).map((r) => `${r.id}:${r.why ?? r.error ?? r.status}`),
      maxMs: Math.max(...rows.map((r) => r.ms ?? 0)),
    },
  }
}

// ── sim ──────────────────────────────────────────────────────────────

const DAY = 86_400_000
/** 假的 Claude 回應：格式合法即可；店名會被 withPlace 覆寫成程式挑的那家。 */
const FAKE_ORDER = JSON.stringify({
  verdict: 'do',
  meme: { top: '班長下令', big: '就這家', bot: '不准挑' },
  steps: ['走過去。', '點招牌那一道。', '20 分鐘內吃完。'],
  place: { id: 'x', name: '就這家' },
  log: '模擬',
})

interface SimMem { id: string; sh: number[]; dn: number[]; b?: string }

/** 跟 src/placeMem.ts memSummary 同一個形狀：新到舊，每種事件最多 5 筆，dc＝累計完成次數。 */
function summarize(mem: Map<string, SimMem>): PlaceMemSummary[] {
  return [...mem.values()]
    .sort((a, b) => Math.max(b.sh[0] ?? 0, b.dn[0] ?? 0) - Math.max(a.sh[0] ?? 0, a.dn[0] ?? 0))
    .slice(0, 200)
    .map((m) => ({ id: m.id, sh: m.sh.slice(0, 5), dn: m.dn.slice(0, 5), dc: m.dn.length, ...(m.b ? { b: m.b } : {}) }))
}

/** Places 快取（同 url+body 只真打一次）＋ Claude 假回應。misses = 真的打出去的 Places 次數。 */
export function cachingIo(real: typeof fetch = (i, n) => fetch(i, n)): OrderIo & { misses: () => number } {
  const cache = new Map<string, Promise<{ status: number; text: string }>>()
  let misses = 0
  return {
    misses: () => misses,
    fetch: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('anthropic')) {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: FAKE_ORDER }], usage: { output_tokens: 0 } }), { status: 200 })
      }
      const key = `${url}|${String(init?.body ?? '')}`
      let hit = cache.get(key)
      if (!hit) {
        misses++
        // 快取的 fetch 不帶呼叫端的 AbortSignal：預抓與後面重用的是同一個 promise。
        hit = real(input, { ...init, signal: AbortSignal.timeout(15_000) }).then(async (r) => ({ status: r.status, text: await r.text() }))
        cache.set(key, hit)
      }
      const c = await hit
      return new Response(c.text, { status: c.status })
    },
  }
}

/** 預抓：把這次模擬可能用到的 lane（兩種排序、加上第二次的廣域查法）一次同時打完，後面的模擬就全走快取。 */
async function prefetch(io: OrderIo, loc: { lat: number; lng: number }, choices: Record<string, string>, hours: number[]): Promise<void> {
  const country = countryOf(loc)
  const lang = placesLanguage(country)
  const plans = new Map<string, LanePlan>()
  for (const h of new Set(hours)) {
    for (const l of mealLanes(choices, country, h)) {
      for (const rank of ['POPULARITY', 'DISTANCE'] as NearbyRank[]) {
        const p: LanePlan = { kind: 'nearby', lane: l.id, includedTypes: l.types, radius: 800, rank }
        for (const q of [p, widenPlan(p, { country }), widenPlan(p, { country, forceRestaurant: true })]) {
          const { body } = placesRequest(loc, q, lang)
          plans.set(body, q)
        }
      }
    }
  }
  const key = process.env.GOOGLE_PLACES_KEY ?? ''
  await Promise.all([...plans.values()].map((p) => {
    const { url, body } = placesRequest(loc, p, lang)
    return io.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK }, body }).catch(() => undefined)
  }))
}

export interface SimResult {
  loc: string
  days: number
  meals: number
  ok: number
  errors: Record<string, number>
  distinct: number
  distinctFirst30d: number
  /** 這一餐的店在前 7 天內出現過的比例。 */
  repeat7d: number
  /** 出現次數最多的 3 家占全部餐數的比例。 */
  top3Share: number
  /** 最常出現的 5 家與次數（店名只給人看）。 */
  top5: { name: string; n: number }[]
  secondCallRate: number
  avgWalkMin: number
  placesCalls: number
}

/**
 * N 天 × 每天 2 餐（現在、+6 小時），每一餐都當作「去了」（markShown＋markDone，同前端）。
 * 營業狀態是 Places 回傳當下的（模擬期間不變），所以這量的是「池子夠不夠大、挑法會不會繞回同一家」，不量深夜。
 */
export async function runSim(locKey: string, opts: { days?: number; seed?: number; choices?: Record<string, string>; budget?: Band[]; start?: Date; io?: OrderIo & { misses: () => number } } = {}): Promise<SimResult> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const days = Math.min(90, Math.max(1, opts.days ?? 60))
  const seed = opts.seed ?? 1
  const choices = opts.choices ?? EAT
  const io = opts.io ?? cachingIo()
  const t0 = (opts.start ?? new Date()).getTime()
  const slots: number[] = []
  for (let d = 0; d < days; d++) slots.push(t0 + d * DAY, t0 + d * DAY + 6 * 3600_000)
  const tz = tzOf(loc)
  await prefetch(io, loc, choices, slots.map((t) => hourIn(new Date(t), tz)))

  const mem = new Map<string, SimMem>()
  const served: { id: string; name: string; t: number }[] = []
  const errors: Record<string, number> = {}
  let second = 0
  let walk = 0
  for (let i = 0; i < slots.length; i++) {
    const t = slots[i]!
    const res = await handleOrder(post({
      module: 'eat', level: 1, choices, loc: { lat: loc.lat, lng: loc.lng }, now: new Date(t).toISOString(), recentOrders: [],
      novelty: 'balanced', mem: summarize(mem), seed: seed * 100_000 + i, ...(opts.budget ? { budget: opts.budget } : {}),
    }), io)
    const b = (await res.json().catch(() => ({}))) as Body
    if (res.status !== 200 || !b.place?.id) { errors[b.error ?? String(res.status)] = (errors[b.error ?? String(res.status)] ?? 0) + 1; continue }
    if (b.debug?.places?.how.includes('→')) second++
    walk += b.place.walkMin ?? 0
    served.push({ id: b.place.id, name: b.place.name, t })
    const m = mem.get(b.place.id) ?? { id: b.place.id, sh: [], dn: [], ...(b.place.brand ? { b: b.place.brand } : {}) }
    m.sh.unshift(t)
    m.dn.unshift(t + 3600_000)
    mem.set(b.place.id, m)
  }

  const count = new Map<string, { name: string; n: number }>()
  for (const s of served) count.set(s.id, { name: s.name, n: (count.get(s.id)?.n ?? 0) + 1 })
  const ranked = [...count.values()].sort((a, b) => b.n - a.n)
  let rep = 0
  for (let i = 0; i < served.length; i++) {
    const s = served[i]!
    if (served.slice(0, i).some((p) => p.id === s.id && s.t - p.t <= 7 * DAY)) rep++
  }
  const n = served.length || 1
  return {
    loc: loc.label,
    days,
    meals: slots.length,
    ok: served.length,
    errors,
    distinct: count.size,
    distinctFirst30d: new Set(served.filter((s) => s.t - t0 < 30 * DAY).map((s) => s.id)).size,
    repeat7d: +(rep / n).toFixed(3),
    top3Share: +(ranked.slice(0, 3).reduce((s, r) => s + r.n, 0) / n).toFixed(3),
    top5: ranked.slice(0, 5),
    secondCallRate: +(second / n).toFixed(2),
    avgWalkMin: +(walk / n).toFixed(1),
    placesCalls: io.misses(),
  }
}

// ── Round 6：手動報站（mode=geocode）──────────────────────────────────────
// 10 個東京常用站的日文站名 → /api/geocode 同一份查詢 → 跟參考座標比距離。參考座標是車站中心的公開座標（約略值）。
export const STATIONS: { q: string; lat: number; lng: number }[] = [
  { q: '新宿駅', lat: 35.6896, lng: 139.7006 },
  { q: '東京駅', lat: 35.6812, lng: 139.7671 },
  { q: '渋谷駅', lat: 35.658, lng: 139.7016 },
  { q: '池袋駅', lat: 35.7295, lng: 139.7109 },
  { q: '品川駅', lat: 35.6284, lng: 139.7387 },
  { q: '上野駅', lat: 35.7141, lng: 139.7774 },
  { q: '秋葉原駅', lat: 35.6984, lng: 139.7731 },
  { q: '銀座駅', lat: 35.6717, lng: 139.764 },
  { q: '六本木駅', lat: 35.6627, lng: 139.7313 },
  { q: '恵比寿駅', lat: 35.6467, lng: 139.7101 },
]
export const GEOCODE_PASS_M = 300

export interface GeocodeRow { q: string; kind: string; label?: string; distM?: number; pass: boolean; ms: number }
export interface GeocodeResult { rows: GeocodeRow[]; summary: { stations: number; pass: number; failed: string[]; maxDistM: number; placesCalls: number } }

export async function runGeocodeProbe(opts: { fetchFn?: typeof fetch; key?: string; base?: string } = {}): Promise<GeocodeResult> {
  const key = opts.key ?? process.env.GOOGLE_PLACES_KEY
  if (!key) throw new Error('GOOGLE_PLACES_KEY 未設定')
  const base = opts.base ?? process.env.PLACES_BASE_URL ?? 'https://places.googleapis.com'
  const rows = await Promise.all(STATIONS.map(async (st): Promise<GeocodeRow> => {
    const t0 = Date.now()
    const r = await geocodeLookup(st.q, key, base, opts.fetchFn ?? fetch)
    const ms = Date.now() - t0
    if (r.kind !== 'ok') return { q: st.q, kind: r.kind, pass: false, ms }
    const distM = Math.round(haversineMeters(st, r.loc))
    return { q: st.q, kind: 'ok', label: r.label, distM, pass: distM <= GEOCODE_PASS_M, ms }
  }))
  const failed = rows.filter((r) => !r.pass).map((r) => `${r.q}:${r.kind === 'ok' ? `${r.distM} m` : r.kind}`)
  return { rows, summary: { stations: rows.length, pass: rows.filter((r) => r.pass).length, failed, maxDistM: Math.max(0, ...rows.map((r) => r.distM ?? 0)), placesCalls: rows.length } }
}

// ── Round 10 X5：mode=lanes（每條 lane 用真 Places 打一次）────────────────
// src/lanes.ts 會查的每一條 lane：Nearby 的 type lane（含 verified:false）、吃的關鍵字 lane、吃的情境關鍵字、歇的關鍵字、
// 超商救援，加上 src/go.ts 的去 lane。請求本體跟正式查詢同一份（placesRequest），只把 fieldMask 縮成 places.id：
// 不拿店家資料（回傳只有狀態與筆數），也是最便宜的計價。回 400 的那條要維持（或改成）verified:false；
// verified:false 而且 200 的列在 flip，由 Team Lead／Cross 決定要不要翻成 true。

export interface LaneProbeRow { lane: string; kind: 'nearby' | 'text'; query: string; status: number; raw: number; verified?: boolean; note?: string; ms: number }
export interface LaneProbeResult {
  loc: string
  country: Country
  rows: LaneProbeRow[]
  summary: { lanes: number; ok: number; bad400: string[]; failed: string[]; empty: string[]; flip: string[]; placesCalls: number }
}

/** 這個國家要實測的所有 lane 查法。同一個 lane id 只打一次（「素食」同時在吃的關鍵字與吃素的關鍵字裡）。 */
export function lanePlansFor(country: Country): { plan: LanePlan; verified?: boolean }[] {
  const nearby = [...LANES.filter((l) => !l.only || l.only === country), RESTAURANT_LANE, SWEET_LANE, VEG_LANE]
    .map((l) => ({ plan: { kind: 'nearby', lane: l.id, includedTypes: l.types, radius: 800, rank: 'POPULARITY' } as LanePlan, verified: l.verified }))
  const local = country === 'TW' || country === 'JP' ? country : null
  const sceneQs = local ? sceneOptions('eat').flatMap((id) => sceneOf('eat', { scene: id })?.rule.queries?.[local] ?? []) : []
  const words = local ? [...QUERY_LANES[local], ...SWEET_QUERIES[local], ...VEG_QUERIES[local], ...sceneQs].map((l) => l.q) : []
  const eatText = words.map((q) => ({ plan: { kind: 'text', lane: queryLaneId(q), textQuery: q, radius: 800, rank: 'RELEVANCE', restrict: true } as LanePlan }))
  // 歇：每個「喝什麼」照正式的 pickLane 組（日本會換成日文關鍵字）。
  const restText = Object.keys(CARD_BY_ID.rest.placesQuery?.textQuery?.byOption ?? {})
    .map((drink) => ({ plan: pickLane(CARD_BY_ID.rest, { drink }, undefined, country, () => 0.9) }))
  const go = goLanePlans(country).map((plan) => ({ plan }))
  const seen = new Set<string>()
  return [...nearby, ...eatText, ...restText, ...go, { plan: rescuePlan(country) }].filter(({ plan }) => {
    if (seen.has(plan.lane)) return false
    seen.add(plan.lane)
    return true
  })
}

/** 一個地點把所有 lane 各打一次（同時最多 6 個）。fetchFn／key 只給測試換。 */
export async function runLaneProbe(locKey: string, opts: { fetchFn?: typeof fetch; key?: string } = {}): Promise<LaneProbeResult> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const key = opts.key ?? process.env.GOOGLE_PLACES_KEY
  if (!key) throw new Error('GOOGLE_PLACES_KEY 未設定')
  const fetchFn = opts.fetchFn ?? fetch
  const country = countryOf(loc)
  const lang = placesLanguage(country)
  const plans = lanePlansFor(country)
  const one = async ({ plan, verified }: { plan: LanePlan; verified?: boolean }): Promise<LaneProbeRow> => {
    const { url, body } = placesRequest(loc, plan, lang)
    const t0 = Date.now()
    let status = 0
    let raw = -1
    let note = ''
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      status = res.status
      if (res.ok) raw = (((await res.json()) as { places?: unknown[] }).places ?? []).length
      else note = (await res.text()).replace(/\s+/g, ' ').slice(0, 160)
    } catch (e) {
      note = String((e as Error)?.message ?? e)
    }
    return {
      lane: plan.lane, kind: plan.kind, query: plan.kind === 'text' ? plan.textQuery : plan.includedTypes.join('|'), status, raw,
      ...(verified !== undefined ? { verified } : {}), ...(note ? { note } : {}), ms: Date.now() - t0,
    }
  }
  const rows: LaneProbeRow[] = new Array(plans.length)
  let next = 0
  const worker = async () => { while (next < plans.length) { const i = next++; rows[i] = await one(plans[i]!) } }
  await Promise.all(Array.from({ length: Math.min(6, plans.length) }, worker))
  return {
    loc: loc.label,
    country,
    rows,
    summary: {
      lanes: rows.length,
      ok: rows.filter((r) => r.status === 200).length,
      bad400: rows.filter((r) => r.status === 400).map((r) => r.lane),
      failed: rows.filter((r) => r.status !== 200 && r.status !== 400).map((r) => `${r.lane}:${r.status || r.note}`),
      empty: rows.filter((r) => r.status === 200 && r.raw === 0).map((r) => r.lane),
      flip: rows.filter((r) => r.verified === false && r.status === 200).map((r) => r.lane),
      placesCalls: rows.length,
    },
  }
}

// ── Round 10 X2：mode=go（四種交通各派一次）────────────────────────────
// 一個地點 × 走路／捷運／計程車／開車，同一個「可接受」、同一個種子（關鍵字與排序一樣，只差交通），走正式 handleOrder：
// 真 Places、真 Claude。回派到的地點、type、距離、半徑、查詢指紋。pass＝有派到、不是超商救援、距離 ≤ 半徑、
// 是能去的地方（不是吃喝／車站）、深夜沒有還沒開的、口令寫到選的交通、搭車的不給步行分鐘。

export interface GoProbeRow {
  transport: Transport
  minutes: Minutes
  status: number
  ok: boolean
  pass: boolean
  why?: string
  error?: string
  picked?: string
  type?: string
  distM?: number
  radiusM: number
  walkMin?: number
  opensAt?: string
  closeIn?: number
  /** 第一次查詢的指紋：關鍵字＋排序＋半徑。四種交通要互不相同。 */
  fingerprint?: string
  how?: string
  steps?: string[]
  ms: number
}

export async function runGoProbe(
  locKey: string,
  opts: { minutes?: Minutes; now?: Date; io?: OrderIo; seed?: number } = {},
): Promise<{ loc: string; localHour: number; part: Daypart; minutes: Minutes; seed: number; rows: GoProbeRow[]; summary: Record<string, unknown> }> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const minutes = opts.minutes ?? 30
  const now = opts.now ?? new Date()
  const seed = opts.seed ?? ((Math.random() * 2 ** 32) >>> 0)
  const localHour = hourIn(now, tzOf(loc))
  const part = daypartOf(localHour)
  const rows = await Promise.all(TRANSPORTS.map(async (transport): Promise<GoProbeRow> => {
    const t = Date.now()
    const res = await handleOrder(post({
      module: 'go', level: 1, choices: { transport, minutes: `${minutes} 分` }, loc: { lat: loc.lat, lng: loc.lng },
      now: now.toISOString(), recentOrders: [], seed,
    }), opts.io)
    const b = (await res.json().catch(() => ({}))) as Body
    const d = b.debug
    const c = d?.places?.candidates.find((x) => x.name === b.place?.name)
    const radiusM = goRadius(transport, minutes)
    const first = d?.places?.how.split(' → ')[0]
    const fingerprint = first !== undefined && d?.places?.tries[0] ? `${first} r=${d.places.tries[0].r}` : undefined
    const fails: string[] = []
    if (!b.place?.id) fails.push('沒派地點')
    if (d?.rescue) fails.push('超商救援')
    if (c && !d?.rescue) {
      if (c.distM !== undefined && c.distM > radiusM) fails.push(`超出半徑（${c.distM} m > ${radiusM} m）`)
      if (!isGoDestination(c.type)) fails.push(`不是能去的地方（${c.type}）`)
      if (part === 'late' && c.opensAt) fails.push(`深夜派到還沒開的（${c.opensAt} 開）`)
    }
    if (b.place?.id && !mentionsTransport(b.steps ?? [], transport)) fails.push('口令沒寫到選的交通')
    if (transport !== '走路' && b.place?.walkMin !== undefined) fails.push('搭車卻給步行分鐘')
    return {
      transport, minutes, status: res.status, ok: res.status === 200 && !!b.place?.id,
      pass: fails.length === 0, ...(fails.length ? { why: fails.join('；') } : {}),
      ...(b.error ? { error: b.error } : {}),
      ...(b.place ? { picked: b.place.name } : {}),
      ...(c ? { type: c.type, ...(c.distM !== undefined ? { distM: c.distM } : {}), ...(c.opensAt ? { opensAt: c.opensAt } : {}), ...(c.closeIn !== undefined ? { closeIn: c.closeIn } : {}) } : {}),
      radiusM,
      ...(b.place?.walkMin !== undefined ? { walkMin: b.place.walkMin } : {}),
      ...(fingerprint ? { fingerprint } : {}),
      ...(d?.places ? { how: d.places.how } : {}),
      ...(b.steps ? { steps: b.steps } : {}),
      ms: Date.now() - t,
    }
  }))
  return {
    loc: loc.label, localHour, part, minutes, seed, rows,
    summary: {
      transports: rows.length,
      ok: rows.filter((r) => r.ok).length,
      pass: rows.filter((r) => r.pass).length,
      distinctFingerprints: new Set(rows.map((r) => r.fingerprint).filter(Boolean)).size,
      failed: rows.filter((r) => !r.pass).map((r) => `${r.transport}:${r.why ?? r.error ?? r.status}`),
      maxMs: Math.max(...rows.map((r) => r.ms)),
    },
  }
}

// ── Round 14：mode=takeaway（被標成外帶店、其實能坐下吃的店）────────────────
// 用約會、朋友聚餐會查的關鍵字（含放大時的通用關鍵字）各打一次 Text Search，只拿店名與類型
// （fieldMask 不含評分、營業時間＝較便宜的計價），列出主類別或 types 裡有 meal_takeaway 的店與完整 types。

export interface TakeawayProbeRow { name: string; primaryType?: string; types: string[]; queries: string[] }
export interface TakeawayProbeResult { loc: string; country: Country; queries: { q: string; status: number; raw: number }[]; rows: TakeawayProbeRow[] }

export async function runTakeawayProbe(locKey: string, opts: { fetchFn?: typeof fetch; key?: string } = {}): Promise<TakeawayProbeResult> {
  const loc = PROBE_LOCS[locKey]
  if (!loc) throw new Error(`未知地點 ${locKey}`)
  const key = opts.key ?? process.env.GOOGLE_PLACES_KEY
  if (!key) throw new Error('GOOGLE_PLACES_KEY 未設定')
  const fetchFn = opts.fetchFn ?? fetch
  const country = countryOf(loc)
  const local = country === 'TW' || country === 'JP' ? country : null
  const lang = placesLanguage(country)
  const words = new Set<string>()
  for (const id of ['約會吃好一點', '朋友聚餐']) {
    const rule = sceneOf('eat', { scene: id })?.rule
    if (!rule || !local) continue
    for (const q of rule.queries?.[local] ?? []) words.add(q.q)
    for (const w of rule.widen?.[local] ?? []) words.add(w)
  }
  const queries: TakeawayProbeResult['queries'] = []
  const byName = new Map<string, TakeawayProbeRow>()
  for (const q of words) {
    const { url, body } = placesRequest(loc, { kind: 'text', lane: `takeaway:${q}`, textQuery: q, radius: 1200, rank: 'RELEVANCE', restrict: true } as LanePlan, lang)
    let status = 0
    let raw = 0
    try {
      const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.types' }, body, signal: AbortSignal.timeout(10_000) })
      status = res.status
      const places = res.ok ? (((await res.json()) as { places?: { displayName?: { text?: string }; primaryType?: string; types?: string[] }[] }).places ?? []) : []
      raw = places.length
      for (const p of places) {
        const types = p.types ?? []
        if (p.primaryType !== 'meal_takeaway' && !types.includes('meal_takeaway')) continue
        const name = p.displayName?.text ?? '?'
        const row = byName.get(name) ?? { name, ...(p.primaryType ? { primaryType: p.primaryType } : {}), types, queries: [] }
        row.queries.push(q)
        byName.set(name, row)
      }
    } catch { /* status 0 */ }
    queries.push({ q, status, raw })
  }
  return { loc: loc.label, country, queries, rows: [...byName.values()] }
}
