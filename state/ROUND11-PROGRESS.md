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
| 11-05 07:00 | 新宿 | 12/12 | 全 0 | **放寬評分**：樹林 4.2★（15 分內最高）走 8 分 | `state/evidence/r11/morning-0700/` |
| 11-05 07:50（第 2 次） | 新宿 | 12/12 | 全 0 | **放寬評分**：サイゼリヤ 3.7★（15 分內最高 3.8★，差 0.2 內）走 6 分 | `state/evidence/r11/morning-0750-run2/` |
| 11-05 07:50（第 3 次） | 新宿 | 12/12 | 全 0 | 一蘭 4.3★ 走 3 分 | `state/evidence/r11/morning-0750-run3/` |

整理：`node state/handoff-tools/r11-check.mjs <json>`。

**深夜（11-05 01:01 東京）**：
- STOP 5（深夜新宿）✅：12/12，派錯、還沒開、到店已關、約會酒吧全 0。約會走 9 分。
- Routes：測試版 `/api/daily-route` 回 `routeVerified:true`（`night/daily.json`）。
- 信義 00:01（台北）8/12，**不是 Round 11 造成**（Round 11 只改約會）：
  - 歇 3 格（工作讀書、談事情、等人）是「附近沒有一家符合 → 整批放回」（`relaxed:true`，Round 7／10 的設計）。工作讀書、談事情派到剩 58 分關門的店（情境要 90／60 分）。
  - **等人派到「PLAYING Hookah Lounge」（type=pub）**：整批放回時不再擋水煙吧與酒吧。這是真的派錯店。
  - 吃「其他／吃到飽」：午夜附近沒有開著的吃到飽 → 超商救援（說實話）。
**清晨（11-05 07:00 東京）**：
- STOP 5（清晨新宿）✅：12/12，派錯、還沒開、到店已關、約會酒吧全 0。Routes `routeVerified:true`。
- STOP 1 第 1 次 ✅：15 分內沒有 4.3★ → 派 15 分內最高分的「オールデイダイニング 樹林」4.2★，**走 8 分**。對照 Round 10（11-04 09:19）：同樣 4.2★，走 32 分。

**早上第 2、3 次（11-05 07:50 東京）**：Cross 07:50 說「開始測試」→ 不等 08:15／09:30，馬上量完；08:15、09:30 的叫醒已停用（`enabled=false`，沒刪）。
- STOP 1 ✅：早上新宿約會 3 次，走 8、6、3 分，0 筆超過 15 分。放寬評分的 2 次都派到 15 分內最高分（差 0.2★ 內）。
- 觀察（不是 STOP）：早上 07:50 約會派到サイゼリヤ（平價連鎖）、一蘭（拉麵）。規則上合格（不是速食主類別、評分夠或已是附近最高），但不太像「吃好一點」。早上本來就少店開。
- Routes：兩次都 `routeVerified:true`。

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

## Checker 第 1 輪（2026-11-05 07:51–08:01 東京）：FAIL（只有「其他」類）

獨立 checker（fresh 子代理，看不到 maker 推理），自己重跑閘門（單元 714/714、e2e 127/127）、自己用 `cands` 重算約會 5 次（全對）、自己打正式站 `/api/daily-route`（`routeVerified:true`）。

| STOP | 判定 | 摘要 |
|---|---|---|
| 1 約會 | **FAIL** | 真資料 PASS；但失敗路徑沒過：15 分內最高分被記憶（又是這家／不要再來）擋掉，`orderHandler.ts:253` 一步退到整批候選 → 40 次裡 36–39 次派居酒屋、1–2 次派走 29 分的店。重現腳本 scratchpad `edge-mem-loop.mts` |
| 2 Routes | PASS | 原因 `SERVICE_DISABLED`；之後都是 `routeVerified:true` |
| 3 Places | PASS | 三個方案數字重算吻合；上限 40 沒改 |
| 4 手機 | PASS | e2e 3 條過；實機列為 Cross 的事 |
| 5 深夜／清晨 | PASS | 新宿 01:01、07:00 各 12/12，逐列重算全 0 |
| 6 閘門 | PASS | 全過；前端 hash = 正式站 |
| 7 checker | FAIL | 因為 1 |
| 8 上線 | PASS | 合併在 Cross「上線」之後 |

契約忠實度的兩個缺口（交 Cross）：
1. 評分放寬後可能比原本抱怨的 4.1–4.2★ 更低（07:50 派到 3.7★）。要不要設評分下限，是 Cross 的決定。
2. 實機測試沒給 Cross 步驟。步驟見下。

其他觀察（下一輪候選，不影響判定）：深夜「一個人放空」派到 snack_bar（Artbar星男）；信義「等人」整批放回派到水煙吧；約會候選裡有購物中心（新宿サザンテラス）；`probe.ts` 放寬評分不算錯也適用「談事情」。

### 第 2 輪前的修正（閘門：typecheck ✅、單元 717/717 ✅、build ✅ 前端 hash 不變 `index-CMs7I1SA.js`、check:bundle ✅、smoke ✅、e2e 127/127 ✅）

- `src/scene.ts` 新增 `sceneTiers`：退路一層一層退——① `sceneFilter` 的 kept；② 情境規則只拿掉評分（步行上限、排除類型照舊）；③ 到店時開著的全部候選。每層都比上一層大才留。
- `src/orderHandler.ts`：挑店改成依序試 `sceneTiers` 的每一層。
- 重現腳本：修前「又是這家」36 居酒屋／2 走 29 分／2 B；修後 40/40 派 B（3.8★、走 5 分）。
- 單元：`scene.test.ts`「Round 11 checker 第 1 輪」3 條（sceneTiers 分層、同大小不重複、handler 20 種子 × 2 種記憶都派 B）。突變檢查：換回舊的兩層退路 → handler 那條失敗。

### 實機測試步驟（給 Cross，預設不做）

1. iPhone Safari 開 https://general-decision.vercel.app 。
2. 長按餐盤 1 秒 → 除錯畫面。
3. 按「匯出記憶」→ 分享面板出現 → 選「儲存到檔案」。
4. 按「匯入記憶」→ 從「檔案」選剛才的檔 → 看到「匯入完成：…現在記得 N 家」。
5. 回首頁開今日行程 → 每站有步行分鐘。

### 修正後的測試版實測（`a91e1d0`，`dpl_9PqRUKZvwibJo9XyJWsu5bqbMzHL`）

| 時間 | 地點 | 情境 | 派錯／還沒開／到店已關／約會酒吧 | 約會 | 證據 |
|---|---|---|---|---|---|
| 11-05 08:07 東京 | 新宿 | 12/12 | 全 0 | 放寬評分：すし屋のはなれ、4.0★（15 分內最高 4.2★，差 0.2 內）走 2 分 | `state/evidence/r11/fix-0807/scene-shinjuku.*` |
| 11-05 07:07 台北 | 信義 | 11/12 | 全 0 | 餓補煎酥包 4.6★ 走 3 分 | `state/evidence/r11/fix-0807/scene-xinyi.*` |

- 信義沒過的 1 格：「一個人快吃」07:07 附近 8 分內沒有開著的店 → 超商救援（快吃沒有評分門檻，這次修正不影響它）。
- 觀察：新宿約會派到 type `meal_takeaway` 的壽司店（外帶店）。規則上合格，但不太像「吃好一點」。下一輪候選。

## Checker 第 2 輪（2026-11-05 08:10–08:20 東京，最後一輪）：FAIL（只有「其他」類）→ 停，交 Cross

| STOP | 判定 | 摘要 |
|---|---|---|
| 1 約會 | **FAIL（其他）** | 第 1 輪的問題修好：重現腳本 40/40 派 15 分內的 B，0 居酒屋、0 走 29 分；08:07 真資料也過。新的缺口：最高分被記憶擋掉後，第 2 層只拿掉評分，沒有在剩下的店裡重算「最高分往下 0.2★」。用 07:50 新宿真候選模擬：一蘭（唯一 4.3★）被擋 → 60 次裡 12 次派 3.8★（應派 ≥ 4.0★），6 次派購物中心「新宿サザンテラス」。腳本 scratchpad `edge-band.mts`、`edge-real.mts` |
| 2–6、8 | PASS | Routes、Places、手機、深夜清晨、閘門（單元 717/717、e2e 127/127）、上線紀錄 |
| 7 | FAIL | 因為 1 |

- 分類：其他（不是跑不完、不是壞資料）。STOP 1 第二次 FAIL → 依 Claude.md 規則 3、7：停，三句白話交 Cross。
- checker 建議：列已知未修、下一輪順手修；修正版比正式站好（正式站仍會派走 29 分或居酒屋），上線要 Cross 說。
- e2e 附註：checker 第一次全套 126/127，`streak.spec.ts:31` 位移 2.77 px（容許 < 2 px）；單獨跑 8 次全過、第二次全套 127/127。前端檔案沒變 → 本來就時好時壞的測試，不是這次修正造成。
- 契約缺口補齊：評分下限的建議值、實機步驟的位置，已寫進 HANDOFF §6。

### 已知未修（Round 11 結束時）

| 項目 | 說明 |
|---|---|
| 約會：最高分被記憶擋掉後的評分 | 第 2 層要在剩下的店裡重算「最高分往下 0.2★」（checker 的最小修正） |
| 約會：外帶店、購物中心 | 早上派到 `meal_takeaway` 壽司店；候選裡有購物中心。「吃好一點」的感覺不足 |
| 歇：整批放回時派到水煙吧、snack_bar | 信義深夜「等人」派到 PLAYING Hookah Lounge；新宿深夜「一個人放空」派到 Artbar星男 |
| probe | 「放寬評分不算錯」也適用「談事情」 |
| e2e | `streak.spec.ts:31` 偶爾位移超過 2 px |
