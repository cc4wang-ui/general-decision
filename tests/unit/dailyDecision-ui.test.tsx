// UI 誠實度（紅隊 §3.1）：認不出種類的店，不顯示「不要這類」按鈕；認得出的才顯示。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bodyText, urlText } from './mockFetch.ts'
/** placeMem 封鎖清單 mock：截斷通知測試需要 150 個封鎖 id；其他測試不按「不喜歡」，不受影響。 */
vi.mock('../../src/placeMem.ts', () => ({
  blockedPlaceIds: () => Promise.resolve(Array.from({ length: 150 }, (_, i) => 'p' + i)),
  markNeverAgain: async () => {},
  markDailyDislike: vi.fn(async () => {}),
  migrateDailyDislike: vi.fn(async () => {}),
  clearDislike: vi.fn(() => Promise.resolve({ sharedRemains: false })),
}))
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { buildDaily, DailyDecision, type DailyIntent, type DailyState } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id: string, name: string, primaryType = 'restaurant', types: string[] = ['restaurant']) => ({
  id, name, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70,
  rating: 4.2, userRatingCount: 808, types, primaryType,
})
const seed = (candidate: ReturnType<typeof cand>) => {
  localStorage.setItem(KEY, JSON.stringify({
    day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
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
  it('丸亀製麺 渋谷店（品牌認得出是烏龍麵）：出現「不要『烏龍麵』這類」按鈕', async () => {
    seed(cand('marugame-1', '丸亀製麺 渋谷店'))
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
  const okResponse = (stops: unknown[] = []) => ({ ok: true, json: () => ({ stops, routeVerified: false, conflicts: [] }) })
  const lastBody = (mock: ReturnType<typeof vi.fn>) => {
    const call = mock.mock.calls.find((c) => String(c[0]).includes('/api/daily-route')) as [unknown, RequestInit | undefined] | undefined
    return JSON.parse(bodyText(call?.[1]?.body, '{}')) as Record<string, unknown>
  }
  it('地區控制項存在：預設澀谷、「只在這一帶找店」開啟（舊資料無 areaOnly 時移轉為開啟）', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByLabelText<HTMLSelectElement>('地區偏好').value).toBe('澀谷')
    expect(screen.getByLabelText<HTMLInputElement>('只在這一帶找店').checked).toBe(true)
  })
  it('切換地區到新宿再生成：請求體帶 area 新宿、areaOnly true', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route') ? okResponse() : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByLabelText('地區偏好'), { target: { value: '新宿' } })
    expect(screen.getByLabelText<HTMLSelectElement>('地區偏好').value).toBe('新宿')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody(fetchMock).area).toBe('新宿')
    expect(lastBody(fetchMock).areaOnly).toBe(true)
  })
  it('關掉「只在這一帶找店」再生成：請求體 areaOnly false', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route') ? okResponse() : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByLabelText('只在這一帶找店'))
    expect(screen.getByLabelText<HTMLInputElement>('只在這一帶找店').checked).toBe(false)
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
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => urlText(url).includes('/api/daily-route') ? pending : Promise.resolve({ ok: false })))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('↻ 換這一站'))
    await waitFor(() => expect(screen.getByText('正在找這一站的替代地點…')).toBeTruthy())
    expect(screen.getByTestId('daily-generate').textContent).toBe('正在換這一站…')
    expect(screen.getByTestId('daily-generate').textContent).not.toBe('搜尋中…')
    resolveFetch({ ok: true, json: () => ({ stops: [], routeVerified: false, conflicts: [] }) })
    await waitFor(() => expect(screen.queryByText('正在找這一站的替代地點…')).toBeNull())
  })
})

describe('無候選站顯示（紅隊 round 6 L1／L2，round 7）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const seedNoCandidate = (reason: 'area' | 'filtered' | 'empty') => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
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
    expect(screen.getByLabelText<HTMLSelectElement>('地區偏好').id).toBe('daily-area')
  })
  it('round 8 F7：原因 filtered 的卡片有「清除『不喜歡』的紀錄」按鈕，按了真的清掉 localStorage 的 disliked／dislikedKinds 並顯示確認', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
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
  it('round 8 A（round 14 更正）：麺処讃岐うどん配 noodle_shop，顯示「不要『麵食』這類」——店名不再判烏龍麵，泛用 noodle 是唯一種類（紅隊 round 7 A 的 UI 陷阱 round 14 起不存在）', async () => {
    seed(cand('udon-noodle', '麺処讃岐うどん', 'noodle_shop', ['noodle_shop', 'restaurant']))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('不要「麵食」這類')).toBeTruthy()
    expect(screen.queryByText('不要「烏龍麵」這類')).toBeNull()
  })
  it('round 14：丸亀製麺配 noodle_shop，顯示「不要『烏龍麵』這類」——品牌勝過泛用 noodle', async () => {
    seed(cand('marugame-noodle', '丸亀製麺 渋谷店', 'noodle_shop', ['noodle_shop', 'restaurant']))
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
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') }],
      notes: [], avoid: [], seen: {}, disliked, dislikedKinds: [],
    }))
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/排除清單已滿（上限 200）：50 個/)).toBeTruthy())
  })
})

describe('round 10：F1a-load（載入清掉的車站候選要說原因）＋ clear-swallow（清除失敗要報錯）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  it('F1a-load：舊存檔的 meal 帶車站候選，載入後卡片顯示 denied 原因（車站或地標），不是只留舊店名', async () => {
    const stationCand = { id: 'shibuya-station', name: '渋谷駅', address: '渋谷駅地下 1F', mapUrl: 'https://maps.google.com/?cid=shibuya-station', lat: 35.6595, lng: 139.7005, rating: 4.2, userRatingCount: 9000, types: ['transit_station', 'train_station'], primaryType: 'transit_station' }
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', 
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, place: '渋谷駅地下 1F', candidate: stationCand }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText(/這一站之前選的地點是車站或地標/)).toBeTruthy()
    expect(screen.getByText(/請按「換這一站」重新搜尋/)).toBeTruthy()
    // 標題照留（round 9 F1a），但卡片不再「只剩舊店名加一句地點尚未確認」
    expect(screen.getByText('↻ 換這一站')).toBeTruthy()
  })
  it('clear-swallow：placeMem 寫入失敗時顯示失敗、不報成功，localStorage 的 disliked 不動（可以再按一次）', async () => {
    const { clearDislike } = await import('../../src/placeMem.ts')
    vi.mocked(clearDislike).mockRejectedValueOnce(new Error('IndexedDB 寫入失敗'))
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
      tasks: [{ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'filtered' }],
      notes: [], avoid: [], seen: {}, disliked: ['d1', 'd2'], dislikedKinds: ['udon'],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('清除「不喜歡」的紀錄'))
    await waitFor(() => expect(screen.getByText(/清除失敗：無法寫入封鎖紀錄/)).toBeTruthy())
    expect(screen.queryByText(/已清除 2 家/)).toBeNull()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { disliked: string[]; dislikedKinds: string[] }
    expect(saved.disliked).toEqual(['d1', 'd2'])
    expect(saved.dislikedKinds).toEqual(['udon'])
  })
})

describe('round 11：F2b（不喜歡寫入失敗不進清單）＋ 完整重新生成送 seen ＋ 清除時 sharedRemains 誠實提示', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const routeFetch = () => {
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  /** 最後一次 /api/daily-route 請求的 body（round 6 地區偏好區塊的既有 helper，型別正確）。 */
  const lastBody = (mock: ReturnType<typeof vi.fn>) => {
    const call = mock.mock.calls.find((c) => String(c[0]).includes('/api/daily-route')) as [unknown, RequestInit | undefined] | undefined
    return JSON.parse(bodyText(call?.[1]?.body, '{}')) as Record<string, unknown>
  }
  it('F2b：markDailyDislike 寫入失敗 → 顯示失敗、不進 localStorage 的 disliked、店還在（再按一次可以重試）', async () => {
    const { markDailyDislike } = await import('../../src/placeMem.ts')
    vi.mocked(markDailyDislike).mockRejectedValueOnce(new Error('IndexedDB 寫入失敗'))
    seed(cand('d47', 'd47食堂'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('不喜歡這間店'))
    await waitFor(() => expect(screen.getByText('「不喜歡」的紀錄寫入失敗，請再按一次。')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { disliked: string[]; seen?: Record<string, string[]> }
    expect(saved.disliked).toEqual([])
    // 店還在卡片上（沒有被換掉、也沒有被當成已排除）
    expect(screen.getByText('d47食堂')).toBeTruthy()
    expect(screen.getByText('不喜歡這間店')).toBeTruthy()
  })
  it('不喜歡成功：id 進 localStorage 的 disliked、seen 也記下，重新搜尋的請求 exclude 包含它', async () => {
    const fetchMock = routeFetch()
    seed(cand('d47', 'd47食堂'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('不喜歡這間店'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { disliked: string[]; seen?: Record<string, string[]> }
    expect(saved.disliked).toEqual(['d47'])
    expect(saved.seen?.meal).toEqual(['d47'])
    const body = lastBody(fetchMock) as { exclude: string[]; shuffle?: string }
    expect(body.exclude).toContain('d47')
    expect(body.shuffle).toBe('meal')
  })
  it('完整重新生成送 seen：存檔 seen 裡的店＋目前候選都在請求的 seen 裡，且沒有 shuffle 欄位', async () => {
    const fetchMock = routeFetch()
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('cur-1', '目前的店') }],
      notes: [], avoid: [], seen: { meal: ['old-1', 'old-2'] }, disliked: [], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = lastBody(fetchMock) as { seen?: string[]; shuffle?: string }
    expect(body.seen).toEqual(expect.arrayContaining(['old-1', 'old-2', 'cur-1']))
    expect('shuffle' in body).toBe(false)
  })
  it('清除「不喜歡」時 sharedRemains 為真 → 提示說其中幾家仍有其他封鎖紀錄、仍不會出現（不是只報成功）', async () => {
    const { clearDislike } = await import('../../src/placeMem.ts')
    vi.mocked(clearDislike).mockResolvedValue({ sharedRemains: true })
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', 
      tasks: [{ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'filtered' }],
      notes: [], avoid: [], seen: {}, disliked: ['d1', 'd2'], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByText('清除「不喜歡」的紀錄'))
    await waitFor(() => expect(screen.getByText(/已清除 2 家「不喜歡」的店/)).toBeTruthy())
    expect(screen.getByText(/其中 2 家仍有其他封鎖紀錄，仍不會出現/)).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { disliked: string[] }
    expect(saved.disliked).toEqual([])
  })
})

describe('G6 — 意圖輸入（2.0 重做：結構化輸入——目的地＋活動選項）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const destInput = () => screen.getByTestId<HTMLInputElement>('daily-intent-destination')
  const stationSelect = () => screen.getByTestId<HTMLSelectElement>('daily-intent-destination-station')
  const summary = () => screen.getByTestId('daily-intent-summary').textContent
  const skipSeed = (intent: DailyIntent) => {
    const base: DailyState = { day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', intent, appliedIntent: { ...intent, activities: [...intent.activities] }, tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [] }
    // 每站掛一個與目錄標題同名的候選：loadDaily 的載入過濾器只留 custom／locked／done／
    // rest／有候選／無候選的站，無候選的自動站重開頁面會被濾掉；候選名＝標題，卡片標題不變。
    localStorage.setItem(KEY, JSON.stringify({ ...base, tasks: buildDaily(base).map(t => ({ ...t, candidate: cand('c-' + t.id, t.title) })) }))
  }
  it('舊意圖框整組消失，改為目的地欄位＋站選單＋5 個活動 checkbox＋永遠渲染的摘要', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByTestId('daily-intent')).toBeNull()
    expect(screen.queryByTestId('daily-intent-hint')).toBeNull()
    expect(destInput().getAttribute('aria-label')).toBe('想去哪裡')
    expect(destInput().placeholder).toContain('可留空')
    expect(destInput().maxLength).toBe(120)
    expect(destInput().value).toBe('')
    expect(stationSelect().value).toBe('')
    for (const id of ['gym', 'meal', 'creative', 'coffee', 'shopping']) {
      expect(screen.getByTestId(`daily-intent-activity-${id}`)).toBeTruthy()
    }
    expect(summary()).toBe('今天沒有指定目的地或活動，留空就隨興探索。')
  })
  it('填目的地＋選站 → 摘要顯示目的地 → 午餐站、寫進 localStorage（結構化物件）、不觸發伺服器請求', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn((_url: string | URL | Request) => Promise.resolve({ ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(destInput(), { target: { value: '一蘭' } })
    fireEvent.change(stationSelect(), { target: { value: 'meal' } })
    expect(summary()).toBe('目的地：一蘭 → 午餐站')
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('一蘭')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: DailyIntent }
    expect(saved.intent).toEqual({ destination: '一蘭', destinationStation: 'meal', activities: [] })
    expect(fetchMock.mock.calls.some(c => urlText(c[0]).includes('/api/daily-route'))).toBe(false)
  })
  it('只填目的地不選站 → 摘要顯示惰性警告，目的地站不被指定', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(destInput(), { target: { value: '一蘭' } })
    expect(summary()).toBe('目的地：一蘭（請選是哪一站，否則不會進路線）')
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('')
    expect(destInput().value).toBe('一蘭')
  })
  it('便利預設可見（目的地輸入路徑）：先勾唯一活動再填目的地，選單值自動變為該活動的站', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-intent-activity-coffee'))
    expect(stationSelect().value).toBe('')
    fireEvent.change(destInput(), { target: { value: '一蘭' } })
    // 目的地輸入處理器套用便利預設（applyConvenienceDefault）：唯一活動 coffee → 站預設為 coffee
    expect(stationSelect().value).toBe('coffee')
    expect(summary()).toBe('目的地：一蘭 → 咖啡站')
  })
  it('勾選活動 → 摘要顯示「想做：…」（catalog 順序）；便利預設可見：填目的地後勾唯一活動，選單值自動變為該活動的站', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-intent-activity-coffee'))
    expect(summary()).toBe('想做：喝咖啡')
    fireEvent.click(screen.getByTestId('daily-intent-activity-meal'))
    expect(summary()).toBe('想做：吃飯、喝咖啡')
    fireEvent.change(destInput(), { target: { value: '一蘭' } })
    // 目的地已填、站未選、恰好只選一個活動時預設才觸發：目前勾了兩個活動，站仍為空
    expect(stationSelect().value).toBe('')
    fireEvent.click(screen.getByTestId('daily-intent-activity-coffee'))
    // 只剩一個活動 → 便利預設把站設為該活動的站，選單立即顯示
    expect(stationSelect().value).toBe('meal')
    expect(summary()).toBe('目的地：一蘭 → 午餐站')
  })
  it('G3「今天略過」擴充：略過目的地站 → 活動勾選移除、站清為空、目的地文字保留、該站不在路線裡', async () => {
    skipSeed({ destination: '一蘭', destinationStation: 'meal', activities: ['meal', 'coffee'] })
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    const mealCard = screen.getByText('澀谷｜一人友善的日式定食').closest('article')!
    fireEvent.click(within(mealCard).getByText('今天略過'))
    expect(screen.queryByText('澀谷｜一人友善的日式定食')).toBeNull()
    expect(destInput().value).toBe('一蘭')
    expect(stationSelect().value).toBe('')
    expect(screen.getByTestId<HTMLInputElement>('daily-intent-activity-meal').checked).toBe(false)
    expect(screen.getByTestId<HTMLInputElement>('daily-intent-activity-coffee').checked).toBe(true)
    expect(summary()).toBe('目的地：一蘭（請選是哪一站，否則不會進路線）；想做：喝咖啡')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: DailyIntent; avoid: string[] }
    expect(saved.intent).toEqual({ destination: '一蘭', destinationStation: '', activities: ['coffee'] })
    expect(saved.avoid).toContain('meal')
    // 受影響站 coffee：不是指定站、place 不是一蘭。舊缺陷：略過後 buildDaily 在同一次
    // 點擊裡把目的地靜默附到剩下的唯一活動站（coffee 指定為一蘭），摘要卻同時顯示惰性警告。
    expect(screen.getByText('安靜咖啡廳｜閱讀、寫下 3 個新觀察')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('安靜咖啡廳｜閱讀、寫下 3 個新觀察 指定地點').value).toBe('')
  })
  it('RT4-F1「略過後再選站」組合：先略過 meal 再用選單選午餐站 → avoid 解除、meal 卡回到路線且指定為一蘭、摘要與路線一致', async () => {
    // 紅隊 RT4-F1：舊碼下選單顯示午餐站、摘要寫「目的地：一蘭 → 午餐站」，但 avoid 仍含 meal、
    // 路線裡根本沒有 meal 卡——摘要宣稱與路線／存檔狀態矛盾。此測試同時斷言存檔 state、
    // 路線裡的 meal 卡、摘要文字三側，只斷言一側是空洞測試。
    skipSeed({ destination: '一蘭', destinationStation: 'meal', activities: ['meal', 'coffee'] })
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    const mealCard = screen.getByText('澀谷｜一人友善的日式定食').closest('article')!
    fireEvent.click(within(mealCard).getByText('今天略過'))
    expect(screen.queryByText('澀谷｜一人友善的日式定食')).toBeNull()
    fireEvent.change(stationSelect(), { target: { value: 'meal' } })
    expect(stationSelect().value).toBe('meal')
    expect(summary()).toBe('目的地：一蘭 → 午餐站；還想：喝咖啡')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: DailyIntent; avoid: string[] }
    expect(saved.intent).toEqual({ destination: '一蘭', destinationStation: 'meal', activities: ['coffee'] })
    expect(saved.avoid).not.toContain('meal')
    expect(screen.getByText('澀谷｜一人友善的日式定食')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('澀谷｜一人友善的日式定食 指定地點').value).toBe('一蘭')
  })
  it('O1 先選站、後填目的地：空目的地選站留著，填目的地後立即生效', async () => {
    // RT4-O1 裁定（放寬不變量）：目的地為空時選站，選擇不被彈回；摘要仍顯示空意圖文案
    // （站要等目的地填了才生效），填目的地後摘要與路線立即跟上。
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(stationSelect(), { target: { value: 'meal' } })
    expect(stationSelect().value).toBe('meal')
    expect(summary()).toBe('今天沒有指定目的地或活動，留空就隨興探索。')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: DailyIntent }
    expect(saved.intent).toEqual({ destination: '', destinationStation: 'meal', activities: [] })
    fireEvent.change(destInput(), { target: { value: '一蘭' } })
    expect(stationSelect().value).toBe('meal')
    expect(summary()).toBe('目的地：一蘭 → 午餐站')
    // seed 的 meal 任務標題是「定食」（非目錄標題），逐站輸入框的 label 跟任務標題走。
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('一蘭')
  })
  it('G3「今天略過」擴充：略過非目的地活動站 → 目的地站不受影響', async () => {
    skipSeed({ destination: '一蘭', destinationStation: 'meal', activities: ['meal', 'coffee'] })
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    const coffeeCard = screen.getByText('安靜咖啡廳｜閱讀、寫下 3 個新觀察').closest('article')!
    fireEvent.click(within(coffeeCard).getByText('今天略過'))
    expect(screen.queryByText('安靜咖啡廳｜閱讀、寫下 3 個新觀察')).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>('澀谷｜一人友善的日式定食 指定地點').value).toBe('一蘭')
    expect(stationSelect().value).toBe('meal')
    expect(summary()).toBe('目的地：一蘭 → 午餐站')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: DailyIntent }
    expect(saved.intent).toEqual({ destination: '一蘭', destinationStation: 'meal', activities: ['meal'] })
  })
  it('G3 勾選活動解除 avoid：avoid 裡的站回到路線', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: ['meal'], seen: {}, disliked: [], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByText('澀谷｜一人友善的日式定食')).toBeNull()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-intent-activity-meal'))
    expect(screen.getByText('澀谷｜一人友善的日式定食')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { avoid: string[] }
    expect(saved.avoid).not.toContain('meal')
  })
  it('伺服器回應洗掉標記後，換目的地仍能更新日意圖站（標記在合併時補回）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '一蘭', candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
      intent: { destination: '一蘭', destinationStation: 'meal', activities: ['meal'] },
    }))
    const serverStop = { id: 'meal', title: '拉麵店', minutes: 45, kind: 'meal', done: false, specified: true, place: '東京都渋谷区道玄坂1-2-3', candidate: cand('m1', '拉麵店') }
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [serverStop], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    fireEvent.change(destInput(), { target: { value: '壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('拉麵店 指定地點').value).toBe('壽司')
  })
  it('保留路徑：伺服器回應 place 不變時，標記同樣補回、換目的地仍能更新', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '一蘭', candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
      intent: { destination: '一蘭', destinationStation: 'meal', activities: ['meal'] },
    }))
    const serverStop = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, place: '一蘭', candidate: cand('m1', '拉麵店') }
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [serverStop], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    fireEvent.change(destInput(), { target: { value: '壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('壽司')
  })
  it('R2-F3：搜尋後同一意圖重跑，候選與店家地址保留（appliedIntent 在 state 層、伺服器洗不掉）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '一蘭', candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
      intent: { destination: '一蘭', destinationStation: 'meal', activities: ['meal'] },
    }))
    const serverMeal = { id: 'meal', title: '拉麵店', minutes: 45, kind: 'meal', done: false, specified: true, place: '東京都渋谷区道玄坂1-2-3', candidate: cand('m1', '拉麵店') }
    const plainStop = (id: string, title: string, kind: 'gym' | 'meal' | 'creative' | 'shopping' | 'rest', minutes: number) => ({ id, title, minutes, kind, done: false })
    const serverStops = [plainStop('gym', 'FIT-EASY', 'gym', 80), serverMeal, plainStop('creative', '探索站', 'creative', 65), plainStop('coffee', '咖啡站', 'creative', 60), plainStop('shopping', '購物站', 'shopping', 55), plainStop('rest', '休息站', 'rest', 75)]
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: serverStops, routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    expect(screen.getByLabelText<HTMLInputElement>('拉麵店 指定地點').value).toBe('東京都渋谷区道玄坂1-2-3')
    expect(screen.getByText('不喜歡這間店')).toBeTruthy()
    const shoppingCard = within(screen.getByLabelText('今日任務')).getByText('購物站').closest('article')!
    fireEvent.click(within(shoppingCard).getByText('今天略過'))
    expect(screen.getByLabelText<HTMLInputElement>('拉麵店 指定地點').value).toBe('東京都渋谷区道玄坂1-2-3')
    expect(screen.getByText('不喜歡這間店')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { appliedIntent?: DailyIntent }
    expect(saved.appliedIntent).toEqual({ destination: '一蘭', destinationStation: 'meal', activities: ['meal'] })
  })
  it('長目的地往返：101 字目的地經伺服器截斷到 100 字後，標記仍在、換目的地仍能更新', async () => {
    const longDestination = '一蘭' + '！'.repeat(99)
    expect(longDestination).toHaveLength(101)
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: longDestination, candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
      intent: { destination: longDestination, destinationStation: 'meal', activities: ['meal'] },
    }))
    const serverStop = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, place: longDestination.slice(0, 100), candidate: cand('m1', '拉麵店') }
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [serverStop], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    fireEvent.change(destInput(), { target: { value: '壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('壽司')
  })
  it('空狀態文案是意圖導向、對齊實際按鈕文案（不再提模式／生成今日行程）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('今天還沒有行程')).toBeTruthy()
    expect(screen.getByText(/先在「今天想去哪裡／想做什麼」選今天想做的事、想去的地方/)).toBeTruthy()
    expect(screen.getByText(/再點「搜尋店家並生成路線」/)).toBeTruthy()
    expect(screen.queryByText(/選擇模式/)).toBeNull()
    expect(screen.queryByText(/生成今日行程/)).toBeNull()
  })
})

describe('PR-2：2.1 部分行程標示 ＋ 2.2 seen 跨請求留存', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const lastBody = (mock: ReturnType<typeof vi.fn>) => {
    const calls = mock.mock.calls.filter((c) => String(c[0]).includes('/api/daily-route')) as [unknown, RequestInit | undefined][]
    const last = calls[calls.length - 1]
    return JSON.parse(bodyText(last?.[1]?.body, '{}')) as Record<string, unknown>
  }
  const routeFetch = (respond: (body: Record<string, unknown>) => unknown) => {
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => respond(JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  it('2.1：伺服器回 partial＋missingStops 時，狀態列明寫「部分行程：缺站沒有符合條件的店家」', async () => {
    seed(cand('s1', '某咖啡店'))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, noCandidate: true, noCandidateReason: 'empty' },
        { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'coffee', done: false, candidate: cand('c1', '咖啡店') },
      ],
      routeVerified: false, conflicts: [], partial: true, missingStops: [{ id: 'meal', reason: 'empty' }],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/部分行程：定食沒有符合條件的店家/)).toBeTruthy())
  })
  it('2.1 後備：舊形狀回應（無 partial／missingStops）時，狀態列仍從逐站 noCandidate 點名缺站，只是不寫「部分行程」', async () => {
    seed(cand('s1', '某咖啡店'))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, noCandidate: true, noCandidateReason: 'empty' },
        { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'coffee', done: false, candidate: cand('c1', '咖啡店') },
      ],
      routeVerified: false, conflicts: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/定食沒有符合條件的店家/)).toBeTruthy())
    expect(screen.queryByText(/部分行程/)).toBeNull()
  })
  it('2.2：連續兩次完整重新生成，被換掉的 A 路線不馬上回來（第二次請求的 seen 仍含 A 店）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [
        { id: 'meal', title: 'A定食', minutes: 45, kind: 'meal', done: false, candidate: cand('a-meal', 'A定食') },
        { id: 'coffee', title: 'A咖啡', minutes: 60, kind: 'coffee', done: false, candidate: cand('a-coffee', 'A咖啡') },
      ],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    // 模擬「守 seen 的伺服器」：seen 含 a-meal 就回 B 路線，否則回 A 路線（A 店馬上回來）。
    const routeA = [
      { id: 'meal', title: 'A定食', minutes: 45, kind: 'meal', done: false, candidate: cand('a-meal', 'A定食') },
      { id: 'coffee', title: 'A咖啡', minutes: 60, kind: 'coffee', done: false, candidate: cand('a-coffee', 'A咖啡') },
    ]
    const routeB = [
      { id: 'meal', title: 'B定食', minutes: 45, kind: 'meal', done: false, candidate: cand('b-meal', 'B定食') },
      { id: 'coffee', title: 'B咖啡', minutes: 60, kind: 'coffee', done: false, candidate: cand('b-coffee', 'B咖啡') },
    ]
    const fetchMock = routeFetch((body) => {
      const seen = (body.seen ?? []) as string[]
      return { stops: seen.includes('a-meal') ? routeB : routeA, routeVerified: false, conflicts: [] }
    })
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    // 第一次完整重新生成：A → B；被換掉的 A 店要寫進 localStorage 的 seen（舊碼只送不存）
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText('B定食')).toBeTruthy())
    const savedAfterFirst = JSON.parse(localStorage.getItem(KEY)!) as { seen?: Record<string, string[]> }
    expect(savedAfterFirst.seen?.meal).toContain('a-meal')
    expect(savedAfterFirst.seen?.coffee).toContain('a-coffee')
    // 第二次完整重新生成：請求的 seen 仍含 A 店，A 店不回來
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => urlText(c[0]).includes('/api/daily-route'))).toHaveLength(2))
    const secondBody = lastBody(fetchMock) as { seen?: string[] }
    expect(secondBody.seen).toEqual(expect.arrayContaining(['a-meal', 'b-meal']))
    expect(screen.getByText('B定食')).toBeTruthy()
    expect(screen.queryByText('A定食')).toBeNull()
  })
  it('2.2 清除：seen 非空時有「清除今天換掉的店紀錄」按鈕，按了清掉 seen、disliked 不動', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') }],
      notes: [], avoid: [], seen: { meal: ['x1', 'x2'], coffee: ['y1'] }, disliked: ['d1'], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-clear-seen'))
    await waitFor(() => expect(screen.getByText(/已清除今天換掉的 3 家店紀錄/)).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { seen?: Record<string, string[]>; disliked: string[] }
    expect(saved.seen).toEqual({})
    expect(saved.disliked).toEqual(['d1'])
    expect(screen.queryByTestId('daily-clear-seen')).toBeNull()
  })
  it('2.2 清除：seen 為空時不顯示清除按鈕', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByTestId('daily-clear-seen')).toBeNull()
  })
})

describe('PR-2 修正輪：F1 指定 rest 缺站渲染 ＋ F2 空行程 ＋ F3 partial 退回掃描（紅隊 RT-U1／RT-U4 轉用）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  const routeFetch = (respond: (body: Record<string, unknown>) => unknown) => {
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => respond(JSON.parse(bodyText(init?.body, '{}')) as Record<string, unknown>) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const clickGenerate = async () => {
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
  }
  it('F1（RT-C1 的 UI 面）：指定了地點的 rest 查無店家時，缺站卡片正常渲染通用無候選文案、不 crash，狀態列點名該站', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') },
        { id: 'rest', title: '散步回家、休息與晚餐', minutes: 75, kind: 'rest', done: false, specified: true, place: '不存在的地點xyz123' },
      ],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('m1', '定食店') },
        { id: 'rest', title: '散步回家、休息與晚餐', minutes: 75, kind: 'rest', done: false, specified: true, place: '不存在的地點xyz123', noCandidate: true, noCandidateReason: 'empty' },
      ],
      routeVerified: false, conflicts: [], partial: true, missingStops: [{ id: 'rest', reason: 'empty' }],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    await clickGenerate()
    await waitFor(() => expect(screen.getByText(/部分行程：散步回家、休息與晚餐沒有符合條件的店家/)).toBeTruthy())
    // 指定過地點的 rest 是真的去找店了，缺站卡片顯示通用無候選文案（不是純文字 rest 的「散步回家，不用找店家。」），也不 crash。
    expect(screen.getByText(/這一站找不到店家/)).toBeTruthy()
    expect(screen.queryByText('散步回家，不用找店家。')).toBeNull()
  })
  it('F2（RT-U1 轉用、斷言反轉）：六站全略過後按生成，空行程不顯示「店家已確認」', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: ['gym', 'meal', 'creative', 'coffee', 'shopping', 'rest'],
      seen: {}, disliked: [], dislikedKinds: [],
    }))
    const fetchMock = routeFetch(() => ({ stops: [], routeVerified: false, conflicts: [], partial: false, missingStops: [] }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    await clickGenerate()
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => urlText(c[0]).includes('/api/daily-route'))).toHaveLength(1))
    await waitFor(() => expect(screen.getByText('今天還沒有行程')).toBeTruthy())
    expect(screen.queryByText(/店家已確認/)).toBeNull()
  })
  it('F2 延伸：所有站都無候選時（非空行程），狀態列也不寫「店家已確認」，改寫缺站', async () => {
    seed(cand('s1', '某咖啡店'))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, noCandidate: true, noCandidateReason: 'empty' },
        { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'coffee', done: false, noCandidate: true, noCandidateReason: 'empty' },
      ],
      routeVerified: false, conflicts: [], partial: true, missingStops: [{ id: 'meal', reason: 'empty' }, { id: 'coffee', reason: 'empty' }],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    await clickGenerate()
    await waitFor(() => expect(screen.getByText(/部分行程：定食、咖啡店沒有符合條件的店家/)).toBeTruthy())
    expect(screen.queryByText(/店家已確認/)).toBeNull()
  })
  it('F3（RT-U4 轉用、斷言反轉）：partial:true 但 missingStops 為空時，退回逐站掃描、缺站仍顯示', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, noCandidate: true, noCandidateReason: 'empty' },
        { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'coffee', done: false, candidate: cand('c1', '咖啡店') },
      ],
      routeVerified: false, conflicts: [], partial: true, missingStops: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    await clickGenerate()
    await waitFor(() => expect(screen.getByText(/部分行程：定食沒有符合條件的店家/)).toBeTruthy())
  })
  it('F3 延伸：partial:true 但 missingStops 缺失（舊形狀混不一致形狀）時，同樣退回逐站掃描', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某咖啡店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    routeFetch(() => ({
      stops: [
        { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, noCandidate: true, noCandidateReason: 'empty' },
        { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'coffee', done: false, candidate: cand('c1', '咖啡店') },
      ],
      routeVerified: false, conflicts: [], partial: true,
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    await clickGenerate()
    await waitFor(() => expect(screen.getByText(/部分行程：定食沒有符合條件的店家/)).toBeTruthy())
  })
})

describe('開始時間輸入（PR-4）', () => {
  const seedEmpty = () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
  }
  const routeFetch = () => {
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const lastBody = (mock: ReturnType<typeof vi.fn>) => {
    const call = mock.mock.calls.find((c) => String(c[0]).includes('/api/daily-route')) as [unknown, RequestInit | undefined] | undefined
    return JSON.parse(bodyText(call?.[1]?.body, '{}')) as Record<string, unknown>
  }
  it('開始時間欄位存在、初始為空；改為 15:00 後 localStorage 存下 15:00', async () => {
    seedEmpty()
    render(<DailyDecision onBack={() => {}} />)
    const { fireEvent } = await import('@testing-library/react')
    const input = screen.getByTestId<HTMLInputElement>('daily-start-time')
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '15:00' } })
    expect(screen.getByTestId('daily-start-time')).toBeTruthy()
    expect(screen.getByTestId<HTMLInputElement>('daily-start-time').value).toBe('15:00')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { startTime?: string }
    expect(saved.startTime).toBe('15:00')
  })
  it('清空開始時間後 localStorage 的 startTime 回到空字串（未指定＝伺服器當下）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], startTime: '15:00',
    }))
    render(<DailyDecision onBack={() => {}} />)
    const { fireEvent } = await import('@testing-library/react')
    expect(screen.getByTestId<HTMLInputElement>('daily-start-time').value).toBe('15:00')
    fireEvent.change(screen.getByTestId('daily-start-time'), { target: { value: '' } })
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { startTime?: string }
    expect(saved.startTime).toBe('')
  })
  it('按生成時請求體含 startTime；改時間本身不觸發 /api/daily-route', async () => {
    const fetchMock = routeFetch()
    seedEmpty()
    render(<DailyDecision onBack={() => {}} />)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByTestId('daily-start-time'), { target: { value: '15:00' } })
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody(fetchMock).startTime).toBe('15:00')
  })
  it('F2（修正輪；來源：紅隊 RT-UI）：改開始時間後，各站舊 ETA／舊逐站衝突一起清掉，不再與已清的橫幅矛盾', async () => {
    const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某食堂'), eta: '09:10', departure: '09:55', travelMin: 10, conflict: '預計晚到 10 分鐘' }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], startTime: '',
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('09:10 抵達｜09:55 離開｜步行 10 分鐘')).toBeTruthy()
    expect(screen.getByText('⚠ 預計晚到 10 分鐘')).toBeTruthy()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByTestId('daily-start-time'), { target: { value: '15:00' } })
    expect(screen.getByText('開始時間變更，請重新搜尋路線')).toBeTruthy()
    expect(screen.queryByText('09:10 抵達｜09:55 離開｜步行 10 分鐘')).toBeNull()
    expect(screen.queryByText('⚠ 預計晚到 10 分鐘')).toBeNull()
  })
  it('O1（修正輪）：開始時間說明文字寫明是東京時間', () => {
    seedEmpty()
    render(<DailyDecision onBack={() => {}} />)
    expect(screen.getByText(/東京時間/)).toBeTruthy()
  })
  it('O2（修正輪）：過去時間被 clamp 後，搜尋成功時狀態列寫明實際用的錨點', async () => {
    // 合併後（PR-2 F2）：空行程（stops:[]）狀態列寫「今天還沒有行程」，不顯示錨點——
    // 錨點只對「真的有行程」有意義；故此案用有一站有候選的回應，測 clamp 顯示本身。
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('s1', '某食堂') }], routeVerified: true, distanceKm: 0.5, travelMinutes: 10, conflicts: [], anchorTime: '09:00' }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], startTime: '08:00',
    }))
    render(<DailyDecision onBack={() => {}} />)
    const { fireEvent } = await import('@testing-library/react')
    expect(screen.getByTestId<HTMLInputElement>('daily-start-time').value).toBe('08:00')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/已以現在 09:00 開始排/)).toBeTruthy())
  })
})
