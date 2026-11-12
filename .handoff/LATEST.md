# 交接｜daily-open-on-arrival
狀態：待接手
建立：2026-11-12 10:10 UTC｜環境：Claude Code（雲端容器）｜上下文：`323,354`／400k（已過軟上限，所以交接）

## 1. 下一個對話先做什麼
1. 準備 repo：工作目錄沒有 `general-decision` 就用 `add_repo`（owner `cc4wang-ui`，repo `general-decision`）再 clone。然後 `git fetch origin main && git checkout -B <系統指定的分支> origin/main && npm ci`。系統沒指定分支就用 `claude/daily-open-r3`。
2. 修「已知未修 R3」（同一份目標契約 STOP 1，契約全文在 `runs/daily-open-on-arrival/contract.md`）：`api/daily-route.ts` 換店挑選（搜 `const estAt=`、`const next=usable.find`）只用估計到店時間挑。估計比實際快時，實際到店營業的店被跳過，該站被標 `closed`。修法建議：估計挑不到時，不要直接 `closedStop`；改挑池裡第一個還沒試過的候選，交給下一輪 Routes 實算 ETA 驗證（被驗證不合格就進 `banned`）。仍受 `MAX_ROUTE_ROUNDS=5` 上限。
3. 先把第 5 段「原文摘錄」的 R3 重現寫成測試，加到 `tests/unit/daily-open-on-arrival.test.ts` 的「把關第 1 輪回歸」後面，確認修正前失敗、修正後通過。
4. 同一個 PR 把 `docs/ROADMAP.md` §6「今日行程到店要開著」那列改成 `✅ 2026-11-12`，附 `PR #63（c7579984）`；R3 修好後再補一句。
5. 跑 `npm run typecheck`、`npm run lint`、`npx vitest run`、`git add` 後 `npm run check:bundle`。開草稿 PR、訂閱、等 CI。
6. M 級把關：開獨立 Opus 子代理載入 `anthropic-skills:checker`，只給 Cross 原話、契約、PR、證據。審查最多兩輪。
7. 合併 main 會更新正式站 🔒：要 Cross 在對話裡說 `核准` 才合併。自動 session 不問問題：停在這一步，送停止報告。

## 2. 做到哪
- 已完成（本棒）：
  - PR #63 合併（merge `c7579984df7573fc748b048db99fa151d1817f66`）。Cross 原話 `deploy and handoff to next session`，我當作這次合併的核准。
  - 正式部署 `dpl_6v1cygK11ZQkHjZoD3qVYTQFmWz3`（`general-decision-oqjn9r7zk-cc4wang-uis-projects.vercel.app`）上線。真送 POST（`startTime` 22:30）：`routeVerified true`、coffee `closed`、其他站 `open`，creative 沒有營業時間資料 → `unknown` 照派。存檔 `runs/daily-open-on-arrival/snapshots/prod-2230.json`。
  - 新檔 `src/openAtEta.ts`；改 `api/daily-route.ts`、`src/dailyDecision.tsx`；新測試 `tests/unit/daily-open-on-arrival.test.ts`（20 條）。全套 `Tests 1216 passed (1216)`。CI run `43182011394` 全綠。
  - 把關兩輪：第 1 輪 FAIL（R1 換店輪數用完、R2 23:59 縫）→ commit `7d67adc` 修好。第 2 輪 FAIL 只剩「其他」類 R3 → 依 board-intake §7 照樣交付，列已知未修。
- 外部動作（做了，不要重做）：PR #63 已合併、已取消訂閱。兩個 Vercel 分享連結已建（23 小時後失效）。本交接檔 push 到分支 `claude/zen-knuth-vvuu5a`（已合併的分支，只放交接檔與正式站證據）。
- 進行中：無。沒有寫到一半的檔案。
- 未開始：
  - R3 修正（第 1 段第 2–7 條）。
  - ROADMAP §6 那列改 ✅（第 1 段第 4 條）。
  - 之後的候選（要 Cross 選，不自動做）：2 有固定行程時排程可能遲到（`STATE.md` P0）；3 手機畫面驗收；4 試用資料匯出 N4；5 試用結束後路線 Q2（12-30 前裁定）；6 🔒 N5 Places 上限、L6 GCP 帳單上限。
  - 舊分支清理：自動模式擋刪遠端分支，要 Cross 加權限或在 GitHub 網頁刪。

## 3. 做了哪些決定和為什麼
- 用 `currentOpeningHours.periods` 判斷，不加 Places 欄位，因為契約 STOP 7：`不改 MASK 加新欄位`。
- 先排路線、再檢查、不合格就換店重排，因為 ETA 要排完路線才知道。換店從第一次搜尋的同一池候選拿，因為不多打 Places。
- 最後一輪還不合格的站標 `closed`，用子矩陣重排、不再打 Routes，因為要保證迴圈會結束、Routes 呼叫有上限。
- 帶日期的 periods 用實際日期判斷；ETA 不在資料涵蓋範圍（舊存檔）就退回星期幾規則，因為舊存檔的日期會過期，直接用會誤判全部打烊。
- R3 沒在本棒修，因為已過軟上限（`323,354` token），而且 board-intake §7 規定兩輪後只擋「跑不完」「壞資料」。R3 不會派到關門的店，最壞是少一站並標原因。
- Routes 失敗時維持舊行為（只看 openNow），因為沒有 ETA 就無法判斷。

## 4. 試過但行不通的
- 試了只用「舊店的 ETA」挑替代店（`cce761f`）：把關 R1 失敗，`noCandidateReason:"closed"` 但池裡 D 在 12:50 是 `open`。原因：越遠的店越晚到，一間一間換把 3 次上限用完。已在 `7d67adc` 改。不要退回。
- 試了用直線距離 × 步速估新店 ETA（`7d67adc`）：把關 R3 失敗。原因：繞路時估計偏快，實際營業的店被跳過。這是下一棒要修的。
- 試了在 `git add` 前跑 `npm run check:bundle`：失敗，錯誤 `FAIL api/daily-route 載不起來：ERR_MODULE_NOT_FOUND Cannot find module '/tmp/vartask-Q06WBF/src/openAtEta.ts'`。原因：腳本用 `git ls-files` 展開，新檔要先 `git add`。
- 摘要腳本用 `require('runs/...')` 相對路徑：失敗，錯誤 `Cannot find module 'runs/daily-open-on-arrival/snapshots/live-now.json'`。原因：node require 不吃相對路徑，要 `path.resolve`。
- 舊 commit 的 CI `required` 顯示失敗：不是程式錯，是新 push 取消舊 run。只看最新 commit。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/b841f238-59f7-58e6-84a0-243b63e49cc3.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔和「原文摘錄」為準。檢索方法見 session-handoff §7。不要整份讀。
2. `runs/daily-open-on-arrival/contract.md` — 凍結的目標契約（7 條 STOP）。
3. `api/daily-route.ts` — 搜 `MAX_ROUTE_ROUNDS`：到店營業檢查、換店、子矩陣重排都在這段。
4. `src/openAtEta.ts` — 營業狀態純函式。
5. `tests/unit/daily-open-on-arrival.test.ts` — 現有 20 條測試與 Routes mock 寫法。
6. `runs/daily-open-on-arrival/snapshots/live-README.md`、`prod-2230.json` — 真 API 證據。
7. `docs/ROADMAP.md` — §6 要改的那一列。
