// 單頁狀態機 home→intake→cmd→(log|stand)；diary；weekly（第 4 節）。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CARD_BY_ID, MAJOR_IDS, MINOR_IDS, MODULE_BARKS, SCENE_BARKS } from './cards.ts'
import { OFFICER_BY_LEVEL } from './officers.ts'
import { Avatar } from './avatar.tsx'
import { InsigniaMark } from './insignia.tsx'
import { MemeCard, StepsCard } from './meme.tsx'
import {
  ApiError, ERROR_TEXT, GEO_DENIED_LINE, GEO_DOUBT_LINE, geoDoubt, getLocation, requestGeocode, requestOrder, requestWeekly, type GeoDoubt, type GeoReason,
  underPlacesCap, type GeoResult,
} from './api.ts'
import {
  allEntries, entriesInWeek, getWeekly, groupByDay, makeEntry, putEntry,
  recentOrders, saveWeekly, stats, timeLabel, weeklyDue, weekStartOf,
} from './diary.ts'
import { SHARE_FALLBACK, shareNode } from './share.ts'
import { clearDebug, formatCandidate, formatDebug, formatPick, formatPrice, readDebug, type DebugEntry } from './debug.ts'
import {
  cuisineStats, discoveryStats, markClosed, markDone, markNeverAgain, markNotThisKind, markRepeat, markShown, memSummary, setFav,
} from './placeMem.ts'
import { clearTrial, exportTrial, readTrial, recordTrial, summarize, tagTrial } from './trial.ts'
import {
  effectiveBudget, loadBudget, loadCountry, loadLastScene, loadStations, saveStation, loadNovelty, lunchHidesTop, nextNovelty, NOVELTY_LABEL,
  orderScenes, saveBudget, saveCountry, saveLastScene, saveNovelty, toggleBand,
} from './prefs.ts'
import { SCENE_KEY, SCENE_OTHER, SCENE_TEXT_KEY, SCENE_TEXT_MAX, sanitizeSceneText } from './scene.ts'
import { bandLabels, countryOf } from './price.ts'
import { Consent, CONSENT_KEY, CONSENT_VERSION } from './consent.tsx'
import { Privacy } from './privacy.tsx'
import { reportHref } from './report.ts'
import type {
  Band, Country, DiaryEntry, Level, ModuleCard, ModuleId, Novelty, Order, ReissueReason, WeeklyReport,
} from './types.ts'

type Screen = 'home' | 'scene' | 'intake' | 'waiting' | 'cmd' | 'log' | 'stand' | 'error' | 'diary' | 'weekly' | 'debug' | 'privacy'

const LEVEL_KEY = 'decide.level'

function loadLevel(): Level {
  try {
    const raw = localStorage.getItem(LEVEL_KEY)
    // 注意：Number(null) === 0，不能直接轉，否則新使用者會拿到 level 0。
    if (raw !== null) {
      const v = Number(raw)
      if (v === 0 || v === 1 || v === 2) return v
    }
  } catch { /* 無痕模式或被擋，用預設 */ }
  return 1 // 第 2 節：預設中檔
}

/** 首次同意（App Store 5.1.2(i)）：旗標是版本字串，換版本會再問一次。同意之前不呼叫任何 /api/*。 */
function hasConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION } catch { return false }
}

/** safe() 的逾時：IndexedDB 卡住時最多等這麼久就用 fallback，口令照出。 */
export const SAFE_TIMEOUT_MS = 800

/**
 * PlaceMem／IndexedDB 出錯（無痕模式、空間滿了）或卡住不回，都不能擋住口令——記憶是加分，不是主線。
 * 逾時用 fallback；逾時後才完成或才失敗的原 promise 一律吞掉。
 */
export function safe<T>(fn: () => Promise<T>, fallback: T, ms: number = SAFE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    const settle = (v: T) => { clearTimeout(t); resolve(v) }
    Promise.resolve().then(fn).then(settle, () => settle(fallback))
  })
}

type Loc = { lat: number; lng: number }
/** Round 6：出發點。label = 使用者自己報的「下車的站」站名（GPS 座標沒有 label）。 */
type Origin = Loc & { label?: string }
type MemModule = 'eat' | 'rest'
const isMemModule = (id: ModuleId): id is MemModule => id === 'eat' || id === 'rest'

export function App() {
  const [consented, setConsented] = useState(hasConsent)
  const [screen, setScreen] = useState<Screen>('home')
  const [level, setLevel] = useState<Level>(loadLevel)
  const [card, setCard] = useState<ModuleCard | null>(null)
  const [choices, setChoices] = useState<Record<string, string | number>>({})
  const [order, setOrder] = useState<Order | null>(null)
  const [reissued, setReissued] = useState(false)
  const [geoDenied, setGeoDenied] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)
  const [weeklyFailed, setWeeklyFailed] = useState(false)
  // ── Round 3 ──
  const [novelty, setNovelty] = useState<Novelty>(loadNovelty)
  const [country, setCountry] = useState<Country>(loadCountry)
  const [budgets, setBudgets] = useState<Record<'TW' | 'JP', Band[]>>(() => ({ TW: loadBudget('TW'), JP: loadBudget('JP') }))
  /** 這次 intake 解析到的位置——只活在記憶體，用來判斷午餐時段（當地時間）；不存。 */
  const [geoLoc, setGeoLoc] = useState<Loc | undefined>(undefined)
  const [reasonOpen, setReasonOpen] = useState(false)
  /** Round 5：「沒做」先問原因（不符合情境 → 不罰站；就是不想做 → 罰站）。 */
  const [skipOpen, setSkipOpen] = useState(false)
  /** Round 6：「從哪裡出發」底部選單。doubt 有值 = 送出時定位太舊／太粗，先問再派；loc 是那個可疑的座標。 */
  const [locOpen, setLocOpen] = useState<{ doubt?: GeoDoubt; loc?: Loc } | null>(null)
  /** Round 6：這道口令選的「下車的站」（null = 目前位置）。 */
  const [station, setStation] = useState<string | null>(null)
  const [stations, setStations] = useState<string[]>(loadStations)
  const [discovery, setDiscovery] = useState({ newPlaces: 0, revisits: 0 })
  const excluded = useRef<string[]>([])
  /** 這道口令已經說過「今天不想吃這類」的細類（換口令時送給伺服器降權）。 */
  const rejectedCuisines = useRef<string[]>([])
  /** 手動報座標換來的位置：只在這道口令的換口令之間沿用，不存本機（C2）。 */
  const manualLoc = useRef<Origin | undefined>(undefined)
  /** 這一道口令的時間戳，換口令時沿用，讓日記只留一筆（第 10 節）。 */
  const issuedAt = useRef<string>('')

  useEffect(() => { void allEntries().then(setEntries) }, [])

  /**
   * 第 10 節：同一週只算一次 API。
   * 快取有就用快取；沒有的話，只有「週日 20:00 後自動」或「使用者手動按」才會去打。
   */
  const loadWeekly = useCallback(async (force: boolean): Promise<void> => {
    const weekStart = weekStartOf(new Date())
    const cached = await getWeekly(weekStart)
    if (cached) { setWeekly(cached); setWeeklyFailed(false); return }
    if (!consented) return // 同意之前不呼叫 /api/*
    if (!force && !weeklyDue()) return
    try {
      const list = await allEntries()
      // B1：新占領／回防由本機 PlaceMem 算好，伺服器只轉述（週報只負責評論，不負責算）。
      const disc = await safe(() => discoveryStats(weekStart, Date.now()), undefined)
      const fetched = await requestWeekly({
        weekStart, level, entries: entriesInWeek(list, weekStart), ...(disc ? { discovery: disc } : {}),
      })
      // 快取鍵一律用本機算的 weekStart，不用伺服器回的，否則時區/時鐘一有落差就永遠 cache miss，
      // 每次開 app 都會再打一次 Claude。
      const report = { ...fetched, weekStart }
      await saveWeekly(report)
      setWeekly(report)
      setWeeklyFailed(false)
    } catch {
      setWeeklyFailed(true) // 第 11 節：週報失敗不擋其他功能
    }
  }, [level, consented])

  // 開 app 時若已過本週日 20:00 且還沒產過，就自動產一次。
  useEffect(() => { void loadWeekly(false) }, [loadWeekly])

  // 日記頁的「本週新占領／回防」：每次進日記重算（本機 PlaceMem，不打 API）。
  useEffect(() => {
    if (screen !== 'diary') return
    void safe(() => discoveryStats(weekStartOf(new Date()), Date.now()), { newPlaces: 0, revisits: 0 }).then(setDiscovery)
  }, [screen])

  const record = useCallback(async (outcome: DiaryEntry['outcome'], o: Order | null, c: ModuleCard | null, reason?: ReissueReason) => {
    if (!o || !c || !issuedAt.current) return
    // Round 3：日記不再寫店名（Google 條款），只留 place_id 以便之後對回 PlaceMem。
    // R2-01：只有吃／歇才寫 placeId 與 mode；其他卡就算模型帶了 place 也不記。
    const p = isMemModule(c.id) ? o.place : undefined
    tagTrial(c.id, outcome, reason) // Round 4 試用紀錄：這道口令後來怎麼了
    const list = await putEntry(
      makeEntry(issuedAt.current, c.id, level, o.meme.big, outcome, { placeId: p?.id, reason, mode: p?.mode }),
    )
    setEntries([...list].sort((a, b) => b.ts.localeCompare(a.ts)))
  }, [level])

  useEffect(() => {
    try { localStorage.setItem(LEVEL_KEY, String(level)) } catch { /* 忽略 */ }
  }, [level])

  const cycleOfficer = useCallback(() => setLevel((l) => ((l + 1) % 3) as Level), [])

  // 加速：定位常常要等 1–5 秒。進 intake 時就開始要，使用者挑選項的時間拿來等 GPS，按下去時通常已經有了。
  const geoAhead = useRef<Promise<GeoResult> | null>(null)

  const openIntake = useCallback((id: ModuleId) => {
    const c = CARD_BY_ID[id]
    const ahead = c.needsPlaces && underPlacesCap() ? getLocation() : null
    geoAhead.current = ahead
    setGeoLoc(undefined)
    // 定位一回來就依座標切預算 chips 的幣別（R3§4.3：看座標，不看手機語系）。
    if (ahead) {
      void ahead.then((r) => {
        if (geoAhead.current !== ahead || !r.loc) return // 已經被送出消耗掉，或使用者換了別張卡
        const cc = countryOf(r.loc)
        setGeoLoc(r.loc)
        setCountry(cc)
        saveCountry(cc)
      })
    }
    setCard(c)
    // bands 的值走 OrderRequest.budget，不放進 choices。
    setChoices(Object.fromEntries(c.intake.filter((f) => f.type !== 'bands').map((f) => [f.key, f.default])))
    setOrder(null)
    setReissued(false)
    setGeoDenied(false)
    setError(null)
    setReasonOpen(false)
    setSkipOpen(false)
    excluded.current = []
    rejectedCuisines.current = []
    manualLoc.current = undefined
    setStation(null)
    setLocOpen(null)
    issuedAt.current = ''
    // Round 5：吃／歇第一步先選情境（獨立一頁：原本的選單維持 ≤ 3 題、一屏放得下）。
    setScreen(c.intake.some((f) => f.type === 'scene') ? 'scene' : 'intake')
  }, [])

  const fetchOrder = useCallback(async (c: ModuleCard, ch: Record<string, string | number>, locOverride?: Origin) => {
    setScreen('waiting')
    setError(null)

    // 第 8 節：需要 Places 且今天還沒超過上限，才去要定位。
    // 手動報座標（C2）換來的位置優先，而且不再去問 GPS。
    if (c.needsPlaces && !underPlacesCap()) {
      recordTrial({ module: c.id, level, ok: false, error: 'over_cap' })
      setError(new ApiError('over_cap', ERROR_TEXT.over_cap.line))
      setScreen('error')
      return
    }
    let loc: Origin | undefined = locOverride ?? manualLoc.current
    let geoReason: GeoReason = 'ok'
    if (loc) {
      setGeoDenied(false)
    } else if (c.needsPlaces && underPlacesCap()) {
      const geo = await (geoAhead.current ?? getLocation())
      geoAhead.current = null // 用過即丟；換口令會重新要一次（maximumAge 30s，通常瞬間回）
      loc = geo.loc
      geoReason = geo.reason
      setGeoDenied(geo.denied)
      // Round 6：車上的定位常是上一站的或誤差幾百公尺。先問「在車上？」，不直接派店。
      const doubt = geoDoubt(geo)
      if (loc && doubt) {
        setLocOpen({ doubt, loc })
        setScreen('intake')
        return
      }
    } else {
      setGeoDenied(false)
    }
    // 2026-09-18：吃／歇沒定位就不能點真店，不再「班長用常識」降級——直接說要座標。
    // Round 6：分兩種——使用者拒絕（開定位）vs 地下收不到（報下車的站）。
    if (c.needsPlaces && !loc) {
      const kind = geoReason === 'denied' || geoReason === 'unsupported' ? 'no_location' : 'no_signal'
      recordTrial({ module: c.id, level, ok: false, error: kind })
      setError(new ApiError(kind, ERROR_TEXT[kind].line))
      setScreen('error')
      return
    }

    const now = Date.now()
    const here = loc ? countryOf(loc) : country
    if (loc) { setCountry(here); saveCountry(here) }

    // 預算只在「吃」、且國家是台日時才送；午餐時段看不到的最高檔也一起拿掉。
    const hideTop = lunchHidesTop(loc, new Date(now))
    const budget = c.id === 'eat' && (here === 'TW' || here === 'JP') ? effectiveBudget(budgets[here], hideTop) : []
    const memModule = isMemModule(c.id) ? c.id : null
    const mem = memModule ? await safe(() => memSummary(memModule, now), []) : []
    const cuisine = memModule ? await safe(cuisineStats, {}) : {}
    const hasScene = c.intake.some((f) => f.type === 'scene')
    const clean = Object.fromEntries(Object.entries(ch).filter(([k]) =>
      c.intake.some((f) => f.key === k && f.type !== 'bands')
      // 情境「其他」的手動輸入跟著送（只在選了「其他」時）。
      || (hasScene && k === SCENE_TEXT_KEY && ch[SCENE_KEY] === SCENE_OTHER)))
    if (SCENE_TEXT_KEY in clean) clean[SCENE_TEXT_KEY] = sanitizeSceneText(clean[SCENE_TEXT_KEY])

    try {
      const o = await requestOrder({
        module: c.id,
        level,
        choices: clean,
        loc,
        now: new Date(now).toISOString(),
        exclude: excluded.current.length ? [...excluded.current] : undefined,
        recentOrders: recentOrders(entries),
        ...(budget.length ? { budget } : {}),
        ...(memModule ? { novelty } : {}),
        ...(mem.length ? { mem } : {}),
        ...(Object.keys(cuisine).length ? { cuisine } : {}),
        ...(rejectedCuisines.current.length ? { rejectedCuisines: [...rejectedCuisines.current] } : {}),
      })
      if (!issuedAt.current) issuedAt.current = new Date().toISOString()
      // 修 STRATEGY §2⑦：拿到口令的當下就記 shown，不等使用者回報。
      // R2-05：不 await——IndexedDB 慢或卡住不能擋換畫面；失敗由 safe 吞掉。
      if (memModule && o.place?.id) {
        const p = o.place
        void safe(() => markShown(p.id, { module: memModule, brand: p.brand, cuisine: p.cuisine }, Date.now()), undefined)
      }
      setOrder(o)
      setScreen('cmd')
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('upstream', ERROR_TEXT.upstream.line))
      setScreen('error')
    }
  }, [level, entries, country, budgets, novelty])

  const submit = useCallback(() => {
    if (!card || !sceneReady(card, choices)) return
    const sc = choices[SCENE_KEY]
    if (typeof sc === 'string' && sc) saveLastScene(card.id, sc)
    void fetchOrder(card, choices)
  }, [card, choices, fetchOrder])

  /** Round 6：報「下車的站」→ /api/geocode → 當這道口令的出發點。站名記最近 5 個（不記座標）。 */
  const pickStation = useCallback(async (q: string): Promise<{ err: string } | { origin: Origin }> => {
    if (!underPlacesCap()) return { err: ERROR_TEXT.over_cap.line }
    try {
      const g = await requestGeocode(q)
      const origin: Origin = { ...g.loc, label: g.label }
      manualLoc.current = origin
      setStation(g.label)
      setStations(saveStation(g.label))
      setLocOpen(null)
      return { origin }
    } catch (e) {
      return { err: e instanceof ApiError ? ERROR_TEXT[e.kind].line : ERROR_TEXT.upstream.line }
    }
  }, [])

  /** C2：沒有定位時手動報地點。回傳錯誤文字（顯示在輸入列下面）；成功就直接重送，畫面會換掉。 */
  const reportLocation = useCallback(async (q: string): Promise<string | null> => {
    if (!card) return null
    const r = await pickStation(q)
    if ('err' in r) return r.err
    void fetchOrder(card, choices, r.origin)
    return null
  }, [card, choices, fetchOrder, pickStation])

  /** Round 6：選單上的「從哪裡出發」。送出前選站只換出發點；定位可疑時選站就直接派。 */
  const chooseStation = useCallback(async (q: string): Promise<string | null> => {
    const go = !!locOpen?.doubt
    const r = await pickStation(q)
    if ('err' in r) return r.err
    if (go && card) void fetchOrder(card, choices, r.origin)
    return null
  }, [card, choices, fetchOrder, locOpen, pickStation])

  const useCurrent = useCallback(() => {
    const doubtLoc = locOpen?.loc
    manualLoc.current = undefined
    setStation(null)
    setLocOpen(null)
    // 定位可疑但使用者說就用它：帶著這個座標直接派（不再問一次）。
    if (doubtLoc && card) void fetchOrder(card, choices, doubtLoc)
  }, [card, choices, fetchOrder, locOpen])

  /** 換一家。吃／歇要先問原因（底部選單），其他卡（去／飛）維持原樣直接換。 */
  const reissue = useCallback(() => {
    if (!card || reissued) return
    if (card.needsPlaces) { setReasonOpen(true); return }
    setReissued(true) // 第 10 節：一次口令最多換 1 次
    void record('reissued', order, card)
    void fetchOrder(card, choices)
  }, [card, choices, fetchOrder, order, record, reissued])

  /** 每一個原因都會改變 PlaceMem 或細類統計（T8）：換口令不是無代價的重抽，是在教班長。 */
  const reissueWith = useCallback(async (reason: ReissueReason) => {
    setReasonOpen(false)
    if (!card || reissued) return
    const id = order?.place?.id
    const cuisineKey = order?.place?.cuisine
    const m = isMemModule(card.id) ? card.id : 'eat'
    const now = Date.now()
    if (id) {
      if (reason === 'closed') await safe(() => markClosed(id, now, m), undefined)
      else if (reason === 'never_again') await safe(() => markNeverAgain(id, now, m), undefined)
      else if (reason === 'repeat') await safe(() => markRepeat(id, now, m), undefined)
      else if (reason === 'price') { /* 價格不對：不動記憶，只在這次排除；原因記進日記與試用紀錄 */ }
      else {
        await safe(() => markNotThisKind(cuisineKey), undefined)
        if (cuisineKey && !rejectedCuisines.current.includes(cuisineKey)) rejectedCuisines.current.push(cuisineKey)
      }
      excluded.current.push(id)
    }
    setReissued(true) // 第 10 節：一次口令最多換 1 次
    void record('reissued', order, card, reason)
    void fetchOrder(card, choices)
  }, [card, choices, fetchOrder, order, record, reissued])

  const done = useCallback(() => {
    void record('done', order, card)
    // 去過：記 done、細類偏好 a += 1。「沒做」（skip）不動 PlaceMem——不服從是行為問題，不是店的問題。
    const p = order?.place
    if (card && isMemModule(card.id) && p?.id) {
      const m = card.id
      void safe(() => markDone(p.id, p.cuisine, Date.now(), m), undefined)
    }
    setScreen('log')
  }, [card, order, record])

  /** 沒做：有情境的卡（吃／歇）先問原因；其他卡照舊直接罰站。 */
  const skip = useCallback(() => {
    if (card?.intake.some((f) => f.type === 'scene')) { setSkipOpen(true); return }
    void record('punished', order, card)
    setScreen('stand')
  }, [card, order, record])

  const refuse = useCallback(() => {
    setSkipOpen(false)
    void record('punished', order, card)
    setScreen('stand')
  }, [card, order, record])

  /**
   * Round 5（Cross 2026-11-01「使用者按沒做很冤枉」）：派的不符合情境 → 不罰站、不算服從率，記進日記與試用紀錄；
   * 回到選單、情境清空重選。這家這次排除（這一輪換口令之間），其他選項保留。
   */
  const mismatch = useCallback(() => {
    setSkipOpen(false)
    void record('mismatch', order, card)
    const id = order?.place?.id
    if (id && !excluded.current.includes(id)) excluded.current.push(id)
    setChoices((c) => { const { [SCENE_TEXT_KEY]: _t, ...rest } = c; return { ...rest, [SCENE_KEY]: '' } })
    setOrder(null)
    setReissued(false)
    setError(null)
    issuedAt.current = '' // 重選情境後是新的一道口令，日記另記一筆
    if (card?.needsPlaces && underPlacesCap()) geoAhead.current = getLocation()
    setScreen('scene')
  }, [card, order, record])

  const goHome = useCallback(() => setScreen('home'), [])

  const cycleNovelty = useCallback(() => {
    setNovelty((n) => { const next = nextNovelty(n); saveNovelty(next); return next })
  }, [])

  const hideTop = lunchHidesTop(geoLoc, new Date())
  const changeBudget = useCallback((n: Band | null) => {
    if (country !== 'TW' && country !== 'JP') return
    // R2-11：用存好的原始檔位算，不用午餐時段被濾掉最高檔的版本——午餐點一下不會刪掉存好的最高檔。
    // effectiveBudget 只在「顯示」與「送出」時套。
    const next = n === null ? [] : toggleBand(budgets[country], n)
    saveBudget(country, next)
    setBudgets((prev) => ({ ...prev, [country]: next }))
  }, [budgets, country])

  const [consentPrivacy, setConsentPrivacy] = useState(false)
  const accept = useCallback(() => {
    try { localStorage.setItem(CONSENT_KEY, CONSENT_VERSION) } catch { /* 寫不進去就只在這次有效 */ }
    setConsented(true)
  }, [])

  if (!consented) {
    return (
      <>
        <main data-level={level}>
          {consentPrivacy
            ? <Privacy onBack={() => setConsentPrivacy(false)} />
            : <Consent level={level} onAccept={accept} onPrivacy={() => setConsentPrivacy(true)} />}
        </main>
        <footer><span>班長有什麼了不起？— 你小學當的那個不算。</span></footer>
      </>
    )
  }

  return (
    <>
      <main data-level={level}>
        {screen === 'home' && (
          <Home
            level={level} novelty={novelty} onCycle={cycleOfficer} onPick={openIntake} onNovelty={cycleNovelty}
            onDiary={() => setScreen('diary')} onDebug={() => setScreen('debug')} onPrivacy={() => setScreen('privacy')}
          />
        )}
        {screen === 'privacy' && <Privacy onBack={goHome} />}
        {screen === 'scene' && card && (
          <ScenePick
            card={card} level={level} value={String(choices[SCENE_KEY] ?? '')} text={String(choices[SCENE_TEXT_KEY] ?? '')}
            onPick={(o) => {
              setChoices((c) => { const { [SCENE_TEXT_KEY]: t, ...rest } = c; return o === SCENE_OTHER ? { ...rest, [SCENE_KEY]: o, ...(t !== undefined ? { [SCENE_TEXT_KEY]: t } : {}) } : { ...rest, [SCENE_KEY]: o } })
              if (o !== SCENE_OTHER) setScreen('intake')
            }}
            onText={(t) => setChoices((c) => ({ ...c, [SCENE_TEXT_KEY]: t }))}
            onNext={() => { if (sceneReady(card, choices)) setScreen('intake') }}
            onBack={goHome}
          />
        )}
        {screen === 'intake' && card && (
          <Intake
            card={card} level={level} choices={choices}
            onChange={(k, v) => setChoices((c) => ({ ...c, [k]: v }))}
            onBack={goHome} onSubmit={submit} onScene={() => setScreen('scene')}
            origin={card.needsPlaces ? (station ?? '目前位置') : undefined} onOrigin={() => setLocOpen({})}
            country={country} budget={effectiveBudget(country === 'TW' || country === 'JP' ? budgets[country] : [], hideTop)}
            hideTop={hideTop} onBudget={changeBudget}
          />
        )}
        {screen === 'waiting' && <Waiting level={level} />}
        {screen === 'error' && error && (
          <ErrorScreen
            level={level} error={error} onRetry={submit} onHome={goHome} onDiary={() => setScreen('diary')}
            onManualLoc={error.kind === 'no_location' || error.kind === 'no_signal' ? reportLocation : undefined}
            stations={stations}
          />
        )}
        {screen === 'cmd' && card && order && (
          <Cmd
            card={card} level={level} order={order} geoDenied={geoDenied}
            canReissue={!reissued && !!card.reissueLabel}
            onDone={done} onReissue={reissue} onSkip={skip}
          />
        )}
        {screen === 'log' && order && <LogScreen level={level} order={order} onHome={goHome} onFav={card && isMemModule(card.id) ? (id) => { const m = card.id as MemModule; return setFav(id, true, m) } : undefined} />}
        {screen === 'stand' && <Stand level={level} onDone={goHome} />}
        {screen === 'diary' && (
          <Diary
            level={level} entries={entries} weeklyFailed={weeklyFailed} discovery={discovery} onBack={goHome}
            onWeekly={() => { void loadWeekly(true); setScreen('weekly') }}
          />
        )}
        {screen === 'weekly' && (
          <Weekly
            level={level} report={weekly} failed={weeklyFailed}
            onBack={() => setScreen('diary')} onHome={goHome}
          />
        )}
        {screen === 'debug' && <Debug level={level} onHome={goHome} />}
        {locOpen && card && (
          <LocSheet doubt={locOpen.doubt} stations={stations} onCurrent={useCurrent} onPick={chooseStation} onClose={() => setLocOpen(null)} />
        )}
        {skipOpen && card && (
          <Sheet title="為什麼沒做？" sub="照實報告，班長不冤枉人。" onClose={() => setSkipOpen(false)} testid="skip-sheet">
            <button className="sheet-opt" data-testid="skip-mismatch" onClick={mismatch}>
              <b>不符合我現在的情境</b><span>不罰站。重選情境，班長重派</span>
            </button>
            <button className="sheet-opt" data-testid="skip-refuse" onClick={refuse}>
              <b>我就是不想做</b><span>照規矩罰站</span>
            </button>
            <button className="sheet-cancel" data-testid="skip-cancel" onClick={() => setSkipOpen(false)}>我再想想</button>
          </Sheet>
        )}
        {reasonOpen && card && (
          <Sheet title="報告原因，班長記下。" onClose={() => setReasonOpen(false)} testid="reason-sheet">
            <button className="sheet-opt" data-testid="reason-closed" onClick={() => void reissueWith('closed')}>
              <b>店關了</b><span>24 小時內不再派這家</span>
            </button>
            {card.id !== 'rest' && (
              <button className="sheet-opt" data-testid="reason-kind" onClick={() => void reissueWith('not_this_kind')}>
                <b>今天不想吃這類</b><span>今天少派這一類，班長記一筆</span>
              </button>
            )}
            <button className="sheet-opt" data-testid="reason-repeat" onClick={() => void reissueWith('repeat')}>
              <b>又是這家</b><span>14 天不派這家</span>
            </button>
            {card.id === 'eat' && (
              <button className="sheet-opt" data-testid="reason-price" onClick={() => void reissueWith('price')}>
                <b>價格不對</b><span>這次換掉，班長記一筆</span>
              </button>
            )}
            <button className="sheet-opt" data-testid="reason-never" onClick={() => void reissueWith('never_again')}>
              <b>這家不要再來</b><span>90 天不見；再按一次就永遠不見</span>
            </button>
            <button className="sheet-cancel" data-testid="reason-cancel" onClick={() => setReasonOpen(false)}>不換了</button>
          </Sheet>
        )}
      </main>
      <footer>
        <span>班長有什麼了不起？— 你小學當的那個不算。</span>
      </footer>
    </>
  )
}

const LONG_PRESS_MS = 700

/**
 * 長按名牌（不是頭像，頭像是換班長用的）→ 除錯畫面。
 * 藏起來是刻意的：這是給 Cross 查問題用的，不是給使用者的功能。
 */
function useLongPress(onLongPress?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])
  useEffect(() => cancel, [cancel]) // 元件被換掉時不要留下計時器
  if (!onLongPress) return {}
  return {
    onPointerDown: () => { cancel(); timer.current = setTimeout(() => { timer.current = null; onLongPress() }, LONG_PRESS_MS) },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // iOS 長按預設會跳選字／放大鏡，擋掉才按得出來
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}

function OfficerPlate({ level, mood, onCycle, onLongPress, meta, tap }: {
  level: Level; mood: 'idle' | 'bark'; onCycle?: () => void; onLongPress?: () => void
  meta?: string; tap?: boolean
}) {
  const o = OFFICER_BY_LEVEL[level]
  const press = useLongPress(onLongPress)
  return (
    <div className="officer">
      {onCycle ? (
        <button className="avatar-button" onClick={onCycle} aria-label="點頭像換班長">
          <Avatar key={level} className="av" level={level} mood={mood} />
        </button>
      ) : <Avatar className="av" level={level} mood={mood} />}
      <div className="plate" data-testid="plate" {...press}>
        <span className="rank"><InsigniaMark insignia={o.insignia} title={o.rank} />{o.rank} {o.duty}</span>
        <div className="name" data-testid="officer-name">{o.name}</div>
        {meta && <div className="meta">{meta}</div>}
        {tap && <div className="tap">點頭像換班長</div>}
      </div>
    </div>
  )
}

function Home({ level, novelty = 'balanced', onCycle, onPick, onDiary, onDebug, onNovelty, onPrivacy }: {
  level: Level; novelty?: Novelty; onCycle: () => void; onPick: (id: ModuleId) => void
  onDiary: () => void; onDebug: () => void; onNovelty?: () => void; onPrivacy?: () => void
}) {
  const o = OFFICER_BY_LEVEL[level]
  return (
    <section className="screen" data-screen="home">
      <OfficerPlate level={level} mood="idle" onCycle={onCycle} onLongPress={onDebug} meta="決斷連 · 大事不受理" tap />
      <div className="topnav">
        {onNovelty && (
          <button
            className="nov" data-testid="novelty" onClick={onNovelty}
            aria-label={`偵察方針：${NOVELTY_LABEL[novelty]}，點一下切換`}
          >{NOVELTY_LABEL[novelty]}</button>
        )}
        <button onClick={onDiary}>新兵日記</button>
      </div>
      <div className="bubble" data-testid="bubble">
        {o.hello}
        {o.helloSub && <small>{o.helloSub}</small>}
      </div>
      <div className="grid">
        {MAJOR_IDS.map((id) => {
          const c = CARD_BY_ID[id]
          return (
            <button key={id} className="tile" data-card={id} onClick={() => onPick(id)}>
              <b>{c.title}</b><span>{c.subtitle}</span>
            </button>
          )
        })}
      </div>
      <div className="minor">
        {MINOR_IDS.map((id) => (
          <button key={id} data-card={id} onClick={() => onPick(id)}>{CARD_BY_ID[id].title}</button>
        ))}
      </div>
      <p className="hint">大事不受理。班長只管小事，大事你自己去找連長。</p>
      {onPrivacy && <button className="linkbtn" data-testid="privacy-link" onClick={onPrivacy}>隱私</button>}
    </section>
  )
}

/** 金額區間只准在「〜／–」後面折行，不准把 2,500 折成 2,／500。不用 lookbehind：舊版 iOS Safari 會整包解析失敗。 */
function breakAfterDash(label: string) {
  const parts = label.split(/([〜–])/)
  const out: (string | ReturnType<typeof Wbr>)[] = []
  for (let i = 0; i < parts.length; i++) {
    out.push(parts[i]!)
    if (parts[i] === '〜' || parts[i] === '–') out.push(Wbr(i))
  }
  return out
}
function Wbr(key: number) { return <wbr key={`w${key}`} /> }

/** 有情境的卡（吃／歇）：情境必選；選「其他」要打字（Round 5）。沒有情境欄位的卡一律 true。 */
export function sceneReady(card: Pick<ModuleCard, 'intake'>, choices: Record<string, string | number>): boolean {
  if (!card.intake.some((f) => f.type === 'scene')) return true
  const sc = choices[SCENE_KEY]
  if (typeof sc !== 'string' || !sc) return false
  return sc !== SCENE_OTHER || sanitizeSceneText(choices[SCENE_TEXT_KEY]) !== ''
}

/**
 * Round 5 第一步：情境（吃／歇）。點一個預設就直接進下一步；「其他」展開輸入框（≤ 20 字）＋「下一步」。
 * 上次選的排第一個，但不幫使用者選。順序在進畫面時決定，點選時不跳動。
 */
function ScenePick({ card, level, value, text, onPick, onText, onNext, onBack }: {
  card: ModuleCard; level: Level; value: string; text: string
  onPick: (o: string) => void; onText: (t: string) => void; onNext: () => void; onBack: () => void
}) {
  const field = card.intake.find((f) => f.type === 'scene')
  const [opts] = useState(() => orderScenes(field?.options ?? [], loadLastScene(card.id), SCENE_OTHER))
  const ready = sceneReady(card, { [SCENE_KEY]: value, [SCENE_TEXT_KEY]: text })
  return (
    <section className="screen" data-screen="scene">
      <OfficerPlate level={level} mood="bark" />
      <button className="back" onClick={onBack}>← 回報告</button>
      <div className="bubble" data-testid="bubble">{SCENE_BARKS[level]}</div>
      <div>
        <p className="lab">{card.title} · 情境<small className="req">必選</small></p>
        <div className="chips scene-chips" data-field={SCENE_KEY} role="group" aria-label="情境">
          {opts.map((o) => (
            <button key={o} className="chip" aria-pressed={value === o} onClick={() => onPick(o)}>{o}</button>
          ))}
        </div>
        {value === SCENE_OTHER && (
          <form className="manual-in scene-in" onSubmit={(e) => { e.preventDefault(); onNext() }}>
            <input
              data-testid="scene-text" type="text" enterKeyHint="next" autoComplete="off" maxLength={SCENE_TEXT_MAX}
              aria-label="你的情境" placeholder="例如：有插座、安靜、吃到飽" value={text} autoFocus
              onChange={(e) => onText(e.target.value)}
            />
            <button className="btn" type="submit" data-testid="scene-next" disabled={!ready}>下一步</button>
          </form>
        )}
        {value === SCENE_OTHER && !ready && (
          <p className="hint scene-need" data-testid="scene-required">寫一下你的情境（{SCENE_TEXT_MAX} 字內），班長才派得準。</p>
        )}
      </div>
    </section>
  )
}

function Intake({ card, level, choices, onChange, onBack, onSubmit, onScene, origin, onOrigin, country = 'TW', budget = [], hideTop = false, onBudget }: {
  card: ModuleCard; level: Level; choices: Record<string, string | number>
  onChange: (k: string, v: string | number) => void; onBack: () => void; onSubmit: () => void
  /** Round 5：回第一步改情境（只有吃／歇）。 */
  onScene?: () => void
  /** Round 6：出發點標籤（「目前位置」或站名）；undefined = 這張卡不用定位，不顯示。 */
  origin?: string; onOrigin?: () => void
  /** 預算 chips 的幣別看座標（不看手機語系）；other = 整列隱藏。 */
  country?: Country; budget?: Band[]; hideTop?: boolean; onBudget?: (n: Band | null) => void
}) {
  const ready = sceneReady(card, choices)
  const hasScene = card.intake.some((f) => f.type === 'scene')
  // Round 5：從情境頁進來時捲動位置是 0（情境頁比較短），375×667 的送出鍵會掉出第一屏約 20px。
  // 進畫面時若送出鍵不在第一屏，就捲到剛好看得到（使用者不用自己捲）。
  const submitRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = submitRow.current
    if (!el) return
    const over = el.getBoundingClientRect().bottom - window.innerHeight
    if (over > 0) window.scrollBy(0, over + 8)
  }, [])
  const sc = String(choices[SCENE_KEY] ?? '')
  const scLabel = sc === SCENE_OTHER ? sanitizeSceneText(choices[SCENE_TEXT_KEY]) || SCENE_OTHER : sc
  return (
    <section className="screen" data-screen="intake">
      <OfficerPlate level={level} mood="bark" />
      {/* 情境標籤跟返回鍵同一行：不加高度（選單仍要一屏放得下）。 */}
      <div className="intake-top">
        <button className="back" onClick={onBack}>← 回報告</button>
        {hasScene && (
          <button className="scene-tag" data-testid="scene-change" onClick={onScene}>
            情境：{scLabel || '未選'}<span aria-hidden="true">　改</span>
          </button>
        )}
        {origin !== undefined && (
          <button className="scene-tag loc-tag" data-testid="loc-change" onClick={onOrigin} aria-label={`出發點：${origin}，改`}>
            📍{origin}
          </button>
        )}
      </div>
      <div className="bubble" data-testid="bubble">{MODULE_BARKS[card.id][level]}</div>
      <div>
        {card.intake.map((f) => {
          if (f.type === 'scene') return null // 第一步（ScenePick）選過了
          if (f.type === 'bands' && bandLabels(country).length === 0) return null // 台日以外：沒有幣別，整列隱藏
          return (
          <div key={f.key}>
            <p className="lab">{f.label}</p>
            {f.type === 'bands' ? (
              // 價位檔（每人每餐）：「不限」＋ 4 檔，多選只准相鄰。chips 文字是金額，不用 $$$。
              <div className="chips bands" data-field={f.key} data-country={country}>
                <button className="chip" aria-pressed={budget.length === 0} onClick={() => onBudget?.(null)}>不限</button>
                {bandLabels(country).filter((b) => !(hideTop && b.band === 4)).map((b) => (
                  <button
                    key={b.band} className="chip" data-band={b.band} aria-pressed={budget.includes(b.band)}
                    onClick={() => onBudget?.(b.band)}
                  >{breakAfterDash(b.label)}</button>
                ))}
              </div>
            ) : f.type === 'stars' ? (
              <div className="stars" data-field={f.key}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n} className={n <= Number(choices[f.key] ?? f.default) ? 'lit' : ''}
                    aria-label={`${n} 星`} aria-pressed={n === Number(choices[f.key] ?? f.default)} onClick={() => onChange(f.key, n)}
                  >★</button>
                ))}
              </div>
            ) : (
              <div className="chips" data-field={f.key}>
                {(f.options ?? []).map((o) => (
                  <button
                    key={o} className="chip" aria-pressed={choices[f.key] === o}
                    onClick={() => onChange(f.key, o)}
                  >{o}</button>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
      <div className="row" ref={submitRow}><button className="btn" onClick={onSubmit} disabled={!ready}>是！班長</button></div>
    </section>
  )
}

function Waiting({ level }: { level: Level }) {
  return (
    <section className="screen" data-screen="waiting">
      <OfficerPlate level={level} mood="bark" />
      <div className="waiting">
        <div className="dots" data-testid="waiting">班長在想……</div>
        <div className="hint">一個口令一個動作。等著。</div>
      </div>
    </section>
  )
}

/** C2：沒有定位時手動報座標。輸入車站或地標 → /api/geocode → 用回來的位置重送（不存本機）。 */
function ManualLoc({ onGo, label = '下車的站或地標' }: { onGo: (q: string) => Promise<string | null>; label?: string }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const v = q.trim()
    if (!v || busy) return
    setBusy(true)
    setErr('')
    const msg = await onGo(v)
    if (msg) { setErr(msg); setBusy(false) } // 成功的話畫面已經換掉，不用再動狀態
  }
  return (
    <form className="manual" data-testid="manual-loc-row" onSubmit={(e) => void go(e)}>
      <label className="lab" htmlFor="manual-loc">{label}</label>
      <div className="manual-in">
        <input
          id="manual-loc" data-testid="manual-loc" type="text" inputMode="search" enterKeyHint="go"
          autoComplete="off" maxLength={60} placeholder="例如：新宿駅、台北車站" value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" type="submit" data-testid="manual-loc-go" disabled={busy || !q.trim()}>{busy ? '查詢中' : '報座標'}</button>
      </div>
      {err && <p className="manual-err" role="alert" data-testid="manual-loc-error">{err}</p>}
    </form>
  )
}

function ErrorScreen({ level, error, onRetry, onHome, onDiary, onManualLoc, stations = [] }: {
  level: Level; error: ApiError; onRetry: () => void; onHome: () => void; onDiary: () => void
  onManualLoc?: (q: string) => Promise<string | null>
  /** Round 6：最近報過的站，一鍵再用。 */
  stations?: string[]
}) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const tap = async (name: string) => {
    if (!onManualLoc || busy) return
    setBusy(name); setErr('')
    const msg = await onManualLoc(name)
    if (msg) { setErr(msg); setBusy('') }
  }
  const t = ERROR_TEXT[error.kind]
  return (
    <section className="screen" data-screen="error">
      <button className="back" onClick={onHome}>← 回報告</button>
      <OfficerPlate level={level} mood="bark" />
      <div className="notice" data-testid="error-line">
        {t.line}
        {t.sub && <small>{t.sub}</small>}
      </div>
      {onManualLoc && stations.length > 0 && (
        <div className="chips loc-recent" data-testid="loc-recent" aria-label="最近報過的站">
          {stations.map((s) => <button key={s} className="chip" disabled={!!busy} onClick={() => void tap(s)}>{busy === s ? '查詢中' : s}</button>)}
        </div>
      )}
      {err && <p className="manual-err" role="alert">{err}</p>}
      {onManualLoc && <ManualLoc onGo={onManualLoc} />}
      <div className="row">
        <button className="btn" data-testid="retry" onClick={onRetry}>再報告一次</button>
        <button className="btn line" onClick={onDiary}>看日記</button>
      </div>
    </section>
  )
}

function Cmd({ card, level, order, canReissue, geoDenied, onDone, onReissue, onSkip }: {
  card: ModuleCard; level: Level; order: Order; canReissue: boolean; geoDenied: boolean
  onDone: () => void; onReissue: () => void; onSkip: () => void
}) {
  return (
    <section className="screen" data-screen="cmd">
      {geoDenied && <div className="notice" data-testid="geo-denied">{GEO_DENIED_LINE}</div>}
      <MemeCard
        tone={order.verdict === 'stop' ? 'red' : 'olive'}
        tag="決斷連 · 一個口令一個動作"
        top={order.meme.top} big={order.meme.big} bot={order.meme.bot}
        level={level} mood="bark"
      />
      <StepsCard steps={order.steps} place={order.place} />
      {/* C3（App Store 1.2）：檢舉不當口令。mailto 就夠，不需要後端；極小文字，不是第二個動作。 */}
      <p className="report"><a href={reportHref(order, level)} target="_blank" rel="noopener noreferrer" data-testid="report-link">回報這道口令</a></p>
      <div className="row">
        <button className="btn" onClick={onDone}>報告班長，完成</button>
        {canReissue && <button className="btn line" data-testid="reissue" onClick={onReissue}>{card.reissueLabel}</button>}
        <button className="btn ghost" onClick={onSkip}>沒做</button>
      </div>
    </section>
  )
}

function LogScreen({ level, order, onHome, onFav }: {
  level: Level; order: Order; onHome: () => void
  /** 列入愛店（只有吃／歇的口令有）。 */
  onFav?: (placeId: string) => Promise<void> | void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shareNote, setShareNote] = useState('')
  const [faved, setFaved] = useState(false)
  const placeId = order.place?.id

  const share = useCallback(async () => {
    const node = cardRef.current?.querySelector('.meme') as HTMLElement | null
    if (!node) return
    const r = await shareNode(node, 'dengji.png')
    if (r !== 'shared') setShareNote(SHARE_FALLBACK)
  }, [])

  return (
    <section className="screen" data-screen="log">
      <div ref={cardRef}>
        <MemeCard
          tone="ok" tag="莒光日 · 榮譽榜" top="登記" big={order.log} bot="雄壯！威武！"
          level={level} mood="praise"
        />
      </div>
      {shareNote && <p className="hint" data-testid="share-note">{shareNote}</p>}
      <div className="row">
        <button className="btn" onClick={onHome}>解散</button>
        <button className="btn line" onClick={() => void share()}>分享梗圖</button>
        {onFav && placeId && (
          <button
            className="btn line" data-testid="fav" aria-pressed={faved} disabled={faved}
            onClick={() => { setFaved(true); void Promise.resolve(onFav(placeId)).catch(() => setFaved(false)) }}
          >{faved ? '已列入愛店' : '列入愛店'}</button>
        )}
      </div>
    </section>
  )
}

function Stand({ level, onDone }: { level: Level; onDone: () => void }) {
  const p = OFFICER_BY_LEVEL[level].punishment
  const [n, setN] = useState(p.count)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.max(0, v - 1)), p.stepMs)
    return () => clearInterval(t)
  }, [p.stepMs])
  useEffect(() => {
    if (n !== 0) return
    // 留 420ms 顯示零與解除色；不增加倒數次數，也不新增操作。
    const t = setTimeout(() => done.current(), 420)
    return () => clearTimeout(t)
  }, [n])
  return (
    <section className="screen" data-screen="stand">
      <MemeCard
        tone={n === 0 ? 'olive' : 'red'} tag="決斷連 · 違紀登記" total={p.count}
        top={`${p.action}，${p.countLabel}！數給我聽！`} number={n} bot={p.line}
        level={level} mood={n === 0 ? 'idle' : 'punish'}
      />
    </section>
  )
}

const OUTCOME_LABEL: Record<DiaryEntry['outcome'], [string, string]> = {
  done: ['完成', 'ok'],
  reissued: ['換口令', 're'],
  punished: ['罰則', 'bad'],
  mismatch: ['不符情境', 'mis'],
}

const entryLabel = (e: DiaryEntry): string => e.placeName ?? e.big

// 日記長按選單的兩個動作：列入愛店／不再推薦（寫進 PlaceMem）。
function useDiaryAction(
  picked: DiaryEntry | null, setPicked: (e: DiaryEntry | null) => void, setNote: (s: string) => void,
) {
  return (kind: 'fav' | 'never') => {
    const e = picked
    setPicked(null)
    if (!e?.placeId) return
    const m: MemModule = e.module === 'rest' ? 'rest' : 'eat'
    const id = e.placeId
    void (async () => {
      const ok = await safe(async () => {
        if (kind === 'fav') await setFav(id, true, m)
        else await markNeverAgain(id, Date.now(), m)
        return true
      }, false)
      setNote(ok ? (kind === 'fav' ? '班長記下了：這家列入愛店。' : '班長記下了：這家不再派你去。') : '這次沒記成，再長按一次。')
    })()
  }
}

function DiaryRow({ e, onLongPress }: { e: DiaryEntry; onLongPress?: (e: DiaryEntry) => void }) {
  const press = useLongPress(e.placeId && onLongPress ? () => onLongPress(e) : undefined)
  return (
    <div className="ent" data-testid="entry" {...press}>
      <time>{timeLabel(e.ts)}</time>
      <span className="o">{CARD_BY_ID[e.module].title} · {entryLabel(e)}</span>
      <span className={`r ${OUTCOME_LABEL[e.outcome][1]}`}>{OUTCOME_LABEL[e.outcome][0]}</span>
    </div>
  )
}

function Diary({ level, entries, weeklyFailed, discovery, onBack, onWeekly }: {
  level: Level; entries: DiaryEntry[]; weeklyFailed: boolean; discovery?: { newPlaces: number; revisits: number }
  onBack: () => void; onWeekly: () => void
}) {
  const s = stats(entries)
  const days = groupByDay(entries)
  const [picked, setPicked] = useState<DiaryEntry | null>(null)
  const [note, setNote] = useState('')
  const act = useDiaryAction(picked, setPicked, setNote)
  return (
    <section className="screen" data-screen="diary">
      <OfficerPlate level={level} mood="idle" meta="每一道口令自動登記。不用寫，班長替你寫。" />
      <button className="back" onClick={onBack}>← 回報告</button>
      <div className="diary-title"><span className="lab">新兵日記</span></div>
      <div className="stats" data-testid="stats">
        <div className="stat"><b data-testid="stat-orders">{s.orders}</b><span>道口令</span></div>
        <div className="stat"><b data-testid="stat-rate">{s.complianceRate}%</b><span>服從率</span></div>
        <div className="stat"><b data-testid="stat-punish">{s.punishments}</b><span>次罰則</span></div>
      </div>
      {discovery && (
        <div className="stats two" data-testid="stats-discovery">
          <div className="stat"><b data-testid="stat-new">{discovery.newPlaces}</b><span>本週新占領</span></div>
          <div className="stat"><b data-testid="stat-revisit">{discovery.revisits}</b><span>本週回防</span></div>
        </div>
      )}
      <div data-testid="days">
        {days.length === 0 && (
          <p className="empty">還沒有紀錄。去按一顆鍵，班長會替你寫第一筆。</p>
        )}
        {days.map((d) => (
          <div className="day" key={d.label}>
            <h4>{d.label}</h4>
            {d.entries.map((e) => <DiaryRow key={e.id} e={e} onLongPress={setPicked} />)}
          </div>
        ))}
      </div>
      {weeklyFailed && <div className="notice" data-testid="weekly-failed">本週講評延後，班長還在寫。</div>}
      {note && <p className="hint" role="status" data-testid="diary-note">{note}</p>}
      <div className="row"><button className="btn" onClick={onWeekly}>看本週莒光園地</button></div>
      {picked && (
        <Sheet title={entryLabel(picked)} sub="班長替這家記一筆" onClose={() => setPicked(null)} testid="diary-sheet">
          <button className="sheet-opt" data-testid="diary-fav" onClick={() => act('fav')}>
            <b>列入愛店</b><span>「熟門熟路」時優先派你回去</span>
          </button>
          <button className="sheet-opt" data-testid="diary-never" onClick={() => act('never')}>
            <b>不再推薦</b><span>90 天不見；再按一次就永遠不見</span>
          </button>
          <button className="sheet-cancel" onClick={() => setPicked(null)}>算了</button>
        </Sheet>
      )}
    </section>
  )
}

function Weekly({ level, report, failed, onBack, onHome }: {
  level: Level; report: WeeklyReport | null; failed: boolean; onBack: () => void; onHome: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shareNote, setShareNote] = useState('')

  const share = useCallback(async () => {
    const node = cardRef.current?.querySelector('.meme') as HTMLElement | null
    if (!node) return
    const r = await shareNode(node, 'juguang.png')
    if (r !== 'shared') setShareNote(SHARE_FALLBACK)
  }, [])

  return (
    <section className="screen" data-screen="weekly">
      <button className="back" onClick={onBack}>← 回日記</button>
      <div ref={cardRef}>
        {report ? (
          <MemeCard
            wide tone="ok"
            tag={`莒光園地 · ${new Date(report.weekStart).toLocaleDateString('zh-TW')} 起 · 週日 20:00 發布`}
            top="本週講評" bot={report.verdict} level={level} mood="idle"
          >
            <div className="weekly-score">
              <strong>{report.stats.complianceRate}<span>%</span></strong>
              <span>服從率</span>
              <small>{report.stats.orders} 道口令 · {report.stats.punishments} 次罰則</small>
              {report.stats.newPlaces !== undefined && report.stats.revisits !== undefined && (
                <small data-testid="weekly-discovery">本週新占領 {report.stats.newPlaces} 個據點 · 回防 {report.stats.revisits} 次</small>
              )}
            </div>
            <div className="wkbody" data-testid="weekly-body">{report.body}</div>
          </MemeCard>
        ) : (
          <div className="notice" data-testid="weekly-pending">
            {failed ? '本週講評延後，班長還在寫。' : '班長還在寫本週講評。'}
            <small>週日 20:00 後開 app 會自動產出，也可以在日記頁手動叫。</small>
          </div>
        )}
      </div>
      {shareNote && <p className="hint" data-testid="share-note">{shareNote}</p>}
      <div className="row">
        {report && <button className="btn line" onClick={() => void share()}>分享週報</button>}
        <button className="btn" onClick={onHome}>解散</button>
      </div>
    </section>
  )
}

// 底部選單（像 iOS action sheet）：從下面升起，點背景、「不換了」或 Esc 收起。
/** Round 6：「從哪裡出發」底部選單。目前位置／最近 5 站／打字報站。doubt 有值＝定位可疑，選了就直接派。 */
function LocSheet({ doubt, stations, onCurrent, onPick, onClose }: {
  doubt?: GeoDoubt; stations: string[]; onCurrent: () => void; onPick: (q: string) => Promise<string | null>; onClose: () => void
}) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const tap = async (name: string) => {
    if (busy) return
    setBusy(name); setErr('')
    const msg = await onPick(name)
    if (msg) { setErr(msg); setBusy('') }
  }
  return (
    <Sheet title={doubt ? GEO_DOUBT_LINE[doubt] : '從哪裡出發？'} sub="在車上就報下車的站。步行時間從那一站算。" onClose={onClose} testid="loc-sheet">
      <button className="sheet-opt" data-testid="loc-current" onClick={onCurrent}>
        <b>{doubt ? '就用目前位置' : '目前位置'}</b><span>{doubt ? '班長照這個座標派' : 'GPS 在哪就從哪算'}</span>
      </button>
      {stations.length > 0 && (
        <div className="chips loc-recent" data-testid="loc-recent" aria-label="最近報過的站">
          {stations.map((s) => <button key={s} className="chip" disabled={!!busy} onClick={() => void tap(s)}>{busy === s ? '查詢中' : s}</button>)}
        </div>
      )}
      {err && <p className="manual-err" role="alert">{err}</p>}
      <ManualLoc onGo={onPick} label="下車的站" />
      <button className="sheet-cancel" data-testid="loc-cancel" onClick={onClose}>我再想想</button>
    </Sheet>
  )
}

function Sheet({ title, sub, onClose, children, testid }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; testid?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="sheet-wrap" data-testid={testid}>
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="sheet-head"><b>{title}</b>{sub && <span>{sub}</span>}</div>
        {children}
      </div>
    </div>
  )
}

// 僅供獨立設計預覽入口使用；正式 App 入口與狀態機不變。
export { Home, ScenePick, Intake, Cmd, LogScreen, Stand, Diary, Weekly }

/**
 * 除錯畫面（長按班長名牌進來）。顯示最近 10 次 /api/order 的真實經過：
 * 幾秒、Places 查了幾圈查到幾家、候選店與評分、模型有沒有被重打、有沒有被強制指定。
 * 截圖或按「複製」就能把資料帶出這支手機——Vercel 的 log 隔一段時間就查不到了。
 */
function Debug({ level, onHome }: { level: Level; onHome: () => void }) {
  const [entries, setEntries] = useState<DebugEntry[]>(readDebug)
  const [copied, setCopied] = useState(false)
  // Round 4：60 天試用紀錄（src/trial.ts）。匯出成一個 JSON 檔，交給 Claude 分析。
  const [trial, setTrial] = useState(() => summarize(readTrial()))
  const [exported, setExported] = useState('')

  const exportFile = useCallback(() => {
    void (async () => {
      const text = exportTrial()
      const name = `decide-trial-${new Date().toISOString().slice(0, 10)}.json`
      // iPhone：分享面板（存到檔案、AirDrop、貼給 Claude）；不支援就下載；再不行就複製。
      try {
        const file = new File([text], name, { type: 'application/json' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: '決斷連試用紀錄' })
          setExported('已匯出')
          return
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return // 使用者自己關掉分享面板
      }
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setExported('已下載')
      } catch {
        try { await navigator.clipboard.writeText(text); setExported('已複製') } catch { setExported('匯出失敗') }
      }
    })()
  }, [])
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

  const copy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(formatDebug(entries))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch { setCopied(false) }
    })()
  }, [entries])

  return (
    <section className="screen" data-screen="debug">
      <button className="back" onClick={onHome}>← 回報告</button>
      <OfficerPlate level={level} mood="idle" meta={`除錯紀錄 · 最近 ${entries.length} 次`} />
      <div className="row">
        <button className="btn line" data-testid="debug-copy" onClick={copy}>{copied ? '已複製' : '複製全部'}</button>
        <button className="btn ghost" data-testid="debug-clear" onClick={() => { clearDebug(); setEntries([]) }}>清掉</button>
      </div>
      <div className="notice" data-testid="trial-summary">
        試用紀錄 {trial.days} 天 · {trial.orders} 道 · 給出口令 {trial.ok} · 7 天內重複 {pct(trial.repeat7d)} · 預算命中 {pct(trial.budgetHit)}
        {trial.rescue + trial.fallback > 0 ? ` · 救援 ${trial.rescue}／模板 ${trial.fallback}` : ''}
        {trial.mismatch > 0 ? ` · 不符情境 ${trial.mismatch}` : ''}
      </div>
      <div className="row">
        <button className="btn line" data-testid="trial-export" onClick={exportFile}>{exported || '匯出 60 天紀錄'}</button>
        <button
          className="btn ghost" data-testid="trial-clear"
          onClick={() => { if (window.confirm('清掉 60 天試用紀錄？匯出後再清。')) { clearTrial(); setTrial(summarize([])) } }}
        >清掉試用紀錄</button>
      </div>
      {entries.length === 0 && <div className="notice" data-testid="debug-empty">還沒有紀錄。出一道口令再回來看。</div>}
      {entries.map((e, i) => (
        <article key={`${e.at}-${i}`} className="dbg" data-testid="debug-entry">
          <h4>
            {new Date(e.at).toLocaleTimeString('zh-TW', { hour12: false })} · {CARD_BY_ID[e.module]?.title ?? e.module} · lv{e.level}
            {e.error && <em data-testid="debug-error"> 失敗：{e.error}</em>}
          </h4>
          {e.ms && (
            <p>時間 總 {(e.ms.total / 1000).toFixed(1)}s（店家 {e.ms.places}ms、班長 {e.ms.claude}ms）{e.outTokens ? ` · ${e.outTokens} 字元` : ''}{e.model ? ` · ${e.model}` : ''}</p>
          )}
          {e.places && (
            <>
              <p>查法 {e.places.how}</p>
              {e.places.tries.map((t, j) => (
                <p key={j}>查詢 半徑 {t.r}m → {t.raw < 0 ? '查詢失敗' : `找到 ${t.raw} 家，留下 ${t.kept} 家`}</p>
              ))}
              {e.places.candidates.length > 0 && (
                <ul>{e.places.candidates.map((c, j) => <li key={j}>{formatCandidate(c)}</li>)}</ul>
              )}
            </>
          )}
          {e.pick && <p data-testid="debug-pick">選店 {formatPick(e.pick)}</p>}
          {e.price && <p data-testid="debug-price">價位 {formatPrice(e.price)}</p>}
          {e.retry && <p>重打 {e.retry === 'nonanswer' ? '模型推掉不答' : '模型沒挑真店'}</p>}
          {e.forced && <p>強制指定 {e.forced}</p>}
          {e.picked && <p>挑中 {e.picked}</p>}
        </article>
      ))}
    </section>
  )
}
