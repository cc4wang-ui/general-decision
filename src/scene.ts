/**
 * Round 5 情境（Cross 2026-11-01「返回的結果不符合我的需求，第一步先確認使用者情境偏好」）。
 *
 * 吃／歇兩張卡的第一個問題是「現在是什麼情境」：預設幾種常見的，加「其他」手動輸入。
 * 情境會改變：第一次查什麼（關鍵字）、查多遠、第二次查什麼、挑店時先排除哪些店、口令怎麼寫。
 * 純函式，不碰 I/O，前後端共用（前端只用 SCENE_OPTIONS／sanitizeSceneText）。
 */
import type { Country, ModuleId, PlaceCandidate } from './types.ts'

export const SCENE_KEY = 'scene'
export const SCENE_TEXT_KEY = 'sceneText'
export const SCENE_OTHER = '其他'
/** 手動輸入上限（字）。 */
export const SCENE_TEXT_MAX = 20

type Words = Record<'TW' | 'JP', string[]>

/** 跟 src/lanes.ts QueryLane 同形狀（lanes.ts 直接拿來當關鍵字 lane 用）。 */
export interface SceneQuery {
  q: string
  group: string
  /** 推估價位檔（同 QUERY_LANES.est），給預算篩關鍵字用。 */
  est: number
  /** 這個忌口時不排。 */
  block?: string[]
}

export interface SceneRule {
  id: string
  /** 第一次查的半徑（公尺）。 */
  radius: number
  /** 第一次的關鍵字池（台／日）；空 = 照原本的 lane 規則。 */
  queries?: Record<'TW' | 'JP', SceneQuery[]>
  /** 第二次（擴大）時輪替的通用關鍵字；空 = 照原本的通用關鍵字。 */
  widen?: Words
  /** 第一次就只要營業中的店（宵夜）。 */
  openNow?: boolean
  /** 挑店前先排除這些類型的店（不夠就放回）。 */
  avoidTypes?: string[]
  /** 挑店前先排除評分低於這個的店（不夠就放回）。 */
  minRating?: number
  /** 挑店前先排除步行超過這個分鐘的店（不夠就放回）。 */
  maxWalk?: number
  /** 走到店之後至少還要營業幾分鐘（checker 2026-11-01：快打烊的店，口令只能叫人坐 2–30 分鐘）。 */
  minOpen?: number
  /** 寫進 prompt 的一行，讓口令對得上情境。 */
  hint: string
}

const q = (q: string, group: string, est: number, block?: string[]): SceneQuery => ({ q, group, est, ...(block ? { block } : {}) })
const BEEF = ['不吃牛']
const HOT = ['不辣']
const FASTISH = ['fast_food_restaurant', 'convenience_store', 'food_court', 'sandwich_shop', 'bakery']
/** 甜點店（checker 2026-11-01：內湖「約會吃好一點」查「法式料理」派到法式甜點蛋糕店）。選「甜食」時不排除。 */
const DESSERTISH = ['cake_shop', 'dessert_shop', 'dessert_restaurant', 'pastry_shop', 'confectionery', 'ice_cream_shop', 'donut_shop', 'chocolate_shop', 'candy_store']
const SWEET_OK = new Set([...DESSERTISH, 'bakery'])
/** 喝酒的店（checker 2026-11-01：選咖啡＋談事情，「安靜 咖啡廳」撞到店名「安靜小酒館」）。選咖啡時排除。 */
const BARISH = ['bar', 'pub', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar', 'night_club', 'bar_and_grill', 'beer_hall', 'japanese_izakaya_restaurant']
type Cand = Pick<PlaceCandidate, 'primaryType' | 'types' | 'rating' | 'walkMin' | 'opensAt' | 'closeInMin'>
/** 一個人快吃不派要久坐、要多人的店（checker 2026-11-01：東京查「牛丼」派到燒肉店）。 */
const SLOW_MEAL = ['yakiniku_restaurant', 'korean_barbecue_restaurant', 'barbecue_restaurant', 'hot_pot_restaurant', 'fine_dining_restaurant', 'buffet_restaurant', 'steak_house', 'japanese_izakaya_restaurant', 'bar', 'pub', 'wine_bar', 'bar_and_grill']

/** 吃：一個人快吃、外帶、朋友聚餐、約會吃好一點、宵夜、其他。 */
const EAT: SceneRule[] = [
  {
    id: '一個人快吃', radius: 500, maxWalk: 8, minOpen: 25, avoidTypes: SLOW_MEAL,
    queries: {
      TW: [q('便當', 'tw', 1), q('麵店', 'noodle', 1), q('小吃', 'tw', 1), q('滷肉飯', 'tw', 1), q('水餃 鍋貼', 'cn', 1), q('丼飯', 'jp', 2), q('咖哩飯', 'jp', 2)],
      JP: [q('定食', 'jp', 1.5), q('そば', 'jp', 1), q('うどん', 'jp', 1), q('牛丼', 'fast', 1, BEEF), q('ラーメン', 'ramen', 1.5), q('カレー', 'jp', 1)],
    },
    widen: { TW: ['小吃', '便當', '麵店'], JP: ['定食', '食堂', 'ラーメン'] },
    hint: '情境：一個人、趕時間。steps 只點一道，20 分鐘內吃完。',
  },
  {
    id: '外帶', radius: 600, minOpen: 10,
    queries: {
      TW: [q('便當', 'tw', 1), q('滷味', 'tw', 1), q('鹽酥雞', 'tw', 1), q('水餃 鍋貼', 'cn', 1), q('港式 燒臘', 'cn', 1.5), q('小吃', 'tw', 1)],
      JP: [q('弁当', 'jp', 1), q('テイクアウト', 'fast', 1.5), q('おにぎり', 'jp', 1), q('惣菜', 'jp', 1)],
    },
    widen: { TW: ['便當', '小吃', '外帶'], JP: ['弁当', 'テイクアウト', '惣菜'] },
    hint: '情境：外帶。steps 寫點什麼、外帶回去吃，不要寫內用、不要寫幾分鐘內在店裡吃完。',
  },
  {
    id: '朋友聚餐', radius: 1200, minOpen: 90, avoidTypes: [...FASTISH, ...DESSERTISH],
    queries: {
      TW: [q('熱炒', 'tw', 2.5), q('火鍋', 'hotpot', 2.5), q('燒肉', 'jp', 3, BEEF), q('餐酒館', 'western', 3), q('韓式料理', 'kr', 2, HOT), q('泰式料理', 'other', 2, HOT)],
      JP: [q('居酒屋', 'jp', 2.5), q('焼肉', 'jp', 3, BEEF), q('焼き鳥', 'jp', 2.5), q('お好み焼き', 'jp', 2), q('中華料理', 'cn', 1.5), q('韓国料理', 'kr', 2, HOT)],
    },
    widen: { TW: ['餐廳', '熱炒', '火鍋'], JP: ['居酒屋', 'レストラン', '焼肉'] },
    hint: '情境：朋友聚餐，一群人。steps 寫點幾道一起分，不要寫一個人的份量；時間寫 90 分鐘以上，不准催。',
  },
  {
    id: '約會吃好一點', radius: 1500, minOpen: 90, avoidTypes: [...FASTISH, ...DESSERTISH], minRating: 4.3,
    queries: {
      TW: [q('義大利麵', 'western', 2.5), q('餐酒館', 'western', 3), q('日式料理', 'jp', 3), q('牛排', 'western', 3, BEEF), q('鐵板燒', 'jp', 2.5), q('法式料理', 'western', 3.5)],
      JP: [q('イタリアン', 'western', 2.5), q('フレンチ', 'western', 3.5), q('寿司', 'jp', 2.5), q('天ぷら', 'jp', 2.5), q('和食', 'jp', 3)],
    },
    widen: { TW: ['餐廳', '餐酒館', '義大利麵'], JP: ['レストラン', 'イタリアン', '和食'] },
    hint: '情境：約會或想吃好一點。steps 寫點招牌、慢慢吃；時間寫 90 分鐘以上，不准催。',
  },
  {
    id: '宵夜', radius: 1000, openNow: true, minOpen: 30,
    queries: {
      TW: [q('宵夜', 'tw', 1), q('鹽酥雞', 'tw', 1), q('清粥小菜', 'tw', 1), q('滷味', 'tw', 1), q('拉麵', 'ramen', 2), q('麵店', 'noodle', 1)],
      JP: [q('ラーメン', 'ramen', 1.5), q('牛丼', 'fast', 1, BEEF), q('居酒屋', 'jp', 2.5), q('そば', 'jp', 1)],
    },
    widen: { TW: ['宵夜', '小吃', '消夜'], JP: ['ラーメン', '深夜営業', '居酒屋'] },
    hint: '情境：宵夜。steps 吃輕一點，30 分鐘內吃完回家。',
  },
]

/**
 * 歇：一個人放空、工作讀書、朋友聊天、談事情、等人、其他。每一種都會改查法（半徑、修飾詞或挑店前的篩選），
 * 不是只改口令。修飾詞加在「喝什麼」的關鍵字前面（REST_MOD）。
 */
const REST: SceneRule[] = [
  { id: '一個人放空', radius: 600, maxWalk: 10, minOpen: 40, hint: '情境：一個人放空。steps 寫坐下、點一杯、不看手機；坐 30 分鐘以上。' },
  { id: '工作讀書', radius: 1000, maxWalk: 15, minOpen: 90, hint: '情境：要工作或讀書，會坐很久。steps 寫找有插座的位子、點一杯、專心多久後休息；坐 90 分鐘以上，不准催人走。' },
  { id: '朋友聊天', radius: 1000, maxWalk: 15, minOpen: 60, hint: '情境：跟朋友聊天。steps 寫找能坐幾個人的位子、點什麼一起喝；坐 60 分鐘以上，不准催人走。' },
  { id: '談事情', radius: 1000, minRating: 4.2, maxWalk: 15, minOpen: 60, hint: '情境：要談事情，需要安靜。steps 寫找角落的位子、先點好再開始談；預留 60 分鐘以上。' },
  { id: '等人', radius: 400, maxWalk: 6, minOpen: 25, hint: '情境：等人或空檔，待不久。steps 寫點一杯、坐 20 分鐘、時間到就走。' },
]
/** 歇的情境修飾詞：只加在咖啡（酒吧、居酒屋不適合「不限時」）。 */
const REST_MOD: Record<string, Partial<Record<string, Words>>> = {
  工作讀書: { 咖啡: { TW: ['不限時'], JP: ['電源'] } },
  談事情: { 咖啡: { TW: ['安靜'], JP: ['静か'] }, 酒吧: { TW: ['安靜'], JP: ['静か'] } },
}

const RULES: Partial<Record<ModuleId, SceneRule[]>> = { eat: EAT, rest: REST }

/** 所有情境關鍵字（src/lanes.ts laneEst 查推估價位用）。 */
export const SCENE_QUERIES: SceneQuery[] = EAT.flatMap((r) => [...(r.queries?.TW ?? []), ...(r.queries?.JP ?? [])])

/** 選單上的情境（含「其他」）。只有吃、歇有。 */
export function sceneOptions(module: ModuleId): string[] {
  const r = RULES[module]
  return r ? [...r.map((x) => x.id), SCENE_OTHER] : []
}

/** 手動輸入：去掉換行與控制字元、頭尾空白，截到 SCENE_TEXT_MAX 字。空字串＝沒填。 */
export function sanitizeSceneText(v: unknown): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return [...s].slice(0, SCENE_TEXT_MAX).join('')
}

export interface Scene {
  id: string
  /** 「其他」才有：使用者自己打的需求。 */
  text?: string
  rule: SceneRule
}

/** 這次的情境（沒選、選了不認得、或「其他」沒填字 → null）。 */
export function sceneOf(module: ModuleId, choices: Record<string, string | number>): Scene | null {
  const rules = RULES[module]
  if (!rules) return null
  const id = String(choices[SCENE_KEY] ?? '')
  if (id === SCENE_OTHER) {
    const text = sanitizeSceneText(choices[SCENE_TEXT_KEY])
    if (!text) return null
    return {
      id, text,
      rule: withChoices(module, choices, { id, radius: 1000, minOpen: 45, hint: `情境：使用者自己寫的需求是「${text}」。口令要對得上這個需求，做不到的部分不要假裝做得到。` }),
    }
  }
  const rule = rules.find((r) => r.id === id)
  return rule ? { id, rule: withChoices(module, choices, rule) } : null
}

/** 規則再依其他選項調整：吃選甜食就不排除甜點店；歇選咖啡就排除酒吧類（關鍵字會撞到店名）。 */
function withChoices(module: ModuleId, choices: Record<string, string | number>, rule: SceneRule): SceneRule {
  if (module === 'eat' && choices.taste === '甜食' && rule.avoidTypes) return { ...rule, avoidTypes: rule.avoidTypes.filter((t) => !SWEET_OK.has(t)) }
  if (module === 'rest' && String(choices.drink ?? '咖啡') === '咖啡') return { ...rule, avoidTypes: [...(rule.avoidTypes ?? []), ...BARISH] }
  return rule
}

/** 歇：情境改寫「喝什麼」的關鍵字（工作讀書 → 不限時 咖啡廳；其他 → 使用者的字＋咖啡廳）。 */
export function restQuery(scene: Scene | null, drink: string, base: string, country: Country): string {
  if (!scene) return base
  if (scene.text) return `${scene.text} ${base}`
  const words = REST_MOD[scene.id]?.[drink]
  if (!words) return base
  const local = country === 'JP' ? 'JP' : 'TW'
  return `${words[local][0]} ${base}`
}

/**
 * 情境的硬一點的偏好（排除速食／甜點店／酒吧、評分、步行、宵夜要營業中）：先篩，篩完一家都不剩就整批放回（寧可派得到，也不要空手）。
 * relaxed＝一家都不剩、整批放回了。
 */
export function sceneFilter<T extends Cand>(cands: T[], scene: Scene | null): { kept: T[]; relaxed: boolean } {
  if (!scene) return { kept: cands, relaxed: false }
  const kept = cands.filter((c) => passes(c, scene.rule))
  return kept.length ? { kept, relaxed: false } : { kept: cands, relaxed: cands.length > 0 }
}

/** 單一店家是否符合情境偏好（handler 算「夠不夠 5 家」用）。 */
export function scenePasses(c: Cand, scene: Scene | null): boolean {
  return !scene || passes(c, scene.rule)
}

function passes(c: Cand, r: SceneRule): boolean {
  if (r.avoidTypes && [c.primaryType, ...(c.types ?? [])].some((t) => t !== undefined && r.avoidTypes!.includes(t))) {
    // 主類別是速食才排除；types 裡順帶有 fast_food 的正餐店（例：拉麵店也標 fast_food）不排除。
    if (c.primaryType && r.avoidTypes.includes(c.primaryType)) return false
  }
  if (r.minRating !== undefined && typeof c.rating === 'number' && c.rating < r.minRating) return false
  if (r.maxWalk !== undefined && typeof c.walkMin === 'number' && c.walkMin > r.maxWalk) return false
  // 宵夜：還沒開門的店（「HH:MM 開」）不算。Nearby 的查法沒有 openNow，這裡補上（checker 2026-11-01）。
  if (r.openNow && c.opensAt) return false
  // 走過去之後還要營業夠久（沒有關門資料或 24 小時營業 → 不限制）。
  if (r.minOpen !== undefined && typeof c.closeInMin === 'number' && c.closeInMin - (c.walkMin ?? 0) < r.minOpen) return false
  return true
}

const EAT_BASE: Record<'sweet' | 'veg' | 'meal', Record<Country, string>> = {
  sweet: { TW: '甜點', JP: 'スイーツ', other: 'dessert' },
  veg: { TW: '素食', JP: 'ベジタリアン', other: 'vegetarian' },
  meal: { TW: '餐廳', JP: 'レストラン', other: 'restaurant' },
}

/** 吃的「其他」：使用者的字＋基本詞（甜食 → 甜點；素 → 素食；其餘 → 餐廳），不然「安靜」會撈到公園。 */
export function eatOtherQuery(text: string, choices: Record<string, string | number>, country: Country): string {
  const kind = choices.taste === '甜食' ? 'sweet' : choices.diet === '素' ? 'veg' : 'meal'
  return `${text} ${EAT_BASE[kind][country]}`
}

/** 第二次（擴大）時輪替的關鍵字：情境自己的；沒有就 undefined（照原本的通用關鍵字）。 */
export function sceneWiden(scene: Scene | null, country: Country): string[] | undefined {
  if (!scene?.rule.widen || (country !== 'TW' && country !== 'JP')) return undefined
  return scene.rule.widen[country]
}
