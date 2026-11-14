import { useEffect, useRef, useState } from 'react'
import './dailyDecision.css'
import { PlacePhoto } from './PlacePhoto.tsx'
import { getLocation, type GeoReason } from './api.ts'
import { blockedPlaceIds, clearDislike, markDailyDislike, migrateDailyDislike } from './placeMem.ts'
import { kindLabel, kindOfCandidate, normalizeKind } from './placeKind.ts'
import { isDeniedCandidate, isDeniedName, MIN_REVIEWS } from './venueCheck.ts'
import { AREA_NAMES, withinArea } from './areas.ts'
import { AFFINITY_WEIGHT, affinityHints, clearAffinity, dropAffinity, loadAffinity, recordAffinity } from './dailyAffinity.ts'

export type DailyTask = { id: string; title: string; minutes: number; kind: 'gym'|'meal'|'creative'|'shopping'|'rest'; done: boolean; place?: string; detail?: string; locked?: boolean; start?: string; custom?: boolean; specified?: boolean; /** 該站是結構化日意圖指定的（true）還是逐站指定的（false／undefined）。舊存檔沒有此欄位時視為 undefined＝逐站指定，完全相容。結構化日意圖只能改 intentSpecified 的站，絕不覆蓋逐站指定。 */ intentSpecified?: boolean; variant?: number; candidate?: {id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean;types?:string[];primaryType?:string;userRatingCount?:number;hours?:unknown[]}; eta?:string;departure?:string;travelMin?:number;conflict?:string; /** 跨日偏移（PR-4 修正輪）：錨點當日 0，跨過午夜 1，依此類推；與 eta／departure 同一束，清掉 ETA 時一起清。舊存檔／舊回應沒有此欄位時視為 0（當天）。 */ etaDayOffset?:number;departureDayOffset?:number; noCandidate?: boolean; noCandidateReason?: 'area'|'filtered'|'empty'|'denied'|'closed'; /** 伺服器依 ETA 判斷的到店營業狀態（daily-open-on-arrival）。只在有 eta 時顯示。 */ openAtEta?: 'open'|'closing'|'closed'|'unknown'; /** 2.4：伺服器標示這間店是種類偏好提高機率後挑中的；卡片顯示一行原因。 */ preferHit?: boolean }
/** 可被意圖指定的站：5 個可搜尋站。rest 不在內——rest 是純文字站，永遠不是搜尋目標。 */
export type IntentStationId = 'gym' | 'meal' | 'creative' | 'coffee' | 'shopping'
/** 5 個可搜尋站的 catalog 順序（活動顯示與存放順序）。 */
const INTENT_CATALOG_ORDER: readonly IntentStationId[] = ['gym', 'meal', 'creative', 'coffee', 'shopping']
const isIntentStationId = (v: unknown): v is IntentStationId => typeof v === 'string' && (INTENT_CATALOG_ORDER as readonly string[]).includes(v)
/** 一日級結構化意圖（2.0 重做）：「今天想去哪裡／想做什麼」的兩個部分裝在同一個物件裡。
 * destination 是「想去哪裡」（自由輸入的地名／店名原文）；activities 是「想做什麼」（明確勾選）；
 * destinationStation 說明目的地落在哪一站（使用者明確選擇）。三個欄位都由使用者
 * 明確給出或由輸入時的便利預設（applyConvenienceDefault）產生，系統絕不從文字推導任何一個欄位。 */
export interface DailyIntent {
  destination: string
  destinationStation: IntentStationId | ''
  activities: IntentStationId[]
}
export const EMPTY_INTENT: DailyIntent = { destination: '', destinationStation: '', activities: [] }
/** 結構化意圖正規化（唯一規則，所有寫入點共用）——純驗證函式，不產生預設：
 * - destination：trim，截到 120 字（與舊意圖框上限、addFixedTask 的 place 上限一致）。
 * - activities：只留 5 個合法站 id，去重，按 catalog 順序（gym／meal／creative／coffee／shopping）存放。
 * - 不變量（RT4-O1 裁定，2026-11-10）：目的地為空時 destinationStation 仍可存著——
 *   先選站、後填目的地是合法順序（設計 §2.2）。站只在目的地非空時生效：
 *   buildDaily 的 dest 守衛（dest !== '' 才取站）與 intentSummaryText 的同款守衛
 *   保證空目的地時站不進路線、不進摘要。舊不變量（空目的地站必為 ''）會把
 *   先選的站立即清掉，與 §2.2 衝突，已刪除。
 * （設計 §2.3），buildDaily／loadDaily／略過等重新推導都不該把它改掉；預設只在使用者主動
 * 輸入時由 applyConvenienceDefault 觸發（目的地 input、活動 checkbox 兩處）。
 * 純函式，不改傳入物件，回傳新物件（activities 換新陣列）。 */
export function normalizeIntent(intent: DailyIntent): DailyIntent {
  const destination = typeof intent.destination === 'string' ? intent.destination.trim().slice(0, 120) : ''
  const activities = [...new Set((Array.isArray(intent.activities) ? intent.activities : []).filter(isIntentStationId))]
    .sort((a, b) => INTENT_CATALOG_ORDER.indexOf(a) - INTENT_CATALOG_ORDER.indexOf(b))
  const destinationStation: IntentStationId | '' = isIntentStationId(intent.destinationStation) ? intent.destinationStation : ''
  return { destination, destinationStation, activities }
}
/** 便利預設（設計 §2.5）：destination 非空、destinationStation 為 ''、且恰好選了一個活動時，
 * destinationStation 預設為該活動的站。預設來自使用者明確勾選的活動，不是文字推導，
 * 且永遠顯示在選單與確認摘要裡，使用者隨時可改。
 * 只在使用者主動輸入時呼叫（目的地 input、活動 checkbox 兩處 UI 處理器），絕不在
 * normalizeIntent／buildDaily／loadDaily／略過處理器裡觸發——預設是「輸入當下的便利」，
 * 不是資料不變量（見 normalizeIntent 註解）。純函式，不改傳入物件。 */
export function applyConvenienceDefault(intent: DailyIntent): DailyIntent {
  if (intent.destination.trim() !== '' && intent.destinationStation === '' && intent.activities.length === 1) {
    const only = intent.activities[0]
    if (only) return { ...intent, activities: [...intent.activities], destinationStation: only }
  }
  return intent
}
/** 結構化意圖相等：逐欄位比對。destination 與 destinationStation 用 ===；
 * activities 以集合比（長度相同且每個元素都在對方裡），不看順序——順序是顯示用的
 * catalog 順序，不是意圖的語義。兩個意圖相等，當且唯當三個欄位都相等。 */
export function sameIntent(a: DailyIntent, b: DailyIntent): boolean {
  return a.destination === b.destination
    && a.destinationStation === b.destinationStation
    && a.activities.length === b.activities.length
    && a.activities.every(id => b.activities.includes(id))
}
/** 結構化意圖複製（純複製，不正規化——寫入點收到的一定已是正規形）。
 * 回傳新物件＋新陣列（快照，不是參照）。 */
export function copyIntent(intent: DailyIntent): DailyIntent {
  return { destination: intent.destination, destinationStation: intent.destinationStation, activities: [...intent.activities] }
}
/** 開始時間正規化（PR-4；唯一規則，所有寫入點共用）：合法 HH:MM 原樣留著，
 * 其餘一律 ''（未指定）。不猜、不補、不修——'9:00'（單位數）、'24:00'、
 * '15:00:00'（帶秒）、非字串，一律視為未指定，伺服器端用當下時間。
 * 正則與 addFixedTask 的 start 驗證是同一個。 */
export function normalizeStartTime(v: unknown): string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ''
}
export type DailyState = {
  day: string; area: string; currentPlace: string
  /** 當日結構化意圖。必填（不再是可選字串）：沒有意圖就是 EMPTY_INTENT，不用 undefined 表示。 */
  intent: DailyIntent
  /** 目前這份任務是哪份結構化意圖長出來的（fix round 3，R2-F3）：buildDaily／replanDaily
   * 每次生成時記下當次意圖；候選保留只比 sameIntent(appliedIntent, intent)。存在 state 層、
   * 不在 stop 陣列裡，伺服器回應洗不掉（伺服器只回 stops，不回這個欄位）；
   * 換天歸零（與 intent 同規則）；舊存檔沒有此欄位時沿用當日 intent（移轉——
   * 任務本來就是那份意圖長出來的，不是猜測）。 */
  appliedIntent: DailyIntent
  /** 今日開始時間（PR-4；HH:MM，''＝未指定，用伺服器當下時間當錨點）。
   * 只在當日有效：換天歸零（與 intent 同規則）。可選欄位：既有字面量
   * state 工廠不含它，仍須編譯通過；未指定時讀成 ''（`?? ''`）。 */
  startTime?: string
  tasks: DailyTask[]; notes: string[]; avoid: string[]
  /** 地區偏好（F7）：只在所選地區中心 1 公里內找店。預設開啟；關掉＝不限區域。 */
  areaOnly?: boolean
  /** 出發地用目前位置（GPS）。只存這個選擇，不存座標：每次搜尋都重新定位。 */
  useHere?: boolean
  /** 目前行程是用哪個出發地排的（originKey）。出發地換了，自動挑的店要在新出發地附近重找。 */
  routedFrom?: string
  /** 每站換掉過的 place_id（今天）。shuffle 時一起送去排除，否則排序固定、只排除當下一間，永遠在前兩名來回跳。 */
  seen?: Record<string, string[]>
  /** 按過「不喜歡這間店」的 place_id。跨天保留；同時寫進核心班長 app 的 placeMem 記憶（markDailyDislike，round 10 起跟核心 app 的「不要再來」分來源記），生成／shuffle 前也會把 placeMem 的封鎖清單讀回來併進排除清單。 */
  disliked?: string[]
  /** 按過「不要這類」的種類鍵（例如 'udon'）。跨天保留；生成與 shuffle 都排除。 */
  dislikedKinds?: string[]
}
const KEY = 'decide.daily.v1'
/** 舊版自由文字偏好「以澀谷為生活基地，避免不必要跨區」：已被結構化地區偏好
 * （area＋areaOnly）取代。載入時對應轉換並從 notes 移除，UI 不再把未讀的
 * 自由文字呈現為「已記住的偏好」（F7）。其他 notes 不動。 */
const CROSS_AREA_NOTE = '以澀谷為生活基地，避免不必要跨區'
const dayInTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
const defaults = (): DailyState => ({
  day: dayInTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', intent: { ...EMPTY_INTENT, activities: [] }, appliedIntent: { ...EMPTY_INTENT, activities: [] }, startTime: '',
  tasks: [], notes: ['固定健身房：FIT-EASY；不推薦其他付費健身房', '偏好安靜咖啡廳、日式定食、藝術與日本 IP'], avoid: [],
  seen: {}, disliked: [], dislikedKinds: [],
})
/** seen 只留今天：換天任務重排，昨天換掉的店不再擋。 */
const sanitizeSeen = (v: unknown): Record<string, string[]> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, ids] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(ids)) out[k] = ids.filter((x): x is string => typeof x === 'string').slice(-20)
  }
  return out
}
const sanitizeIds = (v: unknown, max: number): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(-max) : []
/** 既有候選重驗的上下文（loadDaily 一次算好，傳進 clearStaleCandidate）。伺服器端
 * retentionOk（api/daily-route.ts）同一規則，前後端必須一致：前端清不掉的、
 * 伺服器下次生成時也會清掉；反過來也一樣。 */
export type StaleContext = { disliked: string[]; dislikedKinds: string[]; area: string; areaOnly: boolean }
/** 前後端統一規則（item 7＋round 7 L1／L2）：既有候選重驗——
 * - id 排除（不喜歡／封鎖）與種類排除對所有站生效：明確的「不要」永遠贏，
 *   已完成／固定／指定的站也不例外（不喜歡的店不能因為「已完成」就留著）。
 * - 指定／固定站的候選是使用者的選擇，DENY／評論／地區不重驗（item 7：車站候選照留）。
 * - rest 是純文字站，從來沒有可拜訪的店家，已完成與否都清掉（伺服器端
 *   isTextOnlyRest 同一規則；已完成 rest 不帶候選也不算未解決，否則標記完成
 *   後整單 422）。但固定安排的 rest（locked／custom／specified）是使用者
 *   的選擇，照留。
 * - 自動站的候選還要過 DENY（車站／地標）、評論數門檻、地區限制三關，
 *   任一關不過就清掉重找（L1：地區偏好打開後原宿店照留，就是舊版沒重驗地區）。
 * - 標題還原只在「因為不喜歡／種類排除被清掉」時做（紅隊 round 7 §3 第 9 項
 *   的原意）：被不喜歡的店名不能留在無候選卡片的標題上。其他原因（DENY、
 *   評論數、跨區、rest）清候選就好，不動標題——round 8 把標題還原套到所有
 *   清掉原因，舊存檔候選缺評論數欄位時連標題也被換成目錄標題（round 9 F1：
 *   e2e daily-location.spec.ts:69 迴歸）。
 * - 但「不動標題」不代表「不說原因」（round 10，紅隊 round 9 R9-F1a-load）：
 *   DENY／評論數／跨區清掉時，該站標成 noCandidate 並帶原因，卡片顯示原因
 *   與對應控制（地區連結／清除按鈕），而不是只留舊店名加一句「地點尚未確認」。
 *   標題本身照留（round 9 F1a 的範圍不動），原因寫在卡片內文。rest 例外：
 *   rest 是純文字站，清掉殘留候選後照樣顯示「散步回家，不用找店家。」，
 *   不標 noCandidate。
 * - 評論數缺欄位＝未知，不清掉：舊存檔候選本來就可能沒有 userRatingCount，
 *   缺欄位當成 0 會把整條舊行程的候選在載入時全清掉。只在欄位存在且 < 50
 *   時清。伺服器端 retentionOk 同一規則（新查到的候選是另一條規則 venueOk：
 *   拿不到＝無法驗證＝不派，那是新派發的門檻，不動）。
 * 清掉時自動站的 place（候選帶來的地名）一起丟掉；指定／固定站的 place 是
 * 使用者輸入的，留著。 */
export function clearStaleCandidate(t: DailyTask, ctx: StaleContext = { disliked: [], dislikedKinds: [], area: '澀谷', areaOnly: false }): DailyTask {
  if (!t.candidate) return t
  // 標題還原只在「因為不喜歡／種類排除被清掉」時做（紅隊 round 7 §3 第 9 項
  // 的原意）：被不喜歡的店名不能留在無候選卡片的標題上。其他原因清候選就好，
  // 不動標題（round 9 F1a：round 8 把標題還原套到所有清掉原因，DENY／評論數／
  // 跨區／rest 也換標題，舊存檔的行程標題被洗成目錄標題）。
  // 指定／固定站走 clearedKeepPlace，title 是使用者自己寫的，不動。
  const cleared = { ...t, candidate: undefined, place: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, etaDayOffset: undefined, departureDayOffset: undefined, title: catalogTitle(t.id) ?? t.title }
  const clearedKeepTitle = { ...t, candidate: undefined, place: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, etaDayOffset: undefined, departureDayOffset: undefined }
  const clearedKeepPlace = { ...t, candidate: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, etaDayOffset: undefined, departureDayOffset: undefined }
  if (ctx.disliked.includes(t.candidate.id)) return t.locked || t.custom || t.specified ? clearedKeepPlace : cleared
  const kind = kindOfCandidate(t.candidate)
  if (kind && ctx.dislikedKinds.includes(kind)) return t.locked || t.custom || t.specified ? clearedKeepPlace : cleared
  if (t.locked || t.custom || t.specified) return t
  if (t.kind === 'rest') return clearedKeepTitle
  if (t.done) return t
  // round 10（R9-F1a-load）：DENY／評論數／跨區清掉時，標題照留（round 9 F1a），
  // 但該站要標成 noCandidate 並帶原因——否則卡片只剩舊店名加一句「地點尚未確認」，
  // 使用者不知道為什麼、也沒有地區連結／清除按鈕（live round 7 N5 的模式回歸）。
  if (isDeniedCandidate(t.candidate) || isDeniedName(t.candidate.name)) return { ...clearedKeepTitle, noCandidate: true, noCandidateReason: 'denied' }
  // 評論數缺欄位＝未知，不清掉（round 9 F1b）：舊存檔候選本來就可能沒有
  // userRatingCount（Places 回應不一定有），缺欄位當成 0 會把整條舊行程的候選
  // 在載入時全清掉。只在欄位存在且 < 50 時清。伺服器端 retentionOk 同一規則。
  if (t.id !== 'gym' && t.kind !== 'gym' && t.candidate.userRatingCount !== undefined && t.candidate.userRatingCount < MIN_REVIEWS) return { ...clearedKeepTitle, noCandidate: true, noCandidateReason: 'filtered' }
  if (ctx.areaOnly && !withinArea(ctx.area, t.candidate)) return { ...clearedKeepTitle, noCandidate: true, noCandidateReason: 'area' }
  return t
}
/** 卡片上的營業狀態：有 ETA 與到店判斷時講「到店時」，否則沿用搜尋當下的 openNow。 */
export function openStatusText(t: DailyTask): string {
  if (t.eta && t.openAtEta === 'open') return '預計到店時營業中'
  if (t.eta && t.openAtEta === 'closing') return '預計到店時快打烊'
  if (t.eta && t.openAtEta === 'closed') return '預計到店時未營業'
  if (t.eta && t.openAtEta === 'unknown') return '營業狀態未確認'
  return t.candidate?.openNow === true ? 'Google 顯示目前營業中' : t.candidate?.openNow === false ? 'Google 顯示目前未營業' : '營業狀態未確認'
}
/** 無候選站的顯示文字：按原因給不同的下一步（area 時寫明地區偏好是原因）。 */
export function noCandidateText(t: DailyTask, area: string): string {
  if (t.noCandidateReason === 'area') return `這一站沒有符合條件的店家。地區偏好（${area}，1 公里內）可能擋住了附近的店：關掉「只在這一帶找店」或改選其他地區再試。`
  if (t.noCandidateReason === 'filtered') return '這一站沒有符合條件的店家：符合的店都被排除了（不喜歡／種類／評論數）。清除「不喜歡」的紀錄或放寬條件再試。'
  if (t.noCandidateReason === 'denied') return '這一站之前選的地點是車站或地標，不是可拜訪的店家。請按「換這一站」重新搜尋。'
  if (t.noCandidateReason === 'closed') return '這一站找不到到店時還開著的店家：附近的店在預計到店時已打烊、還沒開門，或離打烊不到 10 分鐘。改開始時間或出發地再試。'
  return '這一站找不到店家。換個出發地或條件再試。'
}
/** 舊存檔／髒存檔的意圖欄位驗證：非 null 物件才取欄位，否則回空意圖的新複製；
 * destination 只接受字串，destinationStation 只接受 5 個合法站 id，
 * activities 只接受陣列、元素只留合法站 id。最後一律經 normalizeIntent。 */
const validateStructuredIntent = (v: unknown): DailyIntent => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...EMPTY_INTENT, activities: [] }
  const o = v as { destination?: unknown; destinationStation?: unknown; activities?: unknown }
  return normalizeIntent({
    destination: typeof o.destination === 'string' ? o.destination : '',
    destinationStation: isIntentStationId(o.destinationStation) ? o.destinationStation : '',
    activities: Array.isArray(o.activities) ? o.activities.filter(isIntentStationId) : [],
  })
}
/** 同日 appliedIntent 是否為合法結構化物件：三個欄位都在且型別正確。
 * 缺欄位時不由 normalizeIntent 補空意圖，改沿用當日 intent（見 loadDaily）。 */
const isValidStructuredIntent = (v: unknown): v is DailyIntent => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as { destination?: unknown; destinationStation?: unknown; activities?: unknown }
  return typeof o.destination === 'string' && typeof o.destinationStation === 'string' && Array.isArray(o.activities)
}
export function loadDaily(): DailyState {
  const fresh = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<DailyState> | null
    if (!raw || !Array.isArray(raw.notes) || !Array.isArray(raw.tasks)) return fresh
    const disliked = sanitizeIds(raw.disliked, 100)
    const dislikedKinds = [...new Set(sanitizeIds(raw.dislikedKinds, 20).map(normalizeKind))]
    const area = typeof raw.area === 'string' && AREA_NAMES.includes(raw.area) ? raw.area : '澀谷'
    const areaOnly = raw.areaOnly === undefined ? true : raw.areaOnly === true
    const ctx: StaleContext = { disliked, dislikedKinds, area, areaOnly }
    // 舊存檔移轉（2.0）：mode 欄位明確剝掉——{...raw} 展開會把它帶回 state，
    // 下次 saveDaily 又存回去。intent 只在同一天保留：換天歸零（{...fresh, ...raw}
    // 展開會把舊 intent 帶過來，所以在後面的覆寫欄位裡按 raw.day 決定留或清）。
    // 舊字串意圖（自由文字，現在無法解析）直接丟棄，不解析、不轉換——轉換它的
    // 唯一方法是再寫一次關鍵字解析，那就是被裁定刪除的東西。
    const { mode: _legacyMode, ...rest } = raw as Partial<DailyState> & { mode?: unknown }
    const legacyStringIntent = typeof (raw as { intent?: unknown }).intent === 'string'
    const intent = raw.day === fresh.day
      ? (legacyStringIntent ? { ...EMPTY_INTENT, activities: [] } : validateStructuredIntent((raw as { intent?: unknown }).intent))
      : { ...EMPTY_INTENT, activities: [] }
    // appliedIntent 與 intent 同規則：換天歸零；舊字串快照丟棄為空意圖；同一天
    // 沒有合法結構化物件時沿用當日 intent——任務本來就是那份意圖長出來的，移轉不是猜測。
    const appliedIntent = raw.day === fresh.day
      ? (legacyStringIntent ? { ...EMPTY_INTENT, activities: [] }
        : isValidStructuredIntent(raw.appliedIntent) ? normalizeIntent(raw.appliedIntent)
        : copyIntent(intent))
      : { ...EMPTY_INTENT, activities: [] }
    return { ...fresh, ...rest, day: fresh.day, intent, appliedIntent,
      // 開始時間（PR-4）：只留今天，換天歸零（與 intent 同規則）；同日不合法值 → ''。
      startTime: raw.day === fresh.day ? normalizeStartTime((raw as { startTime?: unknown }).startTime) : '',
      // 地區偏好移轉（F7）：舊資料的跨區自由文字偏好對應成 area='澀谷'＋areaOnly 開啟；
      // 舊資料沒有 areaOnly 欄位時預設開啟（當時沒有關掉的辦法，開啟才是忠實轉換）。
      area, areaOnly,
      // 無候選站也要留著（noCandidate 標記＋原因）：否則重開頁面後該站直接消失，
      // 使用者看不到「為什麼沒店」也沒法按「換這一站」重找。
      // rest 純文字站也要留著（round 8，live N3）：它沒有候選、沒有 noCandidate 標記，
      // 舊版過濾器只留 custom／locked／done／有候選／無候選的站，rest 每次重進頁面
      // 都被濾掉（第 7 輪的 mergeScheduled 只修了「重新生成當下」，沒修載入路徑）。
      // 指定站（逐站指定與意圖目的地站）也要留著（§7.6 O2）：還沒搜尋過的指定站沒有候選、
      // 也沒有 noCandidate 標記，舊過濾器把它濾掉，摘要卻仍說目的地已附著；逐站指定的
      // 地點是使用者輸入的，濾掉等於丟資料。不改成掛載重跑 replanDaily：重跑會替空行程
      // 自動長出整條目錄行程，改變「今天還沒有行程」的空狀態。
      // 還沒搜尋過的目錄站（gym／meal／creative／coffee／shopping）也留著：它們是當天
      // buildDaily 長出來、使用者看過的行程，舊過濾器重開頁面就濾掉（實測 6 張卡變 2 張）。
      // 只留目錄 id，來路不明的非目錄自動站照舊濾掉；空行程（tasks: []）不會長出新站。
      tasks: raw.day === fresh.day ? raw.tasks.filter(t => typeof t.id === 'string' && (t.custom || t.locked || t.done || t.specified || t.kind === 'rest' || !!t.candidate?.id || !!t.noCandidate || catalogTitle(t.id) !== undefined)).map(t => clearStaleCandidate(t, ctx))
        // 舊字串意圖存檔的 intentSpecified 標記剝離：該站降級為普通 specified
        // （place 原文、候選原樣保留，標記拿掉）。新存檔的標記是結構化意圖的
        // 合法標記，必須保留，此步只在 legacyStringIntent 時觸發。
        .map(t => legacyStringIntent && t.intentSpecified ? { ...t, intentSpecified: undefined } : t) : [], notes: raw.notes.filter(n => n !== CROSS_AREA_NOTE).slice(0,20), avoid: Array.isArray(raw.avoid) ? raw.avoid.slice(0,20) : [], seen: raw.day === fresh.day ? sanitizeSeen(raw.seen) : {}, disliked, dislikedKinds }
  } catch { return fresh }
}
export function saveDaily(s: DailyState): void { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }
const catalog: Omit<DailyTask,'done'>[] = [
  { id:'gym', title:'FIT-EASY｜80 分鐘力量訓練', minutes:80, kind:'gym' },
  { id:'meal', title:'澀谷｜一人友善的日式定食', minutes:45, kind:'meal' },
  { id:'creative', title:'澀谷｜藝術展／日本 IP 快閃探索（出發前查活動與營業）', minutes:65, kind:'creative' },
  { id:'coffee', title:'安靜咖啡廳｜閱讀、寫下 3 個新觀察', minutes:60, kind:'creative' },
  { id:'shopping', title:'澀谷｜運動長袖、純單水肌酸或生活用品（先查庫存）', minutes:55, kind:'shopping' },
  { id:'rest', title:'散步回家、休息與晚餐', minutes:75, kind:'rest' },
]
/** 目錄標題（伺服器端 api/daily-route.ts 的 CATALOG_TITLES 跟這裡同步）：
 * 候選被清掉／站變無候選時，title 還原成這個，不能留著被不喜歡店家的店名。 */
export function catalogTitle(id: string): string | undefined {
  return catalog.find(t => t.id === id)?.title
}
/** 站名（目的地選單、確認摘要用）。內容與舊 INTENT_STATION_LABEL 一字不動，僅改名。 */
export const DAILY_STATION_LABEL: Record<IntentStationId, string> =
  { gym: '健身站', meal: '午餐站', creative: '探索站', coffee: '咖啡站', shopping: '購物站' }
/** 活動標籤（動詞，checkbox 用）。與站名不同組文字，不得混用。 */
export const ACTIVITY_LABEL: Record<IntentStationId, string> =
  { gym: '健身', meal: '吃飯', creative: '看展覽', coffee: '喝咖啡', shopping: '購物' }
/** 確認摘要：把結構化意圖原樣回饋給使用者——顯示的是使用者明確給出的選擇，
 * 不是系統推導的結果。永遠回傳非空字串（空意圖也有空狀態文案），UI 永遠渲染。
 * 只做顯示層整理（目的地 trim、活動按 catalog 順序列出），不套用 §2.5 的便利預設：
 * 摘要是已存意圖的鏡子，預設是寫入時的規則——寫入時沒預設的站，摘要不得事後替它預設。 */
export function intentSummaryText(intent: DailyIntent): string {
  const dest = typeof intent.destination === 'string' ? intent.destination.trim() : ''
  const station = dest === '' ? '' : (isIntentStationId(intent.destinationStation) ? intent.destinationStation : '')
  const activities = (Array.isArray(intent.activities) ? intent.activities : []).filter(isIntentStationId)
    .sort((a, b) => INTENT_CATALOG_ORDER.indexOf(a) - INTENT_CATALOG_ORDER.indexOf(b))
  const others = activities.filter(id => id !== station)
  const activityText = (ids: IntentStationId[]) => ids.map(id => ACTIVITY_LABEL[id]).join('、')
  if (dest === '' && activities.length === 0) return '今天沒有指定目的地或活動，留空就隨興探索。'
  if (dest === '') return `想做：${activityText(activities)}`
  if (station === '') {
    const base = `目的地：${dest}（請選是哪一站，否則不會進路線）`
    return others.length ? `${base}；想做：${activityText(others)}` : base
  }
  const base = `目的地：${dest} → ${DAILY_STATION_LABEL[station]}`
  return others.length ? `${base}；還想：${activityText(others)}` : base
}
/** 結構化意圖驅動（2.0 重做）：目的地附到 destinationStation 指定的站，活動勾選
 * 本身不產生查詢字串。分支按順序判斷，第一個符合的勝出；order 固定為創意預設
 * 再按 avoid 過濾（不動）。目的地原文逐字進 place，不做任何關鍵字比對。 */
export function buildDaily(s: DailyState): DailyTask[] {
  const previous = new Map(s.tasks.map(t=>[t.id,t]))
  // 2.0：order 固定為創意預設（不再有 mode 分支），再按 avoid 過濾。
  const order = ['gym','meal','creative','coffee','shopping','rest']
  const intent = normalizeIntent(s.intent ?? EMPTY_INTENT)
  const applied = s.appliedIntent ?? EMPTY_INTENT
  const dest = intent.destination.trim()
  const destStation = dest !== '' ? intent.destinationStation : ''
  const covered = (id: string) => intent.activities.includes(id as IntentStationId) || id === destStation
  return order.filter(id=>!s.avoid.includes(id)).map(id=>{
    const c = catalog.find(t=>t.id===id)!
    const prev = previous.get(id)
    const base = { ...c, ...prev, done: prev?.done ?? false }
    // (1) 逐站指定優先於日意圖：使用者親手指定的地點，日意圖不得覆蓋。
    if (prev?.specified && !prev.intentSpecified) return base
    // (2) 意圖不再覆蓋本站：目的地移走／活動取消勾選／目的地清空時，該站回復目錄預設。
    if (prev?.intentSpecified && !covered(id)) return { ...c, done: prev?.done ?? false }
    // (3) 目的地站：同一意圖重跑且有候選時保留（place 留著店家地址）；否則新指定，
    // 舊候選連同 noCandidate 一起清掉（noCandidate 是舊查詢的結果）。
    if (id === destStation) {
      if (prev?.intentSpecified && sameIntent(applied, intent) && prev.candidate) return { ...base, specified: true, intentSpecified: true }
      return { ...base, place: dest, specified: true, intentSpecified: true, candidate: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, etaDayOffset: undefined, departureDayOffset: undefined, noCandidate: undefined, noCandidateReason: undefined }
    }
    // (4) 本站曾是目的地站，現在只是被選活動站：變回普通自動站。
    if (prev?.intentSpecified && covered(id)) return { ...base, place: undefined, specified: false, intentSpecified: false, candidate: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, etaDayOffset: undefined, departureDayOffset: undefined, noCandidate: undefined, noCandidateReason: undefined }
    // (5) 未被意圖覆蓋的站：維持現有 previous 合併行為不變。
    return base
  })
}
/** 伺服器回應的 stops 經 sanitize（api/daily-route.ts 只保留已知欄位），
 * intentSpecified 標記會被洗掉；搜尋前是結構化日意圖站、回應仍是指定站的，把標記
 * 從舊 state 補回來——否則下次換意圖時該站會被誤當成逐站指定、再也跟不上結構化日意圖。
 * 標記只看「搜尋前是結構化日意圖站」且「回應仍是指定站」：place 被伺服器改寫成店家
 * 地址是正常的成功行為（api/daily-route.ts:277），不是意圖被改，所以 place
 * 相等絕不能是條件——成功路徑下它永不相等，101–120 字意圖連保留路徑都會被
 * sanitize 截到 100 字。api 檔本身不動。 */
const restoreIntentSpecified = (stops: DailyTask[], old: DailyTask[]): DailyTask[] =>
  stops.map(t => {
    const prev = old.find(x => x.id === t.id)
    return prev?.intentSpecified && t.specified ? { ...t, intentSpecified: true } : t
  })
/** 2.4：伺服器只在「這次新挑」的站回 preferHit；原樣保留的站（單站換店時的其他站、已完成站）
 * 回應裡沒有這個旗標。同一站、同一間店沒換，原因也沒變，從舊 state 補回來；店換了就不補。 */
const restorePreferHit = (stops: DailyTask[], old: DailyTask[], shuffle?: string): DailyTask[] =>
  stops.map(t => {
    const prev = old.find(x => x.id === t.id)
    // 只補「伺服器這次原樣保留」的站：已完成站，或單站換店時的其他站。完整重新生成時自動站是重挑的，
    // 剛好挑回同一間也不補（那次挑選沒有受偏好影響，補了就是謊稱；把關 R1 F1）。
    const kept = t.done === true || (shuffle !== undefined && t.id !== shuffle)
    return kept && prev?.preferHit && !!t.candidate && prev.candidate?.id === t.candidate.id ? { ...t, preferHit: true } : t
  })
/** 2.4 行為訊號的來源鍵：同一天、同一站、同一間店只算一次。 */
const affinitySrc = (what: 'spec' | 'done' | 'swap', day: string, stopId: string, placeId: string): string => `${what}:${day}:${stopId}:${placeId}`
/** 2.4：搜尋成功後記行為訊號（只寫本機）。手動指定的站這次解析到真店 +3；
 * 單站換店換掉的是自動挑的店 −1（同一天同一站只算一次：連換幾間只是想換店，不是討厭這個種類；把關 R1 F2）。種類判不出就不記（recordAffinity 內處理）。 */
export function recordRouteSignals(proposed: DailyState, stops: DailyTask[], shuffle: string | undefined, replaced: DailyTask | undefined, now: number): void {
  for (const t of stops) {
    const sent = proposed.tasks.find(x => x.id === t.id)
    if (t.candidate && t.specified && sent?.specified && !sent.candidate) recordAffinity(kindOfCandidate(t.candidate), AFFINITY_WEIGHT.specified, now, affinitySrc('spec', proposed.day, t.id, t.candidate.id))
  }
  if (shuffle && replaced?.candidate && !replaced.done && !replaced.locked && !replaced.custom && !replaced.specified) recordAffinity(kindOfCandidate(replaced.candidate), AFFINITY_WEIGHT.swapped, now, affinitySrc('swap', proposed.day, replaced.id, '*'))
}
/** 2.4：請求多帶的種類偏好。沒有過閾值的種類就不帶欄位（請求與沒有這個功能時相同）。 */
export function affinityRequestFields(now: number): { prefer?: string[]; demote?: string[] } {
  const { prefer, demote } = affinityHints(loadAffinity(), now)
  return { ...(prefer.length ? { prefer } : {}), ...(demote.length ? { demote } : {}) }
}
/** rest 純文字站（「散步回家」）：不需要找店家。與伺服器 api/daily-route.ts 的
 * isTextOnlyRest 同一規則——固定安排／自訂／指定了地點的 rest 不算。 */
export const isTextOnlyRest = (t: DailyTask): boolean => t.id === 'rest' && !t.locked && !t.custom && !t.specified
export function replanDaily(s: DailyState): DailyState {
  // Keep completed tasks and their state. Only uncompleted tasks are rebuilt.
  const done = s.tasks.filter(t=>t.done || t.locked || t.custom)
  const pending = buildDaily(s).filter(t=>!t.done && !done.some(d=>d.id===t.id))
  // 這份任務是當次意圖長出來的：記下 appliedIntent，下次重跑比的就是它（R2-F3）。
  return { ...s, appliedIntent: copyIntent(s.intent), tasks: [...done,...pending] }
}
/** 出發地的身分：目前位置，或輸入的地名。 */
export const originKey = (s: DailyState): string => s.useHere ? 'here' : 'text:' + s.currentPlace.trim()
/**
 * 整份重新搜尋時送出的行程。出發地沒換：保留已選的店，只重排路線。
 * 出發地換了（例如澀谷站 → 目前位置）：自動挑的店丟掉，讓伺服器在新出發地附近重找；
 * 已完成、固定安排、你指定的地點照留。舊資料沒有 routedFrom：當作用當時輸入的地名排的。
 */
export function routeProposal(s: DailyState): DailyState {
  const from = s.routedFrom ?? 'text:' + s.currentPlace.trim()
  const base = from === originKey(s) ? s : { ...s, tasks: s.tasks.filter(t => t.done || t.locked || t.custom || t.specified) }
  return base.tasks.length ? replanDaily(base) : { ...base, appliedIntent: copyIntent(base.intent), tasks: buildDaily(base) }
}
/** 定位拿不到的原因（畫面文字）。 */
export const GEO_FAIL_TEXT: Record<GeoReason, string> = {
  ok: '沒有拿到座標', denied: '你沒有允許定位', unsupported: '這個瀏覽器不能定位',
  timeout: '定位逾時（可能在地下或室內）', unavailable: '收不到定位訊號',
}
export function addFixedTask(s: DailyState, title: string, place: string, start: string, minutes: number): DailyState {
 if(!title.trim() || !place.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !Number.isFinite(minutes) || minutes<5 || minutes>720) return s
 const task:DailyTask={id:'fixed-'+Date.now()+'-'+s.tasks.length,title:title.trim().slice(0,100),place:place.trim().slice(0,120),start,minutes,kind:'rest',done:false,locked:true,custom:true,detail:'既有固定安排：不會被重排或洗牌。'}
 return {...s,tasks:[...s.tasks,task].sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'))}
}
export function mapsNavigationUrl(place:{id:string;lat:number;lng:number}):string {
 const url=new URL('https://www.google.com/maps/dir/')
 url.searchParams.set('api','1')
 url.searchParams.set('destination',place.lat+','+place.lng)
 url.searchParams.set('destination_place_id',place.id)
 url.searchParams.set('travelmode','walking')
 url.searchParams.set('dir_action','navigate')
 return url.toString()
}
/**
 * 把剛被換掉的店記進 seen：下一次 shuffle 還要排除它，否則排序固定、
 * 每次只排除當下一間，永遠在前兩名來回跳。同一間重複記只留一筆。
 */
export function withSeen(s: DailyState, stopId: string, placeId: string): DailyState {
  const prev = s.seen?.[stopId] ?? []
  if (prev.includes(placeId)) return s
  return { ...s, seen: { ...(s.seen ?? {}), [stopId]: [...prev, placeId].slice(-20) } }
}
/** 送給伺服器的排除清單上限（跟 api/daily-route.ts 同步）：不喜歡 100＋placeMem 封鎖
 * （理論上無上限，實際是使用者明確按過「不要再來」的店）＋每站換掉過的 20。
 * 200 蓋得住實際最大值（100＋30＋20＝150 還有餘裕）；截斷時封鎖排最前，
 * 讓明確設的時效排除最後才被截。其他站現任候選另外走 `others`（見 othersFor），
 * 不再佔這 200 的額度（round 8 K1）。 */
const EXCLUDE_LIMIT = 200
/** 合併排除清單：去重、留前 200，並回報被截掉的數量（round 7：舊版靜默截斷，
 * 200 蓋不住時使用者完全不知道有「不喜歡」的店沒送出，下次又出現）。
 * 呼叫端按優先順序排好再傳進來，截掉的是排在後面的。 */
export function mergeExcludeInfo(...lists: string[][]): { list: string[]; dropped: number } {
  const merged = [...new Set(lists.flat())]
  return { list: merged.slice(0, EXCLUDE_LIMIT), dropped: Math.max(0, merged.length - EXCLUDE_LIMIT) }
}
/** 送給伺服器的排除清單上限（跟 api/daily-route.ts 同步）：不喜歡 100＋placeMem 封鎖
 * （理論上無上限，實際是使用者明確按過「不要再來」的店）＋每站換掉過的 20。
 * 200 蓋得住實際最大值（100＋30＋20＝150 還有餘裕）；截斷時封鎖排最前，
 * 讓明確設的時效排除最後才被截。其他站現任候選另外走 `others`（見 othersFor），
 * 不再佔這 200 的額度（round 8 K1）。 */
export function mergeExclude(...lists: string[][]): string[] {
  return mergeExcludeInfo(...lists).list
}
/**
 * 兩份排除清單（round 8，K1／live N1）：
 * - excludeFor／excludeForInfo：只有「使用者不要的店」——placeMem 封鎖 → 不喜歡
 *   的店 → 該站換掉過的。retention 重驗與新搜尋都讀它。
 * - othersFor：其他站目前的候選。只在新搜尋的 eligible 過濾裡用（防止新店跟別站
 *   重複），絕對不進 retention 重驗。round 7 把兩份混在同一份清單裡，單站 shuffle
 *   時其他站的候選全被 retentionOk 判不通過、全部清掉重找——「換這一站」變成整條
 *   路線重排，池子不夠時其他站還變成無候選。
 */
export function excludeForInfo(s: DailyState, shuffleId: string, memBlocked: string[] = []): { list: string[]; dropped: number } {
  return mergeExcludeInfo(memBlocked, s.disliked ?? [], (s.seen ?? {})[shuffleId] ?? [])
}
export function excludeFor(s: DailyState, shuffleId: string, memBlocked: string[] = []): string[] {
  return excludeForInfo(s, shuffleId, memBlocked).list
}
/** 其他站目前的候選（去重、留順序）：只在新搜尋時防重複，不進 retention 重驗。 */
export function othersFor(s: DailyState, shuffleId: string): string[] {
  return [...new Set(s.tasks.filter(t => t.id !== shuffleId).map(t => t.candidate?.id).filter((x): x is string => !!x))]
}
/** 完整重新生成時送出的 seen（round 11；用戶 2026-11-08 21:22 決定：完整重新生成
 * 也要送 seen）。各站換掉過的店＋目前路線上的店全部合併——完整重新生成時自動站
 * 全部重找，舊店不送進 seen 的話隨機挑選可能又挑回同一間，路線就不會換；剛被換
 * 掉的店在完整重新生成時也不能立刻回來。跟 exclude 分開送：seen 只擋「自動挑的
 * 站的新搜尋」，不進 retention 重驗——固定／指定／已完成站的候選本來就可能在
 * seen 裡（例如先被換掉、後來被指定成固定地點），進 retention 會把使用者自己的
 * 選擇清掉。伺服器端同一規則（api/daily-route.ts）。上限 200，跟 exclude 同步
 * （每站最多 20 筆，9 站最多 180）。 */
export function seenFor(s: DailyState): string[] {
  const current = s.tasks.map(t => t.candidate?.id).filter((x): x is string => !!x)
  return [...new Set([...Object.values(s.seen ?? {}).flat(), ...current])].slice(0, 200)
}
/**
 * 完整重新生成時，把被換掉的自動站現任候選記進 seen（2.2 O2：跨請求留存）。
 * 缺口（ROADMAP 2.2「seen 未持久化到 state.seen」的確切位置）：searchRoute 的完整重生
 * 路徑只在請求當下用 seenFor 把現任候選送進 seen，從不寫回 state.seen——換掉的店
 * 只被擋一次，下一次重生就可能馬上回來。單站 shuffle（withSeen）與「不喜歡」
 * （dislikeStop）本來就會寫，只有完整重生這條路徑漏了，補在這裡。
 * 只記自動站（!done／!locked／!custom／!specified）：指定／固定／已完成站完整重生
 * 時照留，不是被換掉；seen 也只擋自動站的新搜尋（api/daily-route.ts:258 的
 * !auto 守衛），兩邊同一條 auto 定義。
 * seen 弱於 disliked：這裡只寫 seen，disliked／dislikedKinds 一字不動；清除 seen
 * 也不動 disliked（見 clearSeen）。
 */
export function withCurrentAsSeen(s: DailyState): DailyState {
  return s.tasks.reduce((acc, t) => {
    const id = t.candidate?.id
    const auto = !t.done && !t.locked && !t.custom && !t.specified
    return id && auto ? withSeen(acc, t.id, id) : acc
  }, s)
}
/** 清除今天換掉的店紀錄（2.2 O2「可清除」的使用者操作）：只清 seen，不動
 * disliked／dislikedKinds（那是明確封鎖，比 seen 強，不能跟著清掉）。換天時
 * loadDaily 另有過期機制（seen 歸零、disliked 保留），兩條清除路徑互補。 */
export function clearSeen(s: DailyState): DailyState {
  return { ...s, seen: {} }
}

/** 跨日標記（PR-4 修正輪）：eta／departure 的 day offset 轉顯示前綴。
 * 0（或缺欄位＝舊回應／舊存檔）→ 當天，不標；1 →「翌日」；2 以上寫「＋N 日」。
 * eta 與 departure 各標各的：同一站可能 eta 當天、離開翌日。 */
const dayMark = (offset?: number): string => !offset ? '' : offset === 1 ? '翌日 ' : `＋${offset}日 `

/** 今日設定的底部選單（版面用）：一顆膠囊對一張選單，一張最多兩個欄位。 */
const SHEET_IDS = ['origin','time','dest','acts','area','fixed','notes'] as const
type SheetId = typeof SHEET_IDS[number]
const SHEET_TITLE: Record<SheetId, string> = { origin:'出發地', time:'幾點開始', dest:'想去哪裡', acts:'想做什麼', area:'地區', fixed:'已安排的行程', notes:'備註' }

export function DailyDecision({ onBack }: { onBack: () => void }) {
  const [state,setState] = useState(loadDaily)
  const [feedback,setFeedback] = useState('')
  const [busy,setBusy] = useState<string | null>(null)
  const [status,setStatus] = useState('')
  /** 上限提示（例如「不喜歡」已滿 100 家）：跟狀態列分開顯示，搜尋成功後也不會被洗掉。 */
  const [notice,setNotice] = useState('')
  const [routeKm,setRouteKm] = useState<number | null>(null)
  const [travelMin,setTravelMin] = useState<number | null>(null)
  const [conflicts,setConflicts] = useState<string[]>([])
  const [fixedTitle,setFixedTitle] = useState('')
  const [fixedPlace,setFixedPlace] = useState('')
  const [fixedTime,setFixedTime] = useState('15:00')
  const [fixedMinutes,setFixedMinutes] = useState('60')
  const change = (fn:(s:DailyState)=>DailyState) => setState(s=>{ const next=fn(s); saveDaily(next); return next })
  /** 路線顯示清除（PR-4 修正輪 F2）：路線距離／步行分鐘／衝突橫幅之外，各站卡片上
   * 的舊 eta／departure／travelMin／conflict（含跨日偏移）也一起清掉——只清橫幅、
   * 留著逐站舊值，畫面會自相矛盾（橫幅說沒衝突、卡片卻說晚到）。改時間／改地區／
   * 改起點都走這裡，路線過期時整束一起清，不留一半。 */
  const clearRoute = () => {setRouteKm(null);setTravelMin(null);setConflicts([]);change(s=>({...s,tasks:s.tasks.map(t=>({...t,eta:undefined,departure:undefined,travelMin:undefined,conflict:undefined,etaDayOffset:undefined,departureDayOffset:undefined}))}))}
  /** /api/daily-route 的回應形狀（前端只讀這些欄位；未知欄位不讀）。partial／missingStops
   * 是 2.1 O1 的頂層契約（伺服器明確標示缺站）；舊形狀回應沒有這兩個欄位時退回逐站掃描。
   * anchorTime 是伺服器實際用的錨點（PR-4 修正輪 O2；舊回應沒有此欄位時視為未提供）。 */
  type DailyRouteResponse={message?:string;stops?:DailyTask[];routeVerified?:boolean;distanceKm?:number;travelMinutes?:number;conflicts?:string[];partial?:boolean;missingStops?:{id:string;reason?:string}[];anchorTime?:string}
  const searchRoute = async (shuffle?:string, s:DailyState=state) => {
    if(busy)return
    setBusy(shuffle??'all')
    // 目前位置：每次搜尋都重新定位。拿不到就停在這裡——原行程不動，也不改用預設的澀谷站。
    let here:{lat:number;lng:number}|undefined
    if(s.useHere){
      setStatus('正在取得目前位置…')
      const geo=await getLocation()
      if(!geo.loc){setStatus('無法使用目前位置：'+GEO_FAIL_TEXT[geo.reason]+'。原行程已保留；可按「改用輸入地點」輸入車站或地址。');setBusy(null);return}
      here=geo.loc
    }
    let proposed=shuffle ? s : routeProposal(s)
    // shuffle 先把被換掉的那間記進 seen：這次請求就要排除它，否則下一輪它又回來。
    const replaced=shuffle?proposed.tasks.find(t=>t.id===shuffle):undefined
    const replacedId=replaced?.candidate?.id
    if(shuffle&&replacedId)proposed=withSeen(proposed,shuffle,replacedId)
    // 2.2 O2：完整重新生成也要把被換掉的店寫進 seen（不只送、不存）。withCurrentAsSeen
    // 只記自動站現任候選；下面合併處的 seen:{...old.seen,...proposed.seen} 隨後把它存進 state，
    // 下一次重生才擋得住。單站 shuffle 另有 withSeen，不走這裡。
    if(!shuffle)proposed=withCurrentAsSeen(proposed)
    // F8：換單一站時不說成整條路線重找——伺服器只重找那一站，狀態列說清楚。
    setStatus(shuffle ? '正在找這一站的替代地點…' : '正在搜尋真實店家並優化路線…')
    // placeMem 封鎖清單（核心班長 app 的「不要再來」）：讀不到（無痕模式等）就只用 localStorage，不讓整次搜尋失敗。
    let memBlocked: string[] = []
    try { memBlocked = await blockedPlaceIds(Date.now()) } catch { memBlocked = [] }
    try {
      // 排除清單超過 200 時截斷不再靜默：回應欄位沒有單獨的 notice 通道，寫進畫面的
      // notice（搜尋成功後也不洗掉）；被截掉的是排在後面的店（該站換掉過的 seen 優先被截）。
      const excludeInfo = shuffle ? excludeForInfo(proposed, shuffle, memBlocked) : mergeExcludeInfo(memBlocked, proposed.disliked ?? [])
      if (excludeInfo.dropped > 0) setNotice(prev => (prev ? prev + ' ' : '') + `排除清單已滿（上限 200）：${excludeInfo.dropped} 個「不喜歡／封鎖」的店家未送出，較舊的可能再次出現。`)
      // 地區偏好（F7）真的送往伺服器：area＋areaOnly。搜尋結果會顯示沒有更多選擇。
      // others（其他站現任候選，round 8 K1）：單站 shuffle 時另外送，只在新搜尋防重複，
      // 不進伺服器的 retention 重驗。完整重新生成不送 others（沒有要換的站，也沒有「其他站」），
      // 改送 seen（round 11：各站換掉過的店全部合併，剛被換掉的店在完整重新生成時也不回來；
      // seen 同樣只擋自動站的新搜尋、不進 retention，見 seenFor）。
      const response=await fetch('/api/daily-route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...(here?{origin:here}:{location:s.currentPlace}),area:s.area,areaOnly:s.areaOnly!==false,startTime:s.startTime??'',stops:proposed.tasks,shuffle,exclude:excludeInfo.list,excludeKinds:(proposed.dislikedKinds??[]).map(normalizeKind),...(shuffle?{others:othersFor(proposed,shuffle)}:{seen:seenFor(proposed)}),...affinityRequestFields(Date.now())})})
      const data=(await response.json()) as DailyRouteResponse
      if(!response.ok)throw new Error(data.message??'搜尋失敗')
      if(data.stops)recordRouteSignals(proposed,data.stops,shuffle,replaced,Date.now())
      change(old=>({...old,tasks:restorePreferHit(restoreIntentSpecified(data.stops??old.tasks, old.tasks), old.tasks, shuffle),appliedIntent:proposed.appliedIntent ?? copyIntent(proposed.intent),seen:{...(old.seen??{}),...(proposed.seen??{})},disliked:proposed.disliked??old.disliked,dislikedKinds:proposed.dislikedKinds??old.dislikedKinds,...(shuffle?{}:{routedFrom:originKey(s)})}))
      setRouteKm(data.routeVerified?data.distanceKm??null:null)
      setTravelMin(data.routeVerified?data.travelMinutes??null:null)
      setConflicts(data.conflicts??[])
      // 有站顯示「無候選」時狀態列要說清楚是哪一站——不要只說「店家已確認」。
      // 原因寫在每一站的卡片上（noCandidateText），狀態列只點名。
      // 2.1 O1：缺站清單優先讀伺服器的頂層 missingStops（partial 契約）；舊形狀回應
      // 沒有這兩個欄位時退回逐站掃 noCandidate（同一份標示，不寫兩套文案）。
      // partial 為真時狀態列明寫「部分行程」，讓使用者一眼知道這不是完整路線。
      // F3（修正輪）：missingStops 為空陣列是 truthy，舊碼走 missingStops 分支、
      // 對映結果為空就再也不掃逐站旗標。partial 為真卻對映不到缺站時，退回逐站掃
      // noCandidate（沿用舊形狀回應的 fallback 邏輯，不另寫一套）。missingStops
      // 缺失時本來就走逐站掃描，不變。
      const mappedMissing=data.missingStops
        ? data.missingStops.map(m=>(data.stops??[]).find((t: DailyTask)=>t.id===m.id)).filter((t): t is DailyTask=>!!t)
        : undefined
      // RT2-F2：missingStops 不完整（漏列某個帶 noCandidate 的站）時，舊碼只信 missingStops、
      // 漏點名那一站。改成兩者聯集：missingStops 排前面（伺服器順序），再補逐站 noCandidate
      // 裡沒列到的站。missingStops 為空或缺失時，聯集就等於逐站掃描（F3 行為不變）。
      const flagged=(data.stops??[]).filter((t: DailyTask)=>t.noCandidate)
      const noCand=mappedMissing!==undefined
        ? [...mappedMissing,...flagged.filter(t=>!mappedMissing.some(m=>m.id===t.id))]
        : flagged
      const noCandNote=noCand.length?`；${data.partial===true?'部分行程：':''}${noCand.map((t: DailyTask)=>t.title||t.id).join('、')}沒有符合條件的店家`:''
      // F2（修正輪）：沒有任何站有候選時（空行程，或全站缺站），「店家已確認」是假陳述，
      // 不寫。空行程只說今天還沒有行程；全站缺站只說缺站（noCandNote 已含「部分行程：」）。
      const hasCandidate=(data.stops??[]).some((t: DailyTask)=>!!t.candidate)
      // O2（PR-4 修正輪）：過去時間被 clamp 後，狀態列寫明實際用的錨點。不改 clamp
      // 規則；只有「使用者填了合法時間、伺服器卻用了另一個時間」時才顯示——未指定／
      // 不合法／未來時間時不顯示。路線沒驗證成功時也沒有排程，不顯示。
      const anchorNote=data.routeVerified&&data.anchorTime&&normalizeStartTime(s.startTime)!==''&&data.anchorTime!==s.startTime?`；已以現在 ${data.anchorTime} 開始排`:''
      // RT2-F1：只剩 rest 純文字站（其他站都略過）時，沒有任何站需要找店家，
      // 「沒有找到符合條件的店家」是假陳述。改說行程不用找店家。
      const needsStore=(data.stops??[]).some((t: DailyTask)=>!isTextOnlyRest(t))
      if(!hasCandidate)setStatus((data.stops??[]).length===0?'今天還沒有行程。':!needsStore?`今天的行程不用找店家。${anchorNote}`:`沒有找到符合條件的店家${noCandNote}${anchorNote}`)
      else setStatus(data.routeVerified?'店家已確認 · 已更新 Google Routes 步行路線'+(data.conflicts?.length?'；請留意時間衝突':'')+noCandNote+anchorNote:'店家已確認，但步行路線目前無法驗證。請用 Google Maps 導航確認。'+noCandNote+anchorNote)
    }catch(e){setStatus('無法更新：'+(e instanceof Error?e.message:'未知錯誤')+'；原行程已保留')}
    finally{setBusy(null)}
  }
  const generate = () => {setNotice('');void searchRoute()}
  /** 今天換掉的店有幾家（seen 各站 id 數總和）：清除按鈕只在有紀錄時出現。 */
  const seenCount = Object.values(state.seen ?? {}).flat().length
  /** 清除今天換掉的店紀錄（2.2 O2「可清除」）：只清 seen，disliked 不動（見 clearSeen）。 */
  const clearSeenRecord = () => {
    change(s => clearSeen(s))
    setNotice(`已清除今天換掉的 ${seenCount} 家店紀錄，可以重新搜尋。`)
  }
  /** 2.4（Q4）：一次清掉全部種類偏好紀錄。seen／disliked 不動；卡片上的原因行也一起拿掉。 */
  const clearAffinityRecord = () => {
    clearAffinity()
    change(s => ({ ...s, tasks: s.tasks.map(t => t.preferHit ? { ...t, preferHit: undefined } : t) }))
    setNotice('已清除學到的種類偏好。「不喜歡」與今天換掉的店紀錄不受影響。')
  }
  /** 2.4：標記完成 +2（取消勾選就撤回同一筆）。沒有真店或判不出種類就不記。 */
  const toggleDone = (t: DailyTask, done: boolean) => {
    if (t.candidate) {
      const src = affinitySrc('done', state.day, t.id, t.candidate.id)
      if (done) recordAffinity(kindOfCandidate(t.candidate), AFFINITY_WEIGHT.done, Date.now(), src)
      else dropAffinity(src)
    }
    change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,done}:x)}))
  }
  // 按「用目前位置」＝切到目前位置並立刻搜尋（定位拿不到就只顯示原因）。
  const pickHere = () => {change(s=>({...s,useHere:true}));clearRoute();void searchRoute(undefined,{...state,useHere:true})}
  const pickTyped = () => {change(s=>({...s,useHere:false}));clearRoute();setStatus('起點變更，請重新搜尋路線')}
  const addFeedback = () => {
    const v=feedback.trim()
    if(!v) return
    change(s=>({ ...s, notes:[...s.notes,v].slice(-20) }))
    setFeedback('')
  }
  /** 「不喜歡這間店」：記進 disliked（跨天保留）＋共用核心班長 app 的 placeMem 記憶（round 10 起用 markDailyDislike，跟核心 app 的「不要再來」分來源記——兩邊各按一次是 90 天不是永久；清掉今日行程的紀錄也不會連核心 app 的封鎖一起清掉），然後立刻換一間。
   * 先寫入再進清單（round 11，紅隊 round 10 R10-F2b）：舊版 void fire-and-forget，寫入失敗時
   * id 已經進了 disliked 清單、紀錄卻沒有 daily 欄位，之後清除會走到舊紀錄分支。
   * 寫入失敗就不加進清單、不重找，說清楚。 */
  const dislikeStop = async (t: DailyTask) => {
    const id=t.candidate?.id
    if(!id||busy!==null)return
    try { await markDailyDislike(id, Date.now()) } catch { setNotice('「不喜歡」的紀錄寫入失敗，請再按一次。'); return }
    const prev=state.disliked??[]
    // 上限留最新的 100 家：滿了就移除最舊的一家，並明確提示，不要靜默丟掉剛按的「不喜歡」。
    const capped=[...new Set([...prev,id])].slice(-100)
    setNotice(prev.length>=100&&!prev.includes(id)?'「不喜歡」的店已滿 100 家：已移除最舊的一家，只保留最近的 100 家。':'')
    const next=withSeen({ ...state, disliked:capped }, t.id, id)
    change(()=>next)
    void searchRoute(t.id, next)
  }
  /** 「不要這類」：記下種類鍵（例如 'udon'），生成與 shuffle 都排除同一類。 */
  const dislikeKind = (t: DailyTask) => {
    const kind=t.candidate?kindOfCandidate(t.candidate):undefined
    const id=t.candidate?.id
    if(!kind||!id||busy!==null)return
    const next=withSeen({ ...state, dislikedKinds:[...new Set([...(state.dislikedKinds??[]),kind])].slice(-20) }, t.id, id)
    change(()=>next)
    void searchRoute(t.id, next)
  }
  /**
   * 「清除『不喜歡』的紀錄」（round 8，F7 死路文案的修正：加一個真的能按的控制，
   * 不是只改文案）。無候選卡片的原因是「都被排除了」時，唯一的出路就是清掉排除
   * 紀錄——不加控制，文案說「清除『不喜歡』的紀錄」是死路；只改文案（例如「等
   * 100 家滿了自動移除最舊的」）雖然是真的行為，但使用者當下還是卡著。
   * 清掉今日行程的 disliked／dislikedKinds，同時解除 placeMem 裡這些店的封鎖
   * （只清封鎖，不動 shown／done／愛店）。round 10 起 placeMem 分來源記
   * （R9-F7-leak）：清掉的是今日行程這邊的封鎖，核心班長 app 裡直接按
   * 「不要再來」的封鎖不動——分來源之前的舊紀錄沒有 daily 欄位，照舊版行為
   * 清掉共用欄位（見 placeMem.ts clearDislike 的過渡註解）。清完使用者要按
   * 「換這一站」或「重新產生」才會重找——這裡只清紀錄，不自動重搜。
   * placeMem 寫入失敗時不要先報成功（round 10，R9-clear-swallow）：失敗時本地
   * 清單不動、顯示寫入失敗，使用者可以再按一次；成功時才清清單、顯示確認。
   */
  const clearDisliked = () => {
    const ids = state.disliked ?? []
    const kinds = state.dislikedKinds ?? []
    if (!ids.length && !kinds.length) { setNotice('目前沒有「不喜歡」的紀錄。'); return }
    void (async () => {
      try {
        let sharedRemains = 0
        for (const id of ids) {
          // 舊紀錄移轉（round 11，R10-F2c）：分來源之前的舊紀錄先把共用封鎖轉成 daily
          // 欄位（MOVE／COPY 見 placeMem.ts migrateDailyDislike），再清 daily 側；沒移轉過的
          // 舊紀錄 clearDislike 不會動共用欄位（R10-F2a），所以不先移轉就等於清不掉。
          // 逐一 await：移轉失敗時停下來報錯，不讓後面的清除在沒移轉的狀態下跑。
          await migrateDailyDislike(id, Date.now())
          const r = await clearDislike(id)
          if (r?.sharedRemains) sharedRemains++
        }
        change((s) => ({ ...s, disliked: [], dislikedKinds: [] }))
        setNotice(`已清除 ${ids.length} 家「不喜歡」的店${kinds.length ? `與 ${kinds.length} 種「不要這類」` : ''}，可以重新搜尋。${sharedRemains ? `其中 ${sharedRemains} 家仍有其他封鎖紀錄，仍不會出現。` : ''}`)
      } catch {
        setNotice('清除失敗：無法寫入封鎖紀錄，「不喜歡」的店還在，請再試一次。')
      }
    })()
  }
  /** 底部選單（版面用，不進存檔）：目前開的是哪一項設定；null＝全收起。 */
  const [sheet,setSheet] = useState<SheetId | null>(null)
  const sheetPanel = useRef<HTMLDivElement>(null)
  /** 已安排的行程分兩步填（版面用）。名稱或地點還沒填時一律停在第一步。 */
  const [fixedStep,setFixedStep] = useState<1 | 2>(1)
  const fixedStepShown = fixedStep === 2 && fixedTitle.trim() && fixedPlace.trim() ? 2 : 1
  useEffect(() => {
    if (sheet === null) return
    // preventScroll：選單從畫面下方升起，升到一半就對焦會把整頁往下捲。
    sheetPanel.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])
  // 進畫面先回到最上面：首頁捲過的位置不帶進來，否則第一屏會切掉標題與膠囊。
  useEffect(() => { const el = document.scrollingElement; if (el) el.scrollTop = 0 }, [])
  /** 每顆膠囊上顯示的現值：只讀 state，不改任何東西。 */
  const chipValue: Record<SheetId, string> = {
    origin: state.useHere ? '📍 目前位置' : state.currentPlace.trim() || '澀谷站',
    time: state.startTime || '現在',
    dest: state.intent.destination.trim() || '不指定',
    acts: state.intent.activities.map(id => ACTIVITY_LABEL[id]).join('、') || '隨興',
    area: state.areaOnly !== false ? state.area : '不限區域',
    fixed: '＋ 加入',
    notes: state.notes.length ? `${state.notes.length} 則` : '＋ 加入',
  }
  const completed=state.tasks.filter(t=>t.done).length
  return <section className="screen dd" data-screen="daily-decision">
    <header className="dd-header">
      <button className="dd-back" onClick={onBack} aria-label="返回">← 返回</button>
      <span className="dd-brand">決斷連 · 行程口令</span>
    </header>
    <div className="dd-shell">
      <div className="dd-hero">
        <div className="dd-eyebrow">{state.day} · 今日任務</div>
        <div className="dd-hero-row"><h1>今日行程</h1><div className="dd-progress"><span>{completed} / {state.tasks.length} 已完成</span><div className="dd-meter"><i style={{width:state.tasks.length?completed/state.tasks.length*100+'%':'0%'}}/></div></div></div>
        <p>班長幫你挑真店、排步行路線。每一站都能直接導航。</p>
      </div>
      {/* 今日設定：一排摘要膠囊。點一顆只開那一項的底部選單，不再是一張直排長表單。 */}
      <div className="dd-chips" role="group" aria-label="今日設定">
        {SHEET_IDS.map(id=><button key={id} type="button" className="dd-chip" data-testid={'daily-chip-'+id} aria-haspopup="dialog" aria-expanded={sheet===id} onClick={()=>setSheet(id)}><span>{SHEET_TITLE[id]}</span><b>{chipValue[id]}</b></button>)}
      </div>
      <small className="dd-intent-summary" data-testid="daily-intent-summary">{intentSummaryText(state.intent)}</small>
      {conflicts.length>0&&<div className="dd-conflicts" role="alert">{conflicts.map((c,i)=><p key={i}>⚠ {c}</p>)}</div>}
      <div className="dd-itinerary">
          <div className="dd-section-title"><h2>今日路線</h2><span className="dd-count">{state.tasks.length} STOPS{routeKm!==null?" · "+routeKm+" KM":""}{travelMin!==null?" · 步行 "+travelMin+" MIN":""}</span></div>
          {state.tasks.length===0?<div className="dd-empty"><span>✳</span><h3>今天還沒有行程</h3><p>先點上面的「想去哪裡」「想做什麼」，選今天想做的事、想去的地方，留空就隨興探索；再點「搜尋店家並生成路線」，讓今天開始。</p></div>:<div className="dd-timeline" aria-label="今日任務">
            {state.tasks.map((t,i)=><article className={'dd-stop'+(t.done?' is-done':'')} key={t.id}>
              <div className="dd-marker"><span>{String(i+1).padStart(2,'0')}</span></div>
              <div className="dd-card">
                <div className="dd-card-top"><span className="dd-kind">{t.locked?'◆ 固定安排':t.kind==='gym'?'● FITNESS':t.kind==='meal'?'● FOOD':t.kind==='creative'?'● DISCOVER':t.kind==='shopping'?'● SHOPPING':'● RESET'}</span><span className="dd-duration">{t.start?t.start+' · ':''}{t.minutes} MIN</span></div>
                <h3>{t.candidate?.name || t.title}</h3>
                {t.candidate && <PlacePhoto placeId={t.candidate.id} placeName={t.candidate.name} mapUrl={t.candidate.mapUrl}/>}
                {t.candidate ? <div className="dd-place-meta">
                  <strong>⌖ {t.candidate.address}</strong>
                  <span>{typeof t.candidate.rating==='number'?'★ '+t.candidate.rating.toFixed(1)+' · ':''}{openStatusText(t)} · Google Places</span>
                  {t.preferHit&&<span data-testid="daily-prefer-reason">你常選這類，優先挑了這間</span>}
                  {t.eta&&(t.openAtEta==='closed'||t.openAtEta==='closing')&&<span className="dd-place-unresolved" role="status">⚠ {t.openAtEta==='closed'?'預計 '+t.eta+' 到店時，這間店沒有營業。請先確認營業時間。':'預計 '+t.eta+' 到店時，離打烊不到 10 分鐘。'}</span>}
                  <a className="dd-place-link" href={t.candidate.mapUrl} target="_blank" rel="noopener noreferrer">Google Maps 店家詳情 ↗</a>
                </div> : t.noCandidate ? <div className="dd-place-unresolved" role="status">⚠ {noCandidateText(t, state.area)}
                  {t.noCandidateReason === 'area' && <> <a className="dd-place-link" href="#daily-area" onClick={e=>{e.preventDefault();setSheet('area')}}>前往地區偏好設定</a></>}
                  {t.noCandidateReason === 'filtered' && <> <button className="dd-muted" disabled={busy !== null} onClick={clearDisliked}>清除「不喜歡」的紀錄</button></>}
                </div> : t.kind==='rest' ? <div className="dd-place-meta"><span>散步回家，不用找店家。</span></div> : <div className="dd-place-unresolved" role="status">⚠ 地點尚未確認。請搜尋行程後再導航。</div>}
                {t.eta&&<p className="dd-eta">{dayMark(t.etaDayOffset)}{t.eta} 抵達｜{dayMark(t.departureDayOffset)}{t.departure} 離開｜步行 {t.travelMin} 分鐘</p>}
                {t.conflict&&<p className="dd-stop-conflict" role="alert">⚠ {t.conflict}</p>}
                <p className="dd-description">{t.detail||'預計停留 '+t.minutes+' 分鐘；請出發前確認店家資訊。'}</p>
                <div className="dd-actions">
                  {t.candidate && <a className="dd-navigate" href={mapsNavigationUrl(t.candidate)} target="_blank" rel="noopener noreferrer" aria-label={'使用 Google Maps 導航至 '+t.candidate.name}>↗ Google Maps 導航</a>}
                  {!t.done&&!t.locked&&!t.specified&&t.kind!=='rest'&&<button disabled={busy!==null} onClick={()=>{void searchRoute(t.id)}}>{busy===t.id?'找替代地點中…':'↻ 換這一站'}</button>}
                  {t.candidate&&!t.done&&!t.locked&&<button className="dd-muted" disabled={busy!==null} title={kindOfCandidate(t.candidate)?undefined:'只排除這一間店（無法判斷種類）'} onClick={()=>{void dislikeStop(t)}}>不喜歡這間店</button>}
                  {t.candidate&&!t.done&&!t.locked&&kindOfCandidate(t.candidate)&&<button className="dd-muted" disabled={busy!==null} onClick={()=>dislikeKind(t)}>不要「{kindLabel(kindOfCandidate(t.candidate)!)}」這類</button>}
                </div>
                <div className="dd-actions dd-actions-secondary">
                  <label className="dd-done"><input type="checkbox" checked={t.done} onChange={e=>toggleDone(t,e.target.checked)}/><span>{t.done?'已完成':'標記完成'}</span></label>
                  {/* 「今天略過」同時移除該站的活動勾選、並在它是目的地站時把站清為 ''（目的地文字保留）。
                    經 normalizeIntent 重跑（設計 §1.4 單一寫入規則）：便利預設已不在 normalizeIntent 裡，
                    略過後剩單一活動也不會重新附著。 */}
                  {t.custom?<button onClick={()=>change(s=>({...s,tasks:s.tasks.filter(x=>x.id!==t.id)}))}>移除安排</button>:!t.done&&!t.locked?<button className="dd-muted" onClick={()=>change(s=>replanDaily({...s,avoid:[...new Set([...s.avoid,t.id])],intent:normalizeIntent({...s.intent,activities:s.intent.activities.filter(x=>x!==t.id),destinationStation:s.intent.destinationStation===t.id?'':s.intent.destinationStation})}))}>今天略過</button>:null}
                </div>
                {!t.done&&<details className="dd-change-place"><summary>⌖ 指定／修改這一站的地點</summary>
                  <label>輸入店家名稱或地址
                    <input aria-label={t.title+' 指定地點'} value={t.specified?t.place||'':''} placeholder="例如：Fuglen Tokyo" onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,place:e.target.value,specified:!!e.target.value.trim(),intentSpecified:e.target.value.trim()?false:undefined,candidate:undefined,eta:undefined,departure:undefined,travelMin:undefined,conflict:undefined,etaDayOffset:undefined,departureDayOffset:undefined}:x)}))} />
                  </label>
                  <button className="dd-secondary" disabled={busy!==null||!t.place?.trim()} onClick={()=>{void searchRoute(t.id)}}>確認這個地點並更新路線</button>
                </details>}
              </div>
            </article>)}
          </div>}
          <p className="dd-disclaimer">店家資料來源 Google Places；步行時間由 Google Routes 預估，固定行程衝突會標示；非即時交通保證。庫存與預約尚未驗證。</p>
      </div>
    </div>
    {/* 唯一的主按鍵固定在畫面底部；狀態列跟著它，按完不用捲回去看結果。 */}
    <div className="dd-dock">
      <p className="dd-live-status" role="status" aria-live="polite">{status}</p>
      {notice&&<p className="dd-live-status" role="status" aria-live="polite">{notice}</p>}
      <div className="dd-dock-row">
        <button className="dd-primary" data-testid="daily-generate" disabled={busy!==null} onClick={generate}>{busy?(busy==='all'?'搜尋中…':'正在換這一站…'):state.tasks.length?'↻ 搜尋店家並優化路線':'✦ 搜尋店家並生成路線'}</button>
        {seenCount > 0 && <button className="dd-secondary" data-testid="daily-clear-seen" disabled={busy!==null} onClick={clearSeenRecord}>清除今天換掉的店紀錄</button>}
      </div>
    </div>
    {/* 底部選單：各項設定一直掛在畫面上（只是收起來），值不會因為開關而重置。 */}
    <div className="sheet-wrap" data-testid="daily-sheet" hidden={sheet===null}>
      <div className="sheet-scrim" aria-hidden="true" onClick={()=>setSheet(null)} />
      <div className="sheet dd-sheet" role="dialog" aria-modal="true" aria-label={sheet?SHEET_TITLE[sheet]:'今日設定'} tabIndex={-1} ref={sheetPanel}>
        <div className="sheet-head"><b>{sheet?SHEET_TITLE[sheet]:'今日設定'}</b></div>
        <div className="dd-sheet-body" hidden={sheet!=='origin'}>
        <label htmlFor={state.useHere?undefined:'daily-location'}>出發地</label>
        {state.useHere
          ?<p className="dd-origin-here" data-testid="daily-origin">📍 目前位置</p>
          :<input id="daily-location" aria-label="出發地" value={state.currentPlace} onChange={e=>{change(s=>({...s,currentPlace:e.target.value.slice(0,80)}));clearRoute();setStatus('起點變更，請重新搜尋路線')}} placeholder="例如：宮下公園" />}
        {state.useHere
          ?<button className="dd-secondary" data-testid="daily-origin-typed" disabled={busy!==null} onClick={pickTyped}>改用輸入地點</button>
          :<button className="dd-secondary" data-testid="daily-origin-here" disabled={busy!==null} onClick={()=>{setSheet(null);pickHere()}}>📍 用目前位置</button>}
        <small>{state.useHere?'每次搜尋都重新定位；座標只送去查店、排路線，不存在手機。':'預設以澀谷站為出發點；可輸入確切地點，或按「用目前位置」。'}</small>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='time'}>
        <label htmlFor="daily-start-time">幾點開始</label>
        <input id="daily-start-time" data-testid="daily-start-time" aria-label="幾點開始" type="time" value={state.startTime ?? ''} disabled={busy!==null} onChange={e=>{change(s=>({...s,startTime:normalizeStartTime(e.target.value)}));clearRoute();setStatus('開始時間變更，請重新搜尋路線')}} />
        <small>留空＝現在就出發；填了就從那個時間開始排（比現在早的時間以現在為準）。時間以東京時間為準。</small>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='dest'}>
        <label htmlFor="daily-intent-destination">想去哪裡</label>
        <input id="daily-intent-destination" data-testid="daily-intent-destination" aria-label="想去哪裡" value={state.intent.destination} maxLength={120} placeholder="例如：一蘭、Fuglen Tokyo、下北澤（可留空）" onChange={e=>change(s=>replanDaily({...s,intent:applyConvenienceDefault(normalizeIntent({...s.intent,destination:e.target.value.slice(0,120)}))}))} />
        <label htmlFor="daily-intent-destination-station">目的地是哪一站</label>
        <div className="dd-area">
          <select id="daily-intent-destination-station" data-testid="daily-intent-destination-station" aria-label="目的地是哪一站" value={state.intent.destinationStation} onChange={e=>{ const v = e.target.value as IntentStationId | ''; return change(s=>replanDaily({...s, avoid: s.avoid.filter(x=>x!==v), intent:normalizeIntent({...s.intent,destinationStation:v})})) }}>
            {/* 站選單選站＝明確想要（RT4-F1，設計 §2.4）：該站從 avoid 移除，與 checkbox
              勾選解除 avoid（設計 §3.4）同一理據——新的明確表達勝過舊的「今天略過」。 */}
            <option value="">請選擇是哪一站…</option>
            {(['gym','meal','creative','coffee','shopping'] as const).map(id=><option key={id} value={id}>{DAILY_STATION_LABEL[id]}</option>)}
          </select>
        </div>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='acts'}>
        <div className="dd-intent-activities" role="group" aria-label="今天想做什麼">
          <span className="dd-area-only">想做什麼（可多選）</span>
          {(['gym','meal','creative','coffee','shopping'] as const).map(id=>(
            <label key={id} className="dd-area-only">
              <input type="checkbox" data-testid={`daily-intent-activity-${id}`} checked={state.intent.activities.includes(id)} onChange={e=>change(s=>{
                const activities = e.target.checked ? [...s.intent.activities, id] : s.intent.activities.filter(x=>x!==id)
                const avoid = e.target.checked ? s.avoid.filter(x=>x!==id) : s.avoid
                return replanDaily({...s,avoid,intent:applyConvenienceDefault(normalizeIntent({...s.intent,activities}))})
              })} />
              {ACTIVITY_LABEL[id]}
            </label>
          ))}
        </div>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='area'}>
        <label htmlFor="daily-area">地區偏好</label>
        <div className="dd-area">
          <select id="daily-area" aria-label="地區偏好" value={state.area} disabled={busy!==null} onChange={e=>{change(s=>({...s,area:e.target.value}));clearRoute();setStatus('地區變更，請重新搜尋路線')}}>
            {AREA_NAMES.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <label className="dd-area-only"><input type="checkbox" aria-label="只在這一帶找店" checked={state.areaOnly!==false} disabled={busy!==null} onChange={e=>{change(s=>({...s,areaOnly:e.target.checked}));clearRoute();setStatus('地區偏好變更，請重新搜尋路線')}}/><span>只在這一帶找店</span></label>
        </div>
        <small>{state.areaOnly!==false?`只找 ${state.area} 中心 1 公里內的店；指定／固定／已完成的地點不受影響。`:'不限區域；任何地區的店都可能出現。'}</small>
        </div>
        {/* 已安排的行程分兩步，每步兩個欄位：先填名稱與地點，再填時間與長度。 */}
        <div className="dd-sheet-body" hidden={sheet!=='fixed'||fixedStepShown!==1}>
          <div className="dd-form">
            <label>行程名稱<input aria-label="既有行程名稱" placeholder="例如：與朋友見面" value={fixedTitle} onChange={e=>setFixedTitle(e.target.value)}/></label>
            <label>地點<input aria-label="既有行程地點" placeholder="例如：吉祥寺" value={fixedPlace} onChange={e=>setFixedPlace(e.target.value)}/></label>
            <button className="dd-secondary" data-testid="daily-fixed-next" disabled={!fixedTitle.trim()||!fixedPlace.trim()} onClick={()=>setFixedStep(2)}>下一步：填時間</button>
          </div>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='fixed'||fixedStepShown!==2}>
          <div className="dd-form">
            <p className="dd-fixed-recap">{fixedTitle.trim()}｜{fixedPlace.trim()}</p>
            <div className="dd-form-row">
              <label>開始時間<input aria-label="開始時間" type="time" value={fixedTime} onChange={e=>setFixedTime(e.target.value)}/></label>
              <label>分鐘<input aria-label="行程長度分鐘" type="number" min="5" max="720" value={fixedMinutes} onChange={e=>setFixedMinutes(e.target.value)}/></label>
            </div>
            <button className="dd-secondary" disabled={!fixedTitle.trim()||!fixedPlace.trim()||Number(fixedMinutes)<5||Number(fixedMinutes)>720} onClick={()=>{change(s=>addFixedTask(s,fixedTitle,fixedPlace,fixedTime,Number(fixedMinutes)));setFixedTitle('');setFixedPlace('');setFixedStep(1);setSheet(null)}}>加入固定行程</button>
            <button className="dd-secondary" data-testid="daily-fixed-back" onClick={()=>setFixedStep(1)}>← 改名稱或地點</button>
          </div>
        </div>
        <div className="dd-sheet-body" hidden={sheet!=='notes'}>
        <div className="dd-form">
          <textarea aria-label="補充偏好" value={feedback} maxLength={160} rows={3} placeholder="例如：今天想吃拉麵（僅備註，不影響搜尋）" onChange={e=>setFeedback(e.target.value)}/>
          <button className="dd-secondary" onClick={addFeedback} disabled={!feedback.trim()}>儲存備註</button>
          <div className="dd-notes">{state.notes.map((n,i)=><p key={i}>· {n}</p>)}</div>
          <small>班長會記住你常選、常換掉的店家種類，下次挑店時參考；只存在這支手機。</small>
          <button className="dd-secondary" data-testid="daily-clear-affinity" disabled={busy!==null} onClick={clearAffinityRecord}>清除學到的偏好</button>
        </div>
        </div>
        <button type="button" className="sheet-cancel" data-testid="daily-sheet-close" onClick={()=>setSheet(null)}>完成</button>
      </div>
    </div>
  </section>
}
