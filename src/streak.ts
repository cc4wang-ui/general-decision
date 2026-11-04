// 出勤連勝＋公差假單＋升階（X7）。純函式、不碰 DOM／IndexedDB：UI 只讀 computeStreak 的結果。
// 狀態全部由日記推導（entries 本身就存在手機）——沒有新欄位，舊資料自然相容（沒紀錄 = 0 連勝、0 張假單）。
import { NCO_INSIGNIA, type NcoRank } from './insignia.ts'
import type { Tz } from './tz.ts'
import type { DiaryEntry } from './types.ts'

/** 每累積這麼多天連勝得 1 張假單。 */
export const FREEZE_EVERY = 7
/** 最多同時持有幾張。 */
export const FREEZE_MAX = 2

/** ISO → 當地日期 YYYY-MM-DD（不用 Date#getDate：伺服器／手機時區不一定是當地）。 */
export function localDay(iso: string | number | Date, tz: Tz): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** 日期字串加減天數（以 UTC 正午算，避開夏令時間邊界）。 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d, 12))
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export interface Milestone { days: number; rank: NcoRank; line: string }

/** 里程碑（由低到高）。台詞罵行為不罵人，測試會過 banned.ts。 */
export const MILESTONES: readonly Milestone[] = [
  { days: 3, rank: '下士', line: '三天沒缺席。先別得意，這才叫剛進門。' },
  { days: 7, rank: '中士', line: '整整一週。這週你的嘴比你的腳慢，我認了。' },
  { days: 14, rank: '上士', line: '兩週出勤。賴床的那個你，被我開除了。' },
  { days: 30, rank: '三等士官長', line: '三十天。全連都看著你，別在這時候鬆手。' },
  { days: 60, rank: '二等士官長', line: '六十天。習慣已經長在你身上，不用我吼了。' },
  { days: 100, rank: '一等士官長', line: '一百天。這個階級，是你自己一天一天站出來的。' },
]

export interface StreakResult {
  /** 目前連勝天數（只算有完成的天；假單補的天不加也不斷）。 */
  streak: number
  /** 目前持有假單。 */
  freezes: number
  /** 被假單補上的日期。 */
  freezeDays: string[]
  /** 昨天是否用了假單（給「下次打開」提示）。 */
  usedYesterday: boolean
  /** 今天是否已有完成。 */
  doneToday: boolean
  /** 已達成的最高里程碑；沒到 3 天 = null。 */
  milestone: Milestone | null
  /** 下一個里程碑還差幾天；已到頂 = null。 */
  nextIn: number | null
}

export function milestoneFor(streak: number): Milestone | null {
  let hit: Milestone | null = null
  for (const m of MILESTONES) if (streak >= m.days) hit = m
  return hit
}

export function insigniaOf(m: Milestone) {
  return NCO_INSIGNIA[m.rank]
}

/**
 * 由日記推導連勝。從第一個「完成」那天走到今天：
 * - 有完成 → 連勝 +1；每滿 7 的倍數得 1 張假單（上限 2）。
 * - 沒完成且不是今天 → 有假單就自動扣 1 張保住連勝，沒有就歸零。
 * - 今天還沒完成不算斷（今天還沒結束）。
 * 只有 outcome === 'done' 算出勤；換口令（reissued）、罰站、不符情境都不算。
 */
export function computeStreak(entries: readonly DiaryEntry[], now: Date, tz: Tz): StreakResult {
  const today = localDay(now, tz)
  const done = new Set<string>()
  for (const e of entries) {
    if (e.outcome !== 'done') continue
    const day = localDay(e.ts, tz)
    if (day <= today) done.add(day) // 手機時鐘被調回去時，未來的日記不算
  }
  const freezeDays: string[] = []
  let streak = 0
  let freezes = 0
  if (done.size > 0) {
    for (let d = [...done].sort()[0]!; d <= today; d = addDays(d, 1)) {
      if (done.has(d)) {
        streak++
        if (streak % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1)
      } else if (d !== today) {
        if (freezes > 0) { freezes--; freezeDays.push(d) } else streak = 0
      }
    }
  }
  const next = MILESTONES.find((m) => m.days > streak)
  return {
    streak, freezes, freezeDays,
    usedYesterday: freezeDays.includes(addDays(today, -1)),
    doneToday: done.has(today),
    milestone: milestoneFor(streak),
    nextIn: next ? next.days - streak : null,
  }
}
