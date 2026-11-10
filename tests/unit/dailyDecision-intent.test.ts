import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDaily, loadDaily, parseIntent, replanDaily, type DailyState } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const yesterdayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000))
const cand = (id: string, name: string) => ({ id, name, address: '渋谷', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.70, rating: 4.2, userRatingCount: 300 })

const state = (intent = ''): DailyState => ({ day: '2026-11-03', area: '澀谷', currentPlace: '宮下公園', intent, tasks: [], notes: [], avoid: [] })

describe('parseIntent：一日級意圖 → 站 id（封閉關鍵字表）', () => {
  it('gym：健身房／gym／ジム／筋トレ都命中', () => {
    expect(parseIntent('今天去健身房')).toEqual(['gym'])
    expect(parseIntent('go to the gym after work')).toEqual(['gym'])
    expect(parseIntent('ジムで筋トレ')).toEqual(['gym'])
    expect(parseIntent('早上運動')).toEqual(['gym'])
  })
  it('meal：拉麵／ramen／壽司／定食都命中（羅馬字不分大小寫）', () => {
    expect(parseIntent('想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('I want RAMEN for dinner')).toEqual(['meal'])
    expect(parseIntent('寿司が食べたい')).toEqual(['meal'])
    expect(parseIntent('午餐吃定食')).toEqual(['meal'])
    expect(parseIntent('晚餐吃什麼')).toEqual(['meal'])
  })
  it('creative：展覽／美術館／art 都命中探索站 id（咖啡站不再共站）', () => {
    expect(parseIntent('去看展覽')).toEqual(['creative'])
    expect(parseIntent('美術館に行きたい')).toEqual(['creative'])
    expect(parseIntent('an art exhibition')).toEqual(['creative'])
    expect(parseIntent('アートを見に行く')).toEqual(['creative'])
  })
  it('coffee：咖啡／カフェ／coffee 命中咖啡站 id（不再是 creative 種類）', () => {
    expect(parseIntent('想喝咖啡')).toEqual(['coffee'])
    expect(parseIntent('カフェで休憩')).toEqual(['coffee', 'rest'])
    expect(parseIntent('have a coffee')).toEqual(['coffee'])
  })
  it('shopping：購物／買い物／shopping 都命中', () => {
    expect(parseIntent('去購物')).toEqual(['shopping'])
    expect(parseIntent('買い物に行く')).toEqual(['shopping'])
    expect(parseIntent('shopping for clothes')).toEqual(['shopping'])
    expect(parseIntent('想買東西')).toEqual(['shopping'])
  })
  it('rest：休息／休憩命中', () => {
    expect(parseIntent('想休息一下')).toEqual(['rest'])
    expect(parseIntent('休憩したい')).toEqual(['rest'])
  })
  it('無命中：空字串／隨便／純地名都回 []（未知→走預設，不得猜測）', () => {
    expect(parseIntent('')).toEqual([])
    expect(parseIntent('   ')).toEqual([])
    expect(parseIntent('隨便')).toEqual([])
    expect(parseIntent('下北澤')).toEqual([])
    expect(parseIntent('今天天氣很好')).toEqual([])
  })
  it('模糊／反例：裸字「展」不在表內，發展不命中；art 不命中 party／heart／cart', () => {
    expect(parseIntent('發展')).toEqual([])
    expect(parseIntent('party tonight')).toEqual([])
    expect(parseIntent('heart')).toEqual([])
    expect(parseIntent('push the cart')).toEqual([])
    expect(parseIntent('ramenya')).toEqual([])
  })
  it('多命中：按 catalog 順序回傳站 id（meal 在 creative 前，coffee 在 shopping 前）', () => {
    expect(parseIntent('我今天想去吃拉麵然後看展覽')).toEqual(['meal', 'creative'])
    expect(parseIntent('健身完去喝咖啡')).toEqual(['gym', 'coffee'])
    expect(parseIntent('去看展覽然後喝咖啡')).toEqual(['creative', 'coffee'])
  })
})

describe('buildDaily：意圖驅動（mode 已刪）', () => {
  it('意圖「想吃拉麵」→ meal 站 specified 且 place＝原文，其餘站為預設', () => {
    const tasks = buildDaily(state('想吃拉麵'))
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(true)
    expect(meal.place).toBe('想吃拉麵')
    expect(tasks.filter(t => t.id !== 'meal').every(t => !t.specified && t.place === undefined)).toBe(true)
    // 其餘站是目錄預設標題，不是意圖原文
    expect(tasks.find(t => t.id === 'gym')?.title).toContain('FIT-EASY')
  })
  it('無意圖 → 創意預設 order（含 creative 站），沒有站被指定', () => {
    const tasks = buildDaily(state(''))
    expect(tasks.map(t => t.id)).toEqual(['gym', 'meal', 'creative', 'coffee', 'shopping', 'rest'])
    expect(tasks.every(t => !t.specified)).toBe(true)
  })
  it('意圖換了 → 舊候選清掉（eta／departure／travelMin／conflict 一起清）', () => {
    const prev = buildDaily(state('想吃拉麵')).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30, conflict: '時間衝突' }
      : t)
    const tasks = buildDaily({ ...state('想吃壽司'), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(true)
    expect(meal.place).toBe('想吃壽司')
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
    expect(meal.departure).toBeUndefined()
    expect(meal.travelMin).toBeUndefined()
    expect(meal.conflict).toBeUndefined()
  })
  it('同一意圖重跑 → 已找到的候選保留', () => {
    const prev = buildDaily(state('想吃拉麵')).map(t => t.id === 'meal'
      ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
      : t)
    const tasks = buildDaily({ ...state('想吃拉麵'), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.travelMin).toBe(30)
  })
  it('展覽意圖只指定探索站：咖啡站維持預設（不再共站）', () => {
    const tasks = buildDaily(state('去看展覽'))
    expect(tasks.find(t => t.id === 'creative')?.specified).toBe(true)
    expect(tasks.find(t => t.id === 'creative')?.place).toBe('去看展覽')
    expect(tasks.find(t => t.id === 'coffee')?.specified).toBeFalsy()
    expect(tasks.find(t => t.id === 'coffee')?.place).toBeUndefined()
  })
  it('咖啡意圖只指定咖啡站：探索站維持預設（不再共站）', () => {
    const tasks = buildDaily(state('想喝咖啡'))
    expect(tasks.find(t => t.id === 'coffee')?.specified).toBe(true)
    expect(tasks.find(t => t.id === 'coffee')?.place).toBe('想喝咖啡')
    expect(tasks.find(t => t.id === 'creative')?.specified).toBeFalsy()
    expect(tasks.find(t => t.id === 'creative')?.place).toBeUndefined()
  })
  it('replanDaily：已完成任務保留，意圖命中的站 specified', () => {
    const s = state('想吃拉麵')
    s.tasks = buildDaily(s).map(t => t.id === 'gym' ? { ...t, done: true } : t)
    const result = replanDaily(s)
    expect(result.tasks.find(t => t.id === 'gym')?.done).toBe(true)
    expect(result.tasks.find(t => t.id === 'meal')?.specified).toBe(true)
    expect(result.tasks.find(t => t.id === 'meal')?.place).toBe('想吃拉麵')
    expect(result.tasks.some(t => t.id === 'creative')).toBe(true)
  })
  it('avoid 優先於意圖：略過的站不出現', () => {
    const tasks = buildDaily({ ...state('想吃拉麵'), avoid: ['meal'] })
    expect(tasks.some(t => t.id === 'meal')).toBe(false)
  })
})

describe('buildDaily：逐站指定優先於日意圖（intentSpecified 標記）', () => {
  // 日意圖指定的前一站：經 buildDaily 產生，帶 intentSpecified 標記
  const intentPrev = (intent: string) => buildDaily(state(intent)).map(t => t.id === 'meal'
    ? { ...t, candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
    : t)
  // 逐站指定的前一站：使用者親手指定「一蘭」，無 intentSpecified 標記
  const perStopPrev = () => buildDaily(state('')).map(t => t.id === 'meal'
    ? { ...t, specified: true, place: '一蘭', candidate: cand('m1', '一蘭'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
    : t)
  it('逐站指定「一蘭」後輸入日意圖「想吃壽司」→ meal 站仍是一蘭、候選與 eta 保留', () => {
    const tasks = buildDaily({ ...state('想吃壽司'), tasks: perStopPrev() })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('一蘭')
    expect(meal.specified).toBe(true)
    expect(meal.intentSpecified).toBeFalsy()
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.travelMin).toBe(30)
  })
  it('日意圖站換意圖 → place 更新、舊候選清掉、標記仍在', () => {
    const tasks = buildDaily({ ...state('想吃壽司'), tasks: intentPrev('想吃拉麵') })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('想吃壽司')
    expect(meal.specified).toBe(true)
    expect(meal.intentSpecified).toBe(true)
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
  })
  it('同一意圖重跑 → 候選保留、標記仍在', () => {
    const tasks = buildDaily({ ...state('想吃拉麵'), tasks: intentPrev('想吃拉麵') })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.intentSpecified).toBe(true)
  })
  it('意圖清空 → 日意圖站回復預設、逐站指定站不受影響', () => {
    const prev = intentPrev('想吃拉麵').map(t => t.id === 'coffee'
      ? { ...t, specified: true, place: 'Fuglen Tokyo', candidate: cand('c1', 'Fuglen Tokyo') }
      : t)
    const tasks = buildDaily({ ...state(''), tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBeFalsy()
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBeFalsy()
    const coffee = tasks.find(t => t.id === 'coffee')!
    expect(coffee.specified).toBe(true)
    expect(coffee.place).toBe('Fuglen Tokyo')
    expect(coffee.candidate?.id).toBe('c1')
  })
  it('意圖改成不再命中該站 → 該站回復預設（舊意圖的地點不殘留）', () => {
    const tasks = buildDaily({ ...state('去看展覽'), tasks: intentPrev('想吃拉麵') })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBeFalsy()
    expect(meal.place).toBeUndefined()
    expect(meal.candidate).toBeUndefined()
    expect(meal.intentSpecified).toBeFalsy()
    expect(tasks.find(t => t.id === 'creative')?.place).toBe('去看展覽')
  })
  it('舊存檔無標記的指定站視為逐站指定：日意圖不覆蓋（相容規則）', () => {
    const prev = buildDaily(state('')).map(t => t.id === 'meal'
      ? { ...t, specified: true, place: '某定食店', candidate: cand('m1', '定食店') }
      : t)
    const tasks = buildDaily({ ...state('想吃壽司'), tasks: prev })
    expect(tasks.find(t => t.id === 'meal')?.place).toBe('某定食店')
    expect(tasks.find(t => t.id === 'meal')?.candidate?.id).toBe('m1')
  })
})

describe('loadDaily：舊存檔移轉（mode 剝掉）＋ 意圖跨天歸零', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })
  const seed = (raw: Record<string, unknown>) => {
    localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [], ...raw }))
  }
  it('舊存檔 mode:practical：任務完整保留、intent 為空、mode 欄位剝掉', () => {
    // 寫實的舊存檔形狀：只有 custom／locked／done／rest／有候選的站才會活過
    // loadDaily 的過濾器（既有行為）；無候選的自動站本來就不會留在存檔裡。
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
    expect(out.intent).toBe('')
    expect(JSON.stringify(out)).not.toContain('"mode"')
    expect('mode' in out).toBe(false)
    // 後續生成走創意預設 order（含 creative 站）
    expect(buildDaily(out).map(t => t.id)).toEqual(['gym', 'meal', 'creative', 'coffee', 'shopping', 'rest'])
  })
  it('同一天：intent 照留', () => {
    seed({ intent: '想吃拉麵', tasks: [] })
    expect(loadDaily().intent).toBe('想吃拉麵')
  })
  it('intent 只接受字串、截到 120 字', () => {
    seed({ intent: '拉'.repeat(200), tasks: [] })
    expect(loadDaily().intent).toHaveLength(120)
    seed({ intent: 123, tasks: [] })
    expect(loadDaily().intent).toBe('')
  })
  it('換天存檔：intent 歸零、tasks 清空', () => {
    const tasks = buildDaily(state('')).map(t => t.id === 'meal' ? { ...t, candidate: cand('m1', '定食店') } : t)
    seed({ day: yesterdayTokyo(), mode: 'practical', intent: '想吃拉麵', tasks, seen: { meal: ['old-1'] } })
    const out = loadDaily()
    expect(out.intent).toBe('')
    expect(out.tasks).toEqual([])
    expect(out.seen).toEqual({})
    expect(JSON.stringify(out)).not.toContain('"mode"')
  })
})
