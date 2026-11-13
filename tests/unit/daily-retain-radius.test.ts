// @vitest-environment node
// daily-retain-radius：目標契約 runs/daily-retain-radius/contract.md。
// 單站換店時，其他自動站保留的舊候選也要在搜尋半徑（SEARCH_BIAS_M 3500 m）內。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }
const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0, minute: 0 }, close: { day: d, hour: 23, minute: 59 } }))
/** 以 SHIBUYA 為基準往北 i×110 m 的店，整天營業。 */
const shop = (id: string, i: number, type = 'restaurant') => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: SHIBUYA.lat + i * 0.001, longitude: SHIBUYA.lng },
  googleMapsUri: 'https://maps.google.com/?cid=' + id, rating: 4.5, userRatingCount: 120, types: [type], primaryType: type,
  currentOpeningHours: { openNow: true, periods: allDay },
})
/** 前端回送的既有候選（Candidate 形狀）。i×110 m 往北；110 → 約 12 km。 */
const cand = (id: string, i: number) => ({ id, name: id, address: id + ' 地址', mapUrl: 'https://maps.google.com/?cid=' + id, lat: SHIBUYA.lat + i * 0.001, lng: SHIBUYA.lng, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })

/** Places mock：meal（restaurant）回 meal 池、coffee（cafe）回 coffee 池；記下每次搜尋的 includedType。 */
function mockGoogle() {
  const searches: string[] = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>
    if (urlText(url).includes('routes.googleapis.com')) {
      const n = (body.origins as unknown[]).length
      const el = []
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) el.push({ originIndex: i, destinationIndex: j, duration: (i === j ? 0 : 600) + 's', distanceMeters: i === j ? 0 : 800 })
      return Promise.resolve(new Response(JSON.stringify(el), { status: 200 }))
    }
    const type = typeof body.includedType === 'string' ? body.includedType : ''
    searches.push(type)
    const places = type === 'cafe' ? [shop('cafe-new', 2, 'cafe')] : [shop('meal-near', 3)]
    return Promise.resolve(new Response(JSON.stringify({ places }), { status: 200 }))
  }))
  return { searches }
}
type StopOut = { id: string; candidate?: { id: string }; noCandidateReason?: string }
const run = async (body: unknown) => {
  const res = await handler(post(body))
  expect(res.status).toBe(200)
  return (await res.json() as { stops: StopOut[] }).stops
}
const stops = (meal: Record<string, unknown>) => [
  { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 45, candidate: { ...cand('cafe-old', 1), types: ['cafe'], primaryType: 'cafe' } },
  { id: 'meal', kind: 'meal', title: '晚餐', minutes: 45, ...meal },
]

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((a) => { if (a instanceof Uint32Array) a.fill(0); return a })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T03:00:00Z')) // 東京 12:00
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('單站換店：其他自動站的舊候選也要在半徑內', () => {
  it('換 coffee；meal 舊店在 12 km 外 → 不保留，重新搜尋派半徑內的店', async () => {
    const g = mockGoogle()
    const out = await run({ origin: SHIBUYA, shuffle: 'coffee', exclude: ['cafe-old'], stops: stops({ candidate: cand('meal-far', 110) }) })
    expect(out.find((s) => s.id === 'meal')!.candidate?.id).toBe('meal-near')
    expect(out.find((s) => s.id === 'coffee')!.candidate?.id).toBe('cafe-new')
    expect(g.searches.filter((t) => t === 'restaurant')).toHaveLength(1)
  })
  it('meal 舊店在 3.3 km（半徑內）→ 照舊保留，不重新搜尋', async () => {
    const g = mockGoogle()
    const out = await run({ origin: SHIBUYA, shuffle: 'coffee', exclude: ['cafe-old'], stops: stops({ candidate: cand('meal-kept', 30) }) })
    expect(out.find((s) => s.id === 'meal')!.candidate?.id).toBe('meal-kept')
    expect(g.searches.filter((t) => t === 'restaurant')).toHaveLength(0)
  })
  it('固定站不套半徑：12 km 外的固定店照舊保留', async () => {
    const g = mockGoogle()
    const out = await run({ origin: SHIBUYA, shuffle: 'coffee', exclude: ['cafe-old'], stops: stops({ locked: true, place: '遠いお店', candidate: cand('meal-far', 110) }) })
    expect(out.find((s) => s.id === 'meal')!.candidate?.id).toBe('meal-far')
    expect(g.searches.filter((t) => t === 'restaurant')).toHaveLength(0)
  })
  it('指定站不套半徑：12 km 外的指定店照舊保留', async () => {
    mockGoogle()
    const out = await run({ origin: SHIBUYA, shuffle: 'coffee', exclude: ['cafe-old'], stops: stops({ specified: true, place: '遠いお店', candidate: cand('meal-far', 110) }) })
    expect(out.find((s) => s.id === 'meal')!.candidate?.id).toBe('meal-far')
  })
  it('開地區偏好：中心是地區中心；地區內 1 km 的舊店照舊保留', async () => {
    const g = mockGoogle()
    const out = await run({ origin: { lat: 35.6195, lng: 139.7005 }, area: '澀谷', areaOnly: true, shuffle: 'coffee', exclude: ['cafe-old'], stops: stops({ candidate: cand('meal-in-area', 5) }) })
    expect(out.find((s) => s.id === 'meal')!.candidate?.id).toBe('meal-in-area')
    expect(g.searches.filter((t) => t === 'restaurant')).toHaveLength(0)
  })
})
