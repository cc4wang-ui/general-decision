// Round 6：定位結果分得出「拒絕」跟「地下收不到」；舊的／粗的定位要先問，不直接派店。
import { afterEach, describe, expect, it } from 'vitest'
import { GEO_COARSE_M, GEO_STALE_MS, geoDoubt, getLocation, type GeoResult } from '../../src/api.ts'

type Ok = (p: { coords: { latitude: number; longitude: number; accuracy?: number }; timestamp: number }) => void
type Err = (e: { code: number }) => void
function stubGeo(impl: (ok: Ok, err: Err) => void) {
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: impl }, configurable: true })
}
afterEach(() => { Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }) })

describe('getLocation（Round 6）', () => {
  it('成功 → reason ok，帶 accuracy 與 fixAt', async () => {
    stubGeo((ok) => ok({ coords: { latitude: 35.68, longitude: 139.7, accuracy: 25 }, timestamp: 1_700_000_000_000 }))
    const r = await getLocation()
    expect(r).toEqual({ loc: { lat: 35.68, lng: 139.7 }, denied: false, reason: 'ok', accuracy: 25, fixAt: 1_700_000_000_000 })
  })
  it('使用者拒絕（code 1）→ denied；地下收不到（code 2）→ unavailable；超時（code 3）→ timeout', async () => {
    for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
      stubGeo((_ok, err) => err({ code }))
      const r = await getLocation()
      expect(r.denied).toBe(true)
      expect(r.loc).toBeUndefined()
      expect(r.reason).toBe(reason)
    }
  })
  it('瀏覽器沒有 geolocation → unsupported', async () => {
    expect((await getLocation()).reason).toBe('unsupported')
  })
  it('回呼一直不來 → 自己超時（timeout）', async () => {
    stubGeo(() => { /* 永遠不回 */ })
    const r = await getLocation(50)
    expect(r).toEqual({ denied: true, reason: 'timeout' })
  })
})

describe('geoDoubt：車上的定位', () => {
  const now = 1_700_000_100_000
  const base: GeoResult = { loc: { lat: 25, lng: 121 }, denied: false, reason: 'ok', accuracy: 20, fixAt: now - 5_000 }
  it('新鮮又準 → null', () => { expect(geoDoubt(base, now)).toBeNull() })
  it(`超過 ${GEO_STALE_MS / 1000} 秒 → stale`, () => {
    expect(geoDoubt({ ...base, fixAt: now - GEO_STALE_MS - 1 }, now)).toBe('stale')
    expect(geoDoubt({ ...base, fixAt: now - GEO_STALE_MS }, now)).toBeNull()
  })
  it(`誤差超過 ${GEO_COARSE_M} 公尺 → coarse（比 stale 優先）`, () => {
    expect(geoDoubt({ ...base, accuracy: GEO_COARSE_M + 1 }, now)).toBe('coarse')
    expect(geoDoubt({ ...base, accuracy: 1500, fixAt: now - 999_999 }, now)).toBe('coarse')
  })
  it('沒有 accuracy／fixAt 的瀏覽器 → 不懷疑；沒有座標 → null', () => {
    expect(geoDoubt({ loc: { lat: 25, lng: 121 }, denied: false, reason: 'ok' }, now)).toBeNull()
    expect(geoDoubt({ denied: true, reason: 'unavailable' }, now)).toBeNull()
  })
})
