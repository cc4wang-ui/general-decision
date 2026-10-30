// Round 4：60 天試用紀錄（src/trial.ts）——每道口令記一筆、回報標上去、60 天自動清、匯出含摘要、不存店名。
import { beforeEach, describe, expect, it } from 'vitest'
import { TRIAL_DAYS, TRIAL_MAX, clearTrial, exportTrial, fromDebug, readTrial, recordTrial, summarize, tagTrial, type TrialEntry } from '../../src/trial.ts'

const DAY = 86_400_000
const T0 = Date.parse('2026-11-01T12:00:00+08:00')
const at = (ms: number) => new Date(ms).toISOString()

beforeEach(() => { localStorage.clear() })

describe('recordTrial／readTrial', () => {
  it('新的在前；壞資料當空陣列', () => {
    recordTrial({ module: 'eat', level: 1, ok: true, placeId: 'a' }, T0)
    recordTrial({ module: 'eat', level: 1, ok: false, error: 'no_places' }, T0 + 1000)
    expect(readTrial().map((e) => e.ok)).toEqual([false, true])
    localStorage.setItem('decide.trial.v1', '{壞掉')
    expect(readTrial()).toEqual([])
  })

  it(`超過 ${TRIAL_DAYS} 天的自動清掉；超過 ${TRIAL_MAX} 筆砍最舊`, () => {
    recordTrial({ module: 'eat', level: 1, ok: true, at: at(T0 - 61 * DAY) }, T0 - 61 * DAY)
    recordTrial({ module: 'eat', level: 1, ok: true, at: at(T0 - 10 * DAY) }, T0)
    expect(readTrial()).toHaveLength(1)
    clearTrial()
    for (let i = 0; i < TRIAL_MAX + 5; i++) recordTrial({ module: 'reply', level: 1, ok: true, at: at(T0 + i) }, T0 + i)
    expect(readTrial()).toHaveLength(TRIAL_MAX)
  })

  it('fromDebug 只留數字：lane、池子、放寬、救援、模板、毫秒；不留候選店名', () => {
    const e = fromDebug({
      module: 'eat', level: 1, rescue: true, fallback: 'template', ms: { places: 1, claude: 2, total: 3 },
      places: { how: 'x', tries: [], candidates: [{ name: '阿財魯肉飯' }] },
      pick: { mode: 'new', lane: 'q:便當', pool: 20, afterFilter: 12, relaxed: ['price'], exhausted: false },
      picked: '阿財魯肉飯',
    })
    expect(e).toEqual({ lane: 'q:便當', pool: 20, kept: 12, relaxed: ['price'], rescue: true, fallback: true, ms: 3 })
    expect(JSON.stringify(e)).not.toContain('阿財')
  })
})

describe('tagTrial', () => {
  it('回報標在同模組最近一筆還沒標的成功紀錄上', () => {
    recordTrial({ module: 'eat', level: 1, ok: true, placeId: 'a' }, T0)
    recordTrial({ module: 'rest', level: 1, ok: true, placeId: 'r' }, T0 + 1)
    recordTrial({ module: 'eat', level: 1, ok: false, error: 'no_places' }, T0 + 2)
    tagTrial('eat', 'reissued', 'repeat', T0 + 3)
    const eat = readTrial().filter((e) => e.module === 'eat')
    expect(eat.find((e) => e.placeId === 'a')).toMatchObject({ outcome: 'reissued', reason: 'repeat' })
    expect(eat.find((e) => !e.ok)?.outcome).toBeUndefined()
    expect(readTrial().find((e) => e.module === 'rest')?.outcome).toBeUndefined()
  })
})

describe('summarize／exportTrial', () => {
  const mk = (d: number, e: Partial<TrialEntry>): TrialEntry => ({ at: at(T0 + d * DAY), module: 'eat', level: 1, ok: true, ...e })

  it('7 天內重複率、不同店數、預算命中（推估也算）、失敗種類、原因', () => {
    const entries = [
      mk(0, { placeId: 'a', budget: [1], band: 1 }),
      mk(1, { placeId: 'b', budget: [1], band: 3 }),
      mk(2, { placeId: 'a', budget: [1], band: 1, priceEst: true }), // 2 天內又派 a → 重複
      mk(10, { placeId: 'a' }), // 前一次是 8 天前 → 不算重複
      mk(11, { ok: false, error: 'no_places' }),
      mk(12, { placeId: 'c', budget: [2], band: null, reason: 'price', outcome: 'reissued' }),
    ]
    const s = summarize(entries)
    expect(s.orders).toBe(6)
    expect(s.ok).toBe(5)
    expect(s.errors).toEqual({ no_places: 1 })
    expect(s.repeat7d).toBe(+(1 / 5).toFixed(3))
    expect(s.distinctPlaces).toBe(3)
    expect(s.budgetHit).toBe(+(2 / 3).toFixed(3))
    expect(s.budgetUnknown).toBe(1)
    expect(s.reasons).toEqual({ price: 1 })
    expect(s.days).toBe(12)
  })

  it('匯出檔：摘要＋全部紀錄，可以 JSON.parse', () => {
    recordTrial({ module: 'eat', level: 1, ok: true, placeId: 'a' }, T0)
    const out = JSON.parse(exportTrial(readTrial(), T0))
    expect(out).toMatchObject({ app: 'decide', kind: 'trial-log', summary: { orders: 1 } })
    expect(out.entries).toHaveLength(1)
  })

  it('沒有紀錄也不爆', () => {
    expect(summarize([])).toMatchObject({ orders: 0, repeat7d: null, budgetHit: null, days: 0 })
  })
})
