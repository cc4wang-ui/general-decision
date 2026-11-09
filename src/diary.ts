// 新兵日記 — IndexedDB 讀寫、週統計（第 4、10 節）。
import { del, get, set } from 'idb-keyval'
import type { DiaryEntry, Level, ModuleId, PickMode, ReissueReason, WeeklyReport } from './types.ts'

const ENTRIES_KEY = 'decide.entries'
const WEEKLY_KEY = 'decide.weekly'

/** 冪等鍵（第 5 節）。 */
export const entryId = (ts: string, module: ModuleId) => `${ts}-${module}`

export async function allEntries(): Promise<DiaryEntry[]> {
  const list = (await get<DiaryEntry[]>(ENTRIES_KEY)) ?? []
  return [...list].sort((a, b) => b.ts.localeCompare(a.ts))
}

/**
 * 寫入一筆。同 id 視為同一道口令：整筆覆寫（第 10 節換口令——換成第二家後 big／placeId／outcome 都跟著換，
 * 不能留著上一家的 reason）。冪等：同 id 寫兩次只會有一筆。
 */
export async function putEntry(entry: DiaryEntry): Promise<DiaryEntry[]> {
  const list = (await get<DiaryEntry[]>(ENTRIES_KEY)) ?? []
  const i = list.findIndex((e) => e.id === entry.id)
  if (i >= 0) list[i] = entry
  else list.push(entry)
  await set(ENTRIES_KEY, list)
  return list
}

export async function clearDiary(): Promise<void> {
  await del(ENTRIES_KEY)
  await del(WEEKLY_KEY)
}

// ── 週界：以本地時間的週一 00:00 為一週開始 ─────────────────────────
// 本地時間 = 看的人所在時區（runtime 的本地時區）。週界、日標籤、時間標籤、
// 週報到期一律用本地 getter（getDay／getHours／setDate／setHours），不用台北時間
//（使用者決定 2026-11-09：日記顯示本地時間）。
export function weekStartOf(d: Date): string {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // 週一 = 0
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

export function entriesInWeek(entries: DiaryEntry[], weekStart: string): DiaryEntry[] {
  const start = new Date(weekStart).getTime()
  const end = start + 7 * 24 * 3600 * 1000
  return entries.filter((e) => {
    const t = new Date(e.ts).getTime()
    return t >= start && t < end
  })
}

/** 近 7 天，給 OrderRequest.recentOrders（讓班長講「這週第二次」）。 */
export function recentOrders(entries: DiaryEntry[], now: Date = new Date()) {
  const cutoff = now.getTime() - 7 * 24 * 3600 * 1000
  return entries
    .filter((e) => new Date(e.ts).getTime() >= cutoff)
    .map((e) => ({ module: e.module, big: e.big, at: e.ts }))
}

export interface DiaryStats {
  orders: number
  complianceRate: number // 0–100，四捨五入
  punishments: number
  weakestModule: ModuleId | null
}

/**
 * 第 10 節：服從率 =（done + reissued）÷ 全部。
 * Round 5：mismatch（派的不符合情境）不是使用者的錯，不算進分母、不算罰則；口令數仍照算。
 */
export function stats(entries: DiaryEntry[]): DiaryStats {
  const orders = entries.length
  const judged = entries.filter((e) => e.outcome !== 'mismatch').length
  if (orders === 0) return { orders: 0, complianceRate: 0, punishments: 0, weakestModule: null }

  const compliant = entries.filter((e) => e.outcome === 'done' || e.outcome === 'reissued').length
  const punishments = entries.filter((e) => e.outcome === 'punished').length

  // 最弱模組 = 罰則最多的那個；平手取口令數較多者，再平手取字母序，結果才穩定。
  const byModule = new Map<ModuleId, { bad: number; total: number }>()
  for (const e of entries) {
    const cur = byModule.get(e.module) ?? { bad: 0, total: 0 }
    cur.total++
    if (e.outcome === 'punished') cur.bad++
    byModule.set(e.module, cur)
  }
  let weakest: ModuleId | null = null
  let best = { bad: 0, total: 0 }
  for (const [m, v] of [...byModule].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (v.bad > best.bad || (v.bad === best.bad && v.bad > 0 && v.total > best.total)) {
      weakest = m
      best = v
    }
  }

  return {
    orders,
    complianceRate: judged ? Math.round((compliant / judged) * 100) : 100,
    punishments,
    weakestModule: weakest,
  }
}

// ── 按日分組（日記頁）───────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function dayLabel(ts: string): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `週${WEEKDAYS[d.getDay()]} ${mm}/${dd}`
}

export function timeLabel(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function groupByDay(entries: DiaryEntry[]): { label: string; entries: DiaryEntry[] }[] {
  const out: { label: string; entries: DiaryEntry[] }[] = []
  for (const e of entries) {
    const label = dayLabel(e.ts)
    const last = out.at(-1)
    if (last?.label === label) last.entries.push(e)
    else out.push({ label, entries: [e] })
  }
  return out
}

// ── 週報快取（同一週只算一次 API，第 10 節）─────────────────────────
export async function getWeekly(weekStart: string): Promise<WeeklyReport | undefined> {
  const all = (await get<Record<string, WeeklyReport>>(WEEKLY_KEY)) ?? {}
  return all[weekStart]
}

export async function saveWeekly(report: WeeklyReport): Promise<void> {
  const all = (await get<Record<string, WeeklyReport>>(WEEKLY_KEY)) ?? {}
  all[report.weekStart] = report
  await set(WEEKLY_KEY, all)
}

/** 第 10 節：now ≥ 本週日 20:00（本地時間）才自動產週報。 */
export function weeklyDue(now: Date = new Date()): boolean {
  return now.getDay() === 0 && now.getHours() >= 20
}

/**
 * 組一筆日記。Round 3 起**不再寫入店名**（Google 條款，R3§3.3）：big 是口令主字，
 * 之後要對回店靠 meta.placeId（PlaceMem 的鍵）。只放有值的鍵，免得 undefined 蓋掉東西。
 */
export function makeEntry(
  ts: string, module: ModuleId, level: Level, big: string,
  outcome: DiaryEntry['outcome'],
  meta?: { placeId?: string; reason?: ReissueReason; mode?: PickMode },
): DiaryEntry {
  const e: DiaryEntry = { id: entryId(ts, module), ts, module, level, big, outcome }
  if (meta?.placeId) e.placeId = meta.placeId
  if (meta?.reason) e.reason = meta.reason
  if (meta?.mode) e.mode = meta.mode
  return e
}

// branch-protection verification (step 4): intentional tsc failure, do not merge
const _protection_test: string = 123;
