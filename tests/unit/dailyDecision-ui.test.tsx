// UI 誠實度（紅隊 §3.1）：認不出種類的店，不顯示「不要這類」按鈕；認得出的才顯示。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DailyDecision } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id: string, name: string, primaryType = 'restaurant', types: string[] = ['restaurant']) => ({
  id, name, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70,
  rating: 4.2, userRatingCount: 808, types, primaryType,
})
const seed = (candidate: ReturnType<typeof cand>) => {
  localStorage.setItem(KEY, JSON.stringify({
    day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', mode: 'creative',
    tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate }],
    notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
  }))
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('「不要這類」按鈕只在認得出種類時出現', () => {
  /** 等照片佔位跑完（PlacePhoto 的非同步狀態更新），避免 act 警告洗版。 */
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  it('d47食堂（認不出種類）：沒有「不要這類」按鈕；「不喜歡這間店」標明只排除這一間', async () => {
    seed(cand('d47', 'd47食堂'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByText(/不要「/)).toBeNull()
    const dislike = screen.getByText('不喜歡這間店')
    expect(dislike.getAttribute('title')).toBe('只排除這一間店（無法判斷種類）')
  })
  it('麺喜やしま（認得出是烏龍麵）：出現「不要『烏龍麵』這類」按鈕', async () => {
    seed(cand('yashima-1', '麺喜やしま'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('不要「烏龍麵」這類')).toBeTruthy()
    expect(screen.getByText('不喜歡這間店').getAttribute('title')).toBeNull()
  })
  it('叙々苑（認得出是燒肉）：出現「不要『燒肉』這類」按鈕', async () => {
    seed(cand('jojoen-1', '叙々苑', 'yakiniku_restaurant', ['yakiniku_restaurant', 'restaurant']))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('不要「燒肉」這類')).toBeTruthy()
  })
})

describe('地區偏好控制項（紅隊 round 5 F7，round 6）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const okResponse = (stops: unknown[] = []) => ({ ok: true, json: async () => ({ stops, routeVerified: false, conflicts: [] }) })
  const lastBody = (mock: ReturnType<typeof vi.fn>) => {
    const call = mock.mock.calls.find((c) => String(c[0]).includes('/api/daily-route'))
    return JSON.parse(String(call![1].body)) as Record<string, unknown>
  }
  it('地區控制項存在：預設澀谷、「只在這一帶找店」開啟（舊資料無 areaOnly 時移轉為開啟）', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect((screen.getByLabelText('地區偏好') as HTMLSelectElement).value).toBe('澀谷')
    expect((screen.getByLabelText('只在這一帶找店') as HTMLInputElement).checked).toBe(true)
  })
  it('切換地區到新宿再生成：請求體帶 area 新宿、areaOnly true', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).includes('/api/daily-route') ? okResponse() : { ok: false })
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByLabelText('地區偏好'), { target: { value: '新宿' } })
    expect((screen.getByLabelText('地區偏好') as HTMLSelectElement).value).toBe('新宿')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody(fetchMock).area).toBe('新宿')
    expect(lastBody(fetchMock).areaOnly).toBe(true)
  })
  it('關掉「只在這一帶找店」再生成：請求體 areaOnly false', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).includes('/api/daily-route') ? okResponse() : { ok: false })
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByLabelText('只在這一帶找店'))
    expect((screen.getByLabelText('只在這一帶找店') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody(fetchMock).areaOnly).toBe(false)
  })
})

describe('單站換站文案（紅隊 round 5 F8，round 6）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  it('按「換這一站」時狀態列說「正在找這一站的替代地點…」，主按鈕說「正在換這一站…」，不是整條路線的「搜尋中…」', async () => {
    seed(cand('s1', '某咖啡店'))
    let resolveFetch!: (v: unknown) => void
    const pending = new Promise((r) => { resolveFetch = r })
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => String(url).includes('/api/daily-route') ? pending : Promise.resolve({ ok: false })))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('↻ 換這一站'))
    await waitFor(() => expect(screen.getByText('正在找這一站的替代地點…')).toBeTruthy())
    expect(screen.getByTestId('daily-generate').textContent).toBe('正在換這一站…')
    expect(screen.getByTestId('daily-generate').textContent).not.toBe('搜尋中…')
    resolveFetch({ ok: true, json: async () => ({ stops: [], routeVerified: false, conflicts: [] }) })
    await waitFor(() => expect(screen.queryByText('正在找這一站的替代地點…')).toBeNull())
  })
})
