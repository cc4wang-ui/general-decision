// Round 10 X4：店家記憶匯出／匯入。匯出格式、匯入驗證、壞檔不動資料、合併（同 place_id 取較新的時間）、
// 一鍵匯出的試用紀錄檔（N4）也能拿來匯入。
// idb-keyval 換成記憶體 Map（同 placeMem.test.ts）；setMany 也要有，importMem 用它一次寫兩個鍵。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
const writes: string[][] = []
vi.mock('idb-keyval', () => ({
  get: async (k: string) => structuredClone(store.get(k)),
  set: async (k: string, v: unknown) => { store.set(k, structuredClone(v)) },
  setMany: async (entries: [string, unknown][]) => {
    writes.push(entries.map(([k]) => k))
    for (const [k, v] of entries) store.set(k, structuredClone(v))
  },
  del: async (k: string) => { store.delete(k) },
}))

const {
  KEEP_EVENTS, MAX_ENTRIES, MEM_FILE_VERSION, allMem, clearPlaceMem, cuisineStats, exportMem, getMem, importMem,
  markDone, markNeverAgain, markNotThisKind, markShown, mergeCuisine, mergeEntry, parseMemFile, setFav,
} = await import('../../src/placeMem.ts')
const { exportTrial } = await import('../../src/trial.ts')
type Entry = Awaited<ReturnType<typeof allMem>>[number]

const DAY = 24 * 3600 * 1000
const T0 = new Date('2026-11-01T12:00:00+08:00').getTime()

beforeEach(() => { store.clear(); writes.length = 0 })

/** 一份有封鎖、愛店、完成次數、細類的記憶。 */
async function seed(): Promise<void> {
  await markShown('p1', { module: 'eat', brand: 'mos', cuisine: 'fast' }, T0)
  await markDone('p1', 'fast', T0 + 1000)
  await markShown('p2', { module: 'rest', cuisine: 'cafe' }, T0 + 2000)
  await setFav('p2', true, 'rest')
  await markShown('p3', { module: 'eat', cuisine: 'ramen' }, T0 + 3000)
  await markNeverAgain('p3', T0 + 4000)
  await markNeverAgain('p3', T0 + 5000) // 第 2 次 → 永久
  await markNotThisKind('ramen')
}

const snapshot = () => structuredClone(Object.fromEntries(store))
const fileOf = (places: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ app: 'decide', kind: 'place-memory', version: MEM_FILE_VERSION, exportedAt: 'x', places, cuisine: {}, ...extra })
const entry = (id: string, e: Partial<Entry> = {}): Entry => ({ id, module: 'eat', shown: [], done: [], dislikes: 0, ...e })

describe('匯出格式', () => {
  it('版本號、匯出時間、每家店的 place_id／時間戳／我方鍵、細類統計；沒有店名', async () => {
    await seed()
    const f = await exportMem(T0 + DAY)
    expect(f).toMatchObject({ app: 'decide', kind: 'place-memory', version: 1, exportedAt: new Date(T0 + DAY).toISOString() })
    expect(f.places).toHaveLength(3)
    expect(f.places.find((e) => e.id === 'p1')).toEqual({
      id: 'p1', module: 'eat', shown: [T0], done: [T0 + 1000], doneCount: 1, dislikes: 0, brand: 'mos', cuisine: 'fast',
    })
    expect(f.places.find((e) => e.id === 'p3')?.dislikeUntil).toBe('forever')
    expect(f.places.find((e) => e.id === 'p2')?.fav).toBe(true)
    expect(f.cuisine).toEqual({ fast: [2, 1], ramen: [1, 1.5] })
    // 只允許這幾個欄位：沒有 name、rating、lat 之類的 Google 內容
    const keys = new Set(f.places.flatMap((e) => Object.keys(e)))
    for (const k of keys) expect(['id', 'module', 'shown', 'done', 'doneCount', 'dislikes', 'dislikeUntil', 'fav', 'brand', 'cuisine']).toContain(k)
  })

  it('沒有記憶也匯得出空檔', async () => {
    expect(await exportMem(T0)).toMatchObject({ places: [], cuisine: {} })
  })
})

describe('匯入驗證：壞檔整份不收、說得出原因', () => {
  const cases: [string, string, RegExp][] = [
    ['不是 JSON', '{壞掉', /不是 JSON/],
    ['別的 App 的檔', JSON.stringify({ app: 'other', kind: 'place-memory', version: 1, places: [] }), /不是報告班長/],
    ['陣列', '[]', /不是報告班長/],
    ['不是記憶檔', JSON.stringify({ app: 'decide', kind: 'diary' }), /不是記憶檔/],
    ['舊版試用紀錄（沒有記憶）', JSON.stringify({ app: 'decide', kind: 'trial-log', entries: [] }), /沒有記憶/],
    ['沒有版本號', fileOf([], { version: undefined }), /沒有版本號/],
    ['版本號不是整數', fileOf([], { version: '1' }), /沒有版本號/],
    ['比 App 新的版本', fileOf([], { version: MEM_FILE_VERSION + 1 }), /第 2 版.*先更新 App/],
    ['沒有店家清單', fileOf([], { places: {} }), /沒有店家清單/],
    ['第 2 家沒有 id', fileOf([entry('a'), { ...entry('b'), id: '' }]), /第 2 家.*id/],
    ['module 不認得', fileOf([{ ...entry('a'), module: 'go' }]), /第 1 家.*module/],
    ['時間戳是字串', fileOf([{ ...entry('a'), shown: ['2026-11-01'] }]), /第 1 家.*shown/],
    ['done 不是陣列', fileOf([{ ...entry('a'), done: 3 }]), /第 1 家.*done/],
    ['dislikes 是負的', fileOf([{ ...entry('a'), dislikes: -1 }]), /dislikes/],
    ['封鎖期亂寫', fileOf([{ ...entry('a'), dislikeUntil: 'never' }]), /dislikeUntil/],
    ['fav 不是真假', fileOf([{ ...entry('a'), fav: 'yes' }]), /fav/],
    ['place_id 重複', fileOf([entry('a'), entry('a')]), /第 2 家.*重複/],
    ['__proto__ 當 id', fileOf([entry('__proto__')]), /第 1 家.*id/],
    ['細類統計壞了', fileOf([], { cuisine: { ramen: [1] } }), /細類統計/],
  ]
  for (const [name, text, why] of cases) {
    it(name, () => {
      const r = parseMemFile(text)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.why).toMatch(why)
    })
  }

  it('壞檔不動現有資料：記憶與細類一個字都沒變、沒有寫入', async () => {
    await seed()
    const before = snapshot()
    writes.length = 0
    const bad = fileOf([entry('new1', { shown: [T0 + DAY] }), { ...entry('new2'), shown: [Number.NaN] }])
    const r = await importMem(bad, T0 + DAY)
    expect(r).toEqual({ ok: false, why: expect.stringMatching(/第 2 家.*shown/) })
    expect(snapshot()).toEqual(before)
    expect(writes).toHaveLength(0)
    expect(await getMem('new1')).toBeUndefined() // 第 1 家是好的也不收：整份不收
  })

  it('檔案裡多塞的欄位（店名、評分）不會進記憶', async () => {
    const r = await importMem(fileOf([{ ...entry('a', { shown: [T0] }), name: '阿財魯肉飯', rating: 4.5 }]), T0)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(snapshot())).not.toContain('阿財')
    expect(await getMem('a')).toEqual(entry('a', { shown: [T0] }))
  })
})

describe('匯入：還原與合併', () => {
  it('匯出 → 清資料 → 匯入：記憶與細類跟原本一模一樣；店家記憶與細類同一次寫入', async () => {
    await seed()
    const original = snapshot()
    const text = JSON.stringify(await exportMem(T0 + DAY))
    await clearPlaceMem()
    expect(await allMem()).toHaveLength(0)
    writes.length = 0
    const r = await importMem(text, T0 + DAY)
    expect(r).toEqual({ ok: true, added: 3, merged: 0, total: 3 })
    expect(snapshot()).toEqual(original)
    expect(writes).toEqual([['decide.placeMem', 'decide.cuisine']])
  })

  it('同一份檔匯入兩次，結果跟匯入一次一樣（不會越匯越多）', async () => {
    await seed()
    const text = JSON.stringify(await exportMem(T0 + DAY))
    await importMem(text, T0 + DAY)
    const once = snapshot()
    const r = await importMem(text, T0 + DAY)
    expect(r).toEqual({ ok: true, added: 0, merged: 3, total: 3 })
    expect(snapshot()).toEqual(once)
  })

  it('換手機後先用了幾次再匯入舊備份：新舊合在一起，完成次數接著數', async () => {
    // 舊手機：p1 完成 12 次（只留最近 10 筆時間）
    for (let i = 1; i <= 12; i++) await markDone('p1', 'fast', T0 + i * DAY)
    const backup = JSON.stringify(await exportMem(T0 + 13 * DAY))
    await clearPlaceMem()
    // 新手機：同一家又去了 2 次，還有一家新的
    await markDone('p1', 'fast', T0 + 20 * DAY)
    await markDone('p1', 'fast', T0 + 21 * DAY)
    await markShown('n1', { module: 'eat' }, T0 + 21 * DAY)
    const r = await importMem(backup, T0 + 22 * DAY)
    expect(r).toEqual({ ok: true, added: 0, merged: 1, total: 2 })
    const p1 = (await getMem('p1'))!
    expect(p1.doneCount).toBe(14)
    expect(p1.done).toHaveLength(KEEP_EVENTS)
    expect(p1.done[0]).toBe(T0 + 21 * DAY) // 最新的在前
    expect(p1.done.at(-1)).toBe(T0 + 5 * DAY)
    expect(await getMem('n1')).toBeDefined()
    // 細類：兩邊各自取大的（舊手機 a=13 比新手機 a=3 大）
    expect((await cuisineStats()).fast).toEqual([13, 1])
    // 同一份舊備份再匯入一次：備份裡比現在最舊那筆還舊的完成（第 1、2 次）早就數過了，不再加
    await importMem(backup, T0 + 22 * DAY)
    expect((await getMem('p1'))!.doneCount).toBe(14)
  })

  it('同一家：封鎖取比較久的（永久優先）、愛店有一邊是就算、品牌鍵跟較新的那邊', () => {
    const cur = entry('a', { shown: [T0 + 5 * DAY], dislikeUntil: T0 + 6 * DAY, dislikes: 0, brand: 'new' })
    const inc = entry('a', { shown: [T0], dislikeUntil: T0 + 90 * DAY, dislikes: 1, fav: true, brand: 'old', cuisine: 'tw' })
    expect(mergeEntry(cur, inc)).toEqual({
      id: 'a', module: 'eat', shown: [T0 + 5 * DAY, T0], done: [], doneCount: 0,
      dislikeUntil: T0 + 90 * DAY, dislikes: 1, fav: true, brand: 'new', cuisine: 'tw',
    })
    expect(mergeEntry(cur, { ...inc, dislikeUntil: 'forever', dislikes: 2 }).dislikeUntil).toBe('forever')
    expect(mergeEntry(entry('a'), entry('a')).dislikeUntil).toBeUndefined()
    // 合併順序不影響結果
    expect(mergeEntry(inc, cur)).toEqual(mergeEntry(cur, inc))
  })

  it('細類合併各自取大的；__proto__ 以外的鍵（例如 constructor）照常', () => {
    const cur: Record<string, [number, number]> = { a: [3, 1], b: [1, 2] }
    const inc = JSON.parse('{"a":[2,4],"constructor":[2,2]}') as Record<string, [number, number]> // 跟匯入一樣是 JSON 解出來的
    expect(mergeCuisine(cur, inc)).toEqual({ a: [3, 4], b: [1, 2], constructor: [2, 2] })
  })

  it('一鍵匯出的試用紀錄檔（N4）也能拿來匯入記憶', async () => {
    await seed()
    const memory = await exportMem(T0 + DAY)
    const combined = exportTrial([], T0 + DAY, memory)
    await clearPlaceMem()
    const r = await importMem(combined, T0 + DAY)
    expect(r).toMatchObject({ ok: true, added: 3, total: 3 })
  })

  it(`超過 ${MAX_ENTRIES} 家：照平常的規則清掉最舊的，愛店不清`, async () => {
    const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => entry(`p${i}`, { shown: [T0 + i], ...(i === 0 ? { fav: true } : {}) }))
    const r = await importMem(fileOf(many), T0 + DAY)
    expect(r).toMatchObject({ ok: true, added: MAX_ENTRIES + 5, total: MAX_ENTRIES })
    expect(await getMem('p0')).toBeDefined() // 最舊但是愛店
    expect(await getMem('p1')).toBeUndefined()
  })
})
