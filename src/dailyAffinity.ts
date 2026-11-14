// 2.4 行為回饋迴圈（最簡版）：今日行程從使用者行為學「種類偏好」。
// 只存本機 localStorage（獨立 key，不上伺服器、不寫核心班長 app 的記憶）。
// 種類一律由呼叫端用 placeKind.ts 的 kindOfCandidate 判定；判不出（undefined）就不記。
// 分數＝事件權重 × 0.5^(經過天數／30)，讀取時才算；存的是原始事件。

export const AFFINITY_KEY = 'decide.daily.affinity.v1'
/** 權重（decisions.md Q1）：手動指定且解析到真店 +3；標記完成 +2；換掉自動挑的店 −1。 */
export const AFFINITY_WEIGHT = { specified: 3, done: 2, swapped: -1 } as const
export const AFFINITY_HALF_LIFE_DAYS = 30
/** 分數 ≥ 2 才算偏好、≤ −2 才算降權；各最多送 20 個種類（Q8）。 */
export const AFFINITY_THRESHOLD = 2
export const AFFINITY_MAX_KINDS = 20
const MAX_EVENTS = 200
const DAY_MS = 86_400_000

/** k＝種類鍵；w＝權重；t＝發生時間（ms）；src＝同一來源只留一筆（例如同一站同一間店的「標記完成」）。 */
export type AffinityEvent = { k: string; w: number; t: number; src?: string }

const isEvent = (x: unknown): x is AffinityEvent => {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.k === 'string' && e.k.length > 0 && e.k.length <= 40
    && typeof e.w === 'number' && Number.isFinite(e.w) && Math.abs(e.w) <= 3
    && typeof e.t === 'number' && Number.isFinite(e.t)
    && (e.src === undefined || (typeof e.src === 'string' && e.src.length <= 200))
}

/** 讀不到、不是陣列、元素形狀不對：一律當成沒有紀錄，不讓頁面壞掉。 */
export function loadAffinity(): AffinityEvent[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(AFFINITY_KEY) || 'null')
    return Array.isArray(raw) ? raw.filter(isEvent).slice(-MAX_EVENTS) : []
  } catch { return [] }
}
const save = (events: AffinityEvent[]): void => {
  try { localStorage.setItem(AFFINITY_KEY, JSON.stringify(events.slice(-MAX_EVENTS))) } catch { /* private mode */ }
}

/** 記一筆行為。kind 判不出就不記。帶 src 時同一來源只留最新一筆（重複勾選不重複加分）。 */
export function recordAffinity(kind: string | undefined, weight: number, now: number, src?: string): void {
  if (!kind) return
  const kept = src ? loadAffinity().filter(e => e.src !== src) : loadAffinity()
  save([...kept, { k: kind, w: weight, t: now, ...(src ? { src } : {}) }])
}
/** 撤回某個來源的紀錄（取消「標記完成」）。 */
export function dropAffinity(src: string): void {
  const events = loadAffinity()
  const kept = events.filter(e => e.src !== src)
  if (kept.length !== events.length) save(kept)
}
/** 一次清掉全部偏好紀錄（Q4）。只動這一個 key。 */
export function clearAffinity(): void {
  try { localStorage.removeItem(AFFINITY_KEY) } catch { /* private mode */ }
}

/** 各種類目前的分數（半衰期 30 天）。未來時間戳（時鐘被調過）當成剛發生，不放大。 */
export function affinityScores(events: AffinityEvent[], now: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of events) {
    const days = Math.max(0, now - e.t) / DAY_MS
    out[e.k] = (out[e.k] ?? 0) + e.w * Math.pow(0.5, days / AFFINITY_HALF_LIFE_DAYS)
  }
  return out
}
/** 送給伺服器的種類清單：只送過閾值的，依強度排序，各最多 20 個。 */
export function affinityHints(events: AffinityEvent[], now: number): { prefer: string[]; demote: string[] } {
  const scored = Object.entries(affinityScores(events, now))
  return {
    prefer: scored.filter(([, v]) => v >= AFFINITY_THRESHOLD).sort((a, b) => b[1] - a[1]).slice(0, AFFINITY_MAX_KINDS).map(([k]) => k),
    demote: scored.filter(([, v]) => v <= -AFFINITY_THRESHOLD).sort((a, b) => a[1] - b[1]).slice(0, AFFINITY_MAX_KINDS).map(([k]) => k),
  }
}

// ── 伺服器端（api/daily-route.ts）共用：輸入驗證與軟排序權重 ──

/** 請求裡的種類清單驗證：非陣列＝空；非字串、空字串、過長的元素丟掉；去重；最多 20 個。 */
export function sanitizeKindList(v: unknown, normalize: (k: string) => string = k => k): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40).map(normalize))].slice(0, AFFINITY_MAX_KINDS)
}
/** 軟排序權重：偏好種類 6、一般 2、降權種類 1。全部 ≥ 1——任何候選都還是抽得到，只改機率。 */
export const SOFT_WEIGHT = { prefer: 6, neutral: 2, demote: 1 } as const
/**
 * 「前 N 名隨機挑」的逐候選權重。回 null＝偏好對這一組沒有影響（沒帶偏好、或這一組
 * 候選權重全部相同），呼叫端照原本的均勻隨機挑。同時出現在 prefer 與 demote 的種類當一般。
 */
export function softWeights(kinds: (string | undefined)[], prefer: string[], demote: string[]): number[] | null {
  if (!prefer.length && !demote.length) return null
  const weights = kinds.map(k => {
    const p = !!k && prefer.includes(k), d = !!k && demote.includes(k)
    return p === d ? SOFT_WEIGHT.neutral : p ? SOFT_WEIGHT.prefer : SOFT_WEIGHT.demote
  })
  return weights.every(w => w === weights[0]) ? null : weights
}
/** 依權重把 0 ≤ r < 總權重 的整數換成索引。 */
export function weightedIndex(weights: number[], r: number): number {
  let acc = 0
  for (let i = 0; i < weights.length; i++) { acc += weights[i]!; if (r < acc) return i }
  return weights.length - 1
}
