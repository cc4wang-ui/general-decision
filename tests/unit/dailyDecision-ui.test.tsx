// UI 誠實度（紅隊 §3.1）：認不出種類的店，不顯示「不要這類」按鈕；認得出的才顯示。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
/** placeMem 封鎖清單 mock：截斷通知測試需要 150 個封鎖 id；其他測試不按「不喜歡」，不受影響。 */
vi.mock('../../src/placeMem.ts', () => ({
  blockedPlaceIds: async () => Array.from({ length: 150 }, (_, i) => 'p' + i),
  markNeverAgain: async () => {},
  clearDislike: async () => {},
}))
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
  it('麺喜やしま（round 7 是漏判）：沒有「不要這類」按鈕；「不喜歡這間店」標明只排除這一間', async () => {
    seed(cand('yashima-1', '麺喜やしま'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByText(/不要「/)).toBeNull()
    const dislike = screen.getByText('不喜歡這間店')
    expect(dislike.getAttribute('title')).toBe('只排除這一間店（無法判斷種類）')
  })
  it('讃岐うどん まるや（認得出是烏龍麵）：出現「不要『烏龍麵』這類」按鈕', async () => {
    seed(cand('maruya-1', '讃岐うどん まるや'))
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

describe('無候選站顯示（紅隊 round 6 L1／L2，round 7）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const seedNoCandidate = (reason: 'area' | 'filtered' | 'empty') => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', mode: 'creative',
      tasks: [{ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: reason }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
  }
  it('原因 area：顯示地區偏好是原因、怎麼解除（不是籠統的「地點尚未確認」）', async () => {
    seedNoCandidate('area')
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText(/地區偏好（澀谷，1 公里內）可能擋住了附近的店/)).toBeTruthy()
    expect(screen.getByText(/關掉「只在這一帶找店」或改選其他地區再試/)).toBeTruthy()
  })
  it('原因 filtered：顯示都被排除了、要清「不喜歡」或放寬條件', async () => {
    seedNoCandidate('filtered')
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText(/符合的店都被排除了/)).toBeTruthy()
  })
  it('無候選站有「換這一站」按鈕（可以重找），沒有「不喜歡這間店」按鈕（沒有店可按）', async () => {
    seedNoCandidate('area')
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('↻ 換這一站')).toBeTruthy()
    expect(screen.queryByText('不喜歡這間店')).toBeNull()
    expect(screen.queryByText(/不要「/)).toBeNull()
  })
  it('round 8 F7：原因 area 的卡片有連到地區偏好設定的連結（href #daily-area），不是只寫文字', async () => {
    seedNoCandidate('area')
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const link = screen.getByText('前往地區偏好設定')
    expect(link.getAttribute('href')).toBe('#daily-area')
    // 地區偏好 select 真的有這個 id，連結點下去才到得了
    expect((screen.getByLabelText('地區偏好') as HTMLSelectElement).id).toBe('daily-area')
  })
  it('round 8 F7：原因 filtered 的卡片有「清除『不喜歡』的紀錄」按鈕，按了真的清掉 localStorage 的 disliked／dislikedKinds 並顯示確認', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', mode: 'creative',
      tasks: [{ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'filtered' }],
      notes: [], avoid: [], seen: {}, disliked: ['d1', 'd2'], dislikedKinds: ['udon'],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('清除「不喜歡」的紀錄'))
    await waitFor(() => expect(screen.getByText(/已清除 2 家「不喜歡」的店與 1 種「不要這類」/)).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { disliked: string[]; dislikedKinds: string[] }
    expect(saved.disliked).toEqual([])
    expect(saved.dislikedKinds).toEqual([])
  })
  it('round 8 F7：原因 filtered 但沒有不喜歡紀錄時，按鈕照樣在，按了說目前沒有紀錄', async () => {
    seedNoCandidate('filtered')
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('清除「不喜歡」的紀錄'))
    await waitFor(() => expect(screen.getByText('目前沒有「不喜歡」的紀錄。')).toBeTruthy())
  })
  it('round 8 A：麺処讃岐うどん配 noodle_shop，顯示「不要『烏龍麵』這類」——不是「不要『麵食』這類」（紅隊 round 7 A 的 UI 陷阱）', async () => {
    seed(cand('udon-noodle', '麺処讃岐うどん', 'noodle_shop', ['noodle_shop', 'restaurant']))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('不要「烏龍麵」這類')).toBeTruthy()
    expect(screen.queryByText('不要「麵食」這類')).toBeNull()
  })
})

describe('排除清單截斷通知（round 7）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  it('placeMem 封鎖 150＋不喜歡 100 → 生成後顯示截斷通知（50 個未送出）', async () => {
    const disliked = Array.from({ length: 100 }, (_, i) => 'd' + i)
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', mode: 'creative',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') }],
      notes: [], avoid: [], seen: {}, disliked, dislikedKinds: [],
    }))
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).includes('/api/daily-route')
      ? { ok: true, json: async () => ({ stops: [], routeVerified: false, conflicts: [] }) }
      : { ok: false })
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/排除清單已滿（上限 200）：50 個/)).toBeTruthy())
  })
})
