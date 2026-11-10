// B13：PlaceMem 五種事件與愛店對記憶的影響逐一斷言；memSummary 不含店名／評分／座標。
// idb-keyval 換成記憶體 Map（沿用 repo 不依賴真 IndexedDB 的做法；jsdom 沒有 indexedDB）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: (k: string) => structuredClone(store.get(k)),
  set: (k: string, v: unknown) => { store.set(k, structuredClone(v)) },
  del: (k: string) => { store.delete(k) },
}))

const {
  CLOSED_MS, KEEP_EVENTS, NEVER_AGAIN_MS, MAX_ENTRIES, REPEAT_MS,
  allMem, blockedPlaceIds, clearDislike, clearPlaceMem, cuisineStats, discoveryStats, getMem, markClosed, markDailyDislike, markDone, markNeverAgain,
  markNotThisKind, markRepeat, markShown, memSummary, mergeEntry, migrateDailyDislike, setFav,
} = await import('../../src/placeMem.ts')

const DAY = 24 * 3600 * 1000
const T0 = new Date('2026-10-21T12:00:00+08:00').getTime()
const meta = { module: 'eat' as const }

beforeEach(() => { store.clear() })

describe('shown：拿到口令的當下就記', () => {
  it('記時間戳、品牌鍵、細類；新的在前；最多 10 筆', async () => {
    await markShown('p1', { module: 'eat', brand: 'mos', cuisine: 'fast' }, T0)
    const e = (await getMem('p1'))!
    expect(e).toMatchObject({ id: 'p1', module: 'eat', shown: [T0], done: [], dislikes: 0, brand: 'mos', cuisine: 'fast' })
    for (let i = 1; i <= KEEP_EVENTS + 3; i++) await markShown('p1', meta, T0 + i)
    const after = (await getMem('p1'))!
    expect(after.shown).toHaveLength(KEEP_EVENTS)
    expect(after.shown[0]).toBe(T0 + KEEP_EVENTS + 3)
    expect(after.brand).toBe('mos') // 後來沒帶 brand 不會把它洗掉
  })

  it('同一毫秒重複呼叫只記一筆（冪等）', async () => {
    await markShown('p1', meta, T0)
    await markShown('p1', meta, T0)
    expect((await getMem('p1'))!.shown).toEqual([T0])
  })

  it('連點也不會互相覆蓋（讀改寫串行化）', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => markShown(`p${i}`, meta, T0 + i)))
    expect(await allMem()).toHaveLength(8)
  })
})

describe('done：去過', () => {
  it('記 done，細類 a += 1，b 不動', async () => {
    await markShown('p1', { module: 'eat', cuisine: 'ramen' }, T0)
    await markDone('p1', 'ramen', T0 + 1000)
    await markDone('p2', 'ramen', T0 + 2000)
    expect((await getMem('p1'))!.done).toEqual([T0 + 1000])
    expect((await cuisineStats()).ramen).toEqual([3, 1])
  })
  it('沒有細類就只記 done', async () => {
    await markDone('p1', undefined, T0)
    expect(await cuisineStats()).toEqual({})
    expect((await getMem('p1'))!.done).toEqual([T0])
  })
})

describe('closed：店關了', () => {
  it('24 小時內不再出現；不動細類；不增加不要再來次數', async () => {
    await markShown('p1', { module: 'eat', cuisine: 'tw' }, T0)
    await markClosed('p1', T0)
    const e = (await getMem('p1'))!
    expect(e.dislikeUntil).toBe(T0 + CLOSED_MS)
    expect(e.dislikes).toBe(0)
    expect(await cuisineStats()).toEqual({})
  })
  it('不會把已經更長（90 天／永久）的封鎖縮短', async () => {
    await markNeverAgain('p1', T0)
    await markClosed('p1', T0 + 1000)
    expect((await getMem('p1'))!.dislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    await markNeverAgain('p1', T0)
    await markClosed('p1', T0 + 2000)
    expect((await getMem('p1'))!.dislikeUntil).toBe('forever')
  })
})

describe('repeat：又是這家（Round 4）', () => {
  it('14 天不再出現；不算「不要再來」次數、不動細類', async () => {
    await markShown('p1', { module: 'eat', cuisine: 'tw' }, T0)
    await markRepeat('p1', T0)
    const e = (await getMem('p1'))!
    expect(REPEAT_MS).toBe(14 * DAY)
    expect(e.dislikeUntil).toBe(T0 + REPEAT_MS)
    expect(e.dislikes).toBe(0)
    expect(await cuisineStats()).toEqual({})
    const sum = await memSummary('eat', T0 + DAY)
    expect(sum.find((m) => m.id === 'p1')?.x).toBe(T0 + REPEAT_MS)
  })
  it('不會把已經更長（90 天／永久）的封鎖縮短', async () => {
    await markNeverAgain('p1', T0)
    await markRepeat('p1', T0 + 1000)
    expect((await getMem('p1'))!.dislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
  })
})

describe('not_this_kind：今天不想吃這類', () => {
  it('細類 b += 0.5；不動任何一家店', async () => {
    await markShown('p1', { module: 'eat', cuisine: 'tw' }, T0)
    await markNotThisKind('tw')
    await markNotThisKind('tw')
    expect((await cuisineStats()).tw).toEqual([1, 2])
    expect((await getMem('p1'))!.dislikeUntil).toBeUndefined()
  })
  it('沒有細類就什麼都不做', async () => {
    await markNotThisKind(undefined)
    expect(await cuisineStats()).toEqual({})
  })
})

describe('never_again：這家不要再來', () => {
  it('第 1 次 90 天；第 2 次永久', async () => {
    await markNeverAgain('p1', T0)
    expect(await getMem('p1')).toMatchObject({ dislikes: 1, dislikeUntil: T0 + 90 * DAY })
    await markNeverAgain('p1', T0 + DAY)
    expect(await getMem('p1')).toMatchObject({ dislikes: 2, dislikeUntil: 'forever' })
    await markNeverAgain('p1', T0 + 2 * DAY)
    expect((await getMem('p1'))!.dislikeUntil).toBe('forever')
  })
})

describe('fav：愛店', () => {
  it('列入、取消', async () => {
    await markShown('p1', meta, T0)
    await setFav('p1', true)
    expect((await getMem('p1'))!.fav).toBe(true)
    await setFav('p1', false)
    expect((await getMem('p1'))!.fav).toBeUndefined()
  })
})

describe('skip（沒做）不呼叫任何函式 → PlaceMem 不變', () => {
  it('只有 shown 的店：沒有 done、沒有封鎖、細類沒動', async () => {
    await markShown('p1', { module: 'eat', cuisine: 'tw' }, T0)
    const e = (await getMem('p1'))!
    expect(e.done).toEqual([])
    expect(e.dislikeUntil).toBeUndefined()
    expect(await cuisineStats()).toEqual({})
  })
})

describe('memSummary：送給伺服器的摘要', () => {
  it('只有 id／sh／dn／x／fav／b；序列化後沒有 name／rating／lat／lng', async () => {
    await markShown('p1', { module: 'eat', brand: 'mos', cuisine: 'fast' }, T0)
    await markDone('p1', 'fast', T0 + 1)
    await markNeverAgain('p1', T0 + 2)
    await setFav('p1', true)
    const s = await memSummary('eat', T0 + 3)
    expect(s).toEqual([{ id: 'p1', sh: [T0], dn: [T0 + 1], dc: 1, x: T0 + 2 + NEVER_AGAIN_MS, fav: true, b: 'mos' }])
    const json = JSON.stringify(s)
    expect(json).not.toMatch(/"(name|rating|lat|lng|priceLevel|priceRange)"/)
    expect(json).not.toMatch(/cuisine/) // 細類另外走 request.cuisine，不混在店的摘要裡
  })

  it('sh／dn 各最多 5 筆，新的在前', async () => {
    for (let i = 0; i < 9; i++) { await markShown('p1', meta, T0 + i); await markDone('p1', undefined, T0 + i) }
    const [row] = await memSummary('eat', T0 + 100)
    expect(row!.sh).toEqual([T0 + 8, T0 + 7, T0 + 6, T0 + 5, T0 + 4])
    expect(row!.dn).toHaveLength(5)
  })

  it('依最近事件排序、最多 limit 筆、只回該 module；過期封鎖不送', async () => {
    await markShown('old', meta, T0)
    await markShown('mid', meta, T0 + 10)
    await markShown('new', meta, T0 + 20)
    await markShown('cafe', { module: 'rest' }, T0 + 30)
    expect((await memSummary('eat', T0 + 50)).map((r) => r.id)).toEqual(['new', 'mid', 'old'])
    expect((await memSummary('eat', T0 + 50, 2)).map((r) => r.id)).toEqual(['new', 'mid'])
    expect((await memSummary('rest', T0 + 50)).map((r) => r.id)).toEqual(['cafe'])

    await markClosed('old', T0)
    expect((await memSummary('eat', T0 + 1000)).find((r) => r.id === 'old')!.x).toBe(T0 + CLOSED_MS)
    expect((await memSummary('eat', T0 + 2 * DAY)).find((r) => r.id === 'old')!.x).toBeUndefined()
  })
})

describe('R2-02：封鎖中與愛店不被 limit 擠掉', () => {
  it('再看過 201 家後，先前封鎖（含永久）與愛店的店仍在摘要；其餘依最近事件補滿到 limit', async () => {
    await markShown('blocked90', meta, T0)
    await markNeverAgain('blocked90', T0)
    await markShown('forever', meta, T0)
    await markNeverAgain('forever', T0)
    await markNeverAgain('forever', T0 + 1)
    await markShown('closed', meta, T0)
    await markClosed('closed', T0)
    await markShown('lover', meta, T0)
    await setFav('lover', true)
    for (let i = 0; i < 201; i++) await markShown(`n${i}`, meta, T0 + 10 + i)
    const s = await memSummary('eat', T0 + 1000)
    const ids = s.map((r) => r.id)
    expect(s).toHaveLength(200)
    for (const id of ['blocked90', 'forever', 'closed', 'lover']) expect(ids).toContain(id)
    expect(ids).toContain('n200') // 最近的一般店照樣在
    expect(ids).not.toContain('n0') // 最舊的一般店被擠掉
    expect(s.find((r) => r.id === 'forever')!.x).toBe('forever')
  })

  it('封鎖／愛店本身超過 limit 也全部收進去', async () => {
    for (let i = 0; i < 5; i++) { await markShown(`b${i}`, meta, T0 + i); await markNeverAgain(`b${i}`, T0 + i) }
    await markShown('plain', meta, T0 + 99)
    const s = await memSummary('eat', T0 + 1000, 3)
    expect(s.map((r) => r.id).sort()).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
  })
})

describe('R2-03：dc＝累計完成次數', () => {
  it('完成 12 次：done 只留 10 筆，dc 仍是 12；同一毫秒重複不重複計', async () => {
    for (let i = 0; i < 12; i++) await markDone('p1', undefined, T0 + i)
    await markDone('p1', undefined, T0 + 11)
    expect((await getMem('p1'))!.done).toHaveLength(KEEP_EVENTS)
    const [row] = await memSummary('eat', T0 + 100)
    expect(row!.dc).toBe(12)
    expect(row!.dn).toHaveLength(5)
  })
})

describe('R2-03：舊資料相容', () => {
  it('舊資料沒有累計欄位：dc 用 done.length，之後 markDone 從那裡接著數；只 shown 的 dc 是 0', async () => {
    store.set('decide.placeMem', { old: { id: 'old', module: 'eat', shown: [T0], done: [T0, T0 - 1, T0 - 2], dislikes: 0 } })
    expect((await memSummary('eat', T0 + 1))[0]!.dc).toBe(3)
    await markDone('old', undefined, T0 + 5)
    expect((await memSummary('eat', T0 + 6))[0]!.dc).toBe(4)
    await markShown('fresh', meta, T0 + 7)
    expect((await memSummary('eat', T0 + 8)).find((r) => r.id === 'fresh')!.dc).toBe(0)
  })
})

describe('discoveryStats：本週新占領／回防', () => {
  const weekStart = new Date('2026-10-19T00:00:00+08:00').toISOString() // 週一
  it('本週第一次去 = 新占領；本週前就去過、或本週再去 = 回防', async () => {
    await markDone('a', undefined, new Date('2026-10-20T12:00:00+08:00').getTime()) // 新
    await markDone('b', undefined, new Date('2026-10-12T12:00:00+08:00').getTime()) // 上週去過
    await markDone('b', undefined, new Date('2026-10-20T19:00:00+08:00').getTime()) // 本週回防
    await markDone('c', undefined, new Date('2026-10-20T12:00:00+08:00').getTime()) // 新
    await markDone('c', undefined, new Date('2026-10-21T12:00:00+08:00').getTime()) // 同店本週第二次 → 回防
    await markDone('d', undefined, new Date('2026-10-05T12:00:00+08:00').getTime()) // 更早，不算本週
    expect(await discoveryStats(weekStart, new Date('2026-10-22T12:00:00+08:00').getTime())).toEqual({ newPlaces: 2, revisits: 2 })
  })
  it('空的就是 0／0', async () => {
    expect(await discoveryStats(weekStart, T0)).toEqual({ newPlaces: 0, revisits: 0 })
  })
})

describe('容量', () => {
  it(`超過 ${MAX_ENTRIES} 家時清最舊的，但愛店與封鎖中的不清`, async () => {
    await markShown('keep-fav', meta, T0)
    await setFav('keep-fav', true)
    await markShown('keep-blocked', meta, T0 + 1)
    await markNeverAgain('keep-blocked', T0 + 1)
    for (let i = 0; i < MAX_ENTRIES + 20; i++) await markShown(`x${i}`, meta, T0 + 10 + i)
    const ids = new Set((await allMem()).map((e) => e.id))
    expect(ids.size).toBeLessThanOrEqual(MAX_ENTRIES)
    expect(ids.has('keep-fav')).toBe(true)
    expect(ids.has('keep-blocked')).toBe(true)
    expect(ids.has('x0')).toBe(false)
  })

  it('clearPlaceMem 清乾淨', async () => {
    await markDone('p1', 'tw', T0)
    await clearPlaceMem()
    expect(await allMem()).toEqual([])
    expect(await cuisineStats()).toEqual({})
  })
})

describe('blockedPlaceIds：今日行程讀的封鎖清單（紅隊 §3.2）', () => {
  it('不要再來 90 天內在清單裡；過期就不在；第 2 次變永久', async () => {
    await markNeverAgain('p1', T0)
    expect(await blockedPlaceIds(T0 + 1000)).toEqual(['p1'])
    expect(await blockedPlaceIds(T0 + NEVER_AGAIN_MS + 1000)).toEqual([])
    await markNeverAgain('p1', T0 + 2000)
    expect(await blockedPlaceIds(T0 + NEVER_AGAIN_MS * 10)).toEqual(['p1'])
  })
  it('店關了 24 小時內在清單裡；過期就不在；只看過的店不在清單裡', async () => {
    await markClosed('p2', T0)
    await markShown('p3', meta, T0)
    expect(await blockedPlaceIds(T0 + CLOSED_MS - 1000)).toEqual(['p2'])
    expect(await blockedPlaceIds(T0 + CLOSED_MS + 1000)).toEqual([])
  })
  it('又是這家 14 天內在清單裡；不會把已經更長的封鎖縮短', async () => {
    await markNeverAgain('p4', T0)
    await markRepeat('p4', T0 + 1000)
    expect(await blockedPlaceIds(T0 + REPEAT_MS + 1000)).toEqual(['p4'])
  })
})

describe('clearDislike：解除一間店的「不要再來」封鎖（round 8，F7「清除『不喜歡』的紀錄」）', () => {
  it('核心 app 按過不要再來 → clearDislike 不動它，仍在封鎖清單裡（round 11，R10-F2a：沒有 daily 欄位就不能證明封鎖來自今日行程）；shown／done／愛店不動', async () => {
    await markShown('p1', meta, T0)
    await markDone('p1', 'tw', T0)
    await setFav('p1', true)
    await markNeverAgain('p1', T0)
    expect(await blockedPlaceIds(T0 + 1000)).toEqual(['p1'])
    const r = await clearDislike('p1')
    expect(r.sharedRemains).toBe(true)
    expect(await blockedPlaceIds(T0 + 1000)).toEqual(['p1'])
    const e = await getMem('p1')
    expect(e?.doneCount).toBe(1)
    expect(e?.fav).toBe(true)
    expect(e?.shown.length).toBe(1)
    expect(e?.done.length).toBe(1)
    expect(e?.dislikes).toBe(1)
  })
  it('核心 app 按過 2 次的永久封鎖：clearDislike 不動它（round 11，R10-F2：連按兩次的永久封鎖也不能被今日行程的清除刪掉）', async () => {
    await markNeverAgain('p1', T0)
    await markNeverAgain('p1', T0 + 1)
    expect(await blockedPlaceIds(T0 + NEVER_AGAIN_MS * 10)).toEqual(['p1'])
    const r = await clearDislike('p1')
    expect(r.sharedRemains).toBe(true)
    expect(await blockedPlaceIds(T0 + NEVER_AGAIN_MS * 10)).toEqual(['p1'])
    const e = await getMem('p1')
    expect(e?.dislikeUntil).toBe('forever')
    expect(e?.dislikes).toBe(2)
  })
  it('沒有這家店的紀錄時什麼都不做、不報錯', async () => {
    await clearDislike('no-such-place')
    expect(await allMem()).toEqual([])
  })
})

describe('round 10：今日行程「不喜歡」跟核心 app「不要再來」分來源記（R9-F7-leak）', () => {
  it('兩邊都按過：清掉今日行程的封鎖，核心 app 的封鎖還在（舊版會一起清掉）', async () => {
    await markNeverAgain('p1', T0)
    await markDailyDislike('p1', T0)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1')
    await clearDislike('p1')
    const e = (await getMem('p1'))!
    expect(e.dailyDislikeUntil).toBeUndefined()
    expect(e.dailyDislikes).toBe(0)
    expect(e.dislikeUntil).toBe(T0 + NEVER_AGAIN_MS) // 核心 app 的封鎖不動
    expect(e.dislikes).toBe(1)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1')
  })
  it('只有今日行程按過：clearDislike 清掉它，之後不再封鎖', async () => {
    await markDailyDislike('p1', T0)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1')
    await clearDislike('p1')
    expect((await blockedPlaceIds(T0 + DAY))).not.toContain('p1')
  })
  it('今日行程按兩次 → 永久；清掉之後再按一次是 90 天不是永久（次數歸零了）', async () => {
    await markDailyDislike('p1', T0)
    await markDailyDislike('p1', T0 + DAY)
    expect((await getMem('p1'))!.dailyDislikeUntil).toBe('forever')
    await clearDislike('p1')
    await markDailyDislike('p1', T0 + 2 * DAY)
    expect((await getMem('p1'))!.dailyDislikeUntil).toBe(T0 + 2 * DAY + NEVER_AGAIN_MS)
  })
  it('兩邊各按一次是 90 天不是永久（次數分開算）', async () => {
    await markNeverAgain('p1', T0)
    await markDailyDislike('p1', T0)
    const e = (await getMem('p1'))!
    expect(e.dislikes).toBe(1)
    expect(e.dailyDislikes).toBe(1)
    expect(e.dislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    expect(e.dailyDislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
  })
  it('memSummary 的 x 取兩邊封鎖期較久者（永久優先）', async () => {
    await markNeverAgain('p1', T0)
    await markDailyDislike('p1', T0 + 10 * DAY)
    const [row] = await memSummary('eat', T0 + 11 * DAY)
    expect(row?.x).toBe(T0 + 10 * DAY + NEVER_AGAIN_MS)
  })
  it('過渡（round 11，R10-F2a）：沒有 daily 欄位的舊紀錄，clearDislike 不動共用欄位——分來源之後只在核心 app 按過的紀錄也是這個形狀，分不出來就不碰；要清舊紀錄的今日行程封鎖，先走 migrateDailyDislike（見下方 round 11 測試）', async () => {
    await markNeverAgain('p1', T0) // 只有共用欄位，沒有 daily 欄位
    const before = (await getMem('p1'))!
    expect(before.dailyDislikes).toBeUndefined()
    expect(before.dailyDislikeUntil).toBeUndefined()
    const r = await clearDislike('p1')
    expect(r.sharedRemains).toBe(true)
    const e = (await getMem('p1'))!
    expect(e.dislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    expect(e.dislikes).toBe(1)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1')
  })
  it('mergeEntry 合併 daily 欄位：永久優先，否則取較久者；次數取大的；兩邊都沒有 daily 欄位時不寫', () => {
    const base = { id: 'p1', module: 'eat' as const, shown: [T0], done: [], dislikes: 0 }
    const a = mergeEntry({ ...base, dailyDislikeUntil: T0 + 10 * DAY, dailyDislikes: 1 }, { ...base, dailyDislikeUntil: T0 + 20 * DAY, dailyDislikes: 2 })
    expect(a.dailyDislikeUntil).toBe(T0 + 20 * DAY)
    expect(a.dailyDislikes).toBe(2)
    const b = mergeEntry({ ...base, dailyDislikeUntil: 'forever' as const, dailyDislikes: 2 }, { ...base, dailyDislikeUntil: T0 + 20 * DAY, dailyDislikes: 1 })
    expect(b.dailyDislikeUntil).toBe('forever')
    const c = mergeEntry({ ...base, dislikeUntil: T0 + 5 * DAY }, { ...base })
    expect('dailyDislikeUntil' in c).toBe(false)
    expect('dailyDislikes' in c).toBe(false)
  })
})

describe('round 11：舊紀錄移轉（R10-F2c）＋ clearDislike 回報 sharedRemains', () => {
  it('MOVE：舊紀錄只有一次按壓（dislikes=1）→ 移轉後共用欄位刪掉、daily 欄位留著；clearDislike 清掉它，之後不再封鎖', async () => {
    await markNeverAgain('p1', T0) // 舊版寫法：今日行程按過一次，只有共用欄位
    await migrateDailyDislike('p1', T0 + DAY)
    const m = (await getMem('p1'))!
    expect(m.dailyDislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    expect(m.dailyDislikes).toBe(1)
    expect(m.dislikeUntil).toBeUndefined()
    expect(m.dislikes).toBe(0)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1') // daily 側還在封鎖
    const r = await clearDislike('p1')
    expect(r.sharedRemains).toBe(false)
    expect((await blockedPlaceIds(T0 + DAY))).not.toContain('p1')
  })
  it('COPY：舊紀錄按過兩次（dislikes=2，永久）→ 移轉後共用欄位不動、daily 欄位抄一份；clearDislike 只清 daily 側，共用永久封鎖還在', async () => {
    await markNeverAgain('p1', T0)
    await markNeverAgain('p1', T0 + 1)
    await migrateDailyDislike('p1', T0 + DAY)
    const m = (await getMem('p1'))!
    expect(m.dislikeUntil).toBe('forever')
    expect(m.dislikes).toBe(2)
    expect(m.dailyDislikeUntil).toBe('forever')
    expect(m.dailyDislikes).toBe(1) // 保守記 1，不從模糊資料製造永久
    const r = await clearDislike('p1')
    expect(r.sharedRemains).toBe(true)
    expect((await blockedPlaceIds(T0 + DAY))).toContain('p1')
    const e = (await getMem('p1'))!
    expect(e.dailyDislikeUntil).toBeUndefined()
    expect(e.dailyDislikes).toBe(0)
  })
  it('移轉冪等：已有 daily 欄位就不動；沒有紀錄也不動；移轉兩次結果一樣', async () => {
    await markDailyDislike('p1', T0)
    await migrateDailyDislike('p1', T0 + DAY)
    const e = (await getMem('p1'))!
    expect(e.dailyDislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    expect(e.dailyDislikes).toBe(1)
    await migrateDailyDislike('p1', T0 + 2 * DAY)
    const e2 = (await getMem('p1'))!
    expect(e2.dailyDislikeUntil).toBe(T0 + NEVER_AGAIN_MS)
    expect(e2.dailyDislikes).toBe(1)
    await migrateDailyDislike('no-such-place', T0)
    expect(await allMem()).toHaveLength(1)
  })
  it('clearDislike 回報 sharedRemains：兩邊都按過 → true；只有今日行程按過 → false', async () => {
    await markNeverAgain('p1', T0)
    await markDailyDislike('p1', T0)
    expect((await clearDislike('p1')).sharedRemains).toBe(true)
    await markDailyDislike('p2', T0)
    expect((await clearDislike('p2')).sharedRemains).toBe(false)
  })
})
