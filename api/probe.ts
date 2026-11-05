// Vercel Function：/api/probe —— Round 4 量測工具，**只在 preview 部署運作**（正式站一律 404）。
// preview 有 Vercel 登入保護（ssoProtection），外人打不到；仍會用真的 Places／Claude 金鑰，每次呼叫都花錢。
//   GET /api/probe?mode=matrix&loc=xinyi
//   GET /api/probe?mode=sim&loc=xinyi&days=60&seed=1[&budget=2]
//   GET /api/probe?mode=scene&loc=xinyi（Round 5：吃、歇每一種情境各一次）
//   GET /api/probe?mode=geocode（Round 6：10 個日文站名 → 座標，對參考座標量誤差）
//   GET /api/probe?mode=lanes&loc=xinyi（Round 10 X5：每條 lane 打一次真 Places，回 HTTP 狀態與筆數）
//   GET /api/probe?mode=takeaway&loc=shinjuku（Round 14：約會／聚餐關鍵字查到的外帶店與完整 types）
//   GET /api/probe?mode=go&loc=xinyi[&minutes=15|30|60][&seed=1]（Round 10 X2：四種交通各派一次）
// 實作在 src/probe.ts。
import { PROBE_LOCS, runGeocodeProbe, runGoProbe, runLaneProbe, runMatrix, runSceneMatrix, runSim, runTakeawayProbe } from '../src/probe.ts'
import { MINUTES, type Minutes } from '../src/go.ts'
import type { Band } from '../src/types.ts'

export const config = { runtime: 'nodejs', maxDuration: 60 }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** 只有 Vercel preview（或本機明確設 PROBE_LOCAL=1）才開；正式站與沒設環境的地方都當作不存在。 */
export const probeEnabled = () => process.env.VERCEL_ENV === 'preview' || process.env.PROBE_LOCAL === '1'

async function handler(request: Request): Promise<Response> {
  if (!probeEnabled()) return json({ error: 'not_found' }, 404)
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  const q = new URL(request.url).searchParams
  if (q.get('mode') === 'geocode') {
    try { return json(await runGeocodeProbe()) } catch (e) { return json({ error: 'probe_failed', message: String(e) }, 500) }
  }
  const loc = q.get('loc') ?? 'xinyi'
  if (!Object.hasOwn(PROBE_LOCS, loc)) return json({ error: 'bad_request', locs: Object.keys(PROBE_LOCS) }, 400)
  const budget = q.get('budget')?.split(',').map(Number).filter((b): b is Band => b === 1 || b === 2 || b === 3 || b === 4)
  try {
    if (q.get('mode') === 'sim') {
      return json(await runSim(loc, { days: Number(q.get('days') ?? 60), seed: Number(q.get('seed') ?? 1), ...(budget?.length ? { budget } : {}) }))
    }
    if (q.get('mode') === 'scene') return json(await runSceneMatrix(loc))
    if (q.get('mode') === 'lanes') return json(await runLaneProbe(loc))
    if (q.get('mode') === 'takeaway') return json(await runTakeawayProbe(loc))
    if (q.get('mode') === 'go') {
      const m = Number(q.get('minutes') ?? 30)
      const seed = Number(q.get('seed'))
      return json(await runGoProbe(loc, {
        minutes: (MINUTES as number[]).includes(m) ? (m as Minutes) : 30,
        ...(q.has('seed') && Number.isFinite(seed) ? { seed: seed >>> 0 } : {}),
      }))
    }
    return json(await runMatrix(loc))
  } catch (e) {
    return json({ error: 'probe_failed', message: String(e) }, 500)
  }
}

export function GET(request: Request): Promise<Response> { return handler(request) }
export function POST(request: Request): Promise<Response> { return handler(request) }
export default { fetch: (request: Request): Promise<Response> => handler(request) }
