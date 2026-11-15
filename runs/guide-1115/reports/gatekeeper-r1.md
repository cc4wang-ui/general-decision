把關報告｜guide-1115｜第 1 輪（checker Loop mode）
驗收對象：分支 `claude/vigilant-carson-fxshf7` HEAD `e173347`，基準 `origin/main` `d7f2d82`。我沒有改任何成品、契約或測試；也沒有打正式站或預覽站。

VERDICT: FAIL
ROUND  : 1 / 2

總判定：FAIL。唯一卡住的是 STOP 4：契約寫「依本機紀錄（去過、看過的店所在區域）」，程式只記了「去過」（標記完成），沒有記「看過」。其他 STOP 都成立，或者要等合併後才能驗。另外有幾件對 Cross 實際影響比 STOP 4 更大、但契約條文沒寫到的問題（發現清單 1–5），建議這一輪一起修。

---

## A 契約忠實度：PASS

Cross 每一句原話都有對應的 STOP：
| 原話 | 對應 | 判斷 |
|---|---|---|
| 今日任務的前後順序沒辦法手動排序 | STOP 1 | 有對應，沒有縮小 |
| 自定義的輸入欄位也非常難輸入 | STOP 2（必驗組字、失焦、跳動、鍵盤、Enter、一處輸入） | 有對應 |
| 不一定要 art gallery…景觀好的地方喝咖啡／好喝的店／好吃的餐廳／漂亮的公園／沒去過的區域等等探險 | STOP 3 的七個主題＋STOP 4 | 每一個名詞都有主題對上；「等等探險」對到「有趣的地方」 |
| 你要靈活提供我建議 | STOP 3（讓導遊決定、每次輪替）＋STOP 5（理由行） | 有對應，但解讀偏窄（見下） |
| 我的目標是建置一個個人生活導遊 | 目標句 | 這是方向，不是單一交付物，M 級第一步可以接受 |

「特別針對一間好吃的餐廳」兩種讀法都走得通：
- 當成主題：`destination_meal`「值得專程去的餐廳」，預覽站拿到 ブラッスリー・ヴィロン 渋谷店（★4.1，2243 則）、Oysterbar&Wine BELON 渋谷店（★4.2，308 則）。
- 當成指定某一間：行程上方的「想去哪？打店名或地址」（`src/dailyDecision.tsx:395`，`addWanted` `:328`），或午餐站的逐站指定（`:432`）。字照原樣送 Places，不會被換掉。

有被縮窄、但不算偷換的地方（記入發現清單，不影響 A 的判定）：
- 「靈活」只落在一個探索站。午餐站仍固定查 `Japanese set meal restaurant`，咖啡站預設仍是安靜咖啡廳。所以輪到「好喝的咖啡」「景觀好的咖啡」「值得專程去的餐廳」時，同一天會有兩間咖啡廳或兩間餐廳（發現 1）。
- 「沒去過的區域」只有 `src/areas.ts:20-26` 那 6 區（澀谷、新宿、原宿、表参道、恵比寿、代官山），而且店離出發點不能超過 3.5 公里。開著「只在這一帶」（預設開）時，導遊不會主動提這個主題（發現 4）。

小組自列的 ⚠️ 逐項判斷：
| ⚠️ | 違反契約字面？ | 違反 Cross 原意？ | 結論 |
|---|---|---|---|
| 固定行程沒有上下鍵 | 字面寫「每一站可上移／下移」，但同一條也寫「固定行程仍照自己的時間」，兩句不能同時成立，以後面比較具體的那句為準 | 否 | 可接受 |
| 開著「只在這一帶」時輪替不含「沒去過的區域」 | 否（STOP 3 只要求在主題間變化，現在 6 個主題輪替） | 部分違反：Cross 明講要去沒去過的區域探險，但預設情況下導遊永遠不會主動提 | 可接受，但列為發現 4 |
| 「看過」沒記 | **是**：STOP 4 括號裡明寫「去過、看過」 | 低（Cross 原話只講「沒去過」） | **STOP 4 FAIL** |
| 輪替沒用 2.4 偏好 | 否（契約沒要求） | 否 | 可接受 |
| 咖啡站不輪替 | 否（STOP 3 只要求探索站輪替） | 輕微 | 可接受 |
| 改完順序要多按一次「照這個順序更新時間」 | 否 | 輕微；但重開頁面後這顆按鈕會消失（發現 2） | 本身可接受，衍生問題列為發現 2 |

---

## B 逐條 STOP

┌──────┬────────┬──────┬──────────────────────────────────────────┐
│ 條件 │ 判定   │ 類別 │ 證據                                      │
├──────┼────────┼──────┼──────────────────────────────────────────┤
│ 1    │ PASS   │ —    │ 見下方 STOP 1                             │
│ 2    │ PASS   │ —    │ 見下方 STOP 2（附殘餘風險）               │
│ 3    │ PASS   │ —    │ 見下方 STOP 3                             │
│ 4    │ FAIL   │ 其他 │ 「看過」沒記：只在 `dailyDecision.tsx:753` 標記完成時呼叫 `markAreasVisited` │
│ 5    │ PASS   │ —    │ 見下方 STOP 5                             │
│ 6    │ PASS   │ —    │ 見下方 STOP 6                             │
│ 7    │ PASS   │ —    │ 我自己重跑的閘門結果見下方               │
│ 8    │ 預覽 PASS／正式站未到 │ — │ `preview-guide.out.json` 重算結果見下方 │
│ 9    │ 未到   │ —    │ 目前文件與實況不符之處列在最後           │
└──────┴────────┴──────┴──────────────────────────────────────────┘

### STOP 1 手動排序：PASS
- 上下鍵：`dailyDecision.tsx:408-411`，CSS `.dd-move button{width:44px;height:44px}`（`dailyDecision.css`）。`verify-webkit.json` B1 `{"w":44,"h":44}`。小組 12 張截圖裡沒有一張拍到上下鍵，所以我自己在本機 vite（Chromium，iPhone 13，API 用假資料攔截）補拍了一張：卡片右上角有兩顆清楚的 ↑ ↓，存在 scratchpad `gk-chromium-arrows.jpg`。
- 伺服器照使用者的順序排：`api/daily-route.ts:157`，`order(...,manual)` 直接回傳陣列順序。`src/dailyRouting.ts:131` 手動時只看使用者排的下一站（`possible.find(x=>x.i===0)`）；`:144` 剩下的站照陣列順序；`:146` 手動時不跑 fewestLateOrder 重排。
- 固定行程不會被挪時間：手動模式下，有 `start` 的 locked 或 custom 站才算 appointments（`:98`）。`visit()` 早到等、晚到記 conflict（`:111-113`），跟原本的程式是同一段。
- ETA 是真的算出來的：用的是同一份 `travelMatrix`（Google Routes）矩陣，沒有另外估。
- 沒帶新欄位時：`manual=false`、`reorderOnly=false`，`order`、`scheduleRoute`、`mergeScheduled`、`retentionOk` 的條件式跟之前等價；`venueOk` 的 DENY 判斷在沒有 theme 時，`themeAllows(undefined)` 為 false，也跟之前等價。唯一的差別是探索站沒店時的標題文案改了（見文件不符）。
- `reorderOnly` 沒有變成繞過檢查的後門。它只讓 `fullRegen=false`（`:322`），保留的店仍要通過 `retentionOk`（exclude、excludeKinds、DENY、評論數、地區、距離），之後仍要過到店營業檢查（`badOf`），已完成站仍不排進路線（`routable=!!s.candidate&&!s.done`）。它對前端送來的候選資料的信任程度，跟原本單站換店一樣，沒有開新洞。
- 存檔與不打亂：`loadDaily` 會保留 `manualOrder`（當日）；`replanDaily`、`routeProposal`、伺服器回應都會套 `applyUserOrder`（`:184`、`:194`、`:295`）。B4–B8 PASS。
- 預覽站真資料：送出 creative→shopping→meal，回應順序相同，三間店都沒換，固定行程維持 `23:30`，ETA 13:03／14:13／15:17／23:30。

### STOP 2 輸入：PASS（有殘餘風險）
- 根因確實有重現（`before-*.json`），修法看程式碼成立：`DraftInput`（`:224-235`）組字中不往上寫，`compositionend` 時才送；兩種事件順序（Chrome 是 compositionend 在最後一次 input 之後，Safari 是 compositionend 先、input 後）都處理到了；Enter 選字（`isComposing`／`keyCode 229`）不會送出。`PlaceForm`（`:211-221`）打字只動草稿，按 Enter 或按鈕才送出。
- 真瀏覽器：Chromium 25 項、WebKit 24 項全 PASS（`verify-*.json` 的 `allPass:true`）。
- 殘餘風險，請總調度轉告 Cross：(1) 鍵盤會不會遮住輸入框，只用假 visualViewport 的單元測試驗過，模擬器沒有虛擬鍵盤；(2) WebKit 的組字沒驗過（Playwright 的 WebKit 不能注入輸入法）；(3) 我這個環境沒有 WebKit 執行檔（`Executable doesn't exist at /opt/pw-browsers/webkit-2359/pw_run.sh`），WebKit 只能採信小組的檔案。這三項要等 Cross 用真 iPhone 確認。

### STOP 3 探索主題：PASS
七個主題的白名單在 `src/dailyThemes.ts:5-17`。「讓導遊決定」由 `pickTheme`（`:58-63`）處理：當天還沒出過的主題先挑，全部出過就重新一輪，而且不會連續挑同一個，不會卡在同一主題。C5 的序列 `["fun","view_cafe","good_coffee","destination_meal","good_coffee"]` 有在變。換主題在 `chooseTheme`（`:345`），只重找那一站。

### STOP 4 沒去過的區域：FAIL（其他）
- 字面要求「依本機紀錄（去過、看過的店所在區域）」。`markAreasVisited` 全專案只有一個呼叫點：`src/dailyDecision.tsx:753`（`if (done) markAreasVisited(...)`）。行程上顯示過、換掉過（`seen`）的店，所在區域都沒有記。
- 已成立的部分：沒有紀錄時照常給建議（`pickNewArea` 的 fresh 分支）；不發明資料；伺服器會把店限制在該區 1 公里內、離出發點 3.5 公里內。
- 最小修正方向：在 `seen` 寫入，或店顯示在行程上的時候，也用店的座標記一筆「看過」的區域（`dailyThemes.ts` 目前只有「標記完成」這個來源）；或者由總調度依 Fable 代核授權正式改契約、刪掉「看過」，並寫明理由。checker 不能自己放寬。

### STOP 5 理由行：PASS
`exploreReason`（`:161-173`）只用 `theme`、`themeArea`、`candidate.rating`、`userRatingCount`、`travelMin`，都是回應裡真的有的欄位；沒有資料就回空字串，使用者自己指定的站不寫理由。措辭不夠精確的地方列在發現 7。

### STOP 6 既有守則：PASS
- 既有測試 0 改動；`Tests  1396 passed (1396)`，其中舊的 1328 個全過。
- 指定、固定、已完成站不吃主題（`th=auto&&s.theme`），DENY 豁免也只對自動站（`venueOk`）。主題站一樣要過評論數門檻、地區限制、到店營業檢查。
- 2.4 偏好：`restorePreferHit` 沒改；換主題不記 −1（`opts.themeChange?undefined:replaced`），這是對的。
- §7.7：使用者打的字原樣送 Places，沒有自由文字解析；種類判斷只看 `primaryType`。

### STOP 7 閘門（我自己重跑，逐字）：PASS
- `npm run typecheck` → `> tsc -b`，EXIT 0
- `npm run lint` → `> eslint src api tests/unit`，EXIT 0
- `npm test` → `Test Files  64 passed (64)`／`Tests  1396 passed (1396)`，EXIT 0
- `npm run check:bundle` → `BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`，EXIT 0
- `npm run build` → `✓ built in 342ms`，EXIT 0
- 產品碼 380 行新增、61 行刪除，超過 300 行，契約有寫理由，合規。跑完 `git status` 是乾淨的。

### STOP 8 預覽站：PASS（正式站：未到）
我從 `preview-guide.out.json` 原始資料重算：
- 主題 POST 共 16 次，全部 200、`routeVerified:true`。手動順序 1 次 `status:200`。自動排序那 1 次沒有記錄狀態碼，只能從它有 `stops` 推斷成功。
- 7 個主題都拿到真店；不合法主題 `hack_me` → `invalidThemeEchoed:null`，店是 SAI（art_gallery），等於照沒帶主題處理。
- `manualOrderHonoured:true`、`manualKeptPlaces:true`、`fixedStartKept:"23:30"`、`conflicts:[]`。
- main.md 寫「17 次 POST 全 200」，實際是 18 次（16 次主題＋2 次排序），其中 1 次沒記狀態碼。

真資料的品質（關係到「靈活提供建議」）：
| 主題 | 回的店 | 像話嗎 | 嚴重度 |
|---|---|---|---|
| view_cafe | Paradise Lounge（`lounge_bar` ★3.7，117 則，Scramble Square 46F）／VALLEY PARK STAND（cafe ★4.2） | 第一間是酒吧型 lounge，評分也偏低，不像「景觀好的咖啡」 | 🟡 中 |
| good_coffee | OBSCURA（coffee_shop ★4.4）／CHIMNEY COFFEE（★4.2） | 像話 | — |
| fun | HMV record shop（★4.2）／next records（★4.8） | 像話，但兩次都是唱片行，「有趣」偏窄 | ⚪ 低 |
| park | 渋谷区立鍋島松濤公園 ×2（★3.9） | 合格的公園只有一座。實際使用時這座會進 `seen`，下一次輪到公園很可能找不到店 | 🟡 中 |
| new_area | 原宿：ラフェデリース（restaurant）／恵比寿：DEAN & DELUCA（地址是目黒区上目黒，中目黒、代官山一帶） | 店是真的，但標成「恵比寿」不太精確 | ⚪ 低 |
| destination_meal | ブラッスリー・ヴィロン（★4.1，2243 則）／BELON（★4.2） | 像話 | — |
| art | Gallery Conceal／DIESEL ART GALLERY | 像話 | — |
預覽站測試每次只送一個探索站，所以沒有測到下面發現 1 的「同一天兩間咖啡、兩間餐廳」。

---

## 發現清單（依對 Cross 的實際影響排序；★＝決定這輪 verdict 的項目）

1. 【其他】輪替有一半主題會跟既有站重複。
   - 位置：`src/dailyDecision.tsx:330`（buildDaily 預設一天有 gym、meal、creative、coffee、shopping、rest）；`dailyThemes.ts:455` `themePool`。
   - 重現：預設行程按「搜尋店家並生成路線」，探索站輪到 `view_cafe` 或 `good_coffee` → 同一天有兩間咖啡廳（加上咖啡站）；輪到 `destination_meal` → 兩間餐廳（加上午餐站的定食）。可自動輪到的 6 個主題裡有 3 個會這樣。
   - 建議：同一天已經有 coffee 或 meal 站時，輪替跳過同類主題；或讓午餐站也能選「值得專程去的餐廳」。
2. 【其他】重開頁面後「照這個順序更新時間」消失，到店時間全空。
   - 位置：`orderDirty` 只存在記憶體（`:635`），`moveTask` 會把 ETA 清掉並存檔（`:134`）。
   - 重現（我在本機 Chromium 跑過）：按任一站 ↓ → 重新整理 → `{"applyBefore":1,"barAfterReload":1,"applyAfterReload":0,"etas":[null,null,null]}`。這時要拿回時間只剩兩條路：整條重新生成（自動站的店全部換掉），或按某一站的「換這一站」。
   - 建議：用存檔推導「需要重算」（例如 `manualOrder` 為 true，而且有候選的站缺 `eta`），不要只靠記憶體狀態。
3. 【其他】按 ↑ 之後卡片會離開手指和畫面，連續移好幾格很難操作。
   - 重現（本機 Chromium，9 站）：在第 4 站按 ↑，同一顆按鈕的 y 位置變化 `arrowJumpPx:-1838`，`inViewportAfterMove:false`。每張卡大約一個螢幕高，要把一站往上移 3 格，就得每按一次捲動找一次。
   - 建議：移完把那一站捲回原本的位置，或在順序列提供一個緊湊的「只顯示站名」排序清單。
4. 【其他】「沒去過的區域」範圍太窄，而且常常會落空。
   - 位置：`dailyThemes.ts:499` `pickNewArea` 沒考慮距離；`api/daily-route.ts:208-210` 店必須在該區 1 公里內，而且離出發點不超過 3.5 公里（`SEARCH_BIAS_M=3500`，`:43`）。
   - 重現：出發地設「新宿」，主題選「沒去過的區域」。如果挑到 恵比寿（中心距新宿約 4.8 公里）或 代官山（約 4.5 公里），兩個條件同時成立的範圍只剩很窄一條，大多會回 `noCandidateReason:"empty"`。用目前位置出發、而且人不在澀谷附近時，6 區可能全部太遠。另外，預設開著「只在這一帶」時，導遊永遠不會主動提這個主題。
   - 建議：只挑離出發點夠近的區域；或讓區域清單跟著出發點變；在「換主題」選單說明為什麼導遊不會主動帶去別區。
5. 【其他】主題查詢品質：view_cafe 撈到 lounge_bar ★3.7；park 合格的公園只有一座。
   - 位置：`dailyThemes.ts:425`、`:428`。
   - 重現：`preview-guide.out.json` 的 `themes.view_cafe[0]`、`themes.park[0..1]`。
   - 建議：view_cafe 只收 primaryType 是 cafe 或 coffee_shop 的店（或排除 bar 類），再考慮加評分下限；park 的搜尋半徑放寬，或評論門檻針對公園調整（要另外確認不會違反 §7.7）。
6. ★【其他】STOP 4「看過」沒記（就是 STOP 4 FAIL 的原因）。
   - 位置：`src/dailyDecision.tsx:753` 是唯一的寫入點。
   - 重現：在行程上換掉一間原宿的店（它會進 `seen`），然後選「沒去過的區域」→ 原宿仍可能被當成「你還沒去過的原宿」。
   - 建議：照上面 STOP 4 的最小修正方向，或由總調度正式改契約。
7. 【其他】理由行措辭不夠精確。
   - 位置：`exploreReason` `:169`、`:171`。
   - 內容：「你還沒去過的〇〇」其實只代表「這個 app 裡沒有標記完成的紀錄」，Cross 實際上可能去過很多次；「從上一站步行 N 分鐘」對第一站來說是「從出發地」。
   - 建議：改成「紀錄裡還沒去過的〇〇」，第一站寫「從出發地」。
8. 【其他】已有 9 站時，在「想去哪？」打字按 Enter，打的字會被清掉。
   - 位置：`PlaceForm` `:215` 不論 `onSubmit` 有沒有成功，都執行 `setDraft(null)`；`addWanted` `:331` 滿 9 站只跳提示。
   - 重現（本機 Chromium）：`{"inputAfterEnter":"","notice":true,"calls":0}`。
   - 建議：讓 `onSubmit` 回傳是否接受，接受了才清草稿。
9. 【其他】小組 STOP 1 的截圖沒拍到上下鍵。12 張截圖裡沒有一張看得到 ↑ ↓（order-moved 那張第一張卡剛好是固定行程）。B1 有量到 44×44，我也補拍確認過，所以不影響判定。建議下一輪補一張。

---

## 文件與實況不符（STOP 9 未到，先列出來）
- `STATE.md:8` 的「Latest release」仍寫 PR #79、單元 1328；沒有提到 guide-1115（手動排序、`manualOrder`／`reorderOnly`、7 個主題、`decide.daily.areas.v1`）。
- `.handoff/LATEST.md:30` 的閘門仍寫 `Tests  1328 passed (1328)`，實際是 1396。
- `docs/ROADMAP.md:194` 的活動標籤仍寫「看展覽」，程式已改成「探索」（`ACTIVITY_LABEL`）。ROADMAP 也沒有記錄新的請求欄位、新的本機 key、探索站目錄標題改名。
- `runs/guide-1115/reports/main.md` 寫「17 次 POST 全 200」，實際是 18 次，其中自動排序那 1 次沒記錄狀態碼。
- `runs/guide-1115/reports/guide.md:18` 寫「全部可選；沒帶時行為與之前相同」：沒帶新欄位時，探索站沒店的卡片標題已從 `澀谷｜藝術展／日本 IP 快閃探索（出發前查活動與營業）` 改成 `探索｜讓導遊挑一個主題`（`api/daily-route.ts:114`）。報告第 75 行有提到這個改動，但第 18 行的說法不精確。
- `guide.md:3`「STOP 1–7 自查全部 PASS」與 STOP 4 的實況（「看過」沒記）不符；第 71 行自己也有列出這個缺口。

## 交還 maker 的最小修正指示
1. STOP 4：補上「看過的店所在區域」的本機紀錄（來源可以是 `seen` 或店顯示在行程上的時候），並加單元測試；或由總調度正式改契約。
2. 建議同一輪處理發現 1、2、8：改動小，而且直接影響 Cross 每天的使用。發現 3、4、5 可以排到下一輪，但要記錄下來。
3. 合併後：正式站真 POST 再驗一次（STOP 8），三份文件同步（STOP 9），並請 Cross 用真 iPhone 確認鍵盤遮擋和日文組字。
