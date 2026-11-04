// 資料模型 — DECIDE-DEV-DOC-v1.md 第 5 節；Round 3（DEV-PLAN-3 §B）加發掘／價位／記憶欄位。

export type Level = 0 | 1 | 2 // 菜鳥班長 / 值星班長 / 士官長
export type ModuleId = 'eat' | 'go' | 'attend' | 'rest' | 'sleep' | 'reply' | 'buy' | 'travel'

// ── Round 3：地區、價位、發掘 ──────────────────────────────────────
/** 由座標判定（src/price.ts countryOf），不看手機語系。other = 台日以外：預算列隱藏、不顯示幣別。 */
export type Country = 'TW' | 'JP' | 'other'
/** 價位檔（每人每餐）：1 銅板 / 2 一般 / 3 犒賞 / 4 豪賞。切點在 src/price.ts CUTS（R3§4.2）。 */
export type Band = 1 | 2 | 3 | 4
export type PriceLevel =
  | 'PRICE_LEVEL_UNSPECIFIED' | 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE'
  | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE'
/** 偵察方針（持久設定，首頁切換）：熟門熟路 / 均衡（預設）/ 全面偵察。 */
export type Novelty = 'familiar' | 'balanced' | 'recon'
/** 這家店對使用者是新的、回訪的、還是偵察抽到的。伺服器算，模型只負責講。 */
export type PickMode = 'new' | 'revisit' | 'wildcard'
/** 換一家的原因（A4）。 */
/** Round 4 加 repeat（又是這家：14 天不派）與 price（價格不對：這次排除、記進試用紀錄）。 */
export type ReissueReason = 'closed' | 'not_this_kind' | 'never_again' | 'repeat' | 'price'

/** Places 回來、經 toCandidates 整理後的一家店（原本在 prompt.ts，Round 3 移到這裡）。只活在單次請求，不落地。 */
export interface PlaceCandidate {
  id: string
  name: string
  walkMin?: number
  /** Round 6：到起點的直線距離（公尺）。方框查詢的角落可到半徑的 1.41 倍，用這個切回圓。 */
  distM?: number
  openUntil?: string
  /** 尚未開門但 60 分內會開：HH:MM（當地時間）。 */
  opensAt?: string
  /** Round 10：還沒開門的店再過幾分鐘開（只有 opensAt 有值時才有）。 */
  opensInMin?: number
  /** Round 5：營業中的店還剩幾分鐘關門（沒資料或 24 小時營業 → 沒有）。 */
  closeInMin?: number
  primaryType?: string
  types?: string[]
  rating?: number
  ratingCount?: number
  priceLevel?: PriceLevel
  /** Google priceRange；start 含、end 不含；end 缺 = 無上限。 */
  priceRange?: { start?: number; end?: number; currency?: string }
  /** 這家是哪條 lane 撈到的（src/lanes.ts），除錯用。 */
  lane?: string
  /** Round 4：撈到它的關鍵字 lane 推估的價位檔（src/lanes.ts QUERY_LANES est）。Google 有價位資料時不用。 */
  estBand?: number
}

/** 送到伺服器的記憶摘要：只有 place_id、我方事件時間戳、我方品牌鍵。沒有店名、評分、座標（R3§3.3）。 */
export interface PlaceMemSummary {
  id: string
  /** 最近 ≤5 次被出成口令的時間戳（ms），新的在前。 */
  sh: number[]
  /** 最近 ≤5 次回報完成的時間戳（ms），新的在前。 */
  dn: number[]
  /** 不再出現直到（ms）；'forever' = 永久。 */
  x?: number | 'forever'
  fav?: boolean
  /** 我方連鎖字典的品牌鍵（src/chains.ts）。同品牌曝光合併計算。 */
  b?: string
  /** 累計完成次數（不受 dn 只帶 ≤5 筆的限制）。缺省 = dn.length（舊前端）。「第 N 次」= dc + 1（Team Lead 授權 R3 修正 S-5）。 */
  dc?: number
}

/** 本機 IndexedDB 的完整記憶（src/placeMem.ts）。 */
export interface PlaceMemEntry {
  id: string
  module: 'eat' | 'rest'
  shown: number[] // ≤ 10，新的在前
  done: number[] // ≤ 10，新的在前
  doneCount?: number // 累計完成次數（done 只留 10 筆）；舊資料沒有這欄就用 done.length
  dislikeUntil?: number | 'forever'
  dislikes: number // never_again 次數；第 2 次 → forever
  fav?: boolean
  brand?: string // 我方品牌鍵
  cuisine?: string // 細類鍵（src/discovery.ts cuisineOf）
}

/** 細類偏好 Beta(a,b)，初值 (1,1)。key 由 cuisineOf 產生，是我方歸群，不是 Google 內容。 */
export type CuisineStats = Record<string, [number, number]>

export interface PickResult {
  place: PlaceCandidate
  mode: PickMode
  /** 過去 done 次數 + 1（revisit 時口令講「第 N 次」）。 */
  visits: number
  /** 哪些硬過濾被放寬了（'floor' | 'cooldown' | 'price' | 'dislike'）。非空就要 console.warn。 */
  relaxed: string[]
  /** recon 下附近已無曝光為 0 的店。 */
  exhausted: boolean
  /** Round 4：挑店用的價位檔（Google 資料或推估，可為 x.5）；null＝價位未知。缺省＝舊呼叫端，照 Google 資料算。 */
  band?: number | null
  /** Round 4：band 是我方推估（Google 沒有價位資料）。 */
  bandEst?: boolean
}

export interface IntakeField {
  key: string // 'diet' | 'transport' | 'minutes' | 'occasion' | 'stars' | 'budget' ...
  label: string
  /** chips 單選；scene＝情境單選（Round 5：必選、沒有預設、「其他」可手動輸入，字走 choices.sceneText）；stars 1–5；bands = 價位檔多選（只在 eat）：options 留空，標籤由 src/price.ts bandLabels(country) 依國家產生，值走 OrderRequest.budget 不走 choices。 */
  type: 'chips' | 'stars' | 'bands' | 'scene'
  options?: string[]
  default: string | number
}

export interface ModuleCard {
  id: ModuleId
  title: string
  subtitle: string
  intake: IntakeField[]
  needsPlaces: boolean
  placesQuery?: {
    includedTypes: string[]
    radiusByTransport?: Record<string, number>
    textQuery?: { key: string; byOption: Record<string, string> }
  }
  promptHint: string
  reissueLabel: string | null // Round 3：eat / rest 改「換一家」，原因在底部選單
  stopVerdictAllowed: boolean
}

export interface OrderRequest {
  module: ModuleId
  level: Level
  choices: Record<string, string | number>
  loc?: { lat: number; lng: number; label?: string }
  now: string // ISO，含時區
  /** 本次操作已出現過的 place_id（換一家）。語意不變。 */
  exclude?: string[]
  recentOrders: { module: ModuleId; big: string; at: string }[]
  // ── Round 3 ──
  /** 相鄰檔位、升冪；undefined 或 [] = 不限。 */
  budget?: Band[]
  /** 缺省 'balanced'。 */
  novelty?: Novelty
  /** ≤ 200 筆，依最近事件時間排序。伺服器不落地、log 不記 id。 */
  mem?: PlaceMemSummary[]
  cuisine?: CuisineStats
  /** 本次操作「今天不想吃這類」的細類鍵。 */
  rejectedCuisines?: string[]
  /** 只給測試／重播用的固定種子；正式前端不帶。 */
  seed?: number
}

export interface Order {
  verdict: 'do' | 'stop'
  meme: { top: string; big: string; bot: string }
  steps: string[]
  // mapUrl 與 Round 3 欄位只由伺服器填（api/order.ts withPlace）；模型寫的一律被 enforceRules 丟掉。
  place?: {
    id: string
    name: string
    walkMin?: number
    openUntil?: string
    opensAt?: string
    mapUrl?: string
    mode?: PickMode
    visits?: number
    /** null = 價位未知（口令卡要顯示「價位未知」）。 */
    band?: Band | null
    /** 直接由 Google 當次回傳值組成的顯示字串（例「≈NT$150–400」「≈¥1,000〜2,500」）。不落地保存。
     *  Round 4：Google 沒有價位資料時是我方推估（「推估平價」），不含金額，priceEst=true。 */
    priceText?: string
    priceEst?: boolean
    country?: Country
    cuisine?: string
    brand?: string
    exhausted?: boolean
  }
  log: string
}

/** enforceRules 的 Round 3 上下文（api/order.ts 組，純函式不碰 I/O）。 */
export interface EnforceCtx {
  level: Level
  country: Country
  pick?: PickResult | null
  /** Round 6：使用者報的「下車的站」站名。有的話口令第一步要從出站寫起（伺服器保證）。 */
  origin?: string
}

export interface OrderDebug {
  module: ModuleId
  level: Level
  model?: string
  ms?: { places: number; claude: number; total: number }
  outTokens?: number
  places?: {
    how: string // 'lane=ramen_restaurant rank=DISTANCE' 或 'text="居酒屋"'
    tries: { r: number; raw: number; kept: number }[]
    /** type＝Google 的主類別（Round 5：量測情境「排除速食」用）。 */
    candidates: { name: string; rating?: number; count?: number; walkMin?: number; distM?: number; openUntil?: string; opensAt?: string; opensIn?: number; band?: number | null; type?: string; closeIn?: number }[]
  }
  /** Round 3：發掘引擎的決定過程。不含 place_id。 */
  pick?: { mode: PickMode; lane: string; pool: number; afterFilter: number; relaxed: string[]; exhausted: boolean; seed?: number }
  /** Round 3：候選中有價位資料的比例（R3§4.3 第一週遙測）。 */
  price?: { country: Country; known: number; total: number }
  retry?: 'nonanswer' | 'noplace'
  /** Round 4：Claude 失敗（逾時、429、格式壞、兩次都推掉）→ 伺服器用模板出口令，不讓使用者空手。 */
  fallback?: 'template'
  /** Round 4：前兩次 Places 之後一家都派不出去 → 第三次查營業中的便利商店。 */
  rescue?: boolean
  /** Round 5：這次的情境、情境篩完剩幾家／共幾家、是不是放回整批才派得出去。text＝「其他」使用者打的字（只在手機，不進伺服器 log）。 */
  scene?: { id: string; text?: string; kept: number; total: number; relaxed: boolean }
  forced?: string
  picked?: string
  error?: string
}

export interface DiaryEntry {
  id: string // `${ts}-${module}`
  ts: string
  module: ModuleId
  level: Level
  big: string
  /** @deprecated Round 3 起不再寫入（Google 條款 R3§3.3）；只為讀舊資料保留，顯示時 fallback 到 big。 */
  placeName?: string
  /** Round 3：之後靠這個對回 PlaceMem（愛店／不再推薦）。 */
  placeId?: string
  /** mismatch（Round 5）：沒做，因為派的不符合使用者的情境——不罰站、不算進服從率。 */
  outcome: 'done' | 'reissued' | 'punished' | 'mismatch'
  reason?: ReissueReason
  mode?: PickMode
}

export interface WeeklyRequest {
  weekStart: string
  level: Level
  entries: DiaryEntry[]
  /** Round 3：前端由 PlaceMem 算好（B1），伺服器只轉述。 */
  discovery?: { newPlaces: number; revisits: number }
}

export interface WeeklyReport {
  weekStart: string
  level: Level
  stats: {
    orders: number; complianceRate: number; punishments: number; weakestModule: ModuleId | null
    /** Round 3：本週新占領／回防。 */
    newPlaces?: number; revisits?: number
  }
  body: string
  verdict: string
}

/** C2：沒有定位時手動報地點。伺服器用 Text Search 換座標，不落地。 */
export interface GeocodeRequest { q: string }
export interface GeocodeResponse { loc: { lat: number; lng: number }; label: string }
