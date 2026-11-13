# 交接｜daily-retain-radius（已完成）
狀態：已完成，沒有待接手的工作。等 Cross 選下一件。
建立：2026-11-13 08:07 UTC｜環境：Claude Code（雲端容器）

## 1. 下一個對話先做什麼
1. 不要自動開工。下一件要 Cross 從第 2 段「未開始」選。
2. Cross 選好後：載入 /board-intake，寫 `runs/<任務代號>/contract.md`，照同樣方法做（失敗測試 → 修 → CI → 獨立把關 → 合併 → 正式站真 POST）。

## 2. 做到哪
- 已完成（daily-retain-radius，單站換店時其他站保留的舊店也要在 3.5 km 半徑內，全部上線）：
  - PR #72 合併（merge `cdac8229ce42052ab3c046df408c2a802c4c730e`），正式部署 `dpl_5A9gnF5LssJzB8j5QFcbZHuoVLqp` READY，真 POST 驗收通過（`runs/daily-retain-radius/snapshots/prod-*`）。獨立把關第 1 輪 PASS。
- 已完成（daily-fixed-ontime，P0「固定行程能準時就要準時」，全部上線）：
  - PR #70 合併（merge `3a2a9a9265ec9dfca6b78c06bc27eeb7d33ccef2`），正式部署 `dpl_GhmRPgJMS4v6MQWMUgmj8Q1A5M9d` READY，真 POST 驗收通過（`runs/daily-fixed-ontime/snapshots/prod-*`）。
  - 獨立把關第 2 輪 PASS（第 1 輪 FAIL：全有或全無，已修）。
  - PR #70 已取消訂閱；沒有排程。
- 進行中：無。本交接檔與合併後證據用另一個 PR 合併進 main（分支 `claude/friendly-shannon-r28vk3`）。PR #70、#71、#72 都已取消訂閱。
- 未開始（請 Cross 選，不自動做）：
  - 手機畫面驗收。
  - 試用資料匯出 N4。
  - 試用結束後路線 Q2（12-30 前裁定）。
  - 🔒 N5 Places 上限、L6 GCP 帳單上限。
  - 舊分支清理。
  - P0 剩下的部分（STATE.md 第 42 行）：總步行最短化、大眾運輸選擇。

## 3. 做了哪些決定和為什麼
- 只在貪婪排法報晚到時才跑新搜尋，因為要保證正常情況輸出完全不變（指紋測試＋把關者對 main 逐字比對 6,500 組）。
- 搜尋目標是「晚到站數最少」，不是「全部準時才救」。原因：把關第 1 輪指出，一個時間已過的行程會害其他行程失去救援。
- 晚到以站數計，不比晚到分鐘數（寫在契約 ⚠️ 假設）。
- 剪枝不用「直走時間」當下界，因為 Google 步行矩陣不保證三角不等式。
- 開工前實測：12 萬組隨機案例，舊貪婪 0 次誤報。真實 Google 資料下兩版結果相同。這次修正是保證，不是修常見錯誤。
- daily-retain-radius：保留的舊店用跟新派的店同一個半徑（`areaPref??center` 的 `SEARCH_BIAS_M`）。要換的站排除自己現在那間時改用原始 `s.candidate`，否則太遠的現任店會被挑回來（既有測試 `第 1 頁只有被換掉的遠店…` 抓到）。
- 合併不問 Cross，因為他 2026-11-13 原話：`merge不用再我批准` `一律核准`。

## 4. 試過但行不通的
- 第一版搜尋「全有或全無」：把關 FAIL。例：錨點 15:30、已完成 09:00 行程＋要繞路的 16:00 行程，輸出 `["D：預計晚到 391 分鐘","A：預計晚到 101 分鐘"]`。改成分支定界取最少晚到站數。
- 指紋測試共用隨機產生器：改產生器後指紋從 `kept:1950` 變 `kept:1800`。改成「過去時間」只在比對測試開啟（`randomCase(r,metric,true)`）。
- `bestSeq` 在閉包內改寫：tsc 報 `Property 'map' does not exist on type 'never'`。改成 `bestSeq as number[]|null`。
- 預覽站分享連結綁部署：新部署後舊連結回 `share 302`、POST `401`。新部署要重拿分享連結。
- 每次 push 取消上一個 commit 的 e2e，`required` 顯示 failure。看 job：check 是 success、e2e 是 `cancelled`，不是程式錯。
- 店家每次不同（例：正式站 06:41 派スギ薬局、06:52 派マツモトキヨシ）：自動站前 5 名隨機。不能逐店比對，改比 ETA 與晚到是否逐站一致（`live-consistency.txt`）。
- 把關子代理在 `tests/unit/zz-checker-*` 放暫存檔，stop hook 會要求 commit。不要 commit，等它刪。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/861b28da-98d1-5cf9-883d-654682ab89fd.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `runs/daily-fixed-ontime/contract.md`、`runs/daily-retain-radius/contract.md` — 凍結契約。
3. `runs/daily-fixed-ontime/snapshots/live-README.md` — 預覽站、正式站真 POST 證據。
4. `src/dailyRouting.ts` — `scheduleRoute`、`fewestLateOrder`、`ONTIME_SEARCH_NODES`。
5. `tests/unit/daily-fixed-ontime.test.ts` — 7 個測試（含窮舉比對與指紋）。
6. `STATE.md` 第 42 行 — P0 現況。
