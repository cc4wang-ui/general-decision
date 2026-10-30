# Round 4 進度（接手用）

> 最後更新：2026-10-30。分支 `claude/nifty-ramanujan-szofu5`。正式站仍是 Round 3（main `4e37ff1`）。
> 新的 session 從這份開始讀。

## 起因

Cross 2026-10-30 決定自己連續試用 60 天。回報三類問題：

1. 反覆推同一家店。
2. 沒辦法照價格找店。
3. 很多情境不給任何解答。

## STOP 條件（Cross 2026-10-30 回「OK」）

| # | 條件 | 現況 |
|---|---|---|
| 1 | 測試情境中，吃／歇每一格都回真店口令（方圓 3 km 內真的沒有營業中的店除外） | ⏳ 程式已改，**未實測**（卡推送） |
| 2 | 60 天模擬（真實店家資料、每天 2 餐）：7 天內同店重複率 < 15%、30 天內 ≥ 40 家不同的店 | ⏳ 同上 |
| 3 | 選了預算：派出的店 ≥ 90% 價位相符（資料或推估），推估的卡上標「推估」 | ⏳ 同上；單元測試已涵蓋規則 |
| 4 | 每道口令（成功、失敗）存手機 60 天，可匯出成一個檔案，有單元測試 | ✅ `src/trial.ts`、`tests/unit/trial.test.ts`、`tests/e2e/r4-trial.spec.ts` |
| 5 | typecheck、test、build、check:bundle、smoke 通過；測試端點在正式站回 404 | ✅ 見下方閘門 |

## 已完成（本機 commit，尚未推上 GitHub）

| commit | 內容 |
|---|---|
| `d18b35d`＋`4195fd5` | 量測工具 `api/probe.ts`＋`src/probe.ts`（只在 preview 運作，正式站 404）。`/api/order` 實作搬到 `src/orderHandler.ts` |
| `57a996b` | 三個修正：關鍵字 lane、預算嚴格篩＋推估、超商救援、Claude 失敗用模板口令 |
| `b789651` | 60 天試用紀錄、匯出、「又是這家」「價格不對」兩個換店原因 |

閘門（2026-10-30，Linux 容器）：
- `TZ=Asia/Taipei npm run typecheck && npm run test`：✅ 516 條。
- `npm run build`：✅。`npm run check:bundle`：✅（probe 非 preview → 404）。`npm run smoke`：✅。
- e2e：容器裝不了 WebKit，用 `npx playwright test --browser=chromium tests/e2e` 跑。93 過、5 不過。
  5 條不過（`cmd-layout` ×4、`memory` ×1）在 base `4e37ff1` 用 Chromium 一樣不過，是既有的 Chromium 差異，不是這輪造成。**不據此宣稱 WebKit PASS。**

## 卡住的事

1. **推送被擋**：`git push` 與 GitHub 連接器都回 403（`Resource not accessible by integration`）。
   Claude GitHub App 對這個 repo 沒有寫入權限。Cross 要做：
   - https://github.com/apps/claude/installations/select_target → 安裝到 `crosswang-collab`，勾選這個 repo。
   - 或 https://claude.ai/connect-github 重新連結。
2. 推送後才有 preview 部署，才能跑量測（STOP 1–3）。

## 推送後的步驟

1. 推送 4 個 commit；開 draft PR。Vercel 自動建 preview。
2. **基線**（舊邏輯＋量測工具）：commit `4195fd5` 的 preview。要量基線，先只推到 `4195fd5`，等 preview 建好、量完，再推其餘。
   - `GET /api/probe?mode=matrix&loc=xinyi`（另 `neihu`、`daan`、`banqiao`、`tokyo`）
   - `GET /api/probe?mode=sim&loc=xinyi&days=60`
   - 用 Vercel MCP `web_fetch_vercel_url` 打 preview 網址（preview 有登入保護）。
3. **修後**：推到 `b789651`，同一組網址重跑，做前後對照表。
4. checker（獨立 Opus 子代理）對 STOP 1–5 驗收。
5. Cross 合併 PR → 正式站。

預估費用：Places 約 250 次，US$10 以內（Cross 已同意）。

## 設計決定與假設

- ⚠️「很多情境沒解答」= 吃／歇跳錯誤畫面，以及 Claude 失敗的「班長在開會」。沒有新增卡片。
- 救援只派**真店**（營業中的便利商店），遵守 Cross 2026-09-18「不准只講類別」。
- Claude 失敗 → 伺服器模板口令（`src/template.ts`），一樣經過 `enforceRules`。模板本身失敗才回錯誤。
- 價位推估：店的類型優先，類型太泛才用關鍵字 lane 的推估。畫面只寫「推估平價」這類描述，不寫金額（T6）。
- 預算過濾改嚴格：只有預算內（資料或推估）才過。不夠 5 家才補回。
- 試用紀錄不存店名（Google 條款）。分析時用 place_id 對回地圖。
- 每日 Places 上限 40 次沒動。救援只在前兩次都派不出店時才打第三次。

## 已知風險／下一輪候選

- 關鍵字 lane 的 `locationRestriction` 方框與 `priceLevels` 只在單元測試驗過，**未在真 Places 實測**。量測時先看有沒有 400。
- `priceLevels` 篩選會不會排除沒有價位的店，Google 文件沒寫。若篩完常常不到 5 家，第二次（不帶 priceLevels）會補。
- 試用紀錄存 localStorage：iOS 清除網站資料就會不見。60 天中途建議每 2 週匯出一次。
- 未驗證的新 type（`taiwanese_restaurant` 等）仍沒開；關鍵字 lane 已涵蓋同樣的料理。
