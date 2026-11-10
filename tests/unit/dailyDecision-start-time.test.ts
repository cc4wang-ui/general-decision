// @vitest-environment node
// PR-4 開始時間輸入：normalizeStartTime／effectiveStartTime／loadDaily 日範圍／
// buildDaily 不受影響／handler 端到端（fake timers＋Routes 成功 mock）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { effectiveStartTime, scheduleRoute, type ScheduledStop } from '../../src/dailyRouting.ts'
import { buildDaily, loadDaily, normalizeStartTime, type DailyState } from '../../src/dailyDecision.tsx'
import { urlText } from './mockFetch.ts'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const yesterdayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000))
const emptyIntent = () => ({ destination: '', destinationStation: '' as const, activities: [] as [] })
const state = (extra: Partial<DailyState> = {}): DailyState => ({
  day: '2026-11-03', area: '澀谷', currentPlace: '宮下公園',
  intent: emptyIntent(), appliedIntent: emptyIntent(), tasks: [], notes: [], avoid: [], ...extra,
})

describe('G1 — normalizeStartTime', () => {
  it('合法 HH:MM 原樣留著；邊界 00:00／23:59 也合法', () => {
    expect(normalizeStartTime('15:00')).toBe('15:00')
    expect(normalizeStartTime('00:00')).toBe('00:00')
    expect(normalizeStartTime('23:59')).toBe('23:59')
    expect(normalizeStartTime('09:05')).toBe('09:05')
  })
  it('未指定與不合法一律回空字串：不猜、不補、不修', () => {
    expect(normalizeStartTime('')).toBe('')
    expect(normalizeStartTime('9:00')).toBe('')
    expect(normalizeStartTime('24:00')).toBe('')
    expect(normalizeStartTime('15:60')).toBe('')
    expect(normalizeStartTime('15:00:00')).toBe('')
    expect(normalizeStartTime('abc')).toBe('')
    expect(normalizeStartTime(null)).toBe('')
    expect(normalizeStartTime(undefined)).toBe('')
    expect(normalizeStartTime(1500)).toBe('')
  })
})

describe('G2 — effectiveStartTime', () => {
  it('合法且比當下晚 → 用使用者的時間', () => {
    expect(effectiveStartTime('15:00', '13:20')).toBe('15:00')
    expect(effectiveStartTime('23:59', '09:00')).toBe('23:59')
  })
  it('合法但早於或等於當下 → 用伺服器當下時間（clamp：錨點不能在過去）', () => {
    expect(effectiveStartTime('08:00', '13:20')).toBe('13:20')
    expect(effectiveStartTime('13:20', '13:20')).toBe('13:20')
  })
  it('未指定／不合法 → 用伺服器當下時間，絕不用 09:00', () => {
    expect(effectiveStartTime('', '13:20')).toBe('13:20')
    expect(effectiveStartTime(undefined, '13:20')).toBe('13:20')
    expect(effectiveStartTime(null, '13:20')).toBe('13:20')
    expect(effectiveStartTime(1500, '13:20')).toBe('13:20')
    expect(effectiveStartTime('25:00', '13:20')).toBe('13:20')
    expect(effectiveStartTime('9:00', '13:20')).toBe('13:20')
    // 未指定時回的是伺服器當下值本身：13:20 不是 09:00，兩者分得清清楚楚。
    expect(effectiveStartTime('', '00:30')).toBe('00:30')
  })
  it('伺服器值本身不合法（防禦）→ 回伺服器值本身，不發明 09:00', () => {
    expect(effectiveStartTime('15:00', 'not-a-time')).toBe('not-a-time')
  })
})

describe('G3 — defaults／loadDaily 的 startTime', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })
  it('同日合法值保留；同日不合法值 → 空字串', () => {
    store.set(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks: [], notes: [], avoid: [], startTime: '15:00' }))
    expect(loadDaily().startTime).toBe('15:00')
    store.set(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks: [], notes: [], avoid: [], startTime: '25:00' }))
    expect(loadDaily().startTime).toBe('')
  })
  it('換天歸零：昨天的合法開始時間不帶到今天（日範圍，與 intent 同規則）', () => {
    store.set(KEY, JSON.stringify({ day: yesterdayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks: [], notes: [], avoid: [], startTime: '15:00' }))
    expect(loadDaily().startTime).toBe('')
  })
  it('缺欄位 → 空字串（舊存檔相容）', () => {
    store.set(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks: [], notes: [], avoid: [] }))
    expect(loadDaily().startTime).toBe('')
  })
})

describe('G4 — buildDaily 不受開始時間影響', () => {
  it('同一 state 只差 startTime，任務清單（id／specified／place）逐項相等', () => {
    const a = buildDaily(state())
    const b = buildDaily(state({ startTime: '15:00' }))
    expect(b.map(t => ({ id: t.id, specified: t.specified ?? false, place: t.place ?? '' })))
      .toEqual(a.map(t => ({ id: t.id, specified: t.specified ?? false, place: t.place ?? '' })))
  })
})

describe('G5 — handler 端到端：startTime 進 scheduleRoute 的錨點', () => {
  const handler = api.fetch
  const post = (body: unknown) =>
    new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  /** Places 回一間店；Routes 回全矩陣（步行 10 分鐘）。 */
  const mockGoogle = () => {
    const shop = {
      id: 'shop-1', displayName: { text: '食堂' }, formattedAddress: '東京都渋谷区',
      location: { latitude: 35.6595, longitude: 139.7005 },
      googleMapsUri: 'https://maps.google.com/?cid=shop-1',
      rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant',
    }
    const elements = [
      { originIndex: 0, destinationIndex: 0, duration: '0s', distanceMeters: 0 },
      { originIndex: 0, destinationIndex: 1, duration: '600s', distanceMeters: 500 },
      { originIndex: 1, destinationIndex: 0, duration: '600s', distanceMeters: 500 },
      { originIndex: 1, destinationIndex: 1, duration: '0s', distanceMeters: 0 },
    ]
    const f = vi.fn((url: string | URL | Request) => {
      if (urlText(url).includes('routes.googleapis.com')) return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ places: [shop] }), { status: 200 }))
    })
    vi.stubGlobal('fetch', f)
    return f
  }
  const body = (startTime?: string) => ({
    location: '渋谷駅', area: '澀谷', areaOnly: false,
    stops: [{ id: 'meal', kind: 'meal', title: '澀谷｜一人友善的日式定食', minutes: 45 }],
    ...(startTime === undefined ? {} : { startTime }),
  })
  type RouteBody = { stops?: Array<{ id: string; eta?: string }> }
  beforeEach(() => {
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    // 系統時間固定在 2026-11-10T00:00:00Z＝09:00 JST：伺服器當下時間是確定的 '09:00'。
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGoogle()
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('未來的開始時間 15:00 → 第一站 eta 15:10（錨點 15:00＋步行 10 分鐘）', async () => {
    const res = await handler(post(body('15:00')))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('15:10')
  })
  it('過去的開始時間 08:00 → clamp 到伺服器當下 09:00，第一站 eta 09:10', async () => {
    const res = await handler(post(body('08:00')))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('09:10')
  })
  it('不送 startTime → 預設＝伺服器當下 09:00，第一站 eta 09:10（與今天相同）', async () => {
    const res = await handler(post(body()))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('09:10')
  })
  it('不合法的 startTime → 用伺服器當下 09:00，第一站 eta 09:10', async () => {
    const res = await handler(post(body('25:00')))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('09:10')
  })
})

// G7 — 午夜跨日（PR-4 修正輪；案例來源：紅隊 RT-P3／RT-P4，轉為回歸測試）。
// 規則（見 DESIGN §8）：固定安排只有 HH:MM、沒有日期；對到同一條時間線時，
// 取「當天」與「隔天」兩次出現中離錨點最近的一次（距離相等時取當天）。
// ETA／離開時間跨過午夜時，etaDayOffset／departureDayOffset 記 1（錨點當日為 0）。
describe('G7 — 午夜跨日：day-aware 運算＋翌日標記', () => {
  const meal: ScheduledStop = { id: 'meal', title: '定食', minutes: 45, candidate: { lat: 35.6595, lng: 139.7005 } }
  const m1 = [[0, 10], [10, 0]]
  const d1 = [[0, 0.5], [0.5, 0]]
  const m3 = [[0, 10, 10], [10, 0, 10], [10, 10, 0]]
  const d3 = [[0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]]
  const fixedAt = (start: string): ScheduledStop => ({ id: 'fixed-1', title: '固定', minutes: 60, start, custom: true, locked: true, candidate: { lat: 35.66, lng: 139.71 } })
  it('錨點 23:59 單站 → eta 00:09（翌日）、離開 00:54（翌日）', () => {
    const r = scheduleRoute([meal], m1, d1, '23:59')
    expect(r.stops[0]?.eta).toBe('00:09')
    expect(r.stops[0]?.etaDayOffset).toBe(1)
    expect(r.stops[0]?.departure).toBe('00:54')
    expect(r.stops[0]?.departureDayOffset).toBe(1)
  })
  it('錨點 23:30 三站 → ETAs 23:40／00:35／01:30，day offset 0／1／1', () => {
    const stops: ScheduledStop[] = [
      { id: 'a', title: 'A', minutes: 45, candidate: { lat: 35.6, lng: 139.7 } },
      { id: 'b', title: 'B', minutes: 45, candidate: { lat: 35.61, lng: 139.71 } },
      { id: 'c', title: 'C', minutes: 45, candidate: { lat: 35.62, lng: 139.72 } },
    ]
    const n = 4
    const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 10)))
    const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 0.5)))
    const r = scheduleRoute(stops, m, d, '23:30')
    expect(r.stops.map((s) => s.eta)).toEqual(['23:40', '00:35', '01:30'])
    expect(r.stops.map((s) => s.etaDayOffset)).toEqual([0, 1, 1])
  })
  it('錨點 23:59＋固定安排 00:30 → 31 分鐘後（隔天），無衝突、絕無 1419 分鐘', () => {
    const r = scheduleRoute([meal, fixedAt('00:30')], m3, d3, '23:59')
    expect(r.stops.length).toBe(2)
    expect(r.conflicts).toEqual([])
    const fixed = r.stops.find((s) => s.id === 'fixed-1')
    expect(fixed?.eta).toBe('00:30')
    expect(fixed?.etaDayOffset).toBe(1)
    expect(fixed?.conflict).toBeUndefined()
    expect(r.conflicts.join(' ')).not.toContain('1419')
  })
  it('錨點 23:59＋固定安排 00:05（步行 10 分鐘）→ 只晚到 4 分鐘，不是 1419 分鐘', () => {
    const r = scheduleRoute([meal, fixedAt('00:05')], m3, d3, '23:59')
    expect(r.conflicts).toEqual(['固定：預計晚到 4 分鐘'])
    const fixed = r.stops.find((s) => s.id === 'fixed-1')
    expect(fixed?.eta).toBe('00:09')
    expect(fixed?.etaDayOffset).toBe(1)
    expect(fixed?.conflict).toBe('預計晚到 4 分鐘')
  })
  it('錨點 23:30＋固定 23:45＋固定 00:30 → 按絕對時間排序（23:45 在前），各站 offset 正確', () => {
    const b: ScheduledStop = { id: 'fixed-b', title: '固定 B', minutes: 30, start: '23:45', custom: true, locked: true, candidate: { lat: 35.66, lng: 139.71 } }
    const a: ScheduledStop = { id: 'fixed-a', title: '固定 A', minutes: 30, start: '00:30', custom: true, locked: true, candidate: { lat: 35.67, lng: 139.72 } }
    const r = scheduleRoute([a, b], m3, d3, '23:30')
    expect(r.stops.map((s) => s.id)).toEqual(['fixed-b', 'fixed-a'])
    expect(r.stops[0]?.eta).toBe('23:45')
    expect(r.stops[0]?.etaDayOffset).toBe(0)
    expect(r.stops[0]?.departure).toBe('00:15')
    expect(r.stops[0]?.departureDayOffset).toBe(1)
    expect(r.stops[1]?.eta).toBe('00:30')
    expect(r.stops[1]?.etaDayOffset).toBe(1)
    expect(r.conflicts).toEqual([])
  })
  it('同一站 eta 當天、離開翌日：錨點 23:30、步行 10 分鐘、停留 45 分鐘', () => {
    const r = scheduleRoute([meal], m1, d1, '23:30')
    expect(r.stops[0]?.eta).toBe('23:40')
    expect(r.stops[0]?.etaDayOffset).toBe(0)
    expect(r.stops[0]?.departure).toBe('00:25')
    expect(r.stops[0]?.departureDayOffset).toBe(1)
  })
  it('守衛（RT-P4，設計 §4.1 不變）：錨點 15:00＋固定 10:00 → 照舊晚到 310 分鐘', () => {
    const r = scheduleRoute([meal, fixedAt('10:00')], m3, d3, '15:00')
    expect(r.stops.map((s) => s.id).sort()).toEqual(['fixed-1', 'meal'])
    expect(r.conflicts.join(' ')).toContain('預計晚到 310 分鐘')
    expect(r.stops.find((s) => s.id === 'fixed-1')?.conflict).toContain('310')
    expect(r.stops.find((s) => s.id === 'fixed-1')?.etaDayOffset).toBe(0)
  })
  it('守衛（RT-P4）：錨點 15:00＋固定 15:00 → 晚到 10 分鐘；錨點 13:00＋固定 15:00 → 無衝突', () => {
    const same = scheduleRoute([meal, fixedAt('15:00')], m3, d3, '15:00')
    expect(same.conflicts.join(' ')).toContain('預計晚到 10 分鐘')
    expect(same.stops.length).toBe(2)
    const early = scheduleRoute([meal, fixedAt('15:00')], m3, d3, '13:00')
    expect(early.conflicts).toEqual([])
    expect(early.stops[0]?.id).toBe('meal')
    expect(early.stops[1]?.id).toBe('fixed-1')
    expect(early.stops[1]?.eta).toBe('15:00')
    expect(early.stops[1]?.etaDayOffset).toBe(0)
  })
  it('規則邊界（距離相等時取當天）：錨點 12:00＋固定 00:00 → 當天已過去，晚到 730 分鐘', () => {
    const r = scheduleRoute([meal, fixedAt('00:00')], m3, d3, '12:00')
    expect(r.conflicts.join(' ')).toContain('預計晚到 730 分鐘')
    expect(r.stops.find((s) => s.id === 'fixed-1')?.etaDayOffset).toBe(0)
  })
  it('規則邊界（隔天較近時取隔天）：錨點 23:00＋固定 10:00 → 翌日 10:00，無衝突', () => {
    const r = scheduleRoute([meal, fixedAt('10:00')], m3, d3, '23:00')
    expect(r.conflicts).toEqual([])
    const fixed = r.stops.find((s) => s.id === 'fixed-1')
    expect(fixed?.eta).toBe('10:00')
    expect(fixed?.etaDayOffset).toBe(1)
  })
})

describe('G8 — handler 端到端：午夜 ETA 帶 day offset＋回應含實際錨點', () => {
  const handler = api.fetch
  const post = (body: unknown) =>
    new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const mockGoogle = () => {
    const shop = {
      id: 'shop-1', displayName: { text: '食堂' }, formattedAddress: '東京都渋谷区',
      location: { latitude: 35.6595, longitude: 139.7005 },
      googleMapsUri: 'https://maps.google.com/?cid=shop-1',
      rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant',
    }
    const elements = [
      { originIndex: 0, destinationIndex: 0, duration: '0s', distanceMeters: 0 },
      { originIndex: 0, destinationIndex: 1, duration: '600s', distanceMeters: 500 },
      { originIndex: 1, destinationIndex: 0, duration: '600s', distanceMeters: 500 },
      { originIndex: 1, destinationIndex: 1, duration: '0s', distanceMeters: 0 },
    ]
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      if (urlText(url).includes('routes.googleapis.com')) return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ places: [shop] }), { status: 200 }))
    }))
  }
  const body = (startTime?: string) => ({
    location: '渋谷駅', area: '澀谷', areaOnly: false,
    stops: [{ id: 'meal', kind: 'meal', title: '澀谷｜一人友善的日式定食', minutes: 45 }],
    ...(startTime === undefined ? {} : { startTime }),
  })
  type RouteBody = { stops?: Array<{ id: string; eta?: string; etaDayOffset?: number }>; anchorTime?: string }
  beforeEach(() => {
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z')) // 09:00 JST
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGoogle()
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('開始時間 23:59 → 第一站 eta 00:09（翌日）、anchorTime 23:59', async () => {
    const res = await handler(post(body('23:59')))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('00:09')
    expect(data.stops?.[0]?.etaDayOffset).toBe(1)
    expect(data.anchorTime).toBe('23:59')
  })
  it('過去的開始時間 08:00 → anchorTime 是 clamp 後的 09:00', async () => {
    const res = await handler(post(body('08:00')))
    expect(res.status).toBe(200)
    const data = await res.json() as RouteBody
    expect(data.stops?.[0]?.eta).toBe('09:10')
    expect(data.anchorTime).toBe('09:00')
  })
})
