// @vitest-environment node
// Round 4 量測工具：正式站必須 404；sim 走正式 handleOrder、Places 同一請求只打一次、Claude 不真的打。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/probe.ts'
import { cachingIo, runMatrix, runSceneMatrix, runSim } from '../../src/probe.ts'
import type { RawPlace } from '../../src/places.ts'

/** 假 Places：每個 lane／查法回 20 家不同 id 的營業中店（id 帶請求內容的雜湊，模擬不同 lane 撈到不同店）。 */
function fakePlaces(): typeof fetch {
  return vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body ?? '')
    let h = 0
    for (const ch of body) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const places: RawPlace[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p${h % 7}-${i}`, displayName: { text: `店${h % 7}-${i}` },
      location: { latitude: 25.0408 + i * 0.0002, longitude: 121.565 },
      currentOpeningHours: { openNow: true }, rating: 4 + (i % 8) / 10, userRatingCount: 50 + i * 10, primaryType: 'restaurant',
    }))
    return new Response(JSON.stringify({ places }), { status: 200 })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('api/probe（Round 4 量測工具）', () => {
  it('沒有 VERCEL_ENV=preview → 404，不呼叫任何外部服務', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await api.fetch(new Request('https://x/api/probe?mode=matrix'))
    expect(res.status).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })

  it('preview 但地點不認得 → 400', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const res = await api.fetch(new Request('https://x/api/probe?loc=moon'))
    expect(res.status).toBe(400)
  })
})

describe('cachingIo', () => {
  it('同 url+body 只真打一次；Claude 一律假回應、不碰網路', async () => {
    const real = fakePlaces()
    const io = cachingIo(real)
    await io.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', body: 'a' })
    await io.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', body: 'a' })
    await io.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', body: 'b' })
    const c = await io.fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })
    expect(io.misses()).toBe(2)
    expect(real).toHaveBeenCalledTimes(2)
    expect(c.status).toBe(200)
  })
})

describe('runSim／runMatrix', () => {
  it('sim：每餐都走 handleOrder，記憶照前端規則累積，回報重複率與真實呼叫次數', async () => {
    const io = cachingIo(fakePlaces())
    const r = await runSim('xinyi', { days: 5, io, start: new Date('2026-10-30T11:30:00+08:00') })
    expect(r.meals).toBe(10)
    expect(r.ok).toBe(10)
    expect(r.distinct).toBeGreaterThan(1)
    expect(r.repeat7d).toBeGreaterThanOrEqual(0)
    expect(r.placesCalls).toBe(io.misses())
  })

  it('matrix：每個情境都有一列，需要店的卡沒店就算失敗', async () => {
    const real = fakePlaces()
    const claude = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"verdict":"do","meme":{"top":"a","big":"b","bot":"c"},"steps":["1","2","3"],"log":"x"}' }] }), { status: 200 }))
    const io = { fetch: (async (u: string | URL | Request, init?: RequestInit) => (String(u).includes('anthropic') ? claude() : real(u, init))) as typeof fetch }
    const m = await runMatrix('xinyi', new Date('2026-10-30T18:30:00+08:00'), io)
    expect(m.rows.length).toBeGreaterThan(10)
    expect(m.rows.find((r) => r.id === 'eat')?.ok).toBe(true)
    expect(m.summary.scenarios).toBe(m.rows.length)
  })

  it('scene（Round 5）：吃、歇每一種情境各一列；「其他」用手動輸入當關鍵字；不符規則的列 pass=false', async () => {
    const real = fakePlaces()
    const claude = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"verdict":"do","meme":{"top":"a","big":"b","bot":"c"},"steps":["1","2","3"],"log":"x"}' }] }), { status: 200 }))
    const io = { fetch: (async (u: string | URL | Request, init?: RequestInit) => (String(u).includes('anthropic') ? claude() : real(u, init))) as typeof fetch }
    const m = await runSceneMatrix('xinyi', new Date('2026-11-01T12:30:00+08:00'), io)
    expect(m.rows.map((r) => r.id)).toEqual([
      'eat:一個人快吃', 'eat:外帶', 'eat:朋友聚餐', 'eat:約會吃好一點', 'eat:宵夜', 'eat:其他',
      'rest:一個人放空', 'rest:工作讀書', 'rest:朋友聊天', 'rest:談事情', 'rest:等人', 'rest:其他',
    ])
    expect(m.rows.every((r) => r.ok)).toBe(true)
    expect(m.rows.find((r) => r.id === 'eat:其他')?.how).toContain('吃到飽')
    expect(m.rows.find((r) => r.id === 'rest:工作讀書')?.how).toContain('不限時 咖啡廳')
    // 假資料的店都在 0–400 m、評分 4.0–4.7：約會（≥ 4.3）要嘛派到夠高分的、要嘛標不符規則
    const date = m.rows.find((r) => r.id === 'eat:約會吃好一點')!
    expect(date.pass).toBe((date.rating ?? 5) >= 4.3)
    expect(m.summary.scenarios).toBe(12)
  })
})

// Round 6：mode=geocode——10 個日文站名 → 座標，對參考座標量誤差。
import { GEOCODE_PASS_M, STATIONS, runGeocodeProbe } from '../../src/probe.ts'
describe('runGeocodeProbe（Round 6）', () => {
  const okFetch = (skip?: string) => (async (_url: string | URL | Request, init?: RequestInit) => {
    const q = JSON.parse(String(init?.body)).textQuery as string
    const st = STATIONS.find((s) => s.q === q)
    if (!st || q === skip) return new Response(JSON.stringify({}), { status: 200 })
    // 參考座標往北偏 0.001 度（約 111 公尺）：在 300 公尺內
    return new Response(JSON.stringify({ places: [{ location: { latitude: st.lat + 0.001, longitude: st.lng }, displayName: { text: q } }] }), { status: 200 })
  }) as unknown as typeof fetch
  it('10 站都在門檻內 → 10/10；每站一次 Places 呼叫', async () => {
    const r = await runGeocodeProbe({ fetchFn: okFetch(), key: 'k' })
    expect(STATIONS).toHaveLength(10)
    expect(r.summary).toMatchObject({ stations: 10, pass: 10, failed: [], placesCalls: 10 })
    expect(r.summary.maxDistM).toBeLessThanOrEqual(GEOCODE_PASS_M)
    expect(r.rows.every((x) => x.kind === 'ok' && x.label === x.q)).toBe(true)
  })
  it('一站查不到 → 列進 failed、pass 9', async () => {
    const r = await runGeocodeProbe({ fetchFn: okFetch('銀座駅'), key: 'k' })
    expect(r.summary.pass).toBe(9)
    expect(r.summary.failed).toEqual(['銀座駅:not_found'])
  })
  it('沒有金鑰 → 丟錯（不打 Google）', async () => {
    const saved = process.env.GOOGLE_PLACES_KEY
    delete process.env.GOOGLE_PLACES_KEY
    await expect(runGeocodeProbe({ fetchFn: okFetch() })).rejects.toThrow()
    if (saved) process.env.GOOGLE_PLACES_KEY = saved
  })
})

// Round 14：mode=takeaway——約會／聚餐的關鍵字各打一次，只列外帶店（主類別或 types 有 meal_takeaway），fieldMask 只拿名稱與類型。
import { runTakeawayProbe } from '../../src/probe.ts'
describe('runTakeawayProbe（Round 14）', () => {
  it('只列外帶店、帶完整 types 與查到它的關鍵字；fieldMask 不含評分與營業時間', async () => {
    const masks: string[] = []
    const queries: string[] = []
    const fetchFn = (async (u: string | URL | Request, init?: RequestInit) => {
      if (String(u).endsWith('/v1/places/p1')) return new Response(JSON.stringify({ dineIn: true }), { status: 200 })
      masks.push(String((init?.headers as Record<string, string>)['X-Goog-FieldMask']))
      queries.push(JSON.parse(String(init?.body)).textQuery)
      return new Response(JSON.stringify({ places: [
        { id: 'p1', displayName: { text: 'すし屋のはなれ、' }, primaryType: 'meal_takeaway', types: ['meal_takeaway', 'sushi_restaurant', 'restaurant'] },
        { displayName: { text: '普通の寿司' }, primaryType: 'sushi_restaurant', types: ['sushi_restaurant', 'restaurant'] },
      ] }), { status: 200 })
    }) as typeof fetch
    const r = await runTakeawayProbe('shinjuku', { fetchFn, key: 'k' })
    expect(r.country).toBe('JP')
    expect(queries).toContain('寿司')
    expect(queries).toContain('焼肉')
    expect(new Set(masks)).toEqual(new Set(['places.id,places.displayName,places.primaryType,places.types']))
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ name: 'すし屋のはなれ、', primaryType: 'meal_takeaway', types: ['meal_takeaway', 'sushi_restaurant', 'restaurant'], dineIn: true })
    expect(r.rows[0]!.queries.length).toBe(queries.length)
  })
})
