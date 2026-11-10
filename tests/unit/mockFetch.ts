// mock fetch 共用小工具：把 string | URL | Request／BodyInit 收窄成字串。
// 測試裡 fetch 永遠用字串 URL、JSON 字串 body 呼叫；不是字串時退回 fallback，
// 不再用 String()——String(Request) 只會得 "[object Request]"，no-base-to-string 也擋。
export const urlText = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
export const bodyText = (body: unknown, fallback = ''): string =>
  typeof body === 'string' ? body : fallback

/** Google Places Text Search 請求本體（測試解析 JSON.parse 結果用）。
 *  欄位全 optional：缺了就是測試要斷言的失敗，呼叫端用 ?.／?? 收窄。 */
export type PlacesRequestBody = {
  textQuery?: string
  pageSize?: number
  languageCode?: string
  locationRestriction?: {
    circle?: { radius?: number }
    rectangle?: {
      high?: { latitude?: number; longitude?: number }
      low?: { latitude?: number; longitude?: number }
    }
  }
  locationBias?: { circle?: { radius?: number } }
  includedType?: string
  includedTypes?: string[]
  openNow?: boolean
  rankPreference?: string
  priceLevels?: unknown
}
