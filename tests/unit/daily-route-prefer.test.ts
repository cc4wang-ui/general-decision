// @vitest-environment node
// 2.4 行為回饋迴圈（伺服器）：prefer／demote 只改「前 5 名隨機挑」的機率。
// 不排除任何候選、不放寬任何門檻；沒帶欄位時回應與原本相同。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }
const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0, minute: 0 }, close: { day: d, hour: 23, minute: 59 } }))
type ShopOpts = { type?: string; reviews?: number }
/** 出發點往北 i×110 m 的店，整天營業。type 決定種類（ramen_restaurant → ramen）。 */
const shop = (id: string, i: number, o: ShopOpts = {}) => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: SHIBUYA.lat + i * 0.001, longitude: SHIBUYA.lng },
  googleMapsUri: 'https://maps.google.com/?cid=' + id, rating: 4.5, userRatingCount: o.reviews ?? 120,
  types: [o.type ?? 'restaurant'], primaryType: o.type ?? 'restaurant', currentOpeningHours: { openNow: true, periods: allDay },
})
/** 前 5 名：2 間拉麵＋3 間一般餐廳；第 6～8 名在前 5 名之外。 */
const POOL = [
  shop('ramen-1', 1, { type: 'ramen_restaurant' }), shop('plain-1', 2), shop('ramen-2', 3, { type: 'ramen_restaurant' }),
  shop('plain-2', 4), shop('plain-3', 5), shop('ramen-far', 6, { type: 'ramen_restaurant' }), shop('plain-far', 7), shop('udon-far', 8, { type: 'udon_restaurant' }),
]
const TOP5 = ['plain-1', 'plain-2', 'plain-3', 'ramen-1', 'ramen-2']

function mockGoogle(places: unknown[]) {
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>
    if (urlText(url).includes('routes.googleapis.com')) {
      const n = (body.origins as unknown[]).length
      const elements = []
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) elements.push({ originIndex: i, destinationIndex: j, duration: (i === j ? 0 : 600) + 's', distanceMeters: i === j ? 0 : 800 })
      return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify({ places }), { status: 200 }))
  }))
}
type StopOut = { id: string; candidate?: { id: string }; noCandidate?: boolean; preferHit?: boolean }
const runRaw = async (body: unknown) => {
  const res = await handler(post(body))
  expect(res.status).toBe(200)
  return await res.text()
}
const run = async (body: unknown) => JSON.parse(await runRaw(body)) as { stops: StopOut[] }
const base = (extra: Record<string, unknown> = {}, stop: Record<string, unknown> = {}) =>
  ({ origin: SHIBUYA, areaOnly: false, stops: [{ id: 'meal', kind: 'meal', title: '晚餐', minutes: 45, ...stop }], ...extra })
/** crypto 亂數換成可重現的 LCG 序列（同一個 seed 每次一樣）。 */
const seedRandom = (seed: number) => {
  let x = seed >>> 0
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((a) => {
    if (a instanceof Uint32Array) for (let i = 0; i < a.length; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; a[i] = x >>> 8 }
    return a
  })
}
const fixRandom = (v: number) =>
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((a) => { if (a instanceof Uint32Array) a.fill(v); return a })
/** 同一個請求跑 n 次，回每間店被挑中的次數與 preferHit 次數。 */
const sample = async (body: unknown, n: number) => {
  const picks = new Map<string, number>()
  let hits = 0
  for (let i = 0; i < n; i++) {
    const m = (await run(body)).stops.find((s) => s.id === 'meal')!
    picks.set(m.candidate!.id, (picks.get(m.candidate!.id) ?? 0) + 1)
    if (m.preferHit) { hits++; expect(m.candidate!.id.startsWith('ramen')).toBe(true) }
  }
  const share = (prefix: string) => [...picks].filter(([id]) => id.startsWith(prefix)).reduce((a, [, c]) => a + c, 0) / n
  return { picks, hits, share, ids: [...picks.keys()].sort() }
}
const N = 1500

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T03:00:00Z')) // 東京 12:00
  mockGoogle(POOL)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('機率偏向（seed 亂數，各抽 1500 次）', () => {
  it('沒帶偏好：拉麵佔約 2/5；帶 prefer 拉麵：約 12/18；帶 demote 拉麵：約 2/8', async () => {
    seedRandom(1); const none = await sample(base(), N)
    seedRandom(1); const pref = await sample(base({ prefer: ['ramen'] }), N)
    seedRandom(1); const dem = await sample(base({ demote: ['ramen'] }), N)
    expect(none.share('ramen')).toBeGreaterThan(0.35); expect(none.share('ramen')).toBeLessThan(0.45)
    expect(pref.share('ramen')).toBeGreaterThan(0.61); expect(pref.share('ramen')).toBeLessThan(0.72)
    expect(dem.share('ramen')).toBeGreaterThan(0.20); expect(dem.share('ramen')).toBeLessThan(0.30)
    expect(none.hits).toBe(0)
    expect(dem.hits).toBe(0)
  })
  it('可用候選集合不變：有無 prefer／demote，被挑到的店都是同一組前 5 名，而且每一間都還抽得到', async () => {
    seedRandom(7); const none = await sample(base(), N)
    seedRandom(7); const pref = await sample(base({ prefer: ['ramen'] }), N)
    seedRandom(7); const dem = await sample(base({ demote: ['ramen'] }), N)
    expect(none.ids).toEqual(TOP5)
    expect(pref.ids).toEqual(TOP5)
    expect(dem.ids).toEqual(TOP5)
  })
  it('偏好不會把隨機變成確定：帶 prefer 的完整重新生成仍產生不同路線', async () => {
    seedRandom(3)
    const { picks } = await sample(base({ prefer: ['ramen'] }), 60)
    expect(picks.size).toBeGreaterThan(2)
  })
})

describe('不放寬任何門檻（Q7）', () => {
  it('評論數不到門檻的偏好種類店，帶 prefer 也絕不派', async () => {
    mockGoogle([shop('ramen-few', 1, { type: 'ramen_restaurant', reviews: 10 }), shop('plain-1', 2), shop('plain-2', 3)])
    seedRandom(5)
    const { ids } = await sample(base({ prefer: ['ramen'] }), 200)
    expect(ids).toEqual(['plain-1', 'plain-2'])
  })
  it('exclude／seen／excludeKinds 裡的店，帶 prefer 也絕不派', async () => {
    seedRandom(5)
    const ex = await sample(base({ prefer: ['ramen'], exclude: ['ramen-1'], seen: ['ramen-2'] }), 300)
    expect(ex.ids).not.toContain('ramen-1')
    expect(ex.ids).not.toContain('ramen-2')
    seedRandom(5)
    const kinds = await sample(base({ prefer: ['ramen'], excludeKinds: ['ramen'] }), 300)
    expect(kinds.ids.some((id) => id.startsWith('ramen'))).toBe(false)
  })
  it('地區偏好開啟時，區外的偏好種類店帶 prefer 也絕不派', async () => {
    const far = { ...shop('ramen-out', 0, { type: 'ramen_restaurant' }), location: { latitude: SHIBUYA.lat + 0.02, longitude: SHIBUYA.lng } }
    mockGoogle([far, shop('plain-1', 2), shop('plain-2', 3)])
    seedRandom(5)
    const { ids } = await sample(base({ prefer: ['ramen'], area: '澀谷', areaOnly: true }), 200)
    expect(ids).toEqual(['plain-1', 'plain-2'])
  })
  it('只有降權種類的店可選時照樣派，不會變成無候選', async () => {
    mockGoogle([shop('ramen-1', 1, { type: 'ramen_restaurant' })])
    fixRandom(0)
    const m = (await run(base({ demote: ['ramen'] }))).stops[0]!
    expect(m.candidate?.id).toBe('ramen-1')
    expect(m.noCandidate).toBeUndefined()
  })
})

describe('沒帶欄位／壞輸入：回應與原本逐位元相同', () => {
  const bad: [string, Record<string, unknown>][] = [
    ['空陣列', { prefer: [], demote: [] }],
    ['字串不是陣列', { prefer: 'ramen', demote: 'ramen' }],
    ['物件', { prefer: { 0: 'ramen', length: 1 } }],
    ['數字／null／巢狀陣列元素', { prefer: [1, null, ['ramen'], { k: 'ramen' }, true] }],
    ['過長字串', { prefer: ['ramen'.repeat(20)] }],
    ['null', { prefer: null, demote: null }],
    ['同一種類同時 prefer 與 demote', { prefer: ['ramen'], demote: ['ramen'] }],
    ['這 5 名裡沒有的種類', { prefer: ['sushi'], demote: ['yakiniku'] }],
  ]
  it.each(bad)('%s', async (_name, extra) => {
    for (const pick of [0, 1, 2, 3, 4]) {
      fixRandom(pick); const plain = await runRaw(base())
      fixRandom(pick); const withExtra = await runRaw(base(extra))
      expect(withExtra).toBe(plain)
      expect(plain).not.toContain('preferHit')
    }
  })
  it('超過 20 個種類只讀前 20 個：第 21 個之後的 ramen 不生效', async () => {
    const many = [...Array.from({ length: 20 }, (_, i) => 'kind' + i), 'ramen']
    fixRandom(3); const plain = await runRaw(base())
    fixRandom(3); const capped = await runRaw(base({ prefer: many }))
    expect(capped).toBe(plain)
  })
  it('舊種類鍵 ramen_restaurant 會歸一化成 ramen 並生效', async () => {
    seedRandom(1)
    const pref = await sample(base({ prefer: ['ramen_restaurant'] }), 600)
    expect(pref.share('ramen')).toBeGreaterThan(0.58)
  })
})

describe('說明旗標 preferHit（Q9）：只在偏好真的影響這一站時才有', () => {
  it('挑中偏好種類且前 5 名權重不同 → 有；挑中一般種類 → 沒有', async () => {
    fixRandom(0) // 加權後 r=0 落在第一名 ramen-1
    const hit = (await run(base({ prefer: ['ramen'] }))).stops[0]!
    expect(hit.candidate?.id).toBe('ramen-1')
    expect(hit.preferHit).toBe(true)
    fixRandom(6) // 權重 6,2,6,2,2：r=6 落在第二名 plain-1
    const miss = (await run(base({ prefer: ['ramen'] }))).stops[0]!
    expect(miss.candidate?.id).toBe('plain-1')
    expect(miss.preferHit).toBeUndefined()
  })
  it('前 5 名全是偏好種類（偏好沒有改變機率）→ 沒有旗標', async () => {
    mockGoogle([1, 2, 3].map((i) => shop('ramen-' + i, i, { type: 'ramen_restaurant' })))
    fixRandom(1)
    const m = (await run(base({ prefer: ['ramen'] }))).stops[0]!
    expect(m.candidate?.id).toBe('ramen-2')
    expect(m.preferHit).toBeUndefined()
  })
  it('只帶 demote、挑中的是一般種類 → 沒有旗標', async () => {
    fixRandom(1)
    const m = (await run(base({ demote: ['ramen'] }))).stops[0]!
    expect(m.preferHit).toBeUndefined()
  })
})

describe('指定站、固定行程、已完成站行為不變', () => {
  const kept = { id: 'kept-1', name: '原本的店', address: '原本地址', mapUrl: 'https://maps.google.com/?cid=kept-1', lat: SHIBUYA.lat + 0.001, lng: SHIBUYA.lng, types: ['restaurant'], userRatingCount: 300 }
  it.each([
    ['指定站', { specified: true, place: 'ラーメン 指定' }],
    ['固定行程', { locked: true, custom: true, place: '固定地點', start: '15:00' }],
    ['已完成站（保留既有候選）', { done: true, candidate: kept }],
    ['指定站（保留既有候選）', { specified: true, place: '原本地址', candidate: kept }],
  ])('%s：有無 prefer 回應相同，且沒有 preferHit', async (_name, stop) => {
    for (const pick of [0, 2, 4]) {
      fixRandom(pick); const plain = await runRaw(base({}, stop))
      fixRandom(pick); const pref = await runRaw(base({ prefer: ['ramen'], demote: ['udon'] }, stop))
      expect(pref).toBe(plain)
      expect(pref).not.toContain('preferHit')
    }
  })
  it('單站換店時，其他站的既有候選照留（prefer 不讓保留的站重挑）', async () => {
    fixRandom(0)
    const data = await run({ origin: SHIBUYA, areaOnly: false, shuffle: 'meal', prefer: ['ramen'], others: ['kept-1'], stops: [
      { id: 'meal', kind: 'meal', title: '晚餐', minutes: 45, candidate: { ...kept, id: 'plain-1' } },
      { id: 'coffee', kind: 'creative', title: '咖啡', minutes: 60, candidate: kept },
    ] })
    expect(data.stops.find((s) => s.id === 'coffee')!.candidate!.id).toBe('kept-1')
    expect(data.stops.find((s) => s.id === 'meal')!.candidate!.id).not.toBe('plain-1')
  })
})

describe('偏好不寫進 log', () => {
  it('帶 prefer／demote 的請求不呼叫 console.log／console.warn', async () => {
    fixRandom(0)
    await run(base({ prefer: ['ramen'], demote: ['udon'] }))
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })
})
