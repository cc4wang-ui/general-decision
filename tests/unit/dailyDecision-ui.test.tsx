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
