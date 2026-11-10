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

describe('意圖輸入（2.0：兩顆模式按鈕改為自由文字框）', () => {
  const settlePhoto = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
  it('模式按鈕整組消失，改為意圖輸入框（label／placeholder／上限 120 字）', async () => {
    seed(cand('s1', '某咖啡店'))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.queryByText('偵察探索')).toBeNull()
    expect(screen.queryByText('效率採買')).toBeNull()
    expect(screen.queryByText('今天想怎麼過？')).toBeNull()
    const input = screen.getByTestId<HTMLInputElement>('daily-intent')
    expect(input.getAttribute('aria-label')).toBe('今天想去哪裡／想做什麼')
    expect(input.placeholder).toContain('留空就隨興探索')
    expect(input.maxLength).toBe(120)
    expect(input.value).toBe('')
  })
  it('輸入意圖 → 午餐站被指定為意圖原文、顯示解析提示、寫進 localStorage、不觸發伺服器請求', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn((_url: string | URL | Request) => Promise.resolve({ ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '想吃拉麵' } })
    // 提示逐字反映 parseIntent 的輸出
    expect(screen.getByTestId('daily-intent-hint').textContent).toBe('已辨識：拉麵 → 午餐站')
    // 午餐站的指定地點輸入框值＝意圖原文（specified 站不顯示「換這一站」）
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('想吃拉麵')
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { intent: string }
    expect(saved.intent).toBe('想吃拉麵')
    // 改意圖不觸發伺服器請求（跟舊模式按鈕一樣；照片 API 的呼叫不算）
    expect(fetchMock.mock.calls.some(c => urlText(c[0]).includes('/api/daily-route'))).toBe(false)
  })
  it('咖啡與展覽意圖的提示分開：咖啡 → 咖啡站、展覽 → 探索站（不再共站）', async () => {
    seed(cand('s1', '某咖啡店'))
    const fetchMock = vi.fn((_url: string | URL | Request) => Promise.resolve({ ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '想喝咖啡' } })
    expect(screen.getByTestId('daily-intent-hint').textContent).toBe('已辨識：咖啡 → 咖啡站')
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '去看展覽' } })
    expect(screen.getByTestId('daily-intent-hint').textContent).toBe('已辨識：展覽 → 探索站')
  })
  it('伺服器回應洗掉標記後，換意圖仍能更新日意圖站（標記在合併時補回）', async () => {
    // 真實伺服器成功路徑形狀（api/daily-route.ts:277）：新搜尋成功時 place 一律是
    // 店家地址、title 是店名，絕不是意圖原文。舊 mock 保留 place＝意圖原文，與真實
    // 契約矛盾（紅隊 F6），該形狀下 restore 永遠不會被考驗。
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '想吃拉麵', candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], intent: '想吃拉麵',
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
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '想吃壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('拉麵店 指定地點').value).toBe('想吃壽司')
  })
  it('保留路徑：伺服器回應 place 不變時，標記同樣補回、換意圖仍能更新', async () => {
    // 保留路徑（api/daily-route.ts:226）：候選通過重驗時回應原樣推回該站，place 不變。
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '想吃拉麵', candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], intent: '想吃拉麵',
    }))
    const serverStop = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, place: '想吃拉麵', candidate: cand('m1', '拉麵店') }
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [serverStop], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '想吃壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('想吃壽司')
  })
  it('長意圖往返：101 字意圖經伺服器截斷到 100 字後，標記仍在、換意圖仍能更新', async () => {
    // 伺服器 sanitize 把 place 截到 100 字（api/daily-route.ts:156）：101–120 字意圖
    // 連保留路徑回應的 place 也是截斷版 ≠ 舊 state 的 place。restore 不得以 place
    // 相等為準，否則長意圖第一次搜尋後標記就丟了。
    const longIntent = '想吃拉麵' + '！'.repeat(97)
    expect(longIntent).toHaveLength(101)
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [{ id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: longIntent, candidate: cand('m1', '拉麵店') }],
      notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], intent: longIntent,
    }))
    const serverStop = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, place: longIntent.slice(0, 100), candidate: cand('m1', '拉麵店') }
    const fetchMock = vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route')
      ? { ok: true, json: () => ({ stops: [serverStop], routeVerified: false, conflicts: [] }) }
      : { ok: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByTestId('daily-generate'))
    await waitFor(() => expect(screen.getByText(/店家已確認/)).toBeTruthy())
    fireEvent.change(screen.getByTestId('daily-intent'), { target: { value: '想吃壽司' } })
    expect(screen.getByLabelText<HTMLInputElement>('定食 指定地點').value).toBe('想吃壽司')
  })
  it('空狀態文案是意圖導向、對齊實際按鈕文案（不再提模式／生成今日行程）', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅',
      tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
    }))
    render(<DailyDecision onBack={() => {}} />)
    await settlePhoto()
    expect(screen.getByText('今天還沒有行程')).toBeTruthy()
    expect(screen.getByText(/先在「今天想去哪裡／想做什麼」寫下今天的想法/)).toBeTruthy()
    expect(screen.getByText(/再點「搜尋店家並生成路線」/)).toBeTruthy()
    expect(screen.queryByText(/選擇模式/)).toBeNull()
    expect(screen.queryByText(/生成今日行程/)).toBeNull()
  })
})
