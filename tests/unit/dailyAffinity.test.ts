// @vitest-environment jsdom
// 2.4 行為回饋迴圈：本機種類偏好紀錄（衰減、閾值、壞資料、清除）與伺服器共用的驗證／權重。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AFFINITY_KEY, AFFINITY_WEIGHT, affinityHints, affinityScores, clearAffinity, dropAffinity, loadAffinity,
  recordAffinity, sanitizeKindList, softWeights, SOFT_WEIGHT, weightedIndex, type AffinityEvent,
} from '../../src/dailyAffinity.ts'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 14)
beforeEach(() => { localStorage.clear() })

describe('權重（decisions.md Q1）', () => {
  it('手動指定 +3、標記完成 +2、換掉自動挑的店 −1', () => {
    expect(AFFINITY_WEIGHT).toEqual({ specified: 3, done: 2, swapped: -1 })
  })
})

describe('衰減：半衰期 30 天，讀取時計算', () => {
  const ev = (w: number, daysAgo: number, k = 'ramen'): AffinityEvent => ({ k, w, t: NOW - daysAgo * DAY })
  it('0 天＝原值；30 天＝一半；60 天＝四分之一', () => {
    expect(affinityScores([ev(3, 0)], NOW).ramen).toBeCloseTo(3, 10)
    expect(affinityScores([ev(3, 30)], NOW).ramen).toBeCloseTo(1.5, 10)
    expect(affinityScores([ev(3, 60)], NOW).ramen).toBeCloseTo(0.75, 10)
  })
  it('同一種類的事件相加，正負互抵；不同種類分開算', () => {
    const s = affinityScores([ev(3, 0), ev(-1, 0), ev(2, 30), ev(2, 0, 'udon')], NOW)
    expect(s.ramen).toBeCloseTo(3 - 1 + 1, 10)
    expect(s.udon).toBeCloseTo(2, 10)
  })
  it('存的是原始事件，不是衰減後的分數：同一份紀錄隔 30 天再讀，分數減半', () => {
    recordAffinity('ramen', 3, NOW)
    expect(affinityScores(loadAffinity(), NOW).ramen).toBeCloseTo(3, 10)
    expect(affinityScores(loadAffinity(), NOW + 30 * DAY).ramen).toBeCloseTo(1.5, 10)
  })
  it('未來時間戳（時鐘被調過）當成剛發生，不放大', () => {
    expect(affinityScores([{ k: 'ramen', w: 3, t: NOW + 90 * DAY }], NOW).ramen).toBeCloseTo(3, 10)
  })
})

describe('閾值（Q8）：≥2 才算偏好、≤−2 才算降權、各最多 20 個', () => {
  it('剛好 2 算偏好；1.99 不算；剛好 −2 算降權；−1.99 不算', () => {
    const at = (w: number, k: string): AffinityEvent => ({ k, w, t: NOW })
    const h = affinityHints([at(2, 'a'), at(1.99, 'b'), at(-2, 'c'), at(-1.99, 'd')], NOW)
    expect(h).toEqual({ prefer: ['a'], demote: ['c'] })
  })
  it('單次「標記完成」(+2) 過一天就低於 2：單次行為不改變結果', () => {
    recordAffinity('ramen', AFFINITY_WEIGHT.done, NOW)
    expect(affinityHints(loadAffinity(), NOW + DAY).prefer).toEqual([])
  })
  it('兩次「標記完成」算偏好；單次「換掉」不算降權，三次才算', () => {
    recordAffinity('ramen', 2, NOW); recordAffinity('ramen', 2, NOW)
    recordAffinity('udon', -1, NOW)
    expect(affinityHints(loadAffinity(), NOW + DAY)).toEqual({ prefer: ['ramen'], demote: [] })
    recordAffinity('udon', -1, NOW); recordAffinity('udon', -1, NOW)
    expect(affinityHints(loadAffinity(), NOW + DAY).demote).toEqual(['udon'])
  })
  it('偏好會過期：+3 過 30 天剩 1.5，不再送', () => {
    recordAffinity('ramen', 3, NOW)
    expect(affinityHints(loadAffinity(), NOW).prefer).toEqual(['ramen'])
    expect(affinityHints(loadAffinity(), NOW + 30 * DAY).prefer).toEqual([])
  })
  it('超過 20 個種類：各只送最強的 20 個', () => {
    const events: AffinityEvent[] = []
    for (let i = 0; i < 25; i++) { events.push({ k: 'p' + i, w: 3, t: NOW - i * 3_600_000 }); events.push({ k: 'n' + i, w: -3, t: NOW - i * 3_600_000 }) }
    const h = affinityHints(events, NOW)
    expect(h.prefer).toHaveLength(20)
    expect(h.demote).toHaveLength(20)
    expect(h.prefer[0]).toBe('p0')
    expect(h.prefer).not.toContain('p24')
    expect(h.demote[0]).toBe('n0')
  })
})

describe('記錄與清除', () => {
  it('判不出種類（undefined）不記', () => {
    recordAffinity(undefined, 3, NOW)
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
  })
  it('同一來源只留一筆（重複勾選不重複加分）；撤回來源就拿掉', () => {
    recordAffinity('ramen', 2, NOW, 'done:d:meal:p1')
    recordAffinity('ramen', 2, NOW + 1, 'done:d:meal:p1')
    expect(loadAffinity()).toHaveLength(1)
    dropAffinity('done:d:meal:p1')
    expect(loadAffinity()).toHaveLength(0)
  })
  it('clearAffinity 只刪偏好這一個 key，其他 key 不動', () => {
    localStorage.setItem('decide.daily.v1', '{"seen":{"meal":["x"]},"disliked":["y"]}')
    recordAffinity('ramen', 3, NOW)
    clearAffinity()
    expect(localStorage.getItem(AFFINITY_KEY)).toBeNull()
    expect(localStorage.getItem('decide.daily.v1')).toBe('{"seen":{"meal":["x"]},"disliked":["y"]}')
    expect(affinityHints(loadAffinity(), NOW)).toEqual({ prefer: [], demote: [] })
  })
  it('最多留 200 筆事件（留最新的）', () => {
    for (let i = 0; i < 205; i++) recordAffinity('ramen', 2, NOW + i)
    const all = loadAffinity()
    expect(all).toHaveLength(200)
    expect(all[0]!.t).toBe(NOW + 5)
  })
})

describe('壞的 localStorage 內容不會丟例外', () => {
  it.each([
    ['不是 JSON', '{bad json'],
    ['物件不是陣列', '{"ramen":5}'],
    ['字串', '"ramen"'],
    ['null', 'null'],
    ['數字', '42'],
  ])('%s → 空紀錄', (_name, raw) => {
    localStorage.setItem(AFFINITY_KEY, raw)
    expect(loadAffinity()).toEqual([])
    expect(affinityHints(loadAffinity(), NOW)).toEqual({ prefer: [], demote: [] })
  })
  it('陣列裡形狀不對的元素丟掉，好的留著', () => {
    const good = { k: 'ramen', w: 3, t: NOW }
    localStorage.setItem(AFFINITY_KEY, JSON.stringify([
      1, 'x', null, [], { k: 5, w: 3, t: NOW }, { k: 'a', w: 'big', t: NOW }, { k: 'a', w: 999, t: NOW }, { k: 'a', w: 3 },
      { k: 'a', w: 3, t: null }, { k: '', w: 3, t: NOW }, { k: 'x'.repeat(41), w: 3, t: NOW }, { k: 'a', w: 3, t: NOW, src: 7 }, good,
    ]))
    expect(loadAffinity()).toEqual([good])
  })
  it('壞資料上再記一筆：不壞，壞資料被蓋掉', () => {
    localStorage.setItem(AFFINITY_KEY, '{bad json')
    recordAffinity('ramen', 3, NOW)
    expect(loadAffinity()).toEqual([{ k: 'ramen', w: 3, t: NOW }])
  })
})

describe('伺服器輸入驗證 sanitizeKindList', () => {
  it('非陣列一律空', () => {
    for (const v of [undefined, null, 'ramen', 5, true, { 0: 'ramen', length: 1 }]) expect(sanitizeKindList(v)).toEqual([])
  })
  it('非字串、空字串、過長的元素丟掉；去重', () => {
    expect(sanitizeKindList(['ramen', 1, null, {}, ['udon'], '', 'x'.repeat(41), 'ramen', 'udon'])).toEqual(['ramen', 'udon'])
  })
  it('最多 20 個', () => {
    expect(sanitizeKindList(Array.from({ length: 500 }, (_, i) => 'k' + i))).toHaveLength(20)
  })
  it('套用歸一化後去重（舊鍵 ramen_restaurant → ramen）', () => {
    expect(sanitizeKindList(['ramen_restaurant', 'ramen'], k => k.replace('_restaurant', ''))).toEqual(['ramen'])
  })
})

describe('軟排序權重 softWeights／weightedIndex', () => {
  it('沒帶偏好 → null（走原本的均勻隨機）', () => {
    expect(softWeights(['ramen', undefined], [], [])).toBeNull()
  })
  it('這一組權重全相同（都不相關、或全是偏好種類）→ null：偏好沒有影響', () => {
    expect(softWeights([undefined, 'udon'], ['ramen'], [])).toBeNull()
    expect(softWeights(['ramen', 'ramen'], ['ramen'], [])).toBeNull()
  })
  it('偏好 6、一般 2、降權 1；判不出種類＝一般；全部 ≥1', () => {
    const w = softWeights(['ramen', undefined, 'udon', 'soba'], ['ramen'], ['udon'])!
    expect(w).toEqual([SOFT_WEIGHT.prefer, SOFT_WEIGHT.neutral, SOFT_WEIGHT.demote, SOFT_WEIGHT.neutral])
    expect(Math.min(...w)).toBeGreaterThanOrEqual(1)
  })
  it('同時在 prefer 與 demote 的種類當一般', () => {
    expect(softWeights(['ramen', 'udon'], ['ramen', 'udon'], ['ramen'])).toEqual([SOFT_WEIGHT.neutral, SOFT_WEIGHT.prefer])
  })
  it('weightedIndex：每個索引對到的 r 個數＝它的權重', () => {
    const w = [6, 2, 1]
    const hits = [0, 0, 0]
    for (let r = 0; r < 9; r++) hits[weightedIndex(w, r)]!++
    expect(hits).toEqual([6, 2, 1])
  })
})
