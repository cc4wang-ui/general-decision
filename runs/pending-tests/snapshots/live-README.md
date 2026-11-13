# 正式站瀏覽器 E2E 證據（pending-tests）

東京 2026-11-13 19:xx JST。正式站 `general-decision.vercel.app`（舊版 main，merge `6d2db22`）。
不攔截任何 API：Google Places、Google Routes 都是真呼叫。測試碼 `tests/prod/daily-prod.spec.ts`，設定 `playwright.prod.config.ts`。
跑法：`WEBKIT=1 PLAYWRIGHT_BROWSERS_PATH=<pw> npx playwright test -c playwright.prod.config.ts`。報告 `reports/e2e-report.json`，截圖 `shots/`，錄影 `videos/`。

## 1. P0 正式站 E2E（STOP 1）＋ 段內步行最短（STOP 4）
四個裝置（iPhone 13／iPad Pro 11／桌機 Chrome／iPhone WebKit）各自：渋谷駅出發、勾吃飯＋咖啡＋逛街、加兩個固定行程（タワーレコード、一蘭），按「搜尋店家並生成路線」。

| 裝置 | routeVerified | 總步行 | console error | 站數 | 快照 |
|---|---|---|---|---|---|
| iPhone 13 (Chromium) | **true** | 62 分 | 0 | 8 | `snapshots/iphone-generate.json` |
| iPad Pro 11 | **true** | 65 分 | 0 | 8 | `snapshots/ipad-generate.json` |
| 桌機 Chrome | **true** | 62 分 | 0 | 8 | `snapshots/desktop-generate.json` |
| iPhone WebKit | **true** | 62 分 | 0 | 8 | `snapshots/webkit-iphone-generate.json` |

- `routeVerified:true`、無「路線未驗證」警告，狀態列為「店家已確認 · 已更新 Google Routes 步行路線」。
- 兩個固定行程都在、時間照填；每份行程至少 3 站有真店名＋真地址＋真步行 ETA（咖啡站入夜打烊時誠實標 `noCandidate:closed`，畫面出現 ⚠ 警告，非假資料）。
- STOP 4：測試逐站比對畫面的店名／ETA／離開時間／步行分鐘＝同一份 API 回應（`expectUiMatches`），且 ETA 以 `etaDayOffset` 計跨夜後遞增。四裝置全通過。
- 無水平捲動（`scrollWidth ≤ innerWidth`）；照片至少一張真的從 `/api/place-photo` 載入。

## 2. P1 Shuffle（STOP 2，iPhone Chromium＋WebKit 各一次）
一份行程上依序操作，每步存 API 回應：
- **b 手動指定**：把某自動站改成「Fuglen Tokyo」→ 回應該站 `specified:true`、店名含 Fuglen（`snapshots/*-shuffle-1-specified.json`）。
- **c 已完成**：把 meal 標記完成，畫面出現 `is-done`、「已完成」。
- **a 換這一站**：只按目標站的「↻ 換這一站」→ 按下時即時回饋（按鈕變「找替代地點中…」、主鍵變「正在換這一站…」並停用，`shots/*-6-shuffle-busy.jpg`）→ 回應只有目標站換 Place ID，其他「原本有店」的站 Place ID 不變、固定站時間不變（`*-shuffle-2-swap.json`）。
- **重新搜尋整份**：已完成站與指定店保留同一 Place ID、固定站地點與時間不變（`*-shuffle-3-regenerate.json`）。

## 3. P1 裝置（STOP 3）
- iPhone 13、iPad Pro 11、桌機：Playwright 內建裝置尺寸，生成行程截圖 `shots/<裝置>-3-itinerary.jpg`、`-4-itinerary-photos.jpg`，皆無水平捲動；觸控裝置用真 `tap` 操作全程可用。
- **WebKit**：本容器能跑（下載 WebKit 26.6＋`playwright install-deps` 補齊系統函式庫），iPhone WebKit 兩個測試都 PASS。故 WebKit 已驗，非「未驗」。
- 真 iPhone Safari 實機：留給 Cross 一次性確認。步驟：手機 Safari 開 `https://general-decision.vercel.app` → 點「今日行程」→ 出發地填「渋谷駅」→ 勾想做的事 → 加一個固定行程 → 按「搜尋店家並生成路線」→ 看店名、照片、ETA 是否正常、頁面不左右晃。

## 4. 測出的 bug：已完成站被排進未來路線（已修，未部署）
- 現象（正式站現場重現，iPhone＋WebKit 兩次）：把晚餐標記完成後重新排路線，已完成站被排到行程最後、給未來 ETA **03:19 抵達**，還多算一段步行（報告 annotation `done-stop-eta: 03:19`；`snapshots/iphone-shuffle-2-swap.json` meal 站 `done:true` 卻 `eta 03:19`）。
- 根因：`api/daily-route.ts` 排路線時把 `done` 站當成沒有 `start` 的固定站，排進 `scheduleRoute` 的矩陣。
- 修正（本分支）：排路線只收 `!s.done` 的站（`routable`）；已完成站留在原位、不給 ETA、不算步行。新增單元測試 `tests/unit/daily-route.test.ts`「已完成站不排進路線」，拔掉修正會 FAIL。
- ⚠️ 未部署：Vercel 每日部署上限（約 2026-11-14 10:00 UTC 前）。本頁正式站證據是**舊版**；修正以單元測試驗，正式站重驗待上限恢復＋合併後。設 `EXPECT_DONE_FIX=1` 可讓 prod 測試對已完成站 ETA 做嚴格檢查（部署後用）。
