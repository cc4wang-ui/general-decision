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
  /** 挑店前先排除店名符合的店（不夠就放回）。 */
  avoidNames?: RegExp
  /** Round 12：整批放回時，avoidTypes／avoidNames 也不放寬（歇：信義深夜「等人」放回後派到水煙吧）。 */
  hardAvoid?: boolean
  /** 挑店前先排除評分低於這個的店（不夠就放回）。 */
  minRating?: number
  /** 挑店前先排除步行超過這個分鐘的店（不夠就放回）。 */
  maxWalk?: number
  /** 走到店之後至少還要營業幾分鐘（checker 2026-11-01：快打烊的店，口令只能叫人坐 2–30 分鐘）。 */
  minOpen?: number
  /** Round 10：走到店時要已經開門（Round 8 實測 09:25 派到 10:00 才開的咖啡店）。歇全部情境都開。 */
  openOnArrival?: boolean
  /** 久坐的情境：口令寫的離開時間不得早於「到店＋這麼多分鐘」（伺服器會改，src/rules.ts）。 */
  stay?: number
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
/** 純喝酒的店（宵夜不派；居酒屋、pub、bar_and_grill 有正餐，不算）。 */
const PURE_BARS = ['bar', 'cocktail_bar', 'wine_bar', 'lounge_bar', 'night_club', 'sports_bar']
/** 歇不派的「不是坐下喝一杯」的店（Round 7，Cross 2026-11-02：東京深夜「咖啡廳」派到水煙吧 ×2、購物中心 ×2）。 */
const NOT_A_SEAT = ['hookah_bar', 'shopping_mall', 'department_store']
/** 水煙吧常把自己標成 cafe（shisha cafe and bar NAROZ，type=cafe）：選咖啡時再用店名擋一層。 */
export const SHISHA_RE = /シーシャ|shisha|hookah|水煙/i
/**
 * 歇選咖啡也不派的「不是咖啡店」（Round 8，2026-11-03 01:14 東京深夜量測：查「カフェ」放大後派到
 * カラオケパセラ（type=karaoke）、新宿カブキhall（居酒屋美食街，type=restaurant，只有店名看得出來））。
 */
// Round 12：snack_bar（日本的スナック＝陪酒小酒館；台灣是小吃店，也不是坐下喝咖啡的地方）。新宿深夜「一個人放空」派到 Artbar星男。
const NOT_COFFEE = ['karaoke', 'food_court', 'snack_bar']
/** 選咖啡時店名擋一層：水煙吧＋美食街、居酒屋、卡拉OK（美食街常標成 restaurant，type 擋不到）。 */
export const NOT_COFFEE_RE = new RegExp(`${SHISHA_RE.source}|food ?court|フードコート|美食街|美食廣場|居酒屋|izakaya|カラオケ|karaoke|卡拉ok|ktv`, 'i')
type Cand = Pick<PlaceCandidate, 'primaryType' | 'types' | 'rating' | 'walkMin' | 'opensAt' | 'closeInMin'> & Partial<Pick<PlaceCandidate, 'name' | 'opensInMin'>>
/** 一個人快吃不派要久坐、要多人的店（checker 2026-11-01：東京查「牛丼」派到燒肉店）。 */
const SLOW_MEAL = ['yakiniku_restaurant', 'korean_barbecue_restaurant', 'barbecue_restaurant', 'hot_pot_restaurant', 'fine_dining_restaurant', 'buffet_restaurant', 'steak_house', 'japanese_izakaya_restaurant', 'bar', 'pub', 'wine_bar', 'bar_and_grill']

/** 吃：一個人快吃、外帶、朋友聚餐、約會吃好一點、宵夜、其他。 */
const EAT: SceneRule[] = [
  {
    // Round 10（checker 2026-11-04 09:07）：早上派到 10:00 才開的店、口令卻寫「09:20 前吃完」→ 快吃與外帶也要到店時開著。
    id: '一個人快吃', radius: 500, maxWalk: 8, minOpen: 25, avoidTypes: SLOW_MEAL, openOnArrival: true,
    queries: {
      TW: [q('便當', 'tw', 1), q('麵店', 'noodle', 1), q('小吃', 'tw', 1), q('滷肉飯', 'tw', 1), q('水餃 鍋貼', 'cn', 1), q('丼飯', 'jp', 2), q('咖哩飯', 'jp', 2)],
      JP: [q('定食', 'jp', 1.5), q('そば', 'jp', 1), q('うどん', 'jp', 1), q('牛丼', 'fast', 1, BEEF), q('ラーメン', 'ramen', 1.5), q('カレー', 'jp', 1)],
    },
    widen: { TW: ['小吃', '便當', '麵店'], JP: ['定食', '食堂', 'ラーメン'] },
    hint: '情境：一個人、趕時間。steps 只點一道，20 分鐘內吃完。',
  },
  {
    // Round 8：外帶不派喝酒的店（2026-11-03 01:19 東京深夜派到 BAR G.O.A.T.，口令「點酒或下酒菜外帶」）。
    id: '外帶', radius: 600, minOpen: 10, maxWalk: 12, avoidTypes: BARISH, openOnArrival: true,
    queries: {
      TW: [q('便當', 'tw', 1), q('滷味', 'tw', 1), q('鹽酥雞', 'tw', 1), q('水餃 鍋貼', 'cn', 1), q('港式 燒臘', 'cn', 1.5), q('小吃', 'tw', 1)],
      JP: [q('弁当', 'jp', 1), q('テイクアウト', 'fast', 1.5), q('おにぎり', 'jp', 1), q('惣菜', 'jp', 1)],
    },
    widen: { TW: ['便當', '小吃', '外帶'], JP: ['弁当', 'テイクアウト', '惣菜'] },
    hint: '情境：外帶。steps 寫點什麼、外帶回去吃，不要寫內用、不要寫幾分鐘內在店裡吃完。',
  },
  {
    id: '朋友聚餐', radius: 1200, minOpen: 90, stay: 90, avoidTypes: [...FASTISH, ...DESSERTISH],
    queries: {
      TW: [q('熱炒', 'tw', 2.5), q('火鍋', 'hotpot', 2.5), q('燒肉', 'jp', 3, BEEF), q('餐酒館', 'western', 3), q('韓式料理', 'kr', 2, HOT), q('泰式料理', 'other', 2, HOT)],
      JP: [q('居酒屋', 'jp', 2.5), q('焼肉', 'jp', 3, BEEF), q('焼き鳥', 'jp', 2.5), q('お好み焼き', 'jp', 2), q('中華料理', 'cn', 1.5), q('韓国料理', 'kr', 2, HOT)],
    },
    widen: { TW: ['餐廳', '熱炒', '火鍋'], JP: ['居酒屋', 'レストラン', '焼肉'] },
    hint: '情境：朋友聚餐，一群人。steps 寫點幾道一起分，不要寫一個人的份量；時間寫 90 分鐘以上，不准催。',
  },
  {
    // Round 10（路線圖 Q1 建議答案：擋）：約會不派酒吧類（Round 6 起派到 Bar Vier）。
    // Round 11（Cross 2026-11-04「全部都處理」）：步行上限 15 分。早上 4.3★ 多半沒開，放寬評分時也不放寬步行（checker 2026-11-04 看到走 32 分）。
    // 半徑跟著收到 1200 m（15 分 × 80 m），第一次查詢的 20 家才會落在走得到的範圍。
    // Round 12：也不派外帶店（早上派到 meal_takeaway 的壽司店）、購物中心／百貨（候選裡有新宿サザンテラス）。
    id: '約會吃好一點', radius: 1200, maxWalk: 15, minOpen: 90, stay: 90, avoidTypes: [...FASTISH, ...DESSERTISH, ...BARISH, ...NOT_A_SEAT, 'meal_takeaway'], minRating: 4.3,
    queries: {
      TW: [q('義大利麵', 'western', 2.5), q('餐酒館', 'western', 3), q('日式料理', 'jp', 3), q('牛排', 'western', 3, BEEF), q('鐵板燒', 'jp', 2.5), q('法式料理', 'western', 3.5)],
      JP: [q('イタリアン', 'western', 2.5), q('フレンチ', 'western', 3.5), q('寿司', 'jp', 2.5), q('天ぷら', 'jp', 2.5), q('和食', 'jp', 3)],
    },
    widen: { TW: ['餐廳', '餐酒館', '義大利麵'], JP: ['レストラン', 'イタリアン', '和食'] },
    hint: '情境：約會或想吃好一點。steps 寫點招牌、慢慢吃；時間寫 90 分鐘以上，不准催。',
  },
  {
    // Round 10：宵夜不派純喝酒的店（2026-11-03 23:42 新宿派到 bar moon walk，type=bar）；居酒屋照留（日本宵夜的常態）。
    id: '宵夜', radius: 1000, openNow: true, minOpen: 30, avoidTypes: PURE_BARS,
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
  { id: '一個人放空', radius: 600, maxWalk: 10, minOpen: 40, stay: 30, openOnArrival: true, hint: '情境：一個人放空。steps 寫坐下、點一杯、不看手機；坐 30 分鐘以上。' },
  // Round 10（路線圖 X3）：Google 沒有插座欄位，口令不准保證有插座。
  { id: '工作讀書', radius: 1000, maxWalk: 15, minOpen: 90, stay: 90, openOnArrival: true, hint: '情境：要工作或讀書，會坐很久。steps 寫先問店員哪裡有插座（插座查不到，不准保證有）、點一杯、專心多久後休息；坐 90 分鐘以上，不准催人走。' },
  { id: '朋友聊天', radius: 1000, maxWalk: 15, minOpen: 60, stay: 60, openOnArrival: true, hint: '情境：跟朋友聊天。steps 寫找能坐幾個人的位子、點什麼一起喝；坐 60 分鐘以上，不准催人走。' },
  { id: '談事情', radius: 1000, minRating: 4.2, maxWalk: 15, minOpen: 60, stay: 60, openOnArrival: true, hint: '情境：要談事情，需要安靜。steps 寫找角落的位子、先點好再開始談；預留 60 分鐘以上。' },
  { id: '等人', radius: 400, maxWalk: 6, minOpen: 25, openOnArrival: true, hint: '情境：等人或空檔，待不久。steps 寫點一杯、坐 20 分鐘、時間到就走。' },
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
      rule: withChoices(module, choices, {
        id, radius: 1000, minOpen: 45, ...(module === 'rest' ? { openOnArrival: true } : {}),
        hint: `情境：使用者自己寫的需求是「${text}」。口令要對得上這個需求，做不到的部分不要假裝做得到。插座、Wi-Fi、安靜、包廂這類條件 Google 查不到：steps 要叫人到店先確認，不准保證有。`,
      }),
    }
  }
  const rule = rules.find((r) => r.id === id)
  return rule ? { id, rule: withChoices(module, choices, rule) } : null
}

/**
 * 規則再依其他選項調整：吃選甜食就不排除甜點店；歇一律排除水煙吧、購物中心（Round 7）；
 * 歇選咖啡再排除酒吧類（關鍵字會撞到店名）、卡拉OK、美食街（Round 8）＋店名有シーシャ／美食街／居酒屋／カラオケ的。
 */
function withChoices(module: ModuleId, choices: Record<string, string | number>, rule: SceneRule): SceneRule {
  if (module === 'eat' && choices.taste === '甜食' && rule.avoidTypes) return { ...rule, avoidTypes: rule.avoidTypes.filter((t) => !SWEET_OK.has(t)) }
  if (module === 'rest') {
    const coffee = String(choices.drink ?? '咖啡') === '咖啡'
    return { ...rule, hardAvoid: true, avoidTypes: [...(rule.avoidTypes ?? []), ...NOT_A_SEAT, ...(coffee ? [...BARISH, ...NOT_COFFEE] : [])], ...(coffee ? { avoidNames: NOT_COFFEE_RE } : {}) }
  }
  return rule
}

/**
 * 歇的基本關鍵字依國家換語言（Round 7）。卡片上的 byOption 是中文（咖啡廳／酒吧／居酒屋／熱炒 燒烤）；
 * 在日本用 languageCode=ja 查中文「咖啡廳」，Google 會撈到水煙吧（シーシャカフェ）、購物中心、麥當勞。
 * ⚠️ 熱炒燒烤 → 焼き鳥（日本沒有熱炒攤；居酒屋已是另一個選項）。台灣與其他地方原字不動。
 */
const REST_BASE_JP: Record<string, string> = { 咖啡廳: 'カフェ', 酒吧: 'バー', 居酒屋: '居酒屋', '熱炒 燒烤': '焼き鳥' }
export function restBase(base: string, country: Country): string {
  return country === 'JP' ? REST_BASE_JP[base] ?? base : base
}

/** 歇：情境改寫「喝什麼」的關鍵字（工作讀書 → 不限時 咖啡廳；其他 → 使用者的字＋咖啡廳）。 */
export function restQuery(scene: Scene | null, drink: string, base: string, country: Country): string {
  if (!scene) return base
  if (scene.text) return `${localizeNeed(scene.text, country)} ${base}`
  const words = REST_MOD[scene.id]?.[drink]
  if (!words) return base
  const local = country === 'JP' ? 'JP' : 'TW'
  return `${words[local][0]} ${base}`
}

/**
 * 「其他」手打的需求在日本換成日文再查（Round 10）。Cross 打中文，日本用 ja 查「有插座 カフェ」只撈到 3 家
 * （checker 2026-11-03 22:51 新宿）。只換認得的詞，其他字照原樣；台灣與其他地方不動。長的詞先換。
 */
const NEED_JP: [RegExp, string][] = [
  [/有插座|插座|可充電|充電/g, '電源'],
  [/不限時/g, '長居'],
  [/安靜/g, '静か'],
  [/wi-?fi|網路/gi, 'Wi-Fi'],
  [/可抽菸|抽菸|吸菸/g, '喫煙'],
  [/包廂/g, '個室'],
  [/吃到飽/g, '食べ放題'],
  [/早午餐/g, 'ブランチ'],
  [/便宜/g, '安い'],
  [/甜點/g, 'スイーツ'],
  [/素食/g, 'ベジタリアン'],
]
export function localizeNeed(text: string, country: Country): string {
  if (country !== 'JP') return text
  return NEED_JP.reduce((s, [re, ja]) => s.replace(re, ja), text)
}

/** 走到店時至少還要開這麼久，才算「去得到」（Round 10）。整批放回時也守這條。 */
export const HARD_OPEN_MIN = 10
/**
 * 到店時已經關門（或剩不到 HARD_OPEN_MIN 分）＝派了也白走。這條不放寬：
 * checker 2026-11-03 22:51 新宿，「其他／有插座」整批放回後派到「走 14 分、剩 8 分關門」的店。
 */
export function viable(c: Pick<Cand, 'walkMin' | 'closeInMin'>): boolean {
  return c.closeInMin === undefined || c.closeInMin - (c.walkMin ?? 0) >= HARD_OPEN_MIN
}
/** 走到店時已經開門（沒有「幾分鐘後開」的資料 → 當作沒開）。 */
export function openOnArrivalOk(c: Pick<Cand, 'walkMin' | 'opensAt'> & Partial<Pick<Cand, 'opensInMin'>>): boolean {
  return !c.opensAt || (typeof c.opensInMin === 'number' && c.opensInMin <= (c.walkMin ?? 0))
}
/**
 * 派了不白走的候選：到店時還開著（viable）；情境要「到店時開著」的（歇、快吃、外帶），還沒開的也不算。
 * 這條不放寬：checker 2026-11-04 09:08 重現「歇的候選全是還沒開門 → 整批放回照樣派」。沒有 → 超商救援。
 */
export function reachablePool<T extends Cand>(cands: T[], scene: Scene | null): T[] {
  const pool = cands.filter(viable)
  return scene?.rule.openOnArrival ? pool.filter(openOnArrivalOk) : pool
}

/**
 * 情境的硬一點的偏好（排除速食／甜點店／酒吧、評分、步行、宵夜要營業中、歇要到店時開門）：先篩，篩完一家都不剩就整批放回（寧可派得到，也不要空手）。
 * relaxed＝一家都不剩、整批放回了。放回的只限 viable（到店時還開著）；連這都沒有 → 空的，交給超商救援。
 */
export function sceneFilter<T extends Cand>(cands: T[], scene: Scene | null): { kept: T[]; relaxed: boolean } {
  const pool = reachablePool(cands, scene)
  if (!scene) return { kept: pool, relaxed: false }
  const kept = pool.filter((c) => passes(c, scene.rule))
  if (kept.length) return { kept, relaxed: false }
  // Round 10（checker 2026-11-04 09:07：早上約會整批放回派到 3.8★）：先只放寬評分，派附近評分最高的那幾家（差 0.2★ 內）。
  // Round 11：只放寬評分，步行上限照舊（最高分是在「走得到的店」裡算）。
  if (scene.rule.minRating !== undefined) {
    const softer = pool.filter((c) => passes(c, { ...scene.rule, minRating: undefined }))
    if (softer.length) {
      const best = Math.max(...softer.map((c) => c.rating ?? 0))
      return { kept: softer.filter((c) => (c.rating ?? 0) >= best - 0.2 - EPS), relaxed: true }
    }
  }
  const back = hardPool(pool, scene.rule)
  return { kept: back, relaxed: back.length > 0 }
}

/** 評分比較的浮點容差（4.3 − 0.2 不一定剛好等於 4.1）。 */
const EPS = 1e-9

/** 整批放回時也不放寬的：hardAvoid 的情境（歇）照樣排除類型／店名。 */
function hardPool<T extends Cand>(pool: T[], r: SceneRule): T[] {
  return r.hardAvoid ? pool.filter((c) => typeOk(c, r)) : pool
}

/**
 * Round 11（checker 2026-11-05：約會 15 分內最高分被「又是這家／不要再來」擋掉時，一步退到整批候選，派到居酒屋或走 29 分的店）。
 * 挑店的退路，一層一層往下退，每層都比上一層大：
 * 1. sceneFilter 的 kept；2. 情境規則只拿掉評分（步行上限、排除類型照舊）；3. 到店時開著的全部候選（寧可派得到）。
 */
export function sceneTiers<T extends Cand>(cands: T[], scene: Scene | null): T[][] {
  const pool = reachablePool(cands, scene)
  const tiers: T[][] = [sceneFilter(cands, scene).kept]
  if (scene) {
    // Round 12（checker R11 第 2 輪：一蘭被擋後 60 次裡 12 次派 3.8★）：第 2 層改成評分階梯——
    // 「最高分往下 0.2★」一階一階加進來；被記憶擋掉的那一階挑不到，就再往下一階。
    const soft = pool.filter((c) => passes(c, { ...scene.rule, minRating: undefined }))
    const ratings = [...new Set(soft.map((c) => c.rating ?? 0))].sort((a, b) => b - a)
    for (let i = 0; i < ratings.length;) {
      const floor = ratings[i] - 0.2 - EPS
      tiers.push(soft.filter((c) => (c.rating ?? 0) >= floor))
      while (i < ratings.length && ratings[i] >= floor) i++
    }
    tiers.push(hardPool(pool, scene.rule))
  } else tiers.push(pool)
  // 只留比前一層大的（各層是包含關係；同樣大小＝同一批，不用再挑一次）
  let max = 0
  return tiers.filter((t) => (t.length > max ? ((max = t.length), true) : false))
}

/** 單一店家是否符合情境偏好（handler 算「夠不夠 5 家」用）。 */
export function scenePasses(c: Cand, scene: Scene | null): boolean {
  return reachablePool([c], scene).length === 1 && (!scene || passes(c, scene.rule))
}

/** 類型與店名的排除（主類別是速食才排除；types 裡順帶有 fast_food 的正餐店，例：拉麵店也標 fast_food，不排除）。 */
function typeOk(c: Cand, r: SceneRule): boolean {
  if (r.avoidTypes && c.primaryType && r.avoidTypes.includes(c.primaryType)) return false
  if (r.avoidNames && c.name && r.avoidNames.test(c.name)) return false
  return true
}

function passes(c: Cand, r: SceneRule): boolean {
  if (!typeOk(c, r)) return false
  if (r.minRating !== undefined && typeof c.rating === 'number' && c.rating < r.minRating) return false
  if (r.maxWalk !== undefined && typeof c.walkMin === 'number' && c.walkMin > r.maxWalk) return false
  // 宵夜：還沒開門的店（「HH:MM 開」）不算。Nearby 的查法沒有 openNow，這裡補上（checker 2026-11-01）。
  if (r.openNow && c.opensAt) return false
  // 歇（Round 10）：走到店時還沒開門的不算（沒有幾分鐘後開的資料 → 當作沒開）。
  if (r.openOnArrival && !openOnArrivalOk(c)) return false
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
  return `${localizeNeed(text, country)} ${EAT_BASE[kind][country]}`
}

/** 第二次（擴大）時輪替的關鍵字：情境自己的；沒有就 undefined（照原本的通用關鍵字）。 */
export function sceneWiden(scene: Scene | null, country: Country): string[] | undefined {
  if (!scene?.rule.widen || (country !== 'TW' && country !== 'JP')) return undefined
  return scene.rule.widen[country]
}

// ── 鐘點（checker 2026-11-01 第 2 輪、preview-5 實測）──────────────────────
// 模型自己加減分鐘常常算錯：當地 20:11 寫「23:11 前到店」、21:11 寫聚餐「21:30 前吃完」。
// 伺服器先算好「到店」「最早離開」「關門」給 prompt，再把口令裡違反的鐘點改掉。

export interface SceneTimes {
  /** 都是當地一天裡的第幾分鐘（0–1439）。 */
  now: number
  arrive: number
  /** Round 10：店比人晚到時的開門時間（arrive 已改成這個）。 */
  opens?: number
  /** 久坐的情境才有：到店＋stay。 */
  leave?: number
  close?: number
}

const toHM = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
export const hm = toHM

/** localNow＝當地「HH:MM」。walkMin／closeInMin 是派到的那家店的。 */
export function sceneTimes(scene: Scene | null, localNow: string, walkMin: number | undefined, closeInMin: number | undefined, opensInMin?: number): SceneTimes | null {
  if (!scene) return null
  const [h, m] = localNow.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const now = h! * 60 + m!
  const reach = now + (walkMin ?? 0)
  // Round 10（checker 2026-11-04 09:07）：店 10:00 才開，口令不能寫「09:20 前吃完」→ 進店時間從開門算。
  const opens = opensInMin !== undefined && now + opensInMin > reach ? now + opensInMin : undefined
  const arrive = opens ?? reach
  const close = closeInMin !== undefined ? now + closeInMin : undefined
  const t: SceneTimes = { now, arrive }
  if (opens !== undefined) t.opens = opens
  if (close !== undefined) t.close = close
  if (scene.rule.stay !== undefined) t.leave = close !== undefined ? Math.min(arrive + scene.rule.stay, close) : arrive + scene.rule.stay
  return t
}

/** prompt 用的一行（模型照抄數字，不要自己算）。 */
export function sceneTimesLine(t: SceneTimes | null): string {
  if (!t) return ''
  const parts = [`現在 ${toHM(t.now)}`, t.opens !== undefined ? `店 ${toHM(t.opens)} 才開，${toHM(t.opens)} 進店` : `走到店 ${toHM(t.arrive)}`]
  if (t.close !== undefined) parts.push(`店 ${toHM(t.close)} 關`)
  const leave = t.leave !== undefined ? `steps 寫的離開、吃完時間不得早於 ${toHM(t.leave)}。` : ''
  return `【已算好】${parts.join('，')}。鐘點照這些寫，不要自己加減。${leave}`
}

const HM_RE = /(?<!\d)(\d{1,2})([:：])(\d{2})(?!\d)/g
/** 開門、關門、最後點餐的鐘點由 fixHours 管，這裡不碰。 */
const HOURS_CTX = /開|營業|關|打烊|點餐/
const ARRIVE_CTX = /^\s*(前|以前)?\s*(到|抵達|進店|進場|進門)/
const LEAVE_CTX = /^\s*(前|以前)\s*(吃完|離開|出店|散|撤|走|結束|講完|談完|喝完|收工|起身|回家|收隊)/

/**
 * 口令裡的鐘點照伺服器算的時間改：
 * - 比現在早、或比關門晚 30 分以上（明顯算錯）→ 後面接「到／抵達」就改成到店時間，否則改成關門時間。
 * - 久坐的情境：「HH:MM 前吃完／離開…」早於最早離開時間 → 改成最早離開時間。
 */
export function fixSceneClock(text: string, t: SceneTimes | null): string {
  if (!t) return text
  return text.replace(HM_RE, (all, hh: string, sep: string, mm: string, offset: number, whole: string) => {
    const after = whole.slice(offset + all.length, offset + all.length + 8)
    const before = whole.slice(Math.max(0, offset - 4), offset)
    if (HOURS_CTX.test(after.slice(0, 3)) || HOURS_CTX.test(before)) return all
    const v = Number(hh) * 60 + Number(mm)
    if (Number(hh) > 23 || Number(mm) > 59) return all // 不合法的交給 fixClock
    const d = (v - t.now + 1440) % 1440 // 從現在往後幾分鐘
    const closeD = t.close !== undefined ? t.close - t.now : undefined
    const fmt = (min: number) => toHM(min).replace(':', sep)
    // 「比現在早」：往後超過 20 小時＝其實是幾小時前
    const past = d > 20 * 60
    const tooLate = closeD !== undefined && d > closeD + 30
    if (past || tooLate) return ARRIVE_CTX.test(after) || t.close === undefined ? fmt(t.arrive) : fmt(t.close)
    if (t.leave !== undefined && LEAVE_CTX.test(after) && d < t.leave - t.now) return fmt(t.leave)
    return all
  })
}
