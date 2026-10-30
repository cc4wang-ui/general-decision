// @vitest-environment node
// Round 4 量測工具：正式站必須 404；sim 走正式 handleOrder、Places 同一請求只打一次、Claude 不真的打。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/probe.ts'
import { cachingIo, runMatrix, runSim } from '../../src/probe.ts'
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
})
