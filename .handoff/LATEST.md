# 交接｜daily-area-radius
狀態：待接手
建立：2026-11-13 04:40 UTC｜環境：Claude Code（雲端容器）｜上下文：約 150k／400k（本件完成，交接給下一件）

## 1. 下一個對話先做什麼
1. 請 Cross 從第 2 段「未開始」選一項。沒選之前不動手。
2. 他選了之後，依 /board-intake 開目標契約（`runs/<代號>/contract.md`），再開工。
3. 合併到 main 不用再問 Cross（他 2026-11-13 原話：`merge不用再我批准` `一律核准`）。CI 全綠、把關 PASS 就直接合併。

## 2. 做到哪
- 已完成（本棒）：
  - PR #65 正式部署確認 `READY`（`dpl_ErmcKmUo23jpKg4XBCoKFJR4ZDiA`）。
  - Cross 選 `A+B 一起修 (Recommended)`。契約 `runs/daily-area-radius/contract.md`（8 條 STOP）。
  - A：開地區偏好時，自動站 `locationBias` 中心改地區中心，查詢字串不附加出發地名。
  - B：自動站候選只收 `SEARCH_BIAS_M`（3500 m）內的店；只剩遠店標 `empty`，不往下翻頁。
  - 新測試 `tests/unit/daily-area-radius.test.ts` 9 條。全套 `Tests 1228 passed (1228)`。
  - 獨立把關第 1 輪 PASS。問題 1 已在 `c41264c` 修。
  - PR #67 合併（merge `1b2fca13fdb5db59034c3c1d093ba56fc955a49e`）。正式部署 `dpl_5aq7SQLex3oNk4Pr26BnQGKKngJ8` READY，真 POST 驗收通過（`runs/daily-area-radius/snapshots/live-README.md`）。
- 外部動作（做了，不要重做）：PR #67 已合併、已取消訂閱，安全網排程已刪。Vercel 分享連結已建 5 個（23 小時後失效）。
- 進行中：本交接檔與正式站證據的文件 PR（分支 `claude/sleepy-ritchie-etttn8`）。
- 未開始（都要 Cross 選）：
  - 把關已知未修 2：單站換店時，其他自動站保留的舊候選不檢查半徑，舊存檔的遠店會照留（`retentionOk` 沒有距離檢查）。
  - 舊候選：有固定行程時排程可能遲到（`STATE.md` P0）；手機畫面驗收；試用資料匯出 N4；試用結束後路線 Q2（12-30 前裁定）；🔒 N5 Places 上限、L6 GCP 帳單上限。
  - 舊分支清理：自動模式擋刪遠端分支，要 Cross 加權限或在 GitHub 網頁刪。

## 3. 做了哪些決定和為什麼
- 半徑沿用 `SEARCH_BIAS_M` 3500 m，跟換店同一個數，不新增魔術數字。
- 只剩遠店的原因用既有 `empty`，不新增原因種類，前端不用改。
- 只剩遠店就不翻頁，守住契約 STOP 8（Places 次數不增加）。判斷用跟挑店同一份排除條件（把關問題 1）。
- 排序（距離出發點＋評分）不改，不在契約範圍。
- 正式站 22:30 coffee、meal 標 `closed`，判定不是退步：修正前正式站同一份請求也是 `closed`（週五 Google 營業資料）。

## 4. 試過但行不通的
- 合併回 `405 3 of 3 required status checks are expected`：原因是分支落後 main（`mergeable_state: behind`）。把 main 合進分支、等 CI 全綠後才成功。
- 用部署網址（`general-decision-fdfml4xft`）的分享連結：回 302 轉登入頁，API 回 HTTP 401。改用分支別名或正式別名的分享連結就成功。
- 每次 push 都會取消上一個 commit 的 e2e，`required` 顯示 failure。不是程式錯，只看最新 commit。
- `git push -f`：被自動模式擋（`[Git Destructive]`）。分支合併後從 main 重開時不需要 force，一般 push 就是 fast-forward。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/0c4bb33a-395c-534c-ac6f-daadb0e4a0cd.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `runs/daily-area-radius/contract.md`、`runs/daily-area-radius/snapshots/live-README.md`。
3. `api/daily-route.ts` — 搜 `nearOk`、`searchCenter`、`sawFar`、`SEARCH_BIAS_M`。
4. `tests/unit/daily-area-radius.test.ts`。
5. `docs/ROADMAP.md`、`STATE.md` — 候選項目的來源。
