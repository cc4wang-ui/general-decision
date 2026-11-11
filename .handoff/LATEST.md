# 交接｜daily-layout
狀態：待接手
建立：2026-11-11 06:27 UTC｜環境：Claude Code（雲端容器）｜上下文：435,547／400k

## 1. 下一個對話先做什麼
1. 切到分支並裝依賴：`git fetch origin claude/fable-repo-hygiene-ui-redesign-6h7sxl && git checkout claude/fable-repo-hygiene-ui-redesign-6h7sxl && npm ci`。PR #54 還沒合併，新工作要疊在這個分支上。若環境指定了別的分支，先把這個分支合進去。
2. 讀 `src/dailyDecision.tsx` 第 470 行起的 `DailyDecision` 元件（JSX 約在 640–778 行）和 `src/dailyDecision.css`，再跑 `npx playwright test tests/shots` 看 `shots/09-daily.png` 的現況。
3. 重排今日行程版面。Cross 原話：`今日行程版面也重排，不要長表單`。只改版面，不改 `buildDaily`／`replanDaily`／`api/daily-route.ts` 等邏輯。
4. 做完跑五道關卡（指令在第 2 段），推上同一個 PR，再派獨立 Opus 把關者驗收。走 /board-intake。

## 2. 做到哪
- 已完成：repo 整理＋全站視覺改版，在草稿 PR `cc4wang-ui/general-decision#54`，head `705a7bb`，CI 四項全 success，獨立把關第 2 輪 PASS。未合併。外部動作只有 push 與開草稿 PR、更新 PR 描述，都做了。
- 已完成：今日行程只套了新 token 與外框；「想做什麼」的勾選改成膠囊（`src/dailyDecision.css` 檔尾）。版面骨架沒動。
- 進行中：無。這份交接檔寫完後會 commit 並 push 到同一分支。
- 未開始：今日行程版面重排。目前是一張「今日設定」長表單：出發地、用目前位置、幾點開始、想去哪裡、目的地是哪一站、想做什麼、地區偏好、搜尋鈕、加入已安排的行程、備註，全部直排在行程清單上方。
- 關卡指令：`TZ=Asia/Taipei npm run typecheck`、`npm run lint`、`TZ=Asia/Taipei npm test`（現在 1184 passed）、`npm run build`、`npx playwright test tests/e2e`（現在 127 passed）。

## 3. 做了哪些決定和為什麼
- 今日行程這輪只換外觀、不重排，因為契約 `runs/hygiene-ui-1111/contract.md` 的假設是「只換視覺、不改產品邏輯」。Cross 看完後要求重排：`今日行程版面也重排，不要長表單`。
- 建議方向（⚠️ 我的提案，Cross 沒拍板）：行程清單放最上面當主角；設定收成一排摘要膠囊（出發地、開始時間、想去哪、想做什麼、地區），點膠囊才開底部選單編輯，沿用主畫面現成的 `.sheet` 樣式；「搜尋店家並生成路線」做成固定在底部的主按鍵。理由：參考的得獎 app 都是一個畫面一個主動作（`docs/DESIGN-2026-11.md`）。
- 不要另立一套樣式 token，也不要在畫面裡再包一層 `<main>`，因為 `STATE.md` §4 記錄過這兩件事造成嚴重的版面不一致，Cross 當時退件。繼承 `src/styles.css` 的 token 與 440px 寬。
- 畫面上的實色只能用 `src/palette.ts` 裡的值，因為 `tests/unit/palette-guard.test.ts` 與 `tests/e2e/palette.spec.ts` 會擋。
- 既有的 `data-testid` 要保留：`daily-generate`、`daily-origin`、`daily-origin-here`、`daily-origin-typed`、`daily-start-time`、`daily-intent-destination`、`daily-intent-destination-station`、`daily-intent-summary`、`daily-clear-seen`、`daily-intent-activity-<id>`，因為 `tests/unit/dailyDecision-ui.test.tsx`、`dailyDecision-start-time.test.ts`、`tests/e2e/daily-location.spec.ts` 靠它們定位。欄位收進底部選單後，測試要改成先點開再操作；這是規格變了，不是放寬。
- 合併 PR 仍是 🔒，因為 `main` 一更新 Vercel 就部署正式站。只有 Cross 在對話裡說「核准」才合併。

## 4. 試過但行不通的
- 試了在首頁上方導覽列用 `flex-wrap:wrap`：失敗，連勝標籤出現時換成兩排，把格子往下擠，`tests/e2e/streak.spec.ts` 報 `expect(last!.y + last!.height).toBeLessThanOrEqual(vh)`。原因：首頁要在 664px 高內放完。不要再試；今日行程若加固定底部按鍵，也要留意可視高度。
- 試了給頭像加無限循環的 CSS 動畫而不改測試：失敗，錯誤 `Error: page.evaluate: Test timeout of 30000ms exceeded.`。原因：`streak.spec.ts` 的 `stableBox` 等所有動畫 `finished`，無限動畫永遠不結束。已改成略過 `iterations === Infinity` 的動畫。新增無限動畫時不用再處理，但別的 spec 若有同類等待要照做。
- 試了在 favicon 的 `<svg>` 上加第二組 `width`／`height`：失敗，Chromium 顯示 `error on line 1 at column 111: Attribute 'width' is redefined`。原因：屬性重複讓整張 SVG 解析失敗。已修並有測試守門。不要再試。
- 試了連推兩個 commit：前一輪 CI 被取消，`required` 檢查顯示 failure。原因：`.github/workflows/ci.yml` 設了 `cancel-in-progress: true`。這不是程式問題，看最新 head 的結果即可。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/b80df062-e9c7-5885-92b1-3b5a6d616773.jsonl`。⚠️ 這是雲端容器裡的路徑，容器回收後就沒了；新容器讀不到時，以這份交接檔與 repo 內的檔為準。舊對話網址：`https://claude.ai/code/session_01NsUyzjiqtt2xnh9uzgL9SU`。檢索方法見 §7。不要整份讀。
2. `src/dailyDecision.tsx` — 要重排的元件；470 行之前是純邏輯，不要動。
3. `src/dailyDecision.css` — 今日行程的樣式；檔尾兩段是這輪加的。
4. `docs/DESIGN-2026-11.md` — 設計三條規則、token 表、得獎 app 參考。
5. `src/styles.css` — 共用 token 與 `.sheet`、`.chip`、`.btn` 樣式；新樣式在檔尾「改版」區。
6. `STATE.md` — §2 今日行程的產品規則、§4 踩過的坑。
7. `runs/hygiene-ui-1111/contract.md` 與 `runs/hygiene-ui-1111/reports/hygiene.md` — 上一輪的契約與 24 條衝突清單（#14、#19、#20、#10 等 Cross 裁定）。
8. `tests/shots/shots.spec.ts` — `09-daily` 截圖的產生方式；改版後用它出改前改後圖。
