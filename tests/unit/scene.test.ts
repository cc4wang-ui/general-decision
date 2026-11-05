// @vitest-environment node
// Round 5 情境（Cross 2026-11-01「返回的結果不符合我的需求，第一步先確認使用者情境偏好」）。
// STOP 1：預設 ≥ 5 種＋「其他」（≤ 20 字），必選。STOP 2：每一種預設都會改查法；手動輸入變成關鍵字。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api, { sanitizeRequest } from '../../api/order.ts'
import { CARD_BY_ID } from '../../src/cards.ts'
import { mulberry32 } from '../../src/discovery.ts'
import { pickLane, widenPlan, type LanePlan } from '../../src/lanes.ts'
import { priceFit } from '../../src/price.ts'
import { buildOrderPrompt } from '../../src/prompt.ts'
import {
  SCENE_OTHER, SCENE_QUERIES, SCENE_TEXT_MAX, eatOtherQuery, restQuery, sanitizeSceneText, sceneFilter, sceneOf, sceneOptions, scenePasses, sceneWiden,
} from '../../src/scene.ts'
import { templateOrder } from '../../src/template.ts'
import { stats } from '../../src/diary.ts'
import { summarize, type TrialEntry } from '../../src/trial.ts'
import type { RawPlace } from '../../src/places.ts'
import type { DiaryEntry, Order, OrderDebug, OrderRequest, PickResult, PlaceCandidate } from '../../src/types.ts'

const many = (n: number, f: (seed: number) => LanePlan) => Array.from({ length: n }, (_, s) => f(s + 1))
const eatPlans = (choices: Record<string, string | number>, country: 'TW' | 'JP' = 'TW', n = 200) =>
  many(n, (s) => pickLane(CARD_BY_ID.eat, choices, undefined, country, mulberry32(s), 12, undefined, sceneOf('eat', choices)))
const restPlans = (choices: Record<string, string | number>, country: 'TW' | 'JP' = 'TW', n = 50) =>
  many(n, (s) => pickLane(CARD_BY_ID.rest, choices, undefined, country, mulberry32(s), 12, undefined, sceneOf('rest', choices)))
/** 一個查法的指紋：種類、半徑、關鍵字、openNow。用來比「有沒有改查法」。 */
const sig = (p: LanePlan) => `${p.kind}|${p.radius}|${p.kind === 'text' ? p.textQuery : p.includedTypes.join(',')}|${p.kind === 'text' ? !!p.openNow : false}`

describe('情境選單（STOP 1）', () => {
  it('吃、歇各有 ≥ 5 種預設＋「其他」；第一個欄位就是情境、沒有預設值；其他卡沒有情境', () => {
    for (const m of ['eat', 'rest'] as const) {
      const opts = sceneOptions(m)
      expect(opts.at(-1)).toBe(SCENE_OTHER)
      expect(opts.length - 1).toBeGreaterThanOrEqual(5)
      const f = CARD_BY_ID[m].intake[0]!
      expect(f).toMatchObject({ key: 'scene', type: 'scene', default: '' })
      expect(f.options).toEqual(opts)
    }
    for (const m of ['go', 'attend', 'sleep', 'reply', 'buy', 'travel'] as const) {
      expect(CARD_BY_ID[m].intake.some((f) => f.type === 'scene')).toBe(false)
      expect(sceneOptions(m)).toEqual([])
    }
  })

  it('沒選、選了不認得的、選「其他」沒寫字 → 沒有情境', () => {
    expect(sceneOf('eat', {})).toBeNull()
    expect(sceneOf('eat', { scene: '' })).toBeNull()
    expect(sceneOf('eat', { scene: '不存在' })).toBeNull()
    expect(sceneOf('eat', { scene: SCENE_OTHER })).toBeNull()
    expect(sceneOf('eat', { scene: SCENE_OTHER, sceneText: '   ' })).toBeNull()
    expect(sceneOf('go', { scene: '外帶' })).toBeNull()
  })

  it('手動輸入：去換行與控制字元、合併空白、截 20 字（以字計，不是 UTF-16）', () => {
    expect(sanitizeSceneText('  有\n插座\t\u0007安靜  ')).toBe('有 插座 安靜')
    const long = '吃到飽'.repeat(10)
    expect([...sanitizeSceneText(long)]).toHaveLength(SCENE_TEXT_MAX)
    expect([...sanitizeSceneText('🍜'.repeat(30))]).toHaveLength(SCENE_TEXT_MAX)
    expect(sanitizeSceneText(42)).toBe('')
  })
})

describe('每一種預設都會改查法（STOP 2）', () => {
  it('吃：每種預設的第一次查詢都跟「沒選情境」不一樣，而且只用該情境自己的關鍵字池、半徑照情境', () => {
    const base = new Set(eatPlans({}).map(sig))
    for (const id of sceneOptions('eat').filter((o) => o !== SCENE_OTHER)) {
      const scene = sceneOf('eat', { scene: id })!
      const pool = new Set(scene.rule.queries!.TW.map((q) => q.q))
      const plans = eatPlans({ scene: id })
      for (const p of plans) {
        expect(p.kind, id).toBe('text')
        if (p.kind !== 'text') continue
        expect(pool.has(p.textQuery), `${id}：${p.textQuery}`).toBe(true)
        expect(p.radius, id).toBe(scene.rule.radius)
        expect(p.restrict, id).toBe(true)
        expect(!!p.openNow, id).toBe(!!scene.rule.openNow)
      }
      // 指紋完全沒有重疊 = 查法真的變了
      expect(plans.filter((p) => base.has(sig(p))), id).toHaveLength(0)
      // 關鍵字池至少用到一半（不是卡在同一個）
      expect(new Set(plans.map((p) => (p.kind === 'text' ? p.textQuery : ''))).size, id).toBeGreaterThanOrEqual(Math.ceil(pool.size / 2))
    }
  })

  it('吃（日本）：用日本的關鍵字池', () => {
    for (const id of sceneOptions('eat').filter((o) => o !== SCENE_OTHER)) {
      const pool = new Set(sceneOf('eat', { scene: id })!.rule.queries!.JP.map((q) => q.q))
      for (const p of eatPlans({ scene: id }, 'JP', 60)) expect(p.kind === 'text' && pool.has(p.textQuery), id).toBe(true)
    }
  })

  it('吃：一個人快吃 500 m、宵夜第一次就只要營業中、聚餐與約會半徑較大', () => {
    expect(sceneOf('eat', { scene: '一個人快吃' })!.rule).toMatchObject({ radius: 500, maxWalk: 8 })
    expect(eatPlans({ scene: '宵夜' }).every((p) => p.kind === 'text' && p.openNow === true)).toBe(true)
    expect(eatPlans({}).some((p) => p.kind === 'text' && p.openNow)).toBe(false)
    expect(sceneOf('eat', { scene: '朋友聚餐' })!.rule.radius).toBeGreaterThan(800)
    expect(sceneOf('eat', { scene: '約會吃好一點' })!.rule.radius).toBeGreaterThan(800)
  })

  it('吃：忌口照樣擋關鍵字（不吃牛不排燒肉／牛排／牛丼；不辣不排韓式／泰式）', () => {
    for (const id of ['朋友聚餐', '約會吃好一點', '宵夜', '一個人快吃']) {
      for (const country of ['TW', 'JP'] as const) {
        const qs = eatPlans({ scene: id, diet: '不吃牛' }, country).map((p) => (p.kind === 'text' ? p.textQuery : ''))
        expect(qs.filter((q) => /牛|燒肉|焼肉/.test(q)), `${id} ${country}`).toEqual([])
        const hot = eatPlans({ scene: id, diet: '不辣' }, country).map((p) => (p.kind === 'text' ? p.textQuery : ''))
        expect(hot.filter((q) => /韓|泰|韓国/.test(q)), `${id} ${country}`).toEqual([])
      }
    }
  })

  it('吃：甜食、吃素照原本的 lane（不會派甜食的人去熱炒），只換成情境的半徑', () => {
    for (const p of eatPlans({ scene: '朋友聚餐', taste: '甜食' })) {
      expect(p.radius).toBe(1200)
      if (p.kind === 'text') expect(['甜點', '豆花', '冰店', '麵包店']).toContain(p.textQuery)
      else expect(p.includedTypes.some((t) => ['bakery', 'cafe', 'ice_cream_shop', 'coffee_shop'].includes(t))).toBe(true)
    }
    for (const p of eatPlans({ scene: '一個人快吃', diet: '素' })) {
      expect(p.radius).toBe(500)
      if (p.kind === 'text') expect(['素食', '蔬食']).toContain(p.textQuery)
      else expect(p.lane).toBe('veg')
    }
  })

  it('吃：有預算時只排推估價位對得上的情境關鍵字，並帶 priceLevels', () => {
    const plans = many(100, (s) => pickLane(CARD_BY_ID.eat, { scene: '朋友聚餐' }, undefined, 'TW', mulberry32(s), 19, [2], sceneOf('eat', { scene: '朋友聚餐' })))
    for (const p of plans) {
      expect(p.kind).toBe('text')
      if (p.kind !== 'text') continue
      expect(p.priceLevels).toEqual(['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'])
      const est = sceneOf('eat', { scene: '朋友聚餐' })!.rule.queries!.TW.find((q) => q.q === p.textQuery)!.est
      expect(priceFit(est, [2]), p.textQuery).toBeGreaterThan(0)
    }
  })

  it('吃「其他」：使用者的字＋基本詞就是關鍵字（餐廳／甜點／素食；日本レストラン），第二次保留同一個關鍵字', () => {
    const one = (choices: Record<string, string | number>, country: 'TW' | 'JP' = 'TW') =>
      pickLane(CARD_BY_ID.eat, choices, undefined, country, mulberry32(3), 12, undefined, sceneOf('eat', choices))
    const p = one({ scene: SCENE_OTHER, sceneText: '吃到飽' })
    expect(p).toMatchObject({ kind: 'text', textQuery: '吃到飽 餐廳', radius: 1000, restrict: true, lane: 'scene:其他' })
    expect(one({ scene: SCENE_OTHER, sceneText: '芒果', taste: '甜食' })).toMatchObject({ textQuery: '芒果 甜點' })
    expect(one({ scene: SCENE_OTHER, sceneText: '咖哩', diet: '素' })).toMatchObject({ textQuery: '咖哩 素食' })
    expect(one({ scene: SCENE_OTHER, sceneText: '個室' }, 'JP')).toMatchObject({ textQuery: '個室 レストラン' })
    expect(eatOtherQuery('安靜', {}, 'other')).toBe('安靜 restaurant')
    const w = widenPlan(p, { country: 'TW', rng: mulberry32(1), words: ['不該用到'] })
    expect(w).toMatchObject({ kind: 'text', textQuery: '吃到飽 餐廳', radius: 2500, openNow: true })
  })

  it('歇：每種預設都改查法（修飾詞或半徑）；「其他」＝使用者的字＋喝什麼', () => {
    const drinks = ['咖啡', '酒吧', '居酒屋', '熱炒燒烤']
    for (const id of sceneOptions('rest').filter((o) => o !== SCENE_OTHER)) {
      // 至少咖啡（預設）時，查法跟沒選情境不一樣
      const base = new Set(restPlans({ drink: '咖啡' }).map(sig))
      expect(restPlans({ scene: id, drink: '咖啡' }).filter((p) => base.has(sig(p))), id).toHaveLength(0)
      for (const d of drinks) for (const p of restPlans({ scene: id, drink: d }, 'TW', 5)) expect(p.radius, `${id} ${d}`).toBe(sceneOf('rest', { scene: id })!.rule.radius)
    }
    expect(restPlans({ scene: '工作讀書', drink: '咖啡' })[0]).toMatchObject({ textQuery: '不限時 咖啡廳' })
    expect(restPlans({ scene: '工作讀書', drink: '咖啡' }, 'JP')[0]).toMatchObject({ textQuery: '電源 カフェ' }) // Round 7：日本用日文基本詞
    expect(restPlans({ scene: '談事情', drink: '酒吧' })[0]).toMatchObject({ textQuery: '安靜 酒吧' })
    // 不適合的組合不加修飾詞（熱炒不會「不限時」）
    expect(restPlans({ scene: '工作讀書', drink: '熱炒燒烤' })[0]).toMatchObject({ textQuery: '熱炒 燒烤' })
    expect(restPlans({ scene: SCENE_OTHER, sceneText: '有插座', drink: '咖啡' })[0]).toMatchObject({ textQuery: '有插座 咖啡廳' })
    expect(restQuery(null, '咖啡', '咖啡廳', 'TW')).toBe('咖啡廳')
  })

  it('第二次（擴大）：一般餐廳的通用關鍵字換成情境自己的；400 退路仍用通用的「餐廳」', () => {
    const scene = sceneOf('eat', { scene: '朋友聚餐' })
    const first = eatPlans({ scene: '朋友聚餐' })[0]!
    const words = sceneWiden(scene, 'TW')!
    expect(words).toEqual(['餐廳', '熱炒', '火鍋'])
    for (let s = 1; s <= 30; s++) {
      const w = widenPlan(first, { country: 'TW', rng: mulberry32(s), words })
      expect(w.kind === 'text' && words.includes(w.textQuery)).toBe(true)
    }
    const quick = widenPlan(eatPlans({ scene: '一個人快吃' })[0]!, { country: 'TW', rng: mulberry32(2), words: sceneWiden(sceneOf('eat', { scene: '一個人快吃' }), 'TW') })
    expect(quick.kind === 'text' && ['小吃', '便當', '麵店'].includes(quick.textQuery)).toBe(true)
    const forced = widenPlan(first, { country: 'TW', forceRestaurant: true, words })
    expect(forced).toMatchObject({ textQuery: '餐廳' })
    expect(sceneWiden(sceneOf('rest', { scene: '工作讀書' }), 'TW')).toBeUndefined()
    expect(sceneWiden(scene, 'other')).toBeUndefined()
  })

  it('情境關鍵字有推估價位（laneEst 查得到，畫面才標得出「推估」）', async () => {
    const { laneEst } = await import('../../src/lanes.ts')
    for (const q of SCENE_QUERIES) expect(laneEst(`q:${q.q}`), q.q).toBeTypeOf('number')
  })
})

describe('挑店前的情境篩選', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'restaurant', types: ['restaurant'], ...extra }) as PlaceCandidate

  it('聚餐／約會排除主類別是速食、超商的店；只是 types 裡順帶有 fast_food 的正餐店不排除', () => {
    const scene = sceneOf('eat', { scene: '朋友聚餐' })
    const cands = [c('mc', { primaryType: 'fast_food_restaurant' }), c('711', { primaryType: 'convenience_store' }), c('ramen', { primaryType: 'ramen_restaurant', types: ['ramen_restaurant', 'fast_food_restaurant'] })]
    expect(sceneFilter(cands, scene).kept.map((x) => x.id)).toEqual(['ramen'])
  })

  it('約會排除評分 < 4.3；快吃排除步行 > 8 分；沒有資料的不排除', () => {
    const date = sceneOf('eat', { scene: '約會吃好一點' })
    expect(scenePasses(c('a', { rating: 4.2 }), date)).toBe(false)
    expect(scenePasses(c('b', { rating: 4.3 }), date)).toBe(true)
    expect(scenePasses(c('c', { rating: undefined }), date)).toBe(true)
    const quick = sceneOf('eat', { scene: '一個人快吃' })
    expect(scenePasses(c('d', { walkMin: 9 }), quick)).toBe(false)
    expect(scenePasses(c('e', { walkMin: 8 }), quick)).toBe(true)
    expect(scenePasses(c('f', { walkMin: 30 }), null)).toBe(true)
  })

  it('篩完一家都不剩 → 整批放回（寧可派得到），relaxed=true', () => {
    const quick = sceneOf('eat', { scene: '一個人快吃' })
    const far = [c('x', { walkMin: 15 }), c('y', { walkMin: 12 })]
    expect(sceneFilter(far, quick)).toEqual({ kept: far, relaxed: true })
    expect(sceneFilter([], quick)).toEqual({ kept: [], relaxed: false })
    expect(sceneFilter(far, null)).toEqual({ kept: far, relaxed: false })
  })
})

describe('口令對得上情境', () => {
  const pick = { place: { id: 'p1', name: '阿財魯肉飯', walkMin: 5 }, mode: 'new', visits: 1, pool: 5, afterFilter: 5, relaxed: [], exhausted: false, seen14d: false } as unknown as PickResult
  const req = (choices: Record<string, string | number>, module: 'eat' | 'rest' = 'eat'): OrderRequest =>
    ({ module, level: 1, choices, now: '2026-11-01T12:00:00+08:00', recentOrders: [] }) as OrderRequest

  it('prompt 帶情境一行；「其他」帶使用者的字；沒選情境不帶', () => {
    expect(buildOrderPrompt(req({ scene: '外帶' }), pick).user).toContain('情境：外帶')
    expect(buildOrderPrompt(req({ scene: '工作讀書', drink: '咖啡' }, 'rest'), pick).user).toContain('插座')
    expect(buildOrderPrompt(req({ scene: SCENE_OTHER, sceneText: '有插座' }), pick).user).toContain('「有插座」')
    expect(buildOrderPrompt(req({}), pick).user).not.toContain('情境：')
    // 聚餐、約會不催（preview 實測 2026-11-01：卡片規則逼模型寫「30 分鐘內吃完」）
    for (const id of ['朋友聚餐', '約會吃好一點']) expect(buildOrderPrompt(req({ scene: id }), pick).user).toContain('不准催')
    expect(buildOrderPrompt(req({ scene: '外帶' }), pick).system).toContain('聚餐、約會不催')
  })

  it('模板口令（Claude 失敗時）也照情境寫：外帶不寫在店裡吃完、聚餐寫一起分、工作讀書寫插座', () => {
    const tz = 'Asia/Taipei' as never
    const now = new Date('2026-11-01T12:00:00+08:00')
    const steps = (choices: Record<string, string | number>, module: 'eat' | 'rest' = 'eat') => templateOrder(req(choices, module), pick, now, tz).steps.join('／')
    expect(steps({ scene: '外帶' })).toContain('外帶')
    expect(steps({ scene: '外帶' })).not.toMatch(/店裡|內用/)
    expect(steps({ scene: '朋友聚餐' })).toContain('一起分')
    expect(steps({ scene: '一個人快吃' })).toContain('只點一道')
    expect(steps({ scene: '工作讀書', drink: '咖啡' }, 'rest')).toContain('插座')
    // 喝酒的安全規則優先於情境
    expect(steps({ scene: '談事情', drink: '酒吧' }, 'rest')).toContain('不准開車騎車')
    for (const id of [...sceneOptions('eat'), ...sceneOptions('rest')]) {
      for (const s of templateOrder(req({ scene: id, drink: '咖啡' }, sceneOptions('eat').includes(id) ? 'eat' : 'rest'), pick, now, tz).steps) expect([...s].length, s).toBeLessThanOrEqual(22)
    }
  })
})

describe('沒做／不符合情境：不罰、不扣服從率，紀錄照記（STOP 4）', () => {
  const e = (outcome: DiaryEntry['outcome'], i: number): DiaryEntry => ({ id: `e${i}`, ts: `2026-11-01T1${i}:00:00+08:00`, module: 'eat', level: 1, big: 'x', outcome })

  it('服從率分母不含 mismatch；罰則不含 mismatch；口令數照算', () => {
    const s = stats([e('done', 1), e('mismatch', 2), e('mismatch', 3), e('punished', 4)])
    expect(s).toMatchObject({ orders: 4, complianceRate: 50, punishments: 1 })
    expect(stats([e('mismatch', 1)])).toMatchObject({ orders: 1, complianceRate: 100, punishments: 0, weakestModule: null })
  })

  it('試用紀錄摘要：mismatch 次數、依情境分的成績', () => {
    const t = (scene: string, outcome?: DiaryEntry['outcome'], module: 'eat' | 'rest' = 'eat'): TrialEntry =>
      ({ at: '2026-11-01T12:00:00.000Z', module, level: 1, ok: true, placeId: 'p', choices: { scene }, ...(outcome ? { outcome } : {}) })
    const s = summarize([t('外帶', 'done'), t('外帶', 'mismatch'), t('宵夜', 'punished'), t('工作讀書', 'mismatch', 'rest'), t('外帶')])
    expect(s.mismatch).toBe(2)
    expect(s.byScene['eat:外帶']).toEqual({ orders: 3, done: 1, reissued: 0, punished: 0, mismatch: 1 })
    expect(s.byScene['eat:宵夜']).toMatchObject({ orders: 1, punished: 1 })
    expect(s.byScene['rest:工作讀書']).toMatchObject({ orders: 1, mismatch: 1 })
  })
})

// ── handler：情境真的接上伺服器 ─────────────────────────────────────
const handler = api.fetch
const ORDER_JSON = JSON.stringify({
  verdict: 'do', meme: { top: '去吃', big: '店', bot: '照做' }, steps: ['點一道。'], place: { id: '', name: '' }, log: '12:00 口令。',
})
const claudeOk = () => new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER_JSON }] }), { status: 200 })
const LOC = { lat: 25.033, lng: 121.5654 }
/** 往東 n 公尺的店（walkMin = ceil(n/80)）。 */
const at = (id: string, meters: number, extra: Partial<RawPlace> = {}): RawPlace => ({
  id, displayName: { text: `店${id}` }, location: { latitude: LOC.lat, longitude: LOC.lng + meters / (111_320 * Math.cos((LOC.lat * Math.PI) / 180)) },
  currentOpeningHours: { openNow: true }, rating: 4.5, userRatingCount: 100, primaryType: 'restaurant', types: ['restaurant'], ...extra,
})
const post = (body: Partial<OrderRequest>) => new Request('http://localhost/api/order', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ module: 'eat', level: 1, choices: {}, loc: LOC, now: '2026-11-01T12:00:00+08:00', recentOrders: [], ...body }),
})
type Body = Order & { debug: OrderDebug }

describe('handler 接上情境', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  const stub = (pages: RawPlace[][]) => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('anthropic')) return claudeOk()
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(JSON.stringify({ places: pages[bodies.length - 1] ?? [] }), { status: 200 })
    }))
    return bodies
  }

  it('一個人快吃：第一次只查 ±500 m 方框；5 家都超過 8 分 → 仍打第二次（情境自己的關鍵字），派 8 分內的那家（20 個種子）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const far = [1, 2, 3, 4, 5].map((n) => at(`far${n}`, 900 + n * 20))
      const bodies = stub([far, [at('near', 400)]])
      const res = await handler(post({ choices: { scene: '一個人快吃' }, seed }))
      expect(res.status, `seed ${seed}`).toBe(200)
      const body = (await res.json()) as Body
      const [first, second] = bodies as { textQuery: string; locationRestriction: { rectangle: { high: { latitude: number } } } }[]
      expect(first!.locationRestriction.rectangle.high.latitude - LOC.lat).toBeCloseTo(500 / 111_320, 5)
      expect(['便當', '麵店', '小吃', '滷肉飯', '水餃 鍋貼', '丼飯', '咖哩飯']).toContain(first!.textQuery)
      expect(['小吃', '便當', '麵店']).toContain(second!.textQuery)
      expect(body.place?.id, `seed ${seed}`).toBe('near')
      expect(body.place!.walkMin).toBeLessThanOrEqual(8)
      // Round 6 checker：方框查到但離起點 > 半徑（500 m）的 5 家在進情境篩選前就被切掉（切回圓），所以 total 從 6 變 1。
      expect(body.debug.scene).toMatchObject({ id: '一個人快吃', kept: 1, total: 1, relaxed: false })
    }
  })

  it('朋友聚餐：速食店、超商 0 次被派（20 個種子）；只剩速食時才放回並標 relaxed', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const page = [at('mc', 200, { primaryType: 'fast_food_restaurant' }), at('711', 150, { primaryType: 'convenience_store' }), at('hotpot', 600, { primaryType: 'hot_pot_restaurant', rating: 4.1 })]
      stub([page, []])
      const body = (await (await handler(post({ choices: { scene: '朋友聚餐' }, seed }))).json()) as Body
      expect(body.place?.id, `seed ${seed}`).toBe('hotpot')
    }
    stub([[at('mc', 200, { primaryType: 'fast_food_restaurant' })], []])
    const body = (await (await handler(post({ choices: { scene: '朋友聚餐' }, seed: 1 }))).json()) as Body
    expect(body.place?.id).toBe('mc')
    expect(body.debug.scene).toMatchObject({ relaxed: true })
  })

  it('宵夜：第一次就帶 openNow', async () => {
    const bodies = stub([[1, 2, 3, 4, 5].map((n) => at(`s${n}`, n * 50))])
    const res = await handler(post({ choices: { scene: '宵夜' }, seed: 4, now: '2026-11-01T23:40:00+08:00' }))
    expect(res.status).toBe(200)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ openNow: true })
  })

  it('「其他」：使用者的字進關鍵字、進口令的 prompt，不進伺服器 log；入口先清洗（控制字元、20 字）', async () => {
    const bodies = stub([[1, 2, 3, 4, 5].map((n) => at(`o${n}`, n * 50))])
    const prompts: string[] = []
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const inner = f.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    f.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('anthropic')) prompts.push(String(init?.body ?? ''))
      return inner(url, init)
    })
    const text = `有插座\n${'安靜'.repeat(20)}`
    const res = await handler(post({ choices: { scene: SCENE_OTHER, sceneText: text }, seed: 2 }))
    expect(res.status).toBe(200)
    const clean = sanitizeSceneText(text)
    expect(bodies[0]).toMatchObject({ textQuery: `${clean} 餐廳` })
    expect(prompts.join('')).toContain(clean)
    const logs = [...(console.info as unknown as ReturnType<typeof vi.fn>).mock.calls, ...(console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls].map((c) => String(c[0])).join('\n')
    expect(logs).toContain('scene=其他')
    expect(logs).not.toContain('有插座')
    const body = (await res.json()) as Body
    expect(body.debug.scene).toMatchObject({ id: SCENE_OTHER, text: clean })
    expect(sanitizeRequest({ module: 'eat', choices: { scene: SCENE_OTHER, sceneText: ' \n ' } } as unknown as OrderRequest).choices).toEqual({ scene: SCENE_OTHER })
  })

  it('沒選情境：照舊（舊版前端相容），debug 沒有 scene', async () => {
    stub([[1, 2, 3, 4, 5].map((n) => at(`n${n}`, n * 50))])
    const res = await handler(post({ choices: { diet: '都可以' }, seed: 3 }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as Body).debug.scene).toBeUndefined()
  })
})

describe('checker 2026-11-01 第 1 輪的修正', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.6, primaryType: 'restaurant', types: ['restaurant'], ...extra }) as PlaceCandidate

  it('約會、聚餐排除甜點蛋糕店（內湖：法式料理 → 法式甜點蛋糕店）；選「甜食」時不排除', () => {
    const cake = c('aposo', { primaryType: 'cake_shop' })
    for (const id of ['約會吃好一點', '朋友聚餐']) {
      expect(scenePasses(cake, sceneOf('eat', { scene: id })), id).toBe(false)
      expect(scenePasses(cake, sceneOf('eat', { scene: id, taste: '甜食' })), `${id}＋甜食`).toBe(true)
      expect(scenePasses(c('bakery', { primaryType: 'bakery' }), sceneOf('eat', { scene: id, taste: '甜食' })), `${id}＋甜食 bakery`).toBe(true)
      // 速食、超商照樣排除
      expect(scenePasses(c('mc', { primaryType: 'fast_food_restaurant' }), sceneOf('eat', { scene: id, taste: '甜食' })), id).toBe(false)
    }
  })

  it('歇選咖啡：排除酒吧類（板橋：「安靜 咖啡廳」撞到「安靜小酒館」）；選酒吧、居酒屋時不排除', () => {
    const bar = c('quiet-bar', { primaryType: 'bar' })
    for (const id of sceneOptions('rest')) {
      const ch = { scene: id, drink: '咖啡', ...(id === SCENE_OTHER ? { sceneText: '安靜' } : {}) }
      expect(scenePasses(bar, sceneOf('rest', ch)), id).toBe(false)
      expect(scenePasses(c('cafe', { primaryType: 'cafe' }), sceneOf('rest', ch)), id).toBe(true)
      expect(scenePasses(bar, sceneOf('rest', { ...ch, drink: '酒吧' })), `${id}＋酒吧`).toBe(true)
    }
    expect(scenePasses(c('izakaya', { primaryType: 'japanese_izakaya_restaurant' }), sceneOf('rest', { scene: '談事情', drink: '居酒屋' }))).toBe(true)
  })

  it('歇的工作讀書、朋友聊天、談事情：步行 > 15 分不算（內湖：工作讀書派到步行 34 分）', () => {
    for (const id of ['工作讀書', '朋友聊天', '談事情']) {
      expect(scenePasses(c('far', { walkMin: 34, primaryType: 'cafe' }), sceneOf('rest', { scene: id, drink: '咖啡' })), id).toBe(false)
      expect(scenePasses(c('near', { walkMin: 15, primaryType: 'cafe' }), sceneOf('rest', { scene: id, drink: '咖啡' })), id).toBe(true)
    }
  })

  it('宵夜：還沒開門的店（有 opensAt）不算；其他情境不管', () => {
    expect(scenePasses(c('later', { opensAt: '23:00' }), sceneOf('eat', { scene: '宵夜' }))).toBe(false)
    expect(scenePasses(c('open'), sceneOf('eat', { scene: '宵夜' }))).toBe(true)
    expect(scenePasses(c('later', { opensAt: '23:00' }), sceneOf('eat', { scene: '朋友聚餐' }))).toBe(true)
    // Round 10：外帶、快吃也要到店時開著（checker 2026-11-04 09:07）
    expect(scenePasses(c('later', { opensAt: '23:00' }), sceneOf('eat', { scene: '外帶' }))).toBe(false)
  })

  it('prompt 給當地時間，不給 UTC（內湖：當地 19:32 卻寫「11:52 前吃完」）', () => {
    const base = { module: 'eat', level: 1, choices: { scene: '宵夜' }, recentOrders: [] } as unknown as OrderRequest
    const tw = buildOrderPrompt({ ...base, now: '2026-11-01T11:32:00.000Z', loc: { lat: 25.079, lng: 121.575 } }, null).user
    expect(tw).toContain('現在時間：2026-11-01 19:32（台灣當地時間）')
    expect(tw).not.toContain('11:32:00')
    const jp = buildOrderPrompt({ ...base, now: '2026-11-01T11:32:00.000Z', loc: { lat: 35.6795, lng: 139.77 } }, null, 'JP').user
    expect(jp).toContain('現在時間：2026-11-01 20:32（日本當地時間）')
  })
})

describe('不合法的鐘點自動進位（內湖：「19:67分一到立刻起身」）', () => {
  it('分鐘 ≥ 60 進位、小時 ≥ 24 繞回；合法的不動', async () => {
    const { fixClock, enforceRules } = await import('../../src/rules.ts')
    expect(fixClock('19:67分一到立刻起身')).toBe('20:07分一到立刻起身')
    expect(fixClock('23:75 前回家')).toBe('00:15 前回家')
    expect(fixClock('24:10 打烊')).toBe('00:10 打烊')
    expect(fixClock('19：90 前')).toBe('20：30 前')
    expect(fixClock('19:52 走人，20:10 前吃完')).toBe('19:52 走人，20:10 前吃完')
    expect(fixClock('步行 13 分鐘')).toBe('步行 13 分鐘')
    const o = enforceRules({ verdict: 'do', meme: { top: '等人', big: '咖啡', bot: '19:67 收隊' }, steps: ['坐滿20分鐘', '19:67分一到立刻起身'], log: '19:47 口令。' }, 'rest', {}, new Date('2026-11-01T11:47:00Z'), [])
    expect(o.steps[1]).toBe('20:07分一到立刻起身')
    expect(o.meme.bot).toBe('20:07 收隊')
  })
})

describe('checker 第 2 輪：快打烊的店、快吃派到燒肉店', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.6, primaryType: 'cafe', types: ['cafe'], ...extra }) as PlaceCandidate

  it('還剩幾分鐘關門：優先用 nextCloseTime；沒有就用營業到 HH:MM（跨午夜 +24h）；沒資料 → undefined', async () => {
    const { minutesUntilClose, toCandidates } = await import('../../src/places.ts')
    const now = new Date('2026-11-01T11:53:00Z') // 台北 19:53
    expect(minutesUntilClose({ currentOpeningHours: { openNow: true, nextCloseTime: '2026-11-01T12:00:00Z' } }, now, '20:00', 'Asia/Taipei')).toBe(7)
    expect(minutesUntilClose({}, now, '20:00', 'Asia/Taipei')).toBe(7)
    expect(minutesUntilClose({}, now, '02:00', 'Asia/Taipei')).toBe(367)
    expect(minutesUntilClose({}, now, undefined, 'Asia/Taipei')).toBeUndefined()
    const [cand] = toCandidates([{ id: 'r', displayName: { text: 'RUFOUS' }, location: { latitude: 25.0265, longitude: 121.543 }, currentOpeningHours: { openNow: true, nextCloseTime: '2026-11-01T12:00:00Z' } }], { lat: 25.0265, lng: 121.543 }, now, [], 'Asia/Taipei')
    expect(cand!.closeInMin).toBe(7)
  })

  it('久坐的情境：走到店後至少還要營業夠久（放空 40、聊天 60、談事情 60、工作讀書 90、聚餐 90、約會 90）', () => {
    const need: [string, 'eat' | 'rest', number][] = [['一個人放空', 'rest', 40], ['朋友聊天', 'rest', 60], ['談事情', 'rest', 60], ['工作讀書', 'rest', 90], ['朋友聚餐', 'eat', 90], ['約會吃好一點', 'eat', 90], ['宵夜', 'eat', 30], ['一個人快吃', 'eat', 25], ['等人', 'rest', 25]]
    for (const [id, m, min] of need) {
      const scene = sceneOf(m, { scene: id, drink: '咖啡' })
      const base = m === 'eat' ? { primaryType: 'restaurant', types: ['restaurant'] } : {}
      expect(scenePasses(c('short', { ...base, closeInMin: min + 5 - 1, walkMin: 5 }), scene), `${id} 差 1 分`).toBe(false)
      expect(scenePasses(c('ok', { ...base, closeInMin: min + 5, walkMin: 5 }), scene), `${id} 剛好`).toBe(true)
      expect(scenePasses(c('unknown', { ...base, walkMin: 5 }), scene), `${id} 沒資料`).toBe(true)
    }
  })

  it('一個人快吃不派燒肉、火鍋、吃到飽、居酒屋', () => {
    const quick = sceneOf('eat', { scene: '一個人快吃' })
    for (const t of ['yakiniku_restaurant', 'korean_barbecue_restaurant', 'hot_pot_restaurant', 'buffet_restaurant', 'japanese_izakaya_restaurant']) {
      expect(scenePasses(c(t, { primaryType: t, walkMin: 5 }), quick), t).toBe(false)
    }
    expect(scenePasses(c('udon', { primaryType: 'japanese_restaurant', walkMin: 5 }), quick)).toBe(true)
  })

  it('prompt 的情境提示寫久坐的最短時間', () => {
    const pick = { place: { id: 'p', name: 'x' }, mode: 'new', visits: 1, pool: 1, afterFilter: 1, relaxed: [], exhausted: false, seen14d: false } as unknown as PickResult
    const u = (scene: string) => buildOrderPrompt({ module: 'rest', level: 1, choices: { scene, drink: '咖啡' }, now: '2026-11-01T11:53:00Z', recentOrders: [] } as unknown as OrderRequest, pick).user
    expect(u('工作讀書')).toContain('90 分鐘以上')
    expect(u('朋友聊天')).toContain('60 分鐘以上')
    expect(u('一個人放空')).toContain('30 分鐘以上')
  })
})

describe('handler：快打烊的店不派給久坐的情境', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('工作讀書：5 家 20 分後關、1 家 3 小時後關 → 派 3 小時那家（20 個種子）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const soon = [1, 2, 3, 4, 5].map((n) => at(`soon${n}`, n * 60, { primaryType: 'cafe', types: ['cafe'], currentOpeningHours: { openNow: true, nextCloseTime: '2026-11-01T12:20:00Z' } }))
      const late = at('late', 400, { primaryType: 'cafe', types: ['cafe'], currentOpeningHours: { openNow: true, nextCloseTime: '2026-11-01T15:00:00Z' } })
      const bodies: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('anthropic')) return claudeOk()
        bodies.push(String(init?.body ?? ''))
        return new Response(JSON.stringify({ places: bodies.length === 1 ? [...soon, late] : [] }), { status: 200 })
      }))
      const res = await handler(post({ module: 'rest', choices: { scene: '工作讀書', drink: '咖啡' }, now: '2026-11-01T12:00:00Z', seed }))
      const body = (await res.json()) as Body
      expect(body.place?.id, `seed ${seed}`).toBe('late')
      expect(bodies.length, 'fitCount 只算營業夠久的 → 打第二次').toBe(2)
    }
  })
})

describe('鐘點照伺服器算的時間（preview-5：大安 20:11 寫「23:11 前到店」、東京聚餐約會寫「21:30 前吃完」）', () => {
  it('sceneTimes：到店＝現在＋步行；久坐的最早離開＝到店＋停留（不超過關門）', async () => {
    const { sceneTimes, sceneTimesLine, hm } = await import('../../src/scene.ts')
    const t = sceneTimes(sceneOf('eat', { scene: '朋友聚餐' }), '21:11', 3, 109)!
    expect([hm(t.now), hm(t.arrive), hm(t.leave!), hm(t.close!)]).toEqual(['21:11', '21:14', '22:44', '23:00'])
    const short = sceneTimes(sceneOf('eat', { scene: '約會吃好一點' }), '21:11', 13, 95)!
    expect(hm(short.leave!)).toBe('22:46') // 被關門時間截住
    expect(sceneTimes(sceneOf('eat', { scene: '一個人快吃' }), '20:11', 3, 79)!.leave).toBeUndefined()
    expect(sceneTimesLine(t)).toContain('不得早於 22:44')
    expect(sceneTimesLine(t)).toContain('走到店 21:14')
    expect(sceneTimes(null, '21:11', 3, 109)).toBeNull()
  })

  it('fixSceneClock：明顯算錯的改成到店或關門；久坐的離開時間不得太早；開門關門的鐘點不碰', async () => {
    const { sceneTimes, fixSceneClock } = await import('../../src/scene.ts')
    const quick = sceneTimes(sceneOf('eat', { scene: '一個人快吃' }), '20:11', 3, 79)
    expect(fixSceneClock('現在出發，23:11前到店', quick)).toBe('現在出發，20:14前到店')
    expect(fixSceneClock('19:30 前吃完', quick)).toBe('21:30 前吃完') // 比現在早 → 改成關門
    expect(fixSceneClock('20:30 前吃完', quick)).toBe('20:30 前吃完') // 合理的不動
    expect(fixSceneClock('營業到 21:30，21:00 關門', quick)).toBe('營業到 21:30，21:00 關門')
    const party = sceneTimes(sceneOf('eat', { scene: '朋友聚餐' }), '21:11', 3, 109)
    expect(fixSceneClock('21:30前吃完，該撤', party)).toBe('22:44前吃完，該撤')
    expect(fixSceneClock('21:20 出發', party)).toBe('21:20 出發') // 出發時間不是離開時間
    expect(fixSceneClock('22:50 前離開', party)).toBe('22:50 前離開')
    const date = sceneTimes(sceneOf('eat', { scene: '約會吃好一點' }), '21:11', 13, 109)
    expect(fixSceneClock('21:30前吃完出店', date)).toBe('22:54前吃完出店')
    const work = sceneTimes(sceneOf('rest', { scene: '工作讀書', drink: '咖啡' }), '20:11', 9, 109)
    expect(fixSceneClock('20:30 前必須離開', work)).toBe('20:30 前必須離開') // 「前必須離開」不在離開語境清單 → 不動（保守）
    expect(fixSceneClock('20:30 前離開', work)).toBe('21:50 前離開')
  })

  it('enforceRules 會套用（有 pick、有情境時）；prompt 帶【已算好】那一行', async () => {
    const { enforceRules } = await import('../../src/rules.ts')
    const pick = { place: { id: 'p', name: '炭火焼肉', walkMin: 3, closeInMin: 109 }, mode: 'new', visits: 1, pool: 1, afterFilter: 1, relaxed: [], exhausted: false, seen14d: false } as unknown as PickResult
    const o = enforceRules({ verdict: 'do', meme: { top: '班長下令', big: '炭火焼肉', bot: '90分鐘內搞定' }, steps: ['一起夾著吃', '21:30前吃完，該撤'], place: { id: '', name: '' }, log: '21:11 口令。' }, 'eat', { scene: '朋友聚餐' }, new Date('2026-11-01T12:11:00Z'), [], { level: 1, country: 'JP', pick })
    expect(o.steps[1]).toBe('22:44前吃完，該撤')
    const u = buildOrderPrompt({ module: 'eat', level: 1, choices: { scene: '朋友聚餐' }, now: '2026-11-01T12:11:00Z', loc: { lat: 35.6795, lng: 139.77 }, recentOrders: [] } as unknown as OrderRequest, pick, 'JP').user
    expect(u).toContain('【已算好】現在 21:11，走到店 21:14，店 23:00 關')
  })
})

// Round 7（Cross 2026-11-02「開始修東京「歇」的關鍵字」）：日本的歇用日文基本詞；水煙吧、購物中心不派。
import { SHISHA_RE, restBase } from '../../src/scene.ts'
describe('Round 7：東京的歇', () => {
  it('基本詞依國家換語言：日本 咖啡廳→カフェ、酒吧→バー、居酒屋→居酒屋、熱炒 燒烤→焼き鳥；台灣與其他地方不動', () => {
    expect(restBase('咖啡廳', 'JP')).toBe('カフェ')
    expect(restBase('酒吧', 'JP')).toBe('バー')
    expect(restBase('居酒屋', 'JP')).toBe('居酒屋')
    expect(restBase('熱炒 燒烤', 'JP')).toBe('焼き鳥')
    expect(restBase('咖啡廳', 'TW')).toBe('咖啡廳')
    expect(restBase('咖啡廳', 'other')).toBe('咖啡廳')
    expect(restBase('不認得的字', 'JP')).toBe('不認得的字')
  })
  it('pickLane：日本的查詞全是日文（含修飾詞、其他），台灣一字不改', () => {
    const jp = (choices: Record<string, string | number>) => restPlans(choices, 'JP', 1)[0]!
    expect(jp({ scene: '一個人放空', drink: '咖啡' })).toMatchObject({ textQuery: 'カフェ', lane: 'text:カフェ@一個人放空' })
    expect(jp({ scene: '工作讀書', drink: '咖啡' })).toMatchObject({ textQuery: '電源 カフェ' })
    expect(jp({ scene: '談事情', drink: '咖啡' })).toMatchObject({ textQuery: '静か カフェ' })
    expect(jp({ scene: '談事情', drink: '酒吧' })).toMatchObject({ textQuery: '静か バー' })
    expect(jp({ scene: '朋友聊天', drink: '居酒屋' })).toMatchObject({ textQuery: '居酒屋' })
    expect(jp({ scene: '朋友聊天', drink: '熱炒燒烤' })).toMatchObject({ textQuery: '焼き鳥' })
    // Round 10：「其他」手打的中文需求在日本也換成日文（有插座 → 電源）。
    expect(jp({ scene: SCENE_OTHER, sceneText: '有插座', drink: '咖啡' })).toMatchObject({ textQuery: '電源 カフェ' })
    expect(jp({ drink: '咖啡' })).toMatchObject({ textQuery: 'カフェ' })
    for (const p of [...restPlans({ scene: '一個人放空', drink: '咖啡' }, 'JP', 20), ...restPlans({ scene: '工作讀書', drink: '咖啡' }, 'JP', 20)]) {
      expect(p.kind === 'text' && /[぀-ヿ]/.test(p.textQuery) && !/咖啡廳/.test(p.textQuery), p.kind === 'text' ? p.textQuery : '').toBe(true)
    }
    expect(restPlans({ scene: '一個人放空', drink: '咖啡' }, 'TW', 1)[0]).toMatchObject({ textQuery: '咖啡廳' })
    expect(restPlans({ scene: '工作讀書', drink: '咖啡' }, 'TW', 1)[0]).toMatchObject({ textQuery: '不限時 咖啡廳' })
    expect(restPlans({ scene: '談事情', drink: '酒吧' }, 'TW', 1)[0]).toMatchObject({ textQuery: '安靜 酒吧' })
    expect(restPlans({ scene: '朋友聊天', drink: '熱炒燒烤' }, 'TW', 1)[0]).toMatchObject({ textQuery: '熱炒 燒烤' })
  })
  it('第二次（擴大）保留同一個日文關鍵字', () => {
    const first = restPlans({ scene: '談事情', drink: '咖啡' }, 'JP', 1)[0]!
    expect(widenPlan(first, { country: 'JP', rng: mulberry32(1) })).toMatchObject({ kind: 'text', textQuery: '静か カフェ', radius: 2500, openNow: true })
  })
  it('歇的篩選：水煙吧（type）、購物中心、百貨不派；選咖啡時店名有シーシャ／shisha 的也不派（即使 type=cafe）', () => {
    const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
      ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'cafe', types: ['cafe'], ...extra }) as PlaceCandidate
    const coffee = sceneOf('rest', { scene: '一個人放空', drink: '咖啡' })
    const cands = [
      c('アラビアン カフェ&バー', { primaryType: 'hookah_bar' }),
      c('新宿サザンテラス', { primaryType: 'shopping_mall' }),
      c('伊勢丹', { primaryType: 'department_store' }),
      c('shisha cafe and bar NAROZ 歌舞伎町店'),
      c('新宿シーシャ Shisha Cafe 紅洛煙'),
      c('コメダ珈琲店'),
      c('マクドナルド', { primaryType: 'fast_food_restaurant' }),
    ]
    expect(sceneFilter(cands, coffee).kept.map((x) => x.id)).toEqual(['コメダ珈琲店', 'マクドナルド'])
    // 選酒吧：水煙吧、購物中心仍不派；酒吧類與店名不擋
    const bar = sceneOf('rest', { scene: '朋友聊天', drink: '酒吧' })
    expect(sceneFilter([...cands, c('Bar Vier', { primaryType: 'bar' })], bar).kept.map((x) => x.id)).toEqual(['shisha cafe and bar NAROZ 歌舞伎町店', '新宿シーシャ Shisha Cafe 紅洛煙', 'コメダ珈琲店', 'マクドナルド', 'Bar Vier'])
    // Round 12（Cross 2026-11-05「全部處理完之後一次上線」：已知未修「歇整批放回派到水煙吧」）：
    // 附近只剩水煙吧、購物中心 → 不再整批放回，交給超商救援（原本 Round 7 是整批放回）
    const only = cands.slice(0, 2)
    expect(sceneFilter(only, coffee)).toEqual({ kept: [], relaxed: false })
    // 只剩的那批裡有一家類型對、只是評分／步行／營業時間不夠 → 放回的只有那家
    const slow = c('ドトール', { walkMin: 30 })
    expect(sceneFilter([...only, slow], sceneOf('rest', { scene: '等人', drink: '咖啡' }))).toEqual({ kept: [slow], relaxed: true })
    expect(SHISHA_RE.test('Hookah Lounge')).toBe(true)
    expect(SHISHA_RE.test('猿田彦珈琲')).toBe(false)
    // 吃的情境不受影響
    expect(scenePasses({ primaryType: 'shopping_mall', rating: 4.5, walkMin: 3 }, sceneOf('eat', { scene: '一個人快吃' }))).toBe(true)
  })
})

// Round 8（Cross 2026-11-03「開始」：補「派錯店」）：歇選咖啡不派卡拉OK、美食街；外帶不派酒吧。
// 店名、type 取自 2026-11-03 01:14–01:19 東京新宿駅深夜量測（state/evidence/r7/scene-shinjuku-night.json）。
import { NOT_COFFEE_RE } from '../../src/scene.ts'
describe('Round 8：派錯店', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'cafe', types: ['cafe'], ...extra }) as PlaceCandidate
  const night = [
    c('カラオケパセラ 新宿靖国通り店', { primaryType: 'karaoke', types: ['karaoke'] }),
    c('新宿カブキhall / 歌舞伎横丁｜Shinjuku Izakaya & Food Court Kabuki Hall', { primaryType: 'restaurant', types: ['restaurant'] }),
    c('某フードコート', { primaryType: 'food_court', types: ['food_court'] }),
    c('珈琲貴族エジンバラ'),
    c('香楽 現 (うつつ) UtuTu'),
  ]
  it('歇選咖啡：卡拉OK（type 或店名）、美食街（type 或店名）、店名有居酒屋的不派；咖啡店照派', () => {
    for (const scene of ['一個人放空', '工作讀書', '朋友聊天', '談事情', '等人']) {
      expect(sceneFilter(night, sceneOf('rest', { scene, drink: '咖啡' })).kept.map((x) => x.id), scene).toEqual(['珈琲貴族エジンバラ', '香楽 現 (うつつ) UtuTu'])
    }
    // 「其他」（自己打字）也一樣
    expect(sceneFilter(night, sceneOf('rest', { scene: SCENE_OTHER, sceneText: '有插座', drink: '咖啡' })).kept).toHaveLength(2)
    // 沒選情境時不篩（照 Round 5 起的行為）
    expect(sceneFilter(night, sceneOf('rest', { drink: '咖啡' })).kept).toHaveLength(5)
    // 店名擋得到美食街；Round 7 的水煙吧照擋；正常咖啡店名不誤擋
    for (const n of ['Shinjuku Izakaya & Food Court Kabuki Hall', '新宿フードコート', '微風美食廣場', '錢櫃KTV', '好樂迪卡拉OK', 'カラオケ館', 'シーシャカフェ', '居酒屋 和民']) expect(NOT_COFFEE_RE.test(n), n).toBe(true)
    for (const n of ['猿田彦珈琲', 'コメダ珈琲店', 'Shinjuku CROSSING cafe&dining', 'ギャップ カフェ 新宿フラッグス店', '路易莎咖啡', 'Cafe & Bar Tokyo', '猫カフェMOCHA']) expect(NOT_COFFEE_RE.test(n), n).toBe(false)
  })
  it('歇選酒吧／居酒屋：卡拉OK、美食街不擋（只在選咖啡時擋）', () => {
    expect(sceneFilter(night, sceneOf('rest', { scene: '朋友聊天', drink: '居酒屋' })).kept).toHaveLength(5)
    expect(sceneFilter(night, sceneOf('rest', { scene: '朋友聊天', drink: '酒吧' })).kept).toHaveLength(5)
  })
  it('Round 12：附近只剩卡拉OK、美食街 → 不再整批放回（類型不對的不放寬），交給超商救援', () => {
    const only = night.slice(0, 3)
    expect(sceneFilter(only, sceneOf('rest', { scene: '等人', drink: '咖啡' }))).toEqual({ kept: [], relaxed: false })
  })
  it('外帶：主類別是酒吧類（bar、pub、居酒屋…）不派；便當、超商、速食照派', () => {
    const takeout = sceneOf('eat', { scene: '外帶' })
    const cands = [
      c('BAR G.O.A.T.(ゴート) 新宿西口店', { primaryType: 'bar', types: ['bar'] }),
      c('HUB 新宿店', { primaryType: 'pub', types: ['pub'] }),
      c('鳥貴族', { primaryType: 'japanese_izakaya_restaurant', types: ['japanese_izakaya_restaurant'] }),
      c('ほっともっと', { primaryType: 'meal_takeaway', types: ['meal_takeaway'] }),
      c('セブン-イレブン', { primaryType: 'convenience_store', types: ['convenience_store'] }),
      c('松屋', { primaryType: 'fast_food_restaurant', types: ['fast_food_restaurant'] }),
      c('ラーメン屋（types 順帶有 bar）', { primaryType: 'ramen_restaurant', types: ['ramen_restaurant', 'bar'] }),
    ]
    expect(sceneFilter(cands, takeout).kept.map((x) => x.id)).toEqual(['ほっともっと', 'セブン-イレブン', '松屋', 'ラーメン屋（types 順帶有 bar）'])
    // 選甜食時一樣擋酒吧
    expect(scenePasses(cands[0]!, sceneOf('eat', { scene: '外帶', taste: '甜食' }))).toBe(false)
    // 附近只剩酒吧 → 整批放回
    expect(sceneFilter(cands.slice(0, 2), takeout)).toEqual({ kept: cands.slice(0, 2), relaxed: true })
    // 其他吃的情境不受影響：宵夜仍可派居酒屋
    expect(scenePasses(cands[2]!, sceneOf('eat', { scene: '宵夜' }))).toBe(true)
  })
})

// Round 10（Cross 2026-11-03「全部產品路線圖做完」）：歇要到店時開門；到店已關門的不派（含整批放回）；
// 約會擋酒吧（Q1）；日本把「其他」的中文需求換成日文；口令不保證有插座（X3）。
import { HARD_OPEN_MIN, localizeNeed, sceneTimes, sceneTimesLine, viable } from '../../src/scene.ts'
describe('Round 10：到店要開著、約會擋酒吧、其他的需求換日文', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'cafe', types: ['cafe'], ...extra }) as PlaceCandidate
  it('viable：到店時剩不到 10 分（或已關）不算；沒有關門資料算', () => {
    expect(HARD_OPEN_MIN).toBe(10)
    expect(viable({ walkMin: 14, closeInMin: 8 })).toBe(false) // checker 22:51 コメダ
    expect(viable({ walkMin: 3, closeInMin: 7 })).toBe(false) // checker 22:52 Caffice
    expect(viable({ walkMin: 5, closeInMin: 15 })).toBe(true)
    expect(viable({ walkMin: 5, closeInMin: 14 })).toBe(false)
    expect(viable({ walkMin: 5 })).toBe(true)
  })
  it('整批放回時也只放回到店時還開著的；連這都沒有 → 空的（交給超商救援）', () => {
    const other = sceneOf('rest', { scene: SCENE_OTHER, sceneText: '有插座', drink: '咖啡' })
    const night = [c('コメダ', { walkMin: 14, closeInMin: 8 }), c('Caffice', { walkMin: 3, closeInMin: 7 }), c('ドトール', { walkMin: 6, closeInMin: 30 })]
    // 剩 24 分 < 情境的 45 分 → 沒有一家過情境；整批放回只放回ドトール
    expect(sceneFilter(night, other)).toEqual({ kept: [night[2]], relaxed: true })
    expect(sceneFilter(night.slice(0, 2), other)).toEqual({ kept: [], relaxed: false })
    // 沒選情境也不派到店已關門的
    expect(sceneFilter(night, null).kept.map((x) => x.id)).toEqual(['ドトール'])
    expect(scenePasses(night[0]!, null)).toBe(false)
  })
  it('歇：走到店時還沒開門的不派（開門時間早於到店的可以）；吃不受影響', () => {
    const rest = sceneOf('rest', { scene: '一個人放空', drink: '咖啡' })
    expect(scenePasses(c('LUKE', { walkMin: 2, opensAt: '10:00', opensInMin: 35 }), rest)).toBe(false) // Round 8 09:25 實測
    expect(scenePasses(c('快開', { walkMin: 6, opensAt: '09:30', opensInMin: 5 }), rest)).toBe(true)
    expect(scenePasses(c('不知何時開', { walkMin: 6, opensAt: '09:30' }), rest)).toBe(false)
    for (const scene of ['工作讀書', '朋友聊天', '談事情', '等人']) expect(sceneOf('rest', { scene, drink: '咖啡' })!.rule.openOnArrival, scene).toBe(true)
    expect(sceneOf('rest', { scene: SCENE_OTHER, sceneText: '安靜', drink: '酒吧' })!.rule.openOnArrival).toBe(true)
    // 吃：即將營業的店照舊可派（Round 4 的設計，早上可以等開門）
    expect(scenePasses(c('早餐', { walkMin: 5, opensAt: '09:30', opensInMin: 20, primaryType: 'restaurant' }), sceneOf('eat', { scene: '朋友聚餐' }))).toBe(true)
    // Round 10（checker 2026-11-04 09:07）：快吃、外帶趕時間，到店時要開著；開門早於到店的可以
    expect(scenePasses(c('早餐', { walkMin: 5, opensAt: '09:30', opensInMin: 20, primaryType: 'restaurant' }), sceneOf('eat', { scene: '一個人快吃' }))).toBe(false)
    expect(scenePasses(c('早餐', { walkMin: 5, opensAt: '09:30', opensInMin: 20, primaryType: 'restaurant' }), sceneOf('eat', { scene: '外帶' }))).toBe(false)
    expect(scenePasses(c('早餐', { walkMin: 5, opensAt: '09:10', opensInMin: 3, primaryType: 'restaurant' }), sceneOf('eat', { scene: '一個人快吃' }))).toBe(true)
    expect(sceneOf('eat', { scene: SCENE_OTHER, sceneText: '吃到飽' })!.rule.openOnArrival).toBeUndefined()
  })
  it('約會吃好一點：酒吧類不派（Q1）；只剩酒吧時整批放回', () => {
    const date = sceneOf('eat', { scene: '約會吃好一點' })
    const cands = [c('Bar Vier', { primaryType: 'bar', types: ['bar'] }), c('鳥貴族', { primaryType: 'japanese_izakaya_restaurant' }), c('イタリアン', { primaryType: 'italian_restaurant' })]
    expect(sceneFilter(cands, date).kept.map((x) => x.id)).toEqual(['イタリアン'])
    expect(sceneFilter(cands.slice(0, 1), date)).toEqual({ kept: cands.slice(0, 1), relaxed: true })
    // 朋友聚餐、宵夜照舊可派居酒屋
    expect(scenePasses(cands[1]!, sceneOf('eat', { scene: '朋友聚餐' }))).toBe(true)
  })
  it('localizeNeed：日本把常見中文需求換成日文；台灣與其他地方不動；不認得的字照留', () => {
    expect(localizeNeed('有插座', 'JP')).toBe('電源')
    expect(localizeNeed('安靜 不限時', 'JP')).toBe('静か 長居')
    expect(localizeNeed('有WiFi', 'JP')).toBe('有Wi-Fi')
    expect(localizeNeed('吃到飽', 'JP')).toBe('食べ放題')
    expect(localizeNeed('看得到海', 'JP')).toBe('看得到海')
    expect(localizeNeed('有插座', 'TW')).toBe('有插座')
    expect(localizeNeed('有插座', 'other')).toBe('有插座')
    expect(eatOtherQuery('吃到飽', {}, 'JP')).toBe('食べ放題 レストラン')
    expect(eatOtherQuery('吃到飽', {}, 'TW')).toBe('吃到飽 餐廳')
  })
  it('口令不保證有插座：工作讀書與其他的 hint 要叫人到店確認', () => {
    expect(sceneOf('rest', { scene: '工作讀書', drink: '咖啡' })!.rule.hint).toMatch(/不准保證有/)
    expect(sceneOf('rest', { scene: SCENE_OTHER, sceneText: '有插座', drink: '咖啡' })!.rule.hint).toMatch(/到店先確認/)
  })
  it('宵夜：純酒吧不派，居酒屋照派（日本宵夜常態）', () => {
    const late = sceneOf('eat', { scene: '宵夜' })
    expect(scenePasses(c('bar moon walk', { primaryType: 'bar', types: ['bar'] }), late)).toBe(false)
    expect(scenePasses(c('鳥貴族', { primaryType: 'japanese_izakaya_restaurant' }), late)).toBe(true)
    expect(scenePasses(c('松屋', { primaryType: 'japanese_restaurant' }), late)).toBe(true)
  })
  it('checker 第 2 輪前：整批放回也不派到店還沒開的店（歇、快吃、外帶）；沒有 → 空的，交給超商救援', () => {
    const rest = sceneOf('rest', { scene: '一個人放空', drink: '咖啡' })
    const morning = [c('A', { walkMin: 3, opensAt: '10:00', opensInMin: 50 }), c('B', { walkMin: 4, opensAt: '10:30', opensInMin: 80 })]
    expect(sceneFilter(morning, rest)).toEqual({ kept: [], relaxed: false })
    const quick = sceneOf('eat', { scene: '一個人快吃' })
    expect(sceneFilter(morning.map((x) => ({ ...x, primaryType: 'restaurant' })), quick).kept).toEqual([])
    // 朋友聚餐（沒有 openOnArrival）：照舊可派即將營業的店
    expect(sceneFilter(morning.map((x) => ({ ...x, primaryType: 'restaurant' })), sceneOf('eat', { scene: '朋友聚餐' })).kept).toHaveLength(2)
  })
  it('評分不夠時只放寬評分，派附近評分最高的那幾家（差 0.2★ 內）', () => {
    const date = sceneOf('eat', { scene: '約會吃好一點' })
    const cands = [c('3.8', { rating: 3.8, primaryType: 'italian_restaurant' }), c('4.0', { rating: 4.0, primaryType: 'italian_restaurant' }), c('4.1', { rating: 4.1, primaryType: 'italian_restaurant' }), c('bar4.6', { rating: 4.6, primaryType: 'bar' })]
    expect(sceneFilter(cands, date)).toEqual({ kept: [cands[1], cands[2]], relaxed: true })
  })
  it('口令時間：店比人晚到時，進店時間從開門算', () => {
    const quickish = sceneOf('eat', { scene: '朋友聚餐' })
    expect(sceneTimes(quickish, '09:07', 5, undefined, 53)).toMatchObject({ arrive: 600, opens: 600, leave: 690 })
    expect(sceneTimesLine(sceneTimes(quickish, '09:07', 5, undefined, 53))).toContain('店 10:00 才開，10:00 進店')
    expect(sceneTimes(quickish, '09:07', 5, undefined, 2)).toMatchObject({ arrive: 552 })
    expect(sceneTimes(quickish, '09:07', 5, undefined, 2)!.opens).toBeUndefined()
  })
})

// Round 11（Cross 2026-11-04「全部都處理」）：約會步行上限 15 分。
// checker 2026-11-04 09:20：早上新宿約會放寬到 4.2★，走 32 分。放寬評分時，步行上限不放寬。
describe('Round 11：約會步行上限 15 分', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'italian_restaurant', types: ['restaurant'], ...extra }) as PlaceCandidate
  const date = sceneOf('eat', { scene: '約會吃好一點' })
  it('規則：步行上限 15 分、半徑 1200 m（15 分 × 80 m）', () => {
    expect(date!.rule.maxWalk).toBe(15)
    expect(date!.rule.radius).toBe(1200)
  })
  it('4.3★ 以上但走超過 15 分的不派；15 分內有 4.3★ 就派它', () => {
    const cands = [c('far4.6', { rating: 4.6, walkMin: 32 }), c('near4.4', { rating: 4.4, walkMin: 9 })]
    expect(sceneFilter(cands, date)).toEqual({ kept: [cands[1]], relaxed: false })
    expect(scenePasses(cands[0], date)).toBe(false)
  })
  it('15 分內沒有 4.3★ → 只放寬評分：派 15 分內最高分的（差 0.2★ 內），走 32 分的 4.2★ 不派', () => {
    const cands = [c('far4.2', { rating: 4.2, walkMin: 32 }), c('near4.0', { rating: 4.0, walkMin: 12 }), c('near3.9', { rating: 3.9, walkMin: 6 }), c('near3.6', { rating: 3.6, walkMin: 4 })]
    expect(sceneFilter(cands, date)).toEqual({ kept: [cands[1], cands[2]], relaxed: true })
  })
  it('15 分整算走得到；16 分不算', () => {
    expect(scenePasses(c('15', { walkMin: 15 }), date)).toBe(true)
    expect(scenePasses(c('16', { walkMin: 16 }), date)).toBe(false)
  })
  it('15 分內一家可派的都沒有 → 照舊整批放回（寧可派得到），不是空手', () => {
    const cands = [c('far4.6', { rating: 4.6, walkMin: 20 }), c('far4.0', { rating: 4.0, walkMin: 25 })]
    expect(sceneFilter(cands, date)).toEqual({ kept: cands, relaxed: true })
  })
  it('其他情境不受影響：朋友聚餐沒有步行上限', () => {
    const party = sceneOf('eat', { scene: '朋友聚餐' })
    expect(party!.rule.maxWalk).toBeUndefined()
    expect(scenePasses(c('far', { walkMin: 30 }), party)).toBe(true)
  })
})

// Round 11 checker 第 1 輪（2026-11-05）：約會 15 分內最高分被記憶擋掉 → 原本一步退到整批候選，
// 40 次裡 36 次派居酒屋、2 次派走 29 分的店。改成一層一層退：先只放寬評分（步行上限、不派酒吧照舊）。
import { sceneTiers } from '../../src/scene.ts'
describe('Round 11 checker 第 1 輪：被記憶擋掉時一層一層退', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'italian_restaurant', types: ['restaurant'], ...extra }) as PlaceCandidate
  const date = sceneOf('eat', { scene: '約會吃好一點' })
  const A = c('A 4.2 近', { rating: 4.2, walkMin: 7 })
  const B = c('B 3.8 近', { rating: 3.8, walkMin: 5 })
  const C = c('C 4.6 遠', { rating: 4.6, walkMin: 29 })
  const D = c('D 居酒屋', { rating: 4.7, walkMin: 8, primaryType: 'japanese_izakaya_restaurant' })
  it('sceneTiers：第 1 層 15 分內最高分；第 2 層 15 分內不派酒吧的全部；第 3 層整批', () => {
    expect(sceneTiers([A, B, C, D], date)).toEqual([[A], [A, B], [A, B, C, D]])
  })
  it('一樣大的層不重複（沒有評分門檻的情境：兩層）', () => {
    const party = sceneOf('eat', { scene: '朋友聚餐' })
    expect(sceneTiers([A, B, C, D], party)).toEqual([[A, B, C, D]])
    expect(sceneTiers([A, B], null)).toEqual([[A, B]])
    expect(sceneTiers([], date)).toEqual([])
  })

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('handler：A 被「又是這家」或「不要再來」擋掉 → 派 B（走 ≤ 15 分、不是居酒屋），20 個種子', async () => {
    const raw = [
      at('A', 550, { rating: 4.2, userRatingCount: 800, primaryType: 'italian_restaurant' }),
      at('B', 350, { rating: 3.8, userRatingCount: 800, primaryType: 'japanese_restaurant' }),
      at('C', 2300, { rating: 4.6, userRatingCount: 800, primaryType: 'italian_restaurant' }),
      at('D', 600, { rating: 4.7, userRatingCount: 800, primaryType: 'japanese_izakaya_restaurant' }),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
      String(url).includes('anthropic') ? claudeOk() : new Response(JSON.stringify({ places: raw }), { status: 200 })))
    for (const block of [Date.parse('2026-11-15'), 'forever' as const]) {
      for (let seed = 1; seed <= 20; seed++) {
        const res = await handler(post({ choices: { scene: '約會吃好一點', diet: '都可以' }, seed, mem: [{ id: 'A', sh: [], dn: [], x: block }] }))
        const body = (await res.json()) as Body
        expect(body.place?.id, `seed ${seed} ${block}`).toBe('B')
        expect(body.place!.walkMin).toBeLessThanOrEqual(15)
      }
    }
  })
})

// Round 12（Cross 2026-11-05「全部處理完之後一次上線 不要一直分段」）：Round 11 的已知未修全處理。
describe('Round 12：評分階梯、約會不派外帶店與購物中心、歇整批放回也不放寬類型', () => {
  const c = (id: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate =>
    ({ id, name: id, walkMin: 5, rating: 4.5, primaryType: 'italian_restaurant', types: ['restaurant'], ...extra }) as PlaceCandidate
  const date = sceneOf('eat', { scene: '約會吃好一點' })
  const r43 = c('4.3', { rating: 4.3 }), r42 = c('4.2', { rating: 4.2 }), r40 = c('4.0', { rating: 4.0 }), r38 = c('3.8', { rating: 3.8 }), r30 = c('3.0', { rating: 3.0 })
  const bar = c('bar', { rating: 4.7, primaryType: 'japanese_izakaya_restaurant' }), far = c('far', { rating: 4.6, walkMin: 29 })

  it('sceneTiers 評分階梯：4.3 → 4.1 以上 → 3.8 以上 → 15 分內全部 → 整批（每階都比上一階大）', () => {
    expect(sceneTiers([r43, r42, r40, r38, r30, bar, far], date)).toEqual([
      [r43], [r43, r42], [r43, r42, r40, r38], [r43, r42, r40, r38, r30], [r43, r42, r40, r38, r30, bar, far],
    ])
  })
  it('浮點：4.3 − 0.2 的門檻包含 4.1', () => {
    const r41 = c('4.1', { rating: 4.1 })
    expect(sceneTiers([r43, r41, r30], date)[1]).toEqual([r43, r41])
    expect(sceneFilter([c('4.2', { rating: 4.2 }), c('4.0', { rating: 4.0 }), c('3.9', { rating: 3.9 })], date).kept.map((x) => x.id)).toEqual(['4.2', '4.0'])
  })
  it('約會不派外帶店、購物中心、百貨（只看主類別）', () => {
    for (const t of ['meal_takeaway', 'shopping_mall', 'department_store']) expect(scenePasses(c(t, { primaryType: t }), date), t).toBe(false)
    expect(scenePasses(c('壽司', { primaryType: 'sushi_restaurant', types: ['sushi_restaurant', 'meal_takeaway'] }), date)).toBe(true)
  })
  it('歇選咖啡不派 snack_bar；整批放回時水煙吧（type=pub、店名 Hookah）也不放回 → 空的，交給超商救援', () => {
    const wait = sceneOf('rest', { scene: '等人', drink: '咖啡' })
    const solo = sceneOf('rest', { scene: '一個人放空', drink: '咖啡' })
    expect(scenePasses(c('Artbar星男', { primaryType: 'snack_bar', walkMin: 5, rating: 4.3 }), solo)).toBe(false)
    const hookah = c('PLAYING Hookah Lounge', { primaryType: 'pub', walkMin: 7, rating: 4.4 })
    expect(sceneFilter([hookah], wait)).toEqual({ kept: [], relaxed: false })
    expect(sceneTiers([hookah], wait)).toEqual([])
    // 類型對、只是走太遠的咖啡店 → 放回的只有它
    const cafe = c('Remember Me café', { primaryType: 'cafe', walkMin: 21 })
    expect(sceneFilter([hookah, cafe], wait)).toEqual({ kept: [cafe], relaxed: true })
    expect(sceneTiers([hookah, cafe], wait)).toEqual([[cafe]])
  })
  it('吃的情境沒有 hardAvoid：約會只剩酒吧時照舊整批放回（Round 10 Q1）', () => {
    expect(sceneFilter([bar], date)).toEqual({ kept: [bar], relaxed: true })
  })

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GOOGLE_PLACES_KEY = 'test-places-key'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('handler：唯一的 4.3★ 被擋 → 派 4.2★（不派 3.8／3.0）；4.3、4.2 都被擋 → 派 3.8★ 以上；20 種子', async () => {
    const raw = [
      at('A43', 300, { rating: 4.3, userRatingCount: 800, primaryType: 'ramen_restaurant' }),
      at('B42', 500, { rating: 4.2, userRatingCount: 800, primaryType: 'japanese_restaurant' }),
      at('C38', 200, { rating: 3.8, userRatingCount: 800, primaryType: 'family_restaurant' }),
      at('D30', 250, { rating: 3.0, userRatingCount: 800, primaryType: 'restaurant' }),
      at('M', 150, { rating: 4.4, userRatingCount: 800, primaryType: 'shopping_mall' }),
      at('T', 180, { rating: 4.5, userRatingCount: 800, primaryType: 'meal_takeaway' }),
      at('BAR', 400, { rating: 4.7, userRatingCount: 800, primaryType: 'japanese_izakaya_restaurant' }),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
      String(url).includes('anthropic') ? claudeOk() : new Response(JSON.stringify({ places: raw }), { status: 200 })))
    const until = Date.parse('2026-11-15')
    for (let seed = 1; seed <= 20; seed++) {
      const one = (await (await handler(post({ choices: { scene: '約會吃好一點', diet: '都可以' }, seed, mem: [{ id: 'A43', sh: [], dn: [], x: until }] }))).json()) as Body
      expect(one.place?.id, `seed ${seed}`).toBe('B42')
      const two = (await (await handler(post({ choices: { scene: '約會吃好一點', diet: '都可以' }, seed, mem: [{ id: 'A43', sh: [], dn: [], x: 'forever' }, { id: 'B42', sh: [], dn: [], x: until }] }))).json()) as Body
      expect(two.place?.id, `seed ${seed} both blocked`).toBe('C38')
    }
  })
})
