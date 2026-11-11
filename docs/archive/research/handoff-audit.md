# 決斷連 · 誠實三分表

判定基準：**✅ = 這台機器上實跑過並看到證據**；**⚠️ = 文件宣稱完成，但本輪沒有可執行的驗證（或驗證方式本身是假的）**；**❌ = 明確沒做**。
時間：2026-09-14／macOS Darwin 25.6.0 (arm64)／Node v24.15.0／Playwright 1.63.0。
基準目錄：`/Users/crosswang/Downloads/general-decide/decide-codex-handoff`。

**一句話總結**：程式跑得動、測試全綠、角色資產是真貨；但「全綠」的覆蓋面比它看起來小得多（後端整合是假上游、8-bit 只做了造型層沒做色彩層、STOP D/E 未達），而且交付包沒有 `.git`，337 KB 研究文件正處於會被覆蓋掉的位置。

---

## 1. 產品功能（S1–S10）

| 步 | 內容 | 判定 | 證據 |
|---|---|---|---|
| S1 | vite react-ts + 依賴 + PWA manifest + .env.example | ✅ | `npm ci` exit 0（107 packages, 0 vulnerabilities）、`npm run typecheck` exit 0、`public/manifest.webmanifest` 與 `.env.example` 實際存在（我本輪 `cat` 確認為 `[FILL_THIS]`）— 實跑驗證 + 產品規格對照 |
| S2 | cards.ts / officers.ts / 三層語料 ≥20 句 | ✅ | `tests/unit/cards.test.ts`、`officers.test.ts` 綠（含在 84/84 內）— 實跑驗證 |
| S3 | avatar.tsx + meme.tsx 兩欄 grid | ✅ | `avatar.test.tsx` 綠；`grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)`，`shots/03-cmd-eat.png` 目視兩欄不相交 — 原始碼現況 |
| S4 | app.tsx 狀態機 + 首頁 + 點名 | ✅ | e2e `happy.spec.ts` 七卡各自 home→intake→cmd 全綠（含在 36/36 內）— 實跑驗證 |
| S5 | api/order.ts：Places + Claude + 四層解析 + 錯誤分類 | ⚠️ | 程式與單元層是 ✅（`handler.test.ts`/`order.test.ts` 綠）。但**沒有一次真實呼叫**：`npm run smoke` 的上游是 `scripts/smoke-order.mjs` 自建的 fake server，`ANTHROPIC_API_KEY='smoke-test-key'`；`DEPLOY.md` 自述「api/ 沒有在真的 Vercel 上跑過」— 實跑驗證 + 產品規格對照 |
| S6 | 前端接 /api/order、三路 + 罰則倒數 | ✅（UI 層） | `paths.spec.ts` 5 條 + `errors.spec.ts` 5 條綠（500／非法 JSON／離線／429）。**但 e2e 全程 `page.route('**/api/order')` mock**，證明的是 UI／狀態機／錯誤處理，不是整合 — 實跑驗證 |
| S7 | diary.ts + 日記頁 | ✅ | `diary.spec.ts` 5 條綠（3 筆、統計、冪等、重整仍在）— 實跑驗證 |
| S8 | api/weekly.ts + 週報 + 分享 | ✅（前端） | `weekly.spec.ts` 4 條綠。後端同 S5，未真跑 |
| S9 | 跟隨系統 + clamp + 小螢幕 + shots 七張 | ✅ | `system.spec.ts` 6 條綠；`npm run e2e:shots` exit 0，7 張 PNG 於 17:59 重新產出（107–198 KB，md5 全變，非沿用舊檔）— 實跑驗證 |
| S10 | `vercel --prod` + 填 env + 線上打通 | ❌ | 無 `.vercel/`（本輪確認）、`.env.example` 仍 `[FILL_THIS]`、`state/decide-mvp-build.json` `status:"blocked"` / `pending:["S10"]` — 產品規格對照 + 本輪 spot check |

---

## 2. 8-bit 視覺改版（逐畫面）

**先講最關鍵的一件事**：8-bit 這一輪（09-13～09-14）**只動了一個原始碼檔** — `src/styles.css`，而且只是在 19,591 bytes 的舊 stylesheet **檔尾追加 1,522 bytes（7.8%）覆寫**，內容只有 border-radius / box-shadow / border-width / border-style，**一個顏色都沒有**。`CODEX-HANDOFF.md` 說「UI 主要修改 styles.css、app.tsx、meme.tsx、share.ts」講的是 09-12 的 v2 軍教片那一輪，不是 8-bit（來源：原始碼現況，逐檔 diff + mtime）。

| 畫面 | 判定 | 實際狀況與證據 |
|---|---|---|
| 01 home | ⚠️ | 方角 ✅、pixel 頭像 ✅，但**主磁貼「吃」沒有硬陰影**：`.tile:first-child{box-shadow:0 4px 0 var(--officer-deep)}`（specificity 0,2,0）壓過 8-bit 的 `.tile{box-shadow:4px 4px 0 var(--ink)}`（0,1,0）。`shots/01-home.png` 肉眼可見 — 原始碼現況 |
| 02 intake | ✅ | 方角 chip、方塊星星、硬陰影主鍵，`shots/02-intake-attend.png` 確認 |
| 03 cmd | ✅ | 方角梗圖卡、3px 框、虛線分隔、硬陰影、圓形遮罩已解 |
| 04 cmd-stop | ✅ | 同上，紅底 |
| 05 log | ✅ | 同上，深綠底 |
| 06 stand | ✅ | 方格節拍 track（底部 20 白方塊），8-bit 感最強的一張 |
| 07 weekly | ⚠️ | `.weekly-score` 分隔線仍是**實線**（其他都虛線）；角色仍被裝在**卡其色方框**裡（`.meme.wide .face{background;border}` 0,3,0 壓過 `.meme .face:has(img)` 0,2,1）— 全 App 唯一還有外框的頭像 |
| 08 diary | ❌ | 幾乎沒改：`.stat{border-radius:14px}`、`.empty{border-radius:20px}`、`.ent .r{border-radius:5px}` 全部不在 8-bit 覆寫清單內。**七＋畫面裡唯一沒改的** |
| 分享輸出（1080×1350） | ❌ | `.meme[data-share="true"]{border-radius:calc(var(--radius)*3)}`（0,2,0）贏過 `.meme{border-radius:2px}`（0,1,0）→ **匯出的圖是 12px 圓角，畫面上是 2px。分享出去的圖不是 8-bit 的** |
| **UI 色彩換 NES 硬體色** | ❌ | `src/styles.css` 全部 31 個 hex 對 NES 54 色主調色盤**命中 0**。`:root` 仍是 v2 軍教片色（`--khaki:#E3DFD0`、`--olive:#4A5733`）。NES 吸附只發生在 `design/hwpalette.mjs` + `sprites.mjs`，沒回灌 CSS — 原始碼現況（實測抽色比對） |
| 繁中像素字體 | ❌ | 無 `@font-face`，仍 `-apple-system, PingFang TC`。`design/8bit/canvas.json` 的 `note-todo` 自己列為待辦 |
| 三段火力在 8-bit 下重新定義 | ⚠️ | `main[data-level]` 有寫進 DOM ✅，但 8-bit 覆寫把三級 `--radius:4px;--card-edge:2px` 打平 → DESIGN.md 的「26/20/10px 圓角、1/1/3px 邊框」**全部失效**，五維只剩綠色明暗與字重 |

**加權完成度約 56%**（角色資產 25%×100 + 接入 10%×80 + UI 幾何 25%×75 + UI 色彩 20%×0 + 像素字 10%×0 + 三段火力 5%×40 + 視覺回歸 5%×50）。實際觀感是**一組 NES 原色 sprite 貼在一組低飽和軍教片 UI 上**，兩者不像同一個世界。

---

## 3. 角色資產

| 項目 | 判定 | 證據 |
|---|---|---|
| 30 檔齊全、命名正確 | ✅ | 恰好 30 檔 `{0,1,2}/{idle,bark,praise,punish,soft}.{png,webp}`，無缺無多 — 角色資產驗證（本輪 `ls` 複核） |
| 48×48 | ✅ | 15 張 PNG 的 IHDR 皆 48×48／bit depth 8／colour type 6／非交錯；WebP 在 chromium 解出 48×48 |
| 7–8 不透明色 | ✅ | 唯一的 7 是 `0/praise`（稱讚時不流汗，少 `#3CBCFC`），合理 |
| alpha 只有 0/255 | ✅ | 30 張零個半透明像素 |
| 三人共用膚色 | ✅ | `#FCA044` 與 `#AC7C00` 出現在全部 15 張 |
| 100% 落在 NES 色表 | ✅ | 11 個相異色全在 `hwpalette.mjs` 的 NES 陣列內，非 NES 色 0 個 |
| PNG↔WebP 無損一致 | ✅ | 15 對逐像素零差異；chunk 標頭皆 `VP8L`（無損）非 `VP8 ` |
| **soft 接入 App** | ❌ | `src/avatar.tsx:5` `Mood = 'idle'\|'bark'\|'praise'\|'punish'` — 四種。`grep soft src/ api/ tests/` **0 命中**（本輪確認）。檔案已交，型別上無法引用 |
| 驗證方法本身 | — | 純 Node 自寫 PNG 解碼器（zlib inflate + unfilter）取 ground truth，再用 chromium canvas 交叉比對，15 張 byte 完全一致 → chromium 無色彩管理位移，WebP 讀值可信 |

**source of truth 已飄移（3 項，都不影響上述判定但會咬人）**：
- `hwPalettes('nes')[2]` 只回 7 色、**沒有 `#F83800`**，但 `2/*` 五張全含 10 px 的紅哨繩（座標是頸上對稱 V 形）。**資產對、腳本沒跟上** — 若有 CI 拿 `hwPalettes()` 當白名單，老郭五張會全 fail。
- `hwPalettes()` 不回傳 `ink`，嚴格比對時 lv0/lv1 會多出 `#000000` 被誤判。
- `design/sprites.mjs:25` 是 `const INK = '#16180F'`，但那個色**不在 NES 表也不存在於任何交付檔**（交付用 `#000000`）→ **sprites.mjs 不是這批檔的產生器**，中間還有一道吸附步驟。接手的人改 sprites.mjs 會發現改不動輸出。

---

## 4. 測試

| 項目 | 判定 | 退出碼與關鍵輸出 |
|---|---|---|
| `npm ci` | ✅ | 0 · 107 packages · 0 vulnerabilities · 唯一警告 `whatwg-encoding@3.1.1` deprecated（既有間接依賴） |
| `npm run typecheck` | ✅ | 0 · 另跑 `npx tsc -b --force`（防 incremental 假通過）同樣 0，涵蓋 31 個 .ts/.tsx |
| `npm run test` | ✅ | 0 · **Test Files 7 passed / Tests 84 passed**，0 fail 0 skip，4.15s |
| `npm run build` | ✅ | 0 · 35 modules · `index-DarFd-at.js 264.25 kB (gzip 86.25)` · 287ms |
| `npx playwright install webkit` | ✅ | 0 · webkit-2359 已在快取，版本吻合 |
| `npm run e2e` | ✅ | 0 · **36 passed (58.3s)**，零 fail 零 skip。webServer 真的跑 `vite build && vite preview`，WebKit（iPhone 13 profile）真的開了頁面 |
| `npm run e2e:shots` | ✅ | 0 · **7 passed (7.8s)**，7 張 PNG md5 全部改變（真重畫） |
| `npm run smoke` | ⚠️ | exit 0，`HTTP 200` + 合法 Order JSON。**但上游是假的** — fake server 頂替 Claude `/v1/messages` 與 Google Places。驗到的是「vite middleware → handler → Order JSON 契約」這條真 HTTP 路徑（`place.walkMin: 1` 確實是 handler 算的），**沒驗真金鑰、真 Claude、真 Places** |

**⚠️ 文件宣稱與實測直接衝突（三處都是過期的假陰性）**：
`CODEX-HANDOFF.md:37`「WebKit 在本次 macOS sandbox 中無法啟動，E2E 未到達網頁」、`README.md:26`「不代表這些端對端測試已通過」、`shots/CHECK.md`「WebKit 在啟動階段遭 sandbox 阻擋」、`PITFALLS-UI.md`「不得標記 Playwright E2E PASS」— **這台機器上全部不成立**。上一輪是環境問題不是程式問題。這四處文字建議更新。

**測試覆蓋的真實邊界（比綠燈看起來小）**：
- 36 條 e2e 全程 mock `/api/order`（`tests/e2e/fixtures.ts` 的 `page.route`，是 dev doc 13.2 節的設計）→ **不證明後端整合**。
- 前後端整合目前**只有 smoke 那一層假上游覆蓋**。
- `tests/` 全域 grep **沒有任何 font-size／zoom／大字級斷言** → 4:5 那條差異永遠不會被自動化抓到。
- 4 個 CSS specificity 視覺 bug（hero tile 無陰影／週報頭像有框／分享圓角／三段火力打平）**typecheck 與 84 項單元測試全部抓不到**。

---

## 5. 部署與上架

| 項目 | 判定 | 證據 |
|---|---|---|
| Vercel 部署 | ❌ | 無 `.vercel/` 目錄（本輪確認）、無部署 URL。escalation：`vercel whoami → token is not valid`；「vercel login 是互動式帳號認證，agent 不做帳號登入」 |
| `ANTHROPIC_API_KEY` | ❌ | 不存在於這台機器。`.env.example` 仍 `[FILL_THIS]` |
| `GOOGLE_PLACES_KEY` + GCP 啟用 Places API (New) | ❌ | 不存在。可選 —「吃」「歇」會走第 7 節規則 6 降級 |
| model id `claude-sonnet-5` 可用性 | ⚠️ | 未驗證。`DEPLOY.md`：「若 API 回 404 model not found，換成你帳號可用的 model id」 |
| Capacitor 原生殼 | ❌ | `package.json` **0 個** `@capacitor/*`、**無 `ios/` 目錄**（本輪確認）。`DESIGN.md` 觸覺表整欄標「尚待串接」。註：`navigator.vibrate` 在 iOS Safari 無效，要觸覺就非走 Capacitor 不可 |
| iOS 實機驗證 | ❌ | Dynamic Type、`env(safe-area-inset-*)`、`navigator.share`、高對比皆未在實機驗 |
| Apple Developer 帳號／簽章 | ❌ | 未開始 |
| **STOP E**（`vercel --prod` + curl 200 + `/api/order` 200） | ❌ BLOCKED | 上述三項憑證全缺 |

---

## 6. 文化與品質驗收

| 項目 | 判定 | 證據 |
|---|---|---|
| 八條產品規則自評（`shots/CHECK.md`） | ⚠️ | 表已填，但**只有一項明寫 PASS**（「深淺色 03 皆完整顯示名牌、肩線與值星帶，兩欄不相交」）。其餘七格是敘述性描述，非 PASS/FAIL |
| **第 13.3 節七列人工對照表** | ❌ | **在交付包裡不存在**。handoff 的 `shots/CHECK.md` 把它**整份覆蓋**成設計驗收紀錄。原始空白表只剩 repo 根 `/Users/crosswang/Downloads/general-decide/shots/CHECK.md`（七列 PASS/FAIL 每格皆空，註明「maker 不自評」）— 文件摘要 |
| **STOP D** | ⚠️ 半達 | 截圖那半 PASS（7 張齊全且是新的）；表格那半沒有。且第 3.3 節要求**獨立 checker 在新對話填**，maker 不自評 |
| 五名退伍者 48px／2 秒文化盲測 | ❌ | 工具已備（`handoff/reference/characters/blind-test.html`，48px、2 秒、5 人、不自動評分），但未執行。`CODEX-HANDOFF.md`：「不能用 AI 模擬回答」；characters/README：「本次沒有代填或模擬人類通過結果」— 誠實，但就是沒做 |
| 黑剪影可辨識度 | ⚠️ | `design/sprites.mjs` 有系統性設計（三人共用格線、表情只換眉嘴、剪影可辨識），但**沒有獨立的剪影驗收證據**，只有設計意圖 |
| iOS 動態字級／實機高對比 | ❌ | CHECK.md 自述「仍待驗證」 |
| `state/*.json` 與現況同步 | ⚠️ | state 停在 **2026-09-11**，之後 4 個 commit（8-bit 角色系統、美術方向、FC/NES 調色盤）與 09-13/09-14 兩輪改版**全部沒反映進去** |
| **STOP 總判定 A∧B∧C∧D∧E** | ❌ 不成立 | A ✅ B ✅ C ✅（推翻文件）D ⚠️ E ❌ |

---

# 風險清單：現在最可能出事的三件事

### 風險 1（最高）— 交付包沒有 `.git`，一次 rsync 就會抹掉 379 KB、15 個檔案，其中 337 KB 不可重建

`decide-codex-handoff/` 確實沒有 `.git`（CODEX-HANDOFF.md 自己也警告了）。repo 有、交付包沒有的 15 個 git 追蹤檔：

- **`docs/research/` 12 份（337 KB）** — dirA/dirB/dirC 各約 30 KB 的方向評估、characters、critique、keyvisual、production、r-cultural、r-store、r-vector、ui。這是「為什麼選方向 C」的**全部依據**。刪掉之後，未來任何人問「為什麼是 8-bit 不是美式卡通」只剩結論沒有論證。研究性產出，重跑成本極高且不會產出相同結果。
- **`design/build8bit.mjs`（13.6 KB）** — 產生 `design/8bit/*.dc.html`（含 271 KB 的 Palette.dc.html）+ `canvas.json` 的**唯一**生成器，也是唯一同時載入 `hwPalettes('nes')` **和** `HW.sms` 的地方（Sega Master System 對照＝ commit 92bddc5 的核心，只存在於這個檔）。交付包的 `export.py` **不是替代品**（只出 PNG/WebP + contact sheet，不產 .dc.html、不產 canvas.json、無 SMS 對照）。
- **`docs/ART-DIRECTION.md`（28 KB）** — 上架五張截圖分鏡、KV 與 App 圖示規格、兩道文化驗收閘門、iOS 觸覺對照表。`DESIGN.md` 只接手了一部分，**上架素材／KV／分鏡／文化閘門沒有任何地方接手**。

**為什麼會出事**：`design/8bit/README.md` 在交付包裡與 repo **位元相同**，第 3、6 行還在指示 `node design/build8bit.mjs` — 而那個檔不在包裡。這已經是既成的斷鏈：交付包裡那 7 個 `.dc.html` 加 `canvas.json`（約 600 KB）現在就是**不可再生的死檔**，README 還在叫人去跑一個不存在的腳本。這是「逐檔取回」時取檔清單漏了 docs 造成的，不是刻意刪除。

**緩解**：開新分支 `feat/8bit-ui-and-assets`，只套 16 個 differing 檔 + 44 個交付包獨有的非 `handoff/` 檔；**那 15 個 repo-only 檔一個都不要動**。`docs/CHARACTER-BRIEF.md` 建議套成 `CHARACTER-BRIEF-8BIT.md`（保留舊的美式卡通 brief 作回退路徑）；`README.md` 建議把交付包版本放進 `CODEX-HANDOFF.md`，README 保留 repo 原版的 `src/` 結構樹與「判定權不在模型手上」那段架構說明 — 那段現在只剩單元測試在守，文字說明會消失。

### 風險 2 — 「全綠」被誤讀成「可上線」，但後端一次都沒真跑過

36 條 e2e 全 mock `/api/order`，smoke 的 Claude 與 Places 都是自建 fake server。**目前沒有任何一條路徑碰過真實 API**。`DEPLOY.md` 自述「api/ 沒有在真的 Vercel 上跑過」。真正上 Vercel 時第一次接觸現實的會是：model id 是否存在（`claude-sonnet-5` 未驗證，DEPLOY.md 已預告可能 404）、Places API (New) 是否已在 GCP 啟用、四層解析對真實 Claude 回應的容錯是否夠。這些全部落在 STOP E，而 STOP E 是 BLOCKED。

再加一層：`tests/e2e/system.spec.ts:8,15` **硬驗** `rgb(23, 24, 19)` 與 `rgb(227, 223, 208)` — 一旦按建議把 NES 色盤灌進 `:root`，這兩條會**立刻紅燈**。也就是說「修 8-bit 最大的缺口」和「保持測試全綠」目前是衝突的，接手的人會在這裡卡住。

### 風險 3 — 檔尾追加覆寫的 CSS 已經產生 4 個看得見但測不到的視覺 bug，而且會繼續長

改版方式是在 19,591 bytes 舊 stylesheet 尾端追加 1,522 bytes 覆寫，用選擇器蓋掉前面剛定義的 token（`:root{--radius:4px}` 出現在 `:root{--radius:20px}` 之後）。已確認的四個 specificity 打架：

1. 首頁主磁貼無硬陰影（0,2,0 壓 0,1,0）
2. 週報頭像仍有卡其方框（0,3,0 壓 0,2,1）
3. **分享輸出 12px 圓角、畫面 2px** — 分享出去的圖不是 8-bit 的，這是唯一會被外人看到的產物
4. 三段火力的 radius/card-edge 被自己壓平

外加兩條死規則：`--shadow` token 已無實際消費者（三個消費點全被覆蓋，且它放在 dark media query 之後的裸 `:root`，深色模式下 `#1B1D1A` 打在 `#171813` 上幾乎看不見）；`.chip[aria-checked="true"]` 是死的（app.tsx 用的是 `aria-pressed`，`aria-checked` 全 repo 0 命中）。

**為什麼危險**：這類 bug typecheck 抓不到、84 項單元測試抓不到、36 條 e2e 也抓不到（e2e 不驗 computed style 的圓角與陰影）。每加一層覆寫就多一個。CODEX-HANDOFF 建議順序第 2 點「清理累加 CSS 時保持最終效果」指的就是這筆債，**應該在灌 NES 色盤之前先還**，否則色彩層會疊在一個已經打架的基底上。

---

# 未推送的工作（交付包有、GitHub main 沒有）

交付包獨有 **163 檔**，另有 **16 個 git 追蹤檔內容不同**。基底確認無誤：`design/8bit/*.dc.html`、`design/hwpalette.mjs`、`design/8bit/ref/` 與 repo HEAD (92bddc5) **位元相同**。

| 群組 | 檔數 | 內容 | 遺失風險 |
|---|---|---|---|
| **角色資產** `public/officers/{0,1,2}/*.{png,webp}` | 30 | 三班長 × 五表情，48×48 NES 無損 | **高** — 已完整驗證的成品，但只存在於這個無 `.git` 的資料夾。可用 `export.py` 重建（前提是 sprites.mjs 那道吸附步驟講清楚，見第 3 節出入 3） |
| **設計預覽入口** `design.html`、`vite.design.config.ts`、`design/{entry.tsx,fixtures.ts,mock-source.ts,themes.css}` | 6 | review harness：monkey-patch fetch 回假資料、URL query `?screen=&theme=&level=&large=1` 切畫面／深淺／32px 大字 | **中** — 這是 `src/app.tsx` 末尾那行 `export { Home, Intake, ... }` 的存在理由。**`package.json` 兩邊完全相同、沒有 `dev:design` script**，目前只能 `--config vite.design.config.ts` 手動跑 |
| **文件** `CODEX-HANDOFF.md`(5.3KB)、`DESIGN.md`(12KB)、`PITFALLS-UI.md`(951B) | 3 | 八條不可推翻規則、UI token 規格、六條踩坑紀錄 | **中** — 純新增，重寫成本高但可重寫 |
| **`design/8bit/export.py`** | 1 | 資產產生器（node 跑 `spriteGrid()` 吐 JSON → PIL 寫 PNG+WebP，同時寫進 out/ 和 repo/，另出 1008×700 contact sheet） | **高** — 30 個資產的唯一已知重建路徑 |
| **16 個 differing 檔** | 16 | `src/styles.css`（全檔重寫 8.4→19.8KB）、`src/app.tsx`(+41/−37)、`src/meme.tsx`(+16/−5)、`src/share.ts`(+23/−1)、`design/sprites.mjs`（骨架重繪）、`design/8bit/normalize.mjs`、`docs/CHARACTER-BRIEF.md`、`README.md`、`shots/*`(8) | **高** — 兩輪 UI 改版的全部成果 |
| **`handoff/` 子樹** | 119 | MANIFEST-SHA256.json、深淺色各 11 張 390×844、contact sheet、blind-test.html、AI 方向參考圖、5 個原始碼快照 | **低**（大量 PNG，可考慮不入 git） |
| 其他 | 4 | `public/design-assets/app-icon-1024.png`、`shots/{02-intake,03-cmd,04-stop}.png`（舊命名殘留，9/13 的 25–29 KB 檔，與現行 7 張套件並存） | **低** — 後三張是孤兒檔，建議刪或補進 spec |

值得注意的**零改動**：`src/avatar.tsx` 兩邊**位元完全相同**（7057 bytes）— 新角色圖是靠它原本就有的 `assetUrl` + `img.onload` 探測機制自動接上的。`api.ts`、`main.tsx`、`officers.ts`、`cards.ts`、`rules.ts`、`diary.ts`、`prompt.ts`、`orderParse.ts`、`places.ts`、`banned.ts`、`types.ts`、`api/order.ts`、`api/weekly.ts`、`tests/` 全 13 檔、`package.json`、`vite.config.ts`、`tsconfig*` 全部未動。**這兩輪是純視覺 + 資產交付，產品邏輯零改動。**

`shots/` 整個目錄在 repo 裡 untracked（`?? shots/`），跑完的新截圖**沒有版本控制基準可 diff**。

---

# 需要使用者本人（agent 做不到的）

### A. 憑證與帳號（擋住 S10 與 STOP E）
1. **`ANTHROPIC_API_KEY`** — 不存在於這台機器。**必要**。
2. **Vercel 帳號登入** — `vercel whoami → token is not valid`；`vercel login` 是互動式帳號認證，agent 不做帳號登入。**必要**。
3. **`GOOGLE_PLACES_KEY` + 到 GCP Console 啟用 Places API (New)** — 可選；沒填也能上線，「吃」「歇」走降級。
4. **確認 `claude-sonnet-5` 這個 model id 在你帳號可用** — 寫在 `api/order.ts` 與 `api/weekly.ts`；若 404 需換成可用 id。

### B. 真人 / 真機
5. **五名當過兵的人做 48px、2 秒文化盲測** — 工具備妥（`handoff/reference/characters/blind-test.html`），閘門標準 ≥3/5 答台灣。**不能用 AI 模擬**。
6. **iPhone 實機驗證** — Dynamic Type、safe-area、`navigator.share`、高對比。
7. **Apple Developer 帳號、簽章、原生 iOS 專案**（若決定上 Capacitor）。

### C. 產品裁決（沒有你點頭工程端不該自己往下走）
8. **超大字級 vs 固定 4:5** — 規格把 4:5 寫成恆等式（`DECIDE-DEV-DOC-v1.md` 第 9 節），實作把它降級成「標準字級下的預設」，大字級時閱讀卡增高以換取不裁切、不縮字。分享輸出不受影響（恆 1080×1350）。二選一：**(a) 批准例外** — 改寫規則 6 並補一條大字級 e2e 斷言，讓例外進契約；**(b) 不批准** — 那就必須在超大字級時另選一種犧牲（縮字 or 卡內捲動／截斷），兩者都違反現有的其他規則。CHECK.md 標「尚未取得例外確認」。
9. **UI 色票是否放行** — 尤其 `--signal` 從「系統錯誤紅」換成「卡通爆炸紅」的語意取代。角色端已裁決（改用 NES 硬體色，`#F83800` 紅哨繩經你確認）；**UI 端從未採用**，AD 建議值在 `styles.css` 0 命中，`--pop` / `--gold2` 不存在，`tokens.json` 不存在。注意改色會直接踩紅 `system.spec.ts:8,15`。
10. **梗圖欄寬** — 明文規則寫 `1fr 38%`，實作是 52%/48%，`meme.tsx:1` 註解還停在「1fr 38%」。要追認還是改回。
11. **步驟卡要不要金色 `▸` + 硬陰影** — 目前 `▸` 仍是橄欖綠，`.steps` 不在硬陰影規則裡。是否算「加梗」違反第 9 節規則 4。
12. **`soft` 接到哪個產品狀態** — AD 3.2 建議「罰則結束、日記空狀態」，但現行 `app.tsx:400` 罰則歸零用 `idle`、`:419` 日記用 `idle`。**先決定語義再改 `Mood` 型別，不要為了用掉資產而亂加**。
13. **要不要上 Capacitor**（＝要不要觸覺回饋）。
14. **臉高比例** — AD 的 68% vs 56.6% 是對 1024×1024 master，實際交付是 48×48（臉 47.9%、含帽 62.5%）。原題已被 48px 方案取代，**沒有任何文件記錄你對此的裁決**。

### D. 流程角色
15. **STOP D 的人工對照要獨立 checker 填** — 第 3.3 節「maker 不自評」。要在新對話／`/clear` 後照第 13.3 節七列表逐格判 PASS/FAIL。**那張表目前在交付包裡已經不存在**，需要從 repo 根 `/Users/crosswang/Downloads/general-decide/shots/CHECK.md` 取回。
16. **口令品質由你人眼迭代** — 第 3.1 節明訂不在契約內。提示詞 `src/prompt.ts`、語料 `src/officers.ts`。
17. **GitHub 同步策略** — 見風險 1 的緩解方案，需要你決定 `handoff/` 那 119 檔要不要入 git。

---

# 建議的接手第一步（優先序）

1. **先開分支保住現狀**：`git checkout -b feat/8bit-ui-and-assets`，套 16 個 differing 檔 + 44 個非 `handoff/` 新檔，**15 個 repo-only 檔一律不動**。
2. **修 `design/8bit/README.md` 的斷鏈**：說明 `.dc.html` 由 `build8bit.mjs` 產、`public/officers/` 由 `export.py` 產，兩者分工；同時交代 `sprites.mjs` 的 `INK` 與交付檔不符（中間有吸附步驟）。
3. **清 CSS 債**：把檔尾 20 行覆寫合併回主體，修掉 4 個 specificity 衝突。**在灌色盤之前做**。
4. **灌 NES 色盤進 `:root`**（`hwpalette.mjs` 的 `toNES()` 現成可用）— 20% 權重、單點最大缺口。同時要改 `system.spec.ts:8,15` 的硬編色斷言。
5. **補 `diary` 畫面的 8-bit**（七＋畫面裡唯一沒改的）。
6. **更新四處過期的 E2E 宣稱**（`CODEX-HANDOFF.md:37`、`README.md:26`、`shots/CHECK.md`、`PITFALLS-UI.md`）— 它們現在是假陰性。
7. **補 `hwPalettes()` 的 `#F83800` 與 `ink`**，讓它能當 CI 白名單用。
8. 憑證到位後才動 S10。

日誌與驗證腳本留在 `/private/tmp/claude-501/-Users-crosswang-Downloads-general-decide/9d8522a3-d3f9-4e48-9aa2-87e20e36e80c/scratchpad/`（`npmci.log`、`typecheck.log`、`tsc-force.log`、`test.log`、`build.log`、`smoke.log`、`e2e.log`、`shots.log`、`pngdec.mjs`、`verify.mjs`、`report.mjs`、`member.mjs`）。