// Round 6：手動報站 → 座標的 Places 查詢。api/geocode.ts 與 preview 量測（probe mode=geocode）共用同一份。
// 伺服器不存任何東西、不 log 查詞與座標（R12）。只要座標與名稱，不帶評分、營業時間。
export const GEOCODE_FIELD_MASK = 'places.location,places.displayName'
export const GEOCODE_MAX_Q = 60

/** 有日文假名或「駅」→ 用 ja 查（站名回日文「新宿駅」，不是「新宿」）；其餘 zh-TW（「台北車站」「新宿站」）。 */
export function geocodeLanguage(q: string): 'ja' | 'zh-TW' {
  return /[぀-ヿ]|駅/.test(q) ? 'ja' : 'zh-TW'
}

export type GeocodeLookup =
  | { kind: 'ok'; loc: { lat: number; lng: number }; label: string }
  | { kind: 'not_found' }
  | { kind: 'timeout' }
  | { kind: 'http'; status: number }

export async function geocodeLookup(
  q: string, key: string, base = 'https://places.googleapis.com', fetchFn: typeof fetch = fetch,
): Promise<GeocodeLookup> {
  let res: Response
  try {
    res = await fetchFn(`${base}/v1/places:searchText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GEOCODE_FIELD_MASK },
      body: JSON.stringify({ textQuery: q, pageSize: 1, languageCode: geocodeLanguage(q) }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { kind: 'timeout' }
  }
  if (!res.ok) return { kind: 'http', status: res.status }
  const data = (await res.json()) as { places?: { location?: { latitude?: number; longitude?: number }; displayName?: { text?: string } }[] }
  const p = data.places?.[0]
  const lat = p?.location?.latitude
  const lng = p?.location?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return { kind: 'not_found' }
  return { kind: 'ok', loc: { lat, lng }, label: p?.displayName?.text || q }
}
