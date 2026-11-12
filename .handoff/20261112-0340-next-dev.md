# 交接｜next-dev
狀態：待接手
建立：2026-11-12 03:40 UTC（03:48 更新）｜環境：Claude Code（雲端容器）｜上下文：約 255k／400k

## 1. 下一個對話先做什麼
1. 用 `mcp__github__pull_request_read`（method `get`，owner `cc4wang-ui`，repo `general-decision`，pullNumber `61`）看 `merged`。沒合併就看第 2 段「進行中」，照那裡做；已合併就用 `mcp__Vercel__list_deployments`（projectId `prj_bKA0WAdn6Nm03CaN5bDARIVAkLmi`，teamId `team_6HL0acbpoaKW1HCfcLy7fA0h`，target `production`）確認最新一筆 `READY`。
2. 問 Cross 一題（AskUserQuestion，第一個選項標「（建議）」）：「下一步開發哪一項？」選項照第 2 段「未開始」的 B、C、D。Cross 已選就跳過這條。
3. Cross 選 B、C、D：照第 2 段該項寫的「要 Cross 給什麼」，用一句話請他給，給了再開工。

## 2. 做到哪
- 已完成：候選 A 三個小錯修好，PR #59（分支 `claude/busy-hamilton-4fsj04`）。
  - O2：`loadDaily` 過濾器加 `t.specified`，重開頁面後指定站不再掉落。Chromium 實測：main 重開後 `stopCards` 是 `1`，修正後是 `2`。
  - RT2-F1：只剩 rest 時狀態列改說 `今天的行程不用找店家。`。
  - RT2-F2：缺站點名改成 `missingStops` 與逐站 `noCandidate` 的聯集，依 id 去重。
  - 測試：`Tests  1195 passed (1195)`；修正前新測試 `Tests  4 failed | 69 passed (73)`；lint 0；`npm run typecheck` exit 0。
  - CI：`check (tsc + lint + vitest)` success；Vercel 預覽 Ready。
- 外部動作（做了，不要重做）：push 分支、開草稿 PR #59、訂閱 PR #59、設備援檢查排程 `trig_0172q2gd8EqvRppoyFdSuGwF`（04:25 UTC 觸發）。本交接檔也 commit 到 PR #59 同一分支。
- 已完成（03:45 起）：PR #59 合併（merge `73725ec8c09afcd8f9407324de05c99ddb367c57`），正式部署 `dpl_81csT3HrcZ763eqtoLJPLBkFfeZN` 寫檔時 `BUILDING`；#59 訂閱已取消、排程 `trig_0172q2gd8EqvRppoyFdSuGwF` 已刪。Cross 選 E（AskUserQuestion 回答 `E 修自動站消失（建議）`）；E 已修、開草稿 PR #61（同分支，從 main 重開），已訂閱，備援排程 `trig_014oixDQTGY2jL5dGRzVWRwB`（04:37 UTC）。E 實測：重開前 `6`、重開後 `6`、第一次進來 `0`；`Tests  1196 passed (1196)`。
- 進行中：PR #61 等 CI。合併 main 會觸發正式部署（保留事項），要 Cross 說 `核准`；寫檔時還沒核准。本 session 還訂閱著。
- 未開始：下一步開發，等 Cross 選。候選（依建議順序）：
  - B 2.4 行為回饋迴圈（新功能）。要 Cross 給：核准 Q1–Q11。⚠️ 設計稿在 `~/workspace/general-decision-core-loop-2.0/design-2.4/DESIGN-feedback-loop.md`，不在 repo、容器裡也沒有；Cross 手上沒有就要重寫設計稿。
  - C 用試用資料調派店規則（ROADMAP N4、N6）。要 Cross 給：在 App 除錯畫面按一次「匯出」，把檔案給我們。
  - D Cross 的待決清單，只要裁定：hygiene 報告 #10 試用結束日（12-30 或 12-29）、#14 產品主次（核心班長 vs 今日行程）、#19 直傳時代部署工具要不要拿掉、#20 `npm run taste` 要不要留；ROADMAP N5 Places 上限 🔒、L3 聯絡信箱、L6 GCP 帳單上限 🔒、L7 遙測 🔒。另 2.3 AKOMEYA 按鈕文案待裁。
  - 舊分支清理（被擋）：已合併的 9 個遠端分支要刪：`claude/fable-repo-hygiene-ui-redesign-6h7sxl`、`claude/handoff-daily-layout-hha4hi`、`docs/adr-001`、`docs/adr-002`、`docs/roadmap-2.0`、`feature/daily-intent-first`、`feature/start-time-input`、`server/pr2-partial-seen`、`step3/stryker-threshold`。未合併的不刪：`claude/vigilant-clarke-dsrqfi`（9 commits）、`progress/memory-sync`（1 commit）。
  - 上一份交接檔的草稿 PR（分支 `claude/handoff-daily-layout-j63hzm`）被本檔取代，要不要關由 Cross 決定。

## 3. 做了哪些決定和為什麼
- 把 Cross 的 `核准` 當成選 A，因為上一棒建議 A，而且 A 不用拍板方向；Claude.md「能假設就不問」。
- O2 用「過濾器保留指定站」，不用上一份交接檔預設的「掛載重跑 `replanDaily`」，因為重跑會替 `tasks: []` 的空行程自動長出整條目錄行程，改掉「今天還沒有行程」空狀態（PR #57 才剛修過這個畫面）。
- 過濾器保留範圍是 `t.specified`（不只 `intentSpecified`），因為逐站指定的地點是使用者輸入的，濾掉等於丟資料。
- 前端 `isTextOnlyRest` 照抄伺服器 `api/daily-route.ts:34` 的規則，因為兩邊判斷「不用找店」必須一致。
- 分級 S（同一 context 自查，沒開獨立把關者），因為只是可復原的修錯，不對外、不動錢。
- 交接檔加進 PR #59 同一分支，因為合併 main 會觸發正式部署（保留事項）；併在一起只部署一次。
- E 的修法是過濾器保留目錄 id（`catalogTitle(t.id) !== undefined`），因為目錄站都能重建、來路不明的 id 照舊濾掉才安全；空行程不受影響。
- 這一棒不自動開下一棒，因為「下一步做什麼」是定目標，屬 Cross（Claude.md §4）；Cross 原話：`寫交接檔 看下一步要開發甚麼`。

## 4. 試過但行不通的
- 試了用 `git push origin --delete <9 個分支>` 刪已合併舊分支：失敗，錯誤 `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Git Destructive].`。原因：自動模式把刪遠端分支當破壞性動作。不要再試同一指令；要 Cross 加權限規則，或他在 GitHub 網頁刪。
- 試了用讀 localStorage 驗 O2：失敗，修正前後都印 `"after":["meal:一蘭"]`。原因：`loadDaily` 只過濾記憶體裡的狀態，不改存檔。要數畫面上的 `article.dd-stop` 卡片才驗得到。
- 上一棒的坑仍有效：CI 安裝瀏覽器 DNS 失敗已用重試解決，不要手動重跑等它好；今日行程不要加位移進場動畫（會捲走 `151` px）。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/f9810b10-d9f8-5b15-8cdf-d4b248337a25.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。對話網址：`https://claude.ai/code/session_01NsUyzm3MPvrwvRa4Q3HvYQ`。檢索方法見 §7。不要整份讀。
2. `docs/ROADMAP.md` — §0 試用期規則、§6 待 Cross 清單、§7.5 2.4 狀態、§7.6 O2 修法紀錄。
3. `runs/hygiene-ui-1111/reports/hygiene.md` — 24 條衝突清單，#10、#14、#19、#20 待 Cross。
4. `src/dailyDecision.tsx` — `loadDaily` 過濾器（O2、E 都改在這）；`buildDaily`、`replanDaily` 決定站怎麼長出來。
5. `STATE.md` — 產品規則與踩過的坑；開工前先讀。
6. `.handoff/20261111-0627-daily-layout.md` — 今日行程的 testid、色盤守門、版面坑。
7. `/tmp/claude-0/e2e/o2.cjs` — Chromium 驗 O2 的腳本（容器回收就沒了；寫法：vite dev 開 5179 port，`page.route('**/api/**')` 回 503，數 `article.dd-stop`）。
