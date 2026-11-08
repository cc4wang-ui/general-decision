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
  displayName: { text: '丸亀製麺 渋谷店' }, rating: 4.8, userRatingCount: 300,
  types: ['restaurant'], primaryType: 'restaurant',
})
/** round 14：店名不再判——「烏龍麵專門店」這個名字本身不再是烏龍麵。 */
const udonNameOnlyShop = place('udon-name-1', 35.691, 139.701, {
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

  it('候選全被排除：該站顯示無候選（200），而不是整單 422，也不是靜默留原店', async () => {
    const g = mockGoogleSinglePage()
    void g
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('filtered')
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
  /** 池子只有一家店時選中才是確定的：兩家都合格時隨機挑，斷言第一家會不穩定。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it('dislikedKinds 含 udon：丸亀製麺（品牌表）永遠不被選', async () => {
    const g = mockKind(udonShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it('dislikedKinds 含 udon（round 14）：「烏龍麵專門店」這個名字本身不再是烏龍麵——排除 udon 時照選（漏判），擋它只能靠單店排除', async () => {
    const g = mockSingle(udonNameOnlyShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('udon-name-1')
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
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it("excludeKinds ['udon']：麺喜やしま不被種類排除（round 7：弱訊號刪掉後是漏判——名字只有一個「麺」字、類型只有 restaurant，種類判不出來；擋它只能靠單店排除）", async () => {
    const g = mockSingle(yashimaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('yashima-1')
  })
  it('exclude [麺喜やしま的 id]：單店排除照樣擋得住它（漏判的店只能這樣擋）', async () => {
    const g = mockSingle(yashimaShop)
    void g
    const res = await handler(post({ origin: HERE, exclude: ['yashima-1'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('filtered')
  })
  it("excludeKinds ['yakiniku']：叙々苑不被選（yakiniku_restaurant 歸一化成 yakiniku）", async () => {
    const g = mockKind(jojoenShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['yakiniku'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ok1')
  })
  it("excludeKinds ['soba']：藪蕎麦 round 13 起不被種類排除（SOBA 正則刪掉——店名裡的「蕎麦」不再判，漏判；擋它只能靠單店排除）", async () => {
    const g = mockSingle(yabuSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('yabu-1')
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
  /** 池子裡只有一家店：被排除就無候選，選中才是沒被誤判。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
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
  it("excludeKinds ['sushi']（round 14 更正）：スシロー round 14 起是漏判——排除 sushi 時照選（「スシ」不再判壽司）", async () => {
    const g = mockSingle(sushiroShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['sushi'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('sushiro-1')
  })
  it("excludeKinds ['tonkatsu']（round 14 更正）：とんかつ和幸 round 14 起是漏判——排除 tonkatsu 時照選（「とんかつ」不再判炸豬排）", async () => {
    const g = mockSingle(wakohShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['tonkatsu'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('wakoh-1')
  })
})

describe('種類判斷修正（紅隊 round 3 Finding B：中華そば）', () => {
  /** 池子裡只有一家店：被排除就無候選，選中才是沒被誤判。 */
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
  it("excludeKinds ['ramen']（round 14 更正）：中華そば 青葉 round 14 起是漏判——排除 ramen 時照選（「中華そば」不再判拉麵）", async () => {
    const g = mockSingle(chukaSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('chuka-soba-1')
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
  /** 池子裡只有一家店：被排除就無候選，選中才是沒被誤判。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
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
  it("excludeKinds ['yakitori']（round 14 更正）：やきとり大吉 round 14 起是漏判——排除 yakitori 時照選（「やきとり」不再判串燒）", async () => {
    const g = mockSingle(daikichiShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['yakitori'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('daikichi-1')
  })
  it("excludeKinds ['soba']：手打ち蕎麥 さくら round 13 起不被種類排除（繁體蕎麥也不判，漏判）", async () => {
    const g = mockSingle(sakuraSobaShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('sakura-soba-1')
  })
  it("excludeKinds ['soba']：蕎麥庵 round 13 起不被種類排除（同上）", async () => {
    const g = mockSingle(sobaAnShop)
    void g
    const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('soba-an-1')
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
  it('meal 指定「渋谷駅」、查回只有車站：不回傳車站當候選（200＋無候選，不是整單 422）', async () => {
    const g = mockPlaces([stationShop])
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, specified: true, place: '渋谷駅' }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('filtered')
    expect(JSON.stringify(data)).not.toContain('shibuya-station')
  })
  it('meal 固定安排「渋谷駅」、查回只有車站：不回傳車站當候選（200＋無候選，不是 422 unresolved_stops）', async () => {
    const g = mockPlaces([stationShop])
    void g
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, locked: true, custom: true, place: '渋谷駅' }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('filtered')
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

describe('種類判斷修正（紅隊 round 5 F1–F6，round 6 兩層拉麵表）', () => {
  /** 池子裡只有一家店：被排除就無候選，選中才是沒被誤判。雙向都要驗：排除真種類要 200＋無候選，排除誤判種類要 200 選中。 */
  function mockSingle(first: unknown) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [first] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  const mealStop = [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }]
  const coffeeStop = [{ id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 30 }]
  const shop = (id: string, name: string, primaryType = 'restaurant') => place(id, 35.691, 139.701, {
    displayName: { text: name }, rating: 4.5, userRatingCount: 200,
    types: [primaryType, 'restaurant'], primaryType,
  })
  const kaenShop = shop('kaen-1', 'らあめん花月嵐')
  const nitenShop = shop('niten-1', 'つけそば 弐天')
  const ryusukeShop = shop('ryusuke-1', '特級鶏蕎麦 龍介')
  // 手打麺 永吉／麺食堂88：名字只有模糊前綴（round 7 刪掉前綴表後認不出來），
  // 真實的 Google primaryType 是 ramen_restaurant——類型優先就認得出。
  const nagayoshiShop = shop('nagayoshi-1', '手打麺 永吉', 'ramen_restaurant')
  const oomeShop = shop('oome-1', 'らー麺 大芽')
  const shokudo88Shop = shop('shokudo88-1', '麺食堂88', 'ramen_restaurant')
  const akedoyaShop = shop('akedoya-1', 'ら～麺あけどや')
  const sobaShinShop = shop('sobashin-1', '麺処、そば志ん、')
  const miyagawaShop = shop('miyagawa-1', 'やき鳥 宮川')
  const nagomiyaShop = shop('nagomiya-1', '炭火焼き鳥 池袋 和み屋')
  const saitoShop = shop('saito-1', '鮨 さいとう')
  const renoirShop = shop('renoir-1', '喫茶室ルノアール')
  it("F1（round 14 更正）：らあめん花月嵐 round 14 起是漏判——['ramen'] → 200 照選；['udon'] → 200 也照選（「らあめん」不再判拉麵）", async () => {
    mockSingle(kaenShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('kaen-1')
    mockSingle(kaenShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('kaen-1')
  })
  it("F3（round 13 更正）：つけそば 弐天 round 13 起是漏判——['soba'] → 200 選中；['ramen'] → 200 也選中（名字不再判拉麵）", async () => {
    mockSingle(nitenShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('niten-1')
    mockSingle(nitenShop)
    const alsoGood = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(alsoGood.status).toBe(200)
    const alsoData = await alsoGood.json() as { stops: { candidate?: { id: string } }[] }
    expect(alsoData.stops[0]!.candidate?.id).toBe('niten-1')
  })
  it("F3（round 13 更正）：特級鶏蕎麦 龍介 round 13 起是漏判——['soba'] → 200 選中；['ramen'] → 200 也選中（名字不再判拉麵）", async () => {
    mockSingle(ryusukeShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('ryusuke-1')
    mockSingle(ryusukeShop)
    const alsoGood = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(alsoGood.status).toBe(200)
    const alsoData = await alsoGood.json() as { stops: { candidate?: { id: string } }[] }
    expect(alsoData.stops[0]!.candidate?.id).toBe('ryusuke-1')
  })
  it("F4：手打麺 永吉是拉麵——['udon'] → 200 選中；['ramen'] → 200 無候選", async () => {
    mockSingle(nagayoshiShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('nagayoshi-1')
    mockSingle(nagayoshiShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(badData.stops[0]!.candidate).toBeUndefined()
    expect(badData.stops[0]!.noCandidate).toBe(true)
    expect(badData.stops[0]!.noCandidateReason).toBe('filtered')
  })
  it("F4（round 14 更正）：らー麺 大芽 round 14 起是漏判——['udon'] → 200 照選；['ramen'] → 200 也照選（「らー麺」不再判拉麵）", async () => {
    mockSingle(oomeShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('oome-1')
    mockSingle(oomeShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('oome-1')
  })
  it("F4：麺食堂88是拉麵——['udon'] → 200 選中；['ramen'] → 200 無候選", async () => {
    mockSingle(shokudo88Shop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('shokudo88-1')
    mockSingle(shokudo88Shop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(badData.stops[0]!.candidate).toBeUndefined()
    expect(badData.stops[0]!.noCandidate).toBe(true)
    expect(badData.stops[0]!.noCandidateReason).toBe('filtered')
  })
  it("F4（round 14 更正）：ら～麺あけどや round 14 起是漏判——['udon'] → 200 照選；['ramen'] → 200 也照選（「ら～麺」不再判拉麵）", async () => {
    mockSingle(akedoyaShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('akedoya-1')
    mockSingle(akedoyaShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('akedoya-1')
  })
  it("F6（round 13 更正）：麺処、そば志ん、 round 13 起是漏判——['ramen'] → 200 選中；['soba'] → 200 也選中（店名裡的「そば」不再判蕎麥麵）", async () => {
    mockSingle(sobaShinShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('sobashin-1')
    mockSingle(sobaShinShop)
    const alsoGood = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: mealStop }))
    expect(alsoGood.status).toBe(200)
    const alsoData = await alsoGood.json() as { stops: { candidate?: { id: string } }[] }
    expect(alsoData.stops[0]!.candidate?.id).toBe('sobashin-1')
  })
  it("F2（round 14 更正）：やき鳥 宮川 round 14 起是漏判——['yakitori'] → 200 照選；['ramen'] → 200 也照選（「やき鳥」不再判串燒）", async () => {
    mockSingle(miyagawaShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['yakitori'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('miyagawa-1')
    mockSingle(miyagawaShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('miyagawa-1')
  })
  it("F2（round 14 更正）：炭火焼き鳥 池袋 和み屋 round 14 起是漏判——['yakitori'] → 200 照選；['ramen'] → 200 也照選（「焼き鳥」不再判串燒）", async () => {
    mockSingle(nagomiyaShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['yakitori'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('nagomiya-1')
    mockSingle(nagomiyaShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('nagomiya-1')
  })
  it("F5（round 14 更正）：鮨 さいとう round 14 起是漏判——['sushi'] → 200 照選；['ramen'] → 200 也照選（「鮨」不再判壽司）", async () => {
    mockSingle(saitoShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['sushi'], stops: mealStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('saito-1')
    mockSingle(saitoShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: mealStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('saito-1')
  })
  it("F5（round 14 更正）：喫茶室ルノアール round 14 起是漏判——咖啡站 ['cafe'] → 200 照選；['ramen'] → 200 也照選（「喫茶」不再判咖啡）", async () => {
    mockSingle(renoirShop)
    const bad = await handler(post({ origin: HERE, excludeKinds: ['cafe'], stops: coffeeStop }))
    expect(bad.status).toBe(200)
    const badData = await bad.json() as { stops: { candidate?: { id: string } }[] }
    expect(badData.stops[0]!.candidate?.id).toBe('renoir-1')
    mockSingle(renoirShop)
    const good = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: coffeeStop }))
    expect(good.status).toBe(200)
    const data = await good.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('renoir-1')
  })
})

describe('地區偏好（紅隊 round 5 F7，round 6 結構化修復）', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 } // 渋谷駅
  /** 原宿店距渋谷駅中心約 1.23 公里（在 3500 公尺舊半徑內、1000 公尺地區半徑外）；澀谷店約 72 公尺。 */
  const harajukuDrug = place('sugi-harajuku', 35.6704, 139.7030, {
    displayName: { text: 'スギ薬局 原宿店' }, rating: 4.0, userRatingCount: 150,
    types: ['drugstore'], primaryType: 'drugstore',
  })
  const shibuyaDrug = place('sundrug-shibuya', 35.6590, 139.7010, {
    displayName: { text: 'サンドラッグ 渋谷店' }, rating: 4.1, userRatingCount: 200,
    types: ['drugstore'], primaryType: 'drugstore',
  })
  const shoppingStop = [{ id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30 }]
  function mockPlaces(places: unknown[]) {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f, calls }
  }
  const candidateId = async (res: Response) => {
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    return data.stops[0]!.candidate?.id
  }
  it('地區偏好開啟（澀谷）：池子有原宿店＋澀谷店 → 只選澀谷店', async () => {
    mockPlaces([harajukuDrug, shibuyaDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop }))
    expect(res.status).toBe(200)
    expect(await candidateId(res)).toBe('sundrug-shibuya')
  })
  it('地區偏好開啟：池子只有原宿店 → 200＋無候選（原因 area，不是默默選跨區店，也不是整單 422）', async () => {
    mockPlaces([harajukuDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('area')
  })
  it('地區偏好關掉：池子只有原宿店 → 200 選中原宿店', async () => {
    mockPlaces([harajukuDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: false, stops: shoppingStop }))
    expect(res.status).toBe(200)
    expect(await candidateId(res)).toBe('sugi-harajuku')
  })
  it('地區偏好開啟、澀谷店被排除：池子有原宿店＋澀谷店 → 200＋無候選（原因 area，不退回跨區店）', async () => {
    mockPlaces([harajukuDrug, shibuyaDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, exclude: ['sundrug-shibuya'], stops: shoppingStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('area')
  })
  it('地區偏好關掉、澀谷店被排除：池子有原宿店＋澀谷店 → 200 選中原宿店', async () => {
    mockPlaces([harajukuDrug, shibuyaDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: false, exclude: ['sundrug-shibuya'], stops: shoppingStop }))
    expect(res.status).toBe(200)
    expect(await candidateId(res)).toBe('sugi-harajuku')
  })
  it('未知地區名：退回澀谷（round 7，不再 fail-open——未知地區＋開啟時原宿店要被擋掉，顯示無候選原因 area）', async () => {
    mockPlaces([harajukuDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '吉祥寺', areaOnly: true, stops: shoppingStop }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
    expect(data.stops[0]!.noCandidate).toBe(true)
    expect(data.stops[0]!.noCandidateReason).toBe('area')
  })
  it('指定地點不受地區限制：指定「スギ薬局 原宿店」、地區偏好開啟 → 照樣保留', async () => {
    mockPlaces([harajukuDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [{ id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30, specified: true, place: 'スギ薬局 原宿店' }] }))
    expect(res.status).toBe(200)
    expect(await candidateId(res)).toBe('sugi-harajuku')
  })
  it('地區偏好開啟時，Places 查詢的 locationBias 半徑縮到 1000；關掉時維持 3500', async () => {
    const on = mockPlaces([shibuyaDrug])
    await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop }))
    const onCall = on.calls.find((c) => c.url.includes('places:searchText'))
    expect((onCall?.body.locationBias as { circle: { radius: number } }).circle.radius).toBe(1000)
    const off = mockPlaces([shibuyaDrug])
    await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: false, stops: shoppingStop }))
    const offCall = off.calls.find((c) => c.url.includes('places:searchText'))
    expect((offCall?.body.locationBias as { circle: { radius: number } }).circle.radius).toBe(3500)
  })
})

describe('既有候選保留規則統一（紅隊 round 5 item 7，round 6）', () => {
  /** 伺服器收到的既有候選是 lat／lng 形狀（不是 Places 的 location.latitude）。 */
  const stationCandidate = { id: 'shibuya-station', name: '渋谷駅', lat: 35.6595, lng: 139.7005, address: '渋谷駅', mapUrl: 'https://maps.google.com/?cid=shibuya-station', types: ['transit_station', 'train_station'], primaryType: 'transit_station', rating: 4.2, userRatingCount: 9000 }
  function mockPlaces(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it('已完成 meal 的車站候選保留（使用者的選擇，前後端統一規則）', async () => {
    mockPlaces([])
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, done: true, candidate: stationCandidate }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate?.id).toBe('shibuya-station')
  })
  it('已完成 rest 的車站候選清掉：rest 從來沒有可拜訪的店家，已完成與否都不帶候選', async () => {
    mockPlaces([])
    const res = await handler(post({ origin: HERE, stops: [{ id: 'rest', kind: 'rest', title: '散步回家', minutes: 30, done: true, candidate: stationCandidate }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
  })
  it('已完成 rest 無候選時不算未解決（舊版 422 unresolved_stops；標記完成後整單失敗）', async () => {
    mockPlaces([])
    const res = await handler(post({ origin: HERE, stops: [{ id: 'rest', kind: 'rest', title: '散步回家', minutes: 30, done: true }] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { stops: { candidate?: { id: string } }[] }
    expect(data.stops[0]!.candidate).toBeUndefined()
  })
})

/** Round 7 結構性修復：既有候選重驗（L1／L2）、無候選取代整單 422、F7 錨點、邊界、Routes 成功合併。 */
describe('既有候選重驗與無候選（紅隊 round 6 L1／L2，round 7）', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 } // 渋谷駅＝澀谷地區中心
  /** 澀谷店（距中心約 72 公尺）、第二間澀谷店（約 35 公尺）、原宿店（約 1233 公尺）。 */
  const shibuyaDrug = place('sundrug-shibuya', 35.6590, 139.7010, {
    displayName: { text: 'サンドラッグ 渋谷店' }, rating: 4.1, userRatingCount: 200,
    types: ['drugstore'], primaryType: 'drugstore',
  })
  const shibuyaDrug2 = place('matsukiyo-shibuya', 35.6592, 139.7008, {
    displayName: { text: 'マツモトキヨシ 渋谷店' }, rating: 4.0, userRatingCount: 180,
    types: ['drugstore'], primaryType: 'drugstore',
  })
  const harajukuDrug = place('sugi-harajuku', 35.6704, 139.7030, {
    displayName: { text: 'スギ薬局 原宿店' }, rating: 4.0, userRatingCount: 150,
    types: ['drugstore'], primaryType: 'drugstore',
  })
  /** 伺服器收到的既有候選是 lat／lng 形狀。 */
  const drugCandidate = (p: ReturnType<typeof place>, extra: Record<string, unknown> = {}) => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress, mapUrl: p.googleMapsUri,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating,
    userRatingCount: p.userRatingCount, types: p.types, primaryType: p.primaryType, ...extra,
  })
  const shoppingStop = (candidate?: unknown) => [{ id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30, ...(candidate ? { candidate } : {}) }]
  type StopOut = { id: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string; place?: string }
  /** Response 的 body 只能讀一次：一次讀完再按 id 找站。 */
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  function mockPlaces(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  /** 依查詢回不同池子：meal 查回麺喜やしま（只有它），coffee 查回一間咖啡店。 */
  function mockPerQuery() {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const q = String(body.textQuery)
      const places = q.includes('coffee') ? [validShop('cafe-1', 0)] : [yashimaShop]
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { f }
  }
  it('L1：地區偏好開啟＋既有原宿候選＋整單重找 → 原宿店被換成澀谷店，不再照留', async () => {
    mockPlaces([harajukuDrug, shibuyaDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop(drugCandidate(harajukuDrug)) }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'shopping')
    expect(stop.candidate?.id).toBe('sundrug-shibuya')
    expect(stop.noCandidate).toBeUndefined()
  })
  it('L1：既有候選評論只有 12 則 → 不保留，換成合格店', async () => {
    mockPlaces([shibuyaDrug])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop(drugCandidate(shibuyaDrug, { userRatingCount: 12 })) }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'shopping')
    expect(stop.candidate?.id).toBe('sundrug-shibuya')
  })
  it('L1：既有候選在 exclude 裡 → 不保留，換成另一間澀谷店', async () => {
    mockPlaces([shibuyaDrug, shibuyaDrug2])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, exclude: ['sundrug-shibuya'], stops: shoppingStop(drugCandidate(shibuyaDrug)) }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'shopping')
    expect(stop.candidate?.id).toBe('matsukiyo-shibuya')
  })
  it('L1：既有候選的種類在 excludeKinds 裡 → 不保留，換成別的店', async () => {
    const marugameCandidate = { id: 'maruya-1', name: '丸亀製麺 渋谷店', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=maruya-1', lat: 35.6590, lng: 139.7010, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' }
    mockPlaces([validShop('ok1', 0)])
    const res = await handler(post({ origin: SHIBUYA, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: marugameCandidate }] }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'meal')
    expect(stop.candidate?.id).toBe('ok1')
  })
  it('L1：指定地點的候選被按「不喜歡」：id 排除對所有站生效，改顯示無候選（地點文字留著）', async () => {
    const stationCandidate = { id: 'shibuya-station', name: '渋谷駅', address: '渋谷駅地下 1F', mapUrl: 'https://maps.google.com/?cid=shibuya-station', lat: 35.6595, lng: 139.7005, rating: 4.2, userRatingCount: 9000, types: ['transit_station', 'train_station'], primaryType: 'transit_station' }
    mockPlaces([stationShop])
    const res = await handler(post({ origin: HERE, exclude: ['shibuya-station'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45, specified: true, place: '渋谷駅', candidate: stationCandidate }] }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'meal')
    expect(stop.candidate).toBeUndefined()
    expect(stop.noCandidate).toBe(true)
    expect(stop.noCandidateReason).toBe('filtered')
    expect(stop.place).toBe('渋谷駅')
  })
  it('L2：不喜歡的店＋池子只有它＋shuffle → 該站無候選（200），店消失，整單不 422，其他站照常', async () => {
    mockPerQuery()
    const yashimaCandidate = { id: 'yashima-1', name: '麺喜やしま', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=yashima-1', lat: 35.691, lng: 139.701, rating: 4.2, userRatingCount: 808, types: ['restaurant'], primaryType: 'restaurant' }
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['yashima-1'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: yashimaCandidate },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60 },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    const meal = stopOf(stops, 'meal')
    expect(meal.candidate).toBeUndefined()
    expect(meal.noCandidate).toBe(true)
    expect(meal.noCandidateReason).toBe('filtered')
    const coffee = stopOf(stops, 'coffee')
    expect(coffee.candidate?.id).toBe('cafe-1')
    // 再重找一次：還是無候選，不會把不喜歡的店找回來。
    mockPerQuery()
    const again = await handler(post({ origin: HERE, exclude: ['yashima-1'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, noCandidate: true, noCandidateReason: 'filtered' },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: { id: 'cafe-1', name: 'cafe-1食堂', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=cafe-1', lat: 35.69, lng: 139.70, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' } },
    ] }))
    expect(again.status).toBe(200)
    const mealAgain = stopOf(await readStops(again), 'meal')
    expect(mealAgain.candidate).toBeUndefined()
    expect(mealAgain.noCandidate).toBe(true)
  })
  it('F7 錨點：GPS 在新宿、地區是澀谷、池子只有新宿店 → 200＋無候選（原因 area，不是只說換出發地）', async () => {
    const shinjukuDrug = place('sugi-shinjuku', 35.6900, 139.7010, {
      displayName: { text: 'スギ薬局 新宿店' }, rating: 4.0, userRatingCount: 150,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    mockPlaces([shinjukuDrug])
    const res = await handler(post({ origin: HERE, area: '澀谷', areaOnly: true, stops: shoppingStop() }))
    expect(res.status).toBe(200)
    const stop = stopOf(await readStops(res), 'shopping')
    expect(stop.candidate).toBeUndefined()
    expect(stop.noCandidate).toBe(true)
    expect(stop.noCandidateReason).toBe('area')
  })
  it('地區邊界：距澀谷中心 998 公尺的店在內、1003 公尺的店在外', async () => {
    const inside = place('edge-in', 35.6595 + 0.00898, 139.7005, {
      displayName: { text: '邊界內藥局' }, rating: 4.0, userRatingCount: 150,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    mockPlaces([inside])
    const resIn = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop() }))
    expect(resIn.status).toBe(200)
    expect(stopOf(await readStops(resIn), 'shopping').candidate?.id).toBe('edge-in')
    const outside = place('edge-out', 35.6595 + 0.00902, 139.7005, {
      displayName: { text: '邊界外藥局' }, rating: 4.0, userRatingCount: 150,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    mockPlaces([outside])
    const resOut = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: shoppingStop() }))
    expect(resOut.status).toBe(200)
    const out = stopOf(await readStops(resOut), 'shopping')
    expect(out.candidate).toBeUndefined()
    expect(out.noCandidateReason).toBe('area')
  })
  it('Routes 成功時 rest 站也要回來（舊版只回有候選的站，rest 在成功路徑會整站消失）', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) {
        const elements = [
          { originIndex: 0, destinationIndex: 1, duration: '300s', distanceMeters: 400 },
          { originIndex: 1, destinationIndex: 0, duration: '300s', distanceMeters: 400 },
        ]
        return new Response(JSON.stringify(elements), { status: 200 })
      }
      return new Response(JSON.stringify({ places: [validShop('m1', 0)] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ origin: SHIBUYA, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45 },
      { id: 'rest', kind: 'rest', title: '散步回家', minutes: 75 },
    ] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { routeVerified: boolean; stops: { id: string; candidate?: { id: string } }[] }
    expect(data.routeVerified).toBe(true)
    expect(data.stops.map((s) => s.id)).toEqual(['meal', 'rest'])
    expect(data.stops.find((s) => s.id === 'meal')?.candidate?.id).toBe('m1')
  })
  it('Routes 成功時無候選站也要回來（不只回有候選的站）', async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) {
        const elements = [
          { originIndex: 0, destinationIndex: 1, duration: '300s', distanceMeters: 400 },
          { originIndex: 1, destinationIndex: 0, duration: '300s', distanceMeters: 400 },
        ]
        return new Response(JSON.stringify(elements), { status: 200 })
      }
      // meal 查回澀谷店；shopping 查回原宿店（地區偏好擋掉 → 無候選原因 area）。
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const places = String(body.textQuery).includes('drugstore') ? [harajukuDrug] : [validShop('m1', 0)]
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45 },
      { id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30 },
      { id: 'rest', kind: 'rest', title: '散步回家', minutes: 75 },
    ] }))
    expect(res.status).toBe(200)
    const data = await res.json() as { routeVerified: boolean; stops: StopOut[] }
    expect(data.routeVerified).toBe(true)
    expect(data.stops.map((s) => s.id)).toEqual(['meal', 'shopping', 'rest'])
    const shopping = data.stops.find((s) => s.id === 'shopping')!
    expect(shopping.candidate).toBeUndefined()
    expect(shopping.noCandidate).toBe(true)
    expect(shopping.noCandidateReason).toBe('area')
    expect(data.stops.find((s) => s.id === 'rest')?.candidate).toBeUndefined()
  })
})

describe('round 8：兩份排除清單分開（K1）／無候選標題還原／order() 不移無候選站', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 }
  /** 伺服器收到的既有候選是 lat／lng 形狀。 */
  const cand = (p: ReturnType<typeof place>) => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress, mapUrl: p.googleMapsUri,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating,
    userRatingCount: p.userRatingCount, types: p.types, primaryType: p.primaryType,
  })
  type StopOut = { id: string; title?: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  /** 依查詢回不同池子：meal → 兩間定食店，coffee → 只有一間咖啡店。 */
  function mockTwoPools() {
    const mealA = validShop('meal-a', 0)
    const mealB = validShop('meal-b', 1)
    const cafe1 = validShop('cafe-1', 0)
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const q = String(body.textQuery)
      const places = q.includes('coffee') ? [cafe1] : [mealA, mealB]
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return { mealA, mealB, cafe1 }
  }
  it('K1：單站 shuffle 換 meal，coffee 的現任候選照留（others 只在新搜尋防重複，不進 retention 重驗；池子只有一間咖啡店時也不能變無候選）', async () => {
    const { mealA, cafe1 } = mockTwoPools()
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['meal-a'], others: ['cafe-1'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(mealA) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(cafe1) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    // meal 換成另一間，coffee 的現任候選留著（round 7 會把它清掉重找，池子只有一間就變無候選）
    expect(stopOf(stops, 'meal').candidate?.id).toBe('meal-b')
    expect(stopOf(stops, 'coffee').candidate?.id).toBe('cafe-1')
    expect(stopOf(stops, 'coffee').noCandidate).toBeUndefined()
  })
  it('K1 對照（K2，round 11 改寫）：完整重新生成（不帶 shuffle、不帶 others）不再保留自動站——全部重找；seen 排除舊店時舊店不會回來（保留的話 seen 擋不住它）', async () => {
    const { mealA, cafe1 } = mockTwoPools()
    const res = await handler(post({ origin: HERE, seen: ['meal-a'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(mealA) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(cafe1) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    // meal 舊候選在 seen 裡：保留分支會無視 seen 留著它；重找才會換成 meal-b
    expect(stopOf(stops, 'meal').candidate?.id).toBe('meal-b')
    // coffee 池子只有一間，重找還是它
    expect(stopOf(stops, 'coffee').candidate?.id).toBe('cafe-1')
  })
  it('K1：others 還能防重複——meal 重找時不會選到 coffee 現任候選那間店', async () => {
    const cafe1 = validShop('cafe-1', 0)
    const mealB = validShop('meal-b', 1)
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const q = String(body.textQuery)
      // meal 池子裡第一間就是 coffee 的現任候選（同一間店也會出現在別站的查詢結果裡）
      const places = q.includes('coffee') ? [cafe1] : [cafe1, mealB]
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['meal-a'], others: ['cafe-1'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(validShop('meal-a', 0)) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(cafe1) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stopOf(stops, 'meal').candidate?.id).toBe('meal-b')
    expect(stopOf(stops, 'coffee').candidate?.id).toBe('cafe-1')
  })
  it('無候選標題還原：麺喜やしま被不喜歡、池子只有它 → 該站無候選，title 是目錄標題「澀谷｜一人友善的日式定食」，不是店名', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [yashimaShop] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ origin: HERE, shuffle: 'meal', exclude: ['yashima-1'], stops: [
      { id: 'meal', kind: 'meal', title: '麺喜やしま', minutes: 45, candidate: cand(yashimaShop) },
    ] }))
    expect(res.status).toBe(200)
    const meal = stopOf(await readStops(res), 'meal')
    expect(meal.candidate).toBeUndefined()
    expect(meal.noCandidate).toBe(true)
    expect(meal.noCandidateReason).toBe('filtered')
    expect(meal.title).toBe('澀谷｜一人友善的日式定食')
  })
  it('order() 不移無候選站：meal（有候選）→ shopping（無候選，地區擋住）→ coffee（有候選），順序照樣是 meal、shopping、coffee（紅隊 round 7 G）', async () => {
    const harajukuDrug = place('sugi-harajuku', 35.6704, 139.7030, {
      displayName: { text: 'スギ薬局 原宿店' }, rating: 4.0, userRatingCount: 150,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const q = String(body.textQuery)
      const places = q.includes('drugstore') ? [harajukuDrug] : q.includes('coffee') ? [validShop('cafe-1', 0)] : [validShop('m1', 0)]
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45 },
      { id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30 },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60 },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stops.map((s) => s.id)).toEqual(['meal', 'shopping', 'coffee'])
    const shopping = stopOf(stops, 'shopping')
    expect(shopping.candidate).toBeUndefined()
    expect(shopping.noCandidate).toBe(true)
    expect(shopping.noCandidateReason).toBe('area')
  })
  it('A（round 13 更正）：藪蕎麦配 noodle_shop——排除 soba 時照選（不再是蕎麥麵）、排除 ramen 時照選、排除 noodle 時不選（泛用 fallback）', async () => {
    const yabuNoodle = place('yabu-noodle', 35.691, 139.701, {
      displayName: { text: '藪蕎麦' }, rating: 4.1, userRatingCount: 300,
      types: ['noodle_shop', 'restaurant'], primaryType: 'noodle_shop',
    })
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [yabuNoodle] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const excluded = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(excluded.status).toBe(200)
    expect(stopOf(await readStops(excluded), 'meal').candidate?.id).toBe('yabu-noodle')
    const contrast = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(contrast.status).toBe(200)
    expect(stopOf(await readStops(contrast), 'meal').candidate?.id).toBe('yabu-noodle')
    const noodleExcluded = await handler(post({ origin: HERE, excludeKinds: ['noodle'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(noodleExcluded.status).toBe(200)
    const noodleMeal = stopOf(await readStops(noodleExcluded), 'meal')
    expect(noodleMeal.candidate).toBeUndefined()
    expect(noodleMeal.noCandidate).toBe(true)
  })
  it('A（round 14 更正）：麺処讃岐うどん配 noodle_shop round 14 起是泛用 noodle——排除 noodle 時不選；排除 udon／ramen 時照選', async () => {
    const udonNoodle = place('udon-noodle', 35.691, 139.701, {
      displayName: { text: '麺処讃岐うどん' }, rating: 4.2, userRatingCount: 300,
      types: ['noodle_shop', 'restaurant'], primaryType: 'noodle_shop',
    })
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places: [udonNoodle] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const excluded = await handler(post({ origin: HERE, excludeKinds: ['noodle'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(excluded.status).toBe(200)
    expect(stopOf(await readStops(excluded), 'meal').candidate).toBeUndefined()
    const contrast = await handler(post({ origin: HERE, excludeKinds: ['udon'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(contrast.status).toBe(200)
    expect(stopOf(await readStops(contrast), 'meal').candidate?.id).toBe('udon-noodle')
    const contrast2 = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(contrast2.status).toBe(200)
    expect(stopOf(await readStops(contrast2), 'meal').candidate?.id).toBe('udon-noodle')
  })
  it('B（round 13 更正）：RAMEN_SOBA 補的 5 間配 noodle_shop round 13 起都是漏判（店名無訊號、泛用 noodle）——排除 soba 時照選、排除 ramen 時照選、排除 noodle 時不選', async () => {
    const names = ['煮干しそば', '銀座鴨そば 九代目けいすけ', '塩そば専門店 桑ばら', '塩そば 一榮', 'SOBA HOUSE 金色不如帰']
    for (const [i, name] of names.entries()) {
      const p = place('ramen-soba-' + i, 35.691, 139.701, {
        displayName: { text: name }, rating: 4.2, userRatingCount: 300,
        types: ['noodle_shop', 'restaurant'], primaryType: 'noodle_shop',
      })
      const f = vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
        return new Response(JSON.stringify({ places: [p] }), { status: 200 })
      })
      vi.stubGlobal('fetch', f)
      const res = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
      expect(res.status).toBe(200)
      expect(stopOf(await readStops(res), 'meal').candidate?.id, name).toBe('ramen-soba-' + i)
      const resRamen = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
      expect(resRamen.status).toBe(200)
      expect(stopOf(await readStops(resRamen), 'meal').candidate?.id, name).toBe('ramen-soba-' + i)
      const resNoodle = await handler(post({ origin: HERE, excludeKinds: ['noodle'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
      expect(resNoodle.status).toBe(200)
      expect(stopOf(await readStops(resNoodle), 'meal').candidate, name).toBeUndefined()
    }
  })
})

describe('round 9 F1b／F2：既有候選缺評論數＝未知（保留）、新候選缺評論數＝不派、居酒屋類型', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 } // 渋谷駅＝澀谷地區中心
  type StopOut = { id: string; title?: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  function mockPlaces(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
  }
  /** 伺服器收到的既有候選是 lat／lng 形狀。 */
  const cand = (p: ReturnType<typeof place>) => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress, mapUrl: p.googleMapsUri,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating,
    userRatingCount: p.userRatingCount, types: p.types, primaryType: p.primaryType,
  })
  it('F1b：既有候選沒有 userRatingCount（舊存檔形狀）→ 保留，不換店、不 422；12 則的對照組照樣換掉（round 11 注意：完整重新生成不再保留自動站，所以這裡用單站 shuffle 別站的情境測保留路徑；保留重驗本身的規則不變）', async () => {
    const shibuyaDrug = place('sundrug-shibuya', 35.6590, 139.7010, {
      displayName: { text: 'サンドラッグ 渋谷店' }, rating: 4.1, userRatingCount: 200,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    const otherDrug = place('matsukiyo-shibuya', 35.6592, 139.7008, {
      displayName: { text: 'マツモトキヨシ 渋谷店' }, rating: 4.0, userRatingCount: 180,
      types: ['drugstore'], primaryType: 'drugstore',
    })
    mockPlaces([otherDrug])
    // 缺欄位的候選：JSON 傳過去時欄位不存在（舊存檔本來就沒存）
    const noCount = cand(shibuyaDrug) as Record<string, unknown>
    delete noCount.userRatingCount
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, shuffle: 'meal', stops: [{ id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30, candidate: noCount }, { id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    expect(stopOf(await readStops(res), 'shopping').candidate?.id).toBe('sundrug-shibuya')
    // 對照組：欄位存在且 12 則 → 不保留，換成池子裡的另一間
    mockPlaces([otherDrug])
    const low = cand(shibuyaDrug); low.userRatingCount = 12
    const res2 = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, shuffle: 'meal', stops: [{ id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30, candidate: low }, { id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res2.status).toBe(200)
    expect(stopOf(await readStops(res2), 'shopping').candidate?.id).toBe('matsukiyo-shibuya')
  })
  it('F1b 守衛：新查到的候選沒有 userRatingCount → 不派（venueOk：拿不到＝無法驗證＝不派，那是新派發的門檻，round 9 不動）', async () => {
    const noCountShop = place('no-count-1', 35.691, 139.701, {
      displayName: { text: '某定食店' }, rating: 4.5, userRatingCount: undefined,
      types: ['restaurant'], primaryType: 'restaurant',
    })
    mockPlaces([noCountShop])
    const res = await handler(post({ origin: HERE, stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(res.status).toBe(200)
    const meal = stopOf(await readStops(res), 'meal')
    expect(meal.candidate).toBeUndefined()
    expect(meal.noCandidate).toBe(true)
    expect(meal.noCandidateReason).toBe('filtered')
  })
  it('F2：鳥貴族（primaryType japanese_izakaya_restaurant）→ izakaya：排除 izakaya 時不選，排除 ramen 時照選', async () => {
    const torikizoku = place('torikizoku-1', 35.691, 139.701, {
      displayName: { text: '鳥貴族' }, rating: 4.2, userRatingCount: 300,
      types: ['japanese_izakaya_restaurant', 'restaurant'], primaryType: 'japanese_izakaya_restaurant',
    })
    mockPlaces([torikizoku])
    const excluded = await handler(post({ origin: HERE, excludeKinds: ['izakaya'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(excluded.status).toBe(200)
    expect(stopOf(await readStops(excluded), 'meal').candidate).toBeUndefined()
    mockPlaces([torikizoku])
    const contrast = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(contrast.status).toBe(200)
    expect(stopOf(await readStops(contrast), 'meal').candidate?.id).toBe('torikizoku-1')
  })
})

describe('round 10：R9-K1 同一請求內防重複（本請求已挑出的店）＋ B1／B2／B3／B4 伺服器雙向', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 } // 渋谷駅＝澀谷地區中心
  type StopOut = { id: string; title?: string; candidate?: { id: string }; noCandidate?: boolean; noCandidateReason?: string }
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  /** 伺服器收到的既有候選是 lat／lng 形狀。 */
  const cand = (p: ReturnType<typeof place>) => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress, mapUrl: p.googleMapsUri,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating,
    userRatingCount: p.userRatingCount, types: p.types, primaryType: p.primaryType,
  })
  /** 不論查詢都回同一池子（同一家店會出現在別站的查詢結果裡，live round 7 就有前例）。 */
  function mockPool(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
  }
  it('R9-K1：兩站同時重找、池子只有同一間店 → 只有一站拿到它，另一站無候選，絕不重複（紅隊 round 9 的證明案例）', async () => {
    const dup = place('dup-1', 35.691, 139.701, { displayName: { text: 'dup食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const oldMeal = validShop('old-meal', 0)
    const oldCoffee = validShop('old-coffee', 0)
    mockPool([dup])
    // 兩站的現任候選都在 exclude 裡（被不喜歡），所以兩站都要重找；完整重新生成不帶 others
    const res = await handler(post({ origin: HERE, exclude: ['old-meal', 'old-coffee'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(oldCoffee) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    const got = stops.filter((s) => s.candidate?.id === 'dup-1')
    expect(got).toHaveLength(1)
    expect(stops.filter((s) => s.candidate).map((s) => s.candidate!.id)).toEqual(['dup-1'])
    const noCand = stops.find((s) => s.noCandidate)
    expect(noCand).toBeTruthy()
    expect(noCand!.candidate).toBeUndefined()
  })
  it('R9-K1：順序反過來也一樣——coffee 先處理拿到店，meal 變無候選（picked 是迴圈內累積，不是請求前快照）', async () => {
    const dup = place('dup-1', 35.691, 139.701, { displayName: { text: 'dup食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const oldMeal = validShop('old-meal', 0)
    const oldCoffee = validShop('old-coffee', 0)
    mockPool([dup])
    const res = await handler(post({ origin: HERE, exclude: ['old-meal', 'old-coffee'], stops: [
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(oldCoffee) },
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stops.filter((s) => s.candidate?.id === 'dup-1')).toHaveLength(1)
    expect(stopOf(stops, 'coffee').candidate?.id).toBe('dup-1')
    expect(stopOf(stops, 'meal').noCandidate).toBe(true)
  })
  it('R9-K1：兩站舊候選本來就是同一間 → 第一站留著，第二站重找（池子只有它就變無候選，不重複）', async () => {
    const dup = place('dup-1', 35.691, 139.701, { displayName: { text: 'dup食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([dup])
    const res = await handler(post({ origin: HERE, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(dup) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(dup) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stops.filter((s) => s.candidate?.id === 'dup-1')).toHaveLength(1)
    expect(stopOf(stops, 'meal').candidate?.id).toBe('dup-1')
    expect(stopOf(stops, 'coffee').noCandidate).toBe(true)
  })
  it('R9-K1：地區開啟後完整重新生成、兩站舊候選都在地區外一起重找、池子只有一間區內店 → 不重複（現實觸發條件）', async () => {
    const inArea = place('in-area-1', 35.6590, 139.7010, { displayName: { text: '區內食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const harajukuMeal = place('old-meal-h', 35.6704, 139.7030, { displayName: { text: '原宿定食' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const harajukuShop = place('old-shop-h', 35.6704, 139.7030, { displayName: { text: '原宿藥局' }, rating: 4.5, userRatingCount: 120, types: ['drugstore'], primaryType: 'drugstore' })
    mockPool([inArea])
    const res = await handler(post({ origin: SHIBUYA, area: '澀谷', areaOnly: true, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(harajukuMeal) },
      { id: 'shopping', kind: 'shopping', title: '藥局', minutes: 30, candidate: cand(harajukuShop) },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stops.filter((s) => s.candidate?.id === 'in-area-1')).toHaveLength(1)
    expect(stops.filter((s) => s.noCandidate)).toHaveLength(1)
  })
  it('R9-K1 20x：兩站同時重找、池子只有一間店，重跑 20 次每次都不重複', async () => {
    const dup = place('dup-1', 35.691, 139.701, { displayName: { text: 'dup食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const oldMeal = validShop('old-meal', 0)
    const oldCoffee = validShop('old-coffee', 0)
    for (let i = 0; i < 20; i++) {
      mockPool([dup])
      const res = await handler(post({ origin: HERE, exclude: ['old-meal', 'old-coffee'], stops: [
        { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
        { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(oldCoffee) },
      ] }))
      expect(res.status, `第 ${i + 1} 次`).toBe(200)
      const stops = await readStops(res)
      const ids = stops.filter((s) => s.candidate).map((s) => s.candidate!.id)
      expect(new Set(ids).size, `第 ${i + 1} 次`).toBe(ids.length)
      expect(ids, `第 ${i + 1} 次`).toEqual(['dup-1'])
    }
  })
  it('B1（round 13 更正）：えびそば一幻配 noodle_shop round 13 起是漏判（泛用 noodle）——排除 soba 時照選、排除 ramen 時照選、排除 noodle 時不選', async () => {
    const ebi = place('ebi-1', 35.691, 139.701, { displayName: { text: 'えびそば一幻' }, rating: 4.3, userRatingCount: 300, types: ['noodle_shop', 'restaurant'], primaryType: 'noodle_shop' })
    mockPool([ebi])
    const asRamen = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(asRamen.status).toBe(200)
    expect(stopOf(await readStops(asRamen), 'meal').candidate?.id).toBe('ebi-1')
    mockPool([ebi])
    const asNotRamen = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(asNotRamen.status).toBe(200)
    expect(stopOf(await readStops(asNotRamen), 'meal').candidate?.id).toBe('ebi-1')
    mockPool([ebi])
    const asNoodle = await handler(post({ origin: HERE, excludeKinds: ['noodle'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(asNoodle.status).toBe(200)
    expect(stopOf(await readStops(asNoodle), 'meal').candidate).toBeUndefined()
  })
  it('B2（round 13 更正，紅隊 round 10 R10-F1 的終點）：つけ蕎麦 安土配 restaurant 時，排除 soba 照選、排除 ramen 也照選（名字不判）；つけ蕎麦尚念配 ramen_restaurant 時，排除 ramen 不選（類型決定）；つけそば 弐天 round 13 起也是漏判，排除 ramen 時照選', async () => {
    const azuchi = place('azuchi-1', 35.691, 139.701, { displayName: { text: 'つけ蕎麦 安土' }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    const shonen = place('shonen-1', 35.691, 139.701, { displayName: { text: 'つけ蕎麦尚念' }, rating: 4.2, userRatingCount: 300, types: ['ramen_restaurant', 'restaurant'], primaryType: 'ramen_restaurant' })
    const niten = place('niten-1', 35.691, 139.701, { displayName: { text: 'つけそば 弐天' }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([azuchi])
    const azuchiSoba = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(azuchiSoba.status).toBe(200)
    expect(stopOf(await readStops(azuchiSoba), 'meal').candidate?.id).toBe('azuchi-1')
    mockPool([azuchi])
    const azuchiRamen = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(azuchiRamen.status).toBe(200)
    expect(stopOf(await readStops(azuchiRamen), 'meal').candidate?.id).toBe('azuchi-1')
    mockPool([shonen])
    const shonenRamen = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(shonenRamen.status).toBe(200)
    expect(stopOf(await readStops(shonenRamen), 'meal').candidate).toBeUndefined()
    mockPool([niten])
    const nitenExcluded = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(nitenExcluded.status).toBe(200)
    expect(stopOf(await readStops(nitenExcluded), 'meal').candidate?.id).toBe('niten-1')
  })
  it('B3（round 14 更正）：煮干中華ソバ イチカワ round 14 起是漏判——排除 ramen 時照選；排除 soba 時也照選（片假名正規化層隨店名路徑刪掉）', async () => {
    const ichikawa = place('ichikawa-1', 35.691, 139.701, { displayName: { text: '煮干中華ソバ イチカワ' }, rating: 4.3, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([ichikawa])
    const excluded = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(excluded.status).toBe(200)
    expect(stopOf(await readStops(excluded), 'meal').candidate?.id).toBe('ichikawa-1')
    mockPool([ichikawa])
    const contrast = await handler(post({ origin: HERE, excludeKinds: ['soba'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(contrast.status).toBe(200)
    expect(stopOf(await readStops(contrast), 'meal').candidate?.id).toBe('ichikawa-1')
  })
  it('B4（round 14 更正）：串鳥／やきにくガッッツ round 14 起是漏判——串鳥排除 yakitori 時照選、排除 ramen 時也照選；やきにくガッッツ排除 yakiniku 時照選、排除 ramen 時也照選（「串鳥」「やきにく」不再判種類）', async () => {
    const kushitori = place('kushitori-1', 35.691, 139.701, { displayName: { text: '串鳥' }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    const yakiniku = place('yakiniku-1', 35.691, 139.701, { displayName: { text: 'やきにくガッッツ' }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([kushitori])
    const kExcluded = await handler(post({ origin: HERE, excludeKinds: ['yakitori'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(kExcluded.status).toBe(200)
    expect(stopOf(await readStops(kExcluded), 'meal').candidate?.id).toBe('kushitori-1')
    mockPool([kushitori])
    const kContrast = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(kContrast.status).toBe(200)
    expect(stopOf(await readStops(kContrast), 'meal').candidate?.id).toBe('kushitori-1')
    mockPool([yakiniku])
    const yExcluded = await handler(post({ origin: HERE, excludeKinds: ['yakiniku'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(yExcluded.status).toBe(200)
    expect(stopOf(await readStops(yExcluded), 'meal').candidate?.id).toBe('yakiniku-1')
    mockPool([yakiniku])
    const yContrast = await handler(post({ origin: HERE, excludeKinds: ['ramen'], stops: [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }] }))
    expect(yContrast.status).toBe(200)
    expect(stopOf(await readStops(yContrast), 'meal').candidate?.id).toBe('yakiniku-1')
  })
})

describe('round 11：壁畫地標拒絕／完整重新生成隨機化／seen 送完整重新生成／N1～N7＋品牌表伺服器雙向', () => {
  type StopOut = { id: string; title?: string; candidate?: { id: string; name?: string; userRatingCount?: number; types?: string[]; primaryType?: string }; noCandidate?: boolean; noCandidateReason?: string }
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  /** 伺服器收到的既有候選是 lat／lng 形狀。 */
  const cand = (p: ReturnType<typeof place>) => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress, mapUrl: p.googleMapsUri,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating,
    userRatingCount: p.userRatingCount, types: p.types, primaryType: p.primaryType,
  })
  /** 依查詢回不同池子：meal／coffee／creative／shopping 各回自己的店，否則隨機挑選
   * 會跨站亂挑、測試不確定。判斷用 includedType（比查詢字串穩定）。 */
  function mockPools(byType: Record<string, unknown[]>) {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const t = String(body.includedType ?? '')
      return new Response(JSON.stringify({ places: byType[t] ?? [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
  }
  /** 不論查詢都回同一池子（單站測試用）。 */
  function mockPool(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
  }
  const mealStop = [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }]

  it('壁畫地標：creative 站池子裡有明日の神話（art_gallery）＋真藝廊 → 選真藝廊，壁畫永遠不被選；池子只有壁畫 → 無候選（filtered）', async () => {
    const mural = place('mural-1', 35.6595, 139.7005, { displayName: { text: '岡本太郎「明日の神話」' }, rating: 4.6, userRatingCount: 900, types: ['art_gallery', 'point_of_interest', 'establishment'], primaryType: 'art_gallery' })
    const gallery = place('gallery-1', 35.6595, 139.7005, { displayName: { text: 'DIESEL ART GALLERY' }, rating: 4.6, userRatingCount: 200, types: ['art_gallery', 'point_of_interest', 'establishment'], primaryType: 'art_gallery' })
    mockPools({ art_gallery: [mural, gallery] })
    const res = await handler(post({ origin: HERE, stops: [{ id: 'creative', kind: 'creative', title: '探索', minutes: 65 }] }))
    expect(res.status).toBe(200)
    expect(stopOf(await readStops(res), 'creative').candidate?.id).toBe('gallery-1')
    mockPools({ art_gallery: [mural] })
    const only = await handler(post({ origin: HERE, stops: [{ id: 'creative', kind: 'creative', title: '探索', minutes: 65 }] }))
    expect(only.status).toBe(200)
    const s = stopOf(await readStops(only), 'creative')
    expect(s.candidate).toBeUndefined()
    expect(s.noCandidate).toBe(true)
    expect(s.noCandidateReason).toBe('filtered')
  })
  it('壁畫舊候選不保留：creative 帶明日の神話候選、shuffle 別站時也重找（retentionOk 也跑名稱檢查）', async () => {
    const mural = place('mural-1', 35.6595, 139.7005, { displayName: { text: '岡本太郎「明日の神話」' }, rating: 4.6, userRatingCount: 900, types: ['art_gallery', 'point_of_interest', 'establishment'], primaryType: 'art_gallery' })
    const gallery = place('gallery-1', 35.6595, 139.7005, { displayName: { text: 'DIESEL ART GALLERY' }, rating: 4.6, userRatingCount: 200, types: ['art_gallery', 'point_of_interest', 'establishment'], primaryType: 'art_gallery' })
    const coffee = place('coffee-1', 35.691, 139.701, { displayName: { text: '咖啡店' }, rating: 4.5, userRatingCount: 120, types: ['cafe'], primaryType: 'cafe' })
    mockPools({ art_gallery: [mural, gallery], cafe: [coffee] })
    const res = await handler(post({ origin: HERE, shuffle: 'coffee', stops: [
      { id: 'creative', kind: 'creative', title: '探索', minutes: 65, candidate: cand(mural) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(coffee) },
    ] }))
    expect(res.status).toBe(200)
    expect(stopOf(await readStops(res), 'creative').candidate?.id).toBe('gallery-1')
  })
  it('point_of_interest 當 primaryType 的地標不被選；真店的 types 裡有 point_of_interest 照樣選（DENY_PRIMARY 不進 DENY_ANY）', async () => {
    const landmark = place('lm-1', 35.6595, 139.7005, { displayName: { text: '某展望地標' }, rating: 4.5, userRatingCount: 500, types: ['point_of_interest', 'establishment'], primaryType: 'point_of_interest' })
    const shop = place('shop-1', 35.6595, 139.7005, { displayName: { text: '某餐廳' }, rating: 4.5, userRatingCount: 300, types: ['restaurant', 'food', 'point_of_interest', 'establishment'], primaryType: 'restaurant' })
    mockPool([landmark, shop])
    const res = await handler(post({ origin: HERE, stops: mealStop }))
    expect(res.status).toBe(200)
    expect(stopOf(await readStops(res), 'meal').candidate?.id).toBe('shop-1')
  })
  it('完整重新生成不保留自動站：meal 舊候選通過重驗、池子裡沒有它 → 完整重新生成換一間；單站 shuffle 別站時它照留', async () => {
    const oldMeal = place('old-meal', 35.691, 139.701, { displayName: { text: '舊定食店' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const newMeal = place('new-meal', 35.691, 139.701, { displayName: { text: '新定食店' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const coffee = place('coffee-1', 35.691, 139.701, { displayName: { text: '咖啡店' }, rating: 4.5, userRatingCount: 120, types: ['cafe'], primaryType: 'cafe' })
    mockPools({ restaurant: [newMeal], cafe: [coffee] })
    // 完整重新生成（不帶 shuffle）：meal 舊候選明明通過重驗，但因為是完整重新生成＋自動站，不保留
    const regen = await handler(post({ origin: HERE, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(coffee) },
    ] }))
    expect(regen.status).toBe(200)
    expect(stopOf(await readStops(regen), 'meal').candidate?.id).toBe('new-meal')
    // 對照：單站 shuffle coffee 時，meal 的舊候選照留（保留分支只在完整重新生成時跳過自動站）
    mockPools({ restaurant: [newMeal], cafe: [coffee] })
    const shuffled = await handler(post({ origin: HERE, shuffle: 'coffee', stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
      { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60, candidate: cand(coffee) },
    ] }))
    expect(shuffled.status).toBe(200)
    expect(stopOf(await readStops(shuffled), 'meal').candidate?.id).toBe('old-meal')
  })
  it('完整重新生成照樣保留固定／指定／已完成站：locked 的固定站候選不動（隨機化只動自動站）', async () => {
    const fixed = place('fixed-1', 35.691, 139.701, { displayName: { text: '固定聚餐地點' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const newMeal = place('new-meal', 35.691, 139.701, { displayName: { text: '新定食店' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    mockPools({ restaurant: [newMeal] })
    const res = await handler(post({ origin: HERE, stops: [
      { id: 'fixed-1', kind: 'meal', title: '固定聚餐', minutes: 60, locked: true, custom: true, place: '固定聚餐地點', candidate: cand(fixed) },
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45 },
    ] }))
    expect(res.status).toBe(200)
    const stops = await readStops(res)
    expect(stopOf(stops, 'fixed-1').candidate?.id).toBe('fixed-1')
    expect(stopOf(stops, 'meal').candidate?.id).toBe('new-meal')
  })
  it('seen 送完整重新生成：meal 舊候選在 seen 裡 → 完整重新生成不回來，換池子裡另一間；seen 不送、池子只有舊店 → 照樣是它；seen 蓋掉池子唯一一間 → 無候選（filtered）', async () => {
    const oldMeal = place('old-meal', 35.691, 139.701, { displayName: { text: '舊定食店' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    const newMeal = place('new-meal', 35.691, 139.701, { displayName: { text: '新定食店' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([oldMeal, newMeal])
    const withSeen = await handler(post({ origin: HERE, seen: ['old-meal'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
    ] }))
    expect(withSeen.status).toBe(200)
    expect(stopOf(await readStops(withSeen), 'meal').candidate?.id).toBe('new-meal')
    mockPool([oldMeal])
    const noSeen = await handler(post({ origin: HERE, stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
    ] }))
    expect(noSeen.status).toBe(200)
    expect(stopOf(await readStops(noSeen), 'meal').candidate?.id).toBe('old-meal')
    mockPool([oldMeal])
    const exhausted = await handler(post({ origin: HERE, seen: ['old-meal'], stops: [
      { id: 'meal', kind: 'meal', title: '定食', minutes: 45, candidate: cand(oldMeal) },
    ] }))
    expect(exhausted.status).toBe(200)
    const s = stopOf(await readStops(exhausted), 'meal')
    expect(s.candidate).toBeUndefined()
    expect(s.noCandidate).toBe(true)
    expect(s.noCandidateReason).toBe('filtered')
  })
  it('完整重新生成 20x：每次路線都不跟上一次完全相同、站內不重複、沒有車站／地標、評論數都 ≥50（每次都送上一次的 seen，跟前端行為一致）', async () => {
    const meals = [0, 1, 2].map((i) => place('meal-' + i, 35.691 + i * 0.001, 139.701, { displayName: { text: '定食店' + i }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' }))
    const coffees = [0, 1, 2].map((i) => place('coffee-' + i, 35.691 + i * 0.001, 139.702, { displayName: { text: '咖啡店' + i }, rating: 4.5, userRatingCount: 120, types: ['cafe'], primaryType: 'cafe' }))
    mockPools({ restaurant: meals, cafe: coffees })
    let prev = ''
    let prevIds: string[] = []
    for (let i = 0; i < 20; i++) {
      const res = await handler(post({ origin: HERE, seen: prevIds, stops: [
        { id: 'meal', kind: 'meal', title: '定食', minutes: 45 },
        { id: 'coffee', kind: 'coffee', title: '咖啡', minutes: 60 },
      ] }))
      expect(res.status, `第 ${i + 1} 次`).toBe(200)
      const stops = await readStops(res)
      const ids = stops.filter((s) => s.candidate).map((s) => s.candidate!.id)
      expect(new Set(ids).size, `第 ${i + 1} 次不重複`).toBe(ids.length)
      for (const s of stops) {
        if (!s.candidate) continue
        expect(s.candidate.userRatingCount ?? 0, `第 ${i + 1} 次評論數`).toBeGreaterThanOrEqual(50)
        expect(['tourist_attraction', 'transit_station', 'point_of_interest'].includes(s.candidate.primaryType ?? ''), `第 ${i + 1} 次不是地標`).toBe(false)
      }
      const key = ids.join(',')
      if (i > 0) expect(key, `第 ${i + 1} 次跟上一次不同`).not.toBe(prev)
      prev = key
      prevIds = ids
    }
  })
  it('品牌別名表伺服器雙向（round 14：7 個品牌，白木屋已刪）：排除所屬種類時不選、排除別種時照選', async () => {
    const cases: Array<[string, string, string, string]> = [
      ['丸亀製麺', 'marugame-1', 'udon', 'ramen'],
      ['かつや 渋谷道玄坂店', 'katsuya-1', 'tonkatsu', 'ramen'],
      ['鳥貴族', 'torikizoku-1', 'izakaya', 'ramen'],
      ['川上庵', 'kawakamian-1', 'soba', 'ramen'],
      ['一蘭', 'ichiran-1', 'ramen', 'udon'],
      ['磯丸水産', 'isomaru-1', 'izakaya', 'ramen'],
      ['魚民', 'uotami-1', 'izakaya', 'ramen'],
    ]
    for (const [name, id, excludedKind, contrastKind] of cases) {
      const shop = place(id, 35.691, 139.701, { displayName: { text: name }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
      mockPool([shop])
      const excluded = await handler(post({ origin: HERE, excludeKinds: [excludedKind], stops: mealStop }))
      expect(excluded.status, name).toBe(200)
      expect(stopOf(await readStops(excluded), 'meal').candidate, name).toBeUndefined()
      mockPool([shop])
      const contrast = await handler(post({ origin: HERE, excludeKinds: [contrastKind], stops: mealStop }))
      expect(contrast.status, name).toBe(200)
      expect(stopOf(await readStops(contrast), 'meal').candidate?.id, name).toBe(id)
    }
  })
  it('N1／N2／N4／N5／N6／N7（round 14 更正）：各新店名 round 14 起是漏判——排除所屬種類時照選、排除別種時也照選（店名不再判種類）', async () => {
    const cases: Array<[string, string, string, string]> = [
      ['きしめん 住よし', 'kishimen-1', 'udon', 'ramen'],
      ['ほうとう不動', 'hoto-1', 'udon', 'ramen'],
      ['焼きとり ささのや', 'yakitori-1', 'yakitori', 'ramen'],
      ['居酒屋 てっぺん 渋谷女道場', 'teppen-1', 'izakaya', 'ramen'],
      ['パンとエスプレッソと', 'pan-1', 'bakery', 'ramen'],
      ['博多天ぷら たかお 渋谷パルコ店', 'tempura-1', 'tempura', 'ramen'],
    ]
    for (const [name, id, excludedKind, contrastKind] of cases) {
      const shop = place(id, 35.691, 139.701, { displayName: { text: name }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
      mockPool([shop])
      const excluded = await handler(post({ origin: HERE, excludeKinds: [excludedKind], stops: mealStop }))
      expect(excluded.status, name).toBe(200)
      expect(stopOf(await readStops(excluded), 'meal').candidate?.id, name).toBe(id)
      mockPool([shop])
      const contrast = await handler(post({ origin: HERE, excludeKinds: [contrastKind], stops: mealStop }))
      expect(contrast.status, name).toBe(200)
      expect(stopOf(await readStops(contrast), 'meal').candidate?.id, name).toBe(id)
    }
  })
  it('N6 對照：幸せのパンケーキ排除 bakery 時照選（它是鬆餅店，不是麵包店；名字走排除正則、類型走 restaurant）', async () => {
    const pancake = place('pancake-1', 35.691, 139.701, { displayName: { text: '幸せのパンケーキ 渋谷店' }, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([pancake])
    const res = await handler(post({ origin: HERE, excludeKinds: ['bakery'], stops: mealStop }))
    expect(res.status).toBe(200)
    expect(stopOf(await readStops(res), 'meal').candidate?.id).toBe('pancake-1')
  })
})

describe('round 13：回歸 20x（架構重構後種類排除仍有效）', () => {
  type StopOut = { id: string; title?: string; candidate?: { id: string; userRatingCount?: number; primaryType?: string }; noCandidate?: boolean; noCandidateReason?: string }
  const readStops = async (res: Response) => (await res.json() as { stops: StopOut[] }).stops
  const stopOf = (stops: StopOut[], id: string) => stops.find((s) => s.id === id)!
  const mealStop = [{ id: 'meal', kind: 'meal', title: '定食', minutes: 45 }]
  function mockPool(places: unknown[]) {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('routes.googleapis.com')) return new Response('{}', { status: 403 })
      return new Response(JSON.stringify({ places }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
  }
  it('shuffle 20x：每次送上一次的 seen（跟前端行為一致），20 次挑到 20 間不同店', async () => {
    const pool = Array.from({ length: 25 }, (_, i) => place('shop-' + i, 35.691 + i * 0.0001, 139.701, { displayName: { text: '定食店' + i }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' }))
    mockPool(pool)
    const seen: string[] = []
    const picked: string[] = []
    for (let i = 0; i < 20; i++) {
      const res = await handler(post({ origin: HERE, seen, stops: mealStop }))
      expect(res.status, `第 ${i + 1} 次`).toBe(200)
      const id = stopOf(await readStops(res), 'meal').candidate?.id
      expect(id, `第 ${i + 1} 次有候選`).toBeTruthy()
      expect(seen, `第 ${i + 1} 次不重複`).not.toContain(id)
      picked.push(id!)
      seen.push(id!)
    }
    expect(new Set(picked).size).toBe(20)
  })
  it('dislike 20x：被不喜歡的店 20 次都不回來（對照：不排除時 20 次至少選中一次）', async () => {
    const target = place('disliked-1', 35.691, 139.701, { displayName: { text: '目標食堂' }, rating: 5.0, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
    const filler = place('filler-1', 35.692, 139.702, { displayName: { text: '對照食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
    mockPool([target, filler])
    for (let i = 0; i < 20; i++) {
      const res = await handler(post({ origin: HERE, exclude: ['disliked-1'], stops: mealStop }))
      expect(res.status, `第 ${i + 1} 次`).toBe(200)
      expect(stopOf(await readStops(res), 'meal').candidate?.id, `第 ${i + 1} 次`).toBe('filler-1')
    }
    // 對照：不排除時 20 次至少選中一次（目標評分最高、池子只有兩間，隨機挑一定會中）
    let hit = false
    for (let i = 0; i < 20; i++) {
      const res = await handler(post({ origin: HERE, stops: mealStop }))
      if (stopOf(await readStops(res), 'meal').candidate?.id === 'disliked-1') { hit = true; break }
    }
    expect(hit).toBe(true)
  })
  it('excludeKinds 四種各 20x（round 14 更正）：丸亀製麺（udon，品牌）、川上庵（soba，品牌）、焼肉トラジ 渋谷店（yakiniku，改用類型——店名「焼肉」不再判）、鳥貴族（izakaya，品牌）各 20 次絕不被選', async () => {
    const cases: Array<[string, string, string, string]> = [
      ['丸亀製麺', 'marugame-1', 'udon', 'restaurant'],
      ['川上庵', 'kawakamian-1', 'soba', 'restaurant'],
      ['焼肉トラジ 渋谷店', 'toraji-1', 'yakiniku', 'yakiniku_restaurant'],
      ['鳥貴族', 'torikizoku-1', 'izakaya', 'restaurant'],
    ]
    for (const [name, id, kind, primaryType] of cases) {
      const target = place(id, 35.691, 139.701, { displayName: { text: name }, rating: 5.0, userRatingCount: 300, types: [primaryType, 'restaurant'], primaryType })
      const filler = place('filler-' + id, 35.692, 139.702, { displayName: { text: '對照食堂' }, rating: 4.5, userRatingCount: 120, types: ['restaurant'], primaryType: 'restaurant' })
      mockPool([target, filler])
      for (let i = 0; i < 20; i++) {
        const res = await handler(post({ origin: HERE, excludeKinds: [kind], stops: mealStop }))
        expect(res.status, `${name} 第 ${i + 1} 次`).toBe(200)
        expect(stopOf(await readStops(res), 'meal').candidate?.id, `${name} 第 ${i + 1} 次`).toBe('filler-' + id)
      }
      // 對照：不排除時 20 次至少選中一次（目標評分最高、池子只有兩間，隨機挑一定會中）
      let hit = false
      for (let i = 0; i < 20; i++) {
        const res = await handler(post({ origin: HERE, stops: mealStop }))
        if (stopOf(await readStops(res), 'meal').candidate?.id === id) { hit = true; break }
      }
      expect(hit, `${name} 對照組`).toBe(true)
    }
  })
})
