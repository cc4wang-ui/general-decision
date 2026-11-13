# 小組報告｜pending-tests

結論：STATE.md 第 3 段四項待測全部在正式站 `general-decision.vercel.app` 用真 API、四種裝置（iPhone／iPad／桌機／WebKit）跑過瀏覽器 E2E，附截圖、錄影、API 快照。過程測出一個正式站 bug：已完成站被排進未來路線（顯示 03:19 抵達、多算步行），已在本分支修正並加單元測試（拔掉會 FAIL），因 Vercel 每日部署上限未部署。單元全綠 1248→1249。

## STOP 自查（逐條，附證據）
1. **P0 正式站 E2E** — PASS。四裝置 `routeVerified:true`、無未驗證警告、含 2 個固定行程、真店名＋地址＋ETA、console error 0。證據 `snapshots/*-generate.json`、`snapshots/live-README.md` §1、`shots/*-3-itinerary.jpg`。
2. **P1 Shuffle** — PASS（iPhone Chromium＋WebKit 各一次）。手動指定、已完成保留、換一站只換目標且有即時回饋、重新搜尋保留已完成與指定店、多固定行程時間不變。證據 `snapshots/*-shuffle-*.json`、`shots/*-5~8`、`live-README.md` §2。
3. **P1 裝置** — PASS。三尺寸截圖無水平捲動、觸控 tap 全程可用；WebKit 本容器跑得起來且 PASS（非「未驗」）。真 iPhone Safari 實機步驟已寫給 Cross（`live-README.md` §3）。
4. **段內步行最短（正式站畫面）** — PASS。逐站比對畫面店名／ETA／離開／步行分鐘＝同一份 API 回應，ETA 跨夜後遞增。四裝置全過（`expectUiMatches`）。

## 產出檔案
- `tests/prod/daily-prod.spec.ts`、`playwright.prod.config.ts`（正式站 E2E，不攔截 API）
- `api/daily-route.ts`（修正：已完成站不排進路線）
- `tests/unit/daily-route.test.ts`（+1 回歸測試）
- `runs/pending-tests/snapshots/live-README.md`、`reports/e2e-report.json`、`shots/`（24 張 JPG）、`videos/`（6 支）

## 未完成／⚠️ 假設
- ⚠️ 正式站證據是**舊版** main：修正未部署（Vercel 每日部署上限，約 2026-11-14 10:00 UTC 前）。修正以單元測試驗；正式站重驗待上限恢復＋合併後（`EXPECT_DONE_FIX=1`）。
- ⚠️ 真 iPhone Safari 實機由 Cross 一次性確認（步驟已附）；WebKit 引擎已在容器驗過。
- ⚠️ Places 真資料每次店名可能不同；只驗結構與保留行為，不驗特定店名（契約假設）。
