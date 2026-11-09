// 店家過濾（清理 PR，P1-11）：DENY 清單、地標名稱、最低評論數 50。
import { describe, expect, it } from 'vitest'
import { DENY_ANY, DENY_PRIMARY, LANDMARK_NAMES, MIN_REVIEWS, isDeniedCandidate, isDeniedName } from '../../src/venueCheck.ts'

describe('src/venueCheck.ts', () => {
  it('MIN_REVIEWS 是 50（伺服器與前端共用的單一真相來源）', () => {
    expect(MIN_REVIEWS).toBe(50)
  })

  it('DENY_PRIMARY 含車站／地標／商場；point_of_interest 只在 primary 擋，不在 types 擋', () => {
    expect(DENY_PRIMARY.has('transit_station')).toBe(true)
    expect(DENY_PRIMARY.has('point_of_interest')).toBe(true)
    expect(DENY_PRIMARY.has('shopping_mall')).toBe(true)
    expect(DENY_ANY.has('transit_station')).toBe(true)
    // 關鍵陷阱：point_of_interest 幾乎出現在每一間真店的 types 裡，放進 DENY_ANY 會把真店全擋掉
    expect(DENY_ANY.has('point_of_interest')).toBe(false)
  })

  it('isDeniedCandidate：primary 或 types 命中就擋；真店（types 含 point_of_interest）不擋；缺欄位不亂擋', () => {
    expect(isDeniedCandidate({ primaryType: 'transit_station' })).toBe(true)
    expect(isDeniedCandidate({ primaryType: 'point_of_interest' })).toBe(true)
    expect(isDeniedCandidate({ types: ['restaurant', 'train_station'] })).toBe(true)
    expect(isDeniedCandidate({ primaryType: 'restaurant', types: ['restaurant', 'food', 'point_of_interest', 'establishment'] })).toBe(false)
    expect(isDeniedCandidate({ primaryType: 'cafe', types: ['cafe'] })).toBe(false)
    expect(isDeniedCandidate({})).toBe(false)
    expect(isDeniedCandidate({ types: [] })).toBe(false)
  })

  it('isDeniedName：壁畫地標子字串命中；真藝廊不擋；缺名不亂擋', () => {
    expect(isDeniedName('明日の神話')).toBe(true)
    expect(isDeniedName('岡本太郎「明日の神話」')).toBe(true)
    expect(isDeniedName('Myth of Tomorrow')).toBe(true)
    expect(isDeniedName('DIESEL ART GALLERY')).toBe(false)
    expect(isDeniedName(undefined)).toBe(false)
    expect(isDeniedName('')).toBe(false)
    expect(LANDMARK_NAMES).toEqual(['明日の神話', 'Myth of Tomorrow'])
  })
})
