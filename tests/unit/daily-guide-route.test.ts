// @vitest-environment node
// guide-1115（伺服器）：手動順序照做、固定行程不被挪動、只重排不換店、探索主題白名單與查詢對應、「沒去過的區域」的區域覆寫。
// 契約：runs/guide-1115/contract.md STOP 1、3、4、6。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { scheduleRoute, type ScheduledStop } from '../../src/dailyRouting.ts'
import { THEMES, THEME_IDS } from '../../src/dailyThemes.ts'
import { AREAS } from '../../src/areas.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const SHIBUYA = AREAS['澀谷']!, HARAJUKU = AREAS['原宿']!
const STEP = 0.001 // 約 110 m；步行矩陣：每一格 2 分鐘
type P = { id: string; lat: number; lng: number; name?: string; types?: string[]; primaryType?: string }
const gPlace = (p: P) => ({ id: p.id, displayName: { text: p.name ?? p.id }, formattedAddress: p.id + ' 地址', location: { latitude: p.lat, longitude: p.lng }, googleMapsUri: 'https://maps.google.com/?cid=' + p.id, rating: 4.5, userRatingCount: 120, types: p.types ?? ['restaurant'], primaryType: p.primaryType ?? 'restaurant' })
const cand = (id: string, steps: number, at = SHIBUYA) => ({ id, name: id, address: id + ' 地址', mapUrl: 'https://maps.google.com/?cid=' + id, lat: at.lat + steps * STEP, lng: at.lng, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
type PlacesReq = { textQuery?: string; includedType?: string; locationBias?: { circle?: { center?: { latitude?: number; longitude?: number }; radius?: number } } }
let placesCalls: PlacesReq[] = []
/** Places：依查詢字串回店（預設回 answer(req)）；Routes：依緯度差算步行分鐘（每 0.001 度 2 分鐘）。 */
function mockGoogle(answer: (req: PlacesReq) => P[] = () => []) {
  placesCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>
    if (urlText(url).includes('routes.googleapis.com')) {
      const pts = (body.origins as { waypoint: { location: { latLng: { latitude: number; longitude: number } } } }[]).map(w => w.waypoint.location.latLng)
      const elements = pts.flatMap((a, i) => pts.map((b, j) => { const steps = Math.round((Math.abs(a.latitude - b.latitude) + Math.abs(a.longitude - b.longitude)) / STEP); return { originIndex: i, destinationIndex: j, duration: steps * 120 + 's', distanceMeters: steps * 110 } }))
      return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
    }
    placesCalls.push(body)
    return Promise.resolve(new Response(JSON.stringify({ places: answer(body as PlacesReq).map(gPlace) }), { status: 200 }))
  }))
}
type StopOut = { id: string; title?: string; start?: string; eta?: string; departure?: string; travelMin?: number; conflict?: string; theme?: string; themeArea?: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }
type Out = { stops: StopOut[]; conflicts: string[]; routeVerified: boolean; travelMinutes: number }
const run = async (body: unknown) => { const res = await handler(post(body)); expect(res.status).toBe(200); return await res.json() as Out }
/** 使用者指定且已有真店的站（非自動站：完整重新生成也照留，方便只看排序）。 */
const pinned = (id: string, steps: number, minutes = 30) => ({ id, kind: 'meal', title: id, place: id, minutes, specified: true, candidate: cand('c-' + id, steps) })
const fixedAt = (id: string, steps: number, start: string, minutes = 30) => ({ id, kind: 'rest', title: id, place: id, minutes, start, locked: true, custom: true, candidate: cand('c-' + id, steps) })

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // 東京時間 10:00（2026-11-15 是星期日）。只換 Date，不動計時器。
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T01:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.GOOGLE_PLACES_KEY })

describe('手動順序（manualOrder）', () => {
  // 遠（6 格）、近（1 格）、中（3 格）。自動排法＝步行最短：近→中→遠。
  const stops = [pinned('far', 6), pinned('near', 1), pinned('mid', 3)]
  it('沒帶欄位：照舊排成步行最短（近→中→遠）', async () => {
    mockGoogle()
    const out = await run({ origin: SHIBUYA, areaOnly: false, stops })
    expect(out.stops.map(s => s.id)).toEqual(['near', 'mid', 'far'])
  })
  it('manualOrder:true：照陣列順序走（遠→近→中），到店時間與步行分鐘照這個順序算', async () => {
    mockGoogle()
    const out = await run({ origin: SHIBUYA, areaOnly: false, manualOrder: true, stops })
    expect(out.routeVerified).toBe(true)
    expect(out.stops.map(s => s.id)).toEqual(['far', 'near', 'mid'])
    // 10:00 出發：遠 6 格＝12 分 → 10:12 到、10:42 走；→近 5 格＝10 分 → 10:52、11:22；→中 2 格＝4 分 → 11:26。
    expect(out.stops.map(s => [s.eta, s.departure, s.travelMin])).toEqual([['10:12', '10:42', 12], ['10:52', '11:22', 10], ['11:26', '11:56', 4]])
    expect(out.travelMinutes).toBe(26)
  })
  it('manualOrder 不是 true（false、字串、沒帶）：回應與沒帶欄位時逐字相同', async () => {
    mockGoogle()
    const strip = (o: Out) => JSON.stringify({ ...o, searchedAt: undefined })
    const base = strip(await run({ origin: SHIBUYA, areaOnly: false, stops }))
    for (const v of [false, 'true', 1, null]) expect(strip(await run({ origin: SHIBUYA, areaOnly: false, manualOrder: v, reorderOnly: v, stops }))).toBe(base)
  })
  it('固定行程不被挪動：使用者排的下一站去了會趕不上，就先去固定行程；固定行程在自己的時間、沒有晚到警告', async () => {
    mockGoogle()
    // A、B 各停 60 分；固定行程 10:30。先去 A 會到 11 點多，所以固定行程排第一；其餘照使用者順序 A→B（B 比較近也不搶先）。
    const out = await run({ origin: SHIBUYA, areaOnly: false, manualOrder: true, stops: [pinned('A', 5, 60), pinned('B', 1, 60), fixedAt('dentist', 2, '10:30')] })
    expect(out.stops.map(s => s.id)).toEqual(['dentist', 'A', 'B'])
    const f = out.stops[0]!
    expect([f.start, f.eta, f.departure, f.conflict]).toEqual(['10:30', '10:30', '11:00', undefined])
    expect(out.conflicts).toEqual([])
  })
  it('固定行程排得進去時留在使用者順序之後，仍在自己的時間', async () => {
    mockGoogle()
    const out = await run({ origin: SHIBUYA, areaOnly: false, manualOrder: true, stops: [pinned('A', 5, 60), pinned('B', 1, 60), fixedAt('dentist', 2, '13:00')] })
    expect(out.stops.map(s => s.id)).toEqual(['A', 'B', 'dentist'])
    expect(out.stops[2]!.eta).toBe('13:00')
    expect(out.conflicts).toEqual([])
  })
  it('固定行程怎樣都來不及：照舊警告，時間不改', async () => {
    mockGoogle()
    // 10:00 出發，固定行程 10:01、走過去 4 分鐘。
    const out = await run({ origin: SHIBUYA, areaOnly: false, manualOrder: true, stops: [pinned('A', 5, 60), fixedAt('dentist', 2, '10:01')] })
    const f = out.stops.find(s => s.id === 'dentist')!
    expect(out.stops.map(s => s.id)).toEqual(['dentist', 'A'])
    expect([f.start, f.eta, f.conflict]).toEqual(['10:01', '10:04', '預計晚到 3 分鐘'])
    expect(out.conflicts).toEqual(['dentist：預計晚到 3 分鐘'])
  })
  it('已完成的站不排進路線，留在使用者排的位置', async () => {
    mockGoogle()
    const out = await run({ origin: SHIBUYA, areaOnly: false, manualOrder: true, stops: [pinned('far', 6), { ...pinned('visited', 2), done: true }, pinned('near', 1), fixedAt('dentist', 2, '09:00')] })
    // 固定行程（時間已過）照時間排最前面；沒進路線的已完成站仍夾在 far 與 near 之間。
    expect(out.stops.map(s => s.id)).toEqual(['dentist', 'far', 'visited', 'near'])
    expect(out.stops.find(s => s.id === 'visited')!.eta).toBeUndefined()
  })
})

describe('只重排、不換店（reorderOnly）', () => {
  const auto = (id: string, steps: number) => ({ id, kind: id, title: id, minutes: 30, candidate: cand('old-' + id, steps) })
  it('完整重新生成會重挑自動站；帶 reorderOnly 就原店照留、不查 Places', async () => {
    mockGoogle(() => [{ id: 'new-shop', lat: SHIBUYA.lat + STEP, lng: SHIBUYA.lng }, { id: 'new-shop-2', lat: SHIBUYA.lat + 2 * STEP, lng: SHIBUYA.lng }])
    const stops = [auto('meal', 4), auto('coffee', 1)]
    const regen = await run({ origin: SHIBUYA, areaOnly: false, stops })
    expect(regen.stops.every(s => s.candidate!.id.startsWith('new-shop'))).toBe(true)
    placesCalls = []
    const kept = await run({ origin: SHIBUYA, areaOnly: false, stops, reorderOnly: true, manualOrder: true })
    expect(kept.stops.map(s => [s.id, s.candidate!.id])).toEqual([['meal', 'old-meal'], ['coffee', 'old-coffee']])
    expect(placesCalls).toHaveLength(0)
    // 沒帶 manualOrder：店一樣不換，順序交回自動（近的先）。
    const autoOrder = await run({ origin: SHIBUYA, areaOnly: false, stops, reorderOnly: true })
    expect(autoOrder.stops.map(s => [s.id, s.candidate!.id])).toEqual([['coffee', 'old-coffee'], ['meal', 'old-meal']])
  })
})

describe('scheduleRoute 的 manual 參數', () => {
  const P = { lat: 0, lng: 0 }
  const m = [[0, 9, 1, 5], [9, 0, 8, 4], [1, 8, 0, 4], [5, 4, 4, 0]]
  const zeros = m.map(r => r.map(() => 0))
  const stops: ScheduledStop[] = [{ id: 'far', minutes: 10, candidate: P }, { id: 'near', minutes: 10, candidate: P }, { id: 'mid', minutes: 10, candidate: P }]
  it('不傳＝false：結果與之前相同（步行最短）；true：照陣列順序', () => {
    expect(scheduleRoute(stops, m, zeros, '10:00')).toEqual(scheduleRoute(stops, m, zeros, '10:00', false))
    expect(scheduleRoute(stops, m, zeros, '10:00').stops.map(s => s.id)).toEqual(['near', 'mid', 'far'])
    const manual = scheduleRoute(stops, m, zeros, '10:00', true)
    expect(manual.stops.map(s => s.id)).toEqual(['far', 'near', 'mid'])
    expect(manual.travelMinutes).toBe(9 + 8 + 4)
  })
  it('沒有開始時間的自訂站（使用者加的想去的地方）在手動順序下跟著使用者的順序，不被排到最後', () => {
    const withWant: ScheduledStop[] = [{ id: 'far', minutes: 10, candidate: P, custom: true }, stops[1]!, stops[2]!]
    expect(scheduleRoute(withWant, m, zeros, '10:00').stops.map(s => s.id)).toEqual(['near', 'mid', 'far'])
    expect(scheduleRoute(withWant, m, zeros, '10:00', true).stops.map(s => s.id)).toEqual(['far', 'near', 'mid'])
  })
})

describe('探索主題（theme）', () => {
  const near = (id: string, extra: Partial<P> = {}): P => ({ id, lat: SHIBUYA.lat + STEP, lng: SHIBUYA.lng, ...extra })
  const stop = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: id === 'meal' ? 'meal' : 'creative', title: id, minutes: 60, ...extra })
  const lastQuery = () => placesCalls[placesCalls.length - 1]!
  it.each(THEME_IDS.map(id => [id] as const))('探索站 theme=%s：送主題的查詢字串與類型，回應帶回 theme', async (id) => {
    mockGoogle(() => [near('shop-' + id, { primaryType: THEMES[id].includedType ?? 'cafe', types: [THEMES[id].includedType ?? 'cafe'] })])
    const out = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: id })] })
    expect(lastQuery().textQuery).toBe(THEMES[id].query)
    expect(lastQuery().includedType).toBe(THEMES[id].includedType)
    expect(out.stops[0]).toMatchObject({ id: 'creative', theme: id, candidate: { id: 'shop-' + id } })
  })
  it('主題表：7 個主題都有名稱與日文／原有查詢字串；藝文展覽沿用原本的查詢', () => {
    expect([...THEME_IDS]).toEqual(['view_cafe', 'good_coffee', 'fun', 'park', 'new_area', 'destination_meal', 'art'])
    for (const id of THEME_IDS) { expect(THEMES[id].label.length).toBeGreaterThan(0); expect(THEMES[id].query.length).toBeGreaterThan(0) }
    expect(THEMES.art).toMatchObject({ query: 'art gallery exhibition', includedType: 'art_gallery' })
  })
  it.each([['hack'], ['__proto__'], [42], [null], [{ a: 1 }], ['PARK']])('不合法的 theme（%j）：當沒帶——查詢與回應跟原本的探索站一樣', async (bad) => {
    mockGoogle(() => [near('gallery', { primaryType: 'art_gallery', types: ['art_gallery'] })])
    const out = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: bad })] })
    expect(lastQuery()).toMatchObject({ textQuery: 'art gallery exhibition', includedType: 'art_gallery' })
    expect(out.stops[0]!.theme).toBeUndefined()
    expect(out.stops[0]!.candidate!.id).toBe('gallery')
  })
  it('別站不能用的主題當沒帶：午餐站帶 park、咖啡站帶 park 都照原本的查詢；咖啡站可用 view_cafe／good_coffee', async () => {
    mockGoogle(() => [near('x', { primaryType: 'cafe', types: ['cafe'] })])
    await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('meal', { theme: 'park' })] })
    expect(lastQuery()).toMatchObject({ textQuery: 'Japanese set meal restaurant', includedType: 'restaurant' })
    const coffee = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('coffee', { theme: 'park' })] })
    expect(lastQuery()).toMatchObject({ textQuery: 'quiet specialty coffee cafe', includedType: 'cafe' })
    expect(coffee.stops[0]!.theme).toBeUndefined()
    for (const id of ['view_cafe', 'good_coffee'] as const) {
      const out = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('coffee', { theme: id })] })
      expect(lastQuery()).toMatchObject({ textQuery: THEMES[id].query, includedType: 'cafe' })
      expect(out.stops[0]!.theme).toBe(id)
    }
  })
  it('站 id 是 __proto__／constructor 又帶 theme：不當掉，當沒帶', async () => {
    mockGoogle(() => [near('x')])
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const res = await handler(post({ origin: SHIBUYA, areaOnly: false, stops: [{ id, kind: 'meal', title: 'x', minutes: 30, theme: 'park', themeArea: '原宿' }] }))
      expect(res.status).toBe(200)
      const out = await res.json() as Out
      expect(out.stops[0]!.theme).toBeUndefined()
      expect(out.stops[0]!.themeArea).toBeUndefined()
    }
  })
  it('指定地點的站不受主題影響：查的是使用者打的字（原樣）', async () => {
    mockGoogle(() => [near('fuglen', { primaryType: 'cafe', types: ['cafe'] })])
    await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: 'park', specified: true, place: 'Fuglen Tokyo' })] })
    expect(lastQuery().textQuery).toBe('Fuglen Tokyo')
    expect(lastQuery().includedType).toBeUndefined()
  })
  it('公園主題：Google 把公園同時標成 tourist_attraction 也算；沒有主題時照舊當地標擋掉', async () => {
    const park: P = near('yoyogi', { name: '代々木公園', primaryType: 'park', types: ['park', 'tourist_attraction'] })
    mockGoogle(() => [park])
    const themed = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: 'park' })] })
    expect(themed.stops[0]!.candidate!.id).toBe('yoyogi')
    const plain = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative')] })
    expect(plain.stops[0]).toMatchObject({ noCandidate: true, noCandidateReason: 'filtered' })
    // 公園主題也不放行真正的地標（primaryType 是 tourist_attraction）與車站。
    mockGoogle(() => [near('tower', { primaryType: 'tourist_attraction', types: ['tourist_attraction'] }), near('st', { primaryType: 'train_station', types: ['train_station'] })])
    expect((await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: 'park' })] })).stops[0]!.noCandidate).toBe(true)
  })
  it('主題站也要過既有門檻：評論數不到 50 的不派', async () => {
    mockGoogle(() => [near('tiny')])
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ places: [{ ...gPlace(near('tiny')), userRatingCount: 12 }] }), { status: 200 }))))
    const out = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop('creative', { theme: 'fun' })] })
    expect(out.stops[0]).toMatchObject({ noCandidate: true, noCandidateReason: 'filtered', title: '探索｜有趣的地方' })
  })
})

describe('沒去過的區域（theme=new_area＋themeArea）', () => {
  const inHarajuku: P = { id: 'harajuku-shop', lat: HARAJUKU.lat + STEP, lng: HARAJUKU.lng, primaryType: 'cafe', types: ['cafe'] }
  const inShibuya: P = { id: 'shibuya-shop', lat: SHIBUYA.lat + STEP, lng: SHIBUYA.lng, primaryType: 'cafe', types: ['cafe'] }
  const stop = (extra: Record<string, unknown> = {}) => ({ id: 'creative', kind: 'creative', title: '探索', minutes: 60, theme: 'new_area', themeArea: '原宿', ...extra })
  it('尊重這一站的區域：以原宿為中心查、只收原宿 1 公里內的店——即使全域開著「只在澀谷找店」', async () => {
    mockGoogle(() => [inShibuya, inHarajuku])
    const out = await run({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [stop()] })
    expect(placesCalls[0]!.locationBias!.circle).toEqual({ center: { latitude: HARAJUKU.lat, longitude: HARAJUKU.lng }, radius: 1000 })
    expect(placesCalls[0]!.textQuery).toBe(THEMES.new_area.query)
    expect(out.stops[0]).toMatchObject({ theme: 'new_area', themeArea: '原宿', candidate: { id: 'harajuku-shop' } })
  })
  it('那一區沒有合格的店：標無候選（area），不拿別區的店充數', async () => {
    mockGoogle(() => [inShibuya])
    const out = await run({ origin: SHIBUYA, areaOnly: false, stops: [stop()] })
    expect(out.stops[0]).toMatchObject({ noCandidate: true, noCandidateReason: 'area' })
    expect(out.stops[0]!.candidate).toBeUndefined()
  })
  it('離出發點太遠（超過搜尋半徑 3.5 公里）：照既有規則標找不到店（empty），不硬派', async () => {
    mockGoogle(() => [inHarajuku])
    const farOrigin = { lat: HARAJUKU.lat + 0.05, lng: HARAJUKU.lng } // 約 5.5 公里外
    const out = await run({ origin: farOrigin, areaOnly: false, stops: [stop()] })
    expect(out.stops[0]).toMatchObject({ noCandidate: true, noCandidateReason: 'empty' })
  })
  it('themeArea 不合法（未知地名、非字串）或主題不是 new_area：當沒帶，照全域規則', async () => {
    mockGoogle(() => [inShibuya, inHarajuku])
    for (const s of [stop({ themeArea: '火星' }), stop({ themeArea: 7 }), stop({ theme: 'fun', themeArea: '原宿' })]) {
      const out = await run({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [s] })
      expect(out.stops[0]!.themeArea).toBeUndefined()
      expect(out.stops[0]!.candidate!.id).toBe('shibuya-shop')
    }
  })
  it('換別站時，這一站在原宿的店照留（不因全域地區偏好是澀谷被清掉）', async () => {
    mockGoogle(() => [{ id: 'new-meal', lat: SHIBUYA.lat + STEP, lng: SHIBUYA.lng }])
    const explore = stop({ candidate: { ...cand('harajuku-shop', 1, HARAJUKU), types: ['cafe'], primaryType: 'cafe' } })
    const meal = { id: 'meal', kind: 'meal', title: '午餐', minutes: 45, candidate: cand('old-meal', 2) }
    const out = await run({ origin: SHIBUYA, area: '澀谷', areaOnly: true, shuffle: 'meal', stops: [meal, explore] })
    expect(out.stops.find(s => s.id === 'creative')!.candidate!.id).toBe('harajuku-shop')
    expect(out.stops.find(s => s.id === 'meal')!.candidate!.id).toBe('new-meal')
  })
})
