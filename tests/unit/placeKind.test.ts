// 種類判斷（紅隊 §3.1 的永久測試）：用真實店名當 mock，不用「烏龍麵專門店」這種直接含關鍵字的名字。
import { describe, expect, it } from 'vitest'
import { kindLabel, kindOfCandidate, normalizeKind } from '../../src/placeKind.ts'

const cand = (name: string, primaryType = 'restaurant', types: string[] = ['restaurant']) => ({ name, primaryType, types })

describe('kindOfCandidate：真實店名', () => {
  it('麺喜やしま（烏龍麵店，類型只有 restaurant）→ udon：名字只有一個「麺」字，沒有讃岐／うどん可認', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBe('udon')
  })
  it('全名「讃岐うどん 麺喜やしま」→ udon', () => {
    expect(kindOfCandidate(cand('讃岐うどん 麺喜やしま'))).toBe('udon')
  })
  it('叙々苑（yakiniku_restaurant）→ yakiniku', () => {
    expect(kindOfCandidate(cand('叙々苑', 'yakiniku_restaurant', ['yakiniku_restaurant', 'restaurant']))).toBe('yakiniku')
  })
  it('藪蕎麦（蕎麥麵，類型只有 restaurant）→ soba：簡體「蕎麦」要認得到', () => {
    expect(kindOfCandidate(cand('藪蕎麦'))).toBe('soba')
  })
  it('丸亀製麺 → udon', () => {
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
  })
  it('麺屋武蔵 → undefined：麺屋是拉麵店常用名字，不能算烏龍麵', () => {
    expect(kindOfCandidate(cand('麺屋武蔵'))).toBeUndefined()
  })
  it('つけ麺屋 → undefined：つけ麺是拉麵，不能算烏龍麵', () => {
    expect(kindOfCandidate(cand('つけ麺 さなだ'))).toBeUndefined()
  })
  it('d47食堂（一般餐廳）→ undefined：認不出種類時 UI 只給單店排除，不顯示「不要這類」', () => {
    expect(kindOfCandidate(cand('d47食堂'))).toBeUndefined()
  })
})

describe('kindOfCandidate：Table A 類型歸一化', () => {
  it('japanese_curry_restaurant → curry；tonkatsu_restaurant → tonkatsu；yakitori_restaurant → yakitori', () => {
    expect(kindOfCandidate(cand('咖哩店', 'japanese_curry_restaurant', ['japanese_curry_restaurant']))).toBe('curry')
    expect(kindOfCandidate(cand('炸豬排店', 'tonkatsu_restaurant', ['tonkatsu_restaurant']))).toBe('tonkatsu')
    expect(kindOfCandidate(cand('串燒店', 'yakitori_restaurant', ['yakitori_restaurant']))).toBe('yakitori')
  })
  it('noodle_shop → noodle；chinese_noodle_restaurant → ramen', () => {
    expect(kindOfCandidate(cand('麵店', 'noodle_shop', ['noodle_shop']))).toBe('noodle')
    expect(kindOfCandidate(cand('中華麵店', 'chinese_noodle_restaurant', ['chinese_noodle_restaurant']))).toBe('ramen')
  })
  it('types 陣列裡有對應類型也認（primaryType 不是時）', () => {
    expect(kindOfCandidate({ name: '某店', types: ['restaurant', 'yakiniku_restaurant'] })).toBe('yakiniku')
  })
  it('primaryType 優先於店名關鍵字', () => {
    expect(kindOfCandidate(cand('烏龍麵店', 'yakiniku_restaurant', ['yakiniku_restaurant']))).toBe('yakiniku')
  })
})

describe('normalizeKind／kindLabel', () => {
  it('舊版種類鍵 ramen_restaurant／sushi_restaurant 轉新鍵 ramen／sushi', () => {
    expect(normalizeKind('ramen_restaurant')).toBe('ramen')
    expect(normalizeKind('sushi_restaurant')).toBe('sushi')
  })
  it('新鍵原樣回傳', () => {
    expect(normalizeKind('yakiniku')).toBe('yakiniku')
    expect(normalizeKind('udon')).toBe('udon')
  })
  it('新種類有中文顯示名', () => {
    expect(kindLabel('yakiniku')).toBe('燒肉')
    expect(kindLabel('tonkatsu')).toBe('炸豬排')
    expect(kindLabel('yakitori')).toBe('串燒')
    expect(kindLabel('noodle')).toBe('麵食')
    expect(kindLabel('curry')).toBe('咖哩')
  })
})
