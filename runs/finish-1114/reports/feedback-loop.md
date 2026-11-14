小組報告｜feedback-loop

結論：2.4 最簡版已實作，未 commit。前端把三種行為寫進本機新 key，請求只在有過閾值的種類時多帶 `prefer`／`demote`；伺服器只在既有「前 5 名隨機挑」裡改機率（偏好 6：一般 2：降權 1），不動任何門檻與候選集合。typecheck、lint、單元測試（1327）、build、真瀏覽器 12 項檢查都過。⚠️ `check:bundle` 在目前工作目錄會 FAIL，因為新檔 `src/dailyAffinity.ts` 還沒被 git 追蹤；`git add` 後才會 PASS（見 STOP 7）。

STOP 自查：
1. PASS — 新 key `decide.daily.affinity.v1`（`src/dailyAffinity.ts:6`），權重 +3／+2／−1（`:8`），半衰期 30 天讀取時算（`:9`、`:57`）。寫入點：標記完成 `src/dailyDecision.tsx:635`（取消勾選會撤回同一筆）；指定站解析到真店與單站換店 `src/dailyDecision.tsx:368`，只在搜尋成功後記（`:580`）。種類只用 `kindOfCandidate`，undefined 不記（`src/dailyAffinity.ts:40`）。
2. PASS — 請求欄位 `prefer`／`demote`（`src/dailyDecision.tsx:376`、`:577`），閾值 ±2、各最多 20（`src/dailyAffinity.ts:66`）。伺服器驗證 `api/daily-route.ts:195`＋`src/dailyAffinity.ts:77`。測試：`tests/unit/daily-route-prefer.test.ts`「沒帶欄位／壞輸入」8 種壞輸入的回應與沒帶時字串完全相同。
3. PASS — 只改 `api/daily-route.ts:322` 的挑選；`usableHere`／`venueOk`／`areaOk`／`retentionOk` 沒動。沒帶偏好、非自動站、或前 5 名權重全相同時走原本的 `randomIndex(top.length)`。測試：有無 prefer／demote 各抽 1500 次，被挑到的店都是同一組 5 間；評論數不足、exclude、seen、excludeKinds、區外的偏好種類店都不派；帶 prefer 抽 60 次仍出現 3 間以上不同的店；指定站、固定行程、已完成站有無 prefer 回應字串相同。既有 1248 個測試沒改，全過。
4. PASS — 旗標 `preferHit` 只在「前 5 名權重不同、且挑中的是偏好種類」時回（`api/daily-route.ts:325`）；到店沒開而換店或標 closed 時清掉（`:367`、`:409`）。卡片文案「你常選這類，優先挑了這間」（`src/dailyDecision.tsx:770`）。伺服器原樣保留的站不回旗標，前端只在同一站同一間店時沿用舊旗標（`:359`）。
5. PASS — 「備註」選單裡的「清除學到的偏好」按鈕（`src/dailyDecision.tsx:897`，處理函式 `:629`）。只刪偏好這個 key，並拿掉卡片上的原因行。單元測試與瀏覽器都驗證 seen／disliked／dislikedKinds 不變。
6. PASS — 沒碰 `placeMem.ts`、seen 換日規則、意圖與活動；偏好紀錄只在獨立 key。
7. 部分 PASS —
   - `npm run typecheck`：exit=0
   - `npm run lint`：exit=0（輸出無 error）
   - `npm test`：`Test Files  62 passed (62)`／`Tests  1327 passed (1327)`。基線：`Test Files  59 passed (59)`／`Tests  1248 passed (1248)`。
   - `npm run build`：exit=0，`✓ built in 233ms`
   - `npm run check:bundle`：目前工作目錄直接跑是 FAIL：`FAIL api/daily-route 載不起來：ERR_MODULE_NOT_FOUND Cannot find module '/tmp/vartask-96gy8g/src/dailyAffinity.ts' imported from /tmp/vartask-96gy8g/api/daily-route.js`。原因：腳本用 `git ls-files` 展開 `src/**`，沒追蹤的新檔不會被複製。我用暫存 index（`GIT_INDEX_FILE` 指到複本，只在複本 `git add src/dailyAffinity.ts`，真的 index 沒動）再跑：exit=0，`BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`
8. PASS — 新增 79 個測試：
   - `tests/unit/dailyAffinity.test.ts`：衰減、閾值、20 個上限、清除、壞 localStorage、輸入驗證、權重
   - `tests/unit/daily-route-prefer.test.ts`：機率偏向（seed 亂數，拉麵佔比 沒帶約 2/5、prefer 約 12/18、demote 約 2/8）、候選集合不變、門檻不放寬、沒帶欄位不變、旗標、指定／固定／已完成站不變、不寫 log
   - `tests/unit/dailyDecision-affinity.test.tsx`：標完成寫入與撤回、請求帶 prefer、清除按鈕、原因行、壞資料頁面不壞、換店 −1
9. PASS — `runs/finish-1114/snapshots/feedback-loop-browser.cjs`，輸出 `feedback-loop-browser.out.txt`：12 行 PASS，末行 `請求數：4；失敗檢查數：0`。逐字節錄：
   - `PASS 2 標完成後 localStorage 有紀錄（兩筆 ramen +2）`
   - `PASS 3 下一次請求 body 帶 prefer:["ramen"] ｜ {"prefer":["ramen"]}`
   - `PASS 4 清除後下一次請求不帶 prefer／demote ｜ {"keys":["location","area","areaOnly","startTime","stops","exclude","excludeKinds","seen"]}`
   - 回應裡的 `preferHit` 是腳本模擬的，只證明前端會顯示原因行；伺服器真的怎麼挑店只有單元測試覆蓋，預覽站真 POST 還沒做。

產出檔案：
- `src/dailyAffinity.ts`（新）
- `src/dailyDecision.tsx`（改）
- `api/daily-route.ts`（改）
- `tests/unit/dailyAffinity.test.ts`（新）
- `tests/unit/daily-route-prefer.test.ts`（新）
- `tests/unit/dailyDecision-affinity.test.tsx`（新）
- `runs/finish-1114/reports/feedback-loop.md`

新快照：
- `runs/finish-1114/snapshots/feedback-loop-browser.cjs`
- `runs/finish-1114/snapshots/feedback-loop-browser.out.txt`
- `runs/finish-1114/snapshots/feedback-loop-01-prefer-reason.png`
- `runs/finish-1114/snapshots/feedback-loop-02-clear-button.png`
- `runs/finish-1114/snapshots/feedback-loop-03-after-clear.png`

產品碼行數：`git diff --stat` → `2 files changed, 68 insertions(+), 10 deletions(-)`（`api/daily-route.ts | 24`、`src/dailyDecision.tsx | 54`），另加未追蹤新檔 `src/dailyAffinity.ts` 100 行。合計約 168 行新增，在 350 行預算內。

未完成／⚠️ 假設：
- ⚠️ 合併前必須先 `git add src/dailyAffinity.ts` 再跑 `npm run check:bundle`，否則 FAIL；漏加這個檔上線後 `/api/daily-route` 會載不起來。
- ⚠️ Q1 與 Q8 的數字照做後有一個落差：單次「標記完成」(+2) 一過時間就低於 2，不會送 prefer，要兩次才算；單次「換掉」不算降權，要三次。但單次「手動指定」(+3) 會立刻算偏好，約 17.5 天後才掉到 2 以下，跟 Q8 的理由「單次行為不改變結果」不一致。我沒改數字，請總調度確認是否接受。
- ⚠️ 預覽站驗證要注意：只標一站完成不會帶 `prefer`，要兩站同種類或一次手動指定。
- ⚠️ 「換掉自動挑的店 −1」包含按「不喜歡這間店」「不要這類」造成的換店，因為它們走同一條單站換店路徑。
- ⚠️ 種類只有 `placeKind.ts` 判得出的那些（拉麵、烏龍麵、咖啡等）；健身房、藝廊、藥局判不出種類，這些站不會被學習。
- ⚠️ 偏好只在前 5 名內改機率，不會把第 6 名以後的店拉進來；權重 6／2／1 是我定的，decisions.md 沒有規定。
- ⚠️ 清除按鈕放在「備註」選單，一直顯示（沒有紀錄時也能按）。
- ⚠️ 環境：一開始 `node_modules/.bin` 不存在（`sh: 1: vitest: not found`），我跑了 `npm rebuild --ignore-scripts`（只動 node_modules）。之後第一次 `npm test` 出現 `Tests  500 passed (500)`／`Errors  36 errors`，沒留下細節；接著重跑都是 59 檔 1248 個全過，改完後 62 檔 1327 個全過。
- 沒做：預覽站真 Google 驗證（依指示由總調度做）；沒有 commit、push，沒動 `.handoff/`、`STATE.md`、`docs/ROADMAP.md`、`contract.md`、`decisions.md`。


---
總調度加註（2026-11-14，把關 R1 F3／F4）：第 7 條的 `check:bundle` FAIL 只發生在新檔未追蹤時；commit `cde60c2` 後總調度與把關者重跑都是 `BUNDLE PASS`。第 9 條「預覽站真 POST 還沒做」已由 `snapshots/preview-prefer.out.json` 補上（見 `reports/main.md`）。把關 R1 後另修兩處：原因行只補伺服器原樣保留的站（F1）、換店 −1 同一天同一站只算一次（F2）。
