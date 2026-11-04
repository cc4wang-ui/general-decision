/**
 * 60 天試用紀錄（Round 4）——Cross 2026-10-30 決定自己連續試用 60 天，每一道口令（成功、失敗）都記一筆在手機，
 * 除錯畫面一鍵匯出成一個 JSON 檔，交給 Claude 分析下一輪要修什麼。
 *
 * 跟除錯紀錄（src/debug.ts：最近 10 筆、含候選店名）分開：這份要留 60 天，所以只存 place_id 與我方算出來的數字，
 * **不存**店名、評分、價位字串、座標（Google 條款只准無限期保存 place_id，STRATEGY C1）。
 *
 * 純函式 + localStorage，不依賴 React，可單獨測。localStorage 在無痕模式會丟例外，全部包 try。
 */
import type { GeoDoubt, GeoResult } from './api.ts'
import type { MemFile } from './placeMem.ts'
import type { Band, DiaryEntry, Level, ModuleId, OrderDebug, PickMode, ReissueReason } from './types.ts'

/** N6（Round 10）：問了「你在車上？」之後選什麼——就用目前位置／報下車的站／關掉沒選。 */
export type GeoPick = 'current' | 'station' | 'cancel'

/**
 * N6（Round 10）：這道口令用了 GPS 時，定位有多舊、多粗，以及有沒有問「你在車上？」。
 * 用來校正 60 秒／300 公尺兩個門檻（src/api.ts geoDoubt）。只有真的拿 GPS 座標去派的那幾道才有；
 * 手動報站、不需要定位的卡、Round 10 以前的舊紀錄都沒有這欄。
 */
export interface TrialGeo {
  /** 有沒有問：太舊 stale／太粗 coarse；沒問是 null。 */
  ask: GeoDoubt | null
  /** 問了之後選什麼；沒問就沒有。 */
  pick?: GeoPick
  /** 定位誤差（公尺）；瀏覽器沒給就沒有。 */
  acc?: number
  /** 送出時這個定位已經多舊（秒）；瀏覽器沒給就沒有。 */
  age?: number
}

export interface TrialEntry {
  at: string // ISO
  module: ModuleId
  level: Level
  choices?: Record<string, string | number>
  budget?: Band[]
  ok: boolean
  /** 失敗時的錯誤種類（no_places、no_location、upstream…）。 */
  error?: string
  placeId?: string
  mode?: PickMode
  band?: number | null
  priceEst?: boolean
  lane?: string
  pool?: number
  kept?: number
  relaxed?: string[]
  /** 這次打了幾次 Places（x-places-calls）。 */
  calls?: number
  rescue?: boolean
  fallback?: boolean
  ms?: number
  /** 使用者之後的回報（日記同一個 outcome）。 */
  outcome?: DiaryEntry['outcome']
  reason?: ReissueReason
  /** N6（Round 10）：定位品質與「你在車上？」。 */
  geo?: TrialGeo
}

const KEY = 'decide.trial.v1'
export const TRIAL_DAYS = 60
/** 60 天 × 一天 25 道也放得下；超過就砍最舊的。 */
export const TRIAL_MAX = 1500
const DAY = 86_400_000

/** 最新的在前。讀不到或壞掉一律當空陣列。 */
export function readTrial(): TrialEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v.filter((e) => e && typeof e.at === 'string' && typeof e.module === 'string') as TrialEntry[]) : []
  } catch { return [] }
}

function write(list: TrialEntry[], now: number): void {
  const cutoff = now - TRIAL_DAYS * DAY
  const kept = list.filter((e) => Date.parse(e.at) >= cutoff).slice(0, TRIAL_MAX)
  try { localStorage.setItem(KEY, JSON.stringify(kept)) } catch { /* 無痕模式或空間滿了：試用紀錄不是主線功能，靜靜放棄 */ }
}

/** 記一筆（超過 60 天的、超過上限的自動清掉）。 */
export function recordTrial(entry: Omit<TrialEntry, 'at'> & { at?: string }, now = Date.now()): void {
  write([{ ...entry, at: entry.at ?? new Date(now).toISOString() } as TrialEntry, ...readTrial()], now)
}

/** 從伺服器回的 debug 抽出要留的數字（不含店名）。 */
export function fromDebug(d: OrderDebug | undefined): Partial<TrialEntry> {
  if (!d) return {}
  const out: Partial<TrialEntry> = {}
  if (d.pick) { out.lane = d.pick.lane; out.pool = d.pick.pool; out.kept = d.pick.afterFilter; if (d.pick.relaxed.length) out.relaxed = d.pick.relaxed }
  if (d.rescue) out.rescue = true
  if (d.fallback) out.fallback = true
  if (d.ms) out.ms = d.ms.total
  return out
}

/** 從定位結果記下誤差與新舊（四捨五入到公尺、秒），加上這次有沒有問。 */
export function trialGeo(g: Pick<GeoResult, 'accuracy' | 'fixAt'>, ask: GeoDoubt | null, now = Date.now()): TrialGeo {
  const out: TrialGeo = { ask }
  if (g.accuracy !== undefined && Number.isFinite(g.accuracy)) out.acc = Math.round(g.accuracy)
  if (g.fixAt !== undefined && Number.isFinite(g.fixAt)) out.age = Math.max(0, Math.round((now - g.fixAt) / 1000))
  return out
}

/** 使用者回報（完成／換一家＋原因／沒做）→ 標在同模組最近一筆還沒標的成功紀錄上。 */
export function tagTrial(module: ModuleId, outcome: DiaryEntry['outcome'], reason?: ReissueReason, now = Date.now()): void {
  const list = readTrial()
  const i = list.findIndex((e) => e.module === module && e.ok && !e.outcome)
  if (i < 0) return
  list[i] = { ...list[i]!, outcome, ...(reason ? { reason } : {}) }
  write(list, now)
}

export function clearTrial(): void {
  try { localStorage.removeItem(KEY) } catch { /* 忽略 */ }
}

export interface TrialSummary {
  days: number
  orders: number
  ok: number
  /** 失敗種類 → 次數。 */
  errors: Record<string, number>
  rescue: number
  fallback: number
  /** 吃／歇：這一道的店在前 7 天內派過的比例。 */
  repeat7d: number | null
  distinctPlaces: number
  /** 有選預算的吃：派到的店價位對得上的比例（推估也算）；分母不含價位未知。 */
  budgetHit: number | null
  budgetUnknown: number
  priceEstShare: number | null
  reasons: Record<string, number>
  /** Round 5：沒做、因為派的不符合情境的次數。 */
  mismatch: number
  /** Round 5：依情境分（吃／歇的 choices.scene；「其他」不分使用者打的字）。 */
  byScene: Record<string, { orders: number; done: number; reissued: number; punished: number; mismatch: number }>
  /** N6（Round 10）：用 GPS 的道數、問「你在車上？」幾次（依原因）、問了之後選什麼。舊紀錄沒有 geo，不算。 */
  geo: { fixes: number; asked: number; stale: number; coarse: number; picks: Partial<Record<GeoPick, number>> }
}

/** 匯出時附的摘要：一眼看出「空手」「重複」「價位」三件事這段期間怎麼樣。 */
export function summarize(entries: TrialEntry[]): TrialSummary {
  const asc = [...entries].sort((a, b) => a.at.localeCompare(b.at))
  const errors: Record<string, number> = {}
  const reasons: Record<string, number> = {}
  const byScene: TrialSummary['byScene'] = {}
  const geo: TrialSummary['geo'] = { fixes: 0, asked: 0, stale: 0, coarse: 0, picks: {} }
  for (const e of asc) {
    if (e.geo && typeof e.geo === 'object') {
      const { ask, pick } = e.geo
      geo.fixes++
      if (ask === 'stale' || ask === 'coarse') { geo.asked++; geo[ask]++ }
      if (pick === 'current' || pick === 'station' || pick === 'cancel') geo.picks[pick] = (geo.picks[pick] ?? 0) + 1
    }
    if (!e.ok) errors[e.error ?? 'unknown'] = (errors[e.error ?? 'unknown'] ?? 0) + 1
    if (e.reason) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1
    const sc = e.choices?.scene
    if (typeof sc === 'string' && sc) {
      const b = (byScene[`${e.module}:${sc}`] ??= { orders: 0, done: 0, reissued: 0, punished: 0, mismatch: 0 })
      b.orders++
      if (e.outcome) b[e.outcome]++
    }
  }
  const placed = asc.filter((e) => e.ok && e.placeId)
  let rep = 0
  for (let i = 0; i < placed.length; i++) {
    const t = Date.parse(placed[i]!.at)
    if (placed.slice(0, i).some((p) => p.placeId === placed[i]!.placeId && t - Date.parse(p.at) <= 7 * DAY)) rep++
  }
  const budgeted = placed.filter((e) => e.module === 'eat' && e.budget?.length)
  const known = budgeted.filter((e) => e.band !== null && e.band !== undefined)
  const hit = known.filter((e) => e.budget!.includes(Math.round(e.band!) as Band)).length
  const first = asc[0] ? Date.parse(asc[0].at) : 0
  const last = asc.at(-1) ? Date.parse(asc.at(-1)!.at) : 0
  return {
    days: asc.length ? Math.max(1, Math.ceil((last - first) / DAY)) : 0,
    orders: asc.length,
    ok: asc.filter((e) => e.ok).length,
    errors,
    rescue: asc.filter((e) => e.rescue).length,
    fallback: asc.filter((e) => e.fallback).length,
    repeat7d: placed.length ? +(rep / placed.length).toFixed(3) : null,
    distinctPlaces: new Set(placed.map((e) => e.placeId)).size,
    budgetHit: known.length ? +(hit / known.length).toFixed(3) : null,
    budgetUnknown: budgeted.length - known.length,
    priceEstShare: placed.length ? +(placed.filter((e) => e.priceEst).length / placed.length).toFixed(3) : null,
    reasons,
    mismatch: asc.filter((e) => e.outcome === 'mismatch').length,
    byScene,
    geo,
  }
}

/** 試用紀錄匯出檔版本。1 = Round 4（沒有這欄）；2 = Round 10（紀錄多 geo、檔案可附記憶）。 */
export const TRIAL_FILE_VERSION = 2

/**
 * 匯出檔內容：摘要＋全部紀錄（新到舊）。
 * N4（Round 10）：一鍵匯出時把店家記憶（src/placeMem.ts exportMem）放進 memory，Cross 一次交出全部資料；
 * 這個檔也可以直接拿去「匯入記憶」。
 */
export function exportTrial(entries: TrialEntry[] = readTrial(), now = Date.now(), memory?: MemFile): string {
  return JSON.stringify({
    app: 'decide', kind: 'trial-log', version: TRIAL_FILE_VERSION, exportedAt: new Date(now).toISOString(),
    summary: summarize(entries), entries, ...(memory ? { memory } : {}),
  }, null, 1)
}
