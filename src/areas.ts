// 地區偏好（F7）：結構化的「只在這一帶找店」，取代自由文字偏好。
//
// 背景：舊版把「以澀谷為生活基地，避免不必要跨區」寫在自由文字 notes 裡，
// 但 notes 從未送往伺服器，UI 卻以「記住我的偏好」呈現它——使用者有理由
// 相信它生效，系統卻從未讀它。Live 第 5 輪已觀察到後果：不喜歡替換出
// 原宿的店，路線從 1.8 KM／30 MIN 變成 2.7 KM／42 MIN。
//
// 機制：每區一個中心點（該區代表車站）＋半徑 1000 公尺。開啟時，伺服器只派
// 中心半徑內的店（硬過濾，不是提示）。半徑選 1000 而不是 1500 的理由：
// 原宿駅距渋谷駅約 1.2 公里，1500 公尺仍會包含原宿；1000 公尺排除原宿／
// 表参道／恵比寿／代官山各區中心，同時留住澀谷站核心的店（Scramble Square、
// Hikarie、Stream、道玄坂、Sakura Stage 都在 600 公尺內）。距離是中心點直線
// 距離，不是步行距離。
// 指定／固定／已完成的地點是使用者的選擇，不套地區限制（跟評論門檻同一原則）。

/** 地區偏好半徑（公尺）。 */
export const AREA_RADIUS_M = 1000

/** 地區 → 中心點（該區代表車站）。座標是約略值，半徑邊界不靠它精確。 */
export const AREAS: Record<string, { lat: number; lng: number }> = {
  '澀谷': { lat: 35.6595, lng: 139.7005 },
  '新宿': { lat: 35.6896, lng: 139.7006 },
  '原宿': { lat: 35.6702, lng: 139.7027 },
  '表参道': { lat: 35.6652, lng: 139.7123 },
  '恵比寿': { lat: 35.6467, lng: 139.7101 },
  '代官山': { lat: 35.6495, lng: 139.7048 },
}

export const AREA_NAMES = Object.keys(AREAS)

/** 已知地區才回中心點；未知地區回 null＝不過濾（防禦：舊資料或打錯字不該整單失敗）。 */
export function areaCenter(area: string): { lat: number; lng: number } {
  // 未知地區退回「澀谷」（round 7：舊版回 null＝不過濾，fail-open——未知地區名
  // 開啟偏好時全站都過，跟沒開偏好一樣。使用者生活基地是澀谷，loadDaily 也是
  // 未知退回澀谷；UI 下拉只有 6 個已知地區，退回澀谷不會誤傷正常選項）。
  return AREAS[area] ?? AREAS['澀谷']!
}

/**
 * 兩點直線距離（公里，haversine）。伺服器 areaOk（api/daily-route.ts）與前端
 * clearStaleCandidate（src/dailyDecision.tsx）共用同一份公式，兩邊判出來的
 * 「在不在地區內」才會一致。
 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/**
 * 該點是否在地區中心半徑（AREA_RADIUS_M）內；未知地區退回澀谷（跟 areaCenter
 * 同一規則）。
 */
export function withinArea(area: string, p: { lat: number; lng: number }): boolean {
  return distanceKm(areaCenter(area), p) * 1000 <= AREA_RADIUS_M
}
