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
  it('麺屋武蔵 → ramen：麺屋在拉麵標記集中表裡（round 5 結構性修復，之前是 undefined）', () => {
    expect(kindOfCandidate(cand('麺屋武蔵'))).toBe('ramen')
  })
  it('つけ麺 さなだ → ramen：つけ麺是拉麵（round 5，之前是 undefined）', () => {
    expect(kindOfCandidate(cand('つけ麺 さなだ'))).toBe('ramen')
  })
  it('d47食堂（一般餐廳）→ undefined：認不出種類時 UI 只給單店排除，不顯示「不要這類」', () => {
    expect(kindOfCandidate(cand('d47食堂'))).toBeUndefined()
  })
})

describe('kindOfCandidate：拉麵標記集中表（紅隊 round 5 結構性修復）', () => {
  it('麺処ほん田 → ramen：麺処在集中表裡（之前是 undefined，弱訊號守衛只擋誤判、不給種類）', () => {
    expect(kindOfCandidate(cand('麺処ほん田'))).toBe('ramen')
  })
  it('麺や七彩 → ramen', () => {
    expect(kindOfCandidate(cand('麺や七彩'))).toBe('ramen')
  })
  it('担々麺専門店 → ramen', () => {
    expect(kindOfCandidate(cand('担々麺専門店'))).toBe('ramen')
  })
  it('中華麺店 → ramen', () => {
    expect(kindOfCandidate(cand('中華麺店'))).toBe('ramen')
  })
  it('冷麺専門店 → ramen：冷麺在集中表裡（round 5）', () => {
    expect(kindOfCandidate(cand('冷麺専門店'))).toBe('ramen')
  })
  it('麺処讃岐うどん → udon：前面已有明確關鍵字（讃岐）命中，明確關鍵字贏過拉麵標記', () => {
    expect(kindOfCandidate(cand('麺処讃岐うどん'))).toBe('udon')
  })
  it('麺喜やしま還是 udon：不含拉麵標記，弱訊號照樣認得出', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBe('udon')
  })
  it('丸亀製麺還是 udon：製麺不在拉麵標記表裡，弱訊號判烏龍麵', () => {
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
  })
})

describe('kindOfCandidate：漏掉的關鍵字（紅隊 round 2 Finding 2）', () => {
  it('スシロー（壽司連鎖）→ sushi：片假名スシ要認得到', () => {
    expect(kindOfCandidate(cand('スシロー'))).toBe('sushi')
  })
  it('とんかつ和幸（炸豬排連鎖）→ tonkatsu', () => {
    expect(kindOfCandidate(cand('とんかつ和幸'))).toBe('tonkatsu')
  })
  it('トンカツ店（片假名）→ tonkatsu', () => {
    expect(kindOfCandidate(cand('トンカツ専門店'))).toBe('tonkatsu')
  })
})

describe('kindOfCandidate：中華そば是拉麵（紅隊 round 3 Finding B）', () => {
  it('中華そば 青葉（拉麵店）→ ramen：名字裡的「そば」不能算蕎麥麵', () => {
    expect(kindOfCandidate(cand('中華そば 青葉'))).toBe('ramen')
  })
  it('中華蕎麦（異體字）→ ramen', () => {
    expect(kindOfCandidate(cand('中華蕎麦 喜多方'))).toBe('ramen')
  })
  it('守衛沒有誤傷既有案例：麺喜やしま還是 udon、藪蕎麦還是 soba、麺処ほん田現在是 ramen（集中表）', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBe('udon')
    expect(kindOfCandidate(cand('藪蕎麦'))).toBe('soba')
    expect(kindOfCandidate(cand('麺処ほん田'))).toBe('ramen')
  })
})

describe('kindOfCandidate：らぁ麺／そば系拉麵誤判（紅隊 round 4 Finding 1）', () => {
  it('らぁ麺 飯田商店 → ramen：らぁ麺是拉麵極常見的寫法', () => {
    expect(kindOfCandidate(cand('らぁ麺 飯田商店'))).toBe('ramen')
  })
  it('らぁ麺 はやし田 → ramen', () => {
    expect(kindOfCandidate(cand('らぁ麺 はやし田'))).toBe('ramen')
  })
  it('支那そばや 本店 → ramen：支那そば是拉麵的舊稱，名字裡的「そば」不能算蕎麥麵', () => {
    expect(kindOfCandidate(cand('支那そばや 本店'))).toBe('ramen')
  })
  it('油そば 東京油組総本店 → ramen：油そば是無湯拉麵', () => {
    expect(kindOfCandidate(cand('油そば 東京油組総本店'))).toBe('ramen')
  })
  it('台湾まぜそば はなび → ramen：まぜそば是拉麵', () => {
    expect(kindOfCandidate(cand('台湾まぜそば はなび'))).toBe('ramen')
  })
  it('麺匠 竹虎 六本木店 → ramen：麺匠在集中表裡', () => {
    expect(kindOfCandidate(cand('麺匠 竹虎 六本木店'))).toBe('ramen')
  })
  it('麺場 田所商店 → ramen：麺場在集中表裡', () => {
    expect(kindOfCandidate(cand('麺場 田所商店'))).toBe('ramen')
  })
})

describe('kindOfCandidate：串燒關鍵字（紅隊 round 4 Finding 2）', () => {
  it('やきとり大吉 → yakitori：串燒連鎖，之前完全沒有串燒關鍵字', () => {
    expect(kindOfCandidate(cand('やきとり大吉'))).toBe('yakitori')
  })
  it('焼鳥 大吉 → yakitori', () => {
    expect(kindOfCandidate(cand('焼鳥 大吉'))).toBe('yakitori')
  })
  it('ヤキトリ 大吉 → yakitori：片假名也要認得到', () => {
    expect(kindOfCandidate(cand('ヤキトリ 大吉'))).toBe('yakitori')
  })
  it('炭火串焼 さくら → yakitori', () => {
    expect(kindOfCandidate(cand('炭火串焼 さくら'))).toBe('yakitori')
  })
})

describe('kindOfCandidate：繁體蕎麥（紅隊 round 4 Finding 3）', () => {
  it('手打ち蕎麥 さくら → soba：繁體「蕎麥」單獨也要命中', () => {
    expect(kindOfCandidate(cand('手打ち蕎麥 さくら'))).toBe('soba')
  })
  it('蕎麥庵 → soba', () => {
    expect(kindOfCandidate(cand('蕎麥庵'))).toBe('soba')
  })
})

describe('kindOfCandidate：已知限制——名字完全無訊號的店', () => {
  it('鳥貴族（串燒連鎖）→ undefined：名字無關鍵字，店名啟發式無解，以類型為準', () => {
    expect(kindOfCandidate(cand('鳥貴族'))).toBeUndefined()
  })
  it('川上庵（蕎麥麵）→ undefined：名字無 そば／蕎麦，店名啟發式無解', () => {
    expect(kindOfCandidate(cand('川上庵'))).toBeUndefined()
  })
  it('一蘭（拉麵連鎖）→ undefined：名字無關鍵字，店名啟發式無解', () => {
    expect(kindOfCandidate(cand('一蘭'))).toBeUndefined()
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
