// 地區偏好（清理 PR，P1-11）：中心點＋半徑 1000m、haversine、未知地區退回澀谷。
import { describe, expect, it } from 'vitest'
import { AREA_NAMES, AREA_RADIUS_M, AREAS, areaCenter, distanceKm, withinArea } from '../../src/areas.ts'

describe('src/areas.ts', () => {
  // 澀谷／原宿是已知地區（第一個測試即斷言 AREAS['澀谷'] 的值），索引的 `!` 是有證據的。
  const shibuya = AREAS['澀谷']!
  const harajuku = AREAS['原宿']!

  it('半徑是 1000 公尺；6 個已知地區', () => {
    expect(AREA_RADIUS_M).toBe(1000)
    expect(AREA_NAMES).toEqual(['澀谷', '新宿', '原宿', '表参道', '恵比寿', '代官山'])
    expect(AREAS['澀谷']).toEqual({ lat: 35.6595, lng: 139.7005 })
  })

  it('areaCenter：已知地區回該區中心；未知地區退回澀谷（不是 null＝不過濾）', () => {
    expect(areaCenter('新宿')).toEqual({ lat: 35.6896, lng: 139.7006 })
    expect(areaCenter('不存在的區')).toEqual(AREAS['澀谷'])
    expect(areaCenter('')).toEqual(AREAS['澀谷'])
  })

  it('distanceKm：同一點是 0；對稱；澀谷→原宿約 1.2 公里', () => {
    expect(distanceKm(shibuya, shibuya)).toBe(0)
    expect(distanceKm(shibuya, harajuku)).toBeGreaterThan(1.1)
    expect(distanceKm(shibuya, harajuku)).toBeLessThan(1.3)
    expect(distanceKm(shibuya, harajuku)).toBeCloseTo(distanceKm(harajuku, shibuya), 10)
  })

  it('withinArea：中心自己在內；原宿中心對澀谷在外（1.2km > 1km）；未知地區用澀谷中心判', () => {
    expect(withinArea('澀谷', shibuya)).toBe(true)
    expect(withinArea('澀谷', harajuku)).toBe(false)
    // 澀谷站核心約 600m 內：Scramble Square 方向（北約 0.005° ≈ 550m）在內
    expect(withinArea('澀谷', { lat: 35.6645, lng: 139.7005 })).toBe(true)
    expect(withinArea('不存在的區', shibuya)).toBe(true)
    expect(withinArea('不存在的區', harajuku)).toBe(false)
  })
})
