import { describe, expect, it } from 'vitest'
import { findBanned } from '../../src/banned.ts'
import { NCO_INSIGNIA } from '../../src/insignia.ts'
import { addDays, computeStreak, localDay, MILESTONES, milestoneFor } from '../../src/streak.ts'
import { makeEntry } from '../../src/diary.ts'
import type { DiaryEntry } from '../../src/types.ts'

const TPE = 'Asia/Taipei' as const
/** 台北當天中午的一道口令。 */
const done = (day: string, outcome: DiaryEntry['outcome'] = 'done') =>
  makeEntry(`${day}T12:00:00+08:00`, 'eat', 1, 'x', outcome)
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))
const NOW = new Date('2026-11-10T20:00:00+08:00')

describe('連勝計算', () => {
  it('沒有日記 = 0 連勝、0 假單（舊資料相容）', () => {
    const r = computeStreak([], NOW, TPE)
    expect(r).toMatchObject({ streak: 0, freezes: 0, milestone: null, usedYesterday: false })
  })

  it('連續三天（含今天）= 3', () => {
    const r = computeStreak(days('2026-11-08', 3).map((d) => done(d)), NOW, TPE)
    expect(r.streak).toBe(3)
    expect(r.doneToday).toBe(true)
    expect(r.milestone?.rank).toBe('下士')
  })

  it('今天還沒完成不算斷：昨天以前連著就保留', () => {
    const r = computeStreak(days('2026-11-07', 3).map((d) => done(d)), NOW, TPE)
    expect(r.streak).toBe(3)
    expect(r.doneToday).toBe(false)
  })

  it('只有罰站／換口令／不符情境不算出勤', () => {
    const r = computeStreak([done('2026-11-10', 'punished'), done('2026-11-09', 'reissued'), done('2026-11-08', 'mismatch')], NOW, TPE)
    expect(r.streak).toBe(0)
  })

  it('同一天多道口令只算一天', () => {
    const r = computeStreak([done('2026-11-10'), done('2026-11-10'), done('2026-11-09')], NOW, TPE)
    expect(r.streak).toBe(2)
  })

  it('以當地日期分日：台北 23:30 與隔天 00:30 是兩天，東京看是同一天', () => {
    const a = makeEntry('2026-11-09T23:30:00+08:00', 'eat', 1, 'x', 'done')
    const b = makeEntry('2026-11-10T00:30:00+08:00', 'sleep', 1, 'y', 'done')
    expect(computeStreak([a, b], NOW, TPE).streak).toBe(2)
    expect(localDay(a.ts, 'Asia/Tokyo')).toBe('2026-11-10')
    expect(computeStreak([a, b], NOW, 'Asia/Tokyo').streak).toBe(1)
  })

  it('跨月跨年的日期加減', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('沒有假單時漏一天歸零', () => {
    const r = computeStreak([...days('2026-11-04', 3), '2026-11-10'].map((d) => done(d)), NOW, TPE)
    expect(r.streak).toBe(1)
  })

  it('日記時間在未來（手機時鐘被調回）不算', () => {
    expect(computeStreak([done('2026-11-12')], NOW, TPE).streak).toBe(0)
  })
})

describe('公差假單', () => {
  it('連勝滿 7 天得 1 張，之後漏一天自動扣 1 張保住連勝', () => {
    const es = [...days('2026-11-01', 7), '2026-11-09', '2026-11-10'].map((d) => done(d))
    const r = computeStreak(es, NOW, TPE)
    expect(r.freezes).toBe(0)
    expect(r.freezeDays).toEqual(['2026-11-08'])
    expect(r.streak).toBe(9) // 假單補的那天不加天數也不斷
  })

  it('昨天用了假單 → usedYesterday', () => {
    const r = computeStreak(days('2026-11-02', 7).map((d) => done(d)), NOW, TPE) // 11/09 漏，今天還沒完成
    expect(r.freezeDays).toEqual(['2026-11-09'])
    expect(r.usedYesterday).toBe(true)
    expect(r.streak).toBe(7)
  })

  it('最多持有 2 張', () => {
    const r = computeStreak(days('2026-10-20', 21).map((d) => done(d)), NOW, TPE)
    expect(r.streak).toBe(21)
    expect(r.freezes).toBe(2)
    const more = computeStreak(days('2026-09-01', 70).map((d) => done(d)), new Date('2026-11-09T20:00:00+08:00'), TPE)
    expect(more.freezes).toBe(2)
  })

  it('假單用完後再漏就歸零', () => {
    const es = [...days('2026-11-01', 7), '2026-11-10'].map((d) => done(d)) // 11/08 假單、11/09 歸零
    const r = computeStreak(es, NOW, TPE)
    expect(r.freezeDays).toEqual(['2026-11-08'])
    expect(r.streak).toBe(1)
  })
})

describe('升階里程碑', () => {
  it('3／7／14／30 天對應階級', () => {
    expect(milestoneFor(2)).toBeNull()
    expect(milestoneFor(3)?.rank).toBe('下士')
    expect(milestoneFor(7)?.rank).toBe('中士')
    expect(milestoneFor(13)?.rank).toBe('中士')
    expect(milestoneFor(14)?.rank).toBe('上士')
    expect(milestoneFor(30)?.rank).toBe('三等士官長')
    expect(milestoneFor(999)?.rank).toBe('一等士官長')
  })

  it('nextIn：到下一階還差幾天；到頂為 null', () => {
    expect(computeStreak(days('2026-11-08', 3).map((d) => done(d)), NOW, TPE).nextIn).toBe(4)
    expect(computeStreak(days('2026-08-01', 100).map((d) => done(d)), new Date('2026-11-08T20:00:00+08:00'), TPE).nextIn).toBeNull()
  })

  it('每個里程碑的階級章存在、台詞過護欄', () => {
    for (const m of MILESTONES) {
      expect(NCO_INSIGNIA[m.rank]).toBeDefined()
      expect(findBanned(m.line)).toEqual([])
    }
  })
})
