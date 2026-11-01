// @vitest-environment node
// 發掘引擎 pickPlace（DEV-PLAN-3 W1.3）：B2、B3、B4、同品牌合併、mode／visits、三方針 wildcard、relaxed、種子可重現。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bayes, betaSample, cuisineOf, exposure, mulberry32, PARAMS, pickPlace, type PickCtx } from '../../src/discovery.ts'
import { bandOf } from '../../src/price.ts'
import { clusterKeys } from '../../src/chains.ts'
import type { Band, Novelty, PlaceCandidate, PlaceMemSummary } from '../../src/types.ts'

const NOW = Date.parse('2026-09-11T12:00:00+08:00')
const DAY = 86_400_000

/** n 家「都合格」的店：4.2–4.6 分、評論 100+、步行 3–8 分。 */
function shops(n: number, extra: (i: number) => Partial<PlaceCandidate> = () => ({})): PlaceCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, name: `小館${i}號`, walkMin: 3 + (i % 6), rating: 4.2 + (i % 5) * 0.1, ratingCount: 100 + i * 10,
    primaryType: 'chinese_restaurant', ...extra(i),
  }))
}

function ctx(cands: PlaceCandidate[], over: Partial<PickCtx> = {}, seed = 1): PickCtx {
  return {
    now: NOW, country: 'TW', novelty: 'balanced', exclude: new Set(), rejectedCuisines: new Set(),
    clusters: clusterKeys(cands), rng: mulberry32(seed), ...over,
  }
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('工具函式', () => {
  it('mulberry32：同種子同序列、不同種子不同；落在 [0,1)', () => {
    const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43)
    const xs = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs)
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })
  it('betaSample：平均值接近 a/(a+b)', () => {
    const rng = mulberry32(9)
    const m = Array.from({ length: 4000 }, () => betaSample(8, 2, rng)).reduce((s, x) => s + x, 0) / 4000
    expect(m).toBeGreaterThan(0.77)
    expect(m).toBeLessThan(0.83)
  })
  it('exposure：過一個半衰期剩一半（shown／done 半衰期取 PARAMS，Team Lead 重播校正為 3／7 天）；沒記憶 = 0', () => {
    expect(exposure(undefined, NOW)).toBe(0)
    expect(exposure({ sh: [NOW], dn: [] }, NOW)).toBeCloseTo(1)
    expect(exposure({ sh: [NOW - PARAMS.halfShownDays * DAY], dn: [] }, NOW)).toBeCloseTo(0.5)
    expect(exposure({ sh: [], dn: [NOW - PARAMS.halfDoneDays * DAY] }, NOW)).toBeCloseTo(0.5)
  })
  it('cuisineOf：primaryType 優先，types 補，對不到 other', () => {
    expect(cuisineOf('ramen_restaurant')).toBe('ramen')
    expect(cuisineOf('restaurant', ['restaurant', 'sushi_restaurant'])).toBe('jp')
    expect(cuisineOf('bakery')).toBe('sweet')
    expect(cuisineOf(undefined, ['food'])).toBe('other')
  })
})

describe('pickPlace', () => {
  it('固定種子可重現；不同種子會挑到不同家', () => {
    const c = shops(20)
    const a = pickPlace(c, [], undefined, ctx(c, {}, 7))!
    const b = pickPlace(c, [], undefined, ctx(c, {}, 7))!
    expect(a.place.id).toBe(b.place.id)
    const ids = new Set(Array.from({ length: 30 }, (_, s) => pickPlace(c, [], undefined, ctx(c, {}, s))!.place.id))
    expect(ids.size).toBeGreaterThan(5)
  })

  it('B2：budget [1]、band ≤ 2 的店 ≥ 5 家 → 100 次 0 次出現 band ≥ 3', () => {
    const price = (b: Band | null): Partial<PlaceCandidate> =>
      b === null ? {} : { priceRange: { 1: { start: 80, end: 150 }, 2: { start: 200, end: 400 }, 3: { start: 400, end: 1000 }, 4: { start: 1200, end: 3000 } }[b] }
    const bands: (Band | null)[] = [1, 1, 2, 2, 2, null, 3, 3, 3, 4, 4, 4]
    // 貴的店評分特別高、走路特別近，故意誘惑
    const c = shops(bands.length, (i) => ({ ...price(bands[i]!), ...(bands[i]! !== null && bands[i]! >= 3 ? { rating: 4.9, ratingCount: 3000, walkMin: 1 } : {}) }))
    c.push({ id: 'lvl', name: '高價位', rating: 4.9, ratingCount: 2000, walkMin: 1, priceLevel: 'PRICE_LEVEL_EXPENSIVE' })
    for (let s = 0; s < 100; s++) {
      const r = pickPlace(c, [], undefined, ctx(c, { budget: [1] }, s))!
      const band = bandOf(r.place, 'TW')
      expect(band === null || band < 3, `seed ${s} → ${r.place.id} band ${band}`).toBe(true)
    }
  })

  it('B3：never_again（forever／未到期）、exclude、最近 3 次出過的店 0 次被選', () => {
    const c = shops(12)
    const mem: PlaceMemSummary[] = [
      { id: 'c0', sh: [], dn: [], x: 'forever' },
      { id: 'c1', sh: [], dn: [], x: NOW + 30 * DAY },
      { id: 'c3', sh: [NOW - 3600_000], dn: [] },
      { id: 'c4', sh: [NOW - 7200_000], dn: [] },
      { id: 'c5', sh: [NOW - 3 * 3600_000], dn: [] },
      { id: 'c6', sh: [NOW - 5 * DAY], dn: [] }, // 第 4 舊：不在冷卻內
      { id: 'c7', sh: [], dn: [], x: NOW - 1000 }, // 已過期：可以回來
    ]
    const banned = new Set(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
    const seen = new Set<string>()
    for (let s = 0; s < 200; s++) {
      const r = pickPlace(c, mem, undefined, ctx(c, { exclude: new Set(['c2']) }, s))!
      expect(banned.has(r.place.id), r.place.id).toBe(false)
      seen.add(r.place.id)
    }
    expect(seen.has('c7')).toBe(true)
  })

  it('B3：不再推薦與 exclude 永遠不放寬——剩不到 5 家也不回來；全被排除 → null', () => {
    const c = shops(3)
    const mem: PlaceMemSummary[] = [{ id: 'c0', sh: [], dn: [], x: 'forever' }]
    for (let s = 0; s < 30; s++) expect(pickPlace(c, mem, undefined, ctx(c, { exclude: new Set(['c1']) }, s))!.place.id).toBe('c2')
    expect(pickPlace(c, mem, undefined, ctx(c, { exclude: new Set(['c1', 'c2']) }))).toBeNull()
  })

  it('B4：合格（貝氏 ≥3.7 且 ≥5 則）≥ 5 家時，被選的店一定合格', () => {
    const c = [
      ...shops(6),
      { id: 'bad', name: '差評', rating: 2.8, ratingCount: 500, walkMin: 1 },
      { id: 'few', name: '三則五星', rating: 5, ratingCount: 3, walkMin: 1 },
      { id: 'none', name: '沒評分', walkMin: 1 },
    ]
    for (let s = 0; s < 200; s++) {
      const r = pickPlace(c, [], undefined, ctx(c, {}, s))!
      expect(bayes(r.place)).toBeGreaterThanOrEqual(3.7)
      expect(r.place.ratingCount ?? 0).toBeGreaterThanOrEqual(5)
      expect(r.relaxed).toEqual([])
    }
  })

  it('B4：合格不足 5 家 → 放寬並記 relaxed、console.warn；補回的是評分最高的', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = [...shops(2), { id: 'ok3', name: '3.5', rating: 3.4, ratingCount: 400 }, { id: 'worst', name: '最差', rating: 2.0, ratingCount: 900 }, { id: 'w2', name: '次差', rating: 2.5, ratingCount: 900 }, { id: 'w3', name: '第三差', rating: 2.2, ratingCount: 900 }]
    const r = pickPlace(c, [], undefined, ctx(c))!
    expect(r.relaxed).toContain('floor')
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.some((x) => String(x[0]).includes('[pick] 放寬'))).toBe(true)
    // 補到 5 家：2 家合格 + 3.4、2.5、2.2 → 「最差」2.0 永遠不會被選
    for (let s = 0; s < 100; s++) expect(pickPlace(c, [], undefined, ctx(c, {}, s))!.place.id).not.toBe('worst')
  })

  it('同品牌曝光合併：昨天去過摩斯 A 店，今天摩斯 B 店幾乎不會被派', () => {
    const c = [
      ...shops(6),
      { id: 'mosA', name: '摩斯漢堡 南京店', rating: 4.8, ratingCount: 2000, walkMin: 1, primaryType: 'hamburger_restaurant' },
      { id: 'mosB', name: '摩斯漢堡 復興店', rating: 4.8, ratingCount: 2000, walkMin: 1, primaryType: 'hamburger_restaurant' },
    ]
    // mosA 被 never_again 擋掉（只剩 mosB 可選），記憶裡 mosA 昨天去過
    const memBrand: PlaceMemSummary[] = [{ id: 'mosA', sh: [NOW - DAY], dn: [NOW - DAY], x: NOW + DAY, b: 'mos' }]
    const memNone: PlaceMemSummary[] = [{ id: 'mosA', sh: [], dn: [], x: NOW + DAY }]
    let withBrand = 0
    let without = 0
    for (let s = 0; s < 300; s++) {
      if (pickPlace(c, memBrand, undefined, ctx(c, {}, s))!.place.id === 'mosB') withBrand++
      if (pickPlace(c, memNone, undefined, ctx(c, {}, s))!.place.id === 'mosB') without++
    }
    expect(without).toBeGreaterThan(30)
    expect(withBrand).toBeLessThan(without / 5)
  })

  it('mode／visits：沒記憶 → new、visits 1；去過 2 次 → revisit、visits 3；只出過沒去 → new', () => {
    const c = shops(1)
    expect(pickPlace(c, [], undefined, ctx(c, { novelty: 'familiar' }))).toMatchObject({ mode: 'new', visits: 1 })
    const done2: PlaceMemSummary[] = [{ id: 'c0', sh: [NOW - 9 * DAY, NOW - 20 * DAY], dn: [NOW - 9 * DAY, NOW - 20 * DAY] }]
    expect(pickPlace(c, done2, undefined, ctx(c, { novelty: 'familiar' }))).toMatchObject({ mode: 'revisit', visits: 3 })
    const shownOnly: PlaceMemSummary[] = [{ id: 'c0', sh: [NOW - 9 * DAY], dn: [] }]
    expect(pickPlace(c, shownOnly, undefined, ctx(c, { novelty: 'familiar' }))).toMatchObject({ mode: 'new', visits: 1 })
  })

  it('S-5：「第 N 次」不再卡在 6——dc（累計完成次數）=7 → visits 8；沒帶 dc 退回 dn.length', () => {
    const c = shops(1)
    const dn = [1, 2, 3, 4, 5].map((d) => NOW - d * 3 * DAY)
    const withDc: PlaceMemSummary[] = [{ id: 'c0', sh: [...dn], dn, dc: 7 }]
    expect(pickPlace(c, withDc, undefined, ctx(c, { novelty: 'familiar' }))).toMatchObject({ mode: 'revisit', visits: 8 })
    const legacy: PlaceMemSummary[] = [{ id: 'c0', sh: [...dn], dn }]
    expect(pickPlace(c, legacy, undefined, ctx(c, { novelty: 'familiar' }))).toMatchObject({ mode: 'revisit', visits: 6 })
  })

  it('三方針的 wildcard 機率：familiar 0、balanced ≈0.2、recon 1（有沒見過的店時）', () => {
    const c = shops(20)
    // 一半去過，一半沒見過
    const mem: PlaceMemSummary[] = c.slice(0, 10).map((x, i) => ({ id: x.id, sh: [NOW - (5 + i) * DAY], dn: [NOW - (5 + i) * DAY] }))
    const rate = (novelty: Novelty) => {
      let w = 0
      for (let s = 0; s < 1000; s++) if (pickPlace(c, mem, undefined, ctx(c, { novelty }, s))!.mode === 'wildcard') w++
      return w / 1000
    }
    expect(rate('familiar')).toBe(0)
    const b = rate('balanced')
    expect(b).toBeGreaterThan(0.15)
    expect(b).toBeLessThan(0.25)
    expect(rate('recon')).toBe(1)
  })

  it('recon：只挑沒見過的非連鎖；不夠 3 家 → exhausted:true 並退回均衡打分', () => {
    const c = [...shops(4), { id: 'chain1', name: '八方雲集 南京店', rating: 4.6, ratingCount: 900, walkMin: 1 }, { id: 'chain2', name: '八方雲集 復興店', rating: 4.6, ratingCount: 900, walkMin: 1 }]
    for (let s = 0; s < 100; s++) {
      const r = pickPlace(c, [], undefined, ctx(c, { novelty: 'recon' }, s))!
      expect(r.place.id.startsWith('chain')).toBe(false)
      expect(r.exhausted).toBe(false)
    }
    const mem: PlaceMemSummary[] = ['c0', 'c1'].map((id) => ({ id, sh: [NOW - 10 * DAY], dn: [NOW - 10 * DAY] }))
    const r = pickPlace(c, mem, undefined, ctx(c, { novelty: 'recon' }))!
    expect(r.exhausted).toBe(true)
    expect(r.mode).not.toBe('wildcard')
  })

  it('今天不想吃這類 ×0.5：被拒的細類被選機率明顯下降', () => {
    const c = shops(10, (i) => ({ primaryType: i < 5 ? 'ramen_restaurant' : 'chinese_restaurant', rating: 4.4, ratingCount: 300, walkMin: 5 }))
    const count = (rej: Set<string>) => {
      let n = 0
      for (let s = 0; s < 1000; s++) if (cuisineOf(pickPlace(c, [], undefined, ctx(c, { rejectedCuisines: rej }, s))!.place.primaryType) === 'ramen') n++
      return n
    }
    expect(count(new Set(['ramen']))).toBeLessThan(count(new Set()) * 0.6)
  })

  it('連鎖 ×0.6：同條件下連鎖店被選的比例低於非連鎖', () => {
    const c = shops(10, (i) => ({ name: i < 5 ? `八方雲集 ${i}號店` : `小館${i}號`, rating: 4.4, ratingCount: 300, walkMin: 5 }))
    let chain = 0
    for (let s = 0; s < 2000; s++) if (pickPlace(c, [], undefined, ctx(c, {}, s))!.place.name.startsWith('八方')) chain++
    expect(chain / 2000).toBeLessThan(0.4)
  })

  it('愛店在熟門熟路下 ×2', () => {
    const c = shops(6, () => ({ rating: 4.4, ratingCount: 300, walkMin: 5 }))
    const mem: PlaceMemSummary[] = [{ id: 'c0', sh: [NOW - 30 * DAY], dn: [NOW - 30 * DAY], fav: true }, { id: 'c1', sh: [NOW - 30 * DAY], dn: [NOW - 30 * DAY] }]
    let fav = 0
    let plain = 0
    for (let s = 0; s < 2000; s++) {
      const id = pickPlace(c, mem, undefined, ctx(c, { novelty: 'familiar' }, s))!.place.id
      if (id === 'c0') fav++
      if (id === 'c1') plain++
    }
    expect(fav).toBeGreaterThan(plain * 1.5)
  })

  it('價位：預算內一家都沒有 → 補相鄰檔照樣派、記 relaxed price', () => {
    const c = shops(6, () => ({ priceRange: { start: 200, end: 400 } }))
    const r = pickPlace(c, [], undefined, ctx(c, { budget: [1] }))!
    expect(r.relaxed).toContain('price')
    expect(bandOf(r.place, 'TW')).toBe(2)
  })

  it('價位（2026-11-01 實測）：預算內只有 2 家＋補回 4 家 → 200 次全派預算內，不記 relaxed price', () => {
    // 預算外（相鄰檔）的店評分高、走路近，故意誘惑（實測：補回的相鄰檔常被抽中）
    const c = shops(6, (i) => i < 2
      ? { priceRange: { start: 400, end: 900 }, rating: 4.1, ratingCount: 60, walkMin: 9 }
      : { priceRange: { start: 200, end: 400 }, rating: 4.9, ratingCount: 3000, walkMin: 1 }) // 相鄰檔（band 2，fit 0.35）
    for (let s = 0; s < 200; s++) {
      const r = pickPlace(c, [], undefined, ctx(c, { budget: [3] }, s))!
      expect(bandOf(r.place, 'TW'), `seed ${s} → ${r.place.id}`).toBe(3)
      expect(r.relaxed).not.toContain('price')
    }
  })
})
