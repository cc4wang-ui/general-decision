// @vitest-environment node
// /api/geocode（DEV-PLAN-3 C2）：手動報地點 → 座標。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/geocode.ts'
import type { GeocodeResponse } from '../../src/types.ts'
import { bodyText, urlText } from './mockFetch.ts'

const handler = api.fetch
const post = (body: unknown) =>
  new Request('http://localhost/api/geocode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('/api/geocode', () => {
  it('default 是 { fetch }（Vercel 坑 1）', () => {
    expect(typeof api).toBe('object')
    expect(typeof api.fetch).toBe('function')
  })

  it('查得到 → {loc,label}；Text Search pageSize 1、只要 location＋displayName、zh-TW；x-places-calls 1', async () => {
    const f = vi.fn((_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      places: [{ location: { latitude: 25.0478, longitude: 121.517 }, displayName: { text: '台北車站' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ q: ' 台北車站 ' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-places-calls')).toBe('1')
    expect((await res.json()) as GeocodeResponse).toEqual({ loc: { lat: 25.0478, lng: 121.517 }, label: '台北車站' })
    const [url, init] = f.mock.calls[0]!
    expect(urlText(url)).toContain('places:searchText')
    expect(JSON.parse(bodyText(init!.body))).toEqual({ textQuery: '台北車站', pageSize: 1, languageCode: 'zh-TW' })
    expect((init!.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('places.location,places.displayName')
  })

  it('查不到 → 404 not_found + 班長口吻', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(JSON.stringify({}), { status: 200 })))
    const res = await handler(post({ q: '火星基地' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found', message: '找不到這個地方。報個車站或地標。' })
  })

  it('空字串／太長／壞 JSON → 400，不打 Places', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await handler(post({ q: '  ' }))).status).toBe(400)
    expect((await handler(post({ q: 'x'.repeat(61) }))).status).toBe(400)
    expect((await handler(new Request('http://localhost/api/geocode', { method: 'POST', body: 'nope' }))).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('Places 掛掉 → 502；429 → 429', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('boom', { status: 500 })))
    expect((await handler(post({ q: '台北車站' }))).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(() => new Response('slow', { status: 429 })))
    expect((await handler(post({ q: '台北車站' }))).status).toBe(429)
  })

  it('log 不記查詢字串與座標；GET → 405', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(() => new Response(JSON.stringify({
      places: [{ location: { latitude: 25.0478, longitude: 121.517 }, displayName: { text: '台北車站' } }],
    }), { status: 200 })))
    await handler(post({ q: '我家巷口' }))
    const logs = info.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).not.toContain('我家巷口')
    expect(logs).not.toContain('25.04')
    expect((await handler(new Request('http://localhost/api/geocode'))).status).toBe(405)
  })
})

// Round 6：日文站名用 ja 查；查詢本體在 src/geocode.ts。
import { geocodeLanguage, geocodeLookup } from '../../src/geocode.ts'
describe('Round 6：日文站名', () => {
  it('有假名或「駅」→ ja；中文 → zh-TW', () => {
    expect(geocodeLanguage('新宿駅')).toBe('ja') // checker：zh-TW 會回「新宿」，標籤要日文站名
    expect(geocodeLanguage('新宿站')).toBe('zh-TW')
    expect(geocodeLanguage('しんじゅく')).toBe('ja')
    expect(geocodeLanguage('東京スカイツリー')).toBe('ja')
    expect(geocodeLanguage('台北車站')).toBe('zh-TW')
  })
  it('geocodeLookup：ok／not_found／http／timeout 四種結果', async () => {
    const okFetch = (() => new Response(JSON.stringify({ places: [{ location: { latitude: 35.6896, longitude: 139.7006 }, displayName: { text: '新宿駅' } }] }), { status: 200 })) as unknown as typeof fetch
    expect(await geocodeLookup('新宿駅', 'k', 'https://x', okFetch)).toEqual({ kind: 'ok', loc: { lat: 35.6896, lng: 139.7006 }, label: '新宿駅' })
    const empty = (() => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch
    expect(await geocodeLookup('asdf', 'k', 'https://x', empty)).toEqual({ kind: 'not_found' })
    const http = (() => new Response('', { status: 429 })) as unknown as typeof fetch
    expect(await geocodeLookup('x', 'k', 'https://x', http)).toEqual({ kind: 'http', status: 429 })
    const boom = (() => { throw new Error('abort') }) as unknown as typeof fetch
    expect(await geocodeLookup('x', 'k', 'https://x', boom)).toEqual({ kind: 'timeout' })
  })
  it('/api/geocode 用假名查 → languageCode ja', async () => {
    const f = vi.fn((_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      places: [{ location: { latitude: 35.6896, longitude: 139.7006 }, displayName: { text: '新宿駅' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const res = await handler(post({ q: 'しんじゅく駅' }))
    expect(res.status).toBe(200)
    expect((JSON.parse(bodyText(f.mock.calls[0]?.[1]?.body)) as { languageCode?: string }).languageCode).toBe('ja')
    expect((await res.json()) as GeocodeResponse).toEqual({ loc: { lat: 35.6896, lng: 139.7006 }, label: '新宿駅' })
  })
})
