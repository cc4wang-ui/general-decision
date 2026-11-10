// Vercel Function：本週日記 → Claude → WeeklyReport JSON（第 4、7 節）。
import { WEEKLY_SYSTEM_PROMPT, levelName, moduleTitle } from '../src/prompt.ts'
import { parseWeekly, ParseError } from '../src/orderParse.ts'
import { stats } from '../src/diary.ts'
import { localizeWeeklyText } from '../src/rules.ts'
import type { WeeklyReport, WeeklyRequest } from '../src/types.ts'

export const config = { runtime: 'nodejs' }

const ANTHROPIC_URL = `${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`
const MODEL = 'claude-sonnet-5'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let req: WeeklyRequest
  try {
    req = (await request.json()) as WeeklyRequest
  } catch {
    return json({ error: 'bad_request', message: '請求不是合法 JSON' }, 400)
  }
  const entries = Array.isArray(req?.entries) ? req.entries : []
  const level = (req?.level ?? 1)
  const weekStart = req?.weekStart ?? new Date().toISOString()

  // 數字在這裡算，不外包給模型；Claude 只負責 body 與 verdict。
  // Round 3：新占領／回防由前端從 PlaceMem 算好（伺服器沒有記憶），這裡只轉述；不合法的數字一律不採用。
  const disc = validDiscovery(req?.discovery)
  const s: WeeklyReport['stats'] = { ...stats(entries), ...(disc ? { newPlaces: disc.newPlaces, revisits: disc.revisits } : {}) }

  if (entries.length === 0) {
    const report: WeeklyReport = {
      weekStart, level, stats: s,
      body: '本週零道口令。沒有紀錄就沒有講評，下週按一顆鍵再來。',
      verdict: '本週講評：無紀錄。',
    }
    return json(report)
  }

  try {
    const text = await callClaude(WEEKLY_SYSTEM_PROMPT, buildUser(req, s), 700)
    const parsed = parseWeekly(text)
    const { body, verdict } = localizeWeeklyText(parsed.body, parsed.verdict) // 階段 D：週報不經 enforceRules，守門在這裡接
    const report: WeeklyReport = { weekStart, level, stats: s, body, verdict }
    return json(report)
  } catch (e) {
    const status = e instanceof ParseError ? 502 : (e as { status?: number })?.status ?? 502
    return json(
      { error: 'upstream', message: '本週講評延後，班長還在寫。' },
      status === 429 ? 429 : 502,
    )
  }
}

// 同 api/order.ts：函式型的 export default 會被 Vercel 當成舊式 (req, res) => void，
// 回傳值被丟棄、請求掛住。default 必須是物件形式的 fetch handler。
export function GET(request: Request): Promise<Response> { return handler(request) }
export function POST(request: Request): Promise<Response> { return handler(request) }
export default { fetch: handler }

function validDiscovery(d: WeeklyRequest['discovery']): { newPlaces: number; revisits: number } | null {
  const ok = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1000
  return d && ok(d.newPlaces) && ok(d.revisits) ? { newPlaces: d.newPlaces, revisits: d.revisits } : null
}

function buildUser(req: WeeklyRequest, s: WeeklyReport['stats']): string {
  // Round 3：日記不再存 placeName（Google 條款，R3§3.3），一律用 big。
  const lines = req.entries
    .slice()
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((e) => `・${e.ts} ${moduleTitle(e.module)} ${e.big} → ${e.outcome}`)
  return [
    `本週開始：${req.weekStart}`,
    `火力：${levelName((req.level ?? 1))}`,
    `【已算好的數字，直接用，不要自己再算】口令 ${s.orders} 道、服從率 ${s.complianceRate}%、罰則 ${s.punishments} 次、最弱模組 ${s.weakestModule ?? '無'}`,
    s.newPlaces !== undefined ? `【已算好】本週新占領 ${s.newPlaces} 個據點、回防 ${s.revisits} 次，直接用。` : '',
    `本週 entries：\n${lines.join('\n')}`,
    '只輸出 WeeklyReport JSON。',
  ].filter(Boolean).join('\n\n')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY 未設定'), { status: 500 })

  const delays = [1000, 3000]
  let last: Error & { status?: number } = Object.assign(new Error('unknown'), { status: 502 })
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      last = Object.assign(new Error('Claude 逾時'), { status: 504 })
      if (attempt < delays.length) { await sleep(delays[attempt]!); continue }
      throw last
    }
    if (res.ok) {
      const data = (await res.json()) as { content?: { type: string; text?: string }[] }
      const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (!text) throw Object.assign(new Error('Claude 回空內容'), { status: 502 })
      return text
    }
    if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`Claude ${res.status}`), { status: res.status })
    last = Object.assign(new Error(`Claude ${res.status}`), { status: res.status })
    if (attempt < delays.length) await sleep(delays[attempt]!)
  }
  throw last
}
