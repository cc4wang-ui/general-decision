// Order JSON 解析 — 第 11 節：4 層解析；第 5 節 Order 形狀驗證。
import type { Order, WeeklyReport } from './types.ts'

/** JSON.parse 回 any；先收進 unknown，形狀由 isOrder／欄位檢查驗證。 */
const parseJson = (text: string): unknown => JSON.parse(text) as unknown

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

/** 第 11 節：直接 parse → 去 fence → regex 取 {…} → 失敗視同 5xx。 */
export function parseOrder(raw: string): Order {
  const attempts: (() => unknown)[] = [
    // 1. 直接 parse
    () => parseJson(raw),
    // 2. 去掉 ```json fence
    () => parseJson(stripFence(raw)),
    // 3. regex 取第一個完整 {…}
    () => parseJson(firstObject(raw)),
  ]
  for (const attempt of attempts) {
    try {
      const value = dropBadPlace(attempt())
      if (isOrder(value)) return normalize(value)
    } catch { /* 換下一層 */ }
  }
  // 4. 失敗
  throw new ParseError('Claude 回傳無法解析為 Order JSON')
}

function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  return m ? m[1]!.trim() : s.trim()
}

function firstObject(s: string): string {
  const start = s.indexOf('{')
  if (start < 0) throw new ParseError('找不到 {')
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  throw new ParseError('{ 沒有收尾')
}

/**
 * R3 修正 S-10：place 是伺服器決定的（withPlace 會整個覆寫或刪掉），模型寫的 place 只是參考。
 * 模型回 place:null 或形狀不對（不是物件、沒有 name 字串）→ 刪掉 place 再驗其餘欄位，不整份判非法。
 * prompt 不再送 place.id（S-9），模型只寫 name、id 缺或不是字串 → id 補空字串（只拿 name 對 pick，見 matchPlace）。
 */
function dropBadPlace(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !('place' in v)) return v
  const o = v as Record<string, unknown>
  const p = o.place as Record<string, unknown> | null
  const shaped = typeof p === 'object' && p !== null && !Array.isArray(p) && typeof p.name === 'string'
  if (shaped) return typeof p.id === 'string' ? v : { ...o, place: { ...p, id: '' } }
  const { place: _bad, ...rest } = o
  void _bad
  return rest
}

function isOrder(v: unknown): v is Order {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o.verdict !== 'do' && o.verdict !== 'stop') return false
  const meme = o.meme as Record<string, unknown> | undefined
  if (!meme || typeof meme.top !== 'string' || typeof meme.big !== 'string' || typeof meme.bot !== 'string') return false
  if (!Array.isArray(o.steps) || o.steps.length === 0 || !o.steps.every((s) => typeof s === 'string')) return false
  if (typeof o.log !== 'string') return false
  if (o.place !== undefined) {
    const p = o.place as Record<string, unknown>
    if (typeof p !== 'object' || p === null || typeof p.id !== 'string' || typeof p.name !== 'string') return false
  }
  return true
}

/** 收斂到第 5 節的長度上限：steps 1–3 條。超長不截字（會斷句），只截條數。 */
function normalize(o: Order): Order {
  return { ...o, steps: o.steps.slice(0, 3) }
}

// ── WeeklyReport（第 5 節）────────────────────────────────────────

/** 與 parseOrder 同樣四層，形狀換成 WeeklyReport。 */
export function parseWeekly(raw: string): Pick<WeeklyReport, 'body' | 'verdict'> {
  const attempts = [
    () => parseJson(raw),
    () => parseJson(stripFence(raw)),
    () => parseJson(firstObject(raw)),
  ]
  for (const attempt of attempts) {
    try {
      const v = attempt() as Record<string, unknown>
      if (v && typeof v.body === 'string' && typeof v.verdict === 'string' && v.body.trim()) {
        return { body: v.body, verdict: v.verdict }
      }
    } catch { /* 換下一層 */ }
  }
  throw new ParseError('Claude 回傳無法解析為 WeeklyReport JSON')
}
