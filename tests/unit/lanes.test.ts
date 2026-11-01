// @vitest-environment node
// lane 輪替（DEV-PLAN-3 W1.2）：素食 lane、甜食 lane、只挑 verified、rankPreference 交替、細類偏好、400 退路。
import { describe, expect, it } from 'vitest'
import { CARD_BY_ID } from '../../src/cards.ts'
import { mulberry32 } from '../../src/discovery.ts'
import { LANES, QUERY_LANES, SWEET_QUERIES, VEG_QUERIES, laneEst, looksVeg, mealLanes, pickLane, priceLevelsFor, rescuePlan, widenPlan, type LanePlan } from '../../src/lanes.ts'
import { priceFit } from '../../src/price.ts'

const many = (n: number, f: (seed: number) => LanePlan) => Array.from({ length: n }, (_, s) => f(s + 1))

describe('LANES 表', () => {
  it('2023 Table A 的 type 標 verified；R3§1.3 新增的標 verified:false', () => {
    const unverified = LANES.filter((l) => !l.verified).map((l) => l.id).sort()
    expect(unverified).toEqual([
      'chinese_noodle_restaurant', 'fine_dining_restaurant', 'hot_pot_restaurant', 'japanese_curry_restaurant', 'japanese_izakaya_restaurant',
      'noodle_shop', 'taiwanese_restaurant', 'tonkatsu_restaurant', 'yakiniku_restaurant', 'yakitori_restaurant',
    ])
    for (const l of LANES.filter((x) => x.verified)) expect(l.since).toBe('2023')
    expect(new Set(LANES.map((l) => l.id)).size).toBe(LANES.length)
  })
})

describe('pickLane', () => {
  it('Nearby 只在 verified 的 lane 裡挑；關鍵字 lane 只用 QUERY_LANES，限在方框內（500 個種子）', () => {
    const verified = new Set(LANES.filter((l) => l.verified).map((l) => l.id))
    const queries = new Set(QUERY_LANES.TW.map((l) => l.q))
    const plans = many(500, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(s)))
    for (const p of plans) {
      if (p.kind === 'nearby') expect(verified.has(p.lane), p.lane).toBe(true)
      else { expect(queries.has(p.textQuery), p.textQuery).toBe(true); expect(p.restrict).toBe(true); expect(p.lane).toBe(`q:${p.textQuery}`) }
    }
    // Round 4：兩種都要出現，關鍵字是主力（台灣的便當、麵店、小吃 Nearby 撈不到）
    const textShare = plans.filter((p) => p.kind === 'text').length / plans.length
    expect(textShare).toBeGreaterThan(0.4)
    expect(textShare).toBeLessThan(0.9)
  })

  it('台灣用台灣關鍵字、日本用日本關鍵字；其他國家只用 Nearby', () => {
    const jp = many(300, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'JP', mulberry32(s))).filter((p) => p.kind === 'text')
    const jpQ = new Set(QUERY_LANES.JP.map((l) => l.q))
    expect(jp.length).toBeGreaterThan(0)
    for (const p of jp) expect(jpQ.has((p as { textQuery: string }).textQuery)).toBe(true)
    expect(many(200, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'other', mulberry32(s))).every((p) => p.kind === 'nearby')).toBe(true)
  })

  it('有預算：只走關鍵字 lane、帶 priceLevels、推估價位對得上（Round 4）', () => {
    for (const budget of [[1], [2], [3], [4], [1, 2]] as const) {
      const plans = many(200, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(s), 12, [...budget]))
      for (const p of plans) {
        expect(p.kind).toBe('text')
        if (p.kind !== 'text') continue
        expect(p.priceLevels).toEqual(priceLevelsFor([...budget]))
        expect(priceFit(laneEst(p.lane)!, [...budget])).toBeGreaterThan(0)
      }
    }
    expect(priceLevelsFor([1])).toEqual(['PRICE_LEVEL_INEXPENSIVE'])
    expect(priceLevelsFor([3, 4])).toEqual(['PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'])
    expect(priceLevelsFor(undefined)).toBeUndefined()
  })

  it('一般 eat 不會挑甜點／咖啡 lane，會輪替出很多種', () => {
    const lanes = new Set(many(500, (s) => pickLane(CARD_BY_ID.eat, { taste: '鹹食' }, undefined, 'TW', mulberry32(s))).map((p) => p.lane))
    for (const l of ['bakery', 'cafe', 'coffee_shop', 'ice_cream_shop']) expect(lanes.has(l)).toBe(false)
    expect(lanes.size).toBeGreaterThan(10)
  })

  it('忌口「素」→ 素食 lane（素食＋純素）或素食關鍵字', () => {
    const veg = new Set(VEG_QUERIES.TW.map((l) => l.q))
    for (const p of many(50, (s) => pickLane(CARD_BY_ID.eat, { diet: '素' }, undefined, 'TW', mulberry32(s)))) {
      if (p.kind === 'nearby') expect(p.includedTypes).toEqual(['vegetarian_restaurant', 'vegan_restaurant'])
      else expect(veg.has(p.textQuery)).toBe(true)
    }
  })

  it('甜食 → 甜食 lane 組（麵包／咖啡／冰店）或甜食關鍵字', () => {
    const sweet = new Set(['bakery', 'cafe', 'ice_cream_shop', 'coffee_shop'])
    const sweetQ = new Set(SWEET_QUERIES.TW.map((l) => l.q))
    for (const p of many(100, (s) => pickLane(CARD_BY_ID.eat, { taste: '甜食' }, undefined, 'TW', mulberry32(s)))) {
      if (p.kind === 'nearby') expect(p.includedTypes.every((t) => sweet.has(t))).toBe(true)
      else expect(sweetQ.has(p.textQuery)).toBe(true)
    }
  })

  it('不吃牛 → 不排牛排館；14 點後不排早午餐', () => {
    const noBeef = many(500, (s) => pickLane(CARD_BY_ID.eat, { diet: '不吃牛' }, undefined, 'TW', mulberry32(s)))
    expect(noBeef.some((p) => p.lane === 'steak_house' || p.lane === 'q:牛肉麵' || p.lane === 'q:燒肉')).toBe(false)
    const dinner = many(500, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(s), 19))
    expect(dinner.some((p) => p.lane === 'breakfast_restaurant' || p.lane === 'brunch_restaurant' || p.lane === 'q:早午餐')).toBe(false)
    expect(mealLanes({}, 'TW', 9).some((l) => l.id === 'breakfast_restaurant')).toBe(true)
  })

  it('rankPreference：eat 的 Nearby 在 POPULARITY／DISTANCE 交替、關鍵字在 DISTANCE／RELEVANCE 交替，rest 在 DISTANCE／RELEVANCE 交替', () => {
    const eat = many(400, (s) => pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(s)))
    expect(new Set(eat.filter((p) => p.kind === 'text').map((p) => p.rank))).toEqual(new Set(['DISTANCE', 'RELEVANCE']))
    const eatRanks = eat.filter((p) => p.kind === 'nearby').map((p) => p.rank)
    expect(new Set(eatRanks)).toEqual(new Set(['POPULARITY', 'DISTANCE']))
    const share = eatRanks.filter((r) => r === 'POPULARITY').length / eatRanks.length
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.65)
    const rest = many(200, (s) => pickLane(CARD_BY_ID.rest, { drink: '酒吧' }, undefined, 'TW', mulberry32(s)))
    expect(rest.every((p) => p.kind === 'text' && p.textQuery === '酒吧')).toBe(true)
    expect(new Set(rest.map((p) => p.rank))).toEqual(new Set(['DISTANCE', 'RELEVANCE']))
  })

  it('細類偏好：拉麵 Beta(30,1) 時，拉麵 lane 的比例遠高於沒有偏好', () => {
    const count = (cuisine?: Record<string, [number, number]>) =>
      many(1000, (s) => pickLane(CARD_BY_ID.eat, {}, cuisine, 'TW', mulberry32(s))).filter((p) => p.lane === 'ramen_restaurant' || p.lane === 'q:拉麵').length
    const liked = count({ ramen: [30, 1], jp: [1, 5], cn: [1, 5], kr: [1, 5], western: [1, 5], other: [1, 5], seafood: [1, 5], veg: [1, 5], fast: [1, 5] })
    expect(liked).toBeGreaterThan(600) // 75% 走偏好，加上 25% 均勻裡也可能抽到
    expect(count()).toBeLessThan(250)
  })

  it('同種子 → 同一條 lane', () => {
    expect(pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(99))).toEqual(pickLane(CARD_BY_ID.eat, {}, undefined, 'TW', mulberry32(99)))
  })
})

describe('widenPlan（第二次呼叫）', () => {
  // 2026-10-26 正式站實測後改：深夜 Nearby 熱門排序撈回的店幾乎全打烊 → 第二次一律 Text Search + openNow。
  it('Nearby 一般 lane：改 Text Search「餐廳」＋ openNow、半徑 ×2.5、依距離；日本用「レストラン」', () => {
    const first: LanePlan = { kind: 'nearby', lane: 'ramen_restaurant', includedTypes: ['ramen_restaurant'], radius: 800, rank: 'POPULARITY' }
    expect(widenPlan(first)).toEqual({ kind: 'text', lane: 'text:open-now', textQuery: '餐廳', radius: 2000, rank: 'DISTANCE', openNow: true })
    expect(widenPlan(first, { country: 'JP' })).toMatchObject({ kind: 'text', textQuery: 'レストラン', openNow: true })
  })
  it('甜食／素食保留自己的 type；400 時一律退回營業中的餐廳 Text Search', () => {
    const veg = pickLane(CARD_BY_ID.eat, { diet: '素' }, undefined, 'TW', mulberry32(1))
    expect((widenPlan(veg) as { includedTypes: string[] }).includedTypes).toEqual(['vegetarian_restaurant', 'vegan_restaurant'])
    expect(widenPlan(veg, { forceRestaurant: true })).toMatchObject({ kind: 'text', textQuery: '餐廳', openNow: true })
    const sweet = pickLane(CARD_BY_ID.eat, { taste: '甜食' }, undefined, 'TW', mulberry32(1))
    expect((widenPlan(sweet) as { includedTypes: string[] }).includedTypes).toEqual(['bakery', 'cafe', 'ice_cream_shop'])
  })
  it('Text Search：同關鍵字、半徑 ×2.5、換 rankPreference、只要營業中', () => {
    expect(widenPlan({ kind: 'text', lane: 'text:咖啡廳', textQuery: '咖啡廳', radius: 800, rank: 'DISTANCE' }))
      .toEqual({ kind: 'text', lane: 'text:咖啡廳', textQuery: '咖啡廳', radius: 2000, rank: 'RELEVANCE', openNow: true })
  })
  it('Round 4：帶 rng 時通用關鍵字與排序會輪替（不再每次都是「餐廳＋依距離」那同一批）', () => {
    const first: LanePlan = { kind: 'nearby', lane: 'ramen_restaurant', includedTypes: ['ramen_restaurant'], radius: 800, rank: 'POPULARITY' }
    const plans = Array.from({ length: 100 }, (_, i) => widenPlan(first, { country: 'TW', rng: mulberry32(i + 1) }))
    expect(new Set(plans.map((p) => (p as { textQuery: string }).textQuery))).toEqual(new Set(['餐廳', '美食', '小吃']))
    expect(new Set(plans.map((p) => p.rank))).toEqual(new Set(['DISTANCE', 'RELEVANCE']))
    for (const p of plans) expect(p).toMatchObject({ kind: 'text', lane: 'text:open-now', radius: 2000, openNow: true })
  })
  it('Round 4：eat 的關鍵字 lane 第二次改通用關鍵字、保留 priceLevels（2026-11-01 內湖實測）；dropPrice 才拿掉；甜食／素食關鍵字保留自己', () => {
    const levels = ['PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE']
    const q: LanePlan = { kind: 'text', lane: 'q:便當', textQuery: '便當', radius: 800, rank: 'DISTANCE', restrict: true, priceLevels: levels }
    expect(widenPlan(q, { country: 'TW' })).toEqual({ kind: 'text', lane: 'text:open-now', textQuery: '餐廳', radius: 2000, rank: 'DISTANCE', openNow: true, priceLevels: levels })
    expect(widenPlan(q, { country: 'TW', dropPrice: true })).toEqual({ kind: 'text', lane: 'text:open-now', textQuery: '餐廳', radius: 2000, rank: 'DISTANCE', openNow: true })
    const sweet = widenPlan({ kind: 'text', lane: 'q:豆花', textQuery: '豆花', radius: 800, rank: 'RELEVANCE', restrict: true, priceLevels: levels }, { country: 'TW' })
    expect(sweet).toEqual({ kind: 'text', lane: 'q:豆花', textQuery: '豆花', radius: 2000, rank: 'DISTANCE', openNow: true, priceLevels: levels })
    const plain = widenPlan({ kind: 'text', lane: 'text:咖啡廳', textQuery: '咖啡廳', radius: 800, rank: 'DISTANCE', priceLevels: levels }, { dropPrice: true })
    expect(plain).not.toHaveProperty('priceLevels')
    // 沒預算的第一次 → 第二次也不會憑空多出 priceLevels
    expect(widenPlan({ kind: 'text', lane: 'q:便當', textQuery: '便當', radius: 800, rank: 'DISTANCE', restrict: true })).not.toHaveProperty('priceLevels')
  })
  it('Round 4 救援：3 km 內營業中的便利商店（台灣／日本／其他）', () => {
    expect(rescuePlan('TW')).toMatchObject({ kind: 'text', lane: 'rescue', textQuery: '便利商店', openNow: true, radius: 3000, rank: 'DISTANCE' })
    expect(rescuePlan('JP')).toMatchObject({ textQuery: 'コンビニ' })
    expect(rescuePlan('other')).toMatchObject({ textQuery: 'convenience store' })
  })
})

import { budgetLine } from '../../src/prompt.ts'
describe('budgetLine：店跟預算對不上時，方向要講對（PR #22 紅隊）', () => {
  it('對得上、沒選預算、價位未知 → 不講', () => {
    expect(budgetLine(1, [1])).toBe('')
    expect(budgetLine(3, undefined)).toBe('')
    expect(budgetLine(null, [1])).toBe('')
  })
  it('貴一檔 → 我准了；貴兩檔以上 → 預算內的沒開，比較貴', () => {
    expect(budgetLine(2, [1])).toContain('超出預算一檔')
    expect(budgetLine(3, [1])).toContain('比較貴')
  })
  it('便宜 → 講便宜，不准講貴（選 1,000+ 被派到 ≤150）', () => {
    expect(budgetLine(1, [4])).toContain('比較便宜')
    expect(budgetLine(1, [4])).not.toContain('貴')
    expect(budgetLine(3, [4])).toContain('省一點')
  })
})

describe('looksVeg（忌口「素」硬過濾，checker 2026-11-01）', () => {
  it('素食／純素類型，或店名有素、蔬、齋、vegan、ヴィーガン → 留；壽司關東煮、牛肉麵 → 不留', () => {
    expect(looksVeg({ name: '湖水灣', primaryType: 'vegetarian_restaurant' })).toBe(true)
    expect(looksVeg({ name: 'Plants', types: ['vegan_restaurant', 'restaurant'] })).toBe(true)
    for (const name of ['明珠素食', '布衣蔬食', '吉祥齋', 'Vegan Kitchen', 'T’s たんたん ヴィーガン', '精進料理 醍醐']) expect(looksVeg({ name }), name).toBe(true)
    for (const name of ['大月壽司 關東煮黃石店', '老王牛肉麵', '燒肉本舖']) expect(looksVeg({ name, primaryType: 'restaurant' }), name).toBe(false)
  })
})
