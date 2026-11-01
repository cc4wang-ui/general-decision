// Vercel Function：手動報地點 → 座標（DEV-PLAN-3 C2）。拒絕定位的人報「台北車站」也拿得到口令。
// 伺服器不存任何東西、log 不記查詢字串與座標（R12）。key 只在這裡存在，前端永遠不碰。
import { GEOCODE_MAX_Q, geocodeLookup } from '../src/geocode.ts'
import type { GeocodeRequest, GeocodeResponse } from '../src/types.ts'

export const config = { runtime: 'nodejs' }

const PLACES_BASE = process.env.PLACES_BASE_URL ?? 'https://places.googleapis.com'
const MAX_Q = GEOCODE_MAX_Q

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let req: GeocodeRequest
  try {
    req = (await request.json()) as GeocodeRequest
  } catch {
    return json({ error: 'bad_request', message: '請求不是合法 JSON' }, 400)
  }
  const q = typeof req?.q === 'string' ? req.q.trim() : ''
  if (!q || q.length > MAX_Q) {
    return json({ error: 'bad_request', message: '報個車站或地標，不要超過 60 個字。' }, 400, { 'x-places-calls': '0' })
  }

  const key = process.env.GOOGLE_PLACES_KEY
  if (!key) {
    console.warn('[geocode] GOOGLE_PLACES_KEY 未設定')
    return json({ error: 'upstream', message: '班長在開會。30 秒後再報告。' }, 502, { 'x-places-calls': '0' })
  }

  // Round 6：查詢本體搬到 src/geocode.ts（跟 preview 量測共用）；日文站名用 ja 查。
  const r = await geocodeLookup(q, key, PLACES_BASE)
  if (r.kind === 'timeout') {
    console.warn('[geocode] fail timeout')
    return json({ error: 'upstream', message: '班長在開會。30 秒後再報告。' }, 502, { 'x-places-calls': '1' })
  }
  if (r.kind === 'http') {
    console.warn(`[geocode] fail ${r.status}`)
    return json({ error: r.status === 429 ? 'rate_limited' : 'upstream', message: '班長在開會。30 秒後再報告。' }, r.status === 429 ? 429 : 502, { 'x-places-calls': '1' })
  }
  if (r.kind === 'not_found') {
    console.info('[geocode] not_found')
    return json({ error: 'not_found', message: '找不到這個地方。報個車站或地標。' }, 404, { 'x-places-calls': '1' })
  }
  console.info('[geocode] ok') // 不記 q、不記座標
  const out: GeocodeResponse = { loc: r.loc, label: r.label }
  return json(out, 200, { 'x-places-calls': '1' })
}

// 同 api/order.ts：函式型的 export default 會被 Vercel 當成舊式 (req, res) => void，
// 回傳值被丟棄、請求掛住（DEV-PLAN-3 §E.2 坑 1）。default 必須是物件形式的 fetch handler。
export function GET(request: Request): Promise<Response> { return handler(request) }
export function POST(request: Request): Promise<Response> { return handler(request) }
export default { fetch: handler }
