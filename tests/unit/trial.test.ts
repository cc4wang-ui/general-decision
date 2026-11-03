// Round 4：60 天試用紀錄（src/trial.ts）——每道口令記一筆、回報標上去、60 天自動清、匯出含摘要、不存店名。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  TRIAL_DAYS, TRIAL_FILE_VERSION, TRIAL_MAX, clearTrial, exportTrial, fromDebug, readTrial, recordTrial, summarize, tagTrial, trialGeo, type TrialEntry,
} from '../../src/trial.ts'

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

// Round 10 N6：每筆多記定位品質與「你在車上？」；N4：匯出檔可以附記憶。
describe('N6 定位門檻資料', () => {
  const mk = (e: Partial<TrialEntry>): TrialEntry => ({ at: at(T0), module: 'eat', level: 1, ok: true, ...e })

  it('trialGeo：誤差四捨五入到公尺、多舊四捨五入到秒、記下有沒有問；瀏覽器沒給的就不記', () => {
    expect(trialGeo({ accuracy: 812.6, fixAt: T0 - 95_400 }, 'coarse', T0)).toEqual({ ask: 'coarse', acc: 813, age: 95 })
    expect(trialGeo({ accuracy: 12, fixAt: T0 + 500 }, null, T0)).toEqual({ ask: null, acc: 12, age: 0 }) // 時鐘誤差不記成負的
    expect(trialGeo({}, 'stale', T0)).toEqual({ ask: 'stale' })
  })

  it('摘要：用 GPS 幾道、問幾次（依原因）、問了選什麼', () => {
    const s = summarize([
      mk({ geo: { ask: null, acc: 20, age: 3 } }),
      mk({ geo: { ask: 'stale', pick: 'current', age: 75 } }),
      mk({ geo: { ask: 'coarse', pick: 'station', acc: 900 } }),
      mk({ ok: false, error: 'geo_cancel', geo: { ask: 'stale', pick: 'cancel', age: 130 } }),
      mk({}), // 手動報站或不用定位的卡：沒有 geo
    ])
    expect(s.geo).toEqual({ fixes: 4, asked: 3, stale: 2, coarse: 1, picks: { current: 1, station: 1, cancel: 1 } })
    expect(s.errors).toEqual({ geo_cancel: 1 })
  })

  it('舊紀錄（Round 10 以前、沒有 geo）照讀照算，摘要的定位欄位是 0', () => {
    const old = [{ at: at(T0), module: 'eat', level: 1, ok: true, placeId: 'a', lane: 'q:便當' }]
    localStorage.setItem('decide.trial.v1', JSON.stringify(old))
    expect(readTrial()).toEqual(old)
    const s = summarize(readTrial())
    expect(s).toMatchObject({ orders: 1, ok: 1, distinctPlaces: 1 })
    expect(s.geo).toEqual({ fixes: 0, asked: 0, stale: 0, coarse: 0, picks: {} })
    // 舊紀錄後面接新紀錄，兩種混著也正常
    recordTrial({ module: 'eat', level: 1, ok: true, placeId: 'b', geo: { ask: 'stale', pick: 'current' } }, T0 + 1000)
    expect(summarize(readTrial()).geo).toMatchObject({ fixes: 1, asked: 1 })
    expect(readTrial()[1]).toEqual(old[0])
  })
})

describe('N4 一鍵匯出', () => {
  it('匯出檔有版本號；給了記憶就附在 memory，沒給就沒有這欄', () => {
    recordTrial({ module: 'eat', level: 1, ok: true, placeId: 'a' }, T0)
    const memory = { app: 'decide' as const, kind: 'place-memory' as const, version: 1, exportedAt: at(T0), places: [], cuisine: {} }
    const withMem = JSON.parse(exportTrial(readTrial(), T0, memory))
    expect(withMem).toMatchObject({ kind: 'trial-log', version: TRIAL_FILE_VERSION, memory })
    expect(withMem.entries).toHaveLength(1)
    expect('memory' in JSON.parse(exportTrial(readTrial(), T0))).toBe(false)
  })
})
