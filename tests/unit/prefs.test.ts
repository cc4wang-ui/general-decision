// 偏好：偵察方針、預算檔位（相鄰多選、分國家記住）、午餐隱藏最高檔。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  effectiveBudget, loadBudget, loadCountry, loadNovelty, lunchHidesTop, nextNovelty, normalizeBands,
  saveBudget, saveCountry, saveNovelty, toggleBand,
} from '../../src/prefs.ts'

beforeEach(() => { localStorage.clear() })

describe('toggleBand：只准相鄰', () => {
  it('從不限點一檔 → 只選那檔', () => expect(toggleBand([], 3)).toEqual([3]))
  it('選了 1 再點 3 → 自動補 2', () => expect(toggleBand([1], 3)).toEqual([1, 2, 3]))
  it('選了 4 再點 1 → 中間兩檔自動補上', () => expect(toggleBand([4], 1)).toEqual([1, 2, 3, 4]))
  it('點相鄰的檔 → 直接加上', () => expect(toggleBand([2], 3)).toEqual([2, 3]))
  it('點端點 → 縮一檔', () => {
    expect(toggleBand([1, 2, 3], 3)).toEqual([1, 2])
    expect(toggleBand([1, 2, 3], 1)).toEqual([2, 3])
  })
  it('點唯一選中的 → 回到不限', () => expect(toggleBand([2], 2)).toEqual([]))
  it('點中間的 → 收成只剩它自己', () => expect(toggleBand([1, 2, 3], 2)).toEqual([2]))
})

describe('normalizeBands', () => {
  it('補成連續、排序、丟掉不合法的', () => {
    expect(normalizeBands([3, 1])).toEqual([1, 2, 3])
    expect(normalizeBands([2, 2, 9, 'x', 0])).toEqual([2])
    expect(normalizeBands('nope')).toEqual([])
    expect(normalizeBands([])).toEqual([])
  })
})

describe('預算分國家記住', () => {
  it('台幣與日圓各一份', () => {
    saveBudget('TW', [1, 2])
    saveBudget('JP', [4])
    expect(loadBudget('TW')).toEqual([1, 2])
    expect(loadBudget('JP')).toEqual([4])
  })
  it('沒存過是不限（Number(null) 的坑：不能變成 [0]）', () => expect(loadBudget('TW')).toEqual([]))
  it('存壞了也是不限', () => {
    localStorage.setItem('decide.budget.TW', '{oops')
    expect(loadBudget('TW')).toEqual([])
  })
})

describe('偵察方針', () => {
  it('預設均衡；壞值也回均衡', () => {
    expect(loadNovelty()).toBe('balanced')
    localStorage.setItem('decide.novelty', 'wat')
    expect(loadNovelty()).toBe('balanced')
  })
  it('一顆鍵循環三段：熟門熟路 → 均衡 → 全面偵察 → 熟門熟路', () => {
    expect(nextNovelty('familiar')).toBe('balanced')
    expect(nextNovelty('balanced')).toBe('recon')
    expect(nextNovelty('recon')).toBe('familiar')
  })
  it('記得上次', () => {
    saveNovelty('recon')
    expect(loadNovelty()).toBe('recon')
  })
})

describe('上次所在國家', () => {
  it('預設台灣，存了就記得', () => {
    expect(loadCountry()).toBe('TW')
    saveCountry('JP')
    expect(loadCountry()).toBe('JP')
  })
})

describe('午餐隱藏最高檔（用當地時間，不是手機時間）', () => {
  const taipei = { lat: 25.033, lng: 121.5654 }
  const tokyo = { lat: 35.6812, lng: 139.7671 }
  it('沒座標就不隱藏', () => expect(lunchHidesTop(undefined, new Date('2026-10-22T12:00:00+08:00'))).toBe(false))
  it('台北 11:00–14:00 隱藏，其餘不隱藏', () => {
    expect(lunchHidesTop(taipei, new Date('2026-10-22T10:59:00+08:00'))).toBe(false)
    expect(lunchHidesTop(taipei, new Date('2026-10-22T11:00:00+08:00'))).toBe(true)
    expect(lunchHidesTop(taipei, new Date('2026-10-22T13:59:00+08:00'))).toBe(true)
    expect(lunchHidesTop(taipei, new Date('2026-10-22T14:00:00+08:00'))).toBe(false)
  })
  it('東京看東京的鐘：台北 10:30 = 東京 11:30 已經是午餐', () => {
    expect(lunchHidesTop(tokyo, new Date('2026-10-22T10:30:00+08:00'))).toBe(true)
    expect(lunchHidesTop(taipei, new Date('2026-10-22T10:30:00+08:00'))).toBe(false)
  })
  it('隱藏時送出的預算也拿掉第 4 檔；拿完沒剩 = 不限', () => {
    expect(effectiveBudget([3, 4], true)).toEqual([3])
    expect(effectiveBudget([4], true)).toEqual([])
    expect(effectiveBudget([3, 4], false)).toEqual([3, 4])
  })
})

// Round 6：下車的站——最近 5 站，只存站名。
import { STATION_MAX, loadStations, saveStation } from '../../src/prefs.ts'
describe('下車的站（Round 6）', () => {
  beforeEach(() => localStorage.clear())
  it('空的 → []；存了就排第一；同名去重；最多 5 個', () => {
    expect(loadStations()).toEqual([])
    saveStation('新宿駅'); saveStation('東京駅'); saveStation('新宿駅')
    expect(loadStations()).toEqual(['新宿駅', '東京駅'])
    for (const s of ['a', 'b', 'c', 'd']) saveStation(s)
    expect(loadStations()).toHaveLength(STATION_MAX)
    expect(loadStations()[0]).toBe('d')
    expect(loadStations()).not.toContain('東京駅')
  })
  it('只存站名，沒有座標；空白不存；壞資料不炸', () => {
    saveStation('  台北車站 ')
    expect(localStorage.getItem('decide.stations.v1')).toBe('["台北車站"]')
    expect(saveStation('   ')).toEqual(['台北車站'])
    localStorage.setItem('decide.stations.v1', '{bad')
    expect(loadStations()).toEqual([])
    localStorage.setItem('decide.stations.v1', '[1,"x",null]')
    expect(loadStations()).toEqual(['x'])
  })
})
