# 交接｜pending-tests（下一棒：所有待定測試工作）
狀態：待接手（daily-walk-shortest 已完成）
建立：2026-11-13 10:00 UTC｜環境：Claude Code（雲端容器）

## 1. 下一個對話先做什麼
Cross 原話（逐字，2026-11-13）：`合併完之後，handoff 換到下個對話去進行所有待定測試工作`。
1. 載入 /board-intake，寫 `runs/pending-tests/contract.md`。範圍＝`STATE.md` 第 3 段「Open failures」裡所有「待驗證／待測」項目（逐字見下）。Cross 不在線上，不問他；成功指標預設：⚠️「每一項都有真實環境證據（截圖、錄影或 E2E 報告），或寫明為什麼做不到、要誰做什麼」。等級 M（對外交付品質；Cross 要親眼看）。
2. 待測項目（逐字抄自 `STATE.md` 第 3 段）：
   - `**P0 — full production E2E unverified:** ... Real production POST and browser device interactions still need independent confirmation.`
   - `**P1 — Shuffle remaining coverage:** actual preview smoke PASS for alternate cafe + preserved meal/fixed stop; still missing browser E2E for manually overridden destinations, completed stops, multiple appointments and UI live feedback.`
   - `**P1 — UI device testing:** ... **No verified real iPhone Safari/iPad/desktop screenshots or touch E2E** yet.`
   - 本次新上線的「段內步行最短」：在瀏覽器上看今日行程的順序與 ETA（正式站）。
3. 做法建議：Playwright 對正式站 `general-decision.vercel.app` 跑瀏覽器 E2E 與截圖（iPhone、iPad、桌機尺寸；用 Playwright 內建裝置名）。容器只有 Chromium（`/opt/pw-browsers/chromium`）。⚠️ `docs/FAILURE-MEMORY.md:9`：Chromium 結果不等於 Safari／WebKit PASS；試裝 WebKit，裝不了就照實標「WebKit 未驗」，真 iPhone 留給 Cross 一次性確認（附精確步驟）。
4. 不要改產品程式，除非測出 bug；測出 bug 照 board-intake 開 PR 修（合併已授權：`merge不用再我批准` `一律核准`）。
5. 做完：證據存 `runs/pending-tests/`，更新 `STATE.md` 第 3 段各項狀態，獨立 Opus 把關（checker）PASS，更新本檔。

## 2. 做到哪
- 已完成（daily-walk-shortest，P0「總步行最短」，全部上線）：
  - PR #75 合併（merge `fe0b9dda5937628f8ee4c93bbd93d19eedf85d43`），正式部署 `dpl_7mXffyDvhx6ZoVtKHKW8cNcbvvf9` READY。
  - 正式站真 POST：同一份矩陣 53 分鐘（合併前 62），固定行程準時、不空等（`runs/daily-walk-shortest/snapshots/prod-*`、`live-README.md` 第 4 節）。
  - 獨立把關：第 1 輪 FAIL（阻擋：已完成站被拉到前面），已修；第 2 輪 FAIL 但沒有阻擋項，四項「其他」都已修（v3 證據、帶 start 的可移動站、契約目標行、STATE.md）。
  - 與舊版逐組比 4 萬組：晚到、步行、結束時間 0 組變差；可移動站換段 0 組；18728 組步行變短（`snapshots/probe-vs-main.json`）。
  - PR #75 已取消訂閱；沒有排程。
- 進行中：無。
- 未開始（Cross 已選，下一棒做）：所有待定測試工作（見第 1 段）。P0 路線演算法已完成；大眾運輸 Cross 決定不做。
- 其他候選（請 Cross 選，不自動做）：
  - 試用資料匯出 N4。
  - 試用結束後路線 Q2（12-30 前裁定）。
  - 🔒 N5 Places 上限、L6 GCP 帳單上限。
  - 舊分支清理。
  - （新）全域步行最短：要讓店可以跨過固定行程移動，需要先定「空等多久可以接受」，要 Cross 定成功指標。

## 3. 做了哪些決定和為什麼
- 參考排法＝舊版（貪婪；報晚到時用 `fewestLateOrder`）。固定站、已完成站、帶可解析 start 的站當段邊界不動；可移動站只在段內用 Held-Karp 重排（`shortestWithinSegments`，每段 ≤12 站）。嚴格更短才換。
- 不跨段，因為三次反例：
  1. v1 只比步行（`9283882`）：預覽站真 POST 先去 22:00 固定行程空等約 3.5 小時，8 站排到 22:47–02:04，7 站打烊（`preview-v1-pinned.json`）。
  2. v2 加「結束不晚於舊版」（`1b31e87`）：把關第 1 輪反例，已完成站 D 被拉到最前面，店 A 從 18:40 推到 22:46。
  3. v3 第 2 輪反例：手寫 POST 給可移動站帶 start，段內重排害它晚到 → 帶 start 的站也當邊界。
- 段內沒有等待，所以步行變短＝到下一個邊界更早，晚到與結束時間不可能變差（不用另加限制）。
- 指紋 `tests/unit/daily-fixed-ontime.test.ts` 刻意重算：`0025f4d55d2ab4e0` → `d4a5e0f87884a976`（kept 仍 1950）。
- 合併不問 Cross：2026-11-13 原話 `merge不用再我批准` `一律核准`；本次 Cross 也說 `CI 綠了就合併`。

## 4. 試過但行不通的
- v1、v2 見第 3 段。
- 真 API 比較：Places 對同一店名每次可能解析到不同分店（一蘭 渋谷店、代官山 蔦屋書店、Little Nap、ABOUT LIFE COFFEE BREWERS）。要比新舊版，用 `pinned3-request.json`（5 家每次同 Place ID）。
- 商場類地點（渋谷パルコ、MIYASHITA PARK、渋谷ヒカリエ、SHIBUYA TSUTAYA、渋谷ストリーム）被過濾成 `filtered`，不能當指定店。
- vitest 會吃掉 `console.log`；探測腳本改用 `writeFileSync` 寫到 scratchpad。放在 `tests/unit/.probe/`（隱藏資料夾）不會被執行，要放 `tests/unit/zzprobe/`，跑完刪掉。
- 停掉的把關子代理會留下 `tests/unit/zz-checker-*`，要手動刪。
- 每次 push 取消上一個 commit 的 CI，`required` 顯示 failure（實際是 `cancelled`）。看 run 的 conclusion。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/28c7578d-67bf-5184-97b4-01892a669a40.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `runs/daily-walk-shortest/contract.md` — 契約（STOP 2、8 已依把關補齊）。
3. `runs/daily-walk-shortest/snapshots/live-README.md` — 預覽站、正式站真 POST 證據。
4. `src/dailyRouting.ts` — `scheduleRoute` 尾段、`fewestLateOrder`、`shortestWithinSegments`、`WALK_SEGMENT_MAX`。
5. `tests/unit/daily-walk-shortest.test.ts` — 7 個測試（含兩輪把關反例、段內窮舉比對）。
6. `STATE.md` 第 42 行 — P0 現況。
