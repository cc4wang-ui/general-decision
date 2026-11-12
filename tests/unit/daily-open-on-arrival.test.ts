// @vitest-environment node
// daily-open-on-arrival：今日行程派出的自動站，在預估到店時間（ETA）要營業中、離打烊至少 10 分鐘。
// 目標契約 STOP 1–4（runs/daily-open-on-arrival/contract.md）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { openAtEta, MIN_OPEN_AT_ETA, type HoursPeriod } from '../../src/openAtEta.ts'
import { HARD_OPEN_MIN } from '../../src/scene.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }

// 2026-11-12 是星期四（Google day 4），2026-11-13 星期五（day 5）。
const THU = 4, FRI = 5
/** 每週規則：某一天 HH:MM–HH:MM（close 早於 open＝跨午夜到隔天）。 */
const weekly = (day: number, oh: number, om: number, ch: number, cm: number): HoursPeriod => ({
  open: { day, hour: oh, minute: om },
  close: { day: ch * 60 + cm <= oh * 60 + om ? (day + 1) % 7 : day, hour: ch, minute: cm },
})
const everyDay = (oh: number, ch: number): HoursPeriod[] => [0, 1, 2, 3, 4, 5, 6].map((d) => weekly(d, oh, 0, ch, 0))

/** 距離澀谷站 i×110 m 的餐廳；periods 為 undefined 時不帶營業時間（舊資料／Google 沒給）。 */
const shop = (id: string, i: number, periods?: HoursPeriod[], openNow = true) => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: SHIBUYA.lat + i * 0.001, longitude: SHIBUYA.lng },
  googleMapsUri: 'https://maps.google.com/?cid=' + id, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant',
  currentOpeningHours: periods ? { openNow, periods } : { openNow },
})

/** Places 依 includedType 回固定清單；Routes 回 n×n 矩陣，每段步行 legMin 分鐘。 */
function mockGoogle(places: unknown[], legMin = 10) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>
    calls.push({ url: urlText(url), body })
    if (urlText(url).includes('routes.googleapis.com')) {
      const n = (body.origins as unknown[]).length
      const elements = []
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) elements.push({ originIndex: i, destinationIndex: j, duration: (i === j ? 0 : legMin * 60) + 's', distanceMeters: i === j ? 0 : 800 })
      return Promise.resolve(new Response(JSON.stringify(elements), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify({ places }), { status: 200 }))
  }))
  return { calls, routes: () => calls.filter((c) => c.url.includes('routes.googleapis.com')), placesCalls: () => calls.filter((c) => c.url.includes('searchText')) }
}

type StopOut = { id: string; eta?: string; etaDayOffset?: number; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string; openAtEta?: string; title?: string; place?: string }
type Out = { stops: StopOut[]; missingStops?: { id: string; reason: string }[]; routeVerified?: boolean }
const run = async (body: unknown) => {
  const res = await handler(post(body))
  expect(res.status).toBe(200)
  return await res.json() as Out
}
const meal = (extra: Record<string, unknown> = {}) => [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, ...extra }]

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // 前 5 名隨機挑 → 固定挑第 1 名（最近的店），讓「先挑到會關門的店」可重現。
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((a) => { if (a instanceof Uint32Array) a.fill(0); return a })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T03:00:00Z')) // 東京 12:00（星期四）
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('daily-route：自動站到店時要開著（STOP 1）', () => {
  it('最近的店在 ETA（12:10）已打烊 → 不派，換下一個營業中的候選', async () => {
    const closedAtEta = shop('closes-1205', 0, [weekly(THU, 9, 0, 12, 5)])
    const openAtEtaShop = shop('open-all-day', 1, everyDay(11, 22))
    mockGoogle([closedAtEta, openAtEtaShop])
    const data = await run({ origin: SHIBUYA, stops: meal() })
    expect(data.routeVerified).toBe(true)
    const m = data.stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('open-all-day')
    expect(m.eta).toBe('12:10')
    expect(m.openAtEta).toBe('open')
  })
  it('ETA 時剩不到 10 分鐘（12:15 打烊，12:10 到）→ 不派', async () => {
    mockGoogle([shop('closes-1215', 0, [weekly(THU, 9, 0, 12, 15)]), shop('open-all-day', 1, everyDay(11, 22))])
    const m = (await run({ origin: SHIBUYA, stops: meal() })).stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('open-all-day')
  })
  it('ETA 時還沒開門（13:00 才開）→ 不派', async () => {
    mockGoogle([shop('opens-1300', 0, [weekly(THU, 13, 0, 22, 0)], false), shop('open-all-day', 1, everyDay(11, 22))])
    const m = (await run({ origin: SHIBUYA, stops: meal() })).stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('open-all-day')
  })
  it('全部候選在 ETA 都不營業 → 該站無候選，原因 closed，列進 missingStops', async () => {
    mockGoogle([shop('closes-1205', 0, [weekly(THU, 9, 0, 12, 5)]), shop('opens-1300', 1, [weekly(THU, 13, 0, 22, 0)], false)])
    const data = await run({ origin: SHIBUYA, stops: meal() })
    const m = data.stops.find((s) => s.id === 'meal')!
    expect(m.candidate).toBeUndefined()
    expect(m.noCandidate).toBe(true)
    expect(m.noCandidateReason).toBe('closed')
    expect(m.title).toBe('澀谷｜一人友善的日式定食')
    expect(data.missingStops).toEqual([{ id: 'meal', reason: 'closed' }])
  })
})

describe('daily-route：指定站、固定安排不換店（STOP 2）', () => {
  it('指定站在 ETA 不營業 → 店不換，回應標 openAtEta=closed 讓卡片警告', async () => {
    mockGoogle([shop('closes-1205', 0, [weekly(THU, 9, 0, 12, 5)]), shop('open-all-day', 1, everyDay(11, 22))])
    const m = (await run({ origin: SHIBUYA, stops: meal({ specified: true, place: '一蘭 渋谷' }) })).stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('closes-1205')
    expect(m.noCandidate).toBeFalsy()
    expect(m.openAtEta).toBe('closed')
  })
  it('固定安排在 ETA 快打烊 → 店不換，openAtEta=closing', async () => {
    mockGoogle([shop('closes-1215', 0, [weekly(THU, 9, 0, 12, 15)])])
    const m = (await run({ origin: SHIBUYA, stops: [{ id: 'fixed-1', kind: 'meal', title: '午餐約', minutes: 45, locked: true, place: '某店' }] })).stops.find((s) => s.id === 'fixed-1')!
    expect(m.candidate?.id).toBe('closes-1215')
    expect(m.openAtEta).toBe('closing')
  })
})

describe('daily-route：沒有營業時間資料不擋（STOP 3）', () => {
  it('候選沒有 periods → 照派，openAtEta=unknown', async () => {
    mockGoogle([shop('no-hours', 0)])
    const m = (await run({ origin: SHIBUYA, stops: meal() })).stops.find((s) => s.id === 'meal')!
    expect(m.candidate?.id).toBe('no-hours')
    expect(m.openAtEta).toBe('unknown')
  })
})

describe('daily-route：午夜跨日用翌日的營業時間（STOP 4）', () => {
  it('23:55 出發、00:05 翌日到：星期四凌晨營業的店不派，星期五凌晨營業的店才派', async () => {
    vi.setSystemTime(new Date('2026-11-12T14:55:00Z')) // 東京 23:55（星期四）
    const thuEarly = shop('thu-0000-0100', 0, [weekly(THU, 0, 0, 1, 0)])
    const friEarly = shop('fri-0000-0300', 1, [weekly(FRI, 0, 0, 3, 0)])
    mockGoogle([thuEarly, friEarly])
    const m = (await run({ origin: SHIBUYA, stops: meal() })).stops.find((s) => s.id === 'meal')!
    expect(m.eta).toBe('00:05')
    expect(m.etaDayOffset).toBe(1)
    expect(m.candidate?.id).toBe('fri-0000-0300')
    expect(m.openAtEta).toBe('open')
  })
})

describe('daily-route：Places 費用不增加（STOP 7）', () => {
  it('換候選不多打 Places：用第一次搜尋的同一池候選', async () => {
    const g = mockGoogle([shop('closes-1205', 0, [weekly(THU, 9, 0, 12, 5)]), shop('open-all-day', 1, everyDay(11, 22))])
    await run({ origin: SHIBUYA, stops: meal() })
    expect(g.placesCalls()).toHaveLength(1)
    // field mask 不變：仍是原本那一串（currentOpeningHours 已在裡面）。
    const mask = (vi.mocked(fetch).mock.calls[0]![1]!.headers as Record<string, string>)['X-Goog-FieldMask']
    expect(mask).toBe('places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours,places.rating,places.userRatingCount,places.types,places.primaryType')
  })
})

describe('openAtEta（純函式）', () => {
  it('10 分鐘門檻跟主程式 N2（HARD_OPEN_MIN）同一個數', () => {
    expect(MIN_OPEN_AT_ETA).toBe(HARD_OPEN_MIN)
  })
  it('沒有資料／格式不對 → unknown', () => {
    expect(openAtEta(undefined, '2026-11-12', '12:00')).toBe('unknown')
    expect(openAtEta([], '2026-11-12', '12:00')).toBe('unknown')
    expect(openAtEta([{ open: { day: 9 } }], '2026-11-12', '12:00')).toBe('unknown')
    expect(openAtEta(everyDay(9, 18), '2026-11-12', undefined)).toBe('unknown')
    expect(openAtEta(everyDay(9, 18), 'bad', '12:00')).toBe('unknown')
  })
  it('24 小時營業（只有 open、沒有 close）→ open', () => {
    expect(openAtEta([{ open: { day: 0, hour: 0, minute: 0 } }], '2026-11-12', '03:00')).toBe('open')
  })
  it('每週規則：營業中／快打烊／已打烊／未開門', () => {
    const p = everyDay(11, 22)
    expect(openAtEta(p, '2026-11-12', '12:00')).toBe('open')
    expect(openAtEta(p, '2026-11-12', '21:51')).toBe('closing')
    expect(openAtEta(p, '2026-11-12', '21:50')).toBe('open')
    expect(openAtEta(p, '2026-11-12', '22:00')).toBe('closed')
    expect(openAtEta(p, '2026-11-12', '10:59')).toBe('closed')
  })
  it('跨午夜營業（18:00–02:00）：翌日 01:00 營業中；相鄰時段合併不誤判快打烊', () => {
    expect(openAtEta(everyDay(18, 2), '2026-11-12', '01:00', 1)).toBe('open')
    const split = [weekly(THU, 18, 0, 0, 0), weekly(FRI, 0, 0, 3, 0)]
    expect(openAtEta(split, '2026-11-12', '23:55')).toBe('open')
  })
  it('定休日：星期四沒有時段 → closed', () => {
    const noThu = everyDay(11, 22).filter((x) => x.open!.day !== THU)
    expect(openAtEta(noThu, '2026-11-12', '12:00')).toBe('closed')
    expect(openAtEta(noThu, '2026-11-12', '12:00', 1)).toBe('open')
  })
  it('帶日期的 periods：特殊休業日以實際日期為準；過期資料退回每週規則', () => {
    const d = (day: number) => ({ year: 2026, month: 11, day })
    // 11-12 星期四特別休業（只有 11-13 的時段），每週規則若用星期幾會誤判。
    const dated: HoursPeriod[] = [{ open: { day: FRI, hour: 11, minute: 0, date: d(13) }, close: { day: FRI, hour: 22, minute: 0, date: d(13) } }]
    expect(openAtEta(dated, '2026-11-13', '12:00')).toBe('open')
    expect(openAtEta(dated, '2026-11-13', '22:30')).toBe('closed')
    // 資料是上週的（11-05 星期四）：ETA 不在涵蓋範圍 → 用星期幾規則（星期四 11–22）。
    const stale: HoursPeriod[] = [{ open: { day: THU, hour: 11, minute: 0, date: d(5) }, close: { day: THU, hour: 22, minute: 0, date: d(5) } }]
    expect(openAtEta(stale, '2026-11-12', '12:00')).toBe('open')
    expect(openAtEta(stale, '2026-11-12', '23:00')).toBe('closed')
  })
})

describe('卡片文案（前端）', async () => {
  const { openStatusText, noCandidateText } = await import('../../src/dailyDecision.tsx')
  type T = Parameters<typeof openStatusText>[0]
  const base = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: { id: 'x', name: 'x', address: '', mapUrl: '', lat: 0, lng: 0, openNow: true } } as T
  it('有 ETA 時講到店時的營業狀態；沒有 ETA 退回搜尋當下的 openNow', () => {
    expect(openStatusText({ ...base, eta: '12:10', openAtEta: 'open' })).toBe('預計到店時營業中')
    expect(openStatusText({ ...base, eta: '12:10', openAtEta: 'closed' })).toBe('預計到店時未營業')
    expect(openStatusText({ ...base, eta: '12:10', openAtEta: 'unknown' })).toBe('營業狀態未確認')
    expect(openStatusText({ ...base, openAtEta: 'closed' })).toBe('Google 顯示目前營業中')
  })
  it('無候選原因 closed 有白話說明', () => {
    expect(noCandidateText({ ...base, candidate: undefined, noCandidate: true, noCandidateReason: 'closed' }, '澀谷')).toContain('到店時還開著')
  })
})
