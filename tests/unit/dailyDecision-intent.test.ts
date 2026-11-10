import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDaily, copyIntent, EMPTY_INTENT, intentSummaryText, loadDaily, normalizeIntent, replanDaily, routeProposal, sameIntent, type DailyIntent, type DailyState } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const yesterdayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000))
const cand = (id: string, name: string) => ({ id, name, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70, rating: 4.2, userRatingCount: 300 })

const emptyIntent = (): DailyIntent => ({ ...EMPTY_INTENT, activities: [] })
const mkIntent = (destination = '', destinationStation: DailyIntent['destinationStation'] = '', activities: DailyIntent['activities'] = []): DailyIntent => ({ destination, destinationStation, activities })
const state = (intent: DailyIntent = emptyIntent(), appliedIntent: DailyIntent = emptyIntent()): DailyState => ({ day: '2026-11-03', area: '澀谷', currentPlace: '宮下公園', intent, appliedIntent, tasks: [], notes: [], avoid: [] })
/** 搜尋後形狀的 meal 前一站：place 是店家地址、有候選、標記在（§5.3 的 fixture）。 */
const searchedMealPrev = (intent: DailyIntent) => buildDaily(state(intent)).map(t => t.id === 'meal'
  ? { ...t, place: '東京都渋谷区道玄坂1-2-3', candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
  : t)

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('G1 — 形狀與正規化（normalizeIntent／sameIntent／copyIntent）', () => {
  it('defaults：intent 與 appliedIntent 皆為空意圖，且兩者的 activities 是不同陣列參照', () => {
    const a = loadDaily()
    expect(a.intent).toEqual({ destination: '', destinationStation: '', activities: [] })
    expect(a.appliedIntent).toEqual({ destination: '', destinationStation: '', activities: [] })
    expect(a.intent.activities).not.toBe(a.appliedIntent.activities)
    a.intent.activities.push('gym')
    expect(loadDaily().intent.activities).toEqual([])
    expect(loadDaily().appliedIntent.activities).toEqual([])
  })
  it('destination trim＋截 120 字', () => {
    expect(normalizeIntent(mkIntent('  一蘭  ')).destination).toBe('一蘭')
    expect(normalizeIntent(mkIntent('拉'.repeat(121))).destination).toHaveLength(120)
    expect(normalizeIntent(mkIntent('拉'.repeat(120))).destination).toHaveLength(120)
  })
  it('activities 過濾非法 id、去重、按 catalog 順序存放', () => {
    const out = normalizeIntent({ destination: '', destinationStation: '', activities: ['shopping', 'gym', 'gym', 'rest', 'foo', ''] as unknown as DailyIntent['activities'] })
    expect(out.activities).toEqual(['gym', 'shopping'])
  })
  it('不變量：目的地為空時站必為空字串', () => {
    expect(normalizeIntent(mkIntent('  ', 'meal', [])).destinationStation).toBe('')
    expect(normalizeIntent(mkIntent('', 'meal', ['meal'])).destinationStation).toBe('')
  })
  it('便利預設：目的地非空、站未選、恰好一個活動 → 站預設為該活動', () => {
    expect(normalizeIntent(mkIntent('一蘭', '', ['meal'])).destinationStation).toBe('meal')
  })
  it('便利預設不觸發：多活動／零活動／站已有值／目的地為空', () => {
    expect(normalizeIntent(mkIntent('一蘭', '', ['meal', 'coffee'])).destinationStation).toBe('')
    expect(normalizeIntent(mkIntent('一蘭', '', [])).destinationStation).toBe('')
    expect(normalizeIntent(mkIntent('一蘭', 'coffee', ['meal'])).destinationStation).toBe('coffee')
    expect(normalizeIntent(mkIntent('', '', ['meal'])).destinationStation).toBe('')
  })
  it('sameIntent：三個欄位都相等才相等；活動只比集合、不看順序', () => {
    const base = mkIntent('一蘭', 'meal', ['meal'])
    expect(sameIntent(base, mkIntent('一蘭', 'meal', ['meal']))).toBe(true)
    expect(sameIntent(base, mkIntent('壽司', 'meal', ['meal']))).toBe(false)
    expect(sameIntent(base, mkIntent('一蘭', 'coffee', ['meal']))).toBe(false)
    expect(sameIntent(base, mkIntent('一蘭', 'meal', ['meal', 'coffee']))).toBe(false)
    expect(sameIntent(mkIntent('一蘭', 'meal', ['meal', 'coffee']), mkIntent('一蘭', 'meal', ['coffee', 'meal']))).toBe(true)
    expect(sameIntent(emptyIntent(), emptyIntent())).toBe(true)
  })
  it('copyIntent：回傳新物件、新陣列；改複製的陣列不影響原物件', () => {
    const src = mkIntent('一蘭', 'meal', ['meal', 'coffee'])
    const copy = copyIntent(src)
    expect(copy).toEqual(src)
    expect(copy).not.toBe(src)
    expect(copy.activities).not.toBe(src.activities)
    copy.activities.push('gym')
    expect(src.activities).toEqual(['meal', 'coffee'])
  })
})

describe('G1 — intentSummaryText：確認摘要逐字回饋', () => {
  it('空意圖', () => {
    expect(intentSummaryText(emptyIntent())).toBe('今天沒有指定目的地或活動，留空就隨興探索。')
  })
  it('只有活動：按 catalog 順序列出動詞', () => {
    expect(intentSummaryText(mkIntent('', '', ['coffee', 'meal']))).toBe('想做：吃飯、喝咖啡')
  })
  it('目的地已附站（無其他活動，或其他活動＝目的地站本身）', () => {
    expect(intentSummaryText(mkIntent('一蘭', 'meal', []))).toBe('目的地：一蘭 → 午餐站')
    expect(intentSummaryText(mkIntent('一蘭', 'meal', ['meal']))).toBe('目的地：一蘭 → 午餐站')
  })
  it('目的地已附站＋其他活動：「還想」列出排除目的地站的其餘活動', () => {
    expect(intentSummaryText(mkIntent('一蘭', 'meal', ['meal', 'coffee']))).toBe('目的地：一蘭 → 午餐站；還想：喝咖啡')
  })
  it('目的地未附站（惰性）：警告＋活動（多活動／零活動才到得了惰性狀態）', () => {
    expect(intentSummaryText(mkIntent('一蘭', '', ['meal', 'coffee']))).toBe('目的地：一蘭（請選是哪一站，否則不會進路線）；想做：吃飯、喝咖啡')
    expect(intentSummaryText(mkIntent('一蘭', '', []))).toBe('目的地：一蘭（請選是哪一站，否則不會進路線）')
  })
})

describe('G2 — buildDaily：目的地附著', () => {
  it('目的地附到所選站：該站 specified＋intentSpecified＋place＝原文，其餘站不受影響', () => {
    const tasks = buildDaily(state(mkIntent('一蘭', 'meal', ['meal'])))
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(true)
    expect(meal.intentSpecified).toBe(true)
    expect(meal.place).toBe('一蘭')
    expect(tasks.filter(t => t.id !== 'meal').every(t => !t.specified && t.place === undefined)).toBe(true)
    expect(tasks.find(t => t.id === 'gym')?.title).toContain('FIT-EASY')
  })
  it('目的地原文逐字進 place：舊解析器會誤判的字串也不經任何關鍵字處理', () => {
    const tasks = buildDaily(state(mkIntent('拉麵不要', 'meal', ['meal'])))
    expect(tasks.find(t => t.id === 'meal')?.place).toBe('拉麵不要')
    expect(tasks.find(t => t.id === 'meal')?.specified).toBe(true)
  })
  it('目的地-only（零活動、站已選）：目的地站指定成功，其餘站維持預設', () => {
    const tasks = buildDaily(state(mkIntent('一蘭', 'meal', [])))
    expect(tasks.find(t => t.id === 'meal')?.specified).toBe(true)
    expect(tasks.find(t => t.id === 'meal')?.place).toBe('一蘭')
    expect(tasks.filter(t => t.id !== 'meal').every(t => !t.specified)).toBe(true)
  })
  it('目的地未選站：目的地文字在 state 裡，但 buildDaily 沒有任何站被指定（惰性）', () => {
    const tasks = buildDaily(state(mkIntent('一蘭', '', ['meal', 'coffee'])))
    expect(tasks.every(t => !t.specified)).toBe(true)
    expect(tasks.every(t => t.place === undefined)).toBe(true)
  })
  it('多活動＋目的地：只有目的地站被指定，其他被選活動站是自動站', () => {
    const tasks = buildDaily(state(mkIntent('一蘭', 'meal', ['meal', 'coffee', 'shopping'])))
    expect(tasks.find(t => t.id === 'meal')?.specified).toBe(true)
    expect(tasks.find(t => t.id === 'coffee')?.specified).toBeFalsy()
    expect(tasks.find(t => t.id === 'coffee')?.place).toBeUndefined()
    expect(tasks.find(t => t.id === 'shopping')?.specified).toBeFalsy()
    expect(tasks.find(t => t.id === 'shopping')?.place).toBeUndefined()
  })
  it('目的地站改選：舊站回復預設（place／候選清掉），新站指定', () => {
    const prev = buildDaily(state(mkIntent('一蘭', 'meal', ['meal']))).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達' }
      : t)
    const tasks = buildDaily({ ...state(mkIntent('一蘭', 'coffee', ['meal', 'coffee'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBeFalsy()
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBeFalsy()
    const coffee = tasks.find(t => t.id === 'coffee')!
    expect(coffee.specified).toBe(true)
    expect(coffee.place).toBe('一蘭')
  })
  it('目的地清空：原目的地站回復預設', () => {
    const prev = buildDaily(state(mkIntent('一蘭', 'meal', ['meal']))).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達' }
      : t)
    const tasks = buildDaily({ ...state(mkIntent('', '', [])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBeFalsy()
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBeFalsy()
  })
  it('逐站指定優先：某站已逐站指定，目的地站指向同一站時，該站保持逐站的地點與候選不變', () => {
    const perStopPrev = () => buildDaily(state()).map(t => t.id === 'meal'
      ? { ...t, specified: true, place: '一蘭', candidate: cand('m1', '一蘭'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
      : t)
    const tasks = buildDaily({ ...state(mkIntent('壽司', 'meal', ['meal'])), tasks: perStopPrev() })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('一蘭')
    expect(meal.specified).toBe(true)
    expect(meal.intentSpecified).toBeFalsy()
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.travelMin).toBe(30)
  })
  it('逐站輸入框清空後：該站回到意圖控制（經一次 replanDaily，目的地重新附著）', () => {
    const prev = buildDaily(state(mkIntent('壽司', 'meal', ['meal']))).map(t => t.id === 'meal'
      ? { ...t, specified: false, place: '', intentSpecified: undefined, candidate: undefined }
      : t)
    const result = replanDaily({ ...state(mkIntent('一蘭', 'meal', ['meal'])), tasks: prev })
    expect(result.tasks.find(t => t.id === 'meal')?.specified).toBe(true)
    expect(result.tasks.find(t => t.id === 'meal')?.place).toBe('一蘭')
  })
  it('rest 永遠不是指定目標：髒意圖經正規化後 rest 站 specified falsy、place undefined', () => {
    const dirty = normalizeIntent({ destination: '一蘭', destinationStation: 'rest', activities: ['rest'] } as unknown as DailyIntent)
    expect(dirty.destinationStation).toBe('')
    expect(dirty.activities).toEqual([])
    const tasks = buildDaily(state(dirty))
    const rest = tasks.find(t => t.id === 'rest')!
    expect(rest.specified).toBeFalsy()
    expect(rest.place).toBeUndefined()
    expect(rest.title).toBe('散步回家、休息與晚餐')
    const withDest = buildDaily(state(mkIntent('一蘭', 'meal', ['meal'])))
    expect(withDest.find(t => t.id === 'rest')?.specified).toBeFalsy()
    expect(withDest.find(t => t.id === 'rest')?.place).toBeUndefined()
  })
})

describe('G3 — buildDaily：活動語義', () => {
  it('被選活動站（無目的地）是自動站：specified falsy、place undefined', () => {
    const tasks = buildDaily(state(mkIntent('', '', ['coffee'])))
    const coffee = tasks.find(t => t.id === 'coffee')!
    expect(coffee.specified).toBeFalsy()
    expect(coffee.place).toBeUndefined()
  })
  it('未被選的站留在預設路線裡（不是被刪掉）：只勾一個活動時，6 站仍全在', () => {
    const tasks = buildDaily(state(mkIntent('', '', ['meal'])))
    expect(tasks.map(t => t.id)).toEqual(['gym', 'meal', 'creative', 'coffee', 'shopping', 'rest'])
    expect(tasks.every(t => !t.specified)).toBe(true)
  })
  it('avoid 優先於意圖：略過的站不出現', () => {
    const tasks = buildDaily({ ...state(mkIntent('一蘭', 'meal', ['meal'])), avoid: ['meal'] })
    expect(tasks.some(t => t.id === 'meal')).toBe(false)
  })
  it('目的地站從「目的地站」變回「普通活動站」：目的地改附別站後，原站活動仍勾著 → 變回自動站', () => {
    const prev = buildDaily(state(mkIntent('一蘭', 'meal', ['meal', 'coffee']))).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
      : t)
    const tasks = buildDaily({ ...state(mkIntent('一蘭', 'coffee', ['meal', 'coffee'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(false)
    expect(meal.intentSpecified).toBe(false)
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
  })
  it('意圖不再覆蓋：目的地改附別站且該站活動取消後，原目的地站回復目錄預設', () => {
    const prev = buildDaily(state(mkIntent('一蘭', 'meal', ['meal']))).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達' }
      : t)
    const tasks = buildDaily({ ...state(mkIntent('Fuglen', 'coffee', ['coffee'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBeFalsy()
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBeFalsy()
    expect(meal.title).toBe('澀谷｜一人友善的日式定食')
    expect(tasks.find(t => t.id === 'coffee')?.place).toBe('Fuglen')
  })
})

describe('G4 — appliedIntent 保留', () => {
  it('搜尋後形狀保留：同一意圖重跑 → 候選與 eta 保留、place 留著店家地址', () => {
    const intent = mkIntent('一蘭', 'meal', ['meal'])
    const tasks = buildDaily({ ...state(intent, intent), tasks: searchedMealPrev(intent) })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.travelMin).toBe(30)
    expect(meal.place).toBe('東京都渋谷区道玄坂1-2-3')
    expect(meal.intentSpecified).toBe(true)
  })
  it('搜尋前形狀對照：place＝目的地原文、無候選、同一意圖重跑 → 指定成功', () => {
    const intent = mkIntent('一蘭', 'meal', ['meal'])
    const prev = buildDaily(state(intent))
    const tasks = buildDaily({ ...state(intent, intent), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(true)
    expect(meal.place).toBe('一蘭')
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBe(true)
  })
  it('意圖換了 → 清掉：目的地文字改了', () => {
    const prev = searchedMealPrev(mkIntent('一蘭', 'meal', ['meal']))
    const tasks = buildDaily({ ...state(mkIntent('壽司', 'meal', ['meal']), mkIntent('一蘭', 'meal', ['meal'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('壽司')
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
  })
  it('意圖換了 → 清掉：目的地站改了', () => {
    const prev = searchedMealPrev(mkIntent('一蘭', 'meal', ['meal']))
    const tasks = buildDaily({ ...state(mkIntent('一蘭', 'coffee', ['meal', 'coffee']), mkIntent('一蘭', 'meal', ['meal'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
  })
  it('意圖換了 → 清掉：只改一個無關活動的勾選（目的地與站都不變）', () => {
    const prev = searchedMealPrev(mkIntent('一蘭', 'meal', ['meal']))
    const tasks = buildDaily({ ...state(mkIntent('一蘭', 'meal', ['meal', 'coffee']), mkIntent('一蘭', 'meal', ['meal'])), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
    expect(meal.place).toBe('一蘭')
  })
  it('replanDaily：appliedIntent 跟著當次意圖走（下次重跑比的就是它）', () => {
    const result = replanDaily(state(mkIntent('一蘭', 'meal', ['meal'])))
    expect(result.appliedIntent).toEqual(mkIntent('一蘭', 'meal', ['meal']))
    expect(result.appliedIntent.activities).not.toBe(result.intent.activities)
    expect(result.tasks.find(t => t.id === 'meal')?.place).toBe('一蘭')
    const changed = replanDaily({ ...result, intent: mkIntent('Fuglen', 'coffee', ['coffee']) })
    expect(changed.appliedIntent).toEqual(mkIntent('Fuglen', 'coffee', ['coffee']))
    expect(changed.tasks.find(t => t.id === 'coffee')?.place).toBe('Fuglen')
  })
  it('routeProposal 兩分支皆寫入 appliedIntent：空任務走 buildDaily 分支、有任務走 replanDaily 分支', () => {
    const intent = mkIntent('一蘭', 'meal', ['meal'])
    const empty = routeProposal(state(intent))
    expect(empty.appliedIntent).toEqual(intent)
    expect(empty.tasks.find(t => t.id === 'meal')?.place).toBe('一蘭')
    const withTasks = routeProposal({ ...state(intent), tasks: buildDaily(state(intent)) })
    expect(withTasks.appliedIntent).toEqual(intent)
    expect(withTasks.tasks.find(t => t.id === 'meal')?.place).toBe('一蘭')
  })
})

describe('G5 — loadDaily：舊存檔移轉', () => {
  const seed = (raw: Record<string, unknown>) => {
    localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], ...raw }))
  }
  it('同日保留：結構化意圖與 appliedIntent 照留（正規化後相等）', () => {
    seed({ intent: mkIntent('一蘭', 'meal', ['meal']), appliedIntent: mkIntent('一蘭', 'meal', ['meal']), tasks: [] })
    const out = loadDaily()
    expect(out.intent).toEqual(mkIntent('一蘭', 'meal', ['meal']))
    expect(out.appliedIntent).toEqual(mkIntent('一蘭', 'meal', ['meal']))
  })
  it('舊存檔沒有 appliedIntent：沿用當日 intent（移轉——任務本來就是那份意圖長出來的）', () => {
    seed({ intent: mkIntent('一蘭', 'meal', ['meal']), tasks: [] })
    expect(loadDaily().appliedIntent).toEqual(mkIntent('一蘭', 'meal', ['meal']))
  })
  it('換天歸零：意圖與 appliedIntent 皆空，任務清空', () => {
    const tasks = buildDaily(state()).map(t => t.id === 'meal' ? { ...t, candidate: cand('m1', '定食店') } : t)
    seed({ day: yesterdayTokyo(), intent: mkIntent('一蘭', 'meal', ['meal']), appliedIntent: mkIntent('一蘭', 'meal', ['meal']), tasks, seen: { meal: ['old-1'] } })
    const out = loadDaily()
    expect(out.intent).toEqual(emptyIntent())
    expect(out.appliedIntent).toEqual(emptyIntent())
    expect(out.tasks).toEqual([])
    expect(out.seen).toEqual({})
  })
  it('舊字串意圖：意圖丟棄為空；intentSpecified 站降級為普通 specified（place 原文、候選留著、標記拿掉）', () => {
    const gym = { id: 'gym', title: 'FIT-EASY', minutes: 80, kind: 'gym', done: true, candidate: cand('g1', 'FIT-EASY 渋谷店') }
    const meal = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, intentSpecified: true, place: '想吃拉麵', candidate: cand('m1', '拉麵店') }
    seed({ intent: '想吃拉麵', appliedIntent: '想吃拉麵', tasks: [gym, meal] })
    const out = loadDaily()
    expect(out.intent).toEqual(emptyIntent())
    expect(out.appliedIntent).toEqual(emptyIntent())
    expect(out.tasks.map(t => t.id)).toEqual(['gym', 'meal'])
    const loadedMeal = out.tasks.find(t => t.id === 'meal')!
    expect(loadedMeal.specified).toBe(true)
    expect(loadedMeal.place).toBe('想吃拉麵')
    expect(loadedMeal.candidate?.id).toBe('m1')
    expect(loadedMeal.intentSpecified).toBeFalsy()
    expect(out.tasks.find(t => t.id === 'gym')?.candidate?.id).toBe('g1')
  })
  it('舊存檔 mode:practical：任務完整保留、intent 為空、mode 欄位剝掉', () => {
    const gym = { id: 'gym', title: 'FIT-EASY', minutes: 80, kind: 'gym', done: true, candidate: cand('g1', 'FIT-EASY 渋谷店') }
    const meal = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, candidate: cand('m1', '定食店') }
    const rest = { id: 'rest', title: '散步回家', minutes: 75, kind: 'rest', done: false }
    seed({ mode: 'practical', tasks: [gym, meal, rest], seen: { meal: ['old-1'] }, disliked: ['d1'] })
    const out = loadDaily()
    expect(out.tasks.map(t => t.id)).toEqual(['gym', 'meal', 'rest'])
    expect(out.tasks.find(t => t.id === 'meal')?.candidate?.id).toBe('m1')
    expect(out.tasks.find(t => t.id === 'gym')?.candidate?.id).toBe('g1')
    expect(out.seen).toEqual({ meal: ['old-1'] })
    expect(out.disliked).toEqual(['d1'])
    expect(out.intent).toEqual(emptyIntent())
    expect(JSON.stringify(out)).not.toContain('"mode"')
    expect('mode' in out).toBe(false)
    expect(buildDaily(out).map(t => t.id)).toEqual(['gym', 'meal', 'creative', 'coffee', 'shopping', 'rest'])
  })
  it('髒意圖驗證：intent 為數字／null／陣列 → 空意圖', () => {
    seed({ intent: 123, tasks: [] })
    expect(loadDaily().intent).toEqual(emptyIntent())
    seed({ intent: null, tasks: [] })
    expect(loadDaily().intent).toEqual(emptyIntent())
    seed({ intent: ['meal'], tasks: [] })
    expect(loadDaily().intent).toEqual(emptyIntent())
  })
  it('髒意圖驗證：activities 含 rest／非法字串 → 過濾；destinationStation 為 rest／非法值 → 空字串（再由便利預設補上）', () => {
    seed({ intent: { destination: '一蘭', destinationStation: 'rest', activities: ['rest', 'meal', 'nope'] }, tasks: [] })
    expect(loadDaily().intent).toEqual(mkIntent('一蘭', 'meal', ['meal']))
    seed({ intent: { destination: '一蘭', destinationStation: 'nope', activities: [] }, tasks: [] })
    expect(loadDaily().intent).toEqual(mkIntent('一蘭', '', []))
  })
  it('舊存檔無 intent 欄位（mode 時代）：意圖為空，無標記可剝，行程原樣', () => {
    const meal = { id: 'meal', title: '定食', minutes: 45, kind: 'meal', done: false, specified: true, place: '某定食店', candidate: cand('m1', '定食店') }
    seed({ mode: 'practical', tasks: [meal] })
    const out = loadDaily()
    expect(out.intent).toEqual(emptyIntent())
    expect(out.tasks.map(t => t.id)).toEqual(['meal'])
    expect(out.tasks.find(t => t.id === 'meal')?.specified).toBe(true)
    expect(out.tasks.find(t => t.id === 'meal')?.place).toBe('某定食店')
    expect(out.tasks.find(t => t.id === 'meal')?.candidate?.id).toBe('m1')
  })
})
