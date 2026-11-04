# Round 11 進度：交接待辦全處理（接手用）

> 開始：2026-11-04 18:00 東京。分支 `claude/vigilant-clarke-dsrqfi`，基底 `main` `4688301`（＝正式站 `dpl_D5CHYjpdPqdmGADARnHpHvcKzWG2`）。
> **2026-11-04 19:21 東京上線**：PR #34 合併進 `main`（`945088a`），Vercel 部署 `dpl_8XSAAmNtPTS9bmfbNaiJqc51Vx9f`。
> 回復點：`dpl_D5CHYjpdPqdmGADARnHpHvcKzWG2`（Round 10，#33）。Vercel rollback 一鍵。

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

### 2 Routes 403 ✅ 已解決（Cross 開了 Routes API）

- `src/dailyRouting.ts`：`routesErrorDetail` 取 Google 錯誤的狀態、原因、專案編號、啟用網址，接在錯誤訊息後面，只進伺服器 log。`computeRouteMatrix` 是串流 API，錯誤包在陣列裡（`7016204` 修）。解不出時留前 160 字原文，遮掉金鑰樣式字串。
- 單元：`tests/unit/dailyRouting.test.ts` 6 條（API 沒開、金鑰限制、陣列格式、沒有結構化原因、不是 JSON、不帶金鑰）。
- **原因（2026-11-04 18:20 東京，測試版真請求）**：`PERMISSION_DENIED SERVICE_DISABLED projects/919994638922`。是**專案沒開 Routes API**，不是金鑰限制。證據 `state/evidence/r11/routes/log.txt`、`daily2.json`（`routeVerified:false`，店家與照片照常）。
- **Cross 的一個動作**：打開 https://console.developers.google.com/apis/api/routes.googleapis.com/overview?project=919994638922 → 按「啟用」。約 1 分鐘。
- 費用：Compute Route Matrix 每月前 10,000 個元素免費；一次今日行程最多 10 點 ≈ 100 元素。
- Claude 自己偵測：每次量測叫醒時打一次 `/api/daily-route`，看 `routeVerified:true`。
- ⚠️ 開了之後若變成 `API_KEY_SERVICE_BLOCKED`＝金鑰有 API 限制，要再把 Routes API 加進金鑰允許清單（第二個動作，到時候附網址）。

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

- `f33dfb8`：typecheck ✅、單元 712/712 ✅、build ✅（`index-CMs7I1SA.js`）、check:bundle ✅、smoke ✅、e2e 全套 127/127 ✅（3.8 分）。
- `7016204`（只改伺服器端 Routes 錯誤解析）：typecheck ✅、單元 714/714 ✅、build ✅（前端 hash 相同 `index-CMs7I1SA.js`，e2e 不受影響）、check:bundle ✅、smoke ✅。

### 測試版

| 名稱 | deployment | commit |
|---|---|---|
| R11 preview-1 | `dpl_2xJDRk4Q1kYRkS7oAxbZosMbi8R4` | `f33dfb8` |
| R11 preview-2（量測用） | `dpl_65Z3btkfCR5Gvy8XzJ3E5TSUkbZF`（general-decision-pw257bw04-cc4wang-uis-projects.vercel.app） | `7016204` |

### 實測

| 時間（東京） | 地點 | 情境 | 派錯／還沒開／到店已關／約會酒吧 | 約會 | 證據 |
|---|---|---|---|---|---|
| 11-04 18:20 | 新宿 | 12/12 | 全 0 | JeMare 4.8★ 走 8 分 | `state/evidence/r11/evening/scene-shinjuku.*` |
| 11-04 17:20（台北） | 信義 | 12/12 | 全 0 | PROMETTENTE 4.7★ 走 15 分 | `state/evidence/r11/evening/scene-xinyi.*` |
| 11-05 01:01 | 新宿 | 12/12 | 全 0 | 鮨和食かなうS 4.7★ 走 9 分 | `state/evidence/r11/night/scene-shinjuku.*` |
| 11-05 00:01（台北） | 信義 | 8/12 | 歇派錯 1（見下） | Zentopia 禪托邦 4.8★ 走 14 分 | `state/evidence/r11/night/scene-xinyi.*` |

整理：`node state/handoff-tools/r11-check.mjs <json>`。

**深夜（11-05 01:01 東京）**：
- STOP 5（深夜新宿）✅：12/12，派錯、還沒開、到店已關、約會酒吧全 0。約會走 9 分。
- Routes：測試版 `/api/daily-route` 回 `routeVerified:true`（`night/daily.json`）。
- 信義 00:01（台北）8/12，**不是 Round 11 造成**（Round 11 只改約會）：
  - 歇 3 格（工作讀書、談事情、等人）是「附近沒有一家符合 → 整批放回」（`relaxed:true`，Round 7／10 的設計）。工作讀書、談事情派到剩 58 分關門的店（情境要 90／60 分）。
  - **等人派到「PLAYING Hookah Lounge」（type=pub）**：整批放回時不再擋水煙吧與酒吧。這是真的派錯店。
  - 吃「其他／吃到飽」：午夜附近沒有開著的吃到飽 → 超商救援（說實話）。
- **下一輪候選（待 Cross）**：歇整批放回時，仍擋店名含 hookah／shisha／水煙、type 是酒吧類的店；剩下的都不行才超商救援。

### 量測排程（send_later 叫醒這個 session，一次性）

| 東京 | 做什麼 | 證據目錄 |
|---|---|---|
| 11-05 01:00 | 深夜：新宿＋信義；Routes 偵測 | `state/evidence/r11/night/` |
| 11-05 07:00 | 清晨／早上第 1 次：新宿；Routes 偵測 | `state/evidence/r11/morning-0700/` |
| 11-05 08:15 | 早上第 2 次：新宿（先重拿分享連結）；Routes 偵測 | `state/evidence/r11/morning-0815/` |
| 11-05 09:30 | 早上第 3 次：新宿；Routes 偵測 → 獨立 checker → 回報 Cross | `state/evidence/r11/morning-0930/` |

每次：分享連結在 scratchpad `share.txt`（過期就用 `get_access_to_vercel_url` 對 preview-2 重拿）→ `bash state/handoff-tools/preview-measure.sh <連結> <目錄> scene-shinjuku`（深夜加 `scene-xinyi`）→ `r11-check.mjs` 整理 → POST `/api/daily-route`（body：`{"origin":{"lat":35.6896,"lng":139.7006},"stops":[{"id":"meal","kind":"meal","minutes":45},{"id":"coffee","kind":"coffee","minutes":45}]}`）看 `routeVerified` → 寫回這份 → commit、push。

## Cross 決定（2026-11-04 19:19 東京）

- Cross 原話：「上線」。
- 依這句合併 PR #34 進 `main`，正式站自動重建。這時深夜、清晨、早上量測和 checker 都還沒做；不等，是 Cross 的決定，不是 maker 跳過（同 Round 7）。
- 上線前正式站：`dpl_D5CHYjpdPqdmGADARnHpHvcKzWG2`（`main` `4688301`）＝ **回復點**（Vercel rollback 一鍵）。
- 排好的量測照常做，改當上線後驗證（測試版 preview-2 跟上線的程式相同）；09:30 的 checker 也照跑，FAIL 就開下一輪修。
- Places 上限：Cross 沒選 → 維持 40 次（不改程式，不動錢）。
- Routes：等 Cross 按「啟用」；量測時自己偵測。

## 上線（2026-11-04 19:21 東京）✅

| 檢查 | 結果 |
|---|---|
| `general-decision.vercel.app` 指向 | `dpl_8XSAAmNtPTS9bmfbNaiJqc51Vx9f`（`main` `945088a`，PR #34） |
| 首頁 JS | `index-CMs7I1SA.js`（= 本機 build） |
| `/api/probe` | 404 |
| `/api/order`、`/api/weekly`、`/api/daily-route`、`/api/geocode` GET | 405 |
| POST `/api/order`（新宿・約會吃好一點，19:21） | 200，【割烹和食と会津地酒】御椀 ふぅ，走 3 分。log：`r=1200`（新半徑）、`relaxed=-` |
| POST `/api/daily-route`（目前位置＝新宿） | 200，**`routeVerified:true`、`Google Places + Google Routes`**，每站有步行分鐘（3、5 分） |
| runtime error（1 小時） | 0 |

證據 `state/evidence/r11/production/`。

**Routes**：18:20 測試版還是 `SERVICE_DISABLED`；19:21 正式站已回 `routeVerified:true`。Cross 在這之間按了「啟用」。今日行程的步行時間現在是 Google 實算。

### 上線後還要做（不是閘門）

- 深夜、清晨、早上量測（排程不變，見「量測排程」）。
- 09:30 後獨立 checker。FAIL → 開下一輪修。
