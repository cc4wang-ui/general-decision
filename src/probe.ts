// 正式站行為的量測工具（Round 4 #1／#3）。只給 api/probe.ts 用，前端不 import；api/probe.ts 只在 preview 環境運作。
//
// 兩種量法，走的都是正式的 handleOrder（同一份程式，不是另寫一套模擬）：
//   matrix：一個地點 × 一組情境，真 Places、真 Claude，同時打。量「有沒有給解答」「價位資料覆蓋率」「預算命中」。
//   sim   ：一個地點 × N 天 × 每天 2 餐，記憶照前端的規則累積。Places 用真資料但同一個請求只打一次（快取），
//           Claude 換成固定假回應（店由程式決定，Claude 不影響挑哪一家）。量「反覆推同一家」。
// 回傳裡的店名只給人看報表，不寫進 repo（Google 條款：店家資料不落地，R4）。
import { FIELD_MASK, WIDEN_FACTOR, haversineMeters } from './places.ts'
import { geocodeLookup } from './geocode.ts'
import { mealLanes, widenPlan, type LanePlan, type NearbyRank } from './lanes.ts'
import { countryOf } from './price.ts'
import { hourIn, tzOf } from './tz.ts'
import { handleOrder, placesLanguage, placesRequest, type OrderIo } from './orderHandler.ts'
import { SCENE_OTHER, sceneOf, sceneOptions, scenePasses } from './scene.ts'
import { STATION_RE } from './rules.ts'
import type { Band, ModuleId, Order, OrderDebug, OrderRequest, PlaceMemSummary } from './types.ts'

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
  // 不查 Places 的卡：只量 Claude 這一段會不會空手。
  { id: 'go', module: 'go', choices: { transport: '捷運', minutes: '30 分' } },
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
    const needsPlace = s.module === 'eat' || s.module === 'rest'
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
  steps?: string[]
  bot?: string
  ms?: number
}

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
    if (b.place && c && !scenePasses({ primaryType: c.type, rating: c.rating, walkMin: c.walkMin, closeInMin: c.closeIn }, rule)) fails.push(`不符規則（${c.type ?? '?'}／${c.rating ?? '?'}★／${c.walkMin ?? '?'}分／剩 ${c.closeIn ?? '?'} 分關門）`)
    if (rule?.rule.openNow && c?.opensAt) fails.push(`還沒開（${c.opensAt}）`)
    if (scene === SCENE_OTHER && !d?.places?.how.includes(SCENE_TEXT_PROBE[m])) fails.push('關鍵字沒用到手動輸入')
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
