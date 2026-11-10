// @vitest-environment node
// /api/place-photo（清理 PR，P1-11）：Google Places 照片即時查詢，無快取、不外洩 key。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api/place-photo.ts'

const handler = api.fetch
const get = (placeId?: string) =>
  new Request(`http://localhost/api/place-photo${placeId === undefined ? '' : `?placeId=${encodeURIComponent(placeId)}`}`, { method: 'GET' })

const PLACE_ID = 'ChIJ1234567890abcdef'
const photoName = `places/${PLACE_ID}/photos/AbCdEfGh`
const detailsOk = () =>
  new Response(JSON.stringify({
    photos: [{
      name: photoName,
      authorAttributions: [
        { displayName: 'Alice', uri: 'https://example.com/alice' },
        { displayName: 'Bob', uri: 'http://not-https.example.com/bob' },
        { displayName: 'Carol' },
        { displayName: 'Dave', uri: 'https://example.com/dave' },
      ],
    }],
  }), { status: 200 })
const mediaOk = (photoUri = 'https://lh3.googleusercontent.com/photo-123') =>
  new Response(JSON.stringify({ photoUri }), { status: 200 })

beforeEach(() => {
  process.env.GOOGLE_PLACES_KEY = 'test-places-key'
  delete process.env.PLACES_BASE_URL
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.GOOGLE_PLACES_KEY })

describe('/api/place-photo', () => {
  it('default 是 { fetch }（Vercel 坑 1）；GET 才是唯一合法方法', async () => {
    expect(typeof api).toBe('object')
    expect(typeof api.fetch).toBe('function')
    const post = new Request(`http://localhost/api/place-photo?placeId=${PLACE_ID}`, { method: 'POST' })
    expect((await handler(post)).status).toBe(405)
    expect(await (await handler(post)).json()).toEqual({ error: 'method_not_allowed' })
  })

  it('placeId 缺失／太短／含非法字元 → 400，不打 Places', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await handler(get())).status).toBe(400)
    expect((await handler(get('abc'))).status).toBe(400)
    expect((await handler(get('bad id!'))).status).toBe(400)
    expect((await handler(get('a/b'))).status).toBe(400)
    expect(await (await handler(get('bad id!'))).json()).toEqual({ error: 'invalid_place_id' })
    expect(f).not.toHaveBeenCalled()
  })

  it('沒有 GOOGLE_PLACES_KEY → 503，不打 Places', async () => {
    delete process.env.GOOGLE_PLACES_KEY
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'photo_service_unavailable' })
    expect(f).not.toHaveBeenCalled()
  })

  it('查得到 → 200 {photoUrl, attributions, source}；attribution 最多 3 筆、非 https 網址變 null', async () => {
    const f = vi.fn((_url: string, _init?: RequestInit) => {
      if (_url.includes('/media?')) return Promise.resolve(mediaOk())
      return Promise.resolve(detailsOk())
    })
    vi.stubGlobal('fetch', f)
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { photoUrl: string; attributions: unknown[]; source: string }
    expect(body.photoUrl).toBe('https://lh3.googleusercontent.com/photo-123')
    expect(body.source).toBe('Google Places')
    expect(body.attributions).toEqual([
      { name: 'Alice', url: 'https://example.com/alice' },
      { name: 'Bob', url: null },
      { name: 'Carol', url: null },
    ])
    expect(f).toHaveBeenCalledTimes(2)
    const [detailsUrl, detailsInit] = f.mock.calls[0]!
    expect(detailsUrl).toContain(`/v1/places/${PLACE_ID}`)
    expect((detailsInit!.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('photos')
    expect((detailsInit!.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-places-key')
    expect(f.mock.calls[1]![0]).toContain(`/v1/${photoName}/media?maxWidthPx=960&skipHttpRedirect=true`)
  })

  it('Places details 掛掉 → 502 photo_lookup_failed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))))
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'photo_lookup_failed' })
  })

  it('沒有該店的照片 → 404 photo_unavailable（不打 media）', async () => {
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      photos: [{ name: 'places/OTHERPLACE/photos/xyz' }],
    }), { status: 200 })))
    vi.stubGlobal('fetch', f)
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'photo_unavailable' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('media 掛掉 → 502；media 回非 https 網址 → 404', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      Promise.resolve(url.includes('/media?') ? new Response('boom', { status: 500 }) : detailsOk())))
    expect((await handler(get(PLACE_ID))).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      Promise.resolve(url.includes('/media?') ? mediaOk('http://insecure.example.com/x') : detailsOk())))
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'photo_unavailable' })
  })

  it('fetch 拋錯 → 502 photo_service_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    const res = await handler(get(PLACE_ID))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'photo_service_unavailable' })
  })
})
