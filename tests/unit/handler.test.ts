// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api, { sanitizeRequest } from '../../api/order.ts'
import { findBanned } from '../../src/banned.ts'
import { CARD_BY_ID } from '../../src/cards.ts'
import { clusterKeys } from '../../src/chains.ts'
import { mulberry32, pickPlace } from '../../src/discovery.ts'
import { SWEET_QUERIES, VEG_QUERIES, pickLane } from '../../src/lanes.ts'
import { toCandidates, type RawPlace } from '../../src/places.ts'
import { hourIn } from '../../src/tz.ts'
import type { Order, OrderDebug, OrderRequest, PlaceMemSummary } from '../../src/types.ts'

// Vercel 走的入口是 default.fetch（函式型 default 會被當成舊式 (req,res)），測試走同一條。
const handler = api.fetch

const ORDER_JSON = JSON.stringify({
  verdict: 'do',
  meme: { top: '去吃熱的', big: '阿財魯肉飯', bot: '這週兩天超商了' },
  steps: ['步行 6 分鐘。', '魯肉飯、滷蛋。', '12 分鐘吃完。'],
  place: { id: 'p1', name: '阿財魯肉飯' },
  log: '12:41 魯肉飯，12:58 完成。',
})

const claudeOk = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 })

const placesOk = () =>
  new Response(
    JSON.stringify({
      places: [{
        id: 'p1', displayName: { text: '阿財魯肉飯' },
        location: { latitude: 25.0335, longitude: 121.5658 },
        currentOpeningHours: { openNow: true },
      }],
    }),
    { status: 200 },
  )

// R3 修正 S-7：足量池子（5 家營業中）→ 只打 1 次 Places。阿財評分最高；其他 4 家在記憶裡標「不再推薦」，
// 硬過濾後只剩阿財——呼叫次數看的是候選數（5 家 ≥ MIN_VALID），挑誰是確定的。
const FIVE: RawPlace[] = [
  { id: 'p1', displayName: { text: '阿財魯肉飯' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 4.8, userRatingCount: 500 },
  ...[2, 3, 4, 5].map((n): RawPlace => ({
    id: `p${n}`, displayName: { text: `測試麵館${n}號` }, location: { latitude: 25.0335, longitude: 121.5658 + n * 0.0003 },
    currentOpeningHours: { openNow: true }, rating: 4.0, userRatingCount: 50,
  })),
]
const placesFive = () => new Response(JSON.stringify({ places: FIVE }), { status: 200 })
const FIVE_MEM: PlaceMemSummary[] = [2, 3, 4, 5].map((n) => ({ id: `p${n}`, sh: [], dn: [], x: 'forever' as const }))

const post = (body: Partial<OrderRequest>) =>
  new Request('http://localhost/api/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      // 2026-09-18 起 eat 沒定位是 400（見下），所以預設帶定位；要測沒定位就傳 loc: undefined。
      module: 'eat', level: 1, choices: { diet: '都可以' }, loc: { lat: 25.033, lng: 121.5654 },
      now: '2026-09-11T12:40:00+08:00', recentOrders: [], ...body,
    }),
  })

const routed = (claude: () => Response, places: () => Response = placesOk) =>
  vi.fn(async (url: string | URL | Request) => {
    const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
    return u.includes('anthropic') ? claude() : places()
  })

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('/api/order handler（第 12 節 S5）', () => {
  it('正常路徑：回 200 + 合法 Order JSON', async () => {
    vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), placesFive))
    const res = await handler(post({ loc: { lat: 25.033, lng: 121.5654 }, mem: FIVE_MEM }))
    expect(res.status).toBe(200)
    const order = (await res.json()) as Order
    expect(order.verdict).toBe('do')
    expect(order.meme.big).toBe('阿財魯肉飯')
    expect(order.steps.length).toBeGreaterThan(0)
    // R3 修正 S-7：mock 回 5 家營業中 → 有效候選夠，只打 1 次。
    expect(res.headers.get('x-places-calls')).toBe('1')
  })

  it('Claude 回 fenced JSON 也能吃', async () => {
    vi.stubGlobal('fetch', routed(() => claudeOk('```json\n' + ORDER_JSON + '\n```')))
    const res = await handler(post({ loc: { lat: 25.033, lng: 121.5654 } }))
    expect(res.status).toBe(200)
  })

  // Round 4（Cross 2026-10-30「很多情境沒辦法給任何解答」）：Claude 失敗不再回「班長在開會」，伺服器用模板出口令。
  it('Claude 回非法 JSON → 模板口令 200，店仍是伺服器挑的那家，debug.fallback=template', async () => {
    vi.stubGlobal('fetch', routed(() => claudeOk('班長今天請假。')))
    const res = await handler(post({}))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.debug.fallback).toBe('template')
    expect(body.place?.id).toBe('p1')
    expect(body.meme.big).toBe('阿財魯肉飯')
    expect(body.steps.length).toBeGreaterThan(0)
    expect(res.headers.get('x-timing')).toContain('model=template')
  })

  it('Claude 429 → 重試 2 次後改模板口令（200），不讓使用者空手', async () => {
    const claude = vi.fn(() => new Response('rate limited', { status: 429 }))
    vi.stubGlobal('fetch', routed(claude))
    const res = await handler(post({}))
    expect(res.status).toBe(200)
    expect(claude).toHaveBeenCalledTimes(3) // 首次 + 兩次重試
    expect(((await res.json()) as { debug: OrderDebug }).debug.fallback).toBe('template')
  }, 15_000)

  it('模型兩次都推掉不答 → 模板口令（不再 502）', async () => {
    const no = JSON.stringify({ verdict: 'stop', meme: { top: 'a', big: '大事不受理', bot: '去找連長' }, steps: ['去找連長。'], log: 'x' })
    vi.stubGlobal('fetch', routed(() => claudeOk(no)))
    const res = await handler(post({ module: 'reply', choices: { target: '老闆' } }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.debug.fallback).toBe('template')
    expect(body.meme.big).toContain('現在回')
    expect(JSON.stringify(body)).not.toMatch(/不受理|找連長/)
  })

  // 2026-09-18 斷言改了（Cross：只講類別一律視為失敗）。以下兩條原本是「降級仍出口令」，現在是明確的失敗碼。
  // Round 4：兩個半徑之後再查一次營業中的超商（救援），三次都掛才回 no_places。
  it('Places 掛掉 → 兩次都失敗就停（不打超商救援），回 503 upstream「地圖服務暫時連不上」，不說附近沒店、不打 Claude', async () => {
    const claude = vi.fn(() => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', routed(claude, () => new Response('boom', { status: 500 })))
    const res = await handler(post({ budget: [3] }))
    expect(res.status).toBe(503)
    expect(res.headers.get('x-places-calls')).toBe('2')
    const body = (await res.json()) as { error: string; message: string; debug: OrderDebug }
    expect(body.error).toBe('places_down')
    expect(body.message).toContain('地圖服務暫時連不上')
    expect(body.message).not.toContain('查不到營業中的店')
    expect(body.debug.error).toBe('places_down')
    expect(claude).not.toHaveBeenCalled()
  }, 15_000)

  it('部分失敗（第一次 0 家、第二次 500、超商 0 家）→ 沒查完，回 503 places_down，不說附近沒店（checker 2026-11-01）', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
      n++
      return n === 2 ? new Response('boom', { status: 500 }) : new Response(JSON.stringify({ places: [] }), { status: 200 })
    }))
    const res = await handler(post({}))
    expect(res.status).toBe(503)
    expect(res.headers.get('x-places-calls')).toBe('3')
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('places_down')
    expect(body.message).not.toContain('查不到營業中的店')
  })

  it('Places 正常但方圓 3 km 都沒營業中的店（含超商）→ 三次都查過才回 502 no_places，訊息講 3 公里', async () => {
    const bodies: string[] = []
    const claude = vi.fn(() => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('anthropic')) return claude()
      bodies.push(String(init?.body ?? ''))
      return new Response(JSON.stringify({ places: [] }), { status: 200 })
    }))
    const res = await handler(post({}))
    expect(res.status).toBe(502)
    expect(res.headers.get('x-places-calls')).toBe('3')
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('no_places')
    expect(body.message).toContain('方圓 3 公里內查不到營業中的店')
    expect(JSON.parse(bodies[2]!)).toMatchObject({ textQuery: '便利商店', locationBias: { circle: { radius: 3000 } } })
    expect(claude).not.toHaveBeenCalled()
  })

  it('忌口「素」：關鍵字查詢混進的葷食店（壽司關東煮）0 次被派；只派素食類型或店名有素／蔬的店（30 個種子）', async () => {
    const mk = (id: string, name: string, primaryType: string, n = 0): RawPlace => ({
      id, displayName: { text: name }, location: { latitude: 25.0335, longitude: 121.5658 + n * 0.0002 }, currentOpeningHours: { openNow: true },
      rating: 4.8, userRatingCount: 900, primaryType, types: [primaryType, 'restaurant'],
    })
    const places = [
      mk('meat1', '大月壽司 關東煮黃石店', 'sushi_restaurant', 1), mk('meat2', '老王牛肉麵', 'noodle_shop', 2), mk('meat3', '燒肉本舖', 'barbecue_restaurant', 3),
      mk('veg1', '明珠素食', 'restaurant', 4), mk('veg2', '湖水灣', 'vegetarian_restaurant', 5), mk('veg3', '布衣蔬食', 'restaurant', 6),
    ]
    for (let seed = 1; seed <= 30; seed++) {
      vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), () => new Response(JSON.stringify({ places }), { status: 200 })))
      const body = (await (await handler(post({ choices: { diet: '素' }, seed }))).json()) as Order & { debug: OrderDebug }
      expect(body.place?.id, `seed ${seed}`).toMatch(/^veg/)
      expect(JSON.stringify(body.debug.places?.candidates ?? [])).not.toContain('壽司')
    }
  })

  it('沒有定位 → 400 no_location，不打 Places 也不打 Claude（吃／歇一定要真店）', async () => {
    const f = routed(() => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ loc: undefined }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('no_location')
    expect(f).not.toHaveBeenCalled()
  })

  it('lane 有效候選 < 5 → 第二次 Text Search 通用關鍵字（素食／甜食關鍵字保留自己）＋ openNow、半徑 2000，第二次有就用（40 個種子）', async () => {
    // checker 2026-11-01：原本沒固定種子，第一次抽到 q:素食（2.7%）時第二次照規則保留「素食」→ 測試偶發失敗。
    const KEEP = new Set([...SWEET_QUERIES.TW, ...VEG_QUERIES.TW].map((l) => l.q))
    for (let seed = 1; seed <= 40; seed++) {
      const bodies: string[] = []
      const places = vi.fn((init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''))
        return bodies.length === 1
          ? new Response(JSON.stringify({ places: [] }), { status: 200 })
          : placesOk()
      })
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
        String(url).includes('anthropic') ? claudeOk(ORDER_JSON) : places(init)))
      const res = await handler(post({ seed }))
      expect(res.status, `seed ${seed}`).toBe(200)
      expect(res.headers.get('x-places-calls'), `seed ${seed}`).toBe('2')
      const first = JSON.parse(bodies[0]!)
      // 第一次：Nearby 圓（800m）或關鍵字 lane 的方框（約 ±800m）
      if (first.locationRestriction.circle) expect(first.locationRestriction.circle.radius).toBe(800)
      else expect(first.locationRestriction.rectangle.high.latitude - 25.033).toBeCloseTo(800 / 111_320, 5)
      const second = JSON.parse(bodies[1]!)
      expect(second.locationBias.circle.radius).toBe(2000)
      if (first.textQuery && KEEP.has(first.textQuery)) expect(second.textQuery, `seed ${seed}`).toBe(first.textQuery)
      else expect(['餐廳', '美食', '小吃'], `seed ${seed}`).toContain(second.textQuery)
      expect(second.openNow).toBe(true)
      expect(['DISTANCE', 'RELEVANCE']).toContain(second.rankPreference)
      expect(second.priceLevels).toBeUndefined()
    }
  })

  it('Round 4 救援：前兩次都沒有營業中的店 → 第三次查營業中的超商，照樣出口令', async () => {
    const bodies: string[] = []
    const store: RawPlace = { id: 's7', displayName: { text: '7-ELEVEN 府前門市' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 3.6, userRatingCount: 80, primaryType: 'convenience_store' }
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
      bodies.push(String(init?.body ?? ''))
      return new Response(JSON.stringify({ places: bodies.length === 3 ? [store] : [] }), { status: 200 })
    }))
    const res = await handler(post({}))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-places-calls')).toBe('3')
    expect(JSON.parse(bodies[2]!)).toMatchObject({ textQuery: '便利商店', openNow: true })
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.place?.id).toBe('s7')
    expect(body.debug.rescue).toBe(true)
    expect(body.debug.places?.how.split(' → ')).toHaveLength(3)
  })

  it('Round 4 救援（有預算）：兩次帶 priceLevels 都空 → 第三次拿掉價位查餐廳 → 仍空才第四次超商', async () => {
    const bodies: string[] = []
    const store: RawPlace = { id: 's7', displayName: { text: '7-ELEVEN 府前門市' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 3.6, userRatingCount: 80, primaryType: 'convenience_store' }
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
      bodies.push(String(init?.body ?? ''))
      return new Response(JSON.stringify({ places: bodies.length === 4 ? [store] : [] }), { status: 200 })
    }))
    const res = await handler(post({ budget: [3] }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-places-calls')).toBe('4')
    const sent = bodies.map((b) => JSON.parse(b))
    expect(sent[0].priceLevels).toBeDefined()
    expect(sent[1].priceLevels).toEqual(sent[0].priceLevels)
    expect(sent[2]).toMatchObject({ openNow: true })
    expect(sent[2].priceLevels).toBeUndefined()
    expect(sent[3]).toMatchObject({ textQuery: '便利商店', openNow: true })
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.place?.id).toBe('s7')
    expect(body.debug.rescue).toBe(true)
  })

  it('Round 4 價位（2026-11-01 內湖實測）：第一次 ≥5 家但預算內 0 家 → 仍打第二次、帶同樣 priceLevels，派預算內那家', async () => {
    const mk = (id: string, a: number, b: number): RawPlace => ({
      id, displayName: { text: `店${id}` }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 4.7, userRatingCount: 900,
      priceRange: { startPrice: { currencyCode: 'TWD', units: String(a) }, endPrice: { currencyCode: 'TWD', units: String(b) } },
    })
    const cheap = [1, 2, 3, 4, 5, 6].map((n) => mk(`cheap${n}`, 60, 140))
    const pricey = [mk('pricey1', 500, 900), mk('pricey2', 600, 1000)]
    for (let seed = 1; seed <= 10; seed++) {
      const bodies: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
        bodies.push(String(init?.body ?? ''))
        return new Response(JSON.stringify({ places: bodies.length === 1 ? cheap : pricey }), { status: 200 })
      }))
      const res = await handler(post({ budget: [3], seed }))
      expect(res.headers.get('x-places-calls'), `seed ${seed}`).toBe('2')
      const sent = bodies.map((b) => JSON.parse(b))
      expect(sent[1].priceLevels).toEqual(sent[0].priceLevels)
      const body = (await res.json()) as Order & { debug: OrderDebug }
      expect(body.place?.id, `seed ${seed}`).toMatch(/^pricey/)
      expect(body.debug.pick?.relaxed ?? []).not.toContain('price')
    }
  })

  it('Round 4 救援：候選全被「不要再來」擋掉 → 也走超商救援', async () => {
    const store: RawPlace = { id: 's8', displayName: { text: '全家 市府店' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 3.8, userRatingCount: 90, primaryType: 'convenience_store' }
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
      n++
      return new Response(JSON.stringify({ places: n === 1 ? FIVE : [store] }), { status: 200 })
    }))
    const blocked: PlaceMemSummary[] = FIVE.map((p) => ({ id: p.id!, sh: [], dn: [], x: 'forever' as const }))
    const res = await handler(post({ mem: blocked }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.place?.id).toBe('s8')
    expect(body.debug.rescue).toBe(true)
  })

  it('模型只講類別 → 不重打，place 被 pickPlace 的結果覆寫，dbg.forced 有值', async () => {
    const category = JSON.stringify({
      verdict: 'do', meme: { top: '去吃', big: '附近的小吃店', bot: 'x' }, steps: ['找一家小吃店。'], log: 'x',
    })
    const claude = vi.fn(() => claudeOk(category))
    vi.stubGlobal('fetch', routed(claude))
    const res = await handler(post({}))
    expect(res.status).toBe(200)
    expect(claude).toHaveBeenCalledTimes(1)
    const order = (await res.json()) as Order & { debug: OrderDebug }
    expect(order.meme.big).toBe('阿財魯肉飯')
    expect(order.place?.id).toBe('p1')
    expect(order.place?.mapUrl).toContain('query_place_id=p1')
    expect(order.debug.forced).toBe('阿財魯肉飯')
  })

  it('模型第一次推掉不答（nonanswer）→ 重打一次，用第二次的', async () => {
    let n = 0
    const claude = vi.fn(() => claudeOk(n++ === 0
      ? JSON.stringify({ verdict: 'stop', meme: { top: 'a', big: '大事不受理', bot: '去找連長' }, steps: ['去找連長。'], log: 'x' })
      : ORDER_JSON))
    vi.stubGlobal('fetch', routed(claude))
    const res = await handler(post({}))
    expect(claude).toHaveBeenCalledTimes(2)
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.place?.id).toBe('p1')
    expect(body.debug.retry).toBe('nonanswer')
  })

  // 除錯畫面（長按班長名牌）的資料來源：Vercel log 保存期太短，這份跟著回應送到手機上。
  it('成功時回應帶 debug：查了幾圈、候選與評分、挑中誰、各段幾毫秒', async () => {
    vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), placesFive))
    const res = await handler(post({ mem: FIVE_MEM }))
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.debug.module).toBe('eat')
    expect(body.debug.model).toBe('claude-haiku-4-5')
    // R3 修正 S-7：5 家營業中 → 只查 1 圈，tries 回到 1 筆
    expect(body.debug.places?.how).toMatch(/^(lane=\S+ rank=(POPULARITY|DISTANCE)|text="[^"]+" rank=(DISTANCE|RELEVANCE))$/)
    expect(body.debug.places?.tries).toEqual([{ r: 800, raw: 5, kept: 5 }])
    expect(body.debug.places?.candidates[0]).toMatchObject({ name: '阿財魯肉飯' })
    expect(body.debug.picked).toBe('阿財魯肉飯')
    expect(body.debug.ms?.total).toBeGreaterThanOrEqual(0)
    expect(body.debug.retry).toBeUndefined()
  })

  it('失敗時回應也帶 debug：Places 掛掉看得到兩圈半徑各查到什麼', async () => {
    vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), () => new Response('boom', { status: 500 })))
    const res = await handler(post({}))
    const body = (await res.json()) as { error: string; debug: OrderDebug }
    expect(body.debug.error).toBe('places_down')
    expect(body.debug.rescue).toBeUndefined()
    // Places 掛掉：第一次 800、第二次 2000 都失敗就停，不打超商救援（checker 2026-11-01）
    expect(body.debug.places?.tries).toEqual([{ r: 800, raw: -1, kept: 0 }, { r: 2000, raw: -1, kept: 0 }])
  }, 15_000)

  it('模型寫別家店 → 不重打（retry 只給 nonanswer），forced 記下來', async () => {
    const other = JSON.stringify({
      verdict: 'do', meme: { top: 'a', big: '隔壁牛肉麵', bot: 'c' }, steps: ['去。'], place: { id: 'zzz', name: '隔壁牛肉麵' }, log: 'x',
    })
    vi.stubGlobal('fetch', routed(() => claudeOk(other)))
    const res = await handler(post({}))
    const body = (await res.json()) as Order & { debug: OrderDebug }
    expect(body.debug.retry).toBeUndefined()
    expect(body.debug.forced).toBe('阿財魯肉飯')
    expect(body.place?.id).toBe('p1')
    expect(body.meme.big).toBe('阿財魯肉飯')
  })

  it('不需要 Places 的模組不打 Places', async () => {
    const f = routed(() => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', f)
    await handler(post({ module: 'sleep', choices: { wake: '07:30' }, loc: { lat: 25, lng: 121 } }))
    for (const call of f.mock.calls) expect(String(call[0])).not.toContain('googleapis')
  })

  it('attend 的硬規則在伺服器端被強制執行', async () => {
    // Claude 故意回錯（★2 飯局卻說 do）
    vi.stubGlobal('fetch', routed(() => claudeOk(JSON.stringify({
      verdict: 'do', meme: { top: 'a', big: '去！', bot: 'c' }, steps: ['去。'], log: 'x',
    }))))
    const res = await handler(post({ module: 'attend', choices: { occasion: '飯局', stars: 2 } }))
    expect(((await res.json()) as Order).verdict).toBe('stop')
  })

  it('GET → 405；壞 JSON → 400；未知模組 → 400', async () => {
    expect((await handler(new Request('http://localhost/api/order'))).status).toBe(405)
    expect((await handler(new Request('http://localhost/api/order', {
      method: 'POST', body: 'not json',
    }))).status).toBe(400)
    expect((await handler(post({ module: 'nope' as never }))).status).toBe(400)
  })

  it('沒設 ANTHROPIC_API_KEY → 模板口令（200），不會洩漏 key 內容', async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON)))
    const res = await handler(post({}))
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('ANTHROPIC_API_KEY')
    expect(text).toContain('"fallback":"template"')
  })

  it('Round 4 價位：選了預算 → 只派預算內的店（Google 資料或推估），預算外（含推估在外）的不派', async () => {
    const mk = (id: string, extra: Partial<RawPlace>): RawPlace => ({
      id, displayName: { text: `店${id}` }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 4.5, userRatingCount: 300, ...extra,
    })
    const range = (a: number, b: number) => ({ startPrice: { currencyCode: 'TWD', units: String(a) }, endPrice: { currencyCode: 'TWD', units: String(b) } })
    const places = [
      mk('cheap1', { priceRange: range(80, 140) }), mk('cheap2', { priceRange: range(60, 120) }), mk('cheap3', { priceRange: range(100, 150) }),
      mk('cheap4', { priceLevel: 'PRICE_LEVEL_INEXPENSIVE' }), mk('cheap5', { primaryType: 'noodle_shop' }),
      mk('pricey1', { priceRange: range(800, 1200) }), mk('pricey2', { priceRange: range(1000, 2000) }), mk('pricey3', { primaryType: 'steak_house' }),
    ]
    for (let seed = 1; seed <= 20; seed++) {
      vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), () => new Response(JSON.stringify({ places }), { status: 200 })))
      const body = (await (await handler(post({ budget: [1], seed }))).json()) as Order & { debug: OrderDebug }
      expect(body.place?.id, `seed ${seed}`).toMatch(/^cheap/)
    }
  })

  it('Round 4 價位：Google 沒有價位資料 → 用推估，卡上寫「推估…」不寫金額，priceEst=true', async () => {
    const noodle: RawPlace = { id: 'n1', displayName: { text: '老王麵店' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true }, rating: 4.6, userRatingCount: 400, primaryType: 'noodle_shop' }
    vi.stubGlobal('fetch', routed(() => claudeOk(ORDER_JSON), () => new Response(JSON.stringify({ places: [noodle] }), { status: 200 })))
    const body = (await (await handler(post({ budget: [1] }))).json()) as Order & { debug: OrderDebug }
    expect(body.place?.id).toBe('n1')
    expect(body.place?.priceEst).toBe(true)
    expect(body.place?.priceText).toBe('推估平價')
    expect(body.place?.band).toBe(1)
    expect(body.place?.priceText).not.toMatch(/\d/)
  })
})

// ── Round 3（DEV-PLAN-3 W1）：發掘引擎接上 handler ─────────────────────────
// 合成 40 家池（不是 Google 真實資料）。Places mock 依 request body 的 lane／rank 回不同的 20 家，模擬 lane 輪替。
const POOL: RawPlace[] = Array.from({ length: 40 }, (_, i) => ({
  id: `g${i}`,
  displayName: { text: i % 10 === 0 ? `八方雲集 ${['南京', '復興', '信義', '民生'][i / 10]}店` : `測試小館第${i}號` },
  location: { latitude: 25.033 + (i % 7) * 0.0008, longitude: 121.5654 + (i % 5) * 0.0008 },
  currentOpeningHours: { openNow: true },
  primaryType: ['ramen_restaurant', 'japanese_restaurant', 'chinese_restaurant', 'korean_restaurant'][i % 4],
  rating: 3.9 + (i % 9) * 0.1,
  userRatingCount: 30 + i * 7,
  ...(i % 3 === 0 ? { priceRange: { startPrice: { currencyCode: 'TWD', units: String(80 + (i % 4) * 150) }, endPrice: { currencyCode: 'TWD', units: String(200 + (i % 4) * 300) } } } : {}),
}))

const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
const poolPlaces = (init?: RequestInit) => {
  const off = hash(String(init?.body ?? '')) % 40
  const places = Array.from({ length: 20 }, (_, k) => POOL[(off + k) % 40]!)
  return new Response(JSON.stringify({ places }), { status: 200 })
}
const poolFetch = (claude: () => Response = () => claudeOk(ORDER_JSON), places = poolPlaces) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => (String(url).includes('anthropic') ? claude() : places(init)))

type Body = Order & { debug: OrderDebug }

describe('Round 3：同座標連按（B1）', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  async function tenTimes(novelty: 'balanced' | 'recon') {
    const f = poolFetch()
    vi.stubGlobal('fetch', f)
    const mem: PlaceMemSummary[] = []
    const out: Body[] = []
    for (let i = 0; i < 10; i++) {
      const now = new Date(Date.parse('2026-09-11T12:00:00+08:00') + i * 3600_000)
      const res = await handler(post({ now: now.toISOString(), mem, novelty, seed: 4242 + i }))
      expect(res.status).toBe(200)
      expect(Number(res.headers.get('x-places-calls'))).toBeLessThanOrEqual(2)
      const body = (await res.json()) as Body
      out.push(body)
      const id = body.place!.id
      const m = mem.find((x) => x.id === id)
      if (m) m.sh.unshift(now.getTime())
      else mem.unshift({ id, sh: [now.getTime()], dn: [], ...(body.place!.brand ? { b: body.place!.brand } : {}) })
    }
    return out
  }

  it('balanced：前 5 次 place.id 互不相同；10 次都是伺服器決定的真店', async () => {
    const out = await tenTimes('balanced')
    const ids = out.map((o) => o.place!.id)
    expect(new Set(ids.slice(0, 5)).size).toBe(5)
    for (const o of out) expect(POOL.some((p) => p.id === o.place!.id)).toBe(true)
  })

  it('recon：10 次互不相同，或池子耗盡時帶 exhausted:true', async () => {
    const out = await tenTimes('recon')
    const ids = out.map((o) => o.place!.id)
    const distinct = new Set(ids).size === 10
    expect(distinct || out.some((o) => o.place!.exhausted === true)).toBe(true)
    for (const o of out.filter((x) => !x.place!.exhausted)) expect(o.place!.mode).toBe('wildcard')
  })
})

describe('Round 3：店由程式決定（B5、T2）', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('模型回別家店／類別／亂寫 id：最終 place.id 100% 等於 pickPlace 的輸出（同種子重算）', async () => {
    const answers = [
      { place: { id: 'g1', name: '測試小館第1號' }, big: '測試小館第1號' },
      { place: { id: 'nope', name: '不存在的店' }, big: '不存在的店' },
      { big: '附近的拉麵店' },
    ]
    const fixed: RawPlace[] = POOL.slice(0, 20)
    const places = () => new Response(JSON.stringify({ places: fixed }), { status: 200 })
    for (let seed = 1; seed <= 30; seed++) {
      const a = answers[seed % answers.length]!
      const reply = JSON.stringify({ verdict: 'do', meme: { top: 't', big: a.big, bot: 'b' }, steps: ['去。'], ...(a.place ? { place: a.place } : {}), log: 'x' })
      const f = poolFetch(() => claudeOk(reply), places)
      vi.stubGlobal('fetch', f)
      const now = '2026-09-11T12:40:00+08:00'
      const res = await handler(post({ now, seed }))
      const body = (await res.json()) as Body
      expect(res.headers.get('x-places-calls')).toBe('1') // 20 家都營業 → 一次就夠
      // 同樣的種子、同樣的消耗順序重算一次
      const rng = mulberry32(seed)
      const loc = { lat: 25.033, lng: 121.5654 }
      pickLane(CARD_BY_ID.eat, { diet: '都可以' }, undefined, 'TW', rng, hourIn(new Date(now), 'Asia/Taipei'))
      const cands = toCandidates(fixed, loc, new Date(now), [], 'Asia/Taipei')
      const want = pickPlace(cands, [], undefined, {
        now: Date.parse(now), country: 'TW', novelty: 'balanced', exclude: new Set(), rejectedCuisines: new Set(), clusters: clusterKeys(cands), rng,
      })!
      expect(body.place!.id).toBe(want.place.id)
      expect(body.place!.mapUrl).toContain(`query_place_id=${want.place.id}`)
      expect(body.meme.big.length).toBeLessThanOrEqual(10)
    }
  })

  it('prompt 只帶已決定的那一家：模型看不到候選清單', async () => {
    const claude = vi.fn((_init?: RequestInit) => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      (String(url).includes('anthropic') ? claude(init) : poolPlaces(init))))
    const res = await handler(post({ seed: 7 }))
    const body = (await res.json()) as Body
    const sent = JSON.parse(String(claude.mock.calls[0]![0]!.body)) as { max_tokens: number; messages: { content: string }[] }
    const user = sent.messages[0]!.content
    expect(sent.max_tokens).toBe(600)
    expect(user).toContain('【店已決定】')
    // R3 修正 S-9（Team Lead 授權調整）：只帶那一家的店名；place.id 不送給模型，任何候選的 id 都不出現
    expect(user).toContain(`place.name=${body.place!.name}`)
    expect(user).not.toContain('place.id=')
    expect(POOL.filter((p) => new RegExp(`(^|[^\\w])${p.id}([^\\w]|$)`).test(user)).map((p) => p.id)).toEqual([])
    const names = POOL.filter((p) => user.includes(p.displayName!.text!)).map((p) => p.id)
    expect(names).toEqual([body.place!.id])
    expect(user).not.toContain('候選店家')
  })
})

describe('Round 3：禁詞、價位、國家（B8、B7、T9）', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('B8：故意塞禁詞的回應，送到前端的 meme／steps／log 0 命中', async () => {
    const dirty = JSON.stringify({
      verdict: 'do', meme: { top: '你這個廢物快去', big: '阿財魯肉飯', bot: '胖子也要吃飯' },
      steps: ['步行 6 分鐘，白痴都會走。', '點魯肉飯。'], place: { id: 'p1', name: '阿財魯肉飯' }, log: '智障完成任務。',
    })
    vi.stubGlobal('fetch', routed(() => claudeOk(dirty)))
    const body = (await (await handler(post({}))).json()) as Body
    const text = [body.meme.top, body.meme.big, body.meme.bot, ...body.steps, body.log].join('\n')
    expect(findBanned(text)).toEqual([])
    expect(body.steps).toContain('點魯肉飯。')
  })

  it('B7：模型編的金額被拔掉；Google 給的價位留著', async () => {
    const priced = () => new Response(JSON.stringify({ places: [{
      id: 'p1', displayName: { text: '阿財魯肉飯' }, location: { latitude: 25.0335, longitude: 121.5658 }, currentOpeningHours: { openNow: true },
      priceRange: { startPrice: { currencyCode: 'TWD', units: '80' }, endPrice: { currencyCode: 'TWD', units: '150' } },
    }] }), { status: 200 })
    const reply = JSON.stringify({
      verdict: 'do', meme: { top: '這家你沒去過', big: '阿財魯肉飯', bot: '一碗只要 NT$35' },
      steps: ['魯肉飯 50元、滷蛋。', '預算 NT$80–150。'], place: { id: 'p1', name: '阿財魯肉飯' }, log: '花了 ¥500。',
    })
    vi.stubGlobal('fetch', routed(() => claudeOk(reply), priced))
    const body = (await (await handler(post({}))).json()) as Body
    expect(body.place!.priceText).toBe('≈NT$80–150')
    const text = [body.meme.top, body.meme.bot, ...body.steps, body.log].join('\n')
    expect(text).not.toMatch(/35|50元|¥500/)
    expect(text).toContain('NT$80–150')
  })

  it('東京座標：country JP、口令不出現「捷運」、時區是東京', async () => {
    const tokyo = () => new Response(JSON.stringify({ places: [{
      id: 'j1', displayName: { text: 'すき家 渋谷店' }, location: { latitude: 35.6813, longitude: 139.7672 },
      currentOpeningHours: { openNow: false, nextOpenTime: '2026-09-11T04:00:00Z' }, // 東京 13:00
    }] }), { status: 200 })
    const reply = JSON.stringify({ verdict: 'do', meme: { top: '這家你沒去過', big: 'すき家', bot: '搭捷運也行' }, steps: ['走到捷運站旁。'], log: 'x' })
    vi.stubGlobal('fetch', routed(() => claudeOk(reply), tokyo))
    const res = await handler(post({ loc: { lat: 35.6812, lng: 139.7671 }, now: '2026-09-11T12:30:00+09:00' }))
    const body = (await res.json()) as Body
    expect(body.place).toMatchObject({ id: 'j1', country: 'JP', opensAt: '13:00', brand: 'sukiya' })
    expect(JSON.stringify(body)).not.toContain('捷運')
    expect(body.debug.price?.country).toBe('JP')
  })
})

describe('Round 3：Places 呼叫規則', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('lane 回 400 → 第二次自動退回營業中的餐廳 Text Search（算在 2 次裡）', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
      bodies.push(String(init?.body))
      return bodies.length === 1 ? new Response('bad type', { status: 400 }) : poolPlaces(init)
    }))
    const res = await handler(post({ seed: 3 }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-places-calls')).toBe('2')
    expect(JSON.parse(bodies[1]!)).toMatchObject({ textQuery: '餐廳', openNow: true })
  })

  it('甜食走甜食 lane、素走素食 lane；第二次也不退回 restaurant（type 或同一個關鍵字），第三次才是超商救援', async () => {
    const sweetQ = ['甜點', '豆花', '冰店', '麵包店']
    const vegQ = ['素食', '蔬食']
    for (const [choices, types, words] of [[{ taste: '甜食' }, ['bakery', 'cafe', 'ice_cream_shop'], sweetQ], [{ diet: '素' }, ['vegetarian_restaurant', 'vegan_restaurant'], vegQ]] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const bodies: string[] = []
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
          bodies.push(String(init?.body))
          return new Response(JSON.stringify({ places: [] }), { status: 200 })
        }))
        await handler(post({ choices: { ...choices }, seed }))
        expect(bodies).toHaveLength(3)
        const second = JSON.parse(bodies[1]!)
        if (second.includedTypes) {
          expect(second.includedTypes).toEqual(types)
          if ('diet' in choices) expect(JSON.parse(bodies[0]!).includedTypes).toEqual(types)
        } else {
          expect(words as readonly string[]).toContain(second.textQuery)
          expect(JSON.parse(bodies[0]!).textQuery).toBe(second.textQuery)
        }
        expect(JSON.parse(bodies[2]!).textQuery).toBe('便利商店')
      }
    }
  })

  it('rest 走 Text Search；rankPreference 只用 DISTANCE／RELEVANCE', async () => {
    const ranks = new Set<string>()
    for (let seed = 1; seed <= 12; seed++) {
      const bodies: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
        bodies.push(String(init?.body))
        return poolPlaces(init)
      }))
      await handler(post({ module: 'rest', choices: { drink: '居酒屋' }, seed }))
      const b = JSON.parse(bodies[0]!)
      expect(b.textQuery).toBe('居酒屋')
      ranks.add(b.rankPreference)
    }
    expect([...ranks].sort()).toEqual(['DISTANCE', 'RELEVANCE'])
  })

  it('匿名 log：[pick] 一行，不記 place_id、不記座標、不記店名；debug 不含 place_id', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', poolFetch())
    const res = await handler(post({ seed: 5 }))
    const body = (await res.json()) as Body
    const pickLine = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[pick]'))!
    expect(pickLine).toMatch(/^\[pick\] module=eat scene=- mode=\w+ lane=\S+ pool=\d+ kept=\d+ known_price=[\d.]+ country=TW seen14d=(true|false) relaxed=\S+$/)
    const logs = info.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).not.toContain(body.place!.id)
    expect(logs).not.toContain('25.033')
    expect(logs).not.toContain(body.place!.name)
    expect(JSON.stringify(body.debug)).not.toContain(body.place!.id)
    expect(body.debug.pick).toMatchObject({ seed: 5, relaxed: expect.any(Array) })
  })

  it('記憶裡 never_again／本次換掉的店，0 次被派', async () => {
    vi.stubGlobal('fetch', poolFetch(undefined, () => new Response(JSON.stringify({ places: POOL.slice(0, 20) }), { status: 200 })))
    const banned = ['g1', 'g2', 'g3']
    for (let seed = 1; seed <= 20; seed++) {
      const res = await handler(post({ seed, mem: [{ id: 'g1', sh: [], dn: [], x: 'forever' }, { id: 'g2', sh: [], dn: [], x: Date.parse('2026-12-01') }], exclude: ['g3'] }))
      expect(banned).not.toContain(((await res.json()) as Body).place!.id)
    }
  })
})

// ── Round 3 修正（fix-brief SERVER 組）────────────────────────────────
describe('R3 修正 S-1：不查店的卡，模型編的 place 不准流到前端', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('go 卡＋模型帶 place → 回應沒有 place（也沒有 mapUrl）', async () => {
    const f = routed(() => claudeOk(ORDER_JSON))
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ module: 'go', choices: { transport: '捷運', minutes: '30 分' } }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Body
    expect(body.place).toBeUndefined()
    expect('place' in body).toBe(false)
    expect(JSON.stringify(body)).not.toContain('"id":"p1"')
    expect(JSON.stringify(body)).not.toContain('mapUrl')
    expect(body.debug.picked).toBeUndefined()
    for (const call of f.mock.calls) expect(String(call[0])).not.toContain('googleapis')
  })
})

describe('R3 修正 S-4：入口清洗（在任何 Places 呼叫之前）', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it("now:'x' → 400 {error:'bad_request'} JSON，不打 Places 也不打 Claude", async () => {
    for (const now of ['x', 12345, { a: 1 }] as unknown as string[]) {
      const f = routed(() => claudeOk(ORDER_JSON))
      vi.stubGlobal('fetch', f)
      const res = await handler(post({ now }))
      expect(res.status).toBe(400)
      expect(res.headers.get('content-type')).toContain('application/json')
      expect(((await res.json()) as { error: string }).error).toBe('bad_request')
      expect(f).not.toHaveBeenCalled()
    }
  })

  it("mem:'oops' 與其他亂填欄位 → 不 crash，照樣 200 出口令", async () => {
    vi.stubGlobal('fetch', poolFetch())
    const junk = {
      mem: 'oops', cuisine: [1, 2], novelty: 'yolo', exclude: 'g3', rejectedCuisines: 5, budget: 'cheap', recentOrders: 'none', choices: null, level: 9,
    } as unknown as Partial<OrderRequest>
    const res = await handler(post({ ...junk, seed: 9 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Body
    expect(POOL.some((p) => p.id === body.place!.id)).toBe(true)
  })

  it('sanitizeRequest：mem 截 200 筆、sh/dn 只留有限數字、x 只收數字或 forever、dc 只收非負整數；cuisine／budget／novelty／exclude 收斂', () => {
    const mem = [
      { id: 'a', sh: [1, 'x', null, Infinity, 2], dn: 'nope', x: 'tomorrow', dc: -1, fav: 'yes', b: 7 },
      { id: 'b', sh: [], dn: [3], x: 'forever', dc: 7, fav: true, b: 'mos' },
      { id: 'c', sh: [], dn: [], x: 99, dc: 2.5 },
      { sh: [1] }, 'str', null,
      ...Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, sh: [], dn: [] })),
    ]
    const out = sanitizeRequest({
      module: 'eat', level: 1, choices: { diet: '都可以', bad: { x: 1 } }, now: '2026-09-11T12:40:00+08:00', recentOrders: [],
      mem, cuisine: { ramen: [2, 1], jp: [1, 'x'], cn: [NaN, 1], tw: [1, 2, 3] }, novelty: 'nope', budget: [4, 2, 2, 0, 1.5, '3'],
      exclude: ['g1', 3, '', 'g2'], rejectedCuisines: 'ramen',
    } as unknown as OrderRequest)
    expect(out.mem!.length).toBeLessThanOrEqual(200)
    expect(out.mem![0]).toEqual({ id: 'a', sh: [1, 2], dn: [] })
    expect(out.mem![1]).toEqual({ id: 'b', sh: [], dn: [3], x: 'forever', dc: 7, fav: true, b: 'mos' })
    expect(out.mem![2]).toEqual({ id: 'c', sh: [], dn: [], x: 99 })
    expect(out.mem!.every((m) => typeof m.id === 'string')).toBe(true)
    expect(out.cuisine).toEqual({ ramen: [2, 1] })
    expect(out.novelty).toBe('balanced')
    expect(out.budget).toEqual([2, 4])
    expect(out.exclude).toEqual(['g1', 'g2'])
    expect(out.rejectedCuisines).toEqual([])
    expect(out.choices).toEqual({ diet: '都可以' })
    expect(sanitizeRequest({ module: 'eat', level: 1, choices: {}, now: '', recentOrders: [], exclude: Array.from({ length: 500 }, (_, i) => `e${i}`) } as unknown as OrderRequest).exclude!.length).toBe(50)
  })
})

describe('R3R-2：伺服器截 mem 時封鎖與愛店優先', () => {
  it('前 250 筆是一般紀錄、封鎖店排在後面 → 截到 200 筆後封鎖店與愛店仍在', () => {
    const plain = Array.from({ length: 250 }, (_, i) => ({ id: `n${i}`, sh: [1], dn: [] }))
    const out = sanitizeRequest({
      module: 'eat', level: 1, choices: {}, now: new Date().toISOString(), recentOrders: [],
      mem: [...plain, { id: 'blocked', sh: [1], dn: [], x: 'forever' }, { id: 'lover', sh: [1], dn: [], fav: true }],
    } as never)
    const ids = (out.mem ?? []).map((m) => m.id)
    expect(ids).toHaveLength(200)
    expect(ids).toContain('blocked')
    expect(ids).toContain('lover')
  })
})

describe('店名語言：日本用 ja，台灣用 zh-TW（H6 正式站實測）', () => {
  it('東京座標的 Places 請求帶 languageCode ja；台北帶 zh-TW', async () => {
    for (const [loc, want] of [[{ lat: 35.6812, lng: 139.7671 }, 'ja'], [{ lat: 25.033, lng: 121.5654 }, 'zh-TW']] as const) {
      const bodies: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('anthropic')) return claudeOk(ORDER_JSON)
        bodies.push(String(init?.body))
        return new Response(JSON.stringify({ places: [] }), { status: 200 })
      }))
      await handler(post({ loc }))
      expect(bodies.length).toBeGreaterThan(0)
      for (const b of bodies) expect(JSON.parse(b).languageCode).toBe(want)
    }
  })
})
