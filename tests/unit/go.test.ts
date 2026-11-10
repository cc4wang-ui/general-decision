// @vitest-environment node
// Round 10 X2：「去」卡查真地點（src/go.ts）。X5：量測工具 mode=lanes／mode=go（src/probe.ts、api/probe.ts）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/order.ts'
import probeApi from '../../api/probe.ts'
import { CARD_BY_ID } from '../../src/cards.ts'
import { mulberry32 } from '../../src/discovery.ts'
import {
  GO_DESTS, MINUTES, TRANSPORTS, goDests, goKeep, goPasses, goRadius, goTransportSteps, goTrip, isGoDestination, mentionsTransport,
  type Minutes, type Transport,
} from '../../src/go.ts'
import { bodyText, urlText, type PlacesRequestBody } from './mockFetch.ts'
import { pickLane, widenPlan, type LanePlan } from '../../src/lanes.ts'
import { placesLanguage, placesRequest } from '../../src/orderHandler.ts'
import type { RawPlace } from '../../src/places.ts'
import { lanePlansFor, runGoProbe, runLaneProbe } from '../../src/probe.ts'
import type { Order, OrderDebug, PlaceCandidate } from '../../src/types.ts'

const TAIPEI = { lat: 25.033, lng: 121.5654 }
const TOKYO = { lat: 35.6812, lng: 139.7671 }
const choices = (transport: Transport, minutes: Minutes) => ({ transport, minutes: `${minutes} 分` })
const goLane = (transport: Transport, minutes: Minutes, country: 'TW' | 'JP' | 'other', hour: number, seed: number) =>
  pickLane(CARD_BY_ID.go, choices(transport, minutes), undefined, country, mulberry32(seed), hour)

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('半徑表（交通＋可接受 → 公尺）', () => {
  it('照註解那張表：走路 15 分 ≈ 1 km，搭車的扣掉固定耗損', () => {
    const table = Object.fromEntries(TRANSPORTS.map((t) => [t, MINUTES.map((m) => goRadius(t, m))]))
    expect(table).toEqual({
      走路: [1000, 2000, 4000],
      捷運: [2000, 8000, 20000],
      計程車: [3000, 7500, 16500],
      開車: [1500, 6000, 15000],
    })
  })

  it('同一個「可接受」下四種交通半徑都不一樣；可接受越長半徑越大', () => {
    for (const m of MINUTES) expect(new Set(TRANSPORTS.map((t) => goRadius(t, m))).size, `${m} 分`).toBe(4)
    for (const t of TRANSPORTS) expect(goRadius(t, 15) < goRadius(t, 30) && goRadius(t, 30) < goRadius(t, 60), t).toBe(true)
  })

  it('走路：半徑內最遠的步行分鐘（80 m/分）不超過可接受', () => {
    for (const m of MINUTES) expect(Math.ceil(goRadius('走路', m) / 80)).toBeLessThanOrEqual(m)
  })

  it('選項沒送或不認得 → 卡片預設（捷運、30 分）', () => {
    expect(goTrip({}, 12)).toMatchObject({ transport: '捷運', minutes: 30, radius: 8000, part: 'day' })
    expect(goTrip({ transport: '飛', minutes: '45 分' }, 12)).toMatchObject({ transport: '捷運', minutes: 30 })
    expect(goTrip(choices('走路', 15), 20)).toMatchObject({ transport: '走路', minutes: 15, radius: 1000, part: 'evening' })
  })
})

describe('查詢（pickLane → Text Search）', () => {
  it('四種交通的查詢指紋互不相同（同一個種子：關鍵字、排序一樣，只差半徑）', () => {
    for (const m of MINUTES) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const bodies = TRANSPORTS.map((t) => placesRequest(TAIPEI, goLane(t, m, 'TW', 14, seed), placesLanguage('TW')).body)
        expect(new Set(bodies).size, `${m} 分 seed=${seed}`).toBe(4)
        for (const [i, t] of TRANSPORTS.entries()) {
          const p = goLane(t, m, 'TW', 14, seed)
          expect(p.radius).toBe(goRadius(t, m))
          expect(p.kind).toBe('text')
          expect((JSON.parse(bodies[i]!) as PlacesRequestBody).locationRestriction?.rectangle).toBeDefined() // 限在半徑的方框內（handler 再切回圓）
        }
      }
    }
  })

  it('依時段挑目的地：白天才派美術館、步道；晚上才派夜市', () => {
    const qs = (hour: number) => new Set(Array.from({ length: 300 }, (_, s) => {
      const p = goLane('捷運', 30, 'TW', hour, s + 1)
      return p.kind === 'text' ? p.textQuery : ''
    }))
    const day = qs(14)
    const evening = qs(19)
    expect(day.has('美術館') && day.has('步道') && !day.has('夜市')).toBe(true)
    expect(evening.has('夜市') && !evening.has('美術館') && !evening.has('步道')).toBe(true)
    expect([...day].every((q) => goDests('TW', 'day').some((d) => d.q.TW === q))).toBe(true)
  })

  it('日本座標用日文關鍵字（沒有夜市、老街、台灣的「書店／觀景台」）', () => {
    const jpWords = new Set(GO_DESTS.map((d) => d.q.JP).filter(Boolean))
    for (const hour of [9, 14, 19, 23, 2]) {
      for (let s = 1; s <= 100; s++) {
        const p = goLane('走路', 30, 'JP', hour, s)
        if (p.kind !== 'text') throw new Error('去一律走 Text Search')
        expect(jpWords.has(p.textQuery), p.textQuery).toBe(true)
        expect(['夜市', '老街', '書店', '觀景台', '步道', '寺廟', '河濱公園']).not.toContain(p.textQuery)
        const w = widenPlan(p, { country: 'JP', rng: mulberry32(s) })
        expect(['観光スポット', '公園']).toContain((w as { textQuery: string }).textQuery)
      }
    }
    expect(placesLanguage('JP')).toBe('ja')
  })

  it('深夜（22–06）：第一次就只要營業中，只派公園、夜景', () => {
    for (const hour of [22, 23, 0, 1, 5]) {
      for (let s = 1; s <= 50; s++) {
        const p = goLane('計程車', 30, 'TW', hour, s) as Extract<LanePlan, { kind: 'text' }>
        expect(p.openNow, `${hour} 點`).toBe(true)
        expect(['公園', '夜景']).toContain(p.textQuery)
      }
    }
    // 白天不帶 openNow（60 分內會開的美術館也算，挑店時再看到了是否還開著）
    expect((goLane('計程車', 30, 'TW', 14, 1) as { openNow?: boolean }).openNow).toBeUndefined()
  })

  it('第二次：半徑不放大、換排序、只要營業中；第一次 400 也不退回餐廳', () => {
    const first = goLane('開車', 60, 'TW', 14, 7)
    for (const forceRestaurant of [false, true]) {
      const w = widenPlan(first, { country: 'TW', rng: mulberry32(3), forceRestaurant }) as Extract<LanePlan, { kind: 'text' }>
      expect(w.radius).toBe(first.radius)
      expect(w.rank).not.toBe(first.rank)
      expect(w.openNow).toBe(true)
      expect(w.lane.startsWith('go:')).toBe(true)
      expect(['景點', '公園']).toContain(w.textQuery)
    }
  })
})

describe('候選過濾（goKeep／goPasses）', () => {
  const c = (over: Partial<PlaceCandidate>): PlaceCandidate => ({ id: 'x', name: 'x', walkMin: 10, primaryType: 'park', ...over })
  const day = goTrip(choices('捷運', 30), 14)
  const late = goTrip(choices('走路', 30), 1)

  it('吃喝、車站、雜事店不派；公園、美術館、書店、沒有主類別的照派', () => {
    for (const t of ['restaurant', 'ramen_restaurant', 'cafe', 'ice_cream_shop', 'bar', 'subway_station', 'train_station', 'convenience_store', 'parking']) {
      expect(isGoDestination(t), t).toBe(false)
    }
    for (const t of ['park', 'art_gallery', 'museum', 'book_store', 'tourist_attraction', undefined]) expect(isGoDestination(t), String(t)).toBe(true)
  })

  it('到了要還開著：關門時間 < 單程上限＋30 分 → 不派', () => {
    expect(goPasses(c({ closeInMin: 59 }), day)).toBe(false)
    expect(goPasses(c({ closeInMin: 60 }), day)).toBe(true)
    expect(goPasses(c({}), day)).toBe(true) // 沒有關門資料／24 小時
  })

  it('深夜只派營業中的：還沒開（HH:MM 開）的、登山步道不派', () => {
    expect(goPasses(c({ opensAt: '06:00' }), late)).toBe(false)
    expect(goPasses(c({ primaryType: 'hiking_area' }), late)).toBe(false)
    expect(goPasses(c({}), late)).toBe(true)
    expect(goPasses(c({ opensAt: '10:00' }), day)).toBe(true) // 白天 60 分內會開的照舊可以
  })

  it('不是走路就拿掉步行分鐘；救援（超商）不過濾類型', () => {
    const list = [c({ id: 'a' }), c({ id: 'b', primaryType: 'cafe' })]
    expect(goKeep(list, day).map((x) => [x.id, x.walkMin])).toEqual([['a', undefined]])
    expect(goKeep(list, goTrip(choices('走路', 30), 14)).map((x) => x.walkMin)).toEqual([10])
    expect(goKeep([c({ primaryType: 'convenience_store' })], day, true)).toHaveLength(1)
  })
})

describe('口令寫到選的交通（goTransportSteps）', () => {
  it('沒寫到 → 第一步前面補；寫到別種車的步驟拿掉；寫到了就不動', () => {
    expect(goTransportSteps(['到了走一圈。', '21:00 前回家。'], '捷運')).toEqual(['搭捷運過去，到了走一圈。', '21:00 前回家。'])
    expect(goTransportSteps(['搭捷運到附近。', '看展。'], '開車')).toEqual(['開車過去，看展。'])
    expect(goTransportSteps(['下車走過去。', '看展。'], '計程車')).toEqual(['叫計程車過去，下車走過去。', '看展。'])
    const ok = ['搭電車過去，單程 30 分內。', '看展。']
    expect(goTransportSteps(ok, '捷運')).toBe(ok)
    expect(mentionsTransport(['走 12 分過去。'], '走路')).toBe(true)
    expect(mentionsTransport(['到了走一圈。'], '走路')).toBe(false)
  })
})

// ── /api/order 整條路徑 ───────────────────────────────────────────────

type Body = Order & { debug: OrderDebug }
const handler = api.fetch
const near = (i: number) => ({ latitude: TAIPEI.lat + 0.001 * (i + 1), longitude: TAIPEI.lng })
const PARKS: RawPlace[] = Array.from({ length: 6 }, (_, i) => ({
  id: `park${i}`, displayName: { text: `測試公園${i}號` }, location: near(i), currentOpeningHours: { openNow: true },
  primaryType: 'park', rating: 4.5, userRatingCount: 300,
}))
/** 會被 goKeep 擋掉的：冰店（店名有公園）、捷運站、還沒開的公園（深夜）。評分都比較高，沒擋就會被挑到。 */
const DECOYS: RawPlace[] = [
  { id: 'ice', displayName: { text: '公園號冰店' }, location: near(0), currentOpeningHours: { openNow: true }, primaryType: 'ice_cream_shop', rating: 4.9, userRatingCount: 5000 },
  { id: 'mrt', displayName: { text: '公園站' }, location: near(1), currentOpeningHours: { openNow: true }, primaryType: 'subway_station', rating: 4.9, userRatingCount: 5000 },
  { id: 'soon', displayName: { text: '晨間公園' }, location: near(2), currentOpeningHours: { openNow: false, nextOpenTime: '2026-11-03T18:00:00Z' }, primaryType: 'park', rating: 4.9, userRatingCount: 5000 },
]
const MODEL = JSON.stringify({
  verdict: 'do', meme: { top: '出門', big: '模型編的景點', bot: '快' }, steps: ['到了走一圈。', '23:59 前回家。'], place: { id: 'fake', name: '模型編的景點' }, log: '口令。',
})

function goFetch(places: RawPlace[] = [...DECOYS, ...PARKS]) {
  const bodies: Record<string, unknown>[] = []
  const f = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    if (urlText(url).includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: MODEL }] }), { status: 200 })
    bodies.push(JSON.parse(bodyText(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ places }), { status: 200 })
  })
  return { f, bodies }
}
const goPost = (body: Record<string, unknown>) => new Request('http://localhost/api/order', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ module: 'go', level: 1, loc: TAIPEI, now: '2026-11-03T14:00:00+08:00', recentOrders: [], ...body }),
})

describe('/api/order：去卡', () => {
  it('查真地點：半徑照交通、派的是 Google 回來的真地點（模型寫的不算）、搭車不給步行分鐘、口令寫到交通', async () => {
    const { f, bodies } = goFetch()
    vi.stubGlobal('fetch', f)
    const res = await handler(goPost({ choices: choices('捷運', 30), seed: 1 }))
    expect(res.status).toBe(200)
    const b = (await res.json()) as Body
    expect(b.place?.id).toMatch(/^park\d$/)
    expect(b.place?.mapUrl).toContain('query_place_id=park')
    expect(b.place?.walkMin).toBeUndefined()
    expect(b.place?.mode).toBe('wildcard') // 去沒有到訪記憶：一律偵察，不宣稱去過／沒去過
    expect(b.meme.big).not.toBe('模型編的景點')
    expect(b.steps[0]).toMatch(/^搭捷運過去，/)
    expect(b.debug.places?.tries[0]?.r).toBe(8000)
    const rect = (bodies[0] as { locationRestriction: { rectangle: { low: { latitude: number }; high: { latitude: number } } } }).locationRestriction.rectangle
    expect(Math.round(((rect.high.latitude - rect.low.latitude) / 2) * 111_320)).toBe(8000)
    expect((bodies[0] as { textQuery: string }).textQuery).not.toMatch(/餐廳|美食/)
  })

  it('走路照樣給步行分鐘；冰店、捷運站不派', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { f } = goFetch()
      vi.stubGlobal('fetch', f)
      const b = (await (await handler(goPost({ choices: choices('走路', 15), seed }))).json()) as Body
      expect(['ice', 'mrt']).not.toContain(b.place?.id)
      expect(typeof b.place?.walkMin).toBe('number')
      expect(b.steps.some((s) => /走路|步行/.test(s))).toBe(true)
    }
  })

  it('深夜：Places 請求帶 openNow，還沒開的地點不派', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { f, bodies } = goFetch()
      vi.stubGlobal('fetch', f)
      const b = (await (await handler(goPost({ choices: choices('開車', 30), now: '2026-11-04T01:30:00+08:00', seed }))).json()) as Body
      expect((bodies[0] as { openNow?: boolean }).openNow).toBe(true)
      expect(b.place?.id).not.toBe('soon')
      expect(b.place?.opensAt).toBeUndefined()
    }
  })

  it('日本座標：查日文關鍵字、languageCode=ja；口令的捷運換成電車', async () => {
    const { f, bodies } = goFetch(PARKS.map((p) => ({ ...p, location: { latitude: TOKYO.lat + 0.001, longitude: TOKYO.lng } })))
    vi.stubGlobal('fetch', f)
    const b = (await (await handler(goPost({ choices: choices('捷運', 30), loc: TOKYO, now: '2026-11-03T14:00:00+09:00', seed: 2 }))).json()) as Body
    const first = bodies[0] as { textQuery: string; languageCode: string }
    expect(first.languageCode).toBe('ja')
    expect(GO_DESTS.map((d) => d.q.JP)).toContain(first.textQuery)
    expect(b.steps[0]).toMatch(/^搭電車過去，/)
  })

  it('附近只有吃喝的店 → 第二次通用關鍵字 → 不派超商、不派餐廳，說實話（no_places）', async () => {
    // Round 10：超商不是去處，而且救援固定 3 km 會超過使用者選的單程時間（B 線回報）。
    const store: RawPlace = { id: 's7', displayName: { text: '7-ELEVEN 測試門市' }, location: near(0), currentOpeningHours: { openNow: true }, primaryType: 'convenience_store', rating: 4, userRatingCount: 50 }
    const bodies: string[] = []
    const f = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (urlText(url).includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: MODEL }] }), { status: 200 })
      bodies.push(bodyText(init?.body))
      const rescue = bodyText(init?.body).includes('便利商店')
      return new Response(JSON.stringify({ places: rescue ? [store] : DECOYS.slice(0, 2) }), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(goPost({ choices: choices('計程車', 15), seed: 3 }))
    expect(res.status).toBe(502)
    const b = (await res.json()) as Body & { error: string; message: string }
    expect(b.error).toBe('no_places')
    expect(b.message).toMatch(/交通和時間內/)
    expect(b.place).toBeUndefined()
    expect(bodies.some((x) => x.includes('便利商店'))).toBe(false)
    expect(b.debug.places?.tries.map((t) => t.r)).toEqual([3000, 3000])
  })
})

// ── 量測工具（X5）────────────────────────────────────────────────────

describe('api/probe：mode=lanes／mode=go', () => {
  it('正式站（不是 preview）→ 404，不呼叫任何外部服務', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    for (const mode of ['lanes', 'go']) {
      const res = await probeApi.fetch(new Request(`https://x/api/probe?mode=${mode}&loc=xinyi`))
      expect(res.status, mode).toBe(404)
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('lanes：每條 lane 一列（含 verified:false 與去的 lane），回 HTTP 狀態與筆數；只要 places.id', async () => {
    const masks = new Set<string>()
    const fetchFn = vi.fn((_u: string | URL | Request, init?: RequestInit) => {
      masks.add(String((init?.headers as Record<string, string>)['X-Goog-FieldMask']))
      const body = bodyText(init?.body)
      if (body.includes('noodle_shop')) return new Response('{"error":{"code":400}}', { status: 400 })
      return new Response(JSON.stringify({ places: body.includes('美術館') ? [] : [{ id: 'a' }, { id: 'b' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await runLaneProbe('xinyi', { fetchFn, key: 'k' })
    const lanes = r.rows.map((x) => x.lane)
    expect(new Set(lanes).size).toBe(lanes.length)
    expect(lanes).toEqual(expect.arrayContaining(['ramen_restaurant', 'taiwanese_restaurant', 'q:便當', 'go:park', 'go:art', 'rescue']))
    expect(r.rows.length).toBe(lanePlansFor('TW').length)
    expect(r.summary.bad400).toEqual(['noodle_shop'])
    expect(r.summary.empty).toEqual(['go:art'])
    // Round 10：10 條 2026-02／2024-11 的 lane 已用真 Places 實測（state/evidence/r10/final/lanes-*.json）翻成 verified，沒有可翻的了。
    expect(r.summary.flip).toEqual([])
    expect(r.rows.find((x) => x.lane === 'q:便當')).toMatchObject({ status: 200, raw: 2 })
    expect([...masks]).toEqual(['places.id'])
    const jp = lanePlansFor('JP').map((p) => p.plan.lane)
    expect(jp).not.toContain('taiwanese_restaurant')
    expect(jp).toEqual(expect.arrayContaining(['text:カフェ', 'q:ラーメン', 'go:park']))
    expect(lanes).toEqual(expect.arrayContaining(['text:咖啡廳', 'text:熱炒 燒烤']))
  })

  it('go：四種交通各一列，指紋互不相同，回地點、type、距離、半徑', async () => {
    const io = { fetch: goFetch().f as unknown as typeof fetch }
    const r = await runGoProbe('xinyi', { minutes: 30, now: new Date('2026-11-03T14:00:00+08:00'), io, seed: 5 })
    expect(r.rows.map((x) => x.transport)).toEqual(TRANSPORTS)
    expect(r.rows.map((x) => x.radiusM)).toEqual([2000, 8000, 7500, 6000])
    expect(r.summary.distinctFingerprints).toBe(4)
    for (const row of r.rows) {
      expect(row.ok, row.transport).toBe(true)
      expect(row.type).toBe('park')
      expect(row.distM).toBeLessThanOrEqual(row.radiusM)
      expect(row.pass, `${row.transport}：${row.why ?? ''}`).toBe(true)
    }
  })
})
