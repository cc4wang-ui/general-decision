// guide-1115（前端）：手動排序、輸入（輸入法組字不丟字）、探索主題輪替、沒去過的區域、理由行、舊存檔相容。
// 契約：runs/guide-1115/contract.md STOP 1–6。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bodyText, urlText } from './mockFetch.ts'
vi.mock('../../src/placeMem.ts', () => ({
  blockedPlaceIds: () => Promise.resolve([]),
  markNeverAgain: async () => {},
  markDailyDislike: vi.fn(async () => {}),
  migrateDailyDislike: vi.fn(async () => {}),
  clearDislike: vi.fn(() => Promise.resolve({ sharedRemains: false })),
}))
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyUserOrder, clearStaleCandidate, DailyDecision, exploreReason, fillThemeArea, loadDaily, moveTask, replanDaily, rotateThemes, type DailyState, type DailyTask, type ThemeContext } from '../../src/dailyDecision.tsx'
import { loadSeenAreas, loadVisitedAreas, markAreasSeen, markAreasVisited, pickNewArea, pickTheme, reachableAreas, SEEN_AREAS_KEY, STATION_THEMES, THEME_IDS, themeAreaFor, themeFor, themePool, unmarkAreasVisited, VISITED_AREAS_KEY, type AreaRecords } from '../../src/dailyThemes.ts'
import { AREAS, AREA_NAMES } from '../../src/areas.ts'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id: string, name = id, at = AREAS['澀谷']!) => ({ id, name, address: name + ' 地址', mapUrl: 'https://maps.google.com/?cid=' + id, lat: at.lat, lng: at.lng, rating: 4.2, userRatingCount: 808, types: ['restaurant'], primaryType: 'restaurant' })
const task = (id: string, extra: Partial<DailyTask> = {}): DailyTask => ({ id, title: id, minutes: 45, kind: id === 'meal' ? 'meal' : 'creative', done: false, ...extra })
const EMPTY = { destination: '', destinationStation: '' as const, activities: [] }
const stateOf = (tasks: DailyTask[], extra: Partial<DailyState> = {}): DailyState => ({ day: todayTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', intent: { ...EMPTY }, appliedIntent: { ...EMPTY }, tasks, notes: [], avoid: ['gym', 'shopping', 'rest'], seen: {}, disliked: [], dislikedKinds: [], ...extra })
const seed = (s: DailyState | Record<string, unknown>) => localStorage.setItem(KEY, JSON.stringify(s))
const saved = () => JSON.parse(localStorage.getItem(KEY)!) as DailyState
/** 可重現的亂數。 */
const lcg = (seedN: number) => { let x = seedN >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 } }

type Sent = { stops: DailyTask[]; shuffle?: string; manualOrder?: boolean; reorderOnly?: boolean }
let sent: Sent[] = []
/** /api/daily-route：記下請求；回 reply(請求)（預設把請求的站原樣回來，缺店的補一間）。其他網址（照片）回失敗。 */
const mockRoute = (reply: (req: Sent) => DailyTask[] = req => req.stops.map(s => ({ ...s, candidate: s.candidate ?? cand('found-' + s.id, '找到的店・' + (s.theme ?? s.place ?? s.id)) }))) => {
  sent = []
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    if (!urlText(url).includes('/api/daily-route')) return Promise.resolve({ ok: false })
    const req = JSON.parse(bodyText(init?.body, '{}')) as Sent
    sent.push(req)
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ stops: reply(req), routeVerified: true, conflicts: [] }) })
  }))
}
const settle = async () => { await waitFor(() => expect(screen.queryByText('正在取得現場照片…')).toBeNull()) }
const idle = async () => { await waitFor(() => expect(screen.getByTestId<HTMLButtonElement>('daily-generate').disabled).toBe(false)) }
const titles = () => [...document.querySelectorAll('.dd-stop h3')].map(h => h.textContent)

beforeEach(() => { localStorage.clear(); mockRoute() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('手動排序（純函式）', () => {
  const tasks = [task('fixed-1', { locked: true, custom: true, start: '15:00' }), task('meal', { eta: '10:10', travelMin: 5 }), task('creative'), task('fixed-2', { locked: true, custom: true, start: '18:00' }), task('coffee')]
  it('moveTask：往下一格、跳過固定行程；記下 manualOrder；舊的到店時間清掉', () => {
    const s = moveTask(stateOf(tasks), 'creative', 1)
    expect(s.tasks.map(t => t.id)).toEqual(['fixed-1', 'meal', 'coffee', 'fixed-2', 'creative'])
    expect(s.manualOrder).toBe(true)
    expect(s.orderDirty).toBe(true)
    expect(s.tasks.every(t => t.eta === undefined && t.travelMin === undefined)).toBe(true)
    expect(moveTask(stateOf(tasks), 'creative', -1).tasks.map(t => t.id)).toEqual(['fixed-1', 'creative', 'meal', 'fixed-2', 'coffee'])
  })
  it('moveTask：最上面再上移、最下面再下移、固定行程、不存在的站——都原封不動（不記 manualOrder）', () => {
    const s = stateOf(tasks)
    for (const [id, dir] of [['meal', -1], ['coffee', 1], ['fixed-1', 1], ['nope', 1]] as const) expect(moveTask(s, id, dir)).toBe(s)
  })
  it('applyUserOrder：伺服器回來的順序不蓋掉使用者的；固定行程與新站留在原位', () => {
    const ref = [task('coffee'), task('fixed-1', { locked: true }), task('meal'), task('creative')]
    const fromServer = [task('fixed-1', { locked: true }), task('meal', { eta: '10:00' }), task('creative'), task('brand-new'), task('coffee')]
    const out = applyUserOrder(fromServer, ref)
    expect(out.map(t => t.id)).toEqual(['fixed-1', 'coffee', 'meal', 'brand-new', 'creative'])
    expect(out.find(t => t.id === 'meal')!.eta).toBe('10:00')
  })
  it('replanDaily：手動排過就保留使用者順序；沒排過維持原本的排法', () => {
    const base = stateOf([task('coffee', { candidate: cand('c') }), task('meal', { candidate: cand('m') }), task('creative', { candidate: cand('g') })])
    expect(replanDaily({ ...base, manualOrder: true }).tasks.map(t => t.id)).toEqual(['coffee', 'meal', 'creative'])
    expect(replanDaily(base).tasks.map(t => t.id)).toEqual(['meal', 'creative', 'coffee'])
  })
})

describe('手動排序（畫面）', () => {
  const start = () => stateOf([task('meal', { title: '定食屋', candidate: cand('m', '定食屋') }), task('creative', { title: '藝廊', candidate: cand('g', '藝廊') }), task('coffee', { title: '咖啡店', candidate: cand('c', '咖啡店') })])
  it('按下移 → 畫面與存檔順序都變、存下 manualOrder；「照這個順序更新時間」送 manualOrder＋reorderOnly，站序＝使用者順序', async () => {
    seed(start())
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.queryByTestId('daily-order-bar')).toBeNull()
    fireEvent.click(screen.getByTestId('daily-move-down-meal'))
    expect(titles()).toEqual(['藝廊', '定食屋', '咖啡店'])
    expect(saved().manualOrder).toBe(true)
    expect(saved().tasks.map(t => t.id)).toEqual(['creative', 'meal', 'coffee'])
    expect(sent).toHaveLength(0)
    fireEvent.click(screen.getByTestId('daily-order-apply'))
    await idle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ manualOrder: true, reorderOnly: true })
    expect(sent[0]!.shuffle).toBeUndefined()
    expect(sent[0]!.stops.map(s => s.id)).toEqual(['creative', 'meal', 'coffee'])
    expect(sent[0]!.stops.map(s => s.candidate?.id)).toEqual(['g', 'm', 'c'])
    expect(screen.queryByTestId('daily-order-apply')).toBeNull()
  })
  it('伺服器回的順序不同也不覆蓋使用者順序；重新產生、換一站都帶 manualOrder、順序不變', async () => {
    seed({ ...start(), manualOrder: true, tasks: [start().tasks[2]!, start().tasks[0]!, start().tasks[1]!] })
    // 故意把站倒過來回。
    mockRoute(req => [...req.stops].reverse())
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByTestId('daily-generate'))
    await idle()
    expect(sent[0]!.manualOrder).toBe(true)
    expect(sent[0]!.reorderOnly).toBeUndefined()
    expect(sent[0]!.stops.map(s => s.id)).toEqual(['coffee', 'meal', 'creative'])
    expect(saved().tasks.map(t => t.id)).toEqual(['coffee', 'meal', 'creative'])
    fireEvent.click(screen.getAllByText('↻ 換這一站')[0]!)
    await idle()
    expect(sent[1]).toMatchObject({ manualOrder: true, shuffle: 'coffee' })
    expect(saved().tasks.map(t => t.id)).toEqual(['coffee', 'meal', 'creative'])
  })
  it('沒排過：請求不帶 manualOrder／reorderOnly（跟之前一樣）；固定行程沒有上下鍵', async () => {
    seed({ ...start(), tasks: [...start().tasks, task('fixed-1', { title: '牙醫', locked: true, custom: true, start: '15:00', place: '渋谷' })] })
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.queryByTestId('daily-move-up-fixed-1')).toBeNull()
    expect(screen.getByTestId<HTMLButtonElement>('daily-move-up-meal').disabled).toBe(true)
    expect(screen.getByTestId<HTMLButtonElement>('daily-move-down-coffee').disabled).toBe(true)
    fireEvent.click(screen.getByTestId('daily-generate'))
    await idle()
    expect('manualOrder' in sent[0]!).toBe(false)
    expect('reorderOnly' in sent[0]!).toBe(false)
  })
  it('恢復自動排序：拿掉旗標，請求只帶 reorderOnly（不換店），順序列消失', async () => {
    seed({ ...start(), manualOrder: true })
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByTestId('daily-order-auto'))
    await idle()
    expect(sent[0]!.reorderOnly).toBe(true)
    expect('manualOrder' in sent[0]!).toBe(false)
    expect(saved().manualOrder).toBeUndefined()
    expect(screen.queryByTestId('daily-order-bar')).toBeNull()
  })
})

describe('把關 R1：C 重開頁面、D 滿 9 站、E 移動後按鈕還在', () => {
  const three = () => stateOf([task('meal', { title: '定食屋', candidate: cand('m', '定食屋'), eta: '10:10' }), task('creative', { title: '藝廊', candidate: cand('g', '藝廊'), eta: '11:00' }), task('coffee', { title: '咖啡店', candidate: cand('c', '咖啡店'), eta: '12:00' })])
  it('C：改了順序還沒重算就重開頁面 →「照這個順序更新時間」還在；按了重算成功才消失（存檔的 orderDirty 跟著清）', async () => {
    seed(three())
    const first = render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByTestId('daily-move-down-meal'))
    expect(saved().orderDirty).toBe(true)
    first.unmount()
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(titles()).toEqual(['藝廊', '定食屋', '咖啡店'])
    fireEvent.click(screen.getByTestId('daily-order-apply'))
    await idle()
    expect(sent[0]).toMatchObject({ manualOrder: true, reorderOnly: true })
    expect(saved().orderDirty).toBeUndefined()
    expect(screen.queryByTestId('daily-order-apply')).toBeNull()
    expect(screen.getByTestId('daily-order-auto')).toBeTruthy()
  })
  it('C：換天或髒值不留 orderDirty；重算失敗時按鈕留著', async () => {
    seed({ ...three(), day: '2020-01-01', manualOrder: true, orderDirty: true })
    expect(loadDaily().orderDirty).toBeUndefined()
    seed({ ...three(), manualOrder: true, orderDirty: 'yes' })
    expect(loadDaily().orderDirty).toBeUndefined()
    seed({ ...three(), manualOrder: true, orderDirty: true })
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => Promise.resolve(urlText(url).includes('/api/daily-route') ? { ok: false, json: () => Promise.resolve({ message: '壞了' }) } : { ok: false })))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByTestId('daily-order-apply'))
    await idle()
    expect(saved().orderDirty).toBe(true)
    expect(screen.getByTestId('daily-order-apply')).toBeTruthy()
  })
  it('D：已有 9 站時在「想去哪？」送出 → 打的字留著、有提示、不送請求、不加站；移除一站後再送就成功', async () => {
    seed(stateOf(Array.from({ length: 9 }, (_, i) => task('want-' + i, { title: '地點' + i, place: '地點' + i, custom: true, specified: true, candidate: cand('w' + i, '地點' + i) }))))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    const input = screen.getByTestId<HTMLInputElement>('daily-add-place')
    fireEvent.change(input, { target: { value: '下北沢 B&B' } })
    fireEvent.submit(input.closest('form')!)
    expect(input.value).toBe('下北沢 B&B')
    expect(screen.getByText(/一天最多排 9 站/)).toBeTruthy()
    expect(sent).toHaveLength(0)
    expect(saved().tasks).toHaveLength(9)
    fireEvent.click(screen.getAllByText('移除安排')[0]!)
    fireEvent.submit(input.closest('form')!)
    await idle()
    expect(sent).toHaveLength(1)
    expect(input.value).toBe('')
    expect(saved().tasks.some(t => t.place === '下北沢 B&B')).toBe(true)
  })
  it('E：按 ↑／↓ 後，同一顆按鈕被捲回畫面（不做動畫）並留住焦點；移到頂時焦點換到 ↓', async () => {
    seed(three())
    const scrolled: { id: string; arg: unknown }[] = []
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) { scrolled.push({ id: (this as HTMLElement).dataset.testid ?? '', arg }) }
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getByTestId('daily-move-up-coffee'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('daily-move-up-coffee')))
    expect(scrolled[scrolled.length - 1]).toEqual({ id: 'daily-move-up-coffee', arg: { block: 'center' } })
    fireEvent.click(screen.getByTestId('daily-move-up-coffee'))
    expect(titles()).toEqual(['咖啡店', '定食屋', '藝廊'])
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('daily-move-down-coffee')))
    expect(scrolled[scrolled.length - 1]!.id).toBe('daily-move-down-coffee')
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })
})

describe('輸入：輸入法組字不丟字、空白不被吃掉、Enter 能送出', () => {
  const open = async () => {
    seed(stateOf([task('meal', { title: '定食屋', candidate: cand('m', '定食屋') })]))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
  }
  const dest = () => screen.getByTestId<HTMLInputElement>('daily-intent-destination')
  it('「想去哪裡」組字中（compositionstart → compositionend）不寫回上層、不改輸入框的字；選完字才寫', async () => {
    await open()
    fireEvent.compositionStart(dest())
    for (const v of ['ｔ', 'と', 'とう', 'とうきょう ']) {
      fireEvent.change(dest(), { target: { value: v } })
      expect(dest().value).toBe(v)
      expect(saved().intent.destination).toBe('')
    }
    fireEvent.change(dest(), { target: { value: '東京' } })
    fireEvent.compositionEnd(dest())
    expect(dest().value).toBe('東京')
    expect(saved().intent.destination).toBe('東京')
    // 接著再組一段：前面已確定的字不能掉、不能重複。
    fireEvent.compositionStart(dest())
    fireEvent.change(dest(), { target: { value: '東京たわー ' } })
    expect(dest().value).toBe('東京たわー ')
    expect(saved().intent.destination).toBe('東京')
    fireEvent.change(dest(), { target: { value: '東京タワー' } })
    fireEvent.compositionEnd(dest())
    expect(dest().value).toBe('東京タワー')
    expect(saved().intent.destination).toBe('東京タワー')
  })
  it('逐鍵打「Fuglen Tokyo」：中間的空白留著（之前一打空白就被去掉，變成 FuglenTokyo）', async () => {
    await open()
    let typed = ''
    for (const ch of 'Fuglen Tokyo') { typed += ch; fireEvent.change(dest(), { target: { value: typed } }); expect(dest().value).toBe(typed) }
    expect(saved().intent.destination).toBe('Fuglen Tokyo')
  })
  it('「想去哪裡」按 Enter 收起選單；組字中的 Enter（選字）不收', async () => {
    await open()
    fireEvent.click(screen.getByTestId('daily-chip-dest'))
    expect(screen.getByTestId('daily-sheet').hidden).toBe(false)
    fireEvent.keyDown(dest(), { key: 'Enter', keyCode: 229 })
    expect(screen.getByTestId('daily-sheet').hidden).toBe(false)
    fireEvent.keyDown(dest(), { key: 'Enter', keyCode: 13 })
    expect(screen.getByTestId('daily-sheet').hidden).toBe(true)
  })
  it('「加一個我想去的地方」：行程畫面上直接看得到；打字不動行程；Enter 送出——文字原樣當地點名稱，加成不會被換掉的一站', async () => {
    await open()
    const input = screen.getByTestId<HTMLInputElement>('daily-add-place')
    expect(input.closest('.sheet, details')).toBeNull()
    fireEvent.change(input, { target: { value: '下北沢 本屋 B&B' } })
    expect(saved().tasks).toHaveLength(1)
    expect(sent).toHaveLength(0)
    // 輸入法選字的 Enter 不送出。
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(false)
    fireEvent.submit(input.closest('form')!)
    await idle()
    expect(sent).toHaveLength(1)
    const want = sent[0]!.stops.find(s => s.id.startsWith('want-'))!
    expect(want).toMatchObject({ place: '下北沢 本屋 B&B', title: '下北沢 本屋 B&B', custom: true, specified: true })
    expect(sent[0]!.shuffle).toBe(want.id)
    expect(input.value).toBe('')
    expect(titles()).toContain('找到的店・下北沢 本屋 B&B')
    // 空白送出不會加站。
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(sent).toHaveLength(1)
  })
  it('逐站指定地點：打字時不清掉原本的店（卡片不跳動），送出才換；清空送出＝取消指定', async () => {
    await open()
    const input = screen.getByLabelText<HTMLInputElement>('定食屋 指定地點')
    fireEvent.change(input, { target: { value: 'Fuglen Tokyo' } })
    expect(saved().tasks[0]!.candidate?.id).toBe('m')
    expect(saved().tasks[0]!.specified).toBeUndefined()
    fireEvent.submit(input.closest('form')!)
    await idle()
    expect(sent[0]).toMatchObject({ shuffle: 'meal' })
    expect(sent[0]!.stops[0]).toMatchObject({ id: 'meal', place: 'Fuglen Tokyo', specified: true })
    expect(sent[0]!.stops[0]!.candidate).toBeUndefined()
    const again = screen.getByLabelText<HTMLInputElement>(/指定地點$/)
    fireEvent.change(again, { target: { value: '' } })
    expect(screen.getByText('取消指定，交給導遊挑')).toBeTruthy()
    fireEvent.submit(again.closest('form')!)
    await idle()
    expect(sent[1]!.stops[0]!.specified).toBe(false)
  })
  it('鍵盤升起（visualViewport 變矮）時，底部選單往上墊鍵盤的高度', async () => {
    const listeners: Record<string, () => void> = {}
    const vv = { height: 664, offsetTop: 0, scale: 1, addEventListener: (k: string, f: () => void) => { listeners[k] = f }, removeEventListener: () => {} }
    vi.stubGlobal('visualViewport', vv)
    vi.stubGlobal('innerHeight', 664)
    await open()
    fireEvent.click(screen.getByTestId('daily-chip-dest'))
    const wrap = screen.getByTestId('daily-sheet')
    expect(wrap.style.getPropertyValue('--dd-kb')).toBe('0px')
    vv.height = 364
    listeners.resize!()
    expect(wrap.style.getPropertyValue('--dd-kb')).toBe('300px')
  })
})

describe('探索主題', () => {
  it('themeFor／themeAreaFor：白名單以外一律當沒帶', () => {
    expect(themeFor('creative', 'park')).toBe('park')
    expect(themeFor('coffee', 'good_coffee')).toBe('good_coffee')
    for (const bad of ['', 'PARK', 'toString', 42, null, undefined, {}]) expect(themeFor('creative', bad)).toBeUndefined()
    expect(themeFor('coffee', 'park')).toBeUndefined()
    expect(themeFor('meal', 'destination_meal')).toBeUndefined()
    expect(themeFor('__proto__', 'park')).toBeUndefined()
    expect(themeAreaFor('new_area', '原宿')).toBe('原宿')
    expect(themeAreaFor('new_area', '火星')).toBeUndefined()
    expect(themeAreaFor('fun', '原宿')).toBeUndefined()
    expect([...STATION_THEMES.coffee!]).toEqual(['view_cafe', 'good_coffee'])
  })
  const SHIBUYA = AREAS['澀谷']!
  const none = { visited: {}, seen: {} }
  const everywhere = { visited: Object.fromEntries(AREA_NAMES.map(a => [a, 1])), seen: {} }
  const ctx = (rec: AreaRecords = none, center = SHIBUYA): ThemeContext => ({ rec, center })
  const run = (s: DailyState, c: ThemeContext, rand: () => number, n: number) => { const seq: string[] = []; for (let i = 0; i < n; i++) { s = rotateThemes(s, c, rand); seq.push(s.tasks.find(t => t.id === 'creative')!.theme!) } return seq }
  it('輪替不重複：連續重新生成，一輪（7 個主題）內每個主題剛好出一次；下一輪第一個不跟上一個一樣', () => {
    for (let seedN = 1; seedN <= 50; seedN++) {
      const seq = run(stateOf([task('creative')]), ctx(), lcg(seedN), 15)
      expect(new Set(seq.slice(0, 7)).size).toBe(7)
      expect(new Set(seq.slice(7, 14)).size).toBe(7)
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
      expect(seq.every(t => (THEME_IDS as readonly string[]).includes(t))).toBe(true)
    }
  })
  it('輪替有變化：不同亂數起點，第一個主題不只一種', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => rotateThemes(stateOf([task('creative')]), ctx(), lcg((i + 1) * 2654435761)).tasks[0]!.theme))
    expect(firsts.size).toBeGreaterThanOrEqual(4)
  })
  it('把關 R1-B：行程裡已有咖啡站 → 不輪到兩個咖啡主題；已有吃飯站 → 不輪到餐廳主題；都沒有才會出現', () => {
    for (let seedN = 1; seedN <= 30; seedN++) {
      const both = run(stateOf([task('meal'), task('creative'), task('coffee')]), ctx(), lcg(seedN), 12)
      expect(both.filter(t => ['view_cafe', 'good_coffee', 'destination_meal'].includes(t))).toEqual([])
      expect(new Set(both.slice(0, 4))).toEqual(new Set(['fun', 'park', 'art', 'new_area']))
      const coffeeOnly = run(stateOf([task('creative'), task('coffee', { done: true })]), ctx(), lcg(seedN), 10)
      expect(coffeeOnly.filter(t => t === 'view_cafe' || t === 'good_coffee')).toEqual([])
      expect(coffeeOnly).toContain('destination_meal')
      const mealOnly = run(stateOf([task('meal'), task('creative')]), ctx(), lcg(seedN), 12)
      expect(mealOnly).not.toContain('destination_meal')
      expect(mealOnly).toContain('view_cafe')
    }
    expect(themePool({ newArea: true, hasCoffee: true, hasMeal: true })).toEqual(['fun', 'park', 'new_area', 'art'])
    // 使用者自己選的不受限：行程有咖啡站，自己選的「好喝的咖啡」照留。
    const own = rotateThemes(stateOf([task('creative', { theme: 'good_coffee', themeFixed: true }), task('coffee')]), ctx(), lcg(1))
    expect(own.tasks[0]).toMatchObject({ theme: 'good_coffee', themeFixed: true })
  })
  it('把關 R1-F：附近有還沒去過的區域 → 開著「只在這一帶找店」也會輪到「沒去過的區域」，區域一定走得到、不是自己的生活圈', () => {
    for (let seedN = 1; seedN <= 30; seedN++) {
      const rand = lcg(seedN)
      let s = stateOf([task('creative')], { areaOnly: true, area: '新宿' })
      const areas: string[] = []
      for (let i = 0; i < 7; i++) { s = rotateThemes(s, ctx(none, AREAS['新宿']), rand); if (s.tasks[0]!.theme === 'new_area') areas.push(s.tasks[0]!.themeArea!) }
      expect(areas).toHaveLength(1)
      expect(['澀谷', '原宿', '表参道']).toContain(areas[0])
    }
    expect(reachableAreas(AREAS['新宿']!, '新宿')).toEqual(['澀谷', '原宿', '表参道'])
    expect(reachableAreas(SHIBUYA, '澀谷')).toEqual(['新宿', '原宿', '表参道', '恵比寿', '代官山'])
  })
  it('把關 R1-F：沒有走得到的沒去過區域（都去過、或出發點離每一區都超過 3.5 公里）→ 不輪到這個主題', () => {
    const far = { lat: 35.9, lng: 139.7 }
    expect(reachableAreas(far)).toEqual([])
    for (let seedN = 1; seedN <= 20; seedN++) {
      expect(run(stateOf([task('creative')], { areaOnly: false }), ctx(everywhere), lcg(seedN), 12)).not.toContain('new_area')
      expect(run(stateOf([task('creative')], { areaOnly: false }), ctx(none, far), lcg(seedN), 12)).not.toContain('new_area')
    }
    // 只「看過」不算去過：還是會輪到，而且先挑完全沒紀錄的。
    const seenSome = { visited: {}, seen: { 新宿: 5, 原宿: 6, 表参道: 7, 恵比寿: 8 } }
    const s = rotateThemes(stateOf([task('creative')], { themesToday: THEME_IDS.filter(x => x !== 'new_area') }), ctx(seenSome), lcg(3))
    expect(s.tasks[0]).toMatchObject({ theme: 'new_area', themeArea: '代官山' })
  })
  it('使用者自己選的主題不被輪替換掉；已完成／指定／固定的探索站、其他站都不動', () => {
    const fixed = rotateThemes(stateOf([task('creative', { theme: 'park', themeFixed: true })]), ctx(), lcg(1))
    expect(fixed.tasks[0]).toMatchObject({ theme: 'park', themeFixed: true })
    expect(fixed.themesToday).toEqual([])
    for (const extra of [{ done: true }, { specified: true, place: 'X' }, { locked: true }, { custom: true }] as Partial<DailyTask>[]) {
      const t = task('creative', extra)
      expect(rotateThemes(stateOf([t]), ctx(), lcg(1)).tasks[0]).toBe(t)
    }
    const others = [task('meal'), task('coffee')]
    expect(rotateThemes(stateOf(others), ctx(), lcg(1)).tasks).toEqual(others)
  })
  it('輪到「沒去過的區域」時帶一個區域；換成別的主題時區域清掉', () => {
    const s = rotateThemes(stateOf([task('creative')], { themesToday: THEME_IDS.filter(x => x !== 'new_area') }), ctx(), lcg(3))
    expect(s.tasks[0]!.theme).toBe('new_area')
    expect(AREA_NAMES).toContain(s.tasks[0]!.themeArea)
    expect(s.tasks[0]!.themeArea).not.toBe('澀谷')
    const next = rotateThemes(s, ctx(), lcg(3))
    expect(next.tasks[0]!.theme).not.toBe('new_area')
    expect(next.tasks[0]!.themeArea).toBeUndefined()
  })
  it('pickTheme：全部出過時避開目前這個', () => {
    for (let i = 1; i <= 30; i++) expect(pickTheme([...THEME_IDS], THEME_IDS, 'art', lcg(i))).not.toBe('art')
  })
  it('fillThemeArea：自己選「沒去過的區域」→ 補一個走得到的區域；附近完全沒有其他區域 → 放棄這個主題（不送一定落空的請求）', () => {
    const own = stateOf([task('creative', { theme: 'new_area', themeFixed: true })], { area: '新宿' })
    const ok = fillThemeArea(own, ctx(none, AREAS['新宿']), lcg(2))
    expect(ok.dropped).toBe(false)
    expect(['澀谷', '原宿', '表参道']).toContain(ok.state.tasks[0]!.themeArea)
    // 走得到的都去過：挑最久沒去的（不落空）。
    expect(fillThemeArea(own, ctx({ visited: { 澀谷: 30, 原宿: 10, 表参道: 20 }, seen: {} }, AREAS['新宿']), lcg(2)).state.tasks[0]!.themeArea).toBe('原宿')
    const none2 = fillThemeArea(own, ctx(none, { lat: 35.9, lng: 139.7 }), lcg(2))
    expect(none2.dropped).toBe(true)
    expect(none2.state.tasks[0]).toMatchObject({ id: 'creative' })
    expect(none2.state.tasks[0]!.theme).toBeUndefined()
    expect(none2.state.tasks[0]!.themeFixed).toBeUndefined()
    // 已經有區域、不是這個主題、不是自動站：原封不動。
    const kept = stateOf([task('creative', { theme: 'new_area', themeArea: '原宿' }), task('meal')])
    expect(fillThemeArea(kept, ctx()).state).toBe(kept)
  })
  it('畫面：卡片上換主題 → 只重找這一站、請求逐站帶 theme；理由行只寫回應裡有的資料', async () => {
    seed(stateOf([task('meal', { title: '定食屋', candidate: cand('m', '定食屋') }), task('creative', { title: '藝廊', candidate: cand('g', '藝廊') }), task('coffee', { title: '咖啡店', candidate: cand('c', '咖啡店') })]))
    mockRoute(req => req.stops.map(s => s.id === req.shuffle ? { ...s, candidate: { ...cand('new-' + s.id, '新店'), rating: 4.6, userRatingCount: 1234 }, travelMin: 8 } : s))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.queryByTestId('daily-theme-meal')).toBeNull()
    expect(screen.getByTestId('daily-theme-creative').textContent).toContain('讓導遊決定')
    fireEvent.click(screen.getByTestId('daily-theme-creative'))
    expect(THEME_IDS.every(id => screen.getByTestId('daily-theme-opt-' + id))).toBe(true)
    fireEvent.click(screen.getByTestId('daily-theme-opt-park'))
    await idle()
    expect(sent[0]!.shuffle).toBe('creative')
    expect(sent[0]!.stops.map(s => [s.id, s.theme])).toEqual([['meal', undefined], ['creative', 'park'], ['coffee', undefined]])
    expect(saved().tasks[1]).toMatchObject({ theme: 'park', themeFixed: true })
    expect(saved().themesToday).toEqual(['park'])
    expect(screen.getByTestId('daily-reason-creative').textContent).toBe('為什麼推這裡：主題「漂亮的公園」・Google ★4.6（1234 則評論）・從上一站步行 8 分鐘')
    expect(screen.getByTestId('daily-theme-creative').textContent).toContain('漂亮的公園')
    // 重新產生：自己選的主題照送。
    fireEvent.click(screen.getByTestId('daily-generate'))
    await idle()
    expect(sent[1]!.stops.find(s => s.id === 'creative')!.theme).toBe('park')
    // 改回讓導遊決定：立刻換一個今天沒出過的（不是公園）。
    fireEvent.click(screen.getByTestId('daily-theme-creative'))
    fireEvent.click(screen.getByTestId('daily-theme-opt-auto'))
    await idle()
    const auto = sent[2]!.stops.find(s => s.id === 'creative')!
    expect(sent[2]!.shuffle).toBe('creative')
    expect(auto.theme).not.toBe('park')
    expect(themeFor('creative', auto.theme)).toBeDefined()
    expect(saved().tasks.find(t => t.id === 'creative')!.themeFixed).toBeUndefined()
    // 咖啡站：只有兩種主題。
    fireEvent.click(screen.getByTestId('daily-theme-coffee'))
    expect(screen.queryByTestId('daily-theme-opt-park')).toBeNull()
    fireEvent.click(screen.getByTestId('daily-theme-opt-good_coffee'))
    await idle()
    expect(sent[3]!.stops.find(s => s.id === 'coffee')!.theme).toBe('good_coffee')
  })
  it('畫面：完整重新生成時「讓導遊決定」的探索站每次送不同主題', async () => {
    // 今天略過午餐與咖啡：7 個主題都能輪。
    seed(stateOf([task('creative', { title: '藝廊', candidate: cand('g', '藝廊') })], { avoid: ['gym', 'meal', 'coffee', 'shopping', 'rest'] }))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    for (let i = 0; i < 6; i++) { fireEvent.click(screen.getByTestId('daily-generate')); await idle() }
    const seq = sent.map(r => r.stops.find(s => s.id === 'creative')!.theme)
    expect(new Set(seq).size).toBe(6)
    expect(saved().themesToday).toHaveLength(6)
  })
  it('畫面（把關 R1-B、F）：行程有午餐站與咖啡站時，重新生成不會輪到咖啡／餐廳主題；會輪到「沒去過的區域」並帶走得到的區域', async () => {
    seed(stateOf([task('creative', { title: '藝廊', candidate: cand('g', '藝廊') })]))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    for (let i = 0; i < 8; i++) { fireEvent.click(screen.getByTestId('daily-generate')); await idle() }
    expect(sent[0]!.stops.map(s => s.id)).toEqual(['meal', 'creative', 'coffee'])
    const picks = sent.map(r => r.stops.find(s => s.id === 'creative')!)
    expect(new Set(picks.slice(0, 4).map(s => s.theme))).toEqual(new Set(['fun', 'park', 'art', 'new_area']))
    expect(picks.filter(s => ['view_cafe', 'good_coffee', 'destination_meal'].includes(s.theme ?? ''))).toEqual([])
    for (const s of picks) expect(s.theme === 'new_area' ? ['新宿', '原宿', '表参道', '恵比寿', '代官山'].includes(s.themeArea ?? '') : s.themeArea === undefined).toBe(true)
  })
})

describe('沒去過的區域', () => {
  const rec = (visited: Record<string, number> = {}, seen: Record<string, number> = {}): AreaRecords => ({ visited, seen })
  const five = ['新宿', '原宿', '表参道', '恵比寿', '代官山']
  it('pickNewArea 先後（把關 R1-A）：完全沒紀錄 → 只看過沒去過（最久沒看的先）→ 都去過時最久沒去的', () => {
    // 新宿去過、原宿與表参道只看過 → 只會挑完全沒紀錄的恵比寿／代官山。
    for (let i = 1; i <= 40; i++) expect(['恵比寿', '代官山']).toContain(pickNewArea(rec({ 新宿: 5 }, { 原宿: 9, 表参道: 3 }), five, lcg(i * 7919)))
    // 沒有完全沒紀錄的了：挑只看過的裡最久沒看的。
    expect(pickNewArea(rec({ 新宿: 5 }, { 原宿: 9, 表参道: 3, 恵比寿: 4, 代官山: 8 }), five)).toBe('表参道')
    // 去過的就算也看過，還是排在只看過的後面。
    expect(pickNewArea(rec({ 新宿: 5, 表参道: 1 }, { 原宿: 9, 表参道: 3, 恵比寿: 4, 代官山: 8, 新宿: 1 }), five)).toBe('恵比寿')
    // 都去過：最久沒去的。
    expect(pickNewArea(rec({ 新宿: 50, 原宿: 30, 表参道: 20, 恵比寿: 40, 代官山: 60 }, { 表参道: 999 }), five)).toBe('表参道')
  })
  it('pickNewArea：沒有紀錄時照常給（不發明紀錄）；沒有可挑的區域回 undefined', () => {
    expect(five).toContain(pickNewArea(rec(), five, lcg(1)))
    expect(pickNewArea(rec(), [])).toBeUndefined()
    expect(loadVisitedAreas()).toEqual({})
    expect(loadSeenAreas()).toEqual({})
  })
  it('看過的區域：用店的座標對地區清單記；跟「去過」分開存；取消完成只撤回去過那筆', () => {
    markAreasSeen([AREAS['新宿']!, { lat: 35.0, lng: 135.0 }, AREAS['原宿']!], 500)
    expect(loadSeenAreas()).toEqual({ 新宿: 500, 原宿: 500 })
    expect(loadVisitedAreas()).toEqual({})
    markAreasVisited(AREAS['新宿']!, 1000, 'done:a')
    unmarkAreasVisited('done:a')
    expect(loadVisitedAreas()).toEqual({})
    expect(loadSeenAreas()).toEqual({ 新宿: 500, 原宿: 500 })
    markAreasSeen([], 900)
    for (const raw of ['[1]', '{bad', JSON.stringify({ 火星: 1, 新宿: 'x', 原宿: 7 })]) {
      localStorage.setItem(SEEN_AREAS_KEY, raw)
      expect(loadSeenAreas()).toEqual(raw.includes('原宿') ? { 原宿: 7 } : {})
    }
  })
  it('畫面：路線回應顯示出來的店 → 所在區域記「看過」（不算去過）', async () => {
    seed(stateOf([task('meal', { title: '定食屋', candidate: cand('m', '定食屋') })]))
    mockRoute(req => req.stops.map(s => ({ ...s, candidate: cand('h', '原宿的店', AREAS['原宿']) })))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(loadSeenAreas()).toEqual({})
    fireEvent.click(screen.getByTestId('daily-generate'))
    await idle()
    expect(Object.keys(loadSeenAreas())).toEqual(['原宿'])
    expect(loadVisitedAreas()).toEqual({})
  })
  it('標記完成 → 記下店所在的區域（用座標對地區清單）；取消勾選 → 撤回；不在任何地區的店不記', () => {
    markAreasVisited(AREAS['新宿']!, 1000, 'done:a')
    markAreasVisited({ lat: 35.0, lng: 135.0 }, 2000, 'done:b')
    expect(loadVisitedAreas()).toEqual({ 新宿: 1000 })
    unmarkAreasVisited('done:a')
    expect(loadVisitedAreas()).toEqual({})
  })
  it('紀錄壞掉（不是物件、未知地名、時間不是數字）：當沒有紀錄，不壞', () => {
    for (const raw of ['[1,2]', '"x"', '{bad', JSON.stringify({ 火星: { t: 1 }, 新宿: { t: 'x' }, 原宿: null, 恵比寿: { t: 7, src: 's' } })]) {
      localStorage.setItem(VISITED_AREAS_KEY, raw)
      expect(loadVisitedAreas()).toEqual(raw.includes('恵比寿') ? { 恵比寿: 7 } : {})
    }
  })
  it('畫面：勾「標記完成」寫進去過的區域；選「沒去過的區域」時請求帶 themeArea，避開去過的', async () => {
    const shinjuku = cand('s', '新宿的店', AREAS['新宿'])
    seed(stateOf([task('meal', { title: '新宿的店', candidate: shinjuku }), task('creative', { title: '藝廊', candidate: cand('g', '藝廊') })], { areaOnly: false }))
    localStorage.setItem(VISITED_AREAS_KEY, JSON.stringify({ 原宿: { t: 1, src: 'x' }, 表参道: { t: 2, src: 'x' }, 恵比寿: { t: 3, src: 'x' } }))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    fireEvent.click(screen.getAllByText('標記完成')[0]!)
    expect(Object.keys(loadVisitedAreas()).sort()).toEqual(['原宿', '恵比寿', '新宿', '表参道'].sort())
    fireEvent.click(screen.getByTestId('daily-theme-creative'))
    fireEvent.click(screen.getByTestId('daily-theme-opt-new_area'))
    await idle()
    // 澀谷是生活圈、其餘四區去過：只剩代官山沒去過。
    expect(sent[0]!.stops.find(s => s.id === 'creative')).toMatchObject({ theme: 'new_area', themeArea: '代官山' })
    expect(screen.getByTestId('daily-reason-creative').textContent).toContain('代官山（紀錄裡還沒去過）')
  })
})

describe('理由行（exploreReason）', () => {
  const c = { ...cand('x'), rating: 4.5, userRatingCount: 300 }
  it('只用手上有的資料；缺什麼就不寫什麼', () => {
    expect(exploreReason(task('creative', { theme: 'fun', candidate: c, travelMin: 6 }))).toBe('為什麼推這裡：主題「有趣的地方」・Google ★4.5（300 則評論）・從上一站步行 6 分鐘')
    expect(exploreReason(task('creative', { theme: 'fun', candidate: { ...c, rating: undefined, userRatingCount: undefined } }))).toBe('為什麼推這裡：主題「有趣的地方」')
    expect(exploreReason(task('creative', { candidate: { ...c, userRatingCount: undefined } }))).toBe('為什麼推這裡：Google ★4.5')
    expect(exploreReason(task('creative', { theme: 'new_area', themeArea: '新宿', candidate: c }), { 新宿: 1 })).toBe('為什麼推這裡：主題「沒去過的區域」・新宿・Google ★4.5（300 則評論）')
    // 把關 R1-H：沒有去過的紀錄不說成「你沒去過」；第一站的步行是從出發地算。
    expect(exploreReason(task('creative', { theme: 'new_area', themeArea: '新宿', candidate: c }), {})).toBe('為什麼推這裡：主題「沒去過的區域」・新宿（紀錄裡還沒去過）・Google ★4.5（300 則評論）')
    expect(exploreReason(task('creative', { theme: 'fun', candidate: c, travelMin: 6 }), {}, true)).toBe('為什麼推這裡：主題「有趣的地方」・Google ★4.5（300 則評論）・從出發地步行 6 分鐘')
  })
  it('沒有資料就不寫：沒有店、舊存檔探索站沒有評分也沒有步行時間、不是探索站也沒有主題', () => {
    expect(exploreReason(task('creative', { theme: 'fun' }))).toBe('')
    expect(exploreReason(task('creative', { candidate: { ...c, rating: undefined, userRatingCount: undefined } }))).toBe('')
    expect(exploreReason(task('meal', { candidate: c, travelMin: 5 }))).toBe('')
    // 使用者自己指定／固定／加的地方不是導遊推的，殘留的舊主題也不寫。
    for (const own of [{ specified: true }, { locked: true }, { custom: true }] as Partial<DailyTask>[]) expect(exploreReason(task('creative', { theme: 'fun', candidate: c, travelMin: 6, ...own }))).toBe('')
    expect(exploreReason(task('creative', { theme: 'not-a-theme', candidate: { ...c, rating: undefined } }))).toBe('')
  })
})

describe('舊存檔相容', () => {
  it('沒有 theme／manualOrder／themesToday 的舊存檔：照常載入、畫面不壞、請求不帶新欄位以外的東西', async () => {
    seed({ day: todayTokyo(), area: '澀谷', currentPlace: '渋谷駅', tasks: [{ id: 'creative', title: '澀谷｜藝術展／日本 IP 快閃探索（出發前查活動與營業）', minutes: 65, kind: 'creative', done: false, candidate: cand('g', 'DIESEL ART GALLERY') }], notes: [], avoid: [] })
    const s = loadDaily()
    expect(s.manualOrder).toBeUndefined()
    expect(s.themesToday).toEqual([])
    expect(s.tasks[0]!.theme).toBeUndefined()
    expect(s.tasks[0]!.candidate?.id).toBe('g')
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(titles()).toEqual(['DIESEL ART GALLERY'])
    expect(screen.getByTestId('daily-theme-creative').textContent).toContain('讓導遊決定')
    expect(screen.getByTestId('daily-reason-creative').textContent).toBe('為什麼推這裡：Google ★4.2（808 則評論）')
  })
  it('存檔裡的 theme 是亂字串：畫面不壞、當成沒有主題', async () => {
    seed(stateOf([task('creative', { title: '藝廊', theme: 'constructor', themeArea: '火星', candidate: cand('g', '藝廊') })]))
    render(<DailyDecision onBack={() => {}} />)
    await settle()
    expect(screen.getByTestId('daily-theme-creative').textContent).toContain('讓導遊決定')
  })
  it('換天：手動順序與今天出過的主題歸零；髒值（manualOrder 不是 true、themesToday 不是陣列）當沒有', () => {
    seed({ ...stateOf([task('meal', { candidate: cand('m') })]), day: '2020-01-01', manualOrder: true, themesToday: ['park'] })
    expect(loadDaily().manualOrder).toBeUndefined()
    expect(loadDaily().themesToday).toEqual([])
    seed({ ...stateOf([task('meal', { candidate: cand('m') })]), manualOrder: 'yes', themesToday: 'park' })
    expect(loadDaily().manualOrder).toBeUndefined()
    expect(loadDaily().themesToday).toEqual([])
    seed({ ...stateOf([task('meal', { candidate: cand('m') })]), manualOrder: true, themesToday: ['park', 3, 'park'] })
    expect(loadDaily().manualOrder).toBe(true)
    expect(loadDaily().themesToday).toEqual(['park'])
  })
  it('clearStaleCandidate：「沒去過的區域」的店用它自己的區域檢查，不被全域地區偏好清掉；公園主題的公園不算地標', () => {
    const ctx = { disliked: [], dislikedKinds: [], area: '澀谷', areaOnly: true }
    const inHarajuku = cand('h', '原宿的店', AREAS['原宿'])
    const themed = task('creative', { theme: 'new_area', themeArea: '原宿', candidate: inHarajuku })
    expect(clearStaleCandidate(themed, ctx)).toBe(themed)
    expect(clearStaleCandidate(task('creative', { candidate: inHarajuku }), ctx)).toMatchObject({ noCandidate: true, noCandidateReason: 'area' })
    expect(clearStaleCandidate(task('creative', { theme: 'new_area', themeArea: '新宿', candidate: inHarajuku }), ctx)).toMatchObject({ noCandidate: true, noCandidateReason: 'area' })
    const park = { ...cand('p', '代々木公園'), types: ['park', 'tourist_attraction'], primaryType: 'park' }
    const parkStop = task('creative', { theme: 'park', candidate: park })
    expect(clearStaleCandidate(parkStop, ctx)).toBe(parkStop)
    expect(clearStaleCandidate(task('creative', { candidate: park }), ctx)).toMatchObject({ noCandidateReason: 'denied' })
  })
})
