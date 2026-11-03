# 報告班長 · 決斷連 — MVP 開發文件 v1

> **2026-11-04 附註（Round 4–10 已改動的部分，以 `state/` 與 `STATE.md` 為準）**
> - §3.1、§13.1 寫 7 張卡；程式現在是 8 張（多了 travel）。
> - §6 吃／歇的流程：Round 5 起第一步先選情境（5 種＋「其他」手打 ≤ 20 字），§1.2「使用者自建情境 v2 不做」已由「其他」部分取代。reissue「店關了」在 Round 3 改成「換一家」並要報原因。
> - §8、§16 每日 ≤ 5 次 Places：Round 4 起每道口令最多 4 次（放大、預算後備、超商救援），每日上限仍是 40 次（`src/places.ts`）。
> - 「去」卡：Round 10 起查真地點（交通與可接受時間決定半徑），不再由模型憑常識選。
> - 今日行程（PR #27–#32）不在本規格內，見 `STATE.md`。

> 給 Claude Code 的執行文件。Cross 不是工程師、不 debug。
> 本文件的每一節都是「可以直接照做」的指令，不是討論稿。
> 對照物：`decide-mock-v5.html`（已由 Cross 通過的畫面基準）。

---

## 0. 貼給 Claude Code 的第一句話

```
讀 DECIDE-DEV-DOC-v1.md 全文與 decide-mock-v5.html。
把本文件第 3 節的 LOOP CONTRACT 抄進 state/decide-mvp-build.json（第 3.2 節格式），status=running。
然後從第 12 節「建置順序」第 1 步開始。每完成一步，執行第 13 節該步的檢查，寫入 state，再往下。
任何一步檢查 FAIL 三次 → 停，寫 escalation，回報。不要自己放寬條件。
```

---

## 1. 產品定義（BLUF）

一個手機 PWA。使用者按一顆情境鍵、點 0–2 個選項，「值星班長」用台灣 90–00 年代軍教片口吻下一道**不可拒絕**的命令（含真實店家、具體步驟、一句理由），使用者回報「完成／店關了／沒做」，完成→登記，沒做→罰則。每道口令自動寫進「新兵日記」，每週日 20:00 產出「莒光園地」週報。

**唯一使用者**：Cross 本人（MVP）。
**角色是賣點**：三位原創班長（阿良／黑面／老郭）＝ 三段火力，可切換。

### 1.1 Premises（已同意）
1. 目的是降低決策成本，不是最佳決策。答案標準 =「合理且果斷」。
2. MVP 單人，無帳號。
3. 決策失敗（難吃）可接受，app 不解釋。
4. 「不得拒絕」的合法出口只有一個：**店關了／路封了 → 換口令**，不算拒絕。

### 1.2 Non-goals（MVP 不做）
- 使用者自建情境（v2）
- 付費、帳號、多人、推播
- 原生 iOS／Android
- 具體衣物建議（只給 dress code 等級）

---

## 2. 已鎖定決策

| 項目 | 決定 |
|---|---|
| 形態 | PWA（Vite + React + TypeScript），手機優先 |
| 部署 | Vercel（前端 + 2 支 serverless function 藏 key） |
| 決策引擎 | Claude API，口令 `/api/order` 預設 `claude-haiku-4-5`（速度優先，環境變數 `ORDER_MODEL` 可換回 `claude-sonnet-5`）；週報 `/api/weekly` 用 `claude-sonnet-5`。強制 JSON 輸出 |
| 店家資料 | Google Places API (New)：吃 用 Nearby Search（照 type）、歇 用 Text Search（中文關鍵字），只在 吃／歇 使用 |
| 資料儲存 | 手機本機（IndexedDB via `idb-keyval`），零後端 DB |
| 角色 | 教官／值星班長，軍教片口吻，三段火力，預設中檔 |
| 否定命令 | 給且只給一個替代（買不買→「不買，72 小時後再報告」是命令本體） |
| 回饋 | 完成→登記（描述式，不誇）；沒做→罰則倒數 |
| 日記 | 自動登記，不可手寫 |
| 週報 | 週日 20:00 後首次開 app 產出，也可手動看 |
| 頭像 | MVP 用 SVG（mock v5 的 `avatar()`），資產介面可抽換（第 14 節） |
| 語言 | UI 繁中；Places 結果原文 |

---

## 3. Loop 三件套

### 3.1 LOOP CONTRACT（開發 loop）

```
┌─ LOOP CONTRACT ────────────────────────────────
│ NAME   : decide-mvp-build
│ TRIGGER: Cross 在 Claude Code 貼第 0 節指令
│ GOAL   : Vercel 網址可開；7 張卡各能走完 點名→口令→(完成|換口令|沒做)→(登記|罰則)；
│          日記有紀錄；週報可產出；畫面與 mock v5 對照通過；deploy 步驟 ≤5
│ STOP   : PASS = A ∧ B ∧ C ∧ D ∧ E
│          A. `npm run typecheck && npm run test` 退出碼 = 0
│          B. `npm run build` 退出碼 = 0
│          C. `npm run e2e` 退出碼 = 0（Playwright，第 13 節 7 條 happy + 4 條 error path）
│          D. `npm run e2e:shots` 產出 7 張截圖，且 `shots/CHECK.md` 每張標 PASS（第 13.3 節人工對照表由 checker 填）
│          E. `vercel --prod` 回傳 URL，curl 該 URL 回 200，且 `/api/order` 以 mock 定位打一次回 200 + 合法 JSON
│ BUDGET : 最多 5 輪 ／ 最多 90 分鐘
│ FAIL   : 暫時性（429/5xx/逾時）→ retry+backoff，不寫入部分結果
│          永久性（型別錯、測試紅、build 紅）→ 修一輪，同條件連續 3 輪 FAIL → 停 + escalation
└────────────────────────────────────────────────
```

Step 0 四問結論：① 輸出（code）Cross 不會逐行讀 → 可 loop；② STOP 全部程式可判定 → 可；③ 單 agent 單 repo → 單一 loop；④ 無需並行分支 → 不加 agent。

**產品內 loop（口令品質）不在此契約內**：品質判準在 Cross 腦裡，留在系統提示詞層，由 Cross 用人眼迭代。

### 3.2 run-state 檔

路徑：`state/decide-mvp-build.json`（repo 內，`.gitignore` 不排除，但不進 Drive／vault）

```json
{
  "loop_name": "decide-mvp-build",
  "contract_ref": "GOAL: PWA 上線且 7 卡可走完; STOP: A∧B∧C∧D∧E; BUDGET: 5 輪/90 分",
  "status": "idle",
  "run_id": "",
  "budget": { "rounds_used": 0, "rounds_max": 5 },
  "processed": [],
  "pending": ["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"],
  "failures": [],
  "escalation": null,
  "last_updated": ""
}
```
- `key` = 建置步驟編號（S1–S10，第 12 節），冪等：processed 有就跳過。
- 每步完成**立刻**寫 processed，不批次。
- 同時重生 `state/decide-mvp-build.md`（人類版：完成幾步／卡哪／需要 Cross 做什麼）。

### 3.3 checker（獨立驗證，maker 不自評）

在 Claude Code 用**新對話**（或 `/clear` 後）貼：

```
你是 checker。不修改任何檔案。只讀 state/decide-mvp-build.json、DECIDE-DEV-DOC-v1.md 第 3.1 節 STOP 與第 13 節。
逐條執行 A–E 的命令，貼出退出碼與關鍵輸出。D 條：打開 shots/*.png 與 decide-mock-v5.html 對照第 13.3 節表格，逐格 PASS/FAIL。
輸出固定格式：VERDICT / ROUND / 逐條判定表（含證據位置）/ OUT-OF-SCOPE / 若 FAIL 的最小修正指示（不給 code）。
任一條 FAIL → VERDICT: FAIL。
```

---

## 4. 架構

```
decide/
├─ public/            manifest.webmanifest, icons/
├─ src/
│  ├─ app.tsx         單頁狀態機：home→intake→cmd→(log|stand)；diary；weekly
│  ├─ cards.ts        7 張模組卡（第 6 節）
│  ├─ officers.ts     3 位班長：名字、開場白、bark 三段、罰則三段
│  ├─ avatar.tsx      SVG 角色（從 mock v5 avatar() 搬入），介面見第 14 節
│  ├─ meme.tsx        梗圖卡元件（兩欄 grid，角色不壓字）
│  ├─ diary.ts        IndexedDB 讀寫、週統計
│  ├─ api.ts          呼叫 /api/order、/api/weekly；重試與錯誤分類
│  └─ styles.css      設計 token（第 9 節）
├─ api/
│  ├─ order.ts        Vercel Function：定位+卡片+選項 → Places(可選) → Claude → Order JSON
│  └─ weekly.ts       Vercel Function：本週日記 → Claude → WeeklyReport JSON
├─ tests/             vitest 單元 + playwright e2e + shots
├─ state/             run-state（第 3.2 節）
└─ .env.example       ANTHROPIC_API_KEY=[FILL_THIS]  GOOGLE_PLACES_KEY=[FILL_THIS]
```

原則：**key 只在 `api/` 存在**，前端永遠不碰 key。無 DB、無 cron、無推播。

---

## 5. 資料模型（TypeScript，照抄）

```ts
export type Level = 0 | 1 | 2;                       // 菜鳥班長 / 值星班長 / 士官長
export type ModuleId = 'eat'|'go'|'attend'|'rest'|'sleep'|'reply'|'buy';

export interface IntakeField {
  key: string;                                        // 'diet' | 'transport' | 'minutes' | 'occasion' | 'stars' ...
  label: string;                                      // 顯示：忌口 / 交通 / 可接受 ...
  type: 'chips' | 'stars';
  options?: string[];                                 // chips 用
  default: string | number;
}

export interface ModuleCard {
  id: ModuleId;
  title: string;                                      // 吃 / 去 / 赴 / 歇 / 幾點睡 / 這訊息現在回嗎 / 買不買
  subtitle: string;
  intake: IntakeField[];
  needsPlaces: boolean;                               // eat, rest = true
  placesQuery?: { includedTypes: string[]; radiusByTransport?: Record<string, number> };
  promptHint: string;                                 // 給 Claude 的模組專屬規則（第 6 節）
  reissueLabel: string | null;                        // '店關了' | '路封了' | null
  stopVerdictAllowed: boolean;                        // buy=true（可以「不買」）, attend=true（可以「不去」）
}

export interface OrderRequest {
  module: ModuleId; level: Level;
  choices: Record<string, string | number>;
  loc?: { lat: number; lng: number; label?: string };  // 無定位權限時 undefined
  now: string;                                         // ISO，含時區
  exclude?: string[];                                  // 換口令時帶上一家 place_id
  recentOrders: { module: ModuleId; big: string; at: string }[]; // 近 7 天，讓班長講「這週第二次」
}

export interface Order {                              // Claude 必須回這個 JSON，不多不少
  verdict: 'do' | 'stop';                             // stop = 不去／不買，用紅卡
  meme: { top: string; big: string; bot: string };    // top ≤ 16 字, big ≤ 10 字, bot ≤ 24 字
  steps: string[];                                    // 1–3 條，每條 ≤ 22 字，可執行、無梗
  place?: { id: string; name: string; walkMin?: number; openUntil?: string };
  log: string;                                        // 完成後登記文字，≤ 30 字，描述式，不誇
}

export interface DiaryEntry {
  id: string;                                         // `${ts}-${module}`  冪等鍵
  ts: string; module: ModuleId; level: Level;
  big: string; placeName?: string;
  outcome: 'done' | 'reissued' | 'punished';
}

export interface WeeklyReport {
  weekStart: string; level: Level;
  stats: { orders: number; complianceRate: number; punishments: number; weakestModule: ModuleId | null };
  body: string;                                       // ≤ 180 字，班長口吻，含至少一個規律觀察 + 一個下週對策
  verdict: string;                                    // ≤ 14 字，例：「本週講評：合格。屁股記過一次。」
}
```

---

## 6. 八張模組卡

| id | intake | Places | promptHint（給 Claude） | reissue | stop 可用 |
|---|---|---|---|---|---|
| eat | 忌口 chips：不辣／不吃牛／素／都可以；想吃 chips：鹹食／甜食／都可以 | ✅ `restaurant`，半徑 800m 步行；選甜食改查 `bakery`／`cafe`／`ice_cream_shop` | 從候選店挑**一家**，big=店名，steps 含「點什麼」與「幾分鐘內吃完」；用 recentOrders 講這週吃了幾次什麼 | 店關了 | ✗ |
| go | 交通 chips：走路／捷運／計程車／開車；可接受 chips：15／30／60 分 | ✗（MVP 用 Claude 常識 + 定位城市；v2 接 Places） | big=地點，steps 含怎麼去、到那裡做一件事、回家；符合時間帶（晚上不排早市） | 路封了 | ✗ |
| attend | 場合 chips：飯局／公司聚會／朋友生日／婚禮；熟識 stars 1–5 | ✗ | 規則：★≤2 且非婚禮 → verdict=stop（不去，替代=傳一句話）；其餘 do。steps 必含到達時間、dress code 等級、可離場時間 | null | ✅ |
| rest | 喝什麼 chips：咖啡／酒吧／居酒屋／熱炒燒烤 | ✅ Text Search 關鍵字 `咖啡廳`／`酒吧`／`居酒屋`／`熱炒 燒烤`，半徑 800m（居酒屋、熱炒沒有 Places type） | big=店名；咖啡：點什麼、坐幾分、手機面朝下；喝酒：點什麼（≤2 杯）、幾點前離開、怎麼回家（不得開車騎車） | 店關了 | ✗ |
| sleep | 起床 chips：06:30／07:30／08:30 | ✗ | big=「HH:MM 熄燈」= 起床−8h；steps 含充電器位置 | null | ✗ |
| reply | 對象 chips：老闆／同事／朋友／陌生人 | ✗ | 永遠 do；big=「現在回。N 句。」；steps 第一句答案、第二句時程 | null | ✗ |
| buy | 金額 chips：500 以下／500–1,500／1,500–3,000 | ✗ | 預設 stop（不買）+ 72 小時規則；若 recentOrders 顯示 72 小時前已報告過同類 → do | null | ✅ |
| travel | 區域 chips：日韓／東南亞／歐洲／美洲／都可以；天數 chips：3 天／5 天／7 天以上 | ✗ | 只決定國家，big=國家名；不談錢，永遠 do；steps：訂機票期限、出發前唯一一件事、回國日 | 換一國 | ✗ |

首頁排列：4 大磁貼（吃／去／赴／歇）+ 4 小鍵（sleep／reply／buy／travel）。

---

## 7. 班長人設 — 系統提示詞（`api/order.ts` 用）

```
你是台灣 1990–2000 年代軍教片裡的班長。三種火力，由 level 決定：
level 0「菜鳥班長 阿良」：剛下部隊，兇不起來，會結巴、會冒汗、講「你各位」會軟掉。
level 1「值星班長 黑面」：標準值星班長。短句、命令式、動詞開頭。口頭禪：「你各位啊」「一個口令一個動作」「合理的要求是訓練，不合理的要求是磨練」「軍中沒有還好」。
level 2「士官長 老郭」：毒舌、比喻狠、不留情。「我看過的菜鳥比你吃過的饅頭多」「這不叫拖延，這叫菜」。

【絕對規則】
1. 罵行為，不罵人：只罵猶豫、拖延、菜、屁股重、賴床。禁止外貌、性別、族群、家庭、健康、性相關詞；禁止髒話。
2. 命令本體零毒性：steps 與 place 只放可執行資訊，不放梗、不放罵。毒只放在 meme.top 與 meme.bot。
3. log（登記）不罵、不誇：只描述時間、口令、使用者做了什麼。例：「你去了你不想去的地方，而且準時。」
4. 不解釋、不道歉、不給第二選項。verdict=stop 時，steps 第一條就是替代行為（且只有一個）。
5. 這八張卡全部是小事，一律要給可執行的口令。禁止回「大事不受理」、禁止叫使用者去找連長或任何人、禁止用「這不是班長管的」之類的話推掉。verdict:'stop' 只有在【已判定】明講時才出現（赴、買不買）。
6. 有【店已決定】時，店已由班長決定：place.name 照填那一家（place.id 由伺服器填，留空字串），meme.big 就是那家店名。禁止只講類別（「甜點店」「小吃店」「附近的咖啡廳」一律不算回答）、禁止編造店名、禁止提到任何別家店。註明「HH:MM 開」的店要在 steps 寫清楚幾點開門。金額只准照抄【店已決定】給的價位，禁止自己生金額。（2026-09-18 起沒有「類別降級」：候選為空是伺服器層的失敗，見第 8 節。2026-10-22 Round 3：店由伺服器 `pickPlace` 決定，模型不再看到候選清單，DEV-PLAN-3 W1.5。Round 3 修正 S-9：prompt 不再送 place.id。）
7. 輸出**只有** Order JSON（第 5 節），不加任何前後文、不加 markdown fence。
8. 一律用台灣的繁體中文與台灣生活用語。禁止中國用語（質量／視頻／信息／屏幕／默認／用戶／激活／軟件／網絡／出租車／自行車／盒飯／早點／地鐵）。軍事用語只用國軍的（連、排、班、值星、出操、寢室、輔導長），不得使用解放軍編制用語（指導員、政委）。

【語料庫】（每次從對應火力層隨機取材改寫，不得整句重複前 5 次用過的）
level 1 種子：你各位啊／一個口令一個動作／合理的要求是訓練，不合理的要求是磨練／軍中沒有還好／班長有問你想不想嗎／給我去／數給我聽／沒有下次注意，只有這一次／直接回營／不接受討價還價／站好、笑、準時走／班長知道你在哪
level 2 種子：這不叫拖延，這叫菜／屁股都長在椅子上了／椰子都比你有毅力→椅子都比你有毅力／你的汗腺退伍了嗎／你的錢包比你還想退伍／你寫遺書都沒這麼久／講數字，不要形容詞／「還可以」不是數字／三秒內講完／滾出去喝一杯／我看過的菜鳥比你吃過的饅頭多／饅頭剩無限顆
level 0 種子：報、報告什麼事／班長…我是說，你各位／有、有沒有忌口／不要用那種眼神看我（小聲）／…應該可以吧，去！
正式版要求：三層各 ≥ 20 句，放在 officers.ts，由 API 隨機抽 3 句塞進 prompt 作為當次風格樣本。
```

`api/weekly.ts` 追加：
```
讀 entries（本週 DiaryEntry[]）。用同一位班長口吻寫 WeeklyReport.body（≤180 字）：
① 數字：口令數、服從率、罰則次數 ② 一個規律（例：只在不用出門的事上偷懶／晚上意志最弱）③ 下週一個對策 ④ verdict 一句。
只輸出 WeeklyReport JSON。
```

---

## 8. Places 呼叫規則（`api/order.ts`）

- API：Places API (New) `places:searchNearby`，`fieldMask` 固定：
  `places.id,places.displayName,places.location,places.currentOpeningHours.openNow,places.regularOpeningHours.weekdayDescriptions,places.primaryType`
  → 這組 mask 落在 **Enterprise** SKU（因為含營業時間）。**免費額度 1,000 次/月**（2026-07 價表）。單人每日 ≤ 5 次 = 150 次/月，安全。
- 半徑：eat 800m、rest 800m；一次向 Places 要 15 筆，給 Claude 最多 8 筆；`languageCode: zh-TW`。fieldMask 另含 `rating`、`userRatingCount`、`currentOpeningHours.nextOpenTime`（同一 Enterprise SKU）。
- 候選（`toCandidates`，2026-09-18）：營業中 **或 60 分內開門**（帶 `opensAt`）；依貝氏平均評分排序（先驅 4.0 分／20 則）；評分 ≥4.0 且 ≥10 則的店有兩家以上就只留那些。
- 第一圈查不到候選 → 半徑 ×2.5 再查一次；仍為空 → **502 `no_places`**「附近查不到營業中的店。換個地方再報告。」不再用類別降級。
- 模型沒挑清單裡的真店（只講類別／編店名）→ 重打一次；第二次仍沒有 → 伺服器直接指定評價最高那家（`[place] forced`）。
- rest 走 `places:searchText`（`textQuery` 依「喝什麼」對中文關鍵字，`locationBias` 圓、`rankPreference: DISTANCE`、`openNow: true`），同一組 fieldMask、同一 SKU。2026-09-18 起：之前 rest 只查 `cafe` type 半徑 500m，正式站常常 `raw=0`。
- 換口令：帶 `exclude[]`，過濾後再送 Claude。
- **硬上限**：每日 Places 呼叫計數記在回應 header 給前端，前端存本機，超過 40 次/日 → 前端不帶定位；吃／歇沒定位 → 前端直接顯示 `no_location`（見下）。
- 定位權限被拒／無定位：吃／歇 → 前端不打 API，顯示「不報座標，班長就點不了店。開定位再報告。」（伺服器收到沒 `loc` 的吃／歇也回 400 `no_location`）。其餘卡不需要定位。
- 錯誤：Places 4xx／5xx／逾時 → 各半徑重試後仍沒有候選 → 502 `no_places`。畫面永遠有話與重試鍵，但**不再拿類別當口令**（Cross 2026-09-18：只講類別一律視為失敗）。

---

## 9. 畫面與版面規則（以 mock v5 為準）

| 規則 | 具體 |
|---|---|
| 班長永遠在最上面 | home／intake／diary 的 `.officer` 區；他是說話者，畫面是他的台詞 |
| 梗圖卡兩欄 | `grid-template-columns: 1fr 38%`；左欄文字（top/big/bot 上中下），右欄角色 `align-self:end`。**角色不得用絕對定位壓在文字上**（v4 的錯，v5 已修） |
| 字級上限 | 梗圖字全部 `clamp()`；超長 big 自動換行 `overflow-wrap:anywhere` |
| 步驟卡分離 | steps 放梗圖卡下方白卡，`▸` 前綴，無梗 |
| 主按鈕 | 每畫面一顆主動詞按鈕在拇指區；「沒做」為 ghost |
| 4:5 可截圖 | cmd／log／stand 卡 `aspect-ratio:4/5`；週報卡自動高度 |
| 小螢幕 | 高度 < 700px 時 3 小鍵改為一列橫向捲動 |
| 顏色 token | 見 mock v5 `:root`，含 dark 版 |

### 9.1 跟隨系統
- 色彩：`prefers-color-scheme` + `<meta name="color-scheme" content="light dark">`
- 字級：全 `rem`；`@supports (font:-apple-system-body){html{font:-apple-system-body}}`（iOS Dynamic Type）
- 動態：`prefers-reduced-motion`
- 對比：`prefers-contrast: more` → 灰字灰線轉墨色
- ⚠️ 已知限制：iOS PWA 的 Dynamic Type 掛鉤不保證每台一致；已用 clamp 防溢出。

---

## 10. 罰則、日記、週報

| 功能 | 規格 |
|---|---|
| 罰則 | level 0：罰站 10 秒（1s/步）；1：伏地挺身 20 下（0.6s）；2：交互蹲跳 30 下（0.5s）。倒數完自動回首頁。寫 DiaryEntry outcome=punished |
| 換口令 | 同一 DiaryEntry 覆寫 big/placeName，outcome=reissued；一次口令最多換 1 次；帶 `exclude[]`，候選空了就是 `no_places` |
| 日記 | 唯讀列表，按日分組；頂部三格：口令數／服從率（done+reissued ÷ 全部）／罰則數 |
| 週報產生時機 | 開 app 時若 `now ≥ 本週日 20:00` 且 `weekly[weekStart]` 不存在 → 呼叫 `/api/weekly` 一次並存本機；日記頁「看本週莒光園地」可手動觸發（同一週只算一次 API） |
| 分享 | `navigator.share` 分享 `html-to-image` 轉出的 PNG；不支援時顯示「長按截圖」 |

---

## 11. 錯誤路徑（每條都要有畫面文字，班長口吻，不空白）

| 情況 | 畫面 |
|---|---|
| 定位被拒 | 吃／歇：「不報座標，班長就點不了店。開定位再報告。」+ 重試鍵，不打 API；其餘卡不需要定位 |
| 附近沒有營業中的店 | 502 `no_places`：「附近查不到營業中的店。換個地方再報告。」+ 重試鍵 |
| Places 0 家營業中 | 「附近沒有開的。回營吃泡麵，12 分鐘。」（Claude 產出，仍是命令） |
| Claude API 429/5xx | 重試 2 次（1s、3s）；仍失敗 → 「班長在開會。30 秒後再報告。」+ 重試鍵 |
| Claude 回傳非法 JSON | 4 層解析：直接 parse → 去 fence → regex 取 `{…}` → 失敗視同 5xx |
| 離線 | 「沒訊號。原地站好，有訊號再報告。」；日記仍可看（本機） |
| 週報產出失敗 | 日記頁顯示「本週講評延後，班長還在寫。」不阻擋其他功能 |

---

## 12. 建置順序（S1–S10，每步一個 commit，每步寫 state）

| 步 | 內容 | 完成判定（第 13 節） |
|---|---|---|
| S1 | `npm create vite@latest decide -- --template react-ts`；裝 `idb-keyval`, `vitest`, `@playwright/test`, `html-to-image`；PWA manifest；`.env.example` | typecheck 綠 |
| S2 | `cards.ts` + `officers.ts` 依第 6、7 節；語料三層各 ≥20 句 | 單元測試：7 卡 schema、語料數 |
| S3 | `avatar.tsx`（搬 mock v5）+ `meme.tsx` 兩欄 grid | 單元：渲染 3×4 表情不拋錯 |
| S4 | `app.tsx` 狀態機 + 首頁 + 點名，先用 mock Order 資料 | e2e：7 卡可到 cmd 畫面 |
| S5 | `api/order.ts`：Places + Claude + JSON 4 層解析 + 錯誤分類；本地 `vercel dev` | 單元：mock Claude 回傳各型態；curl 回 200 |
| S6 | 前端接 `/api/order`；完成／換口令／沒做 三路 + 罰則倒數 | e2e：三路 + 4 條錯誤路徑 |
| S7 | `diary.ts` + 日記頁 | e2e：走 3 道口令後日記出現 3 筆、統計正確 |
| S8 | `api/weekly.ts` + 週報頁 + 分享 | 單元：stats 計算；e2e：週報渲染 |
| S9 | 系統設定跟隨 + clamp + 小螢幕；`e2e:shots` 產 7 張截圖 | shots 存在且非空 |
| S10 | `vercel --prod`；填 env；`/api/order` 線上打通 | STOP E |

---

## 13. 測試（= STOP 條件的具體命令）

### 13.1 `npm run test`（vitest）
- cards：7 張、id 唯一、needsPlaces 只在 eat/rest、每卡 intake default 存在於 options
- officers：3 位、每位語料 ≥ 20 句、無禁詞（維護一份 `banned.ts`：外貌／性別／族群／髒話清單）
- order parser：合法 JSON／fenced／前後有文字／非法 → 前三成功、第四拋 `ParseError`
- attend 規則：★2 飯局 → stop；★2 婚禮 → do；★4 → do
- sleep：07:30 → 「23:30 熄燈」
- weekly stats：11 筆（9 done, 1 reissued, 2 punished... 依 mock 資料）→ 服從率 82%（(9+1)/12 依實際筆數算，測試寫死期望值）
- diary 冪等：同 id 寫兩次只存一筆

### 13.2 `npm run e2e`（Playwright，mock API 回固定 Order）
Happy ×7：每卡 home→intake→「是！班長」→cmd 出現 `.meme .big` 非空。
三路：完成→log 頁；店關了→big 改變且 reissue 鍵消失；沒做→stand 倒數至 0 回 home。
Error ×4：定位拒絕仍出口令；API 500→重試訊息與重試鍵；非法 JSON→同 500 路徑；離線→離線訊息且日記可開。

### 13.3 `npm run e2e:shots` + 人工對照表（checker 填）
| 截圖 | 對照 mock v5 | 判定項 |
|---|---|---|
| 01-home | home | 班長在上、對話框、4 磁貼、3 小鍵 |
| 02-intake-attend | intake | 星星 5 顆、chips |
| 03-cmd-eat | cmd | 兩欄，角色不壓字，steps 白卡在下 |
| 04-cmd-buy | cmd red | 紅卡、stop |
| 05-log | log | 登記卡 + 雄壯威武 + 分享鍵 |
| 06-stand | stand | 紅卡倒數 |
| 07-weekly | weekly | 單欄文字 + 角色在下 |

---

## 14. 頭像資產介面（繪師交件當天可換）

```
public/officers/{lv}/{mood}.webp   lv = 0|1|2   mood = idle|bark|praise|punish
512×512，透明背景，人物置中偏下（胸像），臉佔畫面 55–65%。
avatar.tsx：若對應 .webp 存在 → <img>；否則 → 內建 SVG。零程式改動。
```
委託規格給繪師：三位角色設定（阿良：歪帽、冒汗、圓眼；黑面：值星帶、平嘴、粗眉；老郭：墨鏡、哨子、法令紋、白髮線），軍教片年代感（船形帽、草綠服），4 表情，扁平厚線風，不得參考任何真實演員。

---

## 15. 部署（5 步，Cross 可自己做）

1. Vercel 新專案 → Import GitHub repo `decide`（Framework: Vite）
2. Settings → Environment Variables：`ANTHROPIC_API_KEY`、`GOOGLE_PLACES_KEY`（Production）
3. Google Cloud Console：啟用 **Places API (New)**，key 限制：API restrictions = Places API (New)；Application restrictions = None（server 端呼叫）
4. Deploy → 拿到 `https://decide-xxx.vercel.app`
5. iPhone Safari 開網址 → 分享 → 加入主畫面 → 開啟允許定位

驗收：按「吃」→ 出現真實店名 → 按「報告班長，完成」→ 日記有一筆。三個動作都成立才算上線。

---

## 16. 已知限制與開放問題（誠實區）

| 項目 | 狀態 |
|---|---|
| Places 價格 | 2026-07 價表：Nearby Search Enterprise 免費 1,000 次/月，超過 $35/千次。單人不會超；開放多人前必加配額 |
| 「去」模組 | MVP 無 Places，靠 Claude 常識，可能給出不存在／已關的景點 → v2 接 Places `tourist_attraction` |
| iOS Dynamic Type | 掛鉤不保證每台一致，已用 clamp 防溢出 |
| 週報排程 | 無 server cron，靠開 app 時判斷；週日不開 app 就週一才看到 |
| 頭像 | SVG 扁平插畫，公開上線前換繪師資產（第 14 節） |
| 羞辱強度 | 預設 level 1；level 2 由使用者自己調；`banned.ts` 是護欄，不是保證 |
| 語料重複 | 靠 prompt 內「不重複前 5 次」+ 隨機抽樣；沒有硬性去重，可能偶爾重複 |
