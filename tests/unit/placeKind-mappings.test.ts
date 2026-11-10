// 對映表窮舉測試（step 3 stage 3 Stryker）：把 src/placeKind.ts 的三張表
// （TYPE_KINDS、GENERIC_TYPES、KIND_LABELS）每一個對映值都用硬編碼字面量斷言。
// Stryker baseline（main f8c1bbe5）：48.24%，82 killed / 87 survived / 1 no-coverage；
// 87 個 survivor 裡 83 個是 StringLiteral（表值從未被斷言），2 個是
// ConditionalExpression（:282／:289，舊測試 primaryType 與 types 永遠鏡像，
// 關掉 primaryType 分支也看不出來）。這份檔案殺掉其中 85 個。
// 期望值全部硬編碼在這裡，絕不 import KIND_LABELS 再迭代——kindLabel 直接回傳
// 表值，鏡像測試就算 mutant 把值改成 '' 也照樣通過。
import { describe, expect, it } from 'vitest'
import { kindLabel, kindOfCandidate, normalizeKind } from '../../src/placeKind'

// TYPE_KINDS 全表（62 筆，與 src/placeKind.ts 的 TYPE_KINDS 同順序同值；
// 2026-11-10 以程式比對過原始碼，完全一致）。
const TYPE_KINDS_PAIRS: Array<[string, string]> = [
  ['ramen_restaurant', 'ramen'],
  ['sushi_restaurant', 'sushi'],
  ['yakiniku_restaurant', 'yakiniku'],
  ['japanese_curry_restaurant', 'curry'],
  ['tonkatsu_restaurant', 'tonkatsu'],
  ['yakitori_restaurant', 'yakitori'],
  ['chinese_noodle_restaurant', 'ramen'],
  ['chinese_restaurant', 'chinese'],
  ['cafe', 'cafe'],
  ['coffee_shop', 'cafe'],
  ['coffee_stand', 'cafe'],
  ['coffee_roastery', 'cafe'],
  ['cat_cafe', 'cafe'],
  ['dog_cafe', 'cafe'],
  ['japanese_izakaya_restaurant', 'izakaya'],
  ['bakery', 'bakery'],
  ['pizza_restaurant', 'pizza'],
  ['hamburger_restaurant', 'hamburger'],
  ['dim_sum_restaurant', 'dim_sum'],
  ['steak_house', 'steak'],
  ['sandwich_shop', 'sandwich'],
  ['ice_cream_shop', 'ice_cream'],
  ['seafood_restaurant', 'seafood'],
  ['hot_pot_restaurant', 'hot_pot'],
  ['dumpling_restaurant', 'dumpling'],
  ['soup_restaurant', 'soup'],
  ['salad_shop', 'salad'],
  ['taco_restaurant', 'taco'],
  ['tapas_restaurant', 'tapas'],
  ['falafel_restaurant', 'falafel'],
  ['gyro_restaurant', 'gyro'],
  ['shawarma_restaurant', 'shawarma'],
  ['kebab_shop', 'kebab'],
  ['fondue_restaurant', 'fondue'],
  ['fish_and_chips_restaurant', 'fish_and_chips'],
  ['burrito_restaurant', 'burrito'],
  ['barbecue_restaurant', 'barbecue'],
  ['chicken_restaurant', 'chicken'],
  ['chicken_wings_restaurant', 'chicken_wings'],
  ['hot_dog_restaurant', 'hot_dog'],
  ['hot_dog_stand', 'hot_dog'],
  ['korean_barbecue_restaurant', 'korean_barbecue'],
  ['mongolian_barbecue_restaurant', 'mongolian_barbecue'],
  ['oyster_bar_restaurant', 'oyster'],
  ['acai_shop', 'acai'],
  ['bagel_shop', 'bagel'],
  ['cake_shop', 'cake'],
  ['candy_store', 'candy'],
  ['chocolate_shop', 'chocolate'],
  ['chocolate_factory', 'chocolate'],
  ['confectionery', 'confectionery'],
  ['deli', 'deli'],
  ['dessert_restaurant', 'dessert'],
  ['dessert_shop', 'dessert'],
  ['donut_shop', 'donut'],
  ['pastry_shop', 'pastry'],
  ['juice_shop', 'juice'],
  ['tea_house', 'tea'],
  ['breakfast_restaurant', 'breakfast'],
  ['brunch_restaurant', 'brunch'],
  ['vegan_restaurant', 'vegan'],
  ['vegetarian_restaurant', 'vegetarian'],
]

// KIND_LABELS 全表（59 筆，與 src/placeKind.ts 的 KIND_LABELS 同順序同值；
// 2026-11-10 以程式比對過原始碼，完全一致）。
const KIND_LABELS_PAIRS: Array<[string, string]> = [
  ['udon', '烏龍麵'],
  ['soba', '蕎麥麵'],
  ['ramen', '拉麵'],
  ['sushi', '壽司'],
  ['yakiniku', '燒肉'],
  ['curry', '咖哩'],
  ['bakery', '麵包'],
  ['cafe', '咖啡'],
  ['tonkatsu', '炸豬排'],
  ['yakitori', '串燒'],
  ['izakaya', '居酒屋'],
  ['tempura', '天ぷら'],
  ['noodle', '麵食'],
  ['chinese', '中餐'],
  ['pizza', '披薩'],
  ['hamburger', '漢堡'],
  ['dim_sum', '點心'],
  ['steak', '牛排'],
  ['sandwich', '三明治'],
  ['ice_cream', '冰淇淋'],
  ['seafood', '海鮮'],
  ['hot_pot', '火鍋'],
  ['dumpling', '餃子'],
  ['soup', '湯'],
  ['salad', '沙拉'],
  ['taco', '塔可'],
  ['tapas', '下酒菜'],
  ['falafel', '法拉費'],
  ['gyro', '希臘烤肉捲'],
  ['shawarma', '沙威瑪'],
  ['kebab', '烤肉串'],
  ['fondue', '起司鍋'],
  ['fish_and_chips', '炸魚薯條'],
  ['burrito', '捲餅'],
  ['barbecue', '美式燒烤'],
  ['chicken', '雞肉'],
  ['chicken_wings', '雞翅'],
  ['hot_dog', '熱狗'],
  ['korean_barbecue', '韓式燒烤'],
  ['mongolian_barbecue', '蒙古烤肉'],
  ['oyster', '生蠔'],
  ['acai', '巴西莓'],
  ['bagel', '貝果'],
  ['cake', '蛋糕'],
  ['candy', '糖果'],
  ['chocolate', '巧克力'],
  ['confectionery', '甜食'],
  ['deli', '熟食'],
  ['dessert', '甜點'],
  ['donut', '甜甜圈'],
  ['pastry', '糕點'],
  ['juice', '果汁'],
  ['tea', '茶'],
  ['breakfast', '早餐'],
  ['brunch', '早午餐'],
  ['vegan', '純素'],
  ['vegetarian', '素食'],
  ['ramen_restaurant', '拉麵'],
  ['sushi_restaurant', '壽司'],
]

describe('kindOfCandidate：TYPE_KINDS 窮舉——primaryType 路徑（Stryker :282）', () => {
  it('62 筆全數：只給 primaryType、不給 types，primaryType 分支是唯一路徑——殺掉全部 TYPE_KINDS StringLiteral survivor 與 :282 ConditionalExpression（把 primaryType 分支改成 if (false) 時，沒 types 可兜底，一定失敗）', () => {
    for (const [type, kind] of TYPE_KINDS_PAIRS) {
      expect(kindOfCandidate({ name: '某店', primaryType: type }), type).toBe(kind)
    }
  })
})

describe('kindOfCandidate：TYPE_KINDS 窮舉——types 路徑', () => {
  it('62 筆全數：只給 types 陣列，鎖住 types 迴圈的每一筆對映', () => {
    for (const [type, kind] of TYPE_KINDS_PAIRS) {
      expect(kindOfCandidate({ name: '某店', types: [type] }), type).toBe(kind)
    }
  })
})

describe('kindOfCandidate：GENERIC_TYPES 泛用類型（Stryker :289）', () => {
  it("noodle_shop 只給 primaryType、不給 types → 'noodle'：殺掉 :289 ConditionalExpression（把泛用 primaryType 分支改成 if (false) 時，沒 types 可兜底）", () => {
    expect(kindOfCandidate({ name: '某店', primaryType: 'noodle_shop' })).toBe('noodle')
  })
  it("noodle_shop 只給 types → 'noodle'", () => {
    expect(kindOfCandidate({ name: '某店', types: ['noodle_shop'] })).toBe('noodle')
  })
  it("primaryType noodle_shop + types ['restaurant'] → 'noodle'：泛用 primaryType 贏過 types 裡的泛用 restaurant", () => {
    expect(kindOfCandidate({ name: '某店', primaryType: 'noodle_shop', types: ['restaurant'] })).toBe('noodle')
  })
})

describe('kindOfCandidate：primaryType 優先於 types（明確優先順序）', () => {
  it("primaryType sushi_restaurant + types ['ramen_restaurant'] → 'sushi'：primaryType 贏過 types 裡不同的 dish 類型", () => {
    expect(kindOfCandidate({ name: '某店', primaryType: 'sushi_restaurant', types: ['ramen_restaurant'] })).toBe('sushi')
  })
  it("primaryType ramen_restaurant + types ['sushi_restaurant'] → 'ramen'：反向也一樣，primaryType 贏", () => {
    expect(kindOfCandidate({ name: '某店', primaryType: 'ramen_restaurant', types: ['sushi_restaurant'] })).toBe('ramen')
  })
})

describe('kindLabel：KIND_LABELS 窮舉（Stryker StringLiteral）', () => {
  it('59 筆全數：每一種 kind 都有硬編碼的中文顯示名——殺掉全部 KIND_LABELS StringLiteral survivor', () => {
    for (const [kind, label] of KIND_LABELS_PAIRS) {
      expect(kindLabel(kind), kind).toBe(label)
    }
  })
  it('未知 kind 原樣回傳：kindLabel 沒有的鍵就回傳鍵本身（?? kind 的 fallback）', () => {
    expect(kindLabel('unknown_kind_xyz')).toBe('unknown_kind_xyz')
  })
})

describe('normalizeKind：TYPE_KINDS 窮舉（Stryker StringLiteral）', () => {
  it('62 筆全數：每一種 Google 類型都歸一化成短鍵——鎖住舊鍵轉新鍵的契約（ramen_restaurant／sushi_restaurant 已在表內，不另測）', () => {
    for (const [type, kind] of TYPE_KINDS_PAIRS) {
      expect(normalizeKind(type), type).toBe(kind)
    }
  })
  it('不在表裡的鍵原樣回傳：normalizeKind 沒有的鍵就回傳鍵本身（?? kind 的 fallback）', () => {
    expect(normalizeKind('yakiniku')).toBe('yakiniku')
    expect(normalizeKind('udon')).toBe('udon')
  })
})

describe('kindOfCandidate：沒有名字的候選（Stryker :286）', () => {
  it("沒有 name、types 只有 ['restaurant'] → undefined：走過品牌檢查的 name fallback（c.name ?? ''）", () => {
    expect(kindOfCandidate({ types: ['restaurant'] })).toBeUndefined()
  })
  it('空物件 {} → undefined：沒有任何訊號就漏判，不猜', () => {
    expect(kindOfCandidate({})).toBeUndefined()
  })
  // 註：:286 的 '' mutant 是等價 mutant（'' → "" 是同一個字串），
  // 這兩個測試只記錄「無名字時品牌檢查不誤判」的行為，殺不掉它——
  // 預期它從 NoCoverage 變成 Survived（等價），不是 Killed。
})
