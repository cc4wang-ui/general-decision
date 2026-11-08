// @vitest-environment node
// /api/daily-route：目前位置（GPS）當出發點。座標驗證、有座標就不查出發地、壞座標 400。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { validPoint } from '../../src/dailyRouting.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const HERE = { lat: 35.6896, lng: 139.7006 } // 新宿駅附近
/** 預設就是一間合格店：評論 120 則、類型 restaurant。extra 可覆寫成車站／低評論店／烏龍麵店。 */
const place = (id: string, lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: lat, longitude: lng }, googleMapsUri: 'https://maps.google.com/?cid=' + id,
  rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant',
  ...extra,
})
const validShop = (id: string, i: number) => place(id, 35.69 + i * 0.001, 139.70, { displayName: { text: id + '食堂' } })
const stationShop = place('shibuya-station', 35.6595, 139.7005, {
  displayName: { text: '渋谷駅' }, rating: 4.2, userRatingCount: 9000,
  types: ['transit_station', 'train_station'], primaryType: 'transit_station',
})
const lowReviewShop = place('new-shop', 35.6905, 139.701, {
  displayName: { text: '新開的小店' }, rating: 5.0, userRatingCount: 12,
  types: ['restaurant'], primaryType: 'restaurant',
})
const udonShop = place('udon-1', 35.691, 139.701, {
  displayName: { text: '烏龍麵專門店' }, rating: 4.8, userRatingCount: 300,
  types: ['restaurant'], primaryType: 'restaurant',
})
/** 真實店名 mock（紅隊 §3.1）：麺喜やしま是使用者實際不喜歡的烏龍麵店，名字只有一個「麺」字；叙々苑是燒肉；藪蕎麦是蕎麥麵。 */
const yashimaShop = place('yashima-1', 35.691, 139.701, {
  displayName: { text: '麺喜やしま' }, rating: 4.2, userRatingCount: 808,
  types: ['restaurant'], primaryType: 'restaurant',
})
const jojoenShop = place('jojoen-1', 35.691, 139.701, {
  displayName: { text: '叙々苑' }, rating: 4.4, userRatingCount: 1200,
  types: ['yakiniku_restaurant', 'restaurant'], primaryType: 'yakiniku_restaurant',
})
const yabuSobaShop = place('yabu-1', 35.691, 139.701, {
  displayName: { text: '藪蕎麦' }, rating: 4.1, userRatingCount: 300,
  types: ['restaurant'], primaryType: 'restaurant',
})
const ramenShop = place('ramen-1', 35.691, 139.701, {
  displayName: { text: '拉麵店' }, rating: 4.8, userRatingCount: 300,
  types: ['ramen_restaurant', 'restaurant'], primaryType: 'ramen_restaurant',
})

/** Places 依查詢回一家店；Routes 回 403（跟現在正式環境一樣）。記下每一次呼叫。 */
function mockGoogle() {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ url: String(url), body })
    if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
    const q = String(body.textQuery)
    return new Response(JSON.stringify({ places: [place('p-' + q.slice(0, 12), 35.69, 139.70)] }), { status: 200 })
  })
  vi.stubGlobal('fetch', f)
  return { f, calls, places: () => calls.filter((c) => c.url.includes('places:searchText')) }
}

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('validPoint（目前位置座標）', () => {
  it('合法座標照收；邊界 ±90／±180 也收', () => {
    expect(validPoint(HERE)).toEqual(HERE)
    expect(validPoint({ lat: 90, lng: 180 })).toEqual({ lat: 90, lng: 180 })
    expect(validPoint({ lat: -90, lng: -180 })).toEqual({ lat: -90, lng: -180 })
    expect(validPoint({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 })
  })
  it('超出範圍、不是數字、缺欄位、不是物件 → null', () => {
    for (const bad of [
      { lat: 90.0001, lng: 0 }, { lat: -91, lng: 0 }, { lat: 0, lng: 180.5 }, { lat: 0, lng: -181 },
      { lat: '35.6', lng: 139.7 }, { lat: 35.6 }, { lng: 139.7 }, { lat: Number.NaN, lng: 1 }, { lat: 1, lng: Infinity },
      null, undefined, 'here', 35.6, [35.6, 139.7],
    ]) expect(validPoint(bad), JSON.stringify(bad) ?? String(bad)).toBeNull()
  })
})

describe('/api/daily-route 目前位置', () => {
  it('有合法座標：不查出發地（沒有 pageSize 1 的出發地查詢），中心點＝目前位置，回 origin「目前位置」', async () => {
    const g = mockGoogle()
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { origin: { name: string; current: boolean }; stops: { id: string; candidate?: { id: string } }[]; routeVerified: boolean }
    expect(data.origin.name).toBe('目前位置')
    expect(data.origin.current).toBe(true)
    expect(data.stops.map((s) => s.id)).toEqual(['meal'])
    expect(data.stops[0]!.candidate?.id).toBeTruthy()
    expect(data.routeVerified).toBe(false) // Routes 403 → 照實標未驗證
    // 計次：1 次 Places（定食）＋ 1 次 Routes。沒有查出發地那一次。
    expect(g.f).toHaveBeenCalledTimes(2)
    expect(g.places()).toHaveLength(1)
    expect(g.places().some((c) => c.body.pageSize === 1)).toBe(false)
    const bias = g.places()[0]!.body.locationBias as { circle: { center: { latitude: number; longitude: number } } }
    expect(bias.circle.center).toEqual({ latitude: HERE.lat, longitude: HERE.lng })
  })

  it('有座標時，「散步回家」那站不再發 Places 查詢、不帶候選（不是車站）', async () => {
    const g = mockGoogle()
    const res = await handler(post({ origin: HERE, stops: [
      { id: 'coffee', kind: 'creative', title: '咖啡', minutes: 60 },
      { id: 'rest', kind: 'rest', title: '散步回家', minutes: 75 },
    ] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { id: string; candidate?: { id: string } }[] }
    const queries = g.places().map((c) => String(c.body.textQuery))
    expect(queries).toEqual(['quiet specialty coffee cafe'])
    expect(queries.join(' ')).not.toMatch(/train station|Shibuya|渋谷|澀谷/)
    expect(data.stops.find((s) => s.id === 'rest')?.candidate).toBeUndefined()
  })

  it('座標和文字出發地都帶：用座標，文字不查', async () => {
    const g = mockGoogle()
    const res = await handler(post({ origin: HERE, location: '渋谷駅', stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    expect(g.places().map((c) => String(c.body.textQuery))).toEqual(['Japanese set meal restaurant'])
  })

  it('壞座標 → 400 bad_origin，一次 Google 都不打（不改用文字出發地）', async () => {
    for (const origin of [{ lat: 91, lng: 0 }, { lat: 35.6, lng: 200 }, { lat: '35.6', lng: 139.7 }, { lat: 35.6 }, 'here', [35.6, 139.7]]) {
      const g = mockGoogle()
      const res = await handler(post({ origin, location: '渋谷駅', stops: [{ id: 'meal', kind: 'meal', minutes: 45 }] }))
      expect(res.status, JSON.stringify(origin)).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('bad_origin')
      expect(g.f).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })

  it('沒有座標：照舊用文字查出發地（pageSize 1、「渋谷駅 Japan」）', async () => {
    const g = mockGoogle()
    const res = await handler(post({ location: '渋谷駅', stops: [{ id: 'meal', kind: 'meal', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const first = g.places()[0]!.body
    expect(first.textQuery).toBe('渋谷駅 Japan')
    expect(first.pageSize).toBe(1)
    expect(String(g.places()[1]!.body.textQuery)).toBe('Japanese set meal restaurant 渋谷駅')
  })

  it('座標、文字都沒有 → 400 location_required；origin: null 當作沒帶', async () => {
    const g = mockGoogle()
    for (const body of [{ stops: [] }, { origin: null, stops: [] }]) {
      const res = await handler(post(body))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('location_required')
    }
    expect(g.f).not.toHaveBeenCalled()
  })
})

/** 多候選 mock：第一頁 6 家合格店＋車站＋低評論店（帶下一頁），第二頁 1 家合格店。 */
function mockGoogleMulti() {
  const calls: { url: string; body: Record<string, unknown>; headers: unknown }[] = []
  const page1 = [...['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id, i) => validShop(id, i)), stationShop, lowReviewShop]
  const page2 = [validShop('m7', 9)]
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ url: String(url), body, headers: init?.headers })
    if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
    if (body.pageToken === 'page2') return new Response(JSON.stringify({ places: page2 }), { status: 200 })
    return new Response(JSON.stringify({ places: page1, nextPageToken: 'page2' }), { status: 200 })
  })
  vi.stubGlobal('fetch', f)
  return { f, calls, places: () => calls.filter((c) => c.url.includes('places:searchText')) }
}

/** 只有一頁：6 家合格店＋車站＋低評論店，沒有下一頁。 */
function mockGoogleSinglePage() {
  const calls: { url: string; body: Record<string, unknown>; headers: unknown }[] = []
  const page1 = [...['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id, i) => validShop(id, i)), stationShop, lowReviewShop]
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ url: String(url), body, headers: init?.headers })
    if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
    return new Response(JSON.stringify({ places: page1 }), { status: 200 })
  })
  vi.stubGlobal('fetch', f)
  return { f, calls, places: () => calls.filter((c) => c.url.includes('places:searchText')) }
}

describe('shuffle 不重複（seen-list＋隨機）', () => {
  it('同一站連續 shuffle 5 次：5 個不同 id，沒有一個在 exclude 裡，也不是車站／低評論店', async () => {
    const g = mockGoogleMulti()
    void g
    const picked: string[] = []
    for (let i = 0; i < 5; i++) {
      const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: picked, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
      expect(res.status).toBe(200)
      const data = await res.json() as { stops: { candidate?: { id: string } }[] }
      const id = data.stops[0]!.candidate!.id
      expect(picked).not.toContain(id)
      expect(id).toMatch(/^m[1-6]$/)
      picked.push(id)
    }
    expect(new Set(picked).size).toBe(5)
  })

  it('候選全被排除：回 422 no_more_options，而不是靜默留原店', async () => {
    const g = mockGoogleSinglePage()
    void g
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(422)
    const data = await res.json() as { error: string; message: string }
    expect(data.error).toBe('no_more_options')
    expect(data.message).toContain('沒有更多選擇')
  })

  it('第一頁候選全被排除：用 pageToken 翻下一頁，選到第二頁的店', async () => {
    const g = mockGoogleMulti()
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('m7')
    expect(g.places()).toHaveLength(2)
    expect(g.places()[1]!.body.pageToken).toBe('page2')
  })
})

describe('類型過濾與評論門檻', () => {
  it('混合回傳（車站＋低評論店＋合格店）：選中的是合格店，且請求帶 includedType、pageSize 20 與 types 遮罩', async () => {
    const g = mockGoogleSinglePage()
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(['m1', 'm2', 'm3', 'm4', 'm5']).toContain(data.stops[0]!.candidate?.id)
    const call = g.places()[0]!
    expect(call.body.includedType).toBe('restaurant')
    expect(call.body.pageSize).toBe(20)
    const mask = String((call.headers as Record<string, string>)['X-Goog-FieldMask'] ?? '')
    expect(mask).toContain('places.types')
    expect(mask).toContain('places.primaryType')
  })
})

describe('種類級排除（dislikedKinds）', () => {
  function mockKind(first: unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first, validShop('ok1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f, calls }
  }
  it('dislikedKinds 含 udon：店名有烏龍麵的店永遠不被選', async () => {
    const g = mockKind(udonShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it('dislikedKinds 含 ramen（歸一化鍵）：primaryType 是拉麵的店不被選', async () => {
    const g = mockKind(ramenShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it('舊版種類鍵 ramen_restaurant 照樣排除（第一輪存的「不喜歡」不會失效）', async () => {
    const g = mockKind(ramenShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['ramen_restaurant'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})

describe('種類級排除（真實店名，紅隊 §3.1）', () => {
  function mockKind(first: unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first, validShop('ok1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f, calls }
  }
  it("excludeKinds ['udon']：麺喜やしま不被選（名字只有一個「麺」字，類型只有 restaurant）", async () => {
    const g = mockKind(yashimaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['yakiniku']：叙々苑不被選（yakiniku_restaurant 歸一化成 yakiniku）", async () => {
    const g = mockKind(jojoenShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['yakiniku'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['soba']：藪蕎麦不被選（簡體「蕎麦」要認得到）", async () => {
    const g = mockKind(yabuSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})

/** 紅隊 round 2 Finding 1／2／4 的永久測試：用真實店名當 mock。 */
const hondaShop = place('honda-1', 35.691, 139.701, {
  displayName: { text: '麺処ほん田' }, rating: 4.5, userRatingCount: 300,
  types: ['restaurant'], primaryType: 'restaurant',
})
const sushiroShop = place('sushiro-1', 35.691, 139.701, {
  displayName: { text: 'スシロー' }, rating: 4.2, userRatingCount: 800,
  types: ['restaurant'], primaryType: 'restaurant',
})
const wakohShop = place('wakoh-1', 35.691, 139.701, {
  displayName: { text: 'とんかつ和幸' }, rating: 4.1, userRatingCount: 500,
  types: ['restaurant'], primaryType: 'restaurant',
})
/** 真實店名 mock（紅隊 round 3 Finding B）：中華そば 青葉是拉麵店，名字裡的「そば」不能算蕎麥麵。 */
const chukaSobaShop = place('chuka-soba-1', 35.691, 139.701, {
  displayName: { text: '中華そば 青葉' }, rating: 4.3, userRatingCount: 400,
  types: ['restaurant'], primaryType: 'restaurant',
})

describe('種類判斷修正（紅隊 round 2 Finding 1／2）', () => {
  /** 池子裡只有一家店：被排除就 422，選中才是沒被誤判。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  function mockKind(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first, validShop('ok1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it("excludeKinds ['udon']：池子只有麺処ほん田（拉麵店）時要選中它，不能 422", async () => {
    const g = mockSingle(hondaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('honda-1')
  })
  it("excludeKinds ['sushi']：スシロー不被選（片假名スシ要認得到）", async () => {
    const g = mockKind(sushiroShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['sushi'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['tonkatsu']：とんかつ和幸不被選", async () => {
    const g = mockKind(wakohShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['tonkatsu'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})

describe('種類判斷修正（紅隊 round 3 Finding B：中華そば）', () => {
  /** 池子裡只有一家店：被排除就 422，選中才是沒被誤判。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it("excludeKinds ['soba']：池子只有中華そば 青葉（拉麵店）時要選中它，不能 422", async () => {
    const g = mockSingle(chukaSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('chuka-soba-1')
  })
  it("excludeKinds ['ramen']：中華そば 青葉被選走時，對照店要能補上（種類判 ramen 才有排除效果）", async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [chukaSobaShop, validShop('ok1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    void f
    const res = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})

describe('舊版殘留候選重驗（紅隊 round 2 Finding 4）', () => {
  const stationCandidate = {
    id: 'shibuya-station', name: '渋谷駅', address: '渋谷駅地下 1F',
    mapUrl: 'https://maps.google.com/?cid=shibuya-station', lat: 35.6595, lng: 139.7005,
    rating: 4.2, userRatingCount: 9000, types: ['transit_station', 'train_station'], primaryType: 'transit_station',
  }
  it('meal 站帶渋谷駅候選、不 shuffle：不保留車站，改用通用查詢重找一間合格店', async () => {
    const g = mockGoogleSinglePage()
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, place: '渋谷駅地下 1F', candidate: stationCandidate }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(['m1', 'm2', 'm3', 'm4', 'm5']).toContain(data.stops[0]!.candidate?.id)
    // 殘留的地名一起丟掉：查詢是通用定食查詢，不是車站地址。
    expect(g.places().map((c) => String(c.body.textQuery))).toEqual(['Japanese set meal restaurant'])
  })
  it('使用者指定／固定地點的候選不重驗（那是他的選擇）', async () => {
    const g = mockGoogleSinglePage()
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, specified: true, place: '渋谷駅', candidate: stationCandidate }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('shibuya-station')
  })
  it('meal 站帶渋谷駅候選、shuffle 目標是 coffee：meal 一樣重找，不保留車站候選（紅隊 round 3 Finding A）', async () => {
    const g = mockGoogleSinglePage()
    const res = await handler(post({ origin: HERE, shuffle: 'coffee', stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, place: '渋谷駅地下 1F', candidate: stationCandidate },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60 },
    ] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { id: string; candidate?: { id: string } }[] }
    const meal = data.stops.find((s) => s.id === 'meal')
    expect(meal?.candidate?.id).not.toBe('shibuya-station')
    expect(['m1', 'm2', 'm3', 'm4', 'm5']).toContain(meal?.candidate?.id)
    // meal 走通用定食查詢重找（不是車站地址），coffee 照常查。
    expect(g.places().map((c) => String(c.body.textQuery))).toEqual(['Japanese set meal restaurant', 'quiet specialty coffee cafe'])
  })
})

/** 真實店名 mock（紅隊 round 4 Finding 1／2／3）。 */
const iidaShop = place('iida-1', 35.691, 139.701, {
  displayName: { text: 'らぁ麺 飯田商店' }, rating: 4.6, userRatingCount: 1200,
  types: ['restaurant'], primaryType: 'restaurant',
})
const hayashidaShop = place('hayashida-1', 35.691, 139.701, {
  displayName: { text: 'らぁ麺 はやし田' }, rating: 4.4, userRatingCount: 900,
  types: ['restaurant'], primaryType: 'restaurant',
})
const shinaSobaShop = place('shina-1', 35.691, 139.701, {
  displayName: { text: '支那そばや 本店' }, rating: 4.3, userRatingCount: 700,
  types: ['restaurant'], primaryType: 'restaurant',
})
const aburaSobaShop = place('abura-1', 35.691, 139.701, {
  displayName: { text: '油そば 東京油組総本店' }, rating: 4.0, userRatingCount: 600,
  types: ['restaurant'], primaryType: 'restaurant',
})
const hanabiShop = place('hanabi-1', 35.691, 139.701, {
  displayName: { text: '台湾まぜそば はなび' }, rating: 4.2, userRatingCount: 500,
  types: ['restaurant'], primaryType: 'restaurant',
})
const taketoraShop = place('taketora-1', 35.691, 139.701, {
  displayName: { text: '麺匠 竹虎 六本木店' }, rating: 4.1, userRatingCount: 800,
  types: ['restaurant'], primaryType: 'restaurant',
})
const tadokoroShop = place('tadokoro-1', 35.691, 139.701, {
  displayName: { text: '麺場 田所商店' }, rating: 4.0, userRatingCount: 900,
  types: ['restaurant'], primaryType: 'restaurant',
})
const daikichiShop = place('daikichi-1', 35.691, 139.701, {
  displayName: { text: 'やきとり大吉' }, rating: 4.0, userRatingCount: 700,
  types: ['restaurant'], primaryType: 'restaurant',
})
const sakuraSobaShop = place('sakura-soba-1', 35.691, 139.701, {
  displayName: { text: '手打ち蕎麥 さくら' }, rating: 4.2, userRatingCount: 400,
  types: ['restaurant'], primaryType: 'restaurant',
})
const sobaAnShop = place('soba-an-1', 35.691, 139.701, {
  displayName: { text: '蕎麥庵' }, rating: 4.1, userRatingCount: 300,
  types: ['restaurant'], primaryType: 'restaurant',
})

describe('種類判斷修正（紅隊 round 4 Finding 1／2／3）', () => {
  /** 池子裡只有一家店：被排除就 422，選中才是沒被誤判。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  function mockKind(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first, validShop('ok1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  const mealStop = [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }]
  it("excludeKinds ['udon']：池子只有らぁ麺 飯田商店（拉麵店）時要選中它，不能 422", async () => {
    const g = mockSingle(iidaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('iida-1')
  })
  it("excludeKinds ['udon']：池子只有らぁ麺 はやし田時要選中它", async () => {
    const g = mockSingle(hayashidaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('hayashida-1')
  })
  it("excludeKinds ['soba']：池子只有支那そばや 本店（拉麵店）時要選中它", async () => {
    const g = mockSingle(shinaSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('shina-1')
  })
  it("excludeKinds ['soba']：池子只有油そば 東京油組総本店時要選中它", async () => {
    const g = mockSingle(aburaSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('abura-1')
  })
  it("excludeKinds ['soba']：池子只有台湾まぜそば はなび時要選中它", async () => {
    const g = mockSingle(hanabiShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('hanabi-1')
  })
  it("excludeKinds ['udon']：池子只有麺匠 竹虎 六本木店時要選中它", async () => {
    const g = mockSingle(taketoraShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('taketora-1')
  })
  it("excludeKinds ['udon']：池子只有麺場 田所商店時要選中它", async () => {
    const g = mockSingle(tadokoroShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('tadokoro-1')
  })
  it("excludeKinds ['yakitori']：やきとり大吉不被選（串燒關鍵字要認得到）", async () => {
    const g = mockKind(daikichiShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['yakitori'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['soba']：手打ち蕎麥 さくら不被選（繁體蕎麥要認得到）", async () => {
    const g = mockKind(sakuraSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['soba']：蕎麥庵不被選", async () => {
    const g = mockKind(sobaAnShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})

describe('非自動站新解析也跑 DENY 檢查（紅隊 round 4 Finding 4）', () => {
  /** 指定地名查回什麼就回什麼：只有車站時，車站不能當成候選。 */
  function mockPlaces(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it('meal 指定「渋谷駅」、查回只有車站：不回傳車站當候選（422 no_more_options）', async () => {
    const g = mockPlaces([stationShop])
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, specified: true, place: '渋谷駅' }] }))
    expect(res.status).toBe(422)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('no_more_options')
    expect(JSON.stringify(data)).not.toContain('shibuya-station')
  })
  it('meal 固定安排「渋谷駅」、查回只有車站：不回傳車站當候選（422 unresolved_stops）', async () => {
    const g = mockPlaces([stationShop])
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, locked: true, custom: true, place: '渋谷駅' }] }))
    expect(res.status).toBe(422)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('unresolved_stops')
    expect(JSON.stringify(data)).not.toContain('shibuya-station')
  })
  it('meal 指定「渋谷駅」、查回車站＋合格店：選合格店，不選車站', async () => {
    const g = mockPlaces([stationShop, validShop('ok1', 0)])
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, specified: true, place: '渋谷駅' }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
})
