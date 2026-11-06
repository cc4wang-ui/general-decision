# Round 14 進度：被標成外帶店、其實能坐下吃的店不要誤擋（接手用）

> 開始：2026-11-06 08:21 東京。分支 `claude/vigilant-clarke-dsrqfi`（PR #37），基底 `main` `acfd4d2`（正式站 `dpl_53GLUwu4BmfAfRsai2yyzUzL6Kzs`＝回復點）。

## 目標契約｜R14 外帶標籤誤擋

- **Cross 原話**（2026-11-06 08:2x 東京）：「修。ㄅ有些能坐下吃的店，被 Google 標成外帶店，因此被誤擋。」
- 回應 Round 13 報告的下一輪候選第 1 項；例子：すし屋のはなれ、（Google 主類別 `meal_takeaway`）。
- **目標**：約會、朋友聚餐不再因為主類別是 `meal_takeaway` 就擋掉能坐下吃的店；真的只能外帶的店照樣擋。
- **成功指標**：能坐下吃的店不被誤擋；純外帶店 0 筆派進約會／聚餐。
- **STOP 條件**：
  1. 判斷規則用真資料定：先量測 `meal_takeaway` 店的完整 `types`，找出「能坐下吃」和「純外帶」的差別；規則寫進文件，附證據。
  2. 主類別 `meal_takeaway`、但 `types` 顯示是能坐下的餐廳 → 約會、聚餐不擋（正常篩選、整批放回都一樣）。
  3. 純外帶店（`types` 沒有能坐下的餐廳類型）照樣擋：約會、聚餐 0 筆。
  4. 不多花錢：只用現在已經查的欄位（`places.types`），不加 Places 欄位、不換計費等級。
  5. 其他情境不受影響（外帶情境照派外帶店）；閘門全過；測試版新宿、信義不退步。
  6. 獨立 checker（新開）PASS；最多 2 輪。
  7. 上線：沿用 Cross 2026-11-05「全部處理完之後一次上線 不要一直分段」→ checker PASS 後合併 → 驗正式站 → 回報一次。
- **等級**：M。把關：獨立 checker。
- **預算**：主工作 ~100k＋checker ~250k；上限 ~550k。量測約 US$2。
- **保留事項**：上線（依上面原話）。加 `dineIn` 等欄位會換到較貴的計費等級（動錢）→ 不做，若 types 分不出來再交 Cross 🔒。
- **⚠️ 假設**：
  - 「被誤擋」只發生在擋外帶店的情境：約會、朋友聚餐（Round 12、13 加的）。
  - 判斷能坐下吃：`types` 裡有具體料理的餐廳類型（`*_restaurant`，不含 `fast_food_restaurant`）。實際規則以量測結果為準。

## 進度

### 量測（2026-11-06 08:23–08:30 東京）

- 測試版加了兩個量測：debug／probe 列出主類別是外帶店的候選與完整 `types`（`18b0969`）；`mode=takeaway` 用約會、聚餐的 12 個關鍵字各查一次，只拿名稱與類型（`d4e8a97`）。
- 證據：`state/evidence/r14/types-0823/`（新宿、八重洲、信義、大安 4 地情境）、`state/evidence/r14/takeaway/`（4 地 × 12 關鍵字）。

**結果：只看 `types` 分不出來（STOP 1 不成立）**

| 店 | 主類別 | types 裡的料理類型 | 實際 |
|---|---|---|---|
| ちよだ鮨 人形町店 | meal_takeaway | sushi_restaurant、japanese_restaurant | 外帶壽司連鎖 |
| Aum Aum Dosirak 韓定食 | meal_takeaway | korean_restaurant | 韓式便當（도시락＝便當） |
| おだむすび | meal_takeaway | japanese_restaurant（＋fast_food、snack_bar） | 飯糰外帶 |
| 劉家飯糰、米屋の太郎、権米衛… | meal_takeaway | 只有 restaurant | 飯糰外帶 |

- 主類別是外帶店、又帶料理類型的店，量到的都是真的外帶店。用「有料理類型就放行」會把外帶連鎖放進約會、聚餐。
- 能坐下吃的餐廳多半主類別就是餐廳（types 只是順帶有 `meal_takeaway`），本來就不會被擋（只擋主類別）。
- 約會證據 19 次、333 個候選裡，主類別是外帶店的 2 個（約 1 成的約會訂單會碰到 1 家）。

**能準確分辨的欄位：`dineIn`（可內用）**，在 Google 的「Enterprise + Atmosphere」計費等級（[SKU 細節](https://developers.google.com/maps/billing-and-pricing/sku-details/places)、[價目表](https://developers.google.com/maps/billing-and-pricing/pricing)）：

| 做法 | 每月免費 | 超過後 | 估計月費 |
|---|---|---|---|
| A 只對「主類別是外帶店」的約會／聚餐候選查一次 Place Details | 1,000 次（另一個 SKU） | US$25／千次 | ≈ US$0（約 1 成約會訂單 × 1 次） |
| B 所有 Text Search 加 `dineIn` | 1,000 次 | US$40／千次（現在 US$35） | 超過免費額度後每千次多 US$5 |
| C 不改（主類別是外帶店一律擋） | — | — | US$0 |

→ 🔒 動錢，停在這裡交 Cross 決定（契約保留事項）。

## Cross 決定（2026-11-06 東京）

- Cross 原話：「A」→ 只對約會／聚餐碰到主類別是外帶店的候選，查一次 Place Details 的 `dineIn`（🔒 動錢已核准，預估 ≈ US$0／月）。
- 契約 STOP 1、2、4 依此改：判斷用 `dineIn`（不是 types）；費用＝Place Details Enterprise + Atmosphere，每月前 1,000 次免費。

### 程式（`139bd25`＋量測 `9e7a0cb`）

| 項目 | 改了什麼 |
|---|---|
| 查「可內用」 | `src/orderHandler.ts` `fetchDineIn`：GET `/v1/places/{id}`，fieldMask 只有 `dineIn`，3 秒逾時；失敗／沒有欄位 → undefined。挑店前對 `dineInChecks` 選出的候選並行查，算進 `x-places-calls`（前端每日上限），`dbg.dineIn` 記結果 |
| 誰要查 | `src/scene.ts` `dineInChecks`：只在擋外帶店的情境（約會、朋友聚餐）；主類別是外帶店、到店時開著、步行上限內、還沒查過；評分高的先，每單最多 2 家（`DINE_IN_CHECK_MAX`） |
| 放行規則 | `blockedType`：主類別是外帶店、`dineIn === true` → 不當外帶店擋（正常篩選、整批放回都一樣）；false／沒查到 → 照樣擋。其他主類別不受 dineIn 影響 |
| 量測 | probe 列 `dineIn`；`mode=takeaway` 對外帶店查 dineIn、記 HTTP 狀態，`sample=N` 抽一般餐廳量涵蓋率 |

測試：`scene.test.ts`「Round 14」7 條（放行／照擋、購物中心不受影響、dineInChecks 選法與上限、fetchDineIn、handler 3 種結果與 x-places-calls、聚餐查／外帶不查／最多 2 家）；`probe.test.ts` 1 條。突變：拿掉放行 → 3 條失敗；拿掉上限 → 2 條；不算進每日上限 → 1 條。

### 閘門

- `139bd25`：typecheck ✅、單元 739/739 ✅、build ✅（`index-BxpohqeD.js`，跟正式站同一個前端檔）、check:bundle ✅、smoke ✅、e2e 127/127 ✅。
- `9e7a0cb`（只改 probe）：typecheck ✅、單元 739/739 ✅、check:bundle ✅、smoke ✅、e2e 單獨重跑 127/127 ✅。
- ⚠️ 中間有一次 e2e 97 條失敗：兩組全套同時跑，共用 4173 埠與 `dist/`（後一組 build 時前一組正在測）。單獨重跑 127/127。教訓：全套 e2e 一次只跑一組。

### 真資料：dineIn 分得出來（`state/evidence/r14/dinein/`，11:52–11:56 東京）

| 店 | 主類別 | dineIn | 結果 |
|---|---|---|---|
| ちよだ鮨 人形町店（外帶壽司連鎖） | meal_takeaway | **false** | 照擋 ✅ |
| Aum Aum Dosirak 韓定食（便當） | meal_takeaway | 沒資料 | 照擋（安全的預設）✅ |
| 一般餐廳抽樣 32 家（新宿、八重洲、信義、大安各 8） | *_restaurant | 32/32 **true** | Google 在這兩國有 dineIn 資料 |

- 所有 Place Details 呼叫 HTTP 200（金鑰與 API 都可用）。

### 測試版實測（`dpl_8Sjkv7eA23p6vDyruKsYXjFEGHoi`，`9e7a0cb`，11:54 東京）

| 地點 | 情境 | 派錯／到店已關／約會酒吧／約會走超過 15 分 | 約會 | 聚餐 |
|---|---|---|---|---|
| 新宿 | 12/12 | 全 0 | JeMare 4.8★ 走 8 分 | 街中華X&C 4.4★ |
| 八重洲 | 12/12 | 全 0 | シェ・イノ 4.7★ 走 4 分 | 万福 4.2★ |
| 信義 | 12/12 | 全 0 | Bouillon 布雍家 4.3★ 走 4 分 | 王鍋屋 4.6★ |

- 信義「還沒開」1 筆是外帶：朱記 11:00 開、10:54 出發走 7 分＝到店已開（規則允許，這輪沒動）。
- 這三次的約會／聚餐候選裡沒有主類別是外帶店的（dineIn 沒被觸發）；dineIn 的真請求證據在 `dinein/`（跟正式查法同一個 URL 與 fieldMask）。
