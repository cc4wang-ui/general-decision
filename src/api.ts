// 呼叫 /api/order、/api/weekly；重試與錯誤分類（第 4、11 節）。
import { DAILY_PLACES_CAP } from './places.ts'
import { recordDebug } from './debug.ts'
import { fromDebug, recordTrial } from './trial.ts'
import type { GeocodeResponse, Order, OrderDebug, OrderRequest, WeeklyReport, WeeklyRequest } from './types.ts'

export type ApiErrorKind =
  'offline' | 'rate_limited' | 'upstream' | 'bad_request' | 'no_location' | 'no_places' | 'places_down' | 'not_found' | 'over_cap'

export class ApiError extends Error {
  kind: ApiErrorKind
  /** 伺服器在錯誤回應裡附的除錯資料（有的話）。 */
  debug?: OrderDebug
  constructor(kind: ApiErrorKind, message: string, debug?: OrderDebug) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.debug = debug
  }
}

/** 第 11 節：每種情況都有畫面文字，班長口吻，不空白。 */
export const ERROR_TEXT: Record<ApiErrorKind, { line: string; sub?: string }> = {
  offline: { line: '沒訊號。原地站好，有訊號再報告。', sub: '日記還是看得到，那是存在你手機裡的。' },
  rate_limited: { line: '班長在開會。30 秒後再報告。' },
  upstream: { line: '班長在開會。30 秒後再報告。' },
  bad_request: { line: '這個口令班長聽不懂。回報告。' },
  // 2026-09-18：吃／歇一定要點真店。沒定位、附近沒開著的店 → 直接說，不用類別糊過去。
  no_location: { line: '不報座標，班長就點不了店。開定位再報告。' },
  no_places: { line: '方圓 3 公里內查不到營業中的店，連超商都沒有。換個地方再報告。' },
  // Round 4 checker（2026-11-01）：地圖服務掛掉或沒查完，不能說成「附近沒店」。試用紀錄也要分得出來。
  places_down: { line: '地圖服務暫時連不上，班長沒查完。30 秒後再報告。' },
  // Round 3 C2：手動報座標查不到。
  not_found: { line: '找不到這個地方。報個車站或地標。' },
  // 每日 Places 呼叫上限（含手動報座標換來的那一次）用完：不是沒定位，不能叫人去開定位。
  over_cap: { line: '今天的偵察額度用完了。明天再報告。' },
}

export const GEO_DENIED_LINE = '不報座標？行，班長用常識。'

// ── Places 每日呼叫上限（第 8 節：記在本機，超過就不帶定位）──────────
const CAP_KEY = 'decide.placesCalls'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function placesCallsToday(): number {
  try {
    const raw = localStorage.getItem(CAP_KEY)
    if (!raw) return 0
    const { date, n } = JSON.parse(raw) as { date: string; n: number }
    return date === today() ? n : 0
  } catch { return 0 }
}

function addPlacesCalls(n: number): void {
  if (n <= 0) return
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ date: today(), n: placesCallsToday() + n }))
  } catch { /* 忽略 */ }
}

/** 超過上限就不送定位，讓伺服器依第 7 節規則 6 降級。 */
export function underPlacesCap(): boolean {
  return placesCallsToday() < DAILY_PLACES_CAP
}

// ── 定位 ─────────────────────────────────────────────────────────
export interface GeoResult {
  loc?: { lat: number; lng: number }
  denied: boolean
}

export function getLocation(timeoutMs = 6000): Promise<GeoResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ denied: true })
  }
  return new Promise((resolve) => {
    let settled = false
    const done = (r: GeoResult) => { if (!settled) { settled = true; resolve(r) } }
    navigator.geolocation.getCurrentPosition(
      (p) => done({ loc: { lat: p.coords.latitude, lng: p.coords.longitude }, denied: false }),
      () => done({ denied: true }),
      { timeout: timeoutMs, maximumAge: 120_000, enableHighAccuracy: false },
    )
    setTimeout(() => done({ denied: true }), timeoutMs + 500)
  })
}

// ── 呼叫 ─────────────────────────────────────────────────────────
async function post<T>(path: string, body: unknown): Promise<{ data: T; res: Response }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('offline', ERROR_TEXT.offline.line)
  }
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('offline', ERROR_TEXT.offline.line)
  }
  if (!res.ok) {
    let code = ''
    let debug: OrderDebug | undefined
    try {
      const body = (await res.json()) as { error?: string; debug?: OrderDebug }
      code = String(body.error ?? '')
      debug = body.debug
    } catch { /* 沒 body 就看狀態碼 */ }
    const kind: ApiErrorKind =
      code === 'no_location' || code === 'no_places' || code === 'places_down' || code === 'not_found' ? code
      : res.status === 429 ? 'rate_limited' : res.status === 400 ? 'bad_request' : 'upstream'
    throw new ApiError(kind, ERROR_TEXT[kind].line, debug)
  }
  try {
    return { data: (await res.json()) as T, res }
  } catch {
    throw new ApiError('upstream', ERROR_TEXT.upstream.line)
  }
}

/**
 * 伺服器回的 body 是 Order + 一個 debug 欄位。debug 在這裡就剝掉，
 * 只進除錯紀錄，不跟著 Order 進畫面與日記。失敗也記一筆——「為什麼沒出口令」才是最需要查的。
 */
export async function requestOrder(req: OrderRequest): Promise<Order> {
  // Round 4 試用紀錄：每一道（成功、失敗）都記一筆，不含店名（src/trial.ts）。
  const base = { module: req.module, level: req.level, choices: req.choices, ...(req.budget?.length ? { budget: req.budget } : {}) }
  try {
    const { data, res } = await post<Order & { debug?: OrderDebug }>('/api/order', req)
    const calls = Number(res.headers.get('x-places-calls') ?? 0)
    addPlacesCalls(calls)
    const { debug, ...order } = data
    if (debug) recordDebug(debug)
    const p = (order as Order).place
    recordTrial({
      ...base, ok: true, calls, ...fromDebug(debug),
      ...(p ? { placeId: p.id, mode: p.mode, band: p.band ?? null, ...(p.priceEst ? { priceEst: true } : {}) } : {}),
    })
    return order as Order
  } catch (e) {
    if (e instanceof ApiError) {
      recordDebug(e.debug ?? { module: req.module, level: req.level, error: e.kind })
      recordTrial({ ...base, ok: false, error: e.kind, ...fromDebug(e.debug) })
    }
    throw e
  }
}

export async function requestWeekly(body: WeeklyRequest): Promise<WeeklyReport> {
  const { data } = await post<WeeklyReport>('/api/weekly', body)
  return data
}

/** C2：沒有定位時手動報地點。伺服器用 Text Search 換座標，不落地；前端也不存。 */
export async function requestGeocode(q: string): Promise<GeocodeResponse> {
  const { data, res } = await post<GeocodeResponse>('/api/geocode', { q })
  // geocode 也是一次 Places 呼叫（Text Search），一樣計入每日上限。
  addPlacesCalls(Number(res.headers.get('x-places-calls') ?? 0))
  return data
}
