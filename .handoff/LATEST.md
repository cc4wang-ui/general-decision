# 交接｜daily-fixed-ontime
狀態：待接手
建立：2026-11-13 04:50 UTC｜環境：Claude Code（雲端容器）｜上下文：`331,393`／400k（過軟上限，Cross 說 `交接做 P0`）

## 1. 下一個對話先做什麼
1. 載入 /board-intake，替 P0 寫目標契約 `runs/daily-fixed-ontime/contract.md`。P0 原文（`STATE.md:42`，逐字）：`**P0 — route algorithm correctness:** src/dailyRouting.ts uses a greedy nearest-feasible heuristic, not global route optimization. Fixed appointments may be late; alerts exist, but rigorous multi-appointment optimization, opening-hour constraints, overnight boundaries and transit choices remain unverified.`
2. Cross 不在線上，不問他。契約範圍用預設：⚠️「有固定行程時，只要存在一種排法能準時趕上所有固定行程，就要選那種排法；真的趕不上才顯示晚到警告」。opening-hour（已由 PR #64 做完）、transit 選擇不在範圍。等級 M（錯了會讓 Cross 遲到）。
3. 先讀 `src/dailyRouting.ts` 的 `scheduleRoute`（第 78 行起，共 143 行）和 `order`（`api/daily-route.ts`）。寫一條「貪婪排法會遲到、但有準時排法」的失敗測試，再修。
4. 修完：全套單元測試、lint、`npm run typecheck`、CI 綠；Vercel 預覽站真 POST；獨立 Opus 把關（checker skill）PASS；合併 main（Cross 已授權，不用再問）；正式站真 POST 驗收。

## 2. 做到哪
- 已完成（上一件 daily-area-radius，全部上線）：
  - PR #67 合併（merge `1b2fca13fdb5db59034c3c1d093ba56fc955a49e`），正式部署 `dpl_5aq7SQLex3oNk4Pr26BnQGKKngJ8` READY，真 POST 驗收通過。
  - PR #68（證據與交接檔，只有文件）合併（merge `e80d2bb7d3ee267dd39a52ed2caa59c8691205d2`）。
  - 兩個 PR 都已取消訂閱；安全網排程都已刪除。
- 進行中：無。沒有寫到一半的檔案。本交接檔用 PR #69 合併進 main（分支 `claude/sleepy-ritchie-etttn8`）。
- 未開始：
  - P0 本身（Cross 已選，見第 1 段）。
  - 其他候選（做完 P0 再請 Cross 選，不自動做）：已知未修——單站換店時其他自動站保留的舊候選不檢查半徑（`retentionOk` 沒有距離檢查）；手機畫面驗收；試用資料匯出 N4；試用結束後路線 Q2（12-30 前裁定）；🔒 N5 Places 上限、L6 GCP 帳單上限；舊分支清理。

## 3. 做了哪些決定和為什麼
- 合併到 main 不用再問 Cross，因為他 2026-11-13 原話：`merge不用再我批准` `一律核准`。CI 全綠、把關 PASS 就直接合併。
- 下一件做 P0，因為 Cross 原話：`交接做 P0`。
- 這一棒不開工 P0，因為上下文已 `331,393`，過了軟上限 320k。
- P0 範圍預設只做「固定行程能準時就要準時」，因為 STATE.md 列的到店營業時間已由 PR #64 處理，transit 不在今日行程範圍（`travelMode:'WALK'`）。
- 驗證沿用上一件的方法，因為已證實可行：測試先失敗後通過、預覽站真 POST、正式站真 POST 前後比對。

## 4. 試過但行不通的
- 試了合併時分支落後 main：失敗，錯誤 `405 3 of 3 required status checks are expected`。原因：規則要求分支跟 main 同步（`mergeable_state: behind`）。先把 main 合進分支、等 CI 全綠再合併。
- 試了部署網址的 Vercel 分享連結（`general-decision-fdfml4xft`）：失敗，302 轉登入頁，API 回 `HTTP 401`。改用分支別名（`general-decision-git-claude-<分支縮寫>-cc4wang-uis-projects.vercel.app`）或正式別名 `general-decision.vercel.app` 的分享連結。
- 試了 `git push -f`：被擋，錯誤 `[Git Destructive]`。分支合併後從 main 重開不需要 force，一般 push 即可。
- 每次 push 都會取消上一個 commit 的 e2e，`required` 顯示 failure。不是程式錯，只看最新 commit。
- 前景 `sleep`：被擋。用 `run_in_background: true`。
- 試了用 `create_trigger` 自動開下一棒（`create_new_session_on_fire: true`）：失敗，回傳 `warning: this trigger stores no MCP connectors, so the sessions it fires will run without connector (mcp__<server>__*) tools.`，而且 `sources` 是空的（沒有 repo）。原因：新 session 沒有 Vercel、GitHub 工具，做不了真 POST 和合併。排程已刪（`trig_01LawnG3HvadJmPH9stEZdtk`），改由 Cross 手動開新對話。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/0c4bb33a-395c-534c-ac6f-daadb0e4a0cd.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `src/dailyRouting.ts` — `scheduleRoute`：排程與晚到警告（第 111 行 `預計晚到`）。
3. `api/daily-route.ts` — `order()`：固定行程與可移動站的排序；`MAX_ROUTE_ROUNDS` 換店迴圈會重排。
4. `tests/unit/daily-open-on-arrival.test.ts` — Routes mock 寫法（`mockGoogle`）。
5. `runs/daily-area-radius/contract.md`、`runs/daily-area-radius/snapshots/live-README.md` — 契約與真 POST 證據的範例。
6. `STATE.md` 第 40–42 行 — P0 原文。
