import { useState } from 'react'
import './dailyDecision.css'
import { PlacePhoto } from './PlacePhoto.tsx'
import { getLocation, type GeoReason } from './api.ts'
import { blockedPlaceIds, clearDislike, markDailyDislike, migrateDailyDislike } from './placeMem.ts'
import { kindLabel, kindOfCandidate, normalizeKind } from './placeKind.ts'
import { isDeniedCandidate, isDeniedName, MIN_REVIEWS } from './venueCheck.ts'
import { AREA_NAMES, withinArea } from './areas.ts'

export type DailyTask = { id: string; title: string; minutes: number; kind: 'gym'|'meal'|'creative'|'shopping'|'rest'; done: boolean; place?: string; detail?: string; locked?: boolean; start?: string; custom?: boolean; specified?: boolean; variant?: number; candidate?: {id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean;types?:string[];primaryType?:string;userRatingCount?:number}; eta?:string;departure?:string;travelMin?:number;conflict?:string; noCandidate?: boolean; noCandidateReason?: 'area'|'filtered'|'empty'|'denied' }
export type DailyState = {
  day: string; area: string; currentPlace: string; mode: 'creative'|'practical'
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
  day: dayInTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', mode: 'creative',
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
  const cleared = { ...t, candidate: undefined, place: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined, title: catalogTitle(t.id) ?? t.title }
  const clearedKeepTitle = { ...t, candidate: undefined, place: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined }
  const clearedKeepPlace = { ...t, candidate: undefined, eta: undefined, departure: undefined, travelMin: undefined, conflict: undefined }
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
/** 無候選站的顯示文字：按原因給不同的下一步（area 時寫明地區偏好是原因）。 */
export function noCandidateText(t: DailyTask, area: string): string {
  if (t.noCandidateReason === 'area') return `這一站沒有符合條件的店家。地區偏好（${area}，1 公里內）可能擋住了附近的店：關掉「只在這一帶找店」或改選其他地區再試。`
  if (t.noCandidateReason === 'filtered') return '這一站沒有符合條件的店家：符合的店都被排除了（不喜歡／種類／評論數）。清除「不喜歡」的紀錄或放寬條件再試。'
  if (t.noCandidateReason === 'denied') return '這一站之前選的地點是車站或地標，不是可拜訪的店家。請按「換這一站」重新搜尋。'
  return '這一站找不到店家。換個出發地或條件再試。'
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
    return { ...fresh, ...raw, day: fresh.day,
      // 地區偏好移轉（F7）：舊資料的跨區自由文字偏好對應成 area='澀谷'＋areaOnly 開啟；
      // 舊資料沒有 areaOnly 欄位時預設開啟（當時沒有關掉的辦法，開啟才是忠實轉換）。
      area, areaOnly,
      // 無候選站也要留著（noCandidate 標記＋原因）：否則重開頁面後該站直接消失，
      // 使用者看不到「為什麼沒店」也沒法按「換這一站」重找。
      // rest 純文字站也要留著（round 8，live N3）：它沒有候選、沒有 noCandidate 標記，
      // 舊版過濾器只留 custom／locked／done／有候選／無候選的站，rest 每次重進頁面
      // 都被濾掉（第 7 輪的 mergeScheduled 只修了「重新生成當下」，沒修載入路徑）。
      tasks: raw.day === fresh.day ? raw.tasks.filter(t => typeof t.id === 'string' && (t.custom || t.locked || t.done || t.kind === 'rest' || !!t.candidate?.id || !!t.noCandidate)).map(t => clearStaleCandidate(t, ctx)) : [], notes: raw.notes.filter(n => n !== CROSS_AREA_NOTE).slice(0,20), avoid: Array.isArray(raw.avoid) ? raw.avoid.slice(0,20) : [], seen: raw.day === fresh.day ? sanitizeSeen(raw.seen) : {}, disliked, dislikedKinds }
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
export function buildDaily(s: DailyState): DailyTask[] {
  const previous = new Map(s.tasks.map(t=>[t.id,t]))
  const order = s.mode === 'creative' ? ['gym','meal','creative','coffee','shopping','rest'] : ['gym','meal','shopping','coffee','rest']
  return order.filter(id=>!s.avoid.includes(id)).map(id=>{
    const c = catalog.find(t=>t.id===id)!
    return { ...c, ...previous.get(id), done: previous.get(id)?.done ?? false }
  })
}
export function replanDaily(s: DailyState): DailyState {
  // Keep completed tasks and their state. Only uncompleted tasks are rebuilt.
  const done = s.tasks.filter(t=>t.done || t.locked || t.custom)
  const pending = buildDaily(s).filter(t=>!t.done && !done.some(d=>d.id===t.id))
  return { ...s, tasks: [...done,...pending] }
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
  return base.tasks.length ? replanDaily(base) : { ...base, tasks: buildDaily(base) }
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
  const clearRoute = () => {setRouteKm(null);setTravelMin(null);setConflicts([])}
  /** /api/daily-route 的回應形狀（前端只讀這些欄位；未知欄位不讀）。 */
  type DailyRouteResponse={message?:string;stops?:DailyTask[];routeVerified?:boolean;distanceKm?:number;travelMinutes?:number;conflicts?:string[]}
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
    const replacedId=shuffle?proposed.tasks.find(t=>t.id===shuffle)?.candidate?.id:undefined
    if(shuffle&&replacedId)proposed=withSeen(proposed,shuffle,replacedId)
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
      const response=await fetch('/api/daily-route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...(here?{origin:here}:{location:s.currentPlace}),area:s.area,areaOnly:s.areaOnly!==false,stops:proposed.tasks,shuffle,exclude:excludeInfo.list,excludeKinds:(proposed.dislikedKinds??[]).map(normalizeKind),...(shuffle?{others:othersFor(proposed,shuffle)}:{seen:seenFor(proposed)})})})
      const data=(await response.json()) as DailyRouteResponse
      if(!response.ok)throw new Error(data.message??'搜尋失敗')
      change(old=>({...old,tasks:data.stops??old.tasks,seen:{...(old.seen??{}),...(proposed.seen??{})},disliked:proposed.disliked??old.disliked,dislikedKinds:proposed.dislikedKinds??old.dislikedKinds,...(shuffle?{}:{routedFrom:originKey(s)})}))
      setRouteKm(data.routeVerified?data.distanceKm??null:null)
      setTravelMin(data.routeVerified?data.travelMinutes??null:null)
      setConflicts(data.conflicts??[])
      // 有站顯示「無候選」時狀態列要說清楚是哪一站——不要只說「店家已確認」。
      // 原因寫在每一站的卡片上（noCandidateText），狀態列只點名。
      const noCand=(data.stops??[]).filter((t: DailyTask)=>t.noCandidate)
      const noCandNote=noCand.length?`；${noCand.map((t: DailyTask)=>t.title||t.id).join('、')}沒有符合條件的店家`:''
      setStatus(data.routeVerified?'店家已確認 · 已更新 Google Routes 步行路線'+(data.conflicts?.length?'；請留意時間衝突':'')+noCandNote:'店家已確認，但步行路線目前無法驗證。請用 Google Maps 導航確認。'+noCandNote)
    }catch(e){setStatus('無法更新：'+(e instanceof Error?e.message:'未知錯誤')+'；原行程已保留')}
    finally{setBusy(null)}
  }
  const generate = () => {setNotice('');void searchRoute()}
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
  const completed=state.tasks.filter(t=>t.done).length
  return <section className="screen dd" data-screen="daily-decision">
    <header className="dd-header">
      <button className="dd-back" onClick={onBack} aria-label="返回">← 返回</button>
      <span className="dd-brand">決斷連 · 行程口令</span>
    </header>
    <div className="dd-shell">
      <div className="dd-hero">
        <div className="dd-eyebrow">{state.day} · 今日任務</div>
        <h1>今日行程</h1>
        <p>班長幫你挑真店、排步行路線。每一站都能直接導航。</p>
        <div className="dd-progress"><span>{completed} / {state.tasks.length} 已完成</span><div className="dd-meter"><i style={{width:state.tasks.length?completed/state.tasks.length*100+'%':'0%'}}/></div></div>
      </div>
      <div className="dd-columns">
        <aside className="dd-panel">
          <div className="dd-panel-title"><span>▸ 今日設定</span><span>MISSION SETTINGS</span></div>
          <label htmlFor={state.useHere?undefined:'daily-location'}>出發地</label>
          {state.useHere
            ?<p className="dd-origin-here" data-testid="daily-origin">📍 目前位置</p>
            :<input id="daily-location" aria-label="出發地" value={state.currentPlace} onChange={e=>{change(s=>({...s,currentPlace:e.target.value.slice(0,80)}));clearRoute();setStatus('起點變更，請重新搜尋路線')}} placeholder="例如：宮下公園" />}
          {state.useHere
            ?<button className="dd-secondary" data-testid="daily-origin-typed" disabled={busy!==null} onClick={pickTyped}>改用輸入地點</button>
            :<button className="dd-secondary" data-testid="daily-origin-here" disabled={busy!==null} onClick={pickHere}>📍 用目前位置</button>}
          <small>{state.useHere?'每次搜尋都重新定位；座標只送去查店、排路線，不存在手機。':'預設以澀谷站為出發點；可輸入確切地點，或按「用目前位置」。'}</small>
          <label>今天想怎麼過？</label>
          <div className="dd-mode" role="group" aria-label="今日模式">
            <button aria-pressed={state.mode==='creative'} onClick={()=>change(s=>replanDaily({...s,mode:'creative'}))}>偵察探索</button>
            <button aria-pressed={state.mode==='practical'} onClick={()=>change(s=>replanDaily({...s,mode:'practical'}))}>效率採買</button>
          </div>
          <label htmlFor="daily-area">地區偏好</label>
          <div className="dd-area">
            <select id="daily-area" aria-label="地區偏好" value={state.area} disabled={busy!==null} onChange={e=>{change(s=>({...s,area:e.target.value}));clearRoute();setStatus('地區變更，請重新搜尋路線')}}>
              {AREA_NAMES.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <label className="dd-area-only"><input type="checkbox" aria-label="只在這一帶找店" checked={state.areaOnly!==false} disabled={busy!==null} onChange={e=>{change(s=>({...s,areaOnly:e.target.checked}));clearRoute();setStatus('地區偏好變更，請重新搜尋路線')}}/><span>只在這一帶找店</span></label>
          </div>
          <small>{state.areaOnly!==false?`只找 ${state.area} 中心 1 公里內的店；指定／固定／已完成的地點不受影響。`:'不限區域；任何地區的店都可能出現。'}</small>
          <button className="dd-primary" data-testid="daily-generate" disabled={busy!==null} onClick={generate}>{busy?(busy==='all'?'搜尋中…':'正在換這一站…'):state.tasks.length?'↻ 搜尋店家並優化路線':'✦ 搜尋店家並生成路線'}</button>
          <p className="dd-live-status" role="status" aria-live="polite">{status||"搜尋將使用 Google Places 與 Google Routes"}</p>
          {notice&&<p className="dd-live-status" role="status" aria-live="polite">{notice}</p>}
          {conflicts.length>0&&<div className="dd-conflicts" role="alert">{conflicts.map((c,i)=><p key={i}>⚠ {c}</p>)}</div>}
          <details className="dd-details">
            <summary>＋ 加入已安排的行程</summary>
            <div className="dd-form">
              <label>行程名稱<input aria-label="既有行程名稱" placeholder="例如：與朋友見面" value={fixedTitle} onChange={e=>setFixedTitle(e.target.value)}/></label>
              <label>地點<input aria-label="既有行程地點" placeholder="例如：吉祥寺" value={fixedPlace} onChange={e=>setFixedPlace(e.target.value)}/></label>
              <div className="dd-form-row">
                <label>開始時間<input aria-label="開始時間" type="time" value={fixedTime} onChange={e=>setFixedTime(e.target.value)}/></label>
                <label>分鐘<input aria-label="行程長度分鐘" type="number" min="5" max="720" value={fixedMinutes} onChange={e=>setFixedMinutes(e.target.value)}/></label>
              </div>
              <button className="dd-secondary" disabled={!fixedTitle.trim()||!fixedPlace.trim()||Number(fixedMinutes)<5||Number(fixedMinutes)>720} onClick={()=>{change(s=>addFixedTask(s,fixedTitle,fixedPlace,fixedTime,Number(fixedMinutes)));setFixedTitle('');setFixedPlace('')}}>加入固定行程</button>
            </div>
          </details>
          <details className="dd-details">
            <summary>＋ 備註</summary>
            <div className="dd-form">
              <textarea aria-label="補充偏好" value={feedback} maxLength={160} rows={3} placeholder="例如：今天想吃拉麵（僅備註，不影響搜尋）" onChange={e=>setFeedback(e.target.value)}/>
              <button className="dd-secondary" onClick={addFeedback} disabled={!feedback.trim()}>儲存備註</button>
              <div className="dd-notes">{state.notes.map((n,i)=><p key={i}>· {n}</p>)}</div>
            </div>
          </details>
        </aside>
        <div className="dd-itinerary">
          <div className="dd-section-title"><div><span>▸ 任務路線</span><h2>今日路線</h2></div><span className="dd-count">{state.tasks.length} STOPS{routeKm!==null?" · "+routeKm+" KM":""}{travelMin!==null?" · 步行 "+travelMin+" MIN":""}</span></div>
          {state.tasks.length===0?<div className="dd-empty"><span>✳</span><h3>今天還沒有行程</h3><p>選擇模式後點「生成今日行程」，讓今天開始。</p></div>:<div className="dd-timeline" aria-label="今日任務">
            {state.tasks.map((t,i)=><article className={'dd-stop'+(t.done?' is-done':'')} key={t.id}>
              <div className="dd-marker"><span>{String(i+1).padStart(2,'0')}</span></div>
              <div className="dd-card">
                <div className="dd-card-top"><span className="dd-kind">{t.locked?'◆ 固定安排':t.kind==='gym'?'● FITNESS':t.kind==='meal'?'● FOOD':t.kind==='creative'?'● DISCOVER':t.kind==='shopping'?'● SHOPPING':'● RESET'}</span><span className="dd-duration">{t.start?t.start+' · ':''}{t.minutes} MIN</span></div>
                <h3>{t.candidate?.name || t.title}</h3>
                {t.candidate && <PlacePhoto placeId={t.candidate.id} placeName={t.candidate.name} mapUrl={t.candidate.mapUrl}/>}
                {t.candidate ? <div className="dd-place-meta">
                  <strong>⌖ {t.candidate.address}</strong>
                  <span>{typeof t.candidate.rating==='number'?'★ '+t.candidate.rating.toFixed(1)+' · ':''}{t.candidate.openNow===true?'Google 顯示目前營業中':t.candidate.openNow===false?'Google 顯示目前未營業':'營業狀態未確認'} · Google Places</span>
                  <a className="dd-place-link" href={t.candidate.mapUrl} target="_blank" rel="noopener noreferrer">Google Maps 店家詳情 ↗</a>
                </div> : t.noCandidate ? <div className="dd-place-unresolved" role="status">⚠ {noCandidateText(t, state.area)}
                  {t.noCandidateReason === 'area' && <> <a className="dd-place-link" href="#daily-area">前往地區偏好設定</a></>}
                  {t.noCandidateReason === 'filtered' && <> <button className="dd-muted" disabled={busy !== null} onClick={clearDisliked}>清除「不喜歡」的紀錄</button></>}
                </div> : t.kind==='rest' ? <div className="dd-place-meta"><span>散步回家，不用找店家。</span></div> : <div className="dd-place-unresolved" role="status">⚠ 地點尚未確認。請搜尋行程後再導航。</div>}
                {t.eta&&<p className="dd-eta">{t.eta} 抵達｜{t.departure} 離開｜步行 {t.travelMin} 分鐘</p>}
                {t.conflict&&<p className="dd-stop-conflict" role="alert">⚠ {t.conflict}</p>}
                <p className="dd-description">{t.detail||'預計停留 '+t.minutes+' 分鐘；請出發前確認店家資訊。'}</p>
                <div className="dd-actions">
                  {t.candidate && <a className="dd-navigate" href={mapsNavigationUrl(t.candidate)} target="_blank" rel="noopener noreferrer" aria-label={'使用 Google Maps 導航至 '+t.candidate.name}>↗ Google Maps 導航</a>}
                  {!t.done&&!t.locked&&!t.specified&&t.kind!=='rest'&&<button disabled={busy!==null} onClick={()=>{void searchRoute(t.id)}}>{busy===t.id?'找替代地點中…':'↻ 換這一站'}</button>}
                  {t.candidate&&!t.done&&!t.locked&&<button className="dd-muted" disabled={busy!==null} title={kindOfCandidate(t.candidate)?undefined:'只排除這一間店（無法判斷種類）'} onClick={()=>{void dislikeStop(t)}}>不喜歡這間店</button>}
                  {t.candidate&&!t.done&&!t.locked&&kindOfCandidate(t.candidate)&&<button className="dd-muted" disabled={busy!==null} onClick={()=>dislikeKind(t)}>不要「{kindLabel(kindOfCandidate(t.candidate)!)}」這類</button>}
                </div>
                <div className="dd-actions dd-actions-secondary">
                  <label className="dd-done"><input type="checkbox" checked={t.done} onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,done:e.target.checked}:x)}))}/><span>{t.done?'已完成':'標記完成'}</span></label>
                  {t.custom?<button onClick={()=>change(s=>({...s,tasks:s.tasks.filter(x=>x.id!==t.id)}))}>移除安排</button>:!t.done&&!t.locked?<button className="dd-muted" onClick={()=>change(s=>replanDaily({...s,avoid:[...new Set([...s.avoid,t.id])]}))}>今天略過</button>:null}
                </div>
                {!t.done&&<details className="dd-change-place"><summary>⌖ 指定／修改這一站的地點</summary>
                  <label>輸入店家名稱或地址
                    <input aria-label={t.title+' 指定地點'} value={t.specified?t.place||'':''} placeholder="例如：Fuglen Tokyo" onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,place:e.target.value,specified:!!e.target.value.trim(),candidate:undefined,eta:undefined,departure:undefined,travelMin:undefined,conflict:undefined}:x)}))} />
                  </label>
                  <button className="dd-secondary" disabled={busy!==null||!t.place?.trim()} onClick={()=>{void searchRoute(t.id)}}>確認這個地點並更新路線</button>
                </details>}
              </div>
            </article>)}
          </div>}
          <p className="dd-disclaimer">店家資料來源 Google Places；步行時間由 Google Routes 預估，固定行程衝突會標示；非即時交通保證。庫存與預約尚未驗證。</p>
        </div>
      </div>
    </div>
  </section>
}
