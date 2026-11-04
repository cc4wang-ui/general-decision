# Round 11 進度：交接待辦全處理（接手用）

> 開始：2026-11-04 18:00 東京。分支 `claude/vigilant-clarke-dsrqfi`，基底 `main` `4688301`（＝正式站 `dpl_D5CHYjpdPqdmGADARnHpHvcKzWG2`）。
> 回復點：`dpl_D5CHYjpdPqdmGADARnHpHvcKzWG2`（Round 10，#33）。

## 目標契約｜R11 交接待辦全處理

- **Cross 原話**（2026-11-04 18:00 東京，回應 4 項待辦清單）：「全部都處理」
- **4 項待辦**（Claude 列給 Cross 的原文）：
  1. 早上「約會吃好一點」派到 4.1–4.2★、步行可能超過 30 分。建議加步行上限 15 分。
  2. 🔒 Google Routes 403：要在 Google Cloud 為現有金鑰開 Routes API。
  3. 🔒 Places 每日上限 40 次。提高可能動錢。
  4. 還沒做：手機實機測試；深夜、清晨真資料量測。
- **目標**：4 項都有結果。能做的做完並驗過；只有 Cross 能做的，縮到一個動作，附精確位置。
- **成功指標**：每一項都是「完成＋證據」或「待 Cross 一個動作＋原因」。
- **STOP 條件**：
  1. 約會：派到的店步行 ≤ 15 分（15 分內有可派的店時）。15 分內沒有 4.3★ → 派 15 分內評分最高的（差 0.2★ 內）。單元測試涵蓋。真資料：早上（東京 07:00–10:30）新宿約會 ≥ 3 次，0 筆超過 15 分。
  2. Routes：查出 403 的真正原因（API 沒開，或金鑰限制）。Cross 的動作縮成 1 個，附精確網址。Cross 做完後，Claude 自己偵測 `routeVerified:true`。
  3. Places 上限：方案附數字依據（免費額度、最壞月費）。🔒 等 Cross 核准；核准後改並測。
  4. 手機：模擬 iPhone 的 e2e 補「分享面板」路徑（點擊後馬上叫、取消時按鈕不變）。實機列為只有 Cross 能做。
  5. 深夜（東京 00:30–02:00）、清晨（06:00–07:30）各量一次新宿真資料：派錯、還沒開、到店已關、約會酒吧全 0。
  6. 閘門全過：typecheck、單元、build、check:bundle、smoke、e2e 全套。其他 11 格情境不退步。
  7. 獨立 checker PASS（最多 2 輪；2 輪後只剩「其他」類 → 列已知未修）。
  8. 上線 🔒：Cross 說「上線」才合併進 `main`。
- **等級**：M（正式站交付）。把關：獨立 checker 子代理。
- **預算**：主工作 ~250k＋checker ~170k；上限 ~630k token。量測 Places／Claude 約 US$5（9 次 probe）。
- **保留事項**：上線（合併進 `main`）；Places 上限（動錢）；Routes（改金鑰設定，只有 Cross 的 Google 帳號能做）。
- **⚠️ 假設**：
  - 步行上限 15 分（checker 第 2 輪的建議值）。
  - 15 分內一家可派的都沒有 → 照舊整批放回（寧可派得到）。
  - 約會半徑 1500 → 1200 m（15 分 × 80 m/分；超過的候選反正會被步行上限擋掉）。
  - 深夜／清晨／早上量測：用 send_later 叫醒這個 session（一次性，觸發後自動停用）。不動 Cross 停用的舊排程。
  - 實機測試：只有 Cross 的 iPhone 能做 → 列「待你處理」。

## 進度

### 1 約會步行上限（程式）✅

- `src/scene.ts`：約會 `maxWalk: 15`、半徑 1500 → 1200 m。放寬評分時步行上限照舊（`sceneFilter` 的 softer 本來就保留 `maxWalk`）。
- `src/probe.ts`：附近沒有一家過評分、派的是走得到的店裡最高分（差 0.2★ 內）→ 不算「不符規則」，列 `ratingRelaxed`。約會附全部候選 `cands`，給量測腳本自己重算。
- `state/handoff-tools/r11-check.mjs`：r10 的全部檢查＋約會走超過 15 分＋約會不是 15 分內最高分（自己用 `cands` 重算，不靠 `scene.ts`）。
- 單元：`tests/unit/scene.test.ts`「Round 11」6 條。突變檢查：拿掉 `maxWalk: 15` → 5 條失敗。

### 2 Routes 403（程式）✅ → 待測試版讀原因

- `src/dailyRouting.ts`：`routesErrorDetail` 取 Google 錯誤的狀態、原因、專案編號、啟用網址，接在錯誤訊息後面，只進伺服器 log。不含金鑰（單元測試檢查）。
- 單元：`tests/unit/dailyRouting.test.ts` 4 條（API 沒開、金鑰限制、壞內容、不帶金鑰）。

### 3 Places 上限：方案（🔒 待 Cross 核准）

| 方案 | 每月最多 | 超過免費 1,000 次的部分 | 最壞月費 |
|---|---|---|---|
| 維持 40 次／日 | 1,200 次 | 200 次 | ≈ US$7 |
| 提高到 80 次／日 | 2,400 次 | 1,400 次 | ≈ US$49 |
| 改成每日 15 道口令（每道 ≤ 4 次） | 1,800 次 | 800 次 | ≈ US$28 |

- 依據：`DECIDE-DEV-DOC-v1.md` 第 269、403 行（Enterprise SKU，免費 1,000 次／月，超過 US$35／千次，2026-07 價表）。
- 量測也吃同一個免費額度：一次情境量測約 20 次 Places。
- 試用匯出裡「被上限擋」的筆數只在 Cross 的手機上，Claude 看不到。

### 4 手機（模擬 iPhone 13）✅

- `tests/e2e/r11-share.spec.ts` 3 條：分享面板在點擊有效期內叫出（`navigator.userActivation.isActive`）、交出 `.json` 含記憶；一鍵匯出同樣；使用者關掉分享面板 → 按鈕字不變、不改走下載。
- 突變檢查：分享前延遲 5.5 秒 → 失敗。
- 從「檔案」匯入：Round 10 的 `r10-data.spec.ts` 已用 `setInputFiles` 測過。
- ⚠️ 這是 Chromium 模擬，不是實機。實機只有 Cross 的 iPhone 能做。

### 閘門（2026-11-04 18:2x 東京）

typecheck ✅、單元 712/712 ✅、build ✅（`index-CMs7I1SA.js`）、check:bundle ✅、smoke ✅、e2e 全套 127/127 ✅（3.8 分）。
