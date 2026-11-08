// 種類判斷（紅隊 §3.1 的永久測試）：用真實店名當 mock，不用「烏龍麵專門店」這種直接含關鍵字的名字。
// Round 14（2026-11-09；用戶決定：只留類型＋品牌，刪掉店名判斷）：店名裡的任何字詞都不再
// 決定種類。所有靠店名判的斷言改成 undefined；類型與品牌照舊。新增 round 14 describe 證明
// 店名路徑已死（F1／F2／F3 反例店名＋泛用類型 fallback＋品牌表 7 筆）。
import { describe, expect, it } from 'vitest'
import { kindLabel, kindOfCandidate, normalizeKind } from '../../src/placeKind.ts'

const cand = (name: string, primaryType = 'restaurant', types: string[] = ['restaurant']) => ({ name, primaryType, types })

describe('kindOfCandidate：真實店名', () => {
  it('麺喜やしま（烏龍麵店，類型只有 restaurant）→ undefined：round 7 刪掉弱「麺」訊號後是漏判——名字只有一個「麺」字，沒有讃岐／うどん可認；擋它只能靠單店「不喜歡這間店」', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
  })
  it('全名「讃岐うどん 麺喜やしま」→ undefined：round 14 刪掉整條店名路徑——「讃岐」「うどん」不再判種類（F1：讃岐是地名）；擋它只能靠單店排除', () => {
    expect(kindOfCandidate(cand('讃岐うどん 麺喜やしま'))).toBeUndefined()
  })
  it('叙々苑（yakiniku_restaurant）→ yakiniku', () => {
    expect(kindOfCandidate(cand('叙々苑', 'yakiniku_restaurant', ['yakiniku_restaurant', 'restaurant']))).toBe('yakiniku')
  })
  it('藪蕎麦（蕎麥麵，類型只有 restaurant）→ undefined：round 13 架構重構——店名裡的「蕎麦」不再判種類（蕎麥麵沒有 dish 級類型、店名分不出來），漏判；擋它只能靠單店「不喜歡這間店」', () => {
    expect(kindOfCandidate(cand('藪蕎麦'))).toBeUndefined()
  })
  it('丸亀製麺 → udon：round 11 品牌別名表（用戶有條件接受漏判率的條件之一）——名字只有一個「麺」字、類型只有 restaurant，但品牌名本身就是種類事實', () => {
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
    expect(kindOfCandidate(cand('丸亀製麺 渋谷井の頭通り店'))).toBe('udon')
  })
  it('麺屋武蔵 → ramen：round 7 刪掉前綴表後，靠真實的 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('麺屋武蔵', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('つけ麺 さなだ → undefined：round 14 刪掉整條店名路徑——「つけ麺」不再判拉麵；類型是泛用時漏判', () => {
    expect(kindOfCandidate(cand('つけ麺 さなだ'))).toBeUndefined()
  })
  it('d47食堂（一般餐廳）→ undefined：認不出種類時 UI 只給單店排除，不顯示「不要這類」', () => {
    expect(kindOfCandidate(cand('d47食堂'))).toBeUndefined()
  })
})

describe('kindOfCandidate：round 14——店名不再判種類（原拉麵標記集中表）', () => {
  it('麺処ほん田 → ramen：round 7 刪掉前綴表後，靠真實的 primaryType ramen_restaurant 認（類型優先）；只有名字時是 undefined（見下方漏判測試）', () => {
    expect(kindOfCandidate(cand('麺処ほん田', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('麺処ほん田（只有名字、類型只有 restaurant）→ undefined：麺処分不出拉麵／烏龍麵（麺処 NAKAJIMA 是烏龍麵店），不猜', () => {
    expect(kindOfCandidate(cand('麺処ほん田'))).toBeUndefined()
  })
  it('麺や七彩 → ramen：靠 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('麺や七彩', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('担々麺専門店 → undefined：round 14 刪掉整條店名路徑——「担々麺」不再判拉麵', () => {
    expect(kindOfCandidate(cand('担々麺専門店'))).toBeUndefined()
  })
  it('中華麺店 → undefined：同上，「中華麺」不再判拉麵', () => {
    expect(kindOfCandidate(cand('中華麺店'))).toBeUndefined()
  })
  it('冷麺専門店 → undefined：round 14——F3（冷麺是兩種菜：拉麵的夏季冷拉麵與盛岡／平壌冷麵），店名不判', () => {
    expect(kindOfCandidate(cand('冷麺専門店'))).toBeUndefined()
  })
  it('麺処讃岐うどん → undefined：round 14——F1（讃岐是地名），「讃岐」不再判烏龍麵', () => {
    expect(kindOfCandidate(cand('麺処讃岐うどん'))).toBeUndefined()
  })
  it('麺喜やしま還是漏判：round 7 刪掉弱訊號後回 undefined（不是 udon）', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
  })
  it('丸亀製麺不再是漏判：round 11 品牌別名表認得出它是烏龍麵（不是靠弱「麺」訊號加回來——麺喜やしま還是漏判，見下方）', () => {
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
  })
})

describe('kindOfCandidate：round 14——原漏掉的關鍵字全部不再判（紅隊 round 2 Finding 2）', () => {
  it('スシロー（壽司連鎖）→ undefined：round 14 刪掉整條店名路徑——片假名スシ不再判壽司；類型是泛用時漏判', () => {
    expect(kindOfCandidate(cand('スシロー'))).toBeUndefined()
  })
  it('とんかつ和幸（炸豬排連鎖）→ undefined：同上，「とんかつ」不再判炸豬排', () => {
    expect(kindOfCandidate(cand('とんかつ和幸'))).toBeUndefined()
  })
  it('トンカツ専門店（片假名）→ undefined：同上', () => {
    expect(kindOfCandidate(cand('トンカツ専門店'))).toBeUndefined()
  })
})

describe('kindOfCandidate：round 14——中華そば不再是拉麵（紅隊 round 3 Finding B）', () => {
  it('中華そば 青葉（拉麵店）→ undefined：round 14 刪掉整條店名路徑——「中華そば」不再判拉麵；類型是泛用時漏判，擋它只能靠單店排除', () => {
    expect(kindOfCandidate(cand('中華そば 青葉'))).toBeUndefined()
  })
  it('中華蕎麦（異體字）→ undefined：同上', () => {
    expect(kindOfCandidate(cand('中華蕎麦 喜多方'))).toBeUndefined()
  })
  it('守衛：麺喜やしま是漏判（round 7）、藪蕎麦 round 13 起也是漏判（蕎麦字不再判）、麺処ほん田靠類型是 ramen', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
    expect(kindOfCandidate(cand('藪蕎麦'))).toBeUndefined()
    expect(kindOfCandidate(cand('麺処ほん田', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
})

describe('kindOfCandidate：round 14——原らぁ麺／そば系拉麵標記全部不再判（紅隊 round 4 Finding 1）', () => {
  it('らぁ麺 飯田商店 → undefined：round 14 刪掉整條店名路徑——「らぁ麺」不再判拉麵', () => {
    expect(kindOfCandidate(cand('らぁ麺 飯田商店'))).toBeUndefined()
  })
  it('らぁ麺 はやし田 → undefined：同上', () => {
    expect(kindOfCandidate(cand('らぁ麺 はやし田'))).toBeUndefined()
  })
  it('支那そばや 本店 → undefined：同上，「支那そば」不再判拉麵', () => {
    expect(kindOfCandidate(cand('支那そばや 本店'))).toBeUndefined()
  })
  it('油そば 東京油組総本店 → undefined：同上，「油そば」不再判拉麵', () => {
    expect(kindOfCandidate(cand('油そば 東京油組総本店'))).toBeUndefined()
  })
  it('台湾まぜそば はなび → undefined：同上，「まぜそば」不再判拉麵', () => {
    expect(kindOfCandidate(cand('台湾まぜそば はなび'))).toBeUndefined()
  })
  it('麺匠 竹虎 六本木店 → ramen：靠 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('麺匠 竹虎 六本木店', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('麺場 田所商店 → ramen：靠 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('麺場 田所商店', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
})

describe('kindOfCandidate：round 14——原串燒關鍵字全部不再判（紅隊 round 4 Finding 2）', () => {
  it('やきとり大吉 → undefined：round 14 刪掉整條店名路徑——「やきとり」不再判串燒', () => {
    expect(kindOfCandidate(cand('やきとり大吉'))).toBeUndefined()
  })
  it('焼鳥 大吉 → undefined：同上', () => {
    expect(kindOfCandidate(cand('焼鳥 大吉'))).toBeUndefined()
  })
  it('ヤキトリ 大吉 → undefined：同上，片假名也不判', () => {
    expect(kindOfCandidate(cand('ヤキトリ 大吉'))).toBeUndefined()
  })
  it('炭火串焼 さくら → undefined：同上', () => {
    expect(kindOfCandidate(cand('炭火串焼 さくら'))).toBeUndefined()
  })
})

describe('kindOfCandidate：繁體蕎麥（紅隊 round 4 Finding 3；round 13：蕎麥字不再判種類，全部漏判；round 14 不變）', () => {
  it('手打ち蕎麥 さくら → undefined：round 13 刪掉 SOBA 正則——繁體「蕎麥」也不判，漏判', () => {
    expect(kindOfCandidate(cand('手打ち蕎麥 さくら'))).toBeUndefined()
  })
  it('蕎麥庵 → undefined：同上', () => {
    expect(kindOfCandidate(cand('蕎麥庵'))).toBeUndefined()
  })
})

describe('kindOfCandidate：已知限制——名字完全無訊號的店（round 11：連鎖品牌由品牌別名表認；round 14 品牌表剩 7 筆）', () => {
  it('鳥貴族（串燒連鎖）→ izakaya：round 11 品牌別名表——名字無關鍵字，但品牌名本身就是種類事實', () => {
    expect(kindOfCandidate(cand('鳥貴族'))).toBe('izakaya')
    expect(kindOfCandidate(cand('鳥貴族 渋谷道玄坂店'))).toBe('izakaya')
  })
  it('川上庵（蕎麥麵）→ soba：round 11 品牌別名表——名字無 そば／蕎麦，但品牌名本身就是種類事實', () => {
    expect(kindOfCandidate(cand('川上庵'))).toBe('soba')
  })
  it('一蘭（拉麵連鎖）→ ramen：round 11 品牌別名表——名字無關鍵字，但品牌名本身就是種類事實', () => {
    expect(kindOfCandidate(cand('一蘭'))).toBe('ramen')
    expect(kindOfCandidate(cand('一蘭 渋谷スペイン坂店'))).toBe('ramen')
  })
  it('品牌表之外的無訊號店還是漏判：麺喜やしま（烏龍麵，名字只有一個「麺」字）與鳥竹総本店（串燒，單店名不是連鎖品牌）', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
    expect(kindOfCandidate(cand('鳥竹総本店'))).toBeUndefined()
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
  it('primaryType 優先於品牌與店名：烏龍麵店名配 yakiniku_restaurant 時是燒肉（類型贏；round 14 店名本來也不判）', () => {
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

describe('kindOfCandidate：round 14——原兩層拉麵表全部不再判（紅隊 round 5 F1／F3／F4／F6）', () => {
  it('F1：らあめん花月嵐 → undefined：round 14 刪掉整條店名路徑——「らあめん」不再判拉麵', () => {
    expect(kindOfCandidate(cand('らあめん花月嵐'))).toBeUndefined()
  })
  it('F3（round 13 更正）：つけそば 弐天 → undefined——「つけそば」是歧義標記（沾麵拉麵與沾蕎麥麵共用寫法），round 13 從 RAMEN_EXPLICIT 拿掉，不猜', () => {
    expect(kindOfCandidate(cand('つけそば 弐天'))).toBeUndefined()
  })
  it('F3（round 13 更正）：特級鶏蕎麦 龍介 → undefined——「鶏蕎麦」是歧義標記（雞湯拉麵與雞蕎麥麵共用寫法），round 13 從 RAMEN_EXPLICIT 拿掉，不猜', () => {
    expect(kindOfCandidate(cand('特級鶏蕎麦 龍介'))).toBeUndefined()
  })
  it('F4：手打麺 永吉 → ramen：round 7 刪掉前綴表後，靠 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('手打麺 永吉', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('F4：手打麺 永吉（只有名字）→ undefined：前綴表刪掉後，名字認不出來，不猜', () => {
    expect(kindOfCandidate(cand('手打麺 永吉'))).toBeUndefined()
  })
  it('F4：らー麺 大芽 → undefined：round 14 刪掉整條店名路徑——「らー麺」不再判拉麵（正規化層也隨店名路徑刪掉）', () => {
    expect(kindOfCandidate(cand('らー麺 大芽'))).toBeUndefined()
  })
  it('F4：麺食堂88 → ramen：round 7 刪掉前綴表後，靠 primaryType ramen_restaurant 認（類型優先）', () => {
    expect(kindOfCandidate(cand('麺食堂88', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('F4：麺食堂88（只有名字）→ undefined：前綴表刪掉後，名字認不出來，不猜', () => {
    expect(kindOfCandidate(cand('麺食堂88'))).toBeUndefined()
  })
  it('F4：ら～麺あけどや → undefined：round 14——「ら～麺」不再判拉麵', () => {
    expect(kindOfCandidate(cand('ら～麺あけどや'))).toBeUndefined()
  })
  it('F4：ら-麺あけどや → undefined：同上，半形連字號也不判', () => {
    expect(kindOfCandidate(cand('ら-麺あけどや'))).toBeUndefined()
  })
  it('F6（round 13 更正）：麺処、そば志ん、 → undefined——店名裡的「そば」不再判蕎麥麵（round 13 刪掉 SOBA 正則），漏判', () => {
    expect(kindOfCandidate(cand('麺処、そば志ん、'))).toBeUndefined()
  })
  it('F6 守衛（round 14 更正）：麺処讃岐うどん → undefined——F1（讃岐是地名），「讃岐」不再判烏龍麵', () => {
    expect(kindOfCandidate(cand('麺処讃岐うどん'))).toBeUndefined()
  })
  it('守衛（round 14 更正）：麺喜やしま是漏判、藪蕎麦 round 13 起也是漏判、中華そば 青葉 round 14 起是漏判（店名不判）、丸亀製麺 → udon（round 11 品牌別名表）、麺処ほん田靠類型是 ramen', () => {
    expect(kindOfCandidate(cand('麺喜やしま'))).toBeUndefined()
    expect(kindOfCandidate(cand('藪蕎麦'))).toBeUndefined()
    expect(kindOfCandidate(cand('中華そば 青葉'))).toBeUndefined()
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
    expect(kindOfCandidate(cand('麺処ほん田', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('守衛（round 14 更正）：つけ麺 さなだ、らぁ麺 飯田商店、支那そばや、油そば 東京油組総本店、台湾まぜそば はなび → undefined（店名不再判拉麵）', () => {
    for (const name of ['つけ麺 さなだ', 'らぁ麺 飯田商店', '支那そばや', '油そば 東京油組総本店', '台湾まぜそば はなび']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('守衛：麺屋武蔵、麺匠 竹虎、麺場 田所商店 → ramen（靠 primaryType ramen_restaurant 認）', () => {
    for (const name of ['麺屋武蔵', '麺匠 竹虎', '麺場 田所商店']) {
      expect(kindOfCandidate(cand(name, 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
    }
  })
})

describe('kindOfCandidate：round 14——原串燒／壽司／咖啡關鍵字全部不再判（紅隊 round 5 F2／F5）', () => {
  it('F2：やき鳥 宮川 → undefined：round 14 刪掉整條店名路徑——「やき鳥」不再判串燒', () => {
    expect(kindOfCandidate(cand('やき鳥 宮川'))).toBeUndefined()
  })
  it('F2：炭火焼き鳥 池袋 和み屋 → undefined：同上', () => {
    expect(kindOfCandidate(cand('炭火焼き鳥 池袋 和み屋'))).toBeUndefined()
  })
  it('F5：鮨 さいとう → undefined：同上，「鮨」不再判壽司', () => {
    expect(kindOfCandidate(cand('鮨 さいとう'))).toBeUndefined()
  })
  it('F5：喫茶室ルノアール → undefined：同上，「喫茶」不再判咖啡', () => {
    expect(kindOfCandidate(cand('喫茶室ルノアール'))).toBeUndefined()
  })
})

describe('kindOfCandidate：round 7 結構性修復（紅隊 round 6 N1／N2／N3／N4；round 14：店名標記全部不再判）', () => {
  it('N1：麺処 NAKAJIMA、自家製麺処 御用不是拉麵（真實烏龍麵店，名字是麺処）', () => {
    expect(kindOfCandidate(cand('麺処 NAKAJIMA'))).not.toBe('ramen')
    expect(kindOfCandidate(cand('自家製麺処 御用'))).not.toBe('ramen')
  })
  it('N2（round 13 更正）：8 間平假名／拉丁「そば」拉麵店 round 13 起都是漏判（undefined）——RAMEN_SOBA 整張表刪掉，「そば」前綴不再猜拉麵', () => {
    for (const name of ['煮干そば 流。', 'とりそばトシゾー', '鯛塩そば 灯花', '鶏Soba Toraや', '鶏そば 縁道', 'はまぐり鶏そば', '濃厚鶏そば', '鶏白湯そば']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('N3：三田製麺所、自家製麺 伊藤、刀削麺園、唐朝刀削麺不是烏龍麵（真實拉麵／刀削麵店）', () => {
    for (const name of ['三田製麺所', '自家製麺 伊藤', '刀削麺園', '唐朝刀削麺']) {
      expect(kindOfCandidate(cand(name)), name).not.toBe('udon')
    }
  })
  it('N3：刀削麺園靠 primaryType chinese_restaurant 認成中餐（不是烏龍麵）', () => {
    expect(kindOfCandidate(cand('刀削麺園', 'chinese_restaurant', ['chinese_restaurant', 'restaurant']))).toBe('chinese')
    expect(kindLabel('chinese')).toBe('中餐')
  })
  it('N3（round 14 更正）：四川担担麺 阿吽、担担麺の掟を破る者 → undefined——「担担麺」不再判拉麵', () => {
    expect(kindOfCandidate(cand('四川担担麺 阿吽'))).toBeUndefined()
    expect(kindOfCandidate(cand('担担麺の掟を破る者'))).toBeUndefined()
  })
  it('N5（round 14 更正）：六坊担担面 → undefined——「担担面」不再判拉麵', () => {
    expect(kindOfCandidate(cand('六坊担担面'))).toBeUndefined()
  })
  it('N4（round 14 更正）：ブルーボトルコーヒー、スターバックスコーヒー名字不再判咖啡（undefined）；配 cafe 類型時照樣是咖啡', () => {
    expect(kindOfCandidate(cand('ブルーボトルコーヒー'))).toBeUndefined()
    expect(kindOfCandidate(cand('スターバックスコーヒー'))).toBeUndefined()
    expect(kindOfCandidate(cand('ブルーボトルコーヒー', 'cafe', ['cafe']))).toBe('cafe')
    expect(kindOfCandidate(cand('スターバックスコーヒー', 'cafe', ['cafe']))).toBe('cafe')
  })
  it('類型優先：chinese_restaurant → chinese、cafe → cafe、coffee_shop → cafe、bakery → bakery', () => {
    expect(kindOfCandidate(cand('某店', 'chinese_restaurant', ['chinese_restaurant']))).toBe('chinese')
    expect(kindOfCandidate(cand('某店', 'cafe', ['cafe']))).toBe('cafe')
    expect(kindOfCandidate(cand('某店', 'coffee_shop', ['coffee_shop']))).toBe('cafe')
    expect(kindOfCandidate(cand('某店', 'bakery', ['bakery']))).toBe('bakery')
    expect(normalizeKind('chinese_restaurant')).toBe('chinese')
  })
  it('控制組（round 14 更正）：藪蕎麦 → undefined、麺処讃岐うどん → undefined（F1：讃岐是地名）、中華そば 青葉 → undefined（店名不判）、丸亀製麺 → udon（round 11 品牌別名表）、麺処、そば志ん、 → undefined', () => {
    expect(kindOfCandidate(cand('藪蕎麦'))).toBeUndefined()
    expect(kindOfCandidate(cand('麺処讃岐うどん'))).toBeUndefined()
    expect(kindOfCandidate(cand('中華そば 青葉'))).toBeUndefined()
    expect(kindOfCandidate(cand('丸亀製麺'))).toBe('udon')
    expect(kindOfCandidate(cand('麺処、そば志ん、'))).toBeUndefined()
  })
})

describe('round 8：noodle_shop 不短路／RAMEN_SOBA 補齊／寿し／ブーランジェリー／TYPE_KINDS 補齊（round 14：店名標記全部不再判，泛用 fallback 不變）', () => {
  it('A（round 14 更正）：noodle_shop 不遮品牌訊號——藪蕎麦配 noodle_shop 回泛用 noodle；麺処讃岐うどん、中華そば 青葉 round 14 起店名不判，配 noodle_shop 時也回泛用 noodle（不是 udon／ramen）', () => {
    expect(kindOfCandidate(cand('藪蕎麦', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('noodle')
    expect(kindOfCandidate(cand('麺処讃岐うどん', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('noodle')
    expect(kindOfCandidate(cand('中華そば 青葉', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('noodle')
    // types 陣列裡有 noodle_shop 也一樣（primaryType 是 restaurant 時）
    expect(kindOfCandidate(cand('藪蕎麦', 'restaurant', ['restaurant', 'noodle_shop']))).toBe('noodle')
    expect(kindOfCandidate(cand('麺処讃岐うどん', 'restaurant', ['restaurant', 'noodle_shop']))).toBe('noodle')
  })
  it('A：店名真的沒訊號時 noodle_shop 才回 noodle（麵店）；chinese_noodle_restaurant 還是 dish 級短路 → ramen', () => {
    expect(kindOfCandidate(cand('麵店', 'noodle_shop', ['noodle_shop']))).toBe('noodle')
    expect(kindOfCandidate(cand('中華麵店', 'chinese_noodle_restaurant', ['chinese_noodle_restaurant']))).toBe('ramen')
    expect(kindOfCandidate(cand('某店', 'chinese_noodle_restaurant', ['chinese_noodle_restaurant']))).toBe('ramen')
  })
  it('B（round 13 更正）：RAMEN_SOBA 補的 5 間 round 13 起都是漏判（undefined）——整張表刪掉，不再猜拉麵（紅隊 round 7 B 的店名）', () => {
    for (const name of ['煮干しそば', '銀座鴨そば 九代目けいすけ', '塩そば専門店 桑ばら', '塩そば 一榮', 'SOBA HOUSE 金色不如帰']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('B 控制組（round 13 更正）：鴨蕎麦尖 → undefined——漢字「蕎麦」也不再判蕎麥麵，漏判', () => {
    expect(kindOfCandidate(cand('鴨蕎麦尖'))).toBeUndefined()
  })
  it('B（round 14 更正）：純手打ち麺と未来不再是烏龍麵（round 8 從 UDON_STRONG 拿掉「手打ち麺」）——現在是漏判（undefined），不是烏龍麵也不是拉麵；手打ちうどん さくら round 14 起也是漏判（「うどん」不再判）；擋它們只能靠單店排除', () => {
    expect(kindOfCandidate(cand('純手打ち麺と未来'))).toBeUndefined()
    expect(kindOfCandidate(cand('純手打ち麺と未来'))).not.toBe('udon')
    expect(kindOfCandidate(cand('手打ちうどん さくら'))).toBeUndefined()
  })
  it('C（round 14 更正）：寿し不再是壽司——寿し常、寿し 小むらさき、寿しの いく味（紅隊 round 7 C）全部漏判', () => {
    for (const name of ['寿し常', '寿し 小むらさき', '寿しの いく味']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('C（round 14 更正）：ブーランジェリー／BOULANGERIE 不再是麵包——ブーランジェリー ラ・テール、BOULANGERIE LANDEMAINE（紅隊 round 7 C）全部漏判', () => {
    expect(kindOfCandidate(cand('ブーランジェリー ラ・テール'))).toBeUndefined()
    expect(kindOfCandidate(cand('BOULANGERIE LANDEMAINE'))).toBeUndefined()
  })
  it('TYPE_KINDS 補齊（round 8 對照 Google 官方 Table A Food and Drink 全表）：dish 級類型認得到', () => {
    expect(kindOfCandidate(cand('PIZZA SLICE', 'pizza_restaurant', ['pizza_restaurant']))).toBe('pizza')
    expect(kindOfCandidate(cand('モスバーガー', 'hamburger_restaurant', ['hamburger_restaurant']))).toBe('hamburger')
    expect(kindOfCandidate(cand('添好運', 'dim_sum_restaurant', ['dim_sum_restaurant']))).toBe('dim_sum')
    expect(kindOfCandidate(cand('某店', 'steak_house', ['steak_house']))).toBe('steak')
    expect(kindOfCandidate(cand('某店', 'sandwich_shop', ['sandwich_shop']))).toBe('sandwich')
    expect(kindOfCandidate(cand('某店', 'ice_cream_shop', ['ice_cream_shop']))).toBe('ice_cream')
    expect(kindOfCandidate(cand('某店', 'seafood_restaurant', ['seafood_restaurant']))).toBe('seafood')
    expect(kindOfCandidate(cand('某店', 'hot_pot_restaurant', ['hot_pot_restaurant']))).toBe('hot_pot')
    expect(kindOfCandidate(cand('某店', 'dumpling_restaurant', ['dumpling_restaurant']))).toBe('dumpling')
    expect(kindOfCandidate(cand('某店', 'vegan_restaurant', ['vegan_restaurant']))).toBe('vegan')
    expect(kindOfCandidate(cand('某店', 'vegetarian_restaurant', ['vegetarian_restaurant']))).toBe('vegetarian')
    expect(kindLabel('pizza')).toBe('披薩')
    expect(kindLabel('hamburger')).toBe('漢堡')
    expect(kindLabel('dim_sum')).toBe('點心')
    expect(normalizeKind('pizza_restaurant')).toBe('pizza')
  })
  it('TYPE_KINDS 守衛：泛料理類型（japanese／italian／korean／thai 等）刻意不收——類型 alone 不認種類，店名沒訊號就漏判', () => {
    for (const t of ['japanese_restaurant', 'italian_restaurant', 'korean_restaurant', 'thai_restaurant', 'french_restaurant', 'american_restaurant', 'fast_food_restaurant', 'buffet_restaurant']) {
      expect(kindOfCandidate(cand('某店', t, [t])), t).toBeUndefined()
    }
  })
})

describe('round 9 F2：TYPE_KINDS 補最後 4 個官方 Table A 類型（coffee_roastery／cat_cafe／dog_cafe／japanese_izakaya_restaurant）', () => {
  it('coffee_roastery／cat_cafe／dog_cafe → cafe：名字沒訊號時靠類型認；真實店名也認', () => {
    expect(kindOfCandidate(cand('某店', 'coffee_roastery', ['coffee_roastery']))).toBe('cafe')
    expect(kindOfCandidate(cand('ONIBUS COFFEE', 'coffee_roastery', ['coffee_roastery']))).toBe('cafe')
    expect(kindOfCandidate(cand('某店', 'cat_cafe', ['cat_cafe']))).toBe('cafe')
    expect(kindOfCandidate(cand('猫カフェ MOCHA 渋谷', 'cat_cafe', ['cat_cafe']))).toBe('cafe')
    expect(kindOfCandidate(cand('某店', 'dog_cafe', ['dog_cafe']))).toBe('cafe')
    // types 陣列裡有也認（primaryType 不是時）
    expect(kindOfCandidate({ name: '某店', types: ['restaurant', 'cat_cafe'] })).toBe('cafe')
  })
  it('japanese_izakaya_restaurant → izakaya：鳥貴族／磯丸水産靠真實 primaryType 認（名字本身無訊號，round 8 還是 undefined）', () => {
    expect(kindOfCandidate(cand('某店', 'japanese_izakaya_restaurant', ['japanese_izakaya_restaurant']))).toBe('izakaya')
    expect(kindOfCandidate(cand('鳥貴族', 'japanese_izakaya_restaurant', ['japanese_izakaya_restaurant']))).toBe('izakaya')
    expect(kindOfCandidate(cand('磯丸水産', 'japanese_izakaya_restaurant', ['japanese_izakaya_restaurant']))).toBe('izakaya')
    expect(kindLabel('izakaya')).toBe('居酒屋')
    expect(normalizeKind('japanese_izakaya_restaurant')).toBe('izakaya')
  })
  it('TYPE_KINDS 守衛：服務形式 cafeteria／diner／bistro／pizza_delivery 刻意不收（形式不是菜，與 fast_food／buffet／meal_delivery 同一政策）', () => {
    for (const t of ['cafeteria', 'diner', 'bistro', 'pizza_delivery']) {
      expect(kindOfCandidate(cand('某店', t, [t])), t).toBeUndefined()
    }
    // pizza_delivery 確實在官方 Table A 裡（2026-11-08 實查官方頁），不收是設計決定，不是表裡沒有
    expect(kindOfCandidate(cand('ピザ宅配', 'pizza_delivery', ['pizza_delivery']))).toBeUndefined()
  })
})

describe('round 10：紅隊 round 9 B1～B4（round 14：店名標記全部不再判）', () => {
  it('B1（round 13 更正）：えびそば／鯛そば／海老そば round 13 起都是漏判（undefined）——RAMEN_SOBA 刪掉，「そば」前綴不再猜拉麵（紅隊 round 9 B1 的店名，皆真實拉麵店）', () => {
    for (const name of ['えびそば一幻', 'えびそば緋彩', '鯛そば・茶漬 磯LABO']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
    expect(kindOfCandidate(cand('海老そば 一幻'))).toBeUndefined()
  })
  it('B1 控制組（round 13 更正）：えびすそば、よもだそば、手打蕎麦ふじや → undefined——「そば／蕎麦」不再判蕎麥麵，全部漏判', () => {
    expect(kindOfCandidate(cand('えびすそば'))).toBeUndefined()
    expect(kindOfCandidate(cand('よもだそば'))).toBeUndefined()
    expect(kindOfCandidate(cand('手打蕎麦ふじや'))).toBeUndefined()
  })
  it('B2（round 13 更正，紅隊 round 10 R10-F1 的終點）：字體消歧義是錯的——漢字つけ蕎麦兩邊都有真店，歧義標記不判；平假名つけそば round 13 也不再判拉麵（「沒找到反例」不是證明，つけそば從 RAMEN_EXPLICIT 拿掉）', () => {
    // 平假名つけそば round 13 起也是漏判（つけそば 弐天、つけそば神田勝本、つけそば 周，皆真實拉麵店——名字本身不再判）
    for (const name of ['つけそば 弐天', 'つけそば神田勝本', 'つけそば 周']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
    // 歧義：漢字つけ蕎麦（つけ蕎麦尚念是真拉麵店，つけ蕎麦 安土／周庵／和だす是真蕎麥麵店）——名字本身不判
    for (const name of ['つけ蕎麦尚念', 'つけ蕎麦 安土', 'つけ蕎麦 周庵', 'つけ蕎麦 和だす']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
    // 類型決定：尚念配 ramen_restaurant 是拉麵；安土配泛用 restaurant 時是漏判（不是誤判），單店排除擋得住
    expect(kindOfCandidate(cand('つけ蕎麦尚念', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
    // 全名另有明確拉麵標記時也不判了：round 14 刪掉整條店名路徑，つけ蕎麦 中華蕎麦 尚念（正式全名）也是漏判
    expect(kindOfCandidate(cand('つけ蕎麦 中華蕎麦 尚念'))).toBeUndefined()
    // つけ麺（沾麵）round 14 起也不判拉麵
    expect(kindOfCandidate(cand('つけ麺 さなだ'))).toBeUndefined()
  })
  it('B3（round 14 更正）：片假名正規化層隨店名路徑刪掉——煮干中華ソバ イチカワ（真實拉麵店）round 14 起是漏判（「中華ソバ」不再判）；テストウドン／テストサヌキ也是漏判；塩ソバ round 13 起是漏判（RAMEN_SOBA 刪掉）', () => {
    expect(kindOfCandidate(cand('煮干中華ソバ イチカワ'))).toBeUndefined()
    expect(kindOfCandidate(cand('テストウドン'))).toBeUndefined()
    expect(kindOfCandidate(cand('テストサヌキ'))).toBeUndefined()
    expect(kindOfCandidate(cand('塩ソバ テスト'))).toBeUndefined()
  })
  it('B4（round 14 更正）：串鳥、やきにくガッッツ、京やきにく れんぞう、やきにく やん → undefined——「串鳥」「やきにく」不再判種類（紅隊 round 9 B4，皆真實店名）', () => {
    expect(kindOfCandidate(cand('串鳥'))).toBeUndefined()
    for (const name of ['やきにくガッッツ', '京やきにく れんぞう', 'やきにく やん']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
    // 既有的串燒寫法 round 14 起也不判
    expect(kindOfCandidate(cand('叙々苑', 'yakiniku_restaurant', ['yakiniku_restaurant']))).toBe('yakiniku')
    expect(kindOfCandidate(cand('やきとり大吉'))).toBeUndefined()
  })
})

describe('round 11：紅隊 round 10 N1～N7＋品牌別名表（BRAND_KINDS；round 14：店名標記不再判，品牌表剩 7 筆）', () => {
  it('N1（round 14 更正）：きしめん 住よし → undefined——「きしめん」不再判烏龍麵（名古屋名駅的烏龍麵店，漏判）', () => {
    expect(kindOfCandidate(cand('きしめん 住よし'))).toBeUndefined()
    expect(kindOfCandidate(cand('きしめん 住よし JR名古屋駅 3・4番線店'))).toBeUndefined()
  })
  it('N2（round 14 更正）：ほうとう不動 → undefined——「ほうとう」不再判烏龍麵（山梨鄉土料理，漏判）', () => {
    expect(kindOfCandidate(cand('ほうとう不動'))).toBeUndefined()
    expect(kindOfCandidate(cand('ほうとう不動 河口湖北本店'))).toBeUndefined()
  })
  it('N3：かつや → tonkatsu（品牌別名表；澀谷道玄坂店是炸豬排連鎖）', () => {
    expect(kindOfCandidate(cand('かつや'))).toBe('tonkatsu')
    expect(kindOfCandidate(cand('かつや 渋谷道玄坂店'))).toBe('tonkatsu')
  })
  it('N4（round 14 更正）：焼きとり ささのや／焼きとり 辻 → undefined——「焼きとり」不再判串燒；既有的串燒寫法也一樣', () => {
    for (const name of ['焼きとり ささのや', '焼きとり 辻']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
    for (const name of ['やきとり大吉', '焼鳥 おがわ', 'やき鳥 宮川', '串鳥']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('N5（round 14 更正）：居酒屋 てっぺん 渋谷女道場 → undefined——「居酒屋」不再判種類（名字本身就含「居酒屋」，但店名路徑刪了）', () => {
    expect(kindOfCandidate(cand('居酒屋 てっぺん 渋谷女道場'))).toBeUndefined()
    expect(kindOfCandidate(cand('居酒屋 和民'))).toBeUndefined()
  })
  it('N6（round 14 更正）：裸「パン」不再是麵包——パンとエスプレッソと → undefined；幸せのパンケーキ照樣是漏判（不是麵包）；ブーランジェリー／パン屋也不判', () => {
    expect(kindOfCandidate(cand('パンとエスプレッソと'))).toBeUndefined()
    expect(kindOfCandidate(cand('パンとエスプレッソと 表参道店'))).toBeUndefined()
    // 鬆餅店：幸せのパンケーキ 渋谷店是真實鬆餅專門店（道玄坂1-18-8），不是麵包店
    expect(kindOfCandidate(cand('幸せのパンケーキ'))).toBeUndefined()
    expect(kindOfCandidate(cand('幸せのパンケーキ 渋谷店'))).toBeUndefined()
    expect(kindOfCandidate(cand('ブーランジェリー ラ・テール'))).toBeUndefined()
    expect(kindOfCandidate(cand('パン屋 渋谷店'))).toBeUndefined()
  })
  it('N6 守衛：シャンパン／champagne 裡的「パン」不是麵包（合成名，測排除正則本身——沒有找到真實香檳酒吧用這個寫法；round 14 排除正則隨店名路徑刪掉，結果一樣是 undefined）', () => {
    expect(kindOfCandidate(cand('シャンパンバー テスト'))).toBeUndefined()
    expect(kindOfCandidate(cand('Champagne Bar テスト'))).toBeUndefined()
  })
  it('N7（round 14 更正）：博多天ぷら たかお → undefined——「天ぷら」不再判種類（Table A 沒有 tempura_restaurant，round 14 起天ぷら沒有任何訊號，只能靠單店排除）', () => {
    expect(kindOfCandidate(cand('博多天ぷら たかお 渋谷パルコ店'))).toBeUndefined()
    expect(kindOfCandidate(cand('てんぷら 天喜'))).toBeUndefined()
    expect(kindOfCandidate(cand('天婦羅 たかお'))).toBeUndefined()
    expect(kindLabel('tempura')).toBe('天ぷら')
  })
  it('品牌別名表全表（round 14：7 個品牌，白木屋已刪）：各回正確種類（皆真實連鎖，名字本身無關鍵字、類型只有 restaurant 時）', () => {
    const cases: Array<[string, string]> = [
      ['丸亀製麺', 'udon'],
      ['鳥貴族', 'izakaya'],
      ['一蘭', 'ramen'],
      ['川上庵', 'soba'],
      ['かつや', 'tonkatsu'],
      ['磯丸水産', 'izakaya'],
      ['魚民', 'izakaya'],
    ]
    for (const [name, kind] of cases) {
      expect(kindOfCandidate(cand(name)), name).toBe(kind)
      expect(kindOfCandidate(cand(name + ' 渋谷店')), name).toBe(kind)
    }
  })
  it('品牌表不蓋掉類型優先（丸亀製麺配 ramen_restaurant 時類型贏——那不是真的丸亀製麺，是測試類型優先的順序）', () => {
    expect(kindOfCandidate(cand('丸亀製麺', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
})

describe('round 13：架構重構——歧義標記全部刪除（round 14：店名路徑整條刪除，round 13 的 (a) 斷言不變，(b) 全部改成 undefined）', () => {
  it('(a) 刪掉的標記裸名一律 undefined：つけ蕎麦尚念、煮干そば 流。、えびそば一幻、鯛そば、藪蕎麦、よもだそば、つけ蕎麦 安土', () => {
    for (const name of ['つけ蕎麦尚念', '煮干そば 流。', 'えびそば一幻', '鯛そば', '藪蕎麦', 'よもだそば', 'つけ蕎麦 安土']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('(a) 同樣的名字配 ramen_restaurant 類型時是拉麵——類型決定，店名不判', () => {
    for (const name of ['つけ蕎麦尚念', '煮干そば 流。', 'えびそば一幻', '鯛そば', '藪蕎麦', 'よもだそば', 'つけ蕎麦 安土']) {
      expect(kindOfCandidate(cand(name, 'ramen_restaurant', ['ramen_restaurant', 'restaurant'])), name).toBe('ramen')
    }
  })
  it('(a) 蕎麥麵只能靠品牌表：川上庵 → soba；藪蕎麦配 noodle_shop 時回泛用 noodle（不是 soba）', () => {
    expect(kindOfCandidate(cand('川上庵'))).toBe('soba')
    expect(kindOfCandidate(cand('藪蕎麦', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('noodle')
  })
  it('(b) round 14 更正：原拉麵標記（菜名本身）全部不再判——中華そば／中華蕎麦／支那そば／油そば／まぜそば／担々麺／冷麺／つけ麺／中華麺／らーめん／らぁ麺／らあめん／ラーメン，名字本身一律 undefined', () => {
    for (const name of ['中華そば 青葉', '中華蕎麦 喜多方', '支那そばや 本店', '油そば 東京油組総本店', '台湾まぜそば はなび', '担々麺専門店', '冷麺専門店', 'つけ麺 さなだ', '中華麺店', 'らー麺 大芽', 'らぁ麺 飯田商店', 'らあめん花月嵐', 'ラーメン二郎']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('(b) round 14 更正：原烏龍麵標記（菜名本身）全部不再判——うどん／讃岐／きしめん／ほうとう，名字本身一律 undefined', () => {
    for (const name of ['讃岐うどん 麺喜やしま', 'きしめん 住よし', 'ほうとう不動', '手打ちうどん さくら']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('(b) round 14 更正：全名另有明確拉麵標記時也不判——つけ蕎麦 中華蕎麦 尚念、煮干中華ソバ イチカワ，店名路徑刪掉之後都是漏判', () => {
    expect(kindOfCandidate(cand('つけ蕎麦 中華蕎麦 尚念'))).toBeUndefined()
    expect(kindOfCandidate(cand('煮干中華ソバ イチカワ'))).toBeUndefined()
  })
})

describe('round 14：店名路徑整條刪除——只剩類型＋品牌（用戶 2026-11-09 00:46 決定）', () => {
  it('F1 反例店名（地名不是菜名）：讃岐ラーメン はまんど、讃岐らぁ麺 伊吹いりこセンター、支那そば讃岐ロック、讃岐らーめん はまの、讃岐ラーメン 根ッ子——類型泛用時一律 undefined（不再誤判成 udon）', () => {
    for (const name of ['讃岐ラーメン はまんど', '讃岐らぁ麺 伊吹いりこセンター', '支那そば讃岐ロック', '讃岐らーめん はまの', '讃岐ラーメン 根ッ子']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('F1 同樣的名字配 ramen_restaurant 類型時是拉麵——類型決定，店名不判', () => {
    for (const name of ['讃岐ラーメン はまんど', '讃岐らぁ麺 伊吹いりこセンター', '支那そば讃岐ロック']) {
      expect(kindOfCandidate(cand(name, 'ramen_restaurant', ['ramen_restaurant', 'restaurant'])), name).toBe('ramen')
    }
  })
  it('F2 反例店名（通用店名不是品牌）：白木屋 しらきや（富山高岡的蕎麥麵店）→ undefined；白木屋連鎖店名本身 → undefined（品牌表已刪）；配 japanese_izakaya_restaurant 類型時類型決定 → izakaya', () => {
    expect(kindOfCandidate(cand('白木屋 しらきや'))).toBeUndefined()
    expect(kindOfCandidate(cand('白木屋'))).toBeUndefined()
    expect(kindOfCandidate(cand('白木屋 渋谷店'))).toBeUndefined()
    expect(kindOfCandidate(cand('白木屋', 'japanese_izakaya_restaurant', ['japanese_izakaya_restaurant']))).toBe('izakaya')
  })
  it('F3 反例店名（一詞兩種菜）：盛岡冷麺 寿々苑、冷麺ダイニングつるしこ（韓式冷麵）→ undefined（不再誤判成 ramen）；配 ramen_restaurant 類型時是拉麵——類型決定', () => {
    expect(kindOfCandidate(cand('盛岡冷麺 寿々苑'))).toBeUndefined()
    expect(kindOfCandidate(cand('冷麺ダイニングつるしこ'))).toBeUndefined()
    expect(kindOfCandidate(cand('盛岡冷麺 寿々苑', 'ramen_restaurant', ['ramen_restaurant', 'restaurant']))).toBe('ramen')
  })
  it('品牌表 7 筆全數仍有效（丸亀製麺／鳥貴族／一蘭／川上庵／かつや／磯丸水産／魚民）：類型泛用時品牌決定種類', () => {
    const cases: Array<[string, string]> = [
      ['丸亀製麺', 'udon'],
      ['鳥貴族', 'izakaya'],
      ['一蘭', 'ramen'],
      ['川上庵', 'soba'],
      ['かつや', 'tonkatsu'],
      ['磯丸水産', 'izakaya'],
      ['魚民', 'izakaya'],
    ]
    for (const [name, kind] of cases) {
      expect(kindOfCandidate(cand(name)), name).toBe(kind)
    }
  })
  it('其他家族店名全部不再判：スシロー、とんかつ和幸、やきとり大吉、鮨 さいとう、喫茶室ルノアール、ブルーボトルコーヒー、パンとエスプレッソと、博多天ぷら たかお、きしめん 住よし、ほうとう不動 → undefined', () => {
    for (const name of ['スシロー', 'とんかつ和幸', 'やきとり大吉', '鮨 さいとう', '喫茶室ルノアール', 'ブルーボトルコーヒー', 'パンとエスプレッソと', '博多天ぷら たかお', 'きしめん 住よし', 'ほうとう不動']) {
      expect(kindOfCandidate(cand(name)), name).toBeUndefined()
    }
  })
  it('泛用 fallback 仍在：麵店／藪蕎麦配 noodle_shop → noodle；丸亀製麺配 noodle_shop 時品牌贏 → udon（品牌在泛用類型之前）', () => {
    expect(kindOfCandidate(cand('麵店', 'noodle_shop', ['noodle_shop']))).toBe('noodle')
    expect(kindOfCandidate(cand('藪蕎麦', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('noodle')
    expect(kindOfCandidate(cand('丸亀製麺', 'noodle_shop', ['noodle_shop', 'restaurant']))).toBe('udon')
  })
})
