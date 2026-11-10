import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDaily, intentHintText, loadDaily, parseIntent, replanDaily, type DailyState } from '../../src/dailyDecision.tsx'

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
    expect(parseIntent('カフェで休憩')).toEqual(['coffee'])
    expect(parseIntent('have a coffee')).toEqual(['coffee'])
  })
  it('shopping：購物／買い物／shopping 都命中', () => {
    expect(parseIntent('去購物')).toEqual(['shopping'])
    expect(parseIntent('買い物に行く')).toEqual(['shopping'])
    expect(parseIntent('shopping for clothes')).toEqual(['shopping'])
  })
  it('rest：休息意圖不再是意圖目標——rest 是純文字站、沒有可拜訪的店家（F5）', () => {
    // 「想休息」本來就由預設目錄裡的 rest 站滿足；意圖不該把它變成可搜尋站
    // （伺服器 isTextOnlyRest 要求 !specified，指定後會拿整句去查 Places）。
    expect(parseIntent('想休息一下')).toEqual([])
    expect(parseIntent('休憩したい')).toEqual([])
    const tasks = buildDaily(state('想休息一下'))
    const rest = tasks.find(t => t.id === 'rest')!
    expect(rest.specified).toBeFalsy()
    expect(rest.place).toBeUndefined()
    expect(rest.title).toBe('散步回家、休息與晚餐')
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
  it('否定語境（F2）：否定標記前 4 字內的關鍵字不命中——「不要」就是不要', () => {
    expect(parseIntent('不想吃拉麵')).toEqual([])
    expect(parseIntent('不要咖啡')).toEqual([])
    expect(parseIntent('不去健身房')).toEqual([])
    // 混合句：只指定肯定部分
    expect(parseIntent('我不吃拉麵，只想看展覽')).toEqual(['creative'])
    expect(parseIntent('不要咖啡，想吃壽司')).toEqual(['meal'])
    // 提示同樣逐字反映否定後的解析（不顯示被否定的站）
    expect(intentHintText('不想吃拉麵')).toBeNull()
    expect(intentHintText('不要咖啡，想吃壽司')).toBe('已辨識：壽司 → 午餐站')
  })
  it('否定語境對照組（F2）：肯定句仍命中；「不」離關鍵字超過 4 字不得否定', () => {
    expect(parseIntent('想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('今天不想太累，想吃拉麵')).toEqual(['meal'])
  })
  it('CJK 單字子字串誤命中（F3）：吃藥／住飯店／運動會／買不到票皆不命中', () => {
    expect(parseIntent('吃藥')).toEqual([])
    expect(parseIntent('住飯店')).toEqual([])
    expect(parseIntent('運動會')).toEqual([])
    expect(parseIntent('買不到票')).toEqual([])
  })
  it('刻意的漏判取捨（F3）：單字關鍵字「運動」「買」已刪，合法命中靠多字詞——想吃拉麵仍經「拉麵」命中', () => {
    // 「運動」已從關鍵字表刪除（運動會／運動員／運動場同類誤命中）：「想運動」不命中，
    // 由創意預設兜底（預設目錄本來就有健身站）。「買」同理：「想買東西」不命中。
    expect(parseIntent('想運動')).toEqual([])
    expect(parseIntent('早上運動')).toEqual([])
    expect(parseIntent('想買東西')).toEqual([])
    expect(parseIntent('想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('午餐吃定食')).toEqual(['meal'])
  })
  it('羅馬字複數形（F4）：coffees／gyms／cafes／sushis／arts 皆命中', () => {
    expect(parseIntent('two coffees please')).toEqual(['coffee'])
    expect(parseIntent('go to gyms')).toEqual(['gym'])
    expect(parseIntent('I love cafes')).toEqual(['coffee'])
    expect(parseIntent('sushis for lunch')).toEqual(['meal'])
    expect(parseIntent('arts and crafts')).toEqual(['creative'])
    expect(parseIntent('restaurants nearby')).toEqual(['meal'])
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
    // 前一站是從「想吃拉麵」長出來的（appliedIntent），現在意圖換成壽司 → 清掉
    const tasks = buildDaily({ ...state('想吃壽司'), appliedIntent: '想吃拉麵', tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.specified).toBe(true)
    expect(meal.place).toBe('想吃壽司')
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
    expect(meal.departure).toBeUndefined()
    expect(meal.travelMin).toBeUndefined()
    expect(meal.conflict).toBeUndefined()
  })
  it('同一意圖重跑（搜尋後形狀）→ 已找到的候選與 eta 保留、place 留著店家地址', () => {
    // R2-F3：搜尋後 place 是店家地址，舊條件 prev.place === intent 永不成立。
    // 保留與否只看 state.appliedIntent === intent（state 層，伺服器洗不掉）。
    const prev = buildDaily(state('想吃拉麵')).map(t => t.id === 'meal'
      ? { ...t, place: '東京都渋谷区道玄坂1-2-3', candidate: cand('m1', '拉麵店'), eta: '12:00 抵達', departure: '11:30 離開', travelMin: 30 }
      : t)
    const tasks = buildDaily({ ...state('想吃拉麵'), appliedIntent: '想吃拉麵', tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.travelMin).toBe(30)
    expect(meal.place).toBe('東京都渋谷区道玄坂1-2-3')
    expect(meal.intentSpecified).toBe(true)
  })
  it('搜尋後＋appliedIntent 不符 → 候選清掉（比的是 appliedIntent，不是 place）', () => {
    const prev = buildDaily(state('想吃壽司')).map(t => t.id === 'meal'
      ? { ...t, place: '東京都渋谷区道玄坂1-2-3', candidate: cand('m1', '拉麵店'), eta: '12:00 抵達' }
      : t)
    // 任務是從「想吃壽司」長出來的，現在意圖是「想吃拉麵」：就算 place 是地址，也要清掉重找
    const tasks = buildDaily({ ...state('想吃拉麵'), appliedIntent: '想吃壽司', tasks: prev })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('想吃拉麵')
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
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
    const tasks = buildDaily({ ...state('想吃壽司'), appliedIntent: '想吃拉麵', tasks: intentPrev('想吃拉麵') })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.place).toBe('想吃壽司')
    expect(meal.specified).toBe(true)
    expect(meal.intentSpecified).toBe(true)
    expect(meal.candidate).toBeUndefined()
    expect(meal.eta).toBeUndefined()
  })
  it('同一意圖重跑（搜尋前形狀，對照）→ 候選保留、標記仍在', () => {
    const tasks = buildDaily({ ...state('想吃拉麵'), appliedIntent: '想吃拉麵', tasks: intentPrev('想吃拉麵') })
    const meal = tasks.find(t => t.id === 'meal')!
    expect(meal.candidate?.id).toBe('m1')
    expect(meal.eta).toBe('12:00 抵達')
    expect(meal.intentSpecified).toBe(true)
  })
  it('replanDaily：appliedIntent 跟著當次意圖走（下次重跑比的就是它）', () => {
    const result = replanDaily(state('想吃拉麵'))
    expect(result.appliedIntent).toBe('想吃拉麵')
    expect(result.tasks.find(t => t.id === 'meal')?.place).toBe('想吃拉麵')
    const changed = replanDaily({ ...result, intent: '去看展覽' })
    expect(changed.appliedIntent).toBe('去看展覽')
    expect(changed.tasks.find(t => t.id === 'creative')?.place).toBe('去看展覽')
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

describe('否定邏輯（R2-F1）：雙向否定＋日文否定形——後置否定與接尾辭形不再當肯定', () => {
  it('後置否定：關鍵字後面的「不要」同樣否定', () => {
    expect(parseIntent('拉麵不要')).toEqual([])
    expect(parseIntent('咖啡不要')).toEqual([])
    expect(parseIntent('ラーメン不要')).toEqual([])
    expect(parseIntent('ラーメン不要、寿司が食べたい')).toEqual(['meal'])
  })
  it('日文否定形：〜たくない／〜じゃない／〜いらない／〜なし／〜抜き', () => {
    expect(parseIntent('食べたくない')).toEqual([])
    expect(parseIntent('ラーメンじゃない')).toEqual([])
    expect(parseIntent('コーヒーいらない')).toEqual([])
    expect(parseIntent('ラーメンなしで')).toEqual([])
    expect(parseIntent('今日はラーメン抜き')).toEqual([])
    expect(parseIntent('ジムに行きたくない')).toEqual([])
    expect(parseIntent('ラーメンを食べたくない')).toEqual([])
    // 提示同樣不顯示被否定的站
    expect(intentHintText('拉麵不要')).toBeNull()
    expect(intentHintText('ジムに行きたくない')).toBeNull()
  })
  it('動詞否定形：〜ない／〜ません——食べない／行かない／がない', () => {
    expect(parseIntent('食べない')).toEqual([])
    expect(parseIntent('ジムに行かない')).toEqual([])
    expect(parseIntent('食べません')).toEqual([])
    expect(parseIntent('ラーメンがない')).toEqual([])
  })
  it('前置的「不想＋動詞」：受詞前置時否定該受詞；否定動詞後面有別的關鍵字時，否定歸後者', () => {
    expect(parseIntent('拉麵不想吃')).toEqual([])
    expect(parseIntent('拉麵不吃')).toEqual([])
    expect(parseIntent('想吃拉麵不想喝咖啡')).toEqual(['meal'])
    expect(parseIntent('不想吃拉麵，只想喝咖啡')).toEqual(['coffee'])
  })
  it('雙重否定：不是不想吃＝想吃（兩個否定相抵）；「不是拉麵」仍是否定', () => {
    expect(parseIntent('不是不想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('不是拉麵，是壽司')).toEqual(['meal'])
    expect(parseIntent('並不是不想喝咖啡')).toEqual(['coffee'])
  })
  it('非否定詞（O-A）：不過／不然／不錯／別人不觸發否定', () => {
    expect(parseIntent('不過想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('不然想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('不錯的拉麵')).toEqual(['meal'])
    expect(parseIntent('別人想吃拉麵')).toEqual(['meal'])
    expect(parseIntent('不過不想吃拉麵')).toEqual([])
  })
})

describe('CJK 詞邊界（R2-F2）：最長匹配＋封閉複合詞表＋裸詞幹邊界', () => {
  it('誤命中不再發生：關鍵字是別的詞的一部分時不命中', () => {
    expect(parseIntent('ジムニーでドライブ')).toEqual([])
    expect(parseIntent('アートメイクの予約')).toEqual([])
    expect(parseIntent('すし詰めの電車は嫌だから車で行きたい')).toEqual([])
    expect(parseIntent('食べ過ぎた')).toEqual([])
    expect(parseIntent('美術史の本を読みたい')).toEqual([])
  })
  it('合法複合詞仍命中：複合詞表裡的詞是獨立詞條', () => {
    expect(parseIntent('食べログで調べる')).toEqual(['meal'])
    expect(parseIntent('食べ放題に行きたい')).toEqual(['meal'])
    expect(parseIntent('ジム通いを再開したい')).toEqual(['gym'])
    expect(parseIntent('美術部に行く')).toEqual(['creative'])
    expect(parseIntent('晚餐會')).toEqual(['meal'])
    expect(parseIntent('ブランチ')).toEqual(['meal'])
    expect(parseIntent('ラーメン屋に行きたい')).toEqual(['meal'])
    expect(parseIntent('寿司屋で食べる')).toEqual(['meal'])
    expect(parseIntent('カフェ巡りしたい')).toEqual(['coffee'])
    expect(parseIntent('展示会に行きたい')).toEqual(['creative'])
    expect(parseIntent('食べ物が食べたい')).toEqual(['meal'])
    expect(parseIntent('カフェインを摂りたい')).toEqual(['coffee'])
  })
  it('否定仍以複合詞為準：カフェイン不要＝不要咖啡因，不指定咖啡站', () => {
    expect(parseIntent('カフェインを摂りたくない')).toEqual([])
    expect(intentHintText('カフェインを摂りたい')).toBe('已辨識：カフェイン → 咖啡站')
  })
  it('詞尾仍是該物（head-final）：關鍵字在詞尾時命中——地名前綴／回転寿司／お寿司', () => {
    expect(parseIntent('渋谷ラーメン')).toEqual(['meal'])
    expect(parseIntent('回転寿司')).toEqual(['meal'])
    expect(parseIntent('お寿司が食べたい')).toEqual(['meal'])
    expect(parseIntent('猫カフェに行きたい')).toEqual(['coffee'])
  })
  it('動詞／連接詞接在關鍵字後面：關鍵字是受詞時命中', () => {
    expect(parseIntent('ラーメン食べたい')).toEqual(['meal'])
    expect(parseIntent('ジム行く')).toEqual(['gym'])
    expect(parseIntent('想吃拉麵然後看展覽')).toEqual(['meal', 'creative'])
    expect(parseIntent('去看展覽然後喝咖啡')).toEqual(['creative', 'coffee'])
    expect(parseIntent('健身完去喝咖啡')).toEqual(['gym', 'coffee'])
    expect(parseIntent('午餐吃定食')).toEqual(['meal'])
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
  it('同一天：appliedIntent 照留（state 層，伺服器洗不掉）', () => {
    seed({ intent: '想吃拉麵', appliedIntent: '想吃拉麵', tasks: [] })
    expect(loadDaily().appliedIntent).toBe('想吃拉麵')
  })
  it('舊存檔沒有 appliedIntent：沿用當日 intent（移轉——任務本來就是那份意圖長出來的）', () => {
    seed({ intent: '想吃拉麵', tasks: [] })
    expect(loadDaily().appliedIntent).toBe('想吃拉麵')
  })
  it('換天存檔：appliedIntent 跟 intent 一起歸零', () => {
    seed({ day: yesterdayTokyo(), intent: '想吃拉麵', appliedIntent: '想吃拉麵', tasks: [] })
    expect(loadDaily().appliedIntent).toBe('')
  })
})
