# 交接｜prod-redeploy（下一棒：正式站重新部署＋重驗已完成站修正）
狀態：待接手（pending-tests 已完成、已合併）
建立：2026-11-13 10:35 UTC｜環境：Claude Code（雲端容器）

## 1. 下一個對話先做什麼
1. **時間閘**：Vercel 免費方案每日部署上限（滾動 24 小時）。2026-11-13 10:26 UTC 再次被擋，錯誤逐字：`Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day")`。**2026-11-14 10:30 UTC 之後**才做第 2 步。改方案＝動錢 🔒，不要做。
2. 確認正式站別名 `general-decision.vercel.app` 指向哪個部署（有 Vercel 工具：`get_deployment` 看 `githubCommitSha`）。若不是 main 的 `e391097`（或之後），讓 main 重新部署 production（git 來源，不要直接上傳）：有 Vercel 工具就對 main 重新部署；沒有 Vercel 工具（排程開的 session 可能沒有 connector），就合併一個 main 的小 PR（例如本檔更新），由 Vercel git 整合自動部署。判斷新版已上線：`curl -s -X POST https://general-decision.vercel.app/api/daily-route` 帶一個 `done:true` 有候選的站＋一個自動站，回應的已完成站沒有 `eta`；或直接跑第 3 步。
3. 正式站重驗（不攔截 API，真 Google）：
   `WEBKIT=1 EXPECT_DONE_FIX=1 E2E_OUT=runs/pending-tests/prod-after PLAYWRIGHT_BROWSERS_PATH=<pw> npx playwright test -c playwright.prod.config.ts --project=iphone --project=webkit-iphone`
   WebKit：`PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/pw npx playwright install webkit`＋`npx playwright install-deps webkit`，再把 `/opt/pw-browsers/*` 符號連結進同一個 `<pw>` 目錄（否則 Chromium 找不到）。
   PASS 條件：4 個測試全過；`prod-after/snapshots/*-shuffle-2-swap.json` 已完成站沒有 `eta`。
4. 更新 `STATE.md` 第 3 段 route-algorithm 那行（加「正式站重驗 PASS」與部署 ID），`runs/pending-tests/snapshots/live-README.md` §4，本檔。只改文件就開小 PR，CI 綠合併（授權見第 3 段）。
5. 真 iPhone Safari 實機：只能 Cross 做（步驟在 `runs/pending-tests/snapshots/live-README.md` §3）。送看板「待你處理」，不要催。

## 2. 做到哪
- 已完成（pending-tests，STATE.md 第 3 段全部待測項）：
  - PR #77 合併（merge `e391097ec93a64ef605d5d0dba278877803df050`）。
  - 正式站瀏覽器 E2E（真 Places/Routes）：iPhone 13、iPad Pro 11、桌機 Chrome、iPhone WebKit 生成行程全 PASS（`routeVerified:true`、2 個固定行程、console error 0、畫面＝API）。Shuffle（指定、已完成、換一站、重搜、多固定行程、即時回饋）iPhone＋WebKit PASS。
  - 測出 bug 並修：已完成站被排進未來路線（正式站顯示 `03:19` 抵達、多算步行）。`api/daily-route.ts` 只排 `!done` 的站；回歸測試 `tests/unit/daily-route.test.ts`（117 條，拔掉修正會 FAIL）。
  - 預覽站 `dpl_ArQZpgwumkAVJuvdjncSobKrcxWr`（commit `532ec8e`）用 `EXPECT_DONE_FIX=1` 跑 iPhone＋WebKit 4/4 PASS，已完成站無 ETA（`runs/pending-tests/preview/`）。
  - 獨立把關第 1 輪：PASS，已知未修 3 項：正式站重驗（本棒）、真 iPhone（Cross）、報告數字差 1（已更正）。
- 進行中：無。
- 未開始：第 1 段第 2–4 步（時間閘後）。第 5 步等 Cross。
- 其他候選（請 Cross 選，不自動做）：試用資料匯出 N4；試用結束後路線 Q2（12-30 前裁定）；🔒 N5 Places 上限、L6 GCP 帳單上限；舊分支清理；全域步行最短（要 Cross 定「空等多久可以接受」）。

## 3. 做了哪些決定和為什麼
- 正式站 E2E 不 mock：契約要真實環境證據。只驗結構與保留行為，不驗特定店名（Places 每次可能解析到不同分店）。
- 已完成站＝「已經去過」，不排路線、不給 ETA、留原位。舊版當成沒 start 的固定站，貪婪排到最後。
- 「沒勾的活動仍出現在行程」是設計（勾選不刪站，要按「今天略過」），不是 bug，沒改。
- 咖啡站晚上打烊時回 `noCandidate:closed` 並顯示 ⚠，是誠實行為；測試接受「有店或標明原因」。
- `tests/prod/` 不進 CI（要真 API＋正式站）。預設 `playwright.config.ts` 只收 `tests/e2e`、`tests/shots`。
- 合併不問 Cross：原話 `merge不用再我批准` `一律核准`、`CI 綠了就合併`。

## 4. 試過但行不通的
- 只設 `PLAYWRIGHT_BROWSERS_PATH` 指到新目錄 → Chromium 啟動失敗（`npx playwright install` 提示）。解法：把 `/opt/pw-browsers/*` 符號連結進去。
- WebKit 下載成功但缺系統庫（`libgtk-4.so.1` 等）→ `npx playwright install-deps webkit` 補齊後可跑。容器重啟後仍在（本次驗過）。
- 受保護的預覽站：`page.goto('/')` 會被擋。設 `SHARE_URL=<含 _vercel_share 的分享連結>`，spec 會先開它拿 cookie（分享連結用 `mcp__Vercel__get_access_to_vercel_url`，23 小時過期）。
- 整頁截圖 iPhone DPR 3 約 39MB → 轉 JPEG 半尺寸 q60 約 5MB 才 commit。
- `git stash push api/...` 在檔案已 commit 時是 "No local changes"；拔修正要直接改檔再 `git checkout` 還原。
- 部署上限是滾動視窗：同一天內釋出一個名額，第一個 push 用掉後第二個又被擋。少 push。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/62668284-76c8-5ded-b052-68c698650dd1.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `runs/pending-tests/contract.md` — 契約（STOP 1–5）。
3. `runs/pending-tests/snapshots/live-README.md` — 正式站與預覽站證據、bug 說明、真 iPhone 步驟。
4. `runs/pending-tests/reports/pending-tests.md` — 小組報告。
5. `tests/prod/daily-prod.spec.ts`、`playwright.prod.config.ts` — 正式站 E2E（env：`PROD_URL`、`SHARE_URL`、`E2E_OUT`、`EXPECT_DONE_FIX`、`WEBKIT`）。
6. `api/daily-route.ts` 約第 352–360 行 `routable` — 修正位置。
7. `STATE.md` 第 3 段 — 現況。
