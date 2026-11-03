// @vitest-environment node
// /api/daily-route：目前位置（GPS）當出發點。座標驗證、有座標就不查出發地、壞座標 400。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/daily-route.ts'
import { validPoint } from '../../src/dailyRouting.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const HERE = { lat: 35.6896, lng: 139.7006 } // 新宿駅附近
const place = (id: string, lat: number, lng: number) => ({
  id, displayName: { text: id }, formattedAddress: id + ' 地址', location: { latitude: lat, longitude: lng }, googleMapsUri: 'https://maps.google.com/?cid=' + id,
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

  it('有座標時，「散步回家」那站查最近的車站，不套澀谷；查詢字串不附任何地名', async () => {
    const g = mockGoogle()
    const res = await handler(post({ origin: HERE, stops: [
      { id: 'coffee', kind: 'creative', title: '咖啡', minutes: 60 },
      { id: 'rest', kind: 'rest', title: '散步回家', minutes: 75 },
    ] }))
    expect(res.status).toBe(200)
    const queries = g.places().map((c) => String(c.body.textQuery))
    expect(queries).toEqual(['quiet specialty coffee cafe', 'train station'])
    expect(queries.join(' ')).not.toMatch(/Shibuya|渋谷|澀谷/)
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
