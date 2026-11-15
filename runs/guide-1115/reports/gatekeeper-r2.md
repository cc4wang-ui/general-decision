把關報告｜guide-1115｜第 2 輪（checker Loop mode，最後一輪）
驗收對象：分支 `claude/vigilant-carson-fxshf7` HEAD `2d2f8fc`，對照第 1 輪 `e173347`。
我沒有改產品碼、契約、測試。沒有跑瀏覽器，也沒有打預覽站或正式站。
第 2 輪規則：只擋「跑不完」「壞資料」。其他寫成建議。

VERDICT: PASS
ROUND  : 2 / 2

## 逐項判定 A–H

┌───┬──────────────────────────┬──────┬──────────────────────────────────────────────┐
│ # │ 項目                     │ 判定 │ 證據（檔案:行／測試名）                       │
├───┼──────────────────────────┼──────┼──────────────────────────────────────────────┤
│ A │ STOP 4「看過」要記       │ 已修 │ `src/dailyThemes.ts:96-122` `SEEN_AREAS_KEY`、`loadSeenAreas`、`markAreasSeen`、`pickNewArea`（先挑沒紀錄的，再挑只看過的，最後挑最久沒去的）；`src/dailyDecision.tsx:723` 路線回應後寫入。測試：「pickNewArea 先後（把關 R1-A）…」（`dailyDecision-guide.test.tsx:480`）、`markAreasSeen` 用例（`:497-504`） │
│ B │ 發現 1 輪替跟咖啡／午餐重複 │ 已修 │ `src/dailyThemes.ts` `themePool({newArea,hasCoffee,hasMeal})`；`src/dailyDecision.tsx:414-422` `rotateThemes`。測試：「把關 R1-B：行程裡已有咖啡站…」（`:337`）、「畫面（把關 R1-B、F）…」（`:464`）；瀏覽器 C5 PASS |
│ C │ 發現 2 重開頁面 orderDirty │ 已修 │ `src/dailyDecision.tsx:110`（存檔欄位）、`:263`（只留當日）、`:398`（moveTask 設定）、`:658`（從存檔讀出）、`:724`（重算成功才清）、`:801`。測試：「C：改了順序還沒重算就重開頁面…」（`:141`）、「C：換天或髒值不留 orderDirty；重算失敗時按鈕留著」（`:158`）；瀏覽器 B2c `orderDirty:true` |
│ D │ 發現 8 滿 9 站保留文字   │ 已修 │ `src/dailyDecision.tsx:621`（`onSubmit` 不回 false 才清草稿）、`:810`（滿 9 站回 false）。測試：「D：已有 9 站時…」（`:172`）；瀏覽器 D0 `inputAfterEnter:"第十個想去的地方"`、`calls:0` |
│ E │ 發現 3 按 ↑↓ 後捲回      │ 已修 │ `src/dailyDecision.tsx:660`（`moved` ref）＋`useEffect`（`scrollIntoView({block:'center'})`＋`focus`）。測試：「E：按 ↑／↓ 後…」（`:190`）；瀏覽器 B2e 連按 3 次，每次 `inView:true`、`focused:true` |
│ F │ 發現 4 區域走得到         │ 已修 │ `src/dailyThemes.ts` `REACH_M=3500`、`reachableAreas`；`src/dailyDecision.tsx:429` `fillThemeArea`（附近沒有區域就改回讓導遊決定，並顯示提示）。測試：「把關 R1-F…」兩則（`:354`、`:366`）；瀏覽器 C5 areas 有 `恵比寿`、C6 `themeArea:"原宿"` |
│ G │ 發現 5 view_cafe 只收咖啡類 │ 已修 │ `src/dailyThemes.ts:40` `themeRejects`、`onlyPrimary: COFFEE_TYPES`；`api/daily-route.ts:71`（新查到的店：嚴格）、`:110`（保留的舊店：沒有類型就照留）。測試：「把關 R1-G：咖啡主題只收 primaryType 是 cafe／coffee_shop 的店…」（`daily-guide-route.test.ts:207`） |
│ H │ 發現 7 理由行措辭         │ 已修 │ `src/dailyDecision.tsx:451`「（紀錄裡還沒去過）」、`:453` 第一站寫「從出發地步行」。測試：`exploreReason` 用例（`dailyDecision-guide.test.tsx:558-560`）、`:547` |
└───┴──────────────────────────┴──────┴──────────────────────────────────────────────┘

## STOP 總表

| STOP | 判定 | 說明 |
|---|---|---|
| 1 | PASS | 第 1 輪 PASS。C、E 補強，瀏覽器 B1–B8、B2c、B2e 全部 PASS |
| 2 | PASS | 第 1 輪 PASS。殘餘風險不變：鍵盤遮擋、WebKit 組字要等 Cross 用真 iPhone 確認 |
| 3 | PASS | 第 1 輪 PASS。B、F 補強 |
| 4 | PASS | A 已修：「去過」和「看過」都有記，沒有紀錄時照常給建議 |
| 5 | PASS | H 修正措辭 |
| 6 | PASS | 既有測試沒改，1407 個全過。G 只對咖啡主題的自動站生效 |
| 7 | PASS | 下面閘門是我自己重跑的結果。`verify-chromium.json`、`verify-webkit.json` 都是 `allPass:true`、`"pass":false` 0 筆 |
| 8 | 合併後驗 | 預覽站第 1 輪 PASS；正式站要合併後再驗。不擋 |
| 9 | 合併後驗 | 文件同步要合併後再驗。不擋 |

## 閘門（自己重跑，逐字最後一行）
- `npm run typecheck` → `> tsc -b`（EXIT 0）
- `npm run lint` → `> eslint src api tests/unit`（EXIT 0）
- `npm test` → `Tests  1407 passed (1407)`（`Test Files  64 passed (64)`，EXIT 0）
- `npm run check:bundle` → `BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`（EXIT 0）
- `npm run build` → `✓ built in 232ms`（EXIT 0）
- 跑完 `git status` 是乾淨的。本輪產品碼 +131／−50 行。

## 擋合併的項目
無。沒有找到「跑不完」或「壞資料」。
- 新的本機 key `decide.daily.areasSeen.v1` 讀取時有檢查形狀，壞掉的資料當成沒有紀錄，不會讓頁面掛掉。
- `orderDirty` 只留當日，壞值會被丟掉（測試 `:158`）。
- `themeRejects` 保留舊店時不嚴格，舊存檔不會因為缺少類型被大量換掉。

## 建議（不擋）
1. 「看過」只要店出現在路線回應裡就會記，包括 Cross 換掉的店。這只影響挑區域的先後，不會把區域算成「去過」。符合契約，記錄起來就好。
2. F 的距離用的是區域中心，伺服器另外還有「店要在該區 1 公里內」的條件，所以邊界上的區（中心約 3.5 公里遠）仍可能查不到店。建議正式站驗證時試一次。
3. 發現 3 的緊湊排序清單沒做，只做了捲回。park 合格的公園少、午餐站固定、地區清單只有 6 區，這些都還在。guide.md 已經列進交付。
4. 合併後：正式站要真 POST 驗一次（STOP 8），三份文件要同步（STOP 9），並請 Cross 用真 iPhone 確認鍵盤遮擋和日文組字。
