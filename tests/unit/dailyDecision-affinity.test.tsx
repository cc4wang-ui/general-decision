// @vitest-environment jsdom
// 2.4 行為回饋迴圈（前端）：行為寫進本機紀錄、請求帶 prefer／demote、清除按鈕、原因行、壞資料不壞頁面。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bodyText, urlText } from './mockFetch.ts'
vi.mock('../../src/placeMem.ts', () => ({
  blockedPlaceIds: () => Promise.resolve([]),
  markNeverAgain: async () => {},
  markDailyDislike: vi.fn(async () => {}),
  migrateDailyDislike: vi.fn(async () => {}),
  clearDislike: vi.fn(() => Promise.resolve({ sharedRemains: false })),
}))
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { affinityRequestFields, DailyDecision, loadDaily, recordRouteSignals, type DailyState, type DailyTask } from '../../src/dailyDecision.tsx'
import { AFFINITY_KEY, loadAffinity, recordAffinity, type AffinityEvent } from '../../src/dailyAffinity.ts'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id: string, name: string, primaryType = 'ramen_restaurant') => ({
  id, name, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70,
  rating: 4.2, userRatingCount: 808, types: [primaryType], primaryType,
})
const task = (id: string, extra: Partial<DailyTask> = {}): DailyTask => ({ id, title: id, minutes: 45, kind: 'meal', done: false, ...extra })
const seed = (tasks: DailyTask[], extra: Record<string, unknown> = {}) =>
  localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks, notes: [], avoid: ['gym', 'creative', 'coffee', 'shopping', 'rest'], seen: {}, disliked: [], dislikedKinds: [], ...extra }))
const settle = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
/** /api/daily-route mock：回 respond(body) 的 stops（預設把送來的 stops 原樣回）。 */
const routeFetch = (respond: (body: { stops: DailyTask[] }) => DailyTask[] = (b) => b.stops) => {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    if (!urlText(url).includes('/api/daily-route')) return Promise.resolve({ ok: false })
    const body = JSON.parse(bodyText(init?.body, '{}')) as { stops: DailyTask[] }
    bodies.push(body)
    return Promise.resolve({ ok: true, json: () => ({ stops: respond(body), routeVerified: false, conflicts: [] }) })
  }))
  return bodies
}
const generate = async (bodies: unknown[]) => {
  const n = bodies.length
  fireEvent.click(screen.getByTestId('daily-generate'))
  await waitFor(() => expect(bodies.length).toBe(n + 1))
  await waitFor(() => expect(screen.getByTestId('daily-generate').hasAttribute('disabled')).toBe(false))
  return bodies[bodies.length - 1] as Record<string, unknown>
}
const events = () => JSON.parse(localStorage.getItem(AFFINITY_KEY) ?? '[]') as AffinityEvent[]

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('標記完成 → 本機紀錄 +2', () => {
  it('勾「標記完成」寫一筆 ramen +2；取消勾選撤回；重複勾不重複加分', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByLabelText('標記完成'))
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ k: 'ramen', w: 2 })
    fireEvent.click(screen.getByLabelText('已完成'))
    expect(events()).toHaveLength(0)
    fireEvent.click(screen.getByLabelText('標記完成'))
    expect(events()).toHaveLength(1)
  })
  it('判不出種類的店（一般 restaurant）標完成：不記', async () => {
    seed([task('meal', { candidate: cand('d47', 'd47食堂', 'restaurant') })])
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByLabelText('標記完成'))
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
  })
  it('沒有真店的站標完成：不記', () => {
    seed([task('meal')])
    render(<DailyDecision onBack={() => {}} />)
    fireEvent.click(screen.getByLabelText('標記完成'))
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
  })
})

describe('請求帶 prefer／demote', () => {
  it('沒有紀錄：請求沒有 prefer／demote 欄位', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    const bodies = routeFetch()
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    const body = await generate(bodies)
    expect('prefer' in body).toBe(false)
    expect('demote' in body).toBe(false)
  })
  it('兩站拉麵都標完成 → 下一次請求帶 prefer:["ramen"]；清除後不帶，seen／disliked 不動', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') }), task('fixed-1', { custom: true, locked: true, place: 'x', candidate: cand('r2', '別的拉麵') })],
      { seen: { meal: ['old-1'] }, disliked: ['bad-1'], dislikedKinds: ['udon'] })
    const bodies = routeFetch()
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    for (const box of screen.getAllByLabelText('標記完成')) fireEvent.click(box)
    expect(events()).toHaveLength(2)
    const first = await generate(bodies)
    expect(first.prefer).toEqual(['ramen'])
    expect('demote' in first).toBe(false)
    fireEvent.click(screen.getByTestId('daily-clear-affinity'))
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
    expect(screen.getByText(/已清除學到的種類偏好/)).toBeTruthy()
    const second = await generate(bodies)
    expect('prefer' in second).toBe(false)
    const saved = loadDaily()
    expect(saved.seen?.meal).toContain('old-1')
    expect(saved.disliked).toEqual(['bad-1'])
    expect(saved.dislikedKinds).toEqual(['udon'])
  })
  it('只送過閾值的：ramen 3 分送 prefer、udon −3 分送 demote、soba 1 分不送', () => {
    const now = Date.now()
    recordAffinity('ramen', 3, now); recordAffinity('udon', -1, now); recordAffinity('udon', -1, now); recordAffinity('udon', -1, now); recordAffinity('soba', 1, now)
    expect(affinityRequestFields(now)).toEqual({ prefer: ['ramen'], demote: ['udon'] })
  })
})

describe('壞的 localStorage 內容不讓頁面壞掉', () => {
  it.each(['{bad json', '{"ramen":9}', '[1,"x",null,{"k":5}]', '"str"'])('偏好紀錄是 %s：頁面照常顯示、可搜尋、可標完成、可清除', async (raw) => {
    localStorage.setItem(AFFINITY_KEY, raw)
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    const bodies = routeFetch()
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.getByText('一蘭 渋谷店')).toBeTruthy()
    const body = await generate(bodies)
    expect('prefer' in body).toBe(false)
    fireEvent.click(screen.getByLabelText('標記完成'))
    expect(loadAffinity()).toHaveLength(1)
    fireEvent.click(screen.getByTestId('daily-clear-affinity'))
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
  })
})

describe('原因行（Q9）', () => {
  it('回應帶 preferHit 的站顯示「你常選這類，優先挑了這間」；沒帶的不顯示', async () => {
    seed([task('meal'), task('fixed-1', { custom: true, locked: true, place: 'x' })])
    routeFetch((b) => b.stops.map((s) => s.id === 'meal' ? { ...s, candidate: cand('r1', '一蘭 渋谷店'), preferHit: true } : { ...s, candidate: cand('r2', '別的拉麵') }))
    render(<DailyDecision onBack={() => {}} />)
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText('一蘭 渋谷店')).toBeTruthy())
    const reasons = screen.getAllByTestId('daily-prefer-reason')
    expect(reasons).toHaveLength(1)
    expect(reasons[0]!.textContent).toBe('你常選這類，優先挑了這間')
    expect(reasons[0]!.closest('article')!.textContent).toContain('一蘭 渋谷店')
  })
  it('沒有任何站帶 preferHit：不顯示原因行', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.queryByTestId('daily-prefer-reason')).toBeNull()
  })
  it('同一間店沒換（伺服器原樣保留、不回旗標）：原因行留著；店換了就拿掉；清除偏好也拿掉', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店'), preferHit: true })])
    let next = cand('r1', '一蘭 渋谷店')
    const bodies = routeFetch((b) => b.stops.map((s) => ({ id: s.id, title: s.title, minutes: s.minutes, kind: s.kind, done: s.done, candidate: next })))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    await generate(bodies)
    expect(screen.getByTestId('daily-prefer-reason')).toBeTruthy()
    next = cand('p9', '別的店', 'restaurant')
    await generate(bodies)
    await waitFor(() => expect(screen.getByText('別的店')).toBeTruthy())
    expect(screen.queryByTestId('daily-prefer-reason')).toBeNull()
  })
  it('清除偏好：卡片上的原因行一起拿掉', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店'), preferHit: true })])
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.getByTestId('daily-prefer-reason')).toBeTruthy()
    fireEvent.click(screen.getByTestId('daily-clear-affinity'))
    expect(screen.queryByTestId('daily-prefer-reason')).toBeNull()
  })
})

describe('recordRouteSignals：搜尋成功後的行為訊號', () => {
  const state = (tasks: DailyTask[]): DailyState => ({ ...loadDaily(), tasks })
  const NOW = 1_800_000_000_000
  it('手動指定的站這次解析到真店 → +3；同一天同一間再解析一次不重複記', () => {
    const proposed = state([task('meal', { specified: true, place: '一蘭' })])
    const stops = [task('meal', { specified: true, place: '渋谷', candidate: cand('r1', '一蘭 渋谷店') })]
    recordRouteSignals(proposed, stops, 'meal', proposed.tasks[0], NOW)
    recordRouteSignals(proposed, stops, 'meal', proposed.tasks[0], NOW + 5)
    expect(loadAffinity()).toHaveLength(1)
    expect(loadAffinity()[0]).toMatchObject({ k: 'ramen', w: 3 })
  })
  it('指定站本來就有候選（只是重排路線）→ 不記', () => {
    const c = cand('r1', '一蘭 渋谷店')
    const proposed = state([task('meal', { specified: true, place: '一蘭', candidate: c })])
    recordRouteSignals(proposed, proposed.tasks, undefined, undefined, NOW)
    expect(loadAffinity()).toEqual([])
  })
  it('指定站沒解析到店（無候選）→ 不記', () => {
    const proposed = state([task('meal', { specified: true, place: '不存在' })])
    recordRouteSignals(proposed, [task('meal', { specified: true, place: '不存在', noCandidate: true })], 'meal', proposed.tasks[0], NOW)
    expect(loadAffinity()).toEqual([])
  })
  it('自動站解析到店 → 不記（不是使用者的行為）', () => {
    const proposed = state([task('meal')])
    recordRouteSignals(proposed, [task('meal', { candidate: cand('r1', '一蘭 渋谷店') })], undefined, undefined, NOW)
    expect(loadAffinity()).toEqual([])
  })
  it('單站換店換掉自動挑的拉麵 → ramen −1；每換一次記一筆', () => {
    const proposed = state([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    const stops = [task('meal', { candidate: cand('p1', '定食屋', 'restaurant') })]
    recordRouteSignals(proposed, stops, 'meal', proposed.tasks[0], NOW)
    recordRouteSignals(proposed, stops, 'meal', proposed.tasks[0], NOW + 5)
    expect(loadAffinity().map((e) => [e.k, e.w])).toEqual([['ramen', -1], ['ramen', -1]])
  })
  it('完整重新生成（沒有 shuffle）→ 不記 −1', () => {
    const proposed = state([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    recordRouteSignals(proposed, [task('meal', { candidate: cand('r2', '別的拉麵') })], undefined, undefined, NOW)
    expect(loadAffinity()).toEqual([])
  })
  it('被換掉的店判不出種類 → 不記', () => {
    const proposed = state([task('meal', { candidate: cand('d47', 'd47食堂', 'restaurant') })])
    recordRouteSignals(proposed, [task('meal', { candidate: cand('r2', '別的拉麵') })], 'meal', proposed.tasks[0], NOW)
    expect(loadAffinity()).toEqual([])
  })
})

describe('按「換這一站」→ 本機紀錄 −1', () => {
  it('換掉自動挑的拉麵店：寫一筆 ramen −1', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    routeFetch((b) => b.stops.map((s) => ({ ...s, candidate: cand('p1', '定食屋', 'restaurant') })))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByText('↻ 換這一站'))
    await waitFor(() => expect(screen.getByText('定食屋')).toBeTruthy())
    expect(events().map((e) => [e.k, e.w])).toEqual([['ramen', -1]])
  })
  it('搜尋失敗：不記', async () => {
    seed([task('meal', { candidate: cand('r1', '一蘭 渋谷店') })])
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route') ? { ok: false, json: () => ({ message: '壞了' }) } : { ok: false })))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByText('↻ 換這一站'))
    await waitFor(() => expect(screen.getByText(/無法更新：壞了/)).toBeTruthy())
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
  })
})
