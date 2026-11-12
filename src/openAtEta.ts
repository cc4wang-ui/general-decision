// 今日行程「走到店時店要開著」（daily-open-on-arrival）：用 Google currentOpeningHours.periods
// 判斷預估到店時間（ETA）那一刻店的營業狀態。純函式、不打 API、不加 Places 欄位（MASK 不動）。
// 規則跟主程式 N2 同一條（src/scene.ts HARD_OPEN_MIN）：到店時要營業中，而且離打烊至少 10 分鐘。

/** 到店時離打烊至少幾分鐘。必須等於 src/scene.ts 的 HARD_OPEN_MIN（單元測試鎖住兩者相等）。 */
export const MIN_OPEN_AT_ETA = 10

export type HoursDate = { year?: number; month?: number; day?: number }
export type HoursPoint = { day?: number; hour?: number; minute?: number; date?: HoursDate }
export type HoursPeriod = { open?: HoursPoint; close?: HoursPoint }
/** open：營業中且剩 ≥10 分鐘；closing：營業中但剩不到 10 分鐘；closed：沒開；unknown：沒有可用的營業時間資料。 */
export type OpenAtEta = 'open' | 'closing' | 'closed' | 'unknown'

const WEEK = 7 * 1440
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
const validPoint = (p: HoursPoint | undefined): p is Required<Pick<HoursPoint, 'day' | 'hour' | 'minute'>> & HoursPoint =>
  !!p && typeof p === 'object' && isInt(p.day, 0, 6) && isInt(p.hour, 0, 24) && isInt(p.minute, 0, 59)
const validDate = (d: HoursDate | undefined): d is Required<HoursDate> =>
  !!d && typeof d === 'object' && isInt(d.year, 2000, 2200) && isInt(d.month, 1, 12) && isInt(d.day, 1, 31)
/** 當地牆上時間換成「分鐘數」（當成 UTC 算，只拿來比大小與算差值，不涉及時區轉換）。 */
const wall = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h, mi) / 60000

/**
 * 預估到店時的營業狀態。
 * - anchorDate：錨點當天的當地日期 'YYYY-MM-DD'（daily-route 用東京時間）。
 * - eta：'HH:MM'；dayOffset：跨日偏移（src/dailyRouting.ts etaDayOffset，0＝錨點當天、1＝翌日）。
 * 判斷順序：
 * 1. 沒有 periods／格式不對 → unknown（不擋，沿用「營業狀態未確認」）。
 * 2. 有 period 沒有 close → Google 的 24 小時營業表示法 → open。
 * 3. periods 都帶日期而且 ETA 落在資料涵蓋的日期內 → 用實際日期判斷（含特殊休業日）。
 * 4. 否則（舊存檔的過期資料、ETA 超出涵蓋範圍）→ 用星期幾＋時間的每週規則判斷。
 * 相鄰時段（例：到 24:00、隔天 00:00 再開）會合併，不會把跨午夜營業誤判成快打烊。
 */
export function openAtEta(periods: unknown, anchorDate: string, eta: string | undefined, dayOffset = 0, minLeft = MIN_OPEN_AT_ETA): OpenAtEta {
  if (!Array.isArray(periods) || !periods.length || typeof eta !== 'string') return 'unknown'
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorDate)
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(eta)
  if (!dm || !tm) return 'unknown'
  const off = Number.isInteger(dayOffset) && dayOffset >= 0 ? dayOffset : 0
  const t = wall(Number(dm[1]), Number(dm[2]), Number(dm[3]) + off, Number(tm[1]), Number(tm[2]))
  const ps = (periods as HoursPeriod[]).filter((p) => p && typeof p === 'object' && validPoint(p.open))
  if (!ps.length) return 'unknown'
  if (ps.some((p) => p.close === undefined || p.close === null)) return 'open'
  if (!ps.every((p) => validPoint(p.close))) return 'unknown'

  let intervals: [number, number][] | undefined
  if (ps.every((p) => validDate(p.open!.date) && validDate(p.close!.date))) {
    const dated = ps.map((p): [number, number] => {
      const o = p.open!, c = p.close!, od = o.date as Required<HoursDate>, cd = c.date as Required<HoursDate>
      return [wall(od.year, od.month, od.day, o.hour!, o.minute!), wall(cd.year, cd.month, cd.day, c.hour!, c.minute!)]
    })
    // 涵蓋範圍：最早營業日的 00:00 到「最晚營業日的 24:00」與「最晚打烊時刻」兩者較晚的那個。
    const dayStart = (m: number) => m - (((m % 1440) + 1440) % 1440)
    const from = Math.min(...dated.map(([o]) => dayStart(o)))
    const to = Math.max(...dated.map(([o, c]) => Math.max(dayStart(o) + 1440, c)))
    if (t >= from && t < to) intervals = dated
  }
  if (!intervals) {
    const weekday = new Date(t * 60000).getUTCDay() // 0＝星期日，跟 Google 的 day 一樣
    const weekStart = t - (weekday * 1440 + Number(tm[1]) * 60 + Number(tm[2]))
    intervals = []
    for (const p of ps) {
      const o = weekStart + p.open!.day! * 1440 + p.open!.hour! * 60 + p.open!.minute!
      let c = weekStart + p.close!.day! * 1440 + p.close!.hour! * 60 + p.close!.minute!
      if (c <= o) c += WEEK
      for (const shift of [-WEEK, 0, WEEK]) intervals.push([o + shift, c + shift])
    }
  }
  // 合併重疊／相鄰時段。
  const sorted = intervals.filter(([o, c]) => c > o).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [o, c] of sorted) {
    const last = merged.at(-1)
    if (last && o <= last[1]) last[1] = Math.max(last[1], c)
    else merged.push([o, c])
  }
  const hit = merged.find(([o, c]) => o <= t && t < c)
  if (!hit) return 'closed'
  return hit[1] - t < minLeft ? 'closing' : 'open'
}

/** 自動站能不能派：open 或 unknown（沒資料不擋，contract STOP 3）。 */
export const dispatchableAt = (s: OpenAtEta) => s === 'open' || s === 'unknown'
