小組報告｜guide

結論：STOP 1–7 自查全部 PASS。三件事都做完：每站有上移／下移，伺服器照使用者順序排並算到店時間；輸入難打重現出 5 個根因並修掉，行程上方多了一個「想去哪」輸入框；探索站改成 7 個主題，可自己選或讓導遊每次輪替。既有 1328 個測試一行沒改全過，新增 68 個。未做 commit／push。真 Google 的主題查詢結果還沒驗（留給 STOP 8）。

輸入難打的根因：
重現方式：`npx vite --port 5199` 後跑 `BROWSER=chromium|webkit node runs/guide-1115/snapshots/repro-input.mjs`（iPhone 13 模擬；這支是對「修正前」程式寫的，修正後 Enter 會收起選單，腳本會停在第 36 行——這本身就是修好的證據）。修正前輸出：`snapshots/before-chromium.json`、`before-webkit.json`。
1. 空白被吃掉（Chromium＋WebKit 都重現）：「想去哪裡」每敲一鍵就把值丟進 `normalizeIntent`，它會 `trim()`，再寫回輸入框。逐鍵打 `Fuglen Tokyo` 得到 `"got": "FuglenTokyo"`。
2. 輸入法組字被打斷、重複上字（Chromium CDP IME 重現）：同一個 trim 在組字中改了輸入框的值。組字 `たわー ` 之後再組，結果是 `"want": "東京タワー レコード"`、`"got": "東京たわータワー レコード"`。
3. 字太小，iPhone 會自動放大整頁：今日行程 15 個輸入框／下拉全部 `"px": "14px"`（iOS Safari 對小於 16px 的輸入框一對焦就放大）。
4. 打第一個字卡片就跳走（Chromium＋WebKit）：逐站「指定地點」每敲一鍵就清掉原本的店，卡片變矮。`"pageYBeforeFirstKey": 744, "pageYAfterFirstKey": 700, "jumpPx": -44`。
5. 要點好幾層、Enter 沒反應：逐站輸入框藏在收合區裡（`"visibleWithoutExpanding": false`），打完按 Enter 不會送出（`"enterTriggeredSearch": false`）；「想去哪裡」按 Enter 選單也不收（`"sheetStillOpen": true`）；行程畫面上沒有直接加地點的入口（`"quickAddEntry": 0`）。
- 查過但不是根因：沒有「每敲一鍵元件重掛而失焦」（修正前 `"focusedAfterTyping": true`）。
- 模擬器重現不了的：真鍵盤遮住底部選單。照 iOS 的行為加了防護（用 visualViewport 量鍵盤高度把選單墊高），只有單元測試用假的 visualViewport 驗過。
修法（最小）：輸入框一律 16px；「想去哪裡」改成自己保留草稿、組字中不往上寫（`DraftInput`）；逐站指定與新的「想去哪」輸入框改成打字只動草稿、Enter 或按鈕才送出（`PlaceForm`）；選字用的 Enter 不送出。
修正後：`snapshots/verify-chromium.json`（25 項全 PASS）、`verify-webkit.json`（24 項全 PASS，WebKit 沒有 IME 注入所以少 A3）。A2 `"got":"Fuglen Tokyo"`、A3 `"got":"東京タワー レコード"`、A5 `"jumpPx":0`、A1 `"sizes":["16px"]`。

新欄位：
請求（`POST /api/daily-route`，全部可選；沒帶時行為與之前相同）
- `manualOrder`: boolean。只有 `true` 生效。可移動站照 `stops` 陣列順序走，不做貪婪／窮舉／段內最短重排。有 `start` 的固定行程（`locked` 或 `custom`）仍照自己的時間：使用者排的下一站去了會趕不上，就先去固定行程；晚到照舊回 `conflict`／`conflicts`。例：`{"manualOrder":true,"stops":[遠,近,中]}` → 回應順序 遠、近、中。
- `reorderOnly`: boolean。只有 `true` 生效。不帶 `shuffle` 也不重挑自動站的店，只重排路線、重算時間（改順序不該換店；「恢復自動排序」也用它）。沒有店的站照常會去查。⚠️ 這個欄位是我加的，任務卡原本沒有。
- `stops[].theme`: string，白名單 `view_cafe | good_coffee | fun | park | new_area | destination_meal | art`。探索站（id `creative`）7 個都可用；咖啡站（id `coffee`）只能 `view_cafe`、`good_coffee`；其他站、不合法值一律當沒帶。只對自動站生效（指定／固定／已完成不受影響）。
- `stops[].themeArea`: string，只在 `theme==="new_area"` 且是地區清單裡的名字（`澀谷 新宿 原宿 表参道 恵比寿 代官山`）才生效。這一站改以該區為搜尋中心、只收該區中心 1 公里內的店（不受全域 `area/areaOnly` 限制），且店離出發點超過 3.5 公里就標 `noCandidateReason:"empty"`，不硬派；該區沒合格的店標 `"area"`。
  例：`{"id":"creative","kind":"creative","title":"探索","minutes":65,"theme":"new_area","themeArea":"原宿"}`
回應
- `stops[].theme`、`stops[].themeArea`：把通過驗證的值原樣帶回（不合法就沒有這兩個欄位）。
- 沒有店時的標題：有主題的站是 `探索｜<主題名>`（例 `探索｜有趣的地方`）。
- 其餘欄位不變。手動順序下 `eta/departure/travelMin` 是照使用者順序算的。
主題 → Places 查詢（`src/dailyThemes.ts:11-17`）
- view_cafe：`眺めのいい カフェ テラス`／cafe
- good_coffee：`スペシャルティコーヒー 自家焙煎`／cafe
- fun：`個性的な雑貨店 古書店 レコード店`／store
- park：`公園 庭園 散歩`／park（primaryType 是 park／garden／botanical_garden／national_park 的，不因帶 tourist_attraction 被當地標擋掉）
- new_area：`地元で人気 カフェ 雑貨 散策`／不限類型
- destination_meal：`わざわざ行きたい 名店`／restaurant
- art：`art gallery exhibition`／art_gallery（原本的查詢，沒改）
只存在手機的新資料（不送伺服器）
- `decide.daily.v1` 多了 `manualOrder?: true`、`themesToday?: string[]`（都只留當天）；每站多了 `theme?`、`themeArea?`、`themeFixed?: true`（使用者自己選的主題）。
- 新 key `decide.daily.areas.v1`：`{ "<地區>": { "t": 毫秒, "src": "done:日期:站:店" } }`，標記完成時寫、取消勾選時撤回。
- 「想去哪」加的站：`{ id:"want-<毫秒>", title, place, minutes:60, kind:"creative", custom:true, specified:true }`，文字原樣當地點名稱查，不解析意思。
畫面 testid：`daily-move-up-<id>`、`daily-move-down-<id>`、`daily-order-bar`、`daily-order-apply`、`daily-order-auto`、`daily-add-place`、`daily-add-place-submit`、`daily-theme-<id>`、`daily-theme-opt-<auto|主題id>`、`daily-reason-<id>`。

STOP 自查：
1. PASS｜手動排序。按鈕 `src/dailyDecision.tsx:387`（moveTask）、`:399`（applyUserOrder）、順序列 `:928`；伺服器 `api/daily-route.ts:213`、`:117`、`src/dailyRouting.ts:148`。真瀏覽器 B1–B8 全 PASS（`verify-*.json`）：B1 `{"w":44,"h":44}`；B3 `"sentOrder":["fixed-1","creative","meal","coffee","want","want"]`、`"manualOrder":true,"reorderOnly":true`；B5 重開頁面順序還在；B6 重新產生、B7 換店不打亂；B8 恢復自動排序。單元測試 `tests/unit/daily-guide-route.test.ts`「手動順序」7 條（含固定行程 10:30 不被挪動：`['10:30','10:30','11:00',undefined]`；來不及：`'預計晚到 3 分鐘'`）。把 `manualOrder` 判斷改壞會讓 5 個測試失敗（已試）。
2. PASS｜輸入。根因與證據見上。真瀏覽器 A1–A9：Chromium 9 項、WebKit 8 項全 PASS。單元測試 `tests/unit/dailyDecision-guide.test.tsx`「輸入」6 條（compositionstart／compositionend、空白、Enter、加地點、逐站指定、鍵盤墊高）。⚠️ 真鍵盤遮擋只有假 visualViewport 的單元測試。
3. PASS｜探索主題。7 個主題＋「讓導遊決定」：C1 `"opts":["auto=讓導遊決定","view_cafe=景觀好的咖啡","good_coffee=好喝的咖啡","fun=有趣的地方","park=漂亮的公園","new_area=沒去過的區域","destination_meal=值得專程去的餐廳","art=藝文展覽"]`；C5 輪替 `"seq":["art","fun","view_cafe","destination_meal","good_coffee"]`（WebKit）；C7 咖啡站兩種。單元測試：7 個主題逐一對查詢字串與類型、6 種不合法值、別站的主題、`__proto__` 站 id（寫測試時抓到會當掉，已修）；輪替 50 組亂數每輪 7 個主題各出一次、不連續重複。
4. PASS｜沒去過的區域。`src/dailyThemes.ts:52-90`；伺服器 `api/daily-route.ts:242-244`。C6 `"themeArea":"原宿"`、理由行 `你還沒去過的原宿`。單元測試：挑沒去過的、全去過挑最久沒去的、沒紀錄照常給、區域覆寫、太遠標 empty、該區沒店標 area、換別站時原宿的店照留。把區域覆寫改壞會讓 3 個測試失敗（已試）。
5. PASS｜理由行。`src/dailyDecision.tsx:420`（exploreReason）。C3 `"reason":"為什麼推這裡：主題「漂亮的公園」・Google ★4.3（321 則評論）・從上一站步行 8 分鐘"`。沒資料回空字串不顯示；使用者自己指定的站不寫（單元測試「理由行」2 條）。
6. PASS｜既有守則。既有測試檔 0 改動：`npm test` 改動前 `Tests  1328 passed (1328)`，現在 `Tests  1396 passed (1396)`（＝1328＋68）。既有 e2e：`128 passed (3.9m)`（`npx playwright test tests/e2e`，含色盤守門）。沒有自由文字解析：使用者打的字只走既有 specified 語意原樣送 Places。主題站照樣過評論數、地標、地區、到店要開著（走同一段程式）。
7. PASS｜閘門（最後一次輸出）：`npm run typecheck` → `> tsc -b`（無錯誤）；`npm run lint` → `> eslint src api tests/unit`（無錯誤）；`npm test` → `Test Files  64 passed (64)`／`Tests  1396 passed (1396)`；`npm run check:bundle` → `BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`；`npm run build` → `✓ built in 282ms`。截圖 14 張（修正後 12 張＋修正前 2 張），最大 31,952 bytes。

產出檔案：
- `src/dailyThemes.ts`（新）
- `src/dailyDecision.tsx`、`src/dailyDecision.css`、`src/dailyRouting.ts`、`api/daily-route.ts`（改）
- `tests/unit/daily-guide-route.test.ts`（新，34 條）、`tests/unit/dailyDecision-guide.test.tsx`（新，34 條）
- `runs/guide-1115/reports/guide.md`
全部已 `git add`，沒有 commit。

新快照：`runs/guide-1115/snapshots/`
- 腳本：`repro-input.mjs`（修正前重現）、`verify-guide.mjs`（修正後驗證，攔截 `/api/daily-route` 回固定假店）
- 修正前：`before-chromium.json`、`before-webkit.json`、`before-*.jpg`
- 修正後：`verify-chromium.json`／`.log`、`verify-webkit.json`／`.log`
- 截圖：`shot-{chromium,webkit}-{input-dest,input-add,order-moved,theme-sheet,theme-card,final-top}.jpg`

產品碼行數：`git diff --cached --stat -- src api` → `5 files changed, 380 insertions(+), 61 deletions(-)`（api/daily-route.ts 85、src/dailyDecision.css 19、src/dailyDecision.tsx 235、src/dailyRouting.ts 12、src/dailyThemes.ts 90）。測試 702 行。

未完成／⚠️ 假設：
- ⚠️ 主題查詢沒打過真 Google。最沒把握的三個：`fun`（類型 store 可能回到連鎖店）、`new_area`（不限類型，回什麼看 Google）、`park`（小公園評論數常不到 50 會被既有門檻擋掉）。預覽站驗證時請看這三個拿到的店像不像樣。
- ⚠️ 固定行程（有時間的）沒有上下鍵：它照時間排，移了也沒意義。契約寫「每一站可上移／下移」，嚴格讀會算缺口。
- ⚠️ 開著「只在這一帶找店」（預設開）時，「讓導遊決定」不會自動輪到「沒去過的區域」（6 個主題輪）；使用者自己點選這個主題一定生效。理由：不讓導遊擅自違反地區偏好。
- ⚠️ 改完順序不會自動重算，要按「照這個順序更新時間」（避免每按一下就打一次 Google Routes）。
- ⚠️ 「去過的區域」只認地區清單的 6 區（用店的座標對各區中心 1 公里），只在「標記完成」時記；契約寫的「看過」沒記。
- ⚠️ 挑沒去過的區域時避開使用者目前選的地區（當成生活圈）。
- ⚠️ 輪替沒有用 2.4 偏好加權（任務卡寫「可用」，為了保留變化與少寫程式沒做）。
- ⚠️ 咖啡站預設不輪替（維持原本的安靜咖啡廳），要自己選兩種主題之一。
- 順手改到的既有文案／樣式：探索站目錄標題改成 `探索｜讓導遊挑一個主題`（前後端同步）；活動標籤 `看展覽` → `探索`；空行程說明卡拿掉 ✳ 符號（多了一排輸入框後，既有 e2e「第一屏看得到整張說明卡」超出 23px，測試沒改，改樣式讓它過）。
- 一天最多 9 站（伺服器既有上限）：滿了再加地點會提示，不會默默丟站。
- WebKit 沒有輸入法注入工具，組字只在 Chromium（CDP）與單元測試驗過；真 iPhone 鍵盤要 Cross 實機確認。
