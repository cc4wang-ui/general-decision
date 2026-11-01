# Round 4 進度（接手用）

> 最後更新：2026-11-01。分支 `claude/nifty-ramanujan-szofu5`（本機 commit，GitHub 推送仍被擋）。
> **2026-11-01 21:45 起正式站是 Round 5**（`dpl_52gRcv8zFHehsdU9BTYJG6H98Jc2`），見 `state/ROUND5-PROGRESS.md`。v5 變成回復點。
> **2026-11-01 11:25 正式站上線 v5**（Cross 回「Go live」）：`dpl_AoLhnWJ9TW4FssNLH3YAySvqPThj`，程式碼 `ffea8e4`，用檔案直傳建置（target production）。
> 回復點：`dpl_4WfNn9rS542KTbCdz34yi8Y8HuYD`（Round 3，`4e37ff1`）。出事用 Vercel rollback 回這個 ID。
> 上線驗證：首頁回 v5 的 JS（`index-cgww5LPP.js`）、`/api/probe` 回 404、`/api/order` GET 回 405。
> 深夜量測已排 2026-11-01 23:40（台北）：v5 preview 量信義、東京兩格。
> 新的 session 從這份開始讀。

## 起因

Cross 2026-10-30 決定自己連續試用 60 天。回報三類問題：

1. 反覆推同一家店。
2. 沒辦法照價格找店。
3. 很多情境不給任何解答。

## STOP 條件（Cross 2026-10-30 回「OK」）與實測（2026-11-01）

| # | 條件 | 現況 |
|---|---|---|
| 1 | 測試情境中，吃／歇每一格都回真店口令（方圓 3 km 內真的沒有營業中的店除外） | 早上 9–11 點：最終邏輯吃／歇 98/98 有真店。**深夜未實測**（10/26 正式站深夜曾 no_places）。救援已查到 3 km，Places 掛掉改說實話 |
| 2 | 60 天模擬：7 天內同店重複率 < 15%、30 天內 ≥ 40 家不同的店 | 信義：基線 12.5%／27 家 → 修後 0%／41 家（種子 1）、1.7%／41 家（種子 2） |
| 3 | 選了預算：派出的店 ≥ 90% 價位相符，推估的卡上標「推估」 | 基線 15/20（75%）→ 第一版修後 14/20（70%，退步）→ 再修後 19/20（95%）；最終邏輯合計 27/28（96%） |
| 4 | 每道口令存手機 60 天，可匯出成一個檔案，有單元測試 | `src/trial.ts`、`tests/unit/trial.test.ts`、`tests/e2e/r4-trial.spec.ts` |
| 5 | typecheck、test、build、check:bundle、smoke 通過；測試端點在正式站回 404 | ✅ 本機 521 條連跑 3 次通過；正式站 `/api/probe` 實測回 404（2026-11-01 11:25） |

量測原始數字：scratchpad `results/`（session 結束會消失；摘要在上表）。

## 為什麼不是 GitHub 推送

`git push` 與 GitHub 連接器都回 403。Cross 2026-10-31：「不要硬跑授權／要在 cc4wang 上面運行／我是判斷者」，選「我直傳 Vercel，你零動作」。

直傳做法（給接手的人）：

1. 原始碼打成 `deploy/bundle-*.json.gz`（每包 ≤ 20KB，內含每個檔的 SHA1）。
2. `vercel.json` 的 `installCommand` 先跑 `scripts/unpack.mjs` 解開壓縮包（含 `package-lock.json`），再 `npm install`。git 部署沒有 `deploy/`，unpack 什麼都不做。
3. `public/` 圖片不上傳：`scripts/fetch-public.mjs` 在 build 時從正式站下載，逐檔驗 SHA1（`scripts/public-manifest.json`）。
4. 用 Vercel MCP `upload_file` 逐檔上傳、`create_deployment`（不帶 target ＝ preview）。

Vercel preview（cc4wang 團隊，有登入保護）：

| 名稱 | deployment | 內容 |
|---|---|---|
| 基線 | `dpl_BjRYsRKMJbYGLeRz4i56u1R7p4Ft` | Round 3 挑店邏輯＋量測工具 |
| 修後 v1 | `dpl_9ruqkHZRZ2MbDMmguxeQBiKQENCe` | `41aae74` |
| 修後 v2 | `dpl_AN2QC5mPGm5g2pNKqAS9BUCCTyRV` | `0debf79` 預算修正 |
| 修後 v3 | `dpl_CDAYjDV5CBmUQNg4czRhe38xTZX4` | `b520208` 預算修正＋多樣性調整 |
| 修後 v4 | `dpl_GTFMYgyxZNC7CBPwo16dJYdBgB5J` | `fcd92d8` checker 驗收問題修正 |
| **修後 v5（上線候選）** | `dpl_4xGLDywyLygVoupPibKztawK63zc` | `ffea8e4` checker 複驗問題修正 |

## Round 4 commit（本機）

| commit | 內容 |
|---|---|
| `d18b35d`＋`4195fd5` | 量測工具 `api/probe.ts`＋`src/probe.ts`（只在 preview 運作，正式站 404）。`/api/order` 實作搬到 `src/orderHandler.ts` |
| `57a996b` | 三個修正：關鍵字 lane、預算嚴格篩＋推估、超商救援、Claude 失敗用模板口令 |
| `b789651` | 60 天試用紀錄、匯出、「又是這家」「價格不對」兩個換店原因 |
| `5506689`、`73050d1`、`41aae74` | 直傳 Vercel 用：public 補檔、postinstall／installCommand 解壓縮 |
| `0debf79` | 預算：第二次搜尋保留 priceLevels；預算內有店就只在預算內抽；兩次都空才拿掉價位 |
| `b520208` | 多樣性：balanced 方針 λ 0.8 → 1.5（R3§2.4 範圍內，離線重播 oracleGap 0.061 ≤ 0.08） |
| `fcd92d8` | checker 驗收：素食硬過濾、Places 掛掉講實話、救援 3 km、模板口令講實話、偶發測試改固定種子 |
| `ffea8e4` | checker 複驗：Places 沒查完講實話、手機新增 places_down、素食過濾去誤中 |

## 實測中發現並修掉的問題（2026-11-01）

1. 第一版修後預算命中 70%，比基線 75% 還差。內湖 9 點，3、4 檔四次錯三次。
   - 原因一：第二次搜尋丟掉 priceLevels，撈回 20 家平價早餐店。
   - 原因二：預算內只有 1–2 家時，補回的相鄰檔一起抽，常被抽中。
2. 30 天內不同店 38 家，門檻 40。調高 balanced 的曝光懲罰後 41 家（兩個種子）。
3. 獨立 checker 找到：偶發測試、素食撈到葷食店、Places 掛掉時說「附近沒店」、救援只查 1.5 km、Claude 失敗時模板口令沒講實話。都已修（`fcd92d8`）。
4. checker 複驗再找到：手機看不到「地圖連不上」、部分失敗仍說附近沒店、素食單字誤中（元素、鮮蔬火鍋、齋藤）。都已修（`ffea8e4`）。

## 設計決定與假設

- ⚠️「很多情境沒解答」= 吃／歇跳錯誤畫面，以及 Claude 失敗的「班長在開會」。沒有新增卡片。
- 救援只派**真店**（營業中的便利商店），遵守 Cross 2026-09-18「不准只講類別」。
- 有預算時：兩次帶價位都撈不到 → 第三次拿掉價位撈餐廳 → 仍空才改派超商。
- Claude 失敗 → 伺服器模板口令（`src/template.ts`），一樣經過 `enforceRules`。
- 價位推估：店的類型優先，類型太泛才用關鍵字 lane 的推估。畫面只寫「推估平價」這類描述，不寫金額（T6）。
- 預算外的店：卡片直說「預算內的沒開，這家比較貴／便宜」（`src/prompt.ts`）。
- 試用紀錄不存店名（Google 條款）。分析時用 place_id 對回地圖。

## 已知風險／下一輪候選

- 深夜未實測。修後的救援與模板路徑只有單元測試。
- 41 家只比門檻多 1 家，而且只量了信義一個地區。模擬期間營業狀態固定在 9 點的快照。
- 「預算相符」的判定偏寬：Google 只給「中價位」的店，同時算 2 檔與 3 檔。
- 每道口令最多 4 次 Places（原本 2 次）。手機每日上限 40 次沒動。
- 素食仍信任 Google 的店家類型（大安曾派「佶田日式涮涮鍋」，類型標素食，未查證）。
- 救援可能派到約 3 km 外的超商（步行約 38 分），卡上會寫步行分鐘。
- 模擬平均步行 4.4 → 7.6 分鐘（多樣性的代價）。
- 量測花費超出原估：約 640 次 Places（原估 250）、約 285 次 Claude。
- GitHub main 仍是 Round 3。若之後有人推 main，Vercel 會用 Round 3 蓋掉正式站。
- 試用紀錄存 localStorage：iOS 清除網站資料就會不見。建議每 2 週匯出一次。
