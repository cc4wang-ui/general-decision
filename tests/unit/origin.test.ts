// Round 6：使用者自己報的「下車的站」站名（loc.label）→ 伺服器清乾淨 → 只進 prompt，不進 log。
import { describe, expect, it } from 'vitest'
import { sanitizeRequest } from '../../src/orderHandler.ts'
import { buildOrderPrompt } from '../../src/prompt.ts'
import type { OrderRequest } from '../../src/types.ts'

const base: OrderRequest = {
  module: 'eat', level: 1, choices: { diet: '都可以', scene: '一個人快吃' }, now: '2026-11-01T12:00:00.000Z', recentOrders: [], novelty: 'balanced',
  loc: { lat: 35.6896, lng: 139.7006, label: '新宿駅' },
}

describe('sanitizeRequest：loc.label', () => {
  it('保留站名；去控制字元、壓空白、截 40 字', () => {
    expect(sanitizeRequest(base).loc).toEqual({ lat: 35.6896, lng: 139.7006, label: '新宿駅' })
    const dirty = sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: ' 新宿\u0000駅   南口\n' } }).loc
    expect(dirty).toEqual({ lat: 1, lng: 2, label: '新宿 駅 南口' })
    const long = sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: 'あ'.repeat(60) } }).loc
    expect(long?.label).toHaveLength(40)
  })
  it('沒有 label／不是字串／空白 → loc 沒有 label 這個鍵', () => {
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2 } }).loc).toEqual({ lat: 1, lng: 2 })
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: 7 as unknown as string } }).loc).toEqual({ lat: 1, lng: 2 })
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: '   ' } }).loc).toEqual({ lat: 1, lng: 2 })
  })
})

describe('prompt：從車站出發', () => {
  it('有 label → 寫「剛在「新宿駅」下車」、要求 steps 從出站寫起；沒有 → 不提車站', () => {
    const withLabel = buildOrderPrompt(base, null, 'JP').user
    expect(withLabel).toContain('剛在「新宿駅」下車')
    expect(withLabel).toContain('出站')
    const without = buildOrderPrompt({ ...base, loc: { lat: 35.6896, lng: 139.7006 } }, null, 'JP').user
    expect(without).not.toContain('下車')
    expect(without).not.toContain('新宿')
  })
})

// Round 6 checker 第 1 輪：口令第一步要從出站寫起（伺服器保證）；方框查到的店切回圓。
import { stationStart } from '../../src/rules.ts'
import { toCandidates, type RawPlace } from '../../src/places.ts'
describe('stationStart：口令從出站寫起', () => {
  const o = { verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['01:17 到店，點定食', '20 分內吃完'], log: 'x' } as unknown as Parameters<typeof stationStart>[0]
  it('模型沒寫到站 → 第一步前面補「從 X 出站走 N 分，」', () => {
    expect(stationStart(o, '新宿駅', 3).steps).toEqual(['從新宿駅出站走 3 分，01:17 到店，點定食', '20 分內吃完'])
    expect(stationStart(o, '新宿駅').steps[0]).toBe('從新宿駅出站後，01:17 到店，點定食')
  })
  it('模型已經寫了出站／車站／站名 → 不動；空站名 → 不動', () => {
    const w = { ...o, steps: ['出站後走 3 分到店', '吃'] }
    expect(stationStart(w, '新宿駅', 3)).toBe(w)
    const n = { ...o, steps: ['往新宿駅東口走', '吃'] }
    expect(stationStart(n, '新宿駅', 3)).toBe(n)
    expect(stationStart(o, '  ', 3)).toBe(o)
  })
})
describe('distM：候選帶到起點的直線距離', () => {
  it('toCandidates 算 distM（公尺，四捨五入）跟 walkMin（80 m/min 進位）', () => {
    const raw = [{ id: 'x', displayName: { text: '店' }, location: { latitude: 35.6896, longitude: 139.7126 }, currentOpeningHours: { openNow: true } }] as unknown as RawPlace[]
    const [c] = toCandidates(raw, { lat: 35.6896, lng: 139.7006 }, new Date('2026-11-01T16:00:00Z'), [], 'Asia/Tokyo')
    expect(c?.distM).toBeGreaterThan(1050)
    expect(c?.distM).toBeLessThan(1120)
    expect(c?.walkMin).toBe(14)
  })
})

// Round 6 checker 第 2 輪：距離上限要對所有關鍵字查詢成立（含「歇」的 locationBias 查詢），不是只有方框。
import { withinRadius } from '../../src/orderHandler.ts'
import type { LanePlan } from '../../src/lanes.ts'
describe('withinRadius：關鍵字查詢一律切回圓', () => {
  const cands = [{ id: 'a', distM: 400 }, { id: 'b', distM: 1000 }, { id: 'c', distM: 1106 }, { id: 'd' }]
  const text = (restrict: boolean, radius = 1000): LanePlan => ({ kind: 'text', lane: 'x', textQuery: '咖啡廳', radius, rank: 'DISTANCE', restrict })
  it('方框（restrict）與偏好（bias）兩種 text 查詢都切；剛好等於半徑留下；沒座標的留下', () => {
    expect(withinRadius(cands, text(true)).map((c) => c.id)).toEqual(['a', 'b', 'd'])
    expect(withinRadius(cands, text(false)).map((c) => c.id)).toEqual(['a', 'b', 'd'])
  })
  it('第二次查詢半徑放大 2.5 倍 → 1106 m 的店留下（Cross 2026-11-02 接受的規則）', () => {
    expect(withinRadius(cands, text(false, 2500)).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('Nearby 查詢（circle restriction）不動', () => {
    const nearby: LanePlan = { kind: 'nearby', lane: 'n', includedTypes: ['cafe'], radius: 500, rank: 'DISTANCE' }
    expect(withinRadius(cands, nearby)).toBe(cands)
  })
})
