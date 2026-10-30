// @vitest-environment node
// Round 4 模板口令：Claude 失敗時每一張卡都要有一道合法、照硬規則的口令，經過 enforceRules 後不含禁詞。
import { describe, expect, it, vi } from 'vitest'
import { findBanned } from '../../src/banned.ts'
import { CARDS } from '../../src/cards.ts'
import { effectiveBand, estText } from '../../src/price.ts'
import { enforceRules } from '../../src/rules.ts'
import { templateOrder } from '../../src/template.ts'
import type { PickResult } from '../../src/types.ts'

const now = new Date('2026-10-30T21:40:00+08:00')
const pick: PickResult = {
  place: { id: 'p1', name: '阿財魯肉飯', walkMin: 6, openUntil: '23:00', primaryType: 'taiwanese_restaurant', rating: 4.5, ratingCount: 300 },
  mode: 'new', visits: 1, relaxed: [], exhausted: false,
}

describe('templateOrder（Claude 失敗時的口令）', () => {
  for (const card of CARDS) {
    it(`${card.id}：有 big、有 steps、經過 enforceRules 後沒有禁詞`, () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const choices = Object.fromEntries(card.intake.filter((f) => f.type !== 'bands').map((f) => [f.key, f.default]))
      const p = card.needsPlaces ? pick : null
      const raw = templateOrder({ module: card.id, choices, recentOrders: [] }, p, now, 'Asia/Taipei')
      const o = enforceRules(raw, card.id, choices, now, [], { level: 1, country: 'TW', pick: p })
      expect(o.meme.big.length).toBeGreaterThan(0)
      expect(o.steps.length).toBeGreaterThan(0)
      expect(findBanned([o.meme.top, o.meme.big, o.meme.bot, ...o.steps, o.log].join('\n'))).toEqual([])
      if (p) expect(o.meme.big).toBe('阿財魯肉飯')
      else expect(o.place).toBeUndefined()
    })
  }

  it('硬規則照算：sleep 熄燈時間、attend ★≤2 不去、buy 預設不買', () => {
    expect(templateOrder({ module: 'sleep', choices: { wake: '06:30' }, recentOrders: [] }, null, now, 'Asia/Taipei').meme.big).toBe('22:30 熄燈')
    expect(templateOrder({ module: 'attend', choices: { occasion: '飯局', stars: 2 }, recentOrders: [] }, null, now, 'Asia/Taipei').verdict).toBe('stop')
    expect(templateOrder({ module: 'buy', choices: {}, recentOrders: [] }, null, now, 'Asia/Taipei').verdict).toBe('stop')
  })

  it('喝酒：兩杯上限、幾點前離開、不准開車', () => {
    const o = templateOrder({ module: 'rest', choices: { drink: '居酒屋' }, recentOrders: [] }, pick, now, 'Asia/Taipei')
    expect(o.steps.join('')).toMatch(/兩杯/)
    expect(o.steps.join('')).toMatch(/23:10 前離開/)
    expect(o.steps.join('')).toMatch(/不准開車/)
  })
})

describe('effectiveBand（Round 4 價位推估）', () => {
  it('Google 有資料就用，不是推估', () => {
    expect(effectiveBand({ priceRange: { start: 100, end: 140, currency: 'TWD' }, primaryType: 'steak_house' }, 'TW')).toEqual({ band: 1, est: false })
  })
  it('沒資料：店的類型先、lane 推估後；台日以外不推估', () => {
    expect(effectiveBand({ primaryType: 'fine_dining_restaurant', estBand: 2.5 }, 'TW')).toEqual({ band: 4, est: true })
    expect(effectiveBand({ primaryType: 'restaurant', estBand: 1 }, 'TW')).toEqual({ band: 1, est: true })
    expect(effectiveBand({ primaryType: 'ramen_restaurant' }, 'JP')).toEqual({ band: 1.5, est: true })
    expect(effectiveBand({ primaryType: 'restaurant' }, 'TW')).toEqual({ band: null, est: false })
    expect(effectiveBand({ primaryType: 'ramen_restaurant' }, 'other')).toEqual({ band: null, est: false })
  })
  it('推估字串只有描述、沒有金額（T6）', () => {
    for (const b of [1, 1.5, 2, 2.5, 3, 3.5, 4]) expect(estText(b)).toMatch(/^推估\D+$/)
  })
})
