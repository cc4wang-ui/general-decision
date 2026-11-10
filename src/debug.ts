/**
 * 除錯紀錄環狀緩衝 — 最近 10 次 /api/order 的真實經過，存在手機本機。
 *
 * 為什麼需要：Vercel 免費方案的 runtime log 保存期很短（實測 24 小時內只剩個位數筆，
 * 而且只留最近兩次部署的），所以「按了之後隔一段時間才回報」就查不到原因了。
 * 這份存在使用者手機上，長按班長名牌就看得到，可以直接截圖。
 *
 * 純函式 + localStorage，不依賴 React，可單獨測。localStorage 在無痕模式會丟例外，全部包 try。
 */
import type { OrderDebug } from './types.ts'

export interface DebugEntry extends OrderDebug {
  at: string // ISO
}

const KEY = 'decide.debug'
export const DEBUG_MAX = 10

/** 最新的在前。讀不到或壞掉一律當空陣列，不讓除錯畫面自己爆掉。 */
export function readDebug(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((e: unknown): e is DebugEntry => !!e && typeof e === 'object' && 'at' in e && typeof e.at === 'string') : []
  } catch { return [] }
}

/** 記一筆，超過 DEBUG_MAX 就砍掉最舊的。 */
export function recordDebug(entry: Omit<DebugEntry, 'at'> & { at?: string }): void {
  try {
    const next = [{ ...entry, at: entry.at ?? new Date().toISOString() }, ...readDebug()].slice(0, DEBUG_MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* 無痕模式或空間滿了，除錯紀錄不是主線功能，靜靜放棄 */ }
}

export function clearDebug(): void {
  try { localStorage.removeItem(KEY) } catch { /* 忽略 */ }
}

const hhmmss = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('zh-TW', { hour12: false })
}

/** 一家候選店的一行字：名字 評分(則數) 步行 營業。 */
export function formatCandidate(c: NonNullable<OrderDebug['places']>['candidates'][number]): string {
  const bits = [c.name]
  bits.push(c.rating ? `${c.rating}★(${c.count ?? 0})` : '無評分')
  if (c.walkMin) bits.push(`走${c.walkMin}分`)
  if (c.opensAt) bits.push(`${c.opensAt}開`)
  else if (c.openUntil) bits.push(`到${c.openUntil}`)
  return bits.join(' ')
}

/** Round 3：發掘引擎的決定過程（不含 place_id）。除錯畫面與「複製」共用。 */
export function formatPick(p: NonNullable<OrderDebug['pick']>): string {
  const relaxed = p.relaxed.length ? ` 放寬=${p.relaxed.join('+')}` : ''
  return `mode=${p.mode} lane=${p.lane} 池=${p.pool} 過濾後=${p.afterFilter}${relaxed}${p.exhausted ? ' 已全數占領' : ''}`
}

/** Round 3：候選中有價位資料的比例（R3§4.3 第一週遙測）。 */
export function formatPrice(p: NonNullable<OrderDebug['price']>): string {
  return `${p.country} 有價位 ${p.known}/${p.total}`
}

/** 全部轉成純文字，給「複製」用；貼進對話就等於把 log 帶出來。 */
export function formatDebug(entries: DebugEntry[]): string {
  if (!entries.length) return '（沒有紀錄）'
  return entries.map((e) => {
    const lines = [`${hhmmss(e.at)} ${e.module} lv${e.level}${e.error ? ` 失敗:${e.error}` : ''}`]
    if (e.ms) lines.push(`  時間 places=${e.ms.places}ms claude=${e.ms.claude}ms total=${e.ms.total}ms${e.model ? ` ${e.model}` : ''}${e.outTokens ? ` out=${e.outTokens}` : ''}`)
    if (e.places) {
      lines.push(`  查法 ${e.places.how}`)
      for (const t of e.places.tries) lines.push(`  查詢 r=${t.r} ${t.raw < 0 ? '失敗' : `raw=${t.raw} 留=${t.kept}`}`)
      for (const c of e.places.candidates) lines.push(`  候選 ${formatCandidate(c)}`)
    }
    if (e.pick) lines.push(`  選店 ${formatPick(e.pick)}`)
    if (e.price) lines.push(`  價位 ${formatPrice(e.price)}`)
    if (e.retry) lines.push(`  重打 ${e.retry === 'nonanswer' ? '模型推掉不答' : '模型沒挑真店'}`)
    if (e.forced) lines.push(`  強制指定 ${e.forced}`)
    if (e.picked) lines.push(`  挑中 ${e.picked}`)
    return lines.join('\n')
  }).join('\n\n')
}
