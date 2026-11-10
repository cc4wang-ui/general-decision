// @vitest-environment jsdom
// PR-2（2.2 O2 seen 跨請求留存）：withCurrentAsSeen／clearSeen／loadDaily 換天語意。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withCurrentAsSeen, clearSeen, loadDaily, type DailyState, type DailyTask } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const yesterdayTokyo = () => {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
const cand = (id: string) => ({ id, name: id, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70, rating: 4.2, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
const state = (): DailyState => ({
  day: '2026-11-03', area: '澀谷', currentPlace: '宮下公園',
  intent: { destination: '', destinationStation: '', activities: [] },
  appliedIntent: { destination: '', destinationStation: '', activities: [] },
  tasks: [], notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [],
})
const task = (id: string, candidateId: string | undefined, extra: Partial<DailyTask> = {}): DailyTask => ({
  id, title: id, minutes: 45, kind: id === 'meal' ? 'meal' : id === 'coffee' ? 'creative' : 'meal', done: false,
  ...(candidateId ? { candidate: cand(candidateId) } : {}), ...extra,
})

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('PR-2：withCurrentAsSeen（完整重生把被換掉的自動站現任候選記進 seen）', () => {
  it('自動站的現任候選按站記進 seen；已記過的不重複；沒有候選的站不動', () => {
    const s: DailyState = { ...state(), tasks: [task('meal', 'm1'), task('coffee', 'c1'), task('shopping', undefined)], seen: { meal: ['m0'] } }
    const out = withCurrentAsSeen(s)
    expect(out.seen).toEqual({ meal: ['m0', 'm1'], coffee: ['c1'] })
    // 再記一次：同一間不重複
    expect(withCurrentAsSeen(out).seen).toEqual({ meal: ['m0', 'm1'], coffee: ['c1'] })
  })

  it('指定／固定／已完成站不是被換掉的站：現任候選不進 seen（它們完整重生時照留，不是被換掉）', () => {
    const s: DailyState = {
      ...state(),
      tasks: [
        task('meal', 'm1', { specified: true, place: '一蘭' }),
        task('coffee', 'c1', { done: true }),
        task('shopping', 's1', { locked: true, custom: true }),
        task('gym', 'g1'),
      ],
    }
    expect(withCurrentAsSeen(s).seen).toEqual({ gym: ['g1'] })
  })

  it('每站上限 20 筆：滿 20 筆時最舊的一筆被推出（跟 withSeen 同一規則）', () => {
    const old = Array.from({ length: 20 }, (_, i) => 's' + i)
    const s: DailyState = { ...state(), tasks: [task('meal', 'm21')], seen: { meal: old } }
    expect(withCurrentAsSeen(s).seen?.meal).toEqual([...old.slice(1), 'm21'])
  })

  it('沒有任何自動站現任候選時回傳原物件（不製造無謂的新 state）', () => {
    const s: DailyState = { ...state(), tasks: [task('meal', undefined)] }
    expect(withCurrentAsSeen(s)).toBe(s)
  })
})

describe('PR-2：clearSeen（清除換掉紀錄）', () => {
  it('只清 seen：disliked／dislikedKinds 原封不動（seen 弱於 disliked，清除 seen 絕不動封鎖）', () => {
    const s: DailyState = { ...state(), seen: { meal: ['m1', 'm2'], coffee: ['c1'] }, disliked: ['d1'], dislikedKinds: ['udon'] }
    const out = clearSeen(s)
    expect(out.seen).toEqual({})
    expect(out.disliked).toEqual(['d1'])
    expect(out.dislikedKinds).toEqual(['udon'])
  })

  it('seen 本來就是空時仍回傳 seen 為 {} 的新物件', () => {
    expect(clearSeen(state()).seen).toEqual({})
  })
})

describe('PR-2：loadDaily 的 seen 換天語意（2.2 O2：day-scoped，過期機制）', () => {
  const seedRaw = (raw: Record<string, unknown>) => {
    localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], ...raw }))
  }
  it('同一天：seen 照留（跨請求留存的保存層）', () => {
    seedRaw({ tasks: [], seen: { meal: ['m1'] }, disliked: ['d1'] })
    const out = loadDaily()
    expect(out.seen).toEqual({ meal: ['m1'] })
    expect(out.disliked).toEqual(['d1'])
  })
  it('換天：seen 歸零（過期），disliked 跨天保留（兩者有效期不同，seen 絕不被當成 disliked）', () => {
    seedRaw({ day: yesterdayTokyo(), tasks: [], seen: { meal: ['m1'] }, disliked: ['d1'] })
    const out = loadDaily()
    expect(out.seen).toEqual({})
    expect(out.disliked).toEqual(['d1'])
  })
})
