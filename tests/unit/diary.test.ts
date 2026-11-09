import { describe, expect, it } from 'vitest'
import {
  dayLabel, entriesInWeek, entryId, groupByDay, makeEntry, recentOrders, stats,
  timeLabel, weekStartOf, weeklyDue,
} from '../../src/diary.ts'
import type { DiaryEntry } from '../../src/types.ts'

const e = (ts: string, module: DiaryEntry['module'], outcome: DiaryEntry['outcome']): DiaryEntry =>
  makeEntry(ts, module, 1, `${module}-big`, outcome)

// 本地 wall-clock：日記一律用本地時間（使用者決定 2026-11-09），所以測試時間
// 也用本地時間建。無時區後綴的 ISO 字串按本地時間解析，斷言用本地 getter，
// 在任何時區都成立。不要用 `+08:00` 字面量：它把台北時間寫死，
// 在東京／UTC 會讓 timeLabel／weeklyDue 這類本地斷言失敗。
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00`
}
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi)

describe('diary 統計（第 10、13.1 節）', () => {
  it('服從率 =（done + reissued）÷ 全部', () => {
    // 12 筆：9 done、1 reissued、2 punished → (9+1)/12 = 83%
    const entries = [
      ...Array.from({ length: 9 }, (_, i) => e(`2026-09-0${(i % 7) + 1}T12:0${i}:00+08:00`, 'eat', 'done')),
      e('2026-09-08T13:00:00+08:00', 'eat', 'reissued'),
      e('2026-09-08T23:30:00+08:00', 'sleep', 'punished'),
      e('2026-09-09T16:05:00+08:00', 'rest', 'punished'),
    ]
    const s = stats(entries)
    expect(s.orders).toBe(12)
    expect(s.complianceRate).toBe(83)
    expect(s.punishments).toBe(2)
  })

  it('空日記不會除以零', () => {
    expect(stats([])).toEqual({ orders: 0, complianceRate: 0, punishments: 0, weakestModule: null })
  })

  it('全部完成 = 100%', () => {
    expect(stats([e('2026-09-08T12:00:00+08:00', 'eat', 'done')]).complianceRate).toBe(100)
  })

  it('最弱模組 = 罰則最多的那個', () => {
    const entries = [
      e('2026-09-08T23:30:00+08:00', 'sleep', 'punished'),
      e('2026-09-09T23:30:00+08:00', 'sleep', 'punished'),
      e('2026-09-10T16:00:00+08:00', 'rest', 'punished'),
      e('2026-09-10T12:00:00+08:00', 'eat', 'done'),
    ]
    expect(stats(entries).weakestModule).toBe('sleep')
  })

  it('沒有罰則就沒有最弱模組', () => {
    expect(stats([e('2026-09-08T12:00:00+08:00', 'eat', 'done')]).weakestModule).toBeNull()
  })
})

describe('diary 冪等（第 13.1 節）', () => {
  it('同 id 的兩筆視為同一道口令', () => {
    const a = e('2026-09-11T12:41:00+08:00', 'eat', 'reissued')
    const b = e('2026-09-11T12:41:00+08:00', 'eat', 'done')
    expect(a.id).toBe(b.id)
    expect(entryId('2026-09-11T12:41:00+08:00', 'eat')).toBe('2026-09-11T12:41:00+08:00-eat')
  })
})

describe('週界與近 7 天', () => {
  it('週界落在週一 00:00', () => {
    const ws = new Date(weekStartOf(local(2026, 9, 11, 12))) // 本地週五
    // 不只「是週一 00:00」，還要是「那一週的週一」：2026-09-11（五）→ 09-07（一）
    expect(ws.getFullYear()).toBe(2026)
    expect(ws.getMonth()).toBe(8)
    expect(ws.getDate()).toBe(7)
    expect(ws.getDay()).toBe(1)
    expect(ws.getHours()).toBe(0)
    expect(ws.getMinutes()).toBe(0)
  })

  it('entriesInWeek 只留那一週的', () => {
    const ws = weekStartOf(local(2026, 9, 11, 12))
    const inside = e(at(2026, 9, 11, 12), 'eat', 'done')
    const outside = e(at(2026, 8, 1, 12), 'eat', 'done')
    expect(entriesInWeek([inside, outside], ws).map((x) => x.id)).toEqual([inside.id])
  })

  it('recentOrders 只取近 7 天', () => {
    const now = local(2026, 9, 11, 12)
    const recent = e(at(2026, 9, 10, 12), 'eat', 'done')
    const old = e(at(2026, 8, 1, 12), 'eat', 'done')
    expect(recentOrders([recent, old], now)).toEqual([
      { module: 'eat', big: 'eat-big', at: '2026-09-10T12:00:00' },
    ])
  })

  it('週報只在週日 20:00 之後才到期', () => {
    expect(weeklyDue(local(2026, 9, 13, 20))).toBe(true) // 本地週日 20:00
    expect(weeklyDue(local(2026, 9, 13, 19, 59))).toBe(false)
    expect(weeklyDue(local(2026, 9, 12, 22))).toBe(false) // 本地週六
  })
})

describe('日記分組', () => {
  it('同一天的併成一組，順序保持', () => {
    const list = [
      e(at(2026, 9, 11, 16, 5), 'rest', 'punished'),
      e(at(2026, 9, 11, 12, 41), 'eat', 'done'),
      e(at(2026, 9, 10, 19), 'attend', 'done'),
    ]
    const g = groupByDay(list)
    expect(g).toHaveLength(2)
    expect(g[0]!.entries).toHaveLength(2)
    expect(g[1]!.entries).toHaveLength(1)
  })

  it('日期與時間標籤', () => {
    expect(dayLabel(at(2026, 9, 11, 12, 41))).toBe('週五 09/11')
    expect(timeLabel(at(2026, 9, 11, 12, 41))).toBe('12:41')
  })
})

describe('makeEntry（Round 3 B13）：不寫店名，只留 placeId', () => {
  it('輸出沒有 placeName 鍵；沒給 meta 就沒有 placeId／reason／mode 鍵', () => {
    const x = makeEntry('2026-10-21T12:00:00+08:00', 'eat', 1, '阿財魯肉飯', 'done')
    expect('placeName' in x).toBe(false)
    expect(Object.keys(x).sort()).toEqual(['big', 'id', 'level', 'module', 'outcome', 'ts'])
  })

  it('meta 的 placeId／reason／mode 寫進去，而且仍然沒有 placeName', () => {
    const x = makeEntry('2026-10-21T12:00:00+08:00', 'eat', 1, '阿財魯肉飯', 'reissued', { placeId: 'p1', reason: 'never_again', mode: 'new' })
    expect(x).toMatchObject({ placeId: 'p1', reason: 'never_again', mode: 'new', outcome: 'reissued' })
    expect(JSON.stringify(x)).not.toContain('placeName')
  })

  it('undefined 的 meta 不會變成鍵（免得整筆覆寫時蓋掉東西）', () => {
    const x = makeEntry('2026-10-21T12:00:00+08:00', 'eat', 1, 'b', 'done', { placeId: undefined, reason: undefined })
    expect('placeId' in x).toBe(false)
    expect('reason' in x).toBe(false)
  })
})
