# 交接｜daily-open-on-arrival
狀態：待接手
建立：2026-11-12 07:27 UTC｜環境：Claude Code（雲端容器）｜上下文：338,086／400k（已過軟上限，所以交接）

## 1. 下一個對話先做什麼
1. 準備 repo：工作目錄沒有 `general-decision` 就用 `add_repo`（owner `cc4wang-ui`，repo `general-decision`）再 clone。然後 `git fetch origin main && git checkout -B <系統指定的分支> origin/main && npm ci`。系統沒指定分支就用 `claude/daily-open-on-arrival`。
2. 依 /board-intake 執行下面「目標契約」（M 級，已凍結，不再問 Cross）。先讀 `api/daily-route.ts` 第 9 行 `MASK`、第 43–44 行 `search()` 解析、第 277 行選店、第 296–305 行排程；`src/places.ts` 第 125 行 `closingTime`、第 148 行 `minutesUntilClose`；`src/dailyRouting.ts` 第 78 行 `scheduleRoute`。
3. 做完開草稿 PR、訂閱、等 CI。合併 main 會更新正式站 🔒，要 Cross 說 `核准` 才合併。

### 目標契約｜daily-open-on-arrival（凍結）
- Cross 原話：`好，做第 1 項`。第 1 項是上一棒建議表的原文：`今日行程：走到店時店要開著`；理由原文：`今日行程只在搜尋當下看店有沒有開（openNow），不管走到時是幾點。`
- 目標：今日行程派出的自動站店家，在預估到店時間（ETA）是營業中，而且離打烊至少 10 分鐘（和主程式 N2 同一條規則）。
- STOP 條件：
  1. 自動站候選在 ETA 時已打烊、未開門、或剩不到 10 分鐘 → 不派，換下一個符合的候選；全部不符合 → 該站標無候選，新原因（例如 `closed`），卡片寫白話原因。
  2. 指定站、固定安排不換店；ETA 時不營業只在卡片警告。
  3. 沒有營業時間資料的店：維持現在的行為（顯示「營業狀態未確認」），不擋。⚠️ 假設，預設值即此。
  4. 午夜跨日（`etaDayOffset`）判斷正確：翌日的 ETA 用翌日的營業時間。
  5. 新測試在修正前失敗、修正後通過；全套單元測試、lint、`npm run typecheck`、CI（check、e2e、required）都綠。
  6. 用真的 API 跑通一次：在 Vercel 預覽站對 `/api/daily-route` 真送一次 POST，回應裡看得到營業判斷生效（證據存檔）。
  7. Places 費用不增加：不改 `MASK` 加新欄位。`currentOpeningHours` 已在 mask 裡，用它的 `periods`／`weekdayDescriptions`。
- 等級：M。理由：錯了會讓 Cross 走到關門的店（實際損失）。把關：獨立 Opus 子代理載入 checker skill，只給它 Cross 原話、本契約、PR 連結、證據。
- 預算：預估 ~150k token，上限 ~225k。
- 保留事項：合併 main（正式部署）🔒。其他無。

## 2. 做到哪
- 已完成（本棒，全部已上正式站）：
  - PR #59 合併（merge `73725ec8c09afcd8f9407324de05c99ddb367c57`），部署 `dpl_81csT3HrcZ763eqtoLJPLBkFfeZN` READY：重開頁面保留指定站（O2）、只剩 rest 時狀態列說 `今天的行程不用找店家。`（RT2-F1）、缺站點名取聯集（RT2-F2）。
  - PR #61 合併（merge `71f623c86e0d51c2397c897a1b8be653b4bde249`），部署 `dpl_u4kkJqgzwtyMbmVKEK4nPPHTqYHu` READY：重開頁面保留還沒搜尋的目錄站（6 張卡不再變 2 張）。
  - 讀完 `docs/ROADMAP.md` 與 `STATE.md`，給 Cross 6 項建議；Cross 選第 1 項。
- 外部動作（做了，不要重做）：#59、#61 合併；兩個 PR 的訂閱都已結束；排程 `trig_0172q2gd8EqvRppoyFdSuGwF` 已刪；`trig_014oixDQTGY2jL5dGRzVWRwB`、`trig_01RtkUviJshqdQgMHPEu521a` 是一次性、已觸發。本交接檔 push 到分支 `claude/busy-hamilton-4fsj04`。
- 進行中：無。第 1 項還沒動手，沒有寫到一半的檔案。
- 未開始：
  - 第 1 項：目標契約如第 1 段，本檔的主要待辦。
  - 第 1 項做完後的候選（要 Cross 選，不自動做）：2 有固定行程時排程可能遲到（`STATE.md` P0，`src/dailyRouting.ts` 每次走最近一站）；3 手機畫面驗收（先模擬 iPhone 截圖，真機要 Cross 5 分鐘）；4 試用資料匯出 N4（Cross 在 App 除錯畫面按「匯出」）；5 試用結束後路線 Q2（12-30 前裁定）；6 🔒 N5 Places 上限、L6 GCP 帳單上限。2.4 行為回饋迴圈是新功能，排 12-30 之後。
  - 舊分支清理：9 個已合併的遠端分支刪不掉（見第 4 段），清單在 `.handoff/20261112-0340-next-dev.md` 第 2 段。

## 3. 做了哪些決定和為什麼
- 本棒到軟上限就交接、不自己做第 1 項，因為 Claude.md §3.5「到上限的 80% 就不開新 task」；量到 `338,086 token（硬上限 400,000 的 85%）`。
- 這次自動開下一棒，因為目標已由 Cross 定好（原話 `好，做第 1 項`），不需要他再拍板。
- 第 1 項排第一，因為路線圖 §0 規定試用期 `試用期內不加新功能，只修派錯店`，這項正是派錯店，而且主程式已有同規則與工具可直接用（`src/places.ts` `closingTime`、`minutesUntilClose`）。
- 用 `currentOpeningHours` 不加新欄位，因為加 Places 欄位可能改變計費等級（動錢是保留事項）。
- 沒有營業時間資料時不擋，因為沿用現行顯示「營業狀態未確認」，擋掉會讓薄池更常缺站；⚠️ 這是假設，交付時列出。

## 4. 試過但行不通的
- 試了 `git push origin --delete <9 個分支>`：失敗，錯誤 `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Git Destructive].`。原因：自動模式擋刪遠端分支。不要再試；要 Cross 加權限或在 GitHub 網頁刪。
- 試了讀 localStorage 驗「重開頁面後站還在」：失敗，修正前後都印 `"after":["meal:一蘭"]`。原因：`loadDaily` 只過濾記憶體狀態、不改存檔。要數畫面上的 `article.dd-stop`。
- 試了推第二個 commit 後看舊 commit 的 CI：`required` 顯示失敗，錯誤 `FAILING JOBS: check: cancelled, e2e: cancelled`。原因：新 push 取消了舊 run，不是程式錯。只看最新 commit 的 CI。
- `merge_pull_request` 的 `expectedHeadSha` 給 7 碼會失敗：`The sha parameter must be exactly 40 characters`。要給 40 碼。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/f9810b10-d9f8-5b15-8cdf-d4b248337a25.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。對話網址：`https://claude.ai/code/session_01NsUyzm3MPvrwvRa4Q3HvYQ`。檢索方法見 session-handoff §7。不要整份讀。
2. `api/daily-route.ts` — 選店（第 277 行）、`missingStops`（第 294 行）、排程與回應（第 296–310 行）。
3. `src/places.ts` — 第 125 行 `closingTime`、第 148 行 `minutesUntilClose`：主程式「到店要開著」的現成工具。
4. `src/dailyRouting.ts` — 第 78 行 `scheduleRoute`：ETA 從這裡來；跨日偏移 `etaDayOffset`。
5. `src/dailyDecision.tsx` — `noCandidateText`（無候選原因文案）與卡片營業狀態顯示（`營業狀態未確認` 那行）。
6. `STATE.md` — 產品規則（不准編造營業狀態、失敗要保留原行程）。
7. `docs/ROADMAP.md` — §0 試用期規則；完成後在 §6 加一列。
