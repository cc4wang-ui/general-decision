import { describe, expect, it } from 'vitest'
import { CARDS, CARD_BY_ID, MAJOR_IDS, MINOR_IDS, MODULE_BARKS } from '../../src/cards.ts'

describe('cards（第 13.1 節）', () => {
  it('共 8 張', () => {
    expect(CARDS).toHaveLength(8)
  })

  it('id 唯一', () => {
    const ids = CARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Round 10 X2：去也查真地點（交通＋可接受 → 半徑，src/go.ts）。
  it('needsPlaces 只在 eat / go / rest 為 true', () => {
    const withPlaces = CARDS.filter((c) => c.needsPlaces).map((c) => c.id).sort()
    expect(withPlaces).toEqual(['eat', 'go', 'rest'])
  })

  // 2026-09-18 改：rest 原本只查 cafe type、半徑 500m，正式站 [places] 常常 raw=0；
  // 現在 rest 帶 intake「喝什麼」，走 Text Search 中文關鍵字，半徑與 eat 同為 800m（步行 10 分）。
  it('eat / rest 有 placesQuery，且半徑符合第 8 節（eat 800 / rest 800）；go 的半徑表在 src/go.ts', () => {
    expect(CARD_BY_ID.go.placesQuery).toBeUndefined()
    expect(CARD_BY_ID.eat.placesQuery?.includedTypes).toEqual(['restaurant'])
    expect(CARD_BY_ID.eat.placesQuery?.radiusByTransport?.default).toBe(800)
    expect(CARD_BY_ID.rest.placesQuery?.radiusByTransport?.default).toBe(800)
    expect(CARD_BY_ID.rest.placesQuery?.textQuery?.key).toBe('drink')
  })

  it('rest 的「喝什麼」分咖啡與三種喝酒，每個選項都有 Text Search 關鍵字', () => {
    const drink = CARD_BY_ID.rest.intake.find((f) => f.key === 'drink')!
    expect(drink.options).toEqual(['咖啡', '酒吧', '居酒屋', '熱炒燒烤'])
    for (const o of drink.options!) expect(CARD_BY_ID.rest.placesQuery?.textQuery?.byOption[o], o).toBeTruthy()
  })

  it('不需要 Places 的卡不得帶 placesQuery', () => {
    for (const c of CARDS.filter((c) => !c.needsPlaces)) {
      expect(c.placesQuery, c.id).toBeUndefined()
    }
  })

  it('每卡每個 chips 欄位的 default 都存在於 options 之中', () => {
    for (const c of CARDS) {
      for (const f of c.intake) {
        if (f.type === 'chips') {
          expect(f.options, `${c.id}.${f.key} 缺 options`).toBeDefined()
          expect(f.options, `${c.id}.${f.key} default 不在 options`).toContain(f.default)
        } else if (f.type === 'stars') {
          // stars：1–5 的整數（Round 3 的 bands 列沒有 options，值走 OrderRequest.budget，DEV-PLAN-3 §E.3）
          expect(typeof f.default).toBe('number')
          expect(f.default as number).toBeGreaterThanOrEqual(1)
          expect(f.default as number).toBeLessThanOrEqual(5)
        }
      }
    }
  })

  it('reissueLabel 只在 eat / rest / go / travel 有值（第 6 節）', () => {
    const withReissue = CARDS.filter((c) => c.reissueLabel).map((c) => c.id).sort()
    expect(withReissue).toEqual(['eat', 'go', 'rest', 'travel'])
  })

  it('stopVerdictAllowed 只在 attend / buy（第 6 節）', () => {
    const withStop = CARDS.filter((c) => c.stopVerdictAllowed).map((c) => c.id).sort()
    expect(withStop).toEqual(['attend', 'buy'])
  })

  it('每卡都有非空 promptHint', () => {
    for (const c of CARDS) expect(c.promptHint.length, c.id).toBeGreaterThan(10)
  })

  it('首頁排列：4 大磁貼 + 4 小鍵，剛好覆蓋 8 張卡', () => {
    expect(MAJOR_IDS).toHaveLength(4)
    expect(MINOR_IDS).toHaveLength(4)
    expect([...MAJOR_IDS, ...MINOR_IDS].sort()).toEqual(CARDS.map((c) => c.id).sort())
  })

  it('每卡三段火力的點名台詞都齊', () => {
    for (const c of CARDS) {
      const barks = MODULE_BARKS[c.id]
      expect(barks, c.id).toHaveLength(3)
      for (const b of barks) expect(b.length, c.id).toBeGreaterThan(0)
    }
  })
})

describe('吃：甜食／鹹食（2026-09-18 Cross 需求）', () => {
  it('eat 多一個「想吃」欄位，預設都可以', () => {
    const f = CARD_BY_ID.eat.intake.find((x) => x.key === 'taste')!
    expect(f.options).toEqual(['鹹食', '甜食', '都可以'])
    expect(f.default).toBe('都可以')
  })
})
