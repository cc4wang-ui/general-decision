# 交接｜daily-open-on-arrival
狀態：待接手
建立：2026-11-13 03:27 UTC｜環境：Claude Code（雲端容器）｜上下文：`310,794`／400k（Cross 說 `/anthropic-skills:session-handoff`，所以交接）

## 1. 下一個對話先做什麼
1. 確認 PR #65 的正式部署上線：Vercel MCP `list_deployments`（projectId `prj_bKA0WAdn6Nm03CaN5bDARIVAkLmi`、teamId `team_6HL0acbpoaKW1HCfcLy7fA0h`、sha `a7e571bae9bf443f758fc93ce0124a3bb2317b91`），`state` 要是 `READY`。PR #65 只有文件，不用再驗收行為。
2. 請 Cross 從第 2 段「未開始」選一項。沒選之前不動手，不開下一棒（全部候選都要他選）。
3. 他選了之後，依 /board-intake 開目標契約（`runs/<代號>/contract.md`），再開工。

## 2. 做到哪
- 已完成（本棒）：
  - R3 修好：`api/daily-route.ts` 換店挑選鏈尾加 `??usable[0]`（估計挑不到就交給下一輪 Routes 實算）。
  - 預覽站實測抓到壞資料：fallback 派了阿曼馬斯喀特的咖啡廳（`travelMin 161849`、`etaDayOffset 113`）。修法：換店只用 `SEARCH_BIAS_M`（3500 m）內的候選。
  - 把關第 2 輪 FAIL：半徑以出發點為中心時，開地區偏好且出發點離地區 4.4 km，地區內營業的店被誤標 `closed`。修法：中心改 `areaPref??center`。
  - 新增 3 條回歸測試，全套 `Tests 1219 passed (1219)`。ROADMAP §6「今日行程到店要開著」已改 `✅ 2026-11-12`。
  - PR #64 合併（merge `1c58ba30362aed8065270869eaf7c63a48ab2e67`），Cross 原話 `核准`。正式部署 `dpl_5rki61Mgzs427x4Xq2F9vWs9SSH3` READY，真 POST 驗收通過。
  - PR #65（正式站證據，只有文件）合併（merge `a7e571bae9bf443f758fc93ce0124a3bb2317b91`），Cross 原話 `核准`。
- 外部動作（做了，不要重做）：PR #64、#65 已合併，兩個都已取消訂閱。安全網排程都已刪除。Vercel 分享連結已建：預覽站 1 個、正式部署 `general-decision-6woc2f537` 1 個、舊正式部署 `general-decision-oqjn9r7zk` 2 個（都 23 小時後失效）。本交接檔 push 到分支 `claude/handoff-daily-open-arrival-prquy1`。
- 進行中：無。沒有寫到一半的檔案。
- 未開始（都要 Cross 選，不自動做）：
  - A 新發現：開地區偏好且出發點離地區很遠時，第一次搜尋以出發點為中心（`locationBias`），店都在地區外，被標 `area`。main 原本就有。證據 `runs/daily-open-on-arrival/snapshots/main-area-2230.summary.txt`。
  - B 第一次挑店（前 5 名隨機）沒有半徑限制，池子不到 5 家時可能抽到遠店。main 原本就有。
  - 舊候選：有固定行程時排程可能遲到（`STATE.md` P0）；手機畫面驗收；試用資料匯出 N4；試用結束後路線 Q2（12-30 前裁定）；🔒 N5 Places 上限、L6 GCP 帳單上限。
  - 舊分支清理：自動模式擋刪遠端分支，要 Cross 加權限或在 GitHub 網頁刪。

## 3. 做了哪些決定和為什麼
- fallback 用 `usable[0]`（池裡第一個沒試過的），因為估計只是排順序；派不派由下一輪 Routes 實際 ETA 決定，最後一輪仍標 `closed`，不會派到關門的店。
- 換店半徑用 3500 m，因為跟 Places 搜尋 `locationBias` 半徑同一個數（抽成常數 `SEARCH_BIAS_M`），不新增魔術數字。
- 開地區偏好時半徑中心用地區中心，因為池子已被 `areaOk` 限在地區 1 km 內，用出發點會把地區內的店丟掉（把關第 2 輪實測）。
- 地區偏好的修正沒送第 3 輪把關，因為 Claude.md 規則 3「審查最多兩輪」。改用回歸測試加預覽站／正式站真 POST 比對。
- A、B 兩個既有問題不在本 PR 修，因為不在 R3 範圍，而且 main 原本就有；新正式站與舊正式站結果相同。
- ROADMAP 提早標 ✅（把關說太早），保留，因為那列記的是已上線的 PR #63，交接檔原本就指定這樣改。
- 正式站 22:30 藝廊、咖啡標 `closed`，判定不是退步，因為同一份請求打舊正式部署結果相同；18:00 出發兩版都派得出咖啡。

## 4. 試過但行不通的
- 試了只加 `??usable[0]`、不限距離（commit `139ba43`）：預覽站派到阿曼的店。原因：Places `locationBias` 只是偏好，池裡有遠店。已在 `584a574` 修。不要退回。
- 試了換店半徑以出發點為中心（commit `584a574`）：把關第 2 輪 FAIL，`missingStops:[{"id":"meal","reason":"closed"}]`。原因：地區偏好模式下出發點可能離地區很遠。已在 `0f6b6a8` 修。不要退回。
- 前景 `sleep 100`：被擋，錯誤 `Blocked: sleep 100 followed by: echo done. To wait for a condition, use Monitor with an until-loop`。改用 `run_in_background: true` 的 `sleep 90`。
- 舊 Vercel 分享連結重用：回 `HTTP 401`。原因：要重新呼叫 `get_access_to_vercel_url` 取新連結，再用新 cookie。
- 舊 commit 的 CI `required` 顯示 failure：不是程式錯，是新 push 取消舊 run 的 e2e（`e2e (Playwright) cancelled`）。只看最新 commit。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/be0104e5-6c31-5eac-9965-5878be7777a4.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。檢索方法見 session-handoff §7。不要整份讀。
2. `runs/daily-open-on-arrival/contract.md` — 凍結的目標契約（7 條 STOP），本件已全部達成。
3. `runs/daily-open-on-arrival/snapshots/live-README.md` — 所有真 API 證據的說明（預覽站、地區偏好、正式站）。
4. `api/daily-route.ts` — 搜 `SEARCH_BIAS_M`、`MAX_ROUTE_ROUNDS`：換店邏輯。做候選 A、B 都從這裡開始。
5. `tests/unit/daily-open-on-arrival.test.ts` — 23 條測試與 Routes mock 寫法。
6. `docs/ROADMAP.md`、`STATE.md` — 候選項目的來源。
