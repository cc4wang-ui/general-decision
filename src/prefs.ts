// 本機偏好：偵察方針、預算檔位（分國家記住）、上次所在國家（DEV-PLAN-3 W2）。
// 全部是 localStorage 的小設定，不含任何 Google 內容。無痕模式會丟例外，所以全部包 try。
// 注意：Number(null) === 0，讀 localStorage 一律先判 null（跟 loadLevel() 同一個坑）。
import { hourIn, tzOf } from './tz.ts'
import type { Band, Country, Novelty } from './types.ts'

const NOVELTY_KEY = 'decide.novelty'
const COUNTRY_KEY = 'decide.lastCountry'
const budgetKey = (c: 'TW' | 'JP') => `decide.budget.${c}`

const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v) } catch { /* 忽略 */ } }

// ── 偵察方針 ─────────────────────────────────────────────────────────
export const NOVELTY_ORDER: Novelty[] = ['familiar', 'balanced', 'recon']
export const NOVELTY_LABEL: Record<Novelty, string> = { familiar: '熟門熟路', balanced: '均衡', recon: '全面偵察' }

export function loadNovelty(): Novelty {
  const raw = read(NOVELTY_KEY)
  return raw === 'familiar' || raw === 'balanced' || raw === 'recon' ? raw : 'balanced'
}
export const saveNovelty = (n: Novelty): void => write(NOVELTY_KEY, n)
/** 熟門熟路 → 均衡 → 全面偵察 → 回到熟門熟路。 */
export const nextNovelty = (n: Novelty): Novelty => NOVELTY_ORDER[(NOVELTY_ORDER.indexOf(n) + 1) % NOVELTY_ORDER.length]!

// ── 國家 ─────────────────────────────────────────────────────────────
export function loadCountry(): Country {
  const raw = read(COUNTRY_KEY)
  return raw === 'TW' || raw === 'JP' || raw === 'other' ? raw : 'TW'
}
export const saveCountry = (c: Country): void => write(COUNTRY_KEY, c)

// ── 預算檔位（每人每餐，相鄰多選）────────────────────────────────────
const isBand = (n: unknown): n is Band => n === 1 || n === 2 || n === 3 || n === 4

/** 補成連續區間（選 1 和 3 → 1,2,3）；去重、排序、丟掉不合法的值。 */
export function normalizeBands(raw: unknown): Band[] {
  if (!Array.isArray(raw)) return []
  const bands = raw.filter(isBand)
  if (bands.length === 0) return []
  const lo = Math.min(...bands)
  const hi = Math.max(...bands)
  const out: Band[] = []
  for (let b = lo; b <= hi; b++) out.push(b as Band)
  return out
}

/**
 * 點一顆檔位：
 *  - 還沒選 → 只選它；
 *  - 沒選過的 → 連同中間的檔位一起補上（選了 4 再點 1 → 1,2,3,4）；
 *  - 選過的：是唯一一檔 → 回到不限；是端點 → 縮一檔；在中間 → 收成只剩它自己。
 */
export function toggleBand(cur: Band[], n: Band): Band[] {
  const bands = normalizeBands(cur)
  if (bands.length === 0) return [n]
  if (!bands.includes(n)) return normalizeBands([...bands, n])
  if (bands.length === 1) return []
  if (n === bands[0] || n === bands[bands.length - 1]) return bands.filter((b) => b !== n)
  return [n]
}

export function loadBudget(country: 'TW' | 'JP'): Band[] {
  const raw = read(budgetKey(country))
  if (raw === null) return []
  try { return normalizeBands(JSON.parse(raw)) } catch { return [] }
}
export const saveBudget = (country: 'TW' | 'JP', b: Band[]): void => write(budgetKey(country), JSON.stringify(b))

/** 當地時間 11:00–14:00（午餐）不給選最高檔。沒座標就不隱藏。 */
export function lunchHidesTop(loc: { lat: number; lng: number } | undefined, now: Date): boolean {
  if (!loc) return false
  const h = hourIn(now, tzOf(loc))
  return h >= 11 && h < 14
}

/** 午餐時段看不到最高檔，送出去的預算也要一起拿掉；拿掉後沒剩 = 不限。 */
export function effectiveBudget(b: Band[], hideTop: boolean): Band[] {
  return hideTop ? b.filter((x) => x !== 4) : b
}

// ── 情境（Round 5）：上次選的情境排第一個，但不幫使用者預選 ─────────────
const SCENE_PREF_KEY = 'decide.scene.v1'
export function loadLastScene(module: string): string {
  try {
    const v = JSON.parse(read(SCENE_PREF_KEY) ?? '{}') as Record<string, unknown>
    return typeof v[module] === 'string' ? (v[module] as string) : ''
  } catch { return '' }
}
export function saveLastScene(module: string, scene: string): void {
  let v: Record<string, unknown> = {}
  try { v = JSON.parse(read(SCENE_PREF_KEY) ?? '{}') as Record<string, unknown> } catch { /* 壞掉就重寫 */ }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) v = {}
  write(SCENE_PREF_KEY, JSON.stringify({ ...v, [module]: scene }))
}
/** 上次選的排第一個；其餘照原本順序；「其他」永遠在最後。 */
export function orderScenes(options: string[], last: string, other: string): string[] {
  if (!last || last === other || !options.includes(last)) return options
  return [last, ...options.filter((o) => o !== last)]
}
