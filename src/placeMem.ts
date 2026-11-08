// 班長記得你 — 本機的「去過哪、不要哪」記憶（DEV-PLAN-3 W2、R3§2.3、R3§3.3）。
//
// 鐵則：只存 place_id、我方事件時間戳、我方品牌鍵／細類鍵。
// **絕不**寫入店名、評分、價位、座標——Google 條款只准無限期保存 place_id（STRATEGY C1）。
// 跟日記（decide.entries）分開存，避免互相覆寫（STRATEGY §2⑦）。
//
// 事件 → 記憶的規則表（每一列都有單元測試，T8）：
//   shown          拿到口令的當下就記；不等使用者回報
//   done           回報完成；該細類 a += 1
//   closed         店關了：這家 24 小時內不再出現；不動細類
//   not_this_kind  今天不想吃這類：細類 b += 0.5；不動店
//   never_again    這家不要再來：90 天；第 2 次 → 永久
//   repeat         又是這家（Round 4）：14 天不再出現；不動細類、不算「不要再來」次數
//   price          價格不對（Round 4）：不動記憶，只在這次操作排除（app.tsx excluded）
//   fav            列入愛店 / 取消
//   skip（沒做）   不呼叫任何一個——不服從是行為問題，不是店的問題
import { del, get, set, setMany } from 'idb-keyval'
import type { CuisineStats, PlaceMemEntry, PlaceMemSummary } from './types.ts'

const MEM_KEY = 'decide.placeMem'
const CUISINE_KEY = 'decide.cuisine'

const DAY = 24 * 3600 * 1000
/** 店關了：這家 24 小時內不再出現。 */
export const CLOSED_MS = DAY
/** 這家不要再來：90 天；第 2 次標記就永久。 */
export const NEVER_AGAIN_MS = 90 * DAY
/** 又是這家（Round 4）：14 天不再出現。 */
export const REPEAT_MS = 14 * DAY
/** 每家店本機留最近 10 次 shown／done；送伺服器時再各取 5。 */
export const KEEP_EVENTS = 10
export const SUMMARY_EVENTS = 5
/** 本機最多留幾家（愛店與仍在封鎖期的店不會被清掉）。 */
export const MAX_ENTRIES = 600

type Store = Record<string, PlaceMemEntry>
type MemModule = PlaceMemEntry['module']

// ── 串行化：IndexedDB 的讀改寫不是原子的，連點兩下會互相蓋掉 ─────────
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn)
  chain = run.catch(() => undefined) // 前一個失敗不能卡死後面的
  return run
}

const readStore = async (): Promise<Store> => (await get<Store>(MEM_KEY)) ?? {}
const readCuisine = async (): Promise<CuisineStats> => (await get<CuisineStats>(CUISINE_KEY)) ?? {}

/** 這家店最近一次事件（shown／done）的時間；沒有事件 = 0。 */
const lastEventAt = (e: PlaceMemEntry): number => Math.max(e.shown[0] ?? 0, e.done[0] ?? 0)

/** 仍在封鎖期（永久，或截止時間在未來）。 */
export function isBlocked(e: Pick<PlaceMemEntry, 'dislikeUntil'>, now: number): boolean {
  return e.dislikeUntil === 'forever' || (typeof e.dislikeUntil === 'number' && e.dislikeUntil > now)
}

/** 超過上限時，清掉最舊且不受保護（愛店、封鎖中）的店。 */
function prune(store: Store, now: number): void {
  const ids = Object.keys(store)
  if (ids.length <= MAX_ENTRIES) return
  const removable = ids
    .map((id) => store[id]!)
    .filter((e) => !e.fav && !isBlocked(e, now))
    .sort((a, b) => lastEventAt(a) - lastEventAt(b))
  for (const e of removable.slice(0, ids.length - MAX_ENTRIES)) delete store[e.id]
}

function entryOf(store: Store, id: string, module: MemModule = 'eat'): PlaceMemEntry {
  const cur = store[id]
  if (cur) return cur
  const fresh: PlaceMemEntry = { id, module, shown: [], done: [], dislikes: 0 }
  store[id] = fresh
  return fresh
}

const pushEvent = (list: number[], t: number): number[] => [t, ...list.filter((x) => x !== t)].slice(0, KEEP_EVENTS)

async function mutate(now: number, fn: (store: Store) => void): Promise<void> {
  await serial(async () => {
    const store = await readStore()
    fn(store)
    prune(store, now)
    await set(MEM_KEY, store)
  })
}

async function mutateCuisine(fn: (c: CuisineStats) => void): Promise<void> {
  await serial(async () => {
    const c = await readCuisine()
    fn(c)
    await set(CUISINE_KEY, c)
  })
}

// ── 事件 ────────────────────────────────────────────────────────────
/** 拿到口令的當下就記（不等使用者回報）。同一毫秒重複呼叫不會記兩筆。 */
export async function markShown(
  id: string,
  meta: { module: MemModule; brand?: string; cuisine?: string },
  now: number,
): Promise<void> {
  await mutate(now, (store) => {
    const e = entryOf(store, id, meta.module)
    e.module = meta.module
    e.shown = pushEvent(e.shown, now)
    if (meta.brand) e.brand = meta.brand
    if (meta.cuisine) e.cuisine = meta.cuisine
  })
}

/** 回報完成＝去過。細類偏好 a += 1。 */
export async function markDone(id: string, cuisine: string | undefined, now: number, module: MemModule = 'eat'): Promise<void> {
  await mutate(now, (store) => {
    const e = entryOf(store, id, module)
    // 累計次數：done 只留 10 筆，數「第 N 次」不能靠它。舊資料沒有 doneCount 就從 done.length 接著數。
    // 同一毫秒重複呼叫（pushEvent 會去重）不重複計。
    if (!e.done.includes(now)) e.doneCount = (e.doneCount ?? e.done.length) + 1
    e.done = pushEvent(e.done, now)
    if (cuisine) e.cuisine = cuisine
  })
  if (cuisine) await mutateCuisine((c) => { const [a, b] = c[cuisine] ?? [1, 1]; c[cuisine] = [a + 1, b] })
}

/** 店關了：24 小時內不再出現；**不動**細類偏好；不會把已經更長的封鎖縮短。 */
export async function markClosed(id: string, now: number, module: MemModule = 'eat'): Promise<void> {
  await mutate(now, (store) => {
    const e = entryOf(store, id, module)
    if (e.dislikeUntil === 'forever') return
    e.dislikeUntil = Math.max(typeof e.dislikeUntil === 'number' ? e.dislikeUntil : 0, now + CLOSED_MS)
  })
}

/** 又是這家（Round 4，Cross 2026-10-30「反覆推同一家」）：14 天不再出現；不會把已經更長的封鎖縮短。 */
export async function markRepeat(id: string, now: number, module: MemModule = 'eat'): Promise<void> {
  await mutate(now, (store) => {
    const e = entryOf(store, id, module)
    if (e.dislikeUntil === 'forever') return
    e.dislikeUntil = Math.max(typeof e.dislikeUntil === 'number' ? e.dislikeUntil : 0, now + REPEAT_MS)
  })
}

/** 今天不想吃這類：細類 b += 0.5；**不動**店。 */
export async function markNotThisKind(cuisine: string | undefined): Promise<void> {
  if (!cuisine) return
  await mutateCuisine((c) => { const [a, b] = c[cuisine] ?? [1, 1]; c[cuisine] = [a, b + 0.5] })
}

/** 這家不要再來：90 天；第 2 次標記 → 'forever'。 */
export async function markNeverAgain(id: string, now: number, module: MemModule = 'eat'): Promise<void> {
  await mutate(now, (store) => {
    const e = entryOf(store, id, module)
    e.dislikes += 1
    e.dislikeUntil = e.dislikes >= 2 ? 'forever' : Math.max(typeof e.dislikeUntil === 'number' ? e.dislikeUntil : 0, now + NEVER_AGAIN_MS)
  })
}

/** 列入愛店／取消。 */
export async function setFav(id: string, on: boolean, module: MemModule = 'eat'): Promise<void> {
  await mutate(Date.now(), (store) => {
    const e = entryOf(store, id, module)
    if (on) e.fav = true
    else delete e.fav
  })
}

// ── 讀取 ────────────────────────────────────────────────────────────
export async function getMem(id: string): Promise<PlaceMemEntry | undefined> {
  return (await readStore())[id]
}

export async function allMem(): Promise<PlaceMemEntry[]> {
  return Object.values(await readStore())
}

export async function cuisineStats(): Promise<CuisineStats> {
  return readCuisine()
}

/**
 * 送給伺服器的記憶摘要：只有 place_id、事件時間戳、品牌鍵、封鎖與愛店旗標。
 * 沒有店名、評分、座標（R3§3.3）。依最近事件時間排序，最多 limit 筆。
 * 只回該 module 的店；已過期的封鎖不送。
 *
 * R2-02：仍在封鎖中（含永久）與愛店**無條件先收**，不受 limit 擠掉——否則看過 200 家以上之後，
 * 使用者按過「不要再來」的店會從摘要消失、伺服器又派回去。剩餘額度才依最近事件補滿到 limit。
 * 每筆帶 dc＝累計完成次數（R2-03），伺服器的「第 N 次」靠它，不是靠只剩 5 筆的 dn。
 */
export async function memSummary(module: MemModule, now: number, limit = 200): Promise<PlaceMemSummary[]> {
  const list = (await allMem()).filter((e) => e.module === module)
  const byRecent = (a: PlaceMemEntry, b: PlaceMemEntry) => lastEventAt(b) - lastEventAt(a)
  const kept = (e: PlaceMemEntry) => isBlocked(e, now) || !!e.fav
  const must = list.filter(kept)
  const room = Math.max(0, limit - must.length)
  const rest = list.filter((e) => !kept(e) && (e.shown.length > 0 || e.done.length > 0)).sort(byRecent).slice(0, room)
  const rows = [...must, ...rest].sort(byRecent)
  return rows.map((e) => {
    const s: PlaceMemSummary = {
      id: e.id, sh: e.shown.slice(0, SUMMARY_EVENTS), dn: e.done.slice(0, SUMMARY_EVENTS), dc: e.doneCount ?? e.done.length,
    }
    if (isBlocked(e, now)) s.x = e.dislikeUntil as number | 'forever'
    if (e.fav) s.fav = true
    if (e.brand) s.b = e.brand
    return s
  })
}

/**
 * 今日行程用：仍在封鎖期的 place_id（不要再來 90 天／第 2 次永久、店關了 24 小時、
 * 又是這家 14 天）。生成／shuffle 前讀它，併進排除清單：核心班長 app 按的
 * 「不要再來」才會影響今日行程；清掉 localStorage 也不會讓店回來。
 * 模組不分 eat／rest：同一個 place_id，哪邊封鎖都算不要再來。
 */
export async function blockedPlaceIds(now: number): Promise<string[]> {
  const all = await allMem()
  return all.filter((e) => isBlocked(e, now)).map((e) => e.id)
}

/**
 * 本週新占領／回防（B1）。
 * 新占領 = 本週有 done，而且本週之前從沒 done 過的店；該店本週第一次 done 算新占領，
 * 同店本週其餘的 done 與「本週前就去過的店」的 done 都算回防。
 * weekStart 是 diary.weekStartOf 給的 ISO；只算 [weekStart, weekStart + 7 天) 且不晚於 now 的 done。
 */
export async function discoveryStats(weekStart: string, now: number = Date.now()): Promise<{ newPlaces: number; revisits: number }> {
  const start = new Date(weekStart).getTime()
  const end = Math.min(start + 7 * DAY, now + 1)
  let newPlaces = 0
  let revisits = 0
  for (const e of await allMem()) {
    const inWeek = e.done.filter((t) => t >= start && t < end).length
    if (inWeek === 0) continue
    const before = e.done.some((t) => t < start)
    if (before) revisits += inWeek
    else { newPlaces += 1; revisits += inWeek - 1 }
  }
  return { newPlaces, revisits }
}

// ── 匯出／匯入（Round 10 X4）──────────────────────────────────────────
// 記憶只在這支手機：換手機、清 Safari 網站資料、之後換 Capacitor 都會失憶。除錯畫面匯出一個 JSON，換過去再匯入。
// 檔案只有記憶本來就存的東西（place_id、我方時間戳、我方品牌鍵／細類鍵、封鎖、愛店），沒有店名、評分、座標。
// 匯入：整份驗過才動資料——壞一筆就整份不收，並說是第幾家、哪一欄；好檔跟現有記憶合併，不是覆蓋。

/** 記憶檔版本。欄位意思改了就加 1；匯入端拒收比自己新的版本。 */
export const MEM_FILE_VERSION = 1

export interface MemFile {
  app: 'decide'
  kind: 'place-memory'
  version: number
  exportedAt: string
  places: PlaceMemEntry[]
  cuisine: CuisineStats
}

export type MemImport = { ok: true; added: number; merged: number; total: number } | { ok: false; why: string }
type MemParse = { ok: true; places: PlaceMemEntry[]; cuisine: CuisineStats } | { ok: false; why: string }

export async function exportMem(now: number = Date.now()): Promise<MemFile> {
  const [places, cuisine] = await Promise.all([allMem(), readCuisine()])
  return { app: 'decide', kind: 'place-memory', version: MEM_FILE_VERSION, exportedAt: new Date(now).toISOString(), places, cuisine }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
/** 當物件鍵用的字串：'__proto__' 一賦值就改到原型，資料會無聲消失，一律不收。 */
const isKey = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && v !== '__proto__'
const isTimes = (v: unknown): v is number[] => Array.isArray(v) && v.every(isTime)
const newestFirst = (list: number[]): number[] => [...new Set(list)].sort((a, b) => b - a).slice(0, KEEP_EVENTS)

/** 驗一家店；回傳整理過的紀錄（只抄已知欄位，檔案裡多塞的欄位——例如店名——不會進記憶），或壞掉的欄位名。 */
function readEntry(v: unknown): PlaceMemEntry | string {
  if (!isObj(v)) return '不是一筆紀錄'
  const { id, module, shown, done, dislikes, doneCount, dislikeUntil, fav, brand, cuisine } = v
  if (!isKey(id, 300)) return 'id'
  if (module !== 'eat' && module !== 'rest') return 'module'
  if (!isTimes(shown)) return 'shown'
  if (!isTimes(done)) return 'done'
  if (!isCount(dislikes)) return 'dislikes'
  if (doneCount !== undefined && !isCount(doneCount)) return 'doneCount'
  if (dislikeUntil !== undefined && dislikeUntil !== 'forever' && !isTime(dislikeUntil)) return 'dislikeUntil'
  if (fav !== undefined && typeof fav !== 'boolean') return 'fav'
  if (brand !== undefined && !isKey(brand, 100)) return 'brand'
  if (cuisine !== undefined && !isKey(cuisine, 100)) return 'cuisine'
  const e: PlaceMemEntry = { id, module, shown: newestFirst(shown), done: newestFirst(done), dislikes }
  if (isCount(doneCount)) e.doneCount = doneCount
  if (dislikeUntil === 'forever' || isTime(dislikeUntil)) e.dislikeUntil = dislikeUntil
  if (fav === true) e.fav = true
  if (isKey(brand, 100)) e.brand = brand
  if (isKey(cuisine, 100)) e.cuisine = cuisine
  return e
}

function readCuisineStats(v: unknown): CuisineStats | string {
  if (v === undefined) return {}
  if (!isObj(v)) return '不是一張表'
  const out: CuisineStats = {}
  for (const [k, ab] of Object.entries(v)) {
    const ok = isKey(k, 100) && Array.isArray(ab) && ab.length === 2 && ab.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)
    if (!ok) return `「${k.slice(0, 20)}」`
    out[k] = [ab[0], ab[1]]
  }
  return out
}

/**
 * 驗整份記憶檔（純函式，不碰儲存）。記憶檔與一鍵匯出的試用紀錄（N4，記憶放在 memory 欄位）都收。
 * 任何一處不對就整份不收，回傳給人看的原因。
 */
export function parseMemFile(text: string): MemParse {
  const bad = (why: string): MemParse => ({ ok: false, why })
  let root: unknown
  try { root = JSON.parse(text) } catch { return bad('這不是 JSON 檔。') }
  if (!isObj(root) || root.app !== 'decide') return bad('這不是報告班長匯出的檔案。')
  const mem = root.kind === 'trial-log' ? root.memory : root
  if (root.kind === 'trial-log' && mem === undefined) return bad('這份試用紀錄裡沒有記憶（Round 10 以前匯出的）。')
  if (!isObj(mem) || mem.kind !== 'place-memory') return bad('這不是記憶檔。')
  const v = mem.version
  if (!isCount(v) || v < 1) return bad('檔案沒有版本號。')
  if (v > MEM_FILE_VERSION) return bad(`檔案是第 ${v} 版，這個 App 只認得到第 ${MEM_FILE_VERSION} 版。先更新 App 再匯入。`)
  if (!Array.isArray(mem.places)) return bad('檔案裡沒有店家清單。')
  const places: PlaceMemEntry[] = []
  const seen = new Set<string>()
  for (const [i, raw] of mem.places.entries()) {
    const e = readEntry(raw)
    if (typeof e === 'string') return bad(`第 ${i + 1} 家的資料壞了（${e}）。`)
    if (seen.has(e.id)) return bad(`第 ${i + 1} 家跟前面重複（同一個 place_id）。`)
    seen.add(e.id)
    places.push(e)
  }
  const cuisine = readCuisineStats(mem.cuisine)
  if (typeof cuisine === 'string') return bad(`細類統計壞了（${cuisine}）。`)
  return { ok: true, places, cuisine }
}

/**
 * 累計完成次數：取大的那邊，再加上小的那邊有、大的那邊不知道的完成。
 * 大的那邊只留最近 10 筆時間：比它最舊那筆還舊的，可能早就數過了，不加（同一份備份匯入兩次不會越數越多）。
 */
function mergeDoneCount(a: PlaceMemEntry, b: PlaceMemEntry): number {
  const ca = a.doneCount ?? a.done.length
  const cb = b.doneCount ?? b.done.length
  const [hi, lo, count] = ca >= cb ? [a, b, ca] : [b, a, cb]
  const floor = hi.done.length >= count ? -Infinity : Math.min(...hi.done)
  return count + lo.done.filter((t) => t > floor && !hi.done.includes(t)).length
}

/**
 * 同一個 place_id 的兩份記憶合成一份（同 place_id 取較新的時間）：
 * 時間戳合在一起留最新 10 筆；封鎖取比較久的（永久優先）；「不要再來」次數取大的；
 * 愛店兩邊有一邊是就算（寧可多一家愛店，不要匯入後愛店消失）；品牌鍵／細類鍵／模組跟最近有事件的那邊。
 * 合併兩次結果一樣，同一份檔匯入幾次都不會改變記憶。
 */
export function mergeEntry(cur: PlaceMemEntry, inc: PlaceMemEntry): PlaceMemEntry {
  const [newer, older] = lastEventAt(inc) > lastEventAt(cur) ? [inc, cur] : [cur, inc]
  const out: PlaceMemEntry = {
    id: cur.id,
    module: newer.module,
    shown: newestFirst([...cur.shown, ...inc.shown]),
    done: newestFirst([...cur.done, ...inc.done]),
    doneCount: mergeDoneCount(cur, inc),
    dislikes: Math.max(cur.dislikes, inc.dislikes),
  }
  if (cur.dislikeUntil === 'forever' || inc.dislikeUntil === 'forever') out.dislikeUntil = 'forever'
  else if (cur.dislikeUntil !== undefined || inc.dislikeUntil !== undefined) out.dislikeUntil = Math.max(cur.dislikeUntil ?? 0, inc.dislikeUntil ?? 0)
  if (cur.fav || inc.fav) out.fav = true
  const brand = newer.brand ?? older.brand
  if (brand) out.brand = brand
  const cuisine = newer.cuisine ?? older.cuisine
  if (cuisine) out.cuisine = cuisine
  return out
}

/** 細類偏好：兩個數各自取大的（計數只會往上加；取大的匯入幾次都一樣，不會越匯越偏）。 */
export function mergeCuisine(cur: CuisineStats, inc: CuisineStats): CuisineStats {
  const out: CuisineStats = { ...cur }
  for (const [k, [a, b]] of Object.entries(inc)) {
    const c = Object.hasOwn(out, k) ? out[k] : undefined
    out[k] = c ? [Math.max(c[0], a), Math.max(c[1], b)] : [a, b]
  }
  return out
}

/**
 * 匯入記憶檔：先驗（壞檔一個字都不寫），再跟現有記憶合併；店家記憶與細類統計同一個交易寫入，不會只寫一半。
 * 寫入失敗（無痕模式、空間滿了）會丟例外，由呼叫端顯示。
 */
export async function importMem(text: string, now: number = Date.now()): Promise<MemImport> {
  const parsed = parseMemFile(text)
  if (!parsed.ok) return parsed
  return serial(async () => {
    const [store, cuisine] = await Promise.all([readStore(), readCuisine()])
    let added = 0
    let merged = 0
    for (const e of parsed.places) {
      const cur = Object.hasOwn(store, e.id) ? store[e.id] : undefined
      if (cur) { store[e.id] = mergeEntry(cur, e); merged++ } else { store[e.id] = e; added++ }
    }
    prune(store, now)
    await setMany([[MEM_KEY, store], [CUISINE_KEY, mergeCuisine(cuisine, parsed.cuisine)]])
    return { ok: true as const, added, merged, total: Object.keys(store).length }
  })
}

/** 測試與「清除資料」用。 */
export async function clearPlaceMem(): Promise<void> {
  await serial(async () => { await del(MEM_KEY); await del(CUISINE_KEY) })
}
