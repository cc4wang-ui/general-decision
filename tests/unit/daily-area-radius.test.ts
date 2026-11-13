// @vitest-environment node
// daily-area-radius：目標契約 runs/daily-area-radius/contract.md。
// A：開地區偏好時，自動站搜尋以地區中心為準，出發點再遠也派得出地區內的店。
// B：第一次挑店只從搜尋半徑（SEARCH_BIAS_M 3500 m）內的候選裡挑，不派遠店。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { distanceKm } from '../../src/areas.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }
/** 出發點：澀谷南方約 4.4 km（預覽站實測請求 r3-area-request.json 的座標）。 */
const HOME = { lat: 35.6195, lng: 139.7005 }
const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0, minute: 0 }, close: { day: d, hour: 23, minute: 59 } }))

/** 以 base 為基準往北 i×110 m 的店，整天營業。 */
const shop = (id: string, base: { lat: number; lng: number }, i: number) => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: base.lat + i * 0.001, longitude: base.lng },
  googleMapsUri: 'https://maps.google.com/?cid=' + id, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant',
  currentOpeningHours: { openNow: true, periods: allDay },
})

type Search = { textQuery?: string; pageSize?: number; locationBias?: { circle: { center: { latitude: number; longitude: number } } } }
/**
 * Places mock 模擬 Google 的行為：locationBias 中心在哪，就回那附近的店；
 * 查詢字串帶出發地名（大井町）時，Google 會照字面回出發地附近的店。
 * pageSize 1 是出發地解析。
 */
function mockGoogle(opts: { nearArea: unknown[]; nearHome: unknown[]; originPlace?: unknown }) {
  const searches: Search[] = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>
    if (urlText(url).includes('routes.googleapis.com')) {
      const n = (body.origins as unknown[]).length
      const elements = []
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) elements.push({ originIndex: i, destinationIndex: j, duration: (i === j ? 0 : 600) + 's', distanceMeters: i === j ? 0 : 800 })
      return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
    }
    const s = body as Search
    if (s.pageSize === 1) return Promise.resolve(new Response(JSON.stringify({ places: [opts.originPlace] }), { status: 200 }))
    searches.push(s)
    const c = s.locationBias?.circle.center
    const biasNearArea = !!c && distanceKm(SHIBUYA, { lat: c.latitude, lng: c.longitude }) < 1.5
    const places = biasNearArea && !(s.textQuery ?? '').includes('大井町') ? opts.nearArea : opts.nearHome
    return Promise.resolve(new Response(JSON.stringify({ places }), { status: 200 }))
  }))
  return { searches }
}

type StopOut = { id: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }
type Out = { stops: StopOut[]; missingStops?: { id: string; reason: string }[] }
const run = async (body: unknown) => {
  const res = await handler(post(body))
  expect(res.status).toBe(200)
  return await res.json() as Out
}
const meal = (extra: Record<string, unknown> = {}) => [{ id: 'meal', kind: 'meal', title: '晚餐', minutes: 45, ...extra }]
/** 前 5 名隨機挑的索引固定成 pick。 */
const fixRandom = (pick: number) =>
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((a) => { if (a instanceof Uint32Array) a.fill(pick); return a })

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  fixRandom(0)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T03:00:00Z')) // 東京 12:00
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('A：開地區偏好時，自動站搜尋以地區中心為準', () => {
  it('目前位置在地區外 4.4 km → locationBias 中心＝地區中心，派出地區內的店，不標 area', async () => {
    const g = mockGoogle({ nearArea: [shop('area-1', SHIBUYA, 1)], nearHome: [shop('home-1', HOME, 1)] })
    const data = await run({ origin: HOME, area: '澀谷', areaOnly: true, stops: meal() })
    const m = data.stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('area-1')
    expect(data.missingStops).toEqual([])
    const c = g.searches[0]!.locationBias!.circle.center
    expect(distanceKm(SHIBUYA, { lat: c.latitude, lng: c.longitude })).toBeLessThan(0.01)
  })
  it('文字出發地（大井町）＋地區偏好 → 查詢字串不附加出發地名，派出地區內的店', async () => {
    const originPlace = shop('oimachi-station', HOME, 0)
    const g = mockGoogle({ nearArea: [shop('area-1', SHIBUYA, 1)], nearHome: [shop('home-1', HOME, 1)], originPlace })
    const data = await run({ location: '大井町', area: '澀谷', areaOnly: true, stops: meal() })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('area-1')
    expect(g.searches.every((s) => !(s.textQuery ?? '').includes('大井町'))).toBe(true)
  })
  it('沒開地區偏好 → 行為不變：中心＝出發點，查詢字串照舊附加出發地名', async () => {
    const originPlace = shop('oimachi-station', HOME, 0)
    const g = mockGoogle({ nearArea: [shop('area-1', SHIBUYA, 1)], nearHome: [shop('home-1', HOME, 1)], originPlace })
    const data = await run({ location: '大井町', stops: meal() })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('home-1')
    const s0 = g.searches[0]!
    expect(s0.textQuery).toContain('大井町')
    const c = s0.locationBias!.circle.center
    expect(distanceKm(HOME, { lat: c.latitude, lng: c.longitude })).toBeLessThan(0.01)
  })
  it('指定站不改：查詢字串仍是使用者輸入的地名，不套地區中心以外的限制', async () => {
    const g = mockGoogle({ nearArea: [shop('area-1', SHIBUYA, 1)], nearHome: [shop('ichiran-oimachi', HOME, 1)] })
    const data = await run({ origin: HOME, area: '澀谷', areaOnly: true, stops: meal({ specified: true, place: '一蘭 大井町店' }) })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('ichiran-oimachi')
    expect(g.searches[0]!.textQuery).toBe('一蘭 大井町店')
  })
})

describe('B：第一次挑店只從搜尋半徑內挑', () => {
  it('池子只有 2 家、隨機抽到第 2 名（12 km 外）→ 不派遠店，改派半徑內的店', async () => {
    fixRandom(1)
    const pool = [shop('near-1', SHIBUYA, 1), shop('far-12km', SHIBUYA, 110)]
    mockGoogle({ nearArea: pool, nearHome: pool })
    const data = await run({ origin: SHIBUYA, stops: meal() })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('near-1')
  })
  it('池裡只有遠店 → 不派，該站標無候選 empty', async () => {
    mockGoogle({ nearArea: [shop('far-12km', SHIBUYA, 110)], nearHome: [shop('far-12km', SHIBUYA, 110)] })
    const data = await run({ origin: SHIBUYA, stops: meal() })
    const m = data.stops.find((s) => s.id === 'meal')!
    expect(m.candidate).toBeUndefined()
    expect(m.noCandidateReason).toBe('empty')
    expect(data.missingStops).toEqual([{ id: 'meal', reason: 'empty' }])
  })
  it('指定站不套半徑：使用者指定的遠店照派', async () => {
    mockGoogle({ nearArea: [shop('far-12km', SHIBUYA, 110)], nearHome: [shop('far-12km', SHIBUYA, 110)] })
    const data = await run({ origin: SHIBUYA, stops: meal({ specified: true, place: '遠いお店' }) })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('far-12km')
  })
})

describe('STOP 8：Places 次數不增加', () => {
  it('第 1 頁只有遠店、還有下一頁 → 不往下翻（跟修正前一樣只查 1 頁）', async () => {
    const far = shop('far-12km', SHIBUYA, 110)
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (urlText(url).includes('routes.googleapis.com')) return Promise.resolve(new Response('[]', { status: 200 }))
      calls.push(bodyText(init?.body, '{}'))
      return Promise.resolve(new Response(JSON.stringify({ places: [far], nextPageToken: 'page-2' }), { status: 200 }))
    }))
    const data = await run({ origin: SHIBUYA, stops: meal() })
    expect(data.stops.find((s) => s.id === 'meal')!.noCandidateReason).toBe('empty')
    expect(calls).toHaveLength(1)
  })
})

describe('把關第 1 輪：已排除的遠店不能讓翻頁提早停', () => {
  it('第 1 頁只有被換掉的遠店（目前候選）＋已排除的近店 → 照樣翻第 2 頁，派出第 2 頁的近店', async () => {
    const farCurrent = shop('far-current', SHIBUYA, 110)
    const nearDisliked = shop('near-disliked', SHIBUYA, 1)
    const nearPage2 = shop('near-page2', SHIBUYA, 2)
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (urlText(url).includes('routes.googleapis.com')) {
        const b = JSON.parse(bodyText(init?.body, '{}')) as { origins: unknown[] }
        const n = b.origins.length
        const el = []
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) el.push({ originIndex: i, destinationIndex: j, duration: (i === j ? 0 : 600) + 's', distanceMeters: i === j ? 0 : 800 })
        return Promise.resolve(new Response(JSON.stringify(el), { status: 200 }))
      }
      const body = JSON.parse(bodyText(init?.body, '{}')) as { pageToken?: string }
      const places = body.pageToken ? [nearPage2] : [farCurrent, nearDisliked]
      return Promise.resolve(new Response(JSON.stringify({ places, nextPageToken: body.pageToken ? undefined : 'page-2' }), { status: 200 }))
    }))
    const current = { id: 'far-current', name: 'far-current', address: 'x', mapUrl: 'https://maps.google.com/?cid=far-current', lat: SHIBUYA.lat + 0.11, lng: SHIBUYA.lng }
    const data = await run({ origin: SHIBUYA, shuffle: 'meal', exclude: ['near-disliked'], stops: meal({ candidate: current }) })
    expect(data.stops.find((s) => s.id === 'meal')!.candidate?.id).toBe('near-page2')
  })
})
