// /api/order 的實作（Vercel 入口是 api/order.ts 的薄殼）：定位+卡片+選項 → Places(可選) → 發掘引擎挑店 → Claude 寫口令 → Order JSON（第 4、8、11 節；DEV-PLAN-3 W1.7）。
// key 只在這裡存在，前端永遠不碰。
// Round 3：店由 src/discovery.ts pickPlace 決定（T2），Claude 只看得到那一家；每次 ≤ 2 次 Places 呼叫、不並行。
import { CARD_BY_ID } from './cards.ts'
import { buildOrderPrompt } from './prompt.ts'
import { parseOrder, ParseError } from './orderParse.ts'
import { enforceRules, isNonAnswer } from './rules.ts'
import { FETCH_COUNT, FIELD_MASK, matchPlace, mergeCandidates, placeMapUrl, toCandidates, type RawPlace } from './places.ts'
import { pickLane, widenPlan, type LanePlan } from './lanes.ts'
import { cuisineOf, mulberry32, pickPlace, type PickOutcome } from './discovery.ts'
import { bandOf, countryOf, currencyCountry, priceText } from './price.ts'
import { brandKeyOf, clusterKeys } from './chains.ts'
import { hourIn, tzOf } from './tz.ts'
import type { Band, Country, CuisineStats, Order, OrderDebug, OrderRequest, PickResult, PlaceCandidate, PlaceMemSummary } from './types.ts'

// 口令走 Haiku 4.5：正式站 [timing] 量到 Claude 佔 3.1–6.4s、等於整段伺服器時間，
// 換模型是唯一還能砍掉一半以上的手段。要退回 Sonnet 不用改碼，設 ORDER_MODEL=claude-sonnet-5 重新部署即可。
// 語氣與規則的保證在 enforceRules() 與 localizeOrder()，不靠模型本身。
const MODEL = process.env.ORDER_MODEL ?? 'claude-haiku-4-5'
// base URL 可用環境變數覆蓋：本機煙霧測試與公司 proxy 都用得到。正式環境不設就是官方端點。
const ANTHROPIC_URL = `${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`
const PLACES_BASE = process.env.PLACES_BASE_URL ?? 'https://places.googleapis.com'
const PLACES_URL = { nearby: `${PLACES_BASE}/v1/places:searchNearby`, text: `${PLACES_BASE}/v1/places:searchText` }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })

/** 有效候選少於這個數就發第二次 Places（DEV-PLAN-3 W1.7）。 */
const MIN_VALID = 5

// ── 入口清洗（R3 修正 S-4）──────────────────────────────────────────
const MAX_MEM = 200
const MAX_EVENTS = 20
const MAX_ID = 256
const MAX_EXCLUDE = 50
const MAX_REJECTED = 20
const MAX_RECENT = 50
const MAX_CUISINE = 50

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const shortStr = (v: unknown, max = MAX_ID): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
/** 字串陣列：不是陣列 → []；只留非空短字串、截長度。 */
const strList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((s) => shortStr(s)).slice(0, max) : [])

function cleanMem(v: unknown): PlaceMemSummary[] {
  if (!Array.isArray(v)) return []
  const out: PlaceMemSummary[] = []
  // R3R-2：截到 200 筆時，封鎖（x）與愛店（fav）優先保留——「不要再來」的店不能因為記憶太長被擠掉。
  const head = v.slice(0, MAX_MEM * 5)
  const keep = (m: unknown) => isRecord(m) && (m.x !== undefined || m.fav === true)
  const ordered = [...head.filter(keep), ...head.filter((m) => !keep(m))]
  for (const m of ordered.slice(0, MAX_MEM)) {
    if (!isRecord(m) || !shortStr(m.id)) continue
    const nums = (a: unknown) => (Array.isArray(a) ? a.filter(finite).slice(0, MAX_EVENTS) : [])
    const e: PlaceMemSummary = { id: m.id, sh: nums(m.sh), dn: nums(m.dn) }
    if (m.x === 'forever' || finite(m.x)) e.x = m.x
    if (typeof m.dc === 'number' && Number.isSafeInteger(m.dc) && m.dc >= 0) e.dc = m.dc
    if (m.fav === true) e.fav = true
    if (shortStr(m.b, 64)) e.b = m.b
    out.push(e)
  }
  return out
}

function cleanCuisine(v: unknown): CuisineStats | undefined {
  if (!isRecord(v)) return undefined
  // Object.fromEntries 建的是自有屬性：鍵是 "__proto__" 也不會改到原型。
  const entries = Object.entries(v)
    .filter((kv): kv is [string, [number, number]] => kv[0].length <= 64 && Array.isArray(kv[1]) && kv[1].length === 2 && finite(kv[1][0]) && finite(kv[1][1]))
    .slice(0, MAX_CUISINE)
    .map(([k, [a, b]]) => [k, [a, b]] as [string, [number, number]])
  return Object.fromEntries(entries)
}

function cleanBudget(v: unknown): Band[] | undefined {
  if (!Array.isArray(v)) return undefined
  const bands = [...new Set(v.filter((b): b is Band => Number.isInteger(b) && b >= 1 && b <= 4))].sort((a, b) => a - b)
  return bands.length ? bands : undefined
}

/**
 * 前端送什麼都不信：形狀不對的欄位收斂成安全預設，不讓後面 pickPlace／prompt 炸掉或吃到怪值。
 * now 不可解析在呼叫端就回 400（這裡只補缺省）。mem／exclude 只當 id 比對，不記 log。
 */
export function sanitizeRequest(raw: OrderRequest): OrderRequest {
  const r = raw as unknown as Record<string, unknown>
  const loc = isRecord(r.loc) && finite(r.loc.lat) && finite(r.loc.lng) ? { lat: r.loc.lat, lng: r.loc.lng } : undefined
  const choices: Record<string, string | number> = {}
  if (isRecord(r.choices)) for (const [k, v] of Object.entries(r.choices)) if (typeof v === 'string' || finite(v)) choices[k] = v
  const recentOrders = Array.isArray(r.recentOrders)
    ? (r.recentOrders as unknown[]).filter((o): o is OrderRequest['recentOrders'][number] => isRecord(o) && typeof o.module === 'string' && typeof o.big === 'string' && typeof o.at === 'string').slice(0, MAX_RECENT)
    : []
  const novelty = r.novelty === 'familiar' || r.novelty === 'balanced' || r.novelty === 'recon' ? r.novelty : 'balanced'
  const out: OrderRequest = {
    module: raw.module,
    level: r.level === 0 || r.level === 1 || r.level === 2 ? r.level : 1,
    choices,
    now: typeof r.now === 'string' && r.now ? r.now : new Date().toISOString(),
    exclude: strList(r.exclude, MAX_EXCLUDE),
    recentOrders,
    novelty,
    mem: cleanMem(r.mem),
    rejectedCuisines: strList(r.rejectedCuisines, MAX_REJECTED),
  }
  if (loc) out.loc = loc
  const budget = cleanBudget(r.budget)
  if (budget) out.budget = budget
  const cuisine = cleanCuisine(r.cuisine)
  if (cuisine) out.cuisine = cuisine
  if (finite(r.seed)) out.seed = r.seed
  return out
}

/**
 * 對外 I/O 只有 fetch（Places 與 Claude）。正式入口一律用預設的全域 fetch；
 * api/probe.ts（只在 preview 運作）換成「Places 快取＋Claude 假回應」跑 60 天模擬，不必真的打 120 次。
 */
export interface OrderIo { fetch: typeof fetch }
const defaultIo: OrderIo = { fetch: (input, init) => fetch(input, init) }

export async function handleOrder(request: Request, io: OrderIo = defaultIo): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let req: OrderRequest
  try {
    req = (await request.json()) as OrderRequest
  } catch {
    return json({ error: 'bad_request', message: '請求不是合法 JSON' }, 400)
  }
  if (!req || typeof req !== 'object' || Array.isArray(req) || typeof req.module !== 'string' || !Object.hasOwn(CARD_BY_ID, req.module)) {
    return json({ error: 'bad_request', message: '未知的模組' }, 400)
  }
  // 入口清洗（R3 修正 S-4）：在任何 Places／Claude 呼叫之前，把前端送來的欄位收斂成合法形狀。
  if (req.now !== undefined && req.now !== null && req.now !== '' && (typeof req.now !== 'string' || Number.isNaN(Date.parse(req.now)))) {
    return json({ error: 'bad_request', message: '時間格式不對' }, 400)
  }
  req = sanitizeRequest(req)

  const card = CARD_BY_ID[req.module]
  const now = new Date(req.now)
  // 除錯紀錄：整趟的真實數字，跟著回應送回前端存進手機（src/debug.ts）。
  // Vercel 免費方案的 log 保存期太短，事後回報就查不到了；這份跟著手機走。不含 place_id、不含座標。
  const dbg: OrderDebug = { module: req.module, level: req.level }
  // 國家與時區看座標，不看手機語系（B2）；店家價位幣別在拿到候選後再校正一次。
  let country: Country = countryOf(req.loc)
  const tz = tzOf(req.loc)
  // 固定種子只給測試／重播；正式前端不帶 → 每次隨機。
  const seed = Number.isFinite(req.seed) ? (req.seed! >>> 0) : (Math.random() * 2 ** 32) >>> 0
  const rng = mulberry32(seed)

  // ── Places（eat / rest 必須有真店；沒有就是失敗，不再用類別降級）──────
  // Cross 2026-09-18：只講「甜點店／小吃店」一律視為禁止；必須是地圖上正在營業或即將營業的真店。
  const t0 = Date.now()
  let placesMs = 0
  let placesCalled = 0
  let pick: PickOutcome | null = null
  if (card.needsPlaces) {
    if (!req.loc) {
      dbg.error = 'no_location'
      return json({ error: 'no_location', message: '不報座標，班長就點不了店。開定位再報告。', debug: dbg }, 400)
    }
    const first = pickLane(card, req.choices ?? {}, req.cuisine, country, rng, hourIn(now, tz))
    const tries: { r: number; raw: number; kept: number }[] = []
    const hows: string[] = []
    let cands: PlaceCandidate[] = []
    // 一次一次來，不並行；總共最多兩次（第一次 lane，不夠 5 家或失敗才第二次）。
    let plan: LanePlan | null = first
    let firstStatus = 0
    for (let call = 0; call < 2 && plan; call++) {
      const how = plan.kind === 'text' ? `text="${plan.textQuery}" rank=${plan.rank}` : `lane=${plan.lane} rank=${plan.rank}`
      hows.push(how)
      placesCalled++
      try {
        const raw = await fetchPlaces(io, req.loc, plan, placesLanguage(countryOf(req.loc)))
        const got = toCandidates(raw, req.loc, now, req.exclude ?? [], tz).map((c) => ({ ...c, lane: plan!.lane }))
        cands = mergeCandidates(cands, got)
        tries.push({ r: plan.radius, raw: raw.length, kept: got.length })
        console.info(`[places] ok ${how} r=${plan.radius} raw=${raw.length} candidates=${got.length}`)
      } catch (e) {
        if (call === 0) firstStatus = (e as PlacesError).status ?? 0
        tries.push({ r: plan.radius, raw: -1, kept: 0 }) // raw=-1：這一次整個查失敗
        console.warn(`[places] fail ${how} r=${plan.radius}：${(e as Error).message}`)
      }
      // 第二次：有效候選 < 5（或第一次失敗）→ 半徑 ×2.5、只要營業中（Text Search openNow）；lane 回 400 → 退回營業中的餐廳。
      plan = call === 0 && cands.length < MIN_VALID ? widenPlan(first, { forceRestaurant: firstStatus === 400, country }) : null
    }
    placesMs = Date.now() - t0
    country = cands.map((c) => currencyCountry(c.priceRange?.currency)).find(Boolean) ?? country
    dbg.places = {
      how: hows.join(' → '),
      tries,
      candidates: cands.map((p) => ({ name: p.name, rating: p.rating, count: p.ratingCount, walkMin: p.walkMin, openUntil: p.openUntil, opensAt: p.opensAt, band: bandOf(p, country) })),
    }
    dbg.price = { country, known: cands.filter((c) => bandOf(c, country) !== null).length, total: cands.length }
    if (cands.length) {
      pick = pickPlace(cands, req.mem, req.cuisine, {
        now: now.getTime(),
        country,
        budget: req.budget,
        novelty: req.novelty ?? 'balanced',
        exclude: new Set(req.exclude ?? []),
        rejectedCuisines: new Set(req.rejectedCuisines ?? []),
        clusters: clusterKeys(cands),
        rng,
      })
    }
    if (!pick) {
      dbg.error = 'no_places'
      dbg.ms = { places: placesMs, claude: 0, total: Date.now() - t0 }
      return json(
        { error: 'no_places', message: '附近查不到營業中的店。換個地方再報告。', debug: dbg },
        502,
        { 'x-places-calls': String(placesCalled), 'x-timing': `places=${placesMs};claude=0` },
      )
    }
    dbg.pick = { mode: pick.mode, lane: pick.place.lane ?? first.lane, pool: pick.pool, afterFilter: pick.afterFilter, relaxed: pick.relaxed, exhausted: pick.exhausted, seed }
    // 匿名一行（R12）：不記 place_id、不記座標、不記店名。第一週拿來量價位覆蓋率（R3§4.3）。
    console.info(`[pick] module=${req.module} mode=${pick.mode} lane=${dbg.pick.lane} pool=${pick.pool} kept=${pick.afterFilter} known_price=${(dbg.price.known / Math.max(1, dbg.price.total)).toFixed(2)} country=${country} seen14d=${pick.seen14d} relaxed=${pick.relaxed.join('|') || '-'}`)
  }

  // ── Claude ────────────────────────────────────────────────────
  const { system, user } = buildOrderPrompt(req, pick, country)
  try {
    const t1 = Date.now()
    let { text, outputTokens } = await callClaude(io, system, user, 600)
    let parsed = parseOrder(text)
    // 推掉不答（「大事不受理／去找連長」）→ 重打一次，把問題指名。不吐口令是不被允許的（Cross 2026-09-18）。
    if (isNonAnswer(parsed)) {
      dbg.retry = 'nonanswer'
      console.warn(`[retry] module=${req.module} nonanswer，重打一次`)
      const retry = await callClaude(io, system, `${user}\n\n上一次你回了「大事不受理／去找連長」。這是小事，不准推。重來，必須給可執行口令，verdict 用 "do"。`, 600)
      text = retry.text
      outputTokens += retry.outputTokens
      parsed = parseOrder(text)
      if (isNonAnswer(parsed)) throw upstream(502, '模型兩次都不給口令')
    }
    // 模型寫了別家店（或只講類別）→ 不重打，enforceRules 直接覆寫成 pick 的那家（T2）。
    if (pick && !matchPlace(parsed.place, [pick.place])) {
      dbg.forced = pick.place.name
      console.warn(`[place] forced module=${req.module}：模型沒照【店已決定】寫，已覆寫`)
    }
    const claudeMs = Date.now() - t1
    // 加速方案第一步是量：每一次都留一行，Vercel log 直接看時間花在哪、模型吐了幾個 token。
    console.info(`[timing] places=${placesMs}ms claude=${claudeMs}ms total=${Date.now() - t0}ms model=${MODEL} out=${outputTokens} module=${req.module} level=${req.level}`)
    const order = enforceRules(parsed, req.module, req.choices ?? {}, now, req.recentOrders, { level: req.level, country, pick })
    const final = withPlace(order, pick, country)
    dbg.model = MODEL
    dbg.outTokens = outputTokens
    dbg.ms = { places: placesMs, claude: claudeMs, total: Date.now() - t0 }
    dbg.picked = final.place?.name
    // debug 是 Order 以外的欄位，前端收到就剝掉，不會進日記（src/api.ts requestOrder）。
    return json({ ...final, debug: dbg }, 200, {
      'x-places-calls': String(placesCalled),
      'x-timing': `places=${placesMs};claude=${claudeMs};model=${MODEL}`,
    })
  } catch (e) {
    const status = e instanceof ParseError ? 502 : (e as UpstreamError)?.status ?? 502
    dbg.error = status === 429 ? 'rate_limited' : 'upstream'
    dbg.ms = { places: placesMs, claude: Date.now() - t0 - placesMs, total: Date.now() - t0 }
    return json(
      { error: dbg.error, message: '班長在開會。30 秒後再報告。', debug: dbg },
      status === 429 ? 429 : 502,
      { 'x-places-calls': String(placesCalled) },
    )
  }
}

/**
 * 伺服器決定的店 → Order.place（也只在這裡用真 place id 組 Google Maps 連結，階段 B）。
 * 模型寫的 place 不管寫什麼都不採用；pick 為 null（不需要 Places 的卡）→ 原樣回傳、不得產生 mapUrl。
 * 模型自己寫的 mapUrl 已在 enforceRules() 被丟掉。Round 3 欄位（mode／visits／band／priceText…）只在這裡填。
 * brand 只放我方字典鍵（不放 'cluster:店名前綴'：那是店名片段，前端記憶不准存店名，R3§3.3）。
 */
export function withPlace(order: Order, pick: PickResult | null, country: Country): Order {
  if (!pick) return order
  const p = pick.place
  const place: NonNullable<Order['place']> = { id: p.id, name: p.name }
  if (p.walkMin !== undefined) place.walkMin = p.walkMin
  if (p.openUntil !== undefined) place.openUntil = p.openUntil
  if (p.opensAt !== undefined) place.opensAt = p.opensAt
  place.mapUrl = placeMapUrl(p.id, p.name)
  place.mode = pick.mode
  place.visits = pick.visits
  const band = bandOf(p, country)
  place.band = band === null ? null : (Math.min(4, Math.max(1, Math.round(band))) as 1 | 2 | 3 | 4)
  const text = priceText(p, country)
  if (text) place.priceText = text
  place.country = country
  place.cuisine = cuisineOf(p.primaryType, p.types)
  const brand = brandKeyOf(p.name)
  if (brand) place.brand = brand
  if (pick.exhausted) place.exhausted = true
  return { ...order, place }
}

/** Places 回非 2xx：帶狀態碼，400 要退回 restaurant lane。 */
interface PlacesError extends Error { status?: number }

interface UpstreamError extends Error { status?: number }

function upstream(status: number, msg: string): UpstreamError {
  const e = new Error(msg) as UpstreamError
  e.status = status
  return e
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 第 11 節：429/5xx 重試 2 次（1s、3s）。 */
async function callClaude(io: OrderIo, system: string, user: string, maxTokens: number): Promise<{ text: string; outputTokens: number }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw upstream(500, 'ANTHROPIC_API_KEY 未設定')

  const delays = [1000, 3000]
  let last: UpstreamError = upstream(502, 'unknown')
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let res: Response
    try {
      res = await io.fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      last = upstream(504, 'Claude 逾時')
      if (attempt < delays.length) { await sleep(delays[attempt]!); continue }
      throw last
    }

    if (res.ok) {
      const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { output_tokens?: number } }
      const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (!text) throw upstream(502, 'Claude 回空內容')
      return { text, outputTokens: data.usage?.output_tokens ?? -1 }
    }

    // 4xx（除了 429）是永久錯，不重試
    if (res.status !== 429 && res.status < 500) throw upstream(res.status, `Claude ${res.status}`)
    last = upstream(res.status, `Claude ${res.status}`)
    if (attempt < delays.length) await sleep(delays[attempt]!)
  }
  throw last
}

/**
 * 店名語言（STRATEGY H6，2026-10-26 正式站實測證實）：在日本用 zh-TW 查，Google 沒有中文名就回英文拼音
 * （「Toriichizu Yurakucho」），跟招牌「鳥一途」對不上，人站在店門口找不到。日本座標改用 ja，招牌寫什麼就叫什麼；
 * 班長台詞仍是台灣繁中（prompt 與 localizeOrder 不變）。
 */
export function placesLanguage(country: Country): string {
  return country === 'JP' ? 'ja' : 'zh-TW'
}

/** 一個 LanePlan → Places 請求（url＋body）。fetchPlaces 與 api/probe.ts 的預抓共用，兩邊的快取鍵才會一致。 */
export function placesRequest(loc: { lat: number; lng: number }, plan: LanePlan, languageCode = 'zh-TW'): { url: string; body: string } {
  const circle = { center: { latitude: loc.lat, longitude: loc.lng }, radius: plan.radius }
  // 第一次不用 openNow：「60 分內開門」的店也要留（篩選在 toCandidates）；第二次（widenPlan）才要求營業中。
  const body = JSON.stringify(
    plan.kind === 'text'
      ? { textQuery: plan.textQuery, pageSize: FETCH_COUNT, rankPreference: plan.rank, languageCode, locationBias: { circle }, ...(plan.openNow ? { openNow: true } : {}) }
      : { includedTypes: plan.includedTypes, maxResultCount: FETCH_COUNT, rankPreference: plan.rank, languageCode, locationRestriction: { circle } },
  )
  return { url: PLACES_URL[plan.kind], body }
}

/**
 * 第 8 節：一個 LanePlan 打一次 Places。Round 3 起**不在這裡重試**：第二次呼叫就是重試（總共 ≤ 2 次，DEV-PLAN-3 W1.7）。
 * Nearby 照 lane 的 type 查；Text Search 用中文關鍵字（居酒屋、熱炒沒有 type），locationBias 圓。
 * 兩者同一組 fieldMask、同一個 SKU。languageCode 台灣用 zh-TW、日本用 ja（placesLanguage）；
 * 日本的店名要不要改 ja 待實測（H6），先記在 debug 的 country。
 */
async function fetchPlaces(io: OrderIo, loc: { lat: number; lng: number }, plan: LanePlan, languageCode = 'zh-TW'): Promise<RawPlace[]> {
  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) throw new Error('GOOGLE_PLACES_KEY 未設定')

  const { url, body } = placesRequest(loc, plan, languageCode)
  let res: Response
  try {
    res = await io.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new Error('Places 逾時')
  }
  if (!res.ok) throw Object.assign(new Error(`Places ${res.status}`), { status: res.status }) as PlacesError
  const data = (await res.json()) as { places?: RawPlace[] }
  return data.places ?? []
}
