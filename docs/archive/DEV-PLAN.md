# 決斷連 · 開發接手計劃

> **歷史文件**（2026-09）。現況表的「S10 部署 ❌、E2E 未過」早已過時；目前狀態看 `STATE.md` 與 `state/HANDOFF-2026-11-03.md`。

> 這份文件自帶全部脈絡。接手的人（Claude Code 或 Codex）不需要讀任何先前對話。
> 撰寫日：2026-09-14。所有「實測」結論都是在 macOS Darwin 25.6.0 (arm64) / Node v24.15.0 / Playwright 1.63.0 這台機器上跑出來的，不是抄文件。

---

## 開場三句話

**這是什麼**：「決斷連」是一個給選擇困難者用的 PWA — 你按一顆按鈕（吃／去／買／歇…共七張模組卡），三位台灣軍教片班長之一（阿良／黑面／老郭）用命令口吻直接幫你決定要做什麼，附可執行步驟與真實店家，做完寫進日記，沒做就罰站倒數，週日出莒光園地週報。React + Vite + TypeScript，後端只有兩支 Vercel Function（`api/order.ts`、`api/weekly.ts`），資料存本機 IndexedDB，無登入無帳號。

**現在到哪**：程式碼會動、測試全綠（84 單元 + 36 E2E + 7 截圖，全部 exit 0）、三位班長的 8-bit 角色圖 30 個檔案已完成且驗證無誤。但**還沒上線**（缺 API 金鑰與 Vercel 帳號）、**後端從沒真的呼叫過 Claude 或 Google Places**（測試全是假上游）、**8-bit 改版只做了造型層沒做色彩層**（完成度約 56%）。最危險的是：所有這些新工作躺在一個**沒有 `.git` 的資料夾**裡。

**接下來要做什麼**：先把那個資料夾安全地接回 GitHub（不能覆蓋遠端），再照階段把「已完成的東西鎖定 → 修看得見的視覺 bug → 補完 8-bit → 真金鑰上線」推完。

---

## 第一件事：把交付包接回 GitHub（最高優先，先做這個再做別的）

### 為什麼這是最高風險

- 交付包 `/Users/crosswang/Downloads/general-decide/decide-codex-handoff` **沒有 `.git`**，裡面有 163 個遠端沒有的檔案 + 16 個內容不同的檔案。
- 交付包**缺** 15 個遠端有的檔案，其中 **`docs/research/` 12 份研究共 337 KB 不可重建** — 那是「為什麼選 8-bit 方向 C 而不是美式卡通」的全部論證。另外 `design/build8bit.mjs`（13.6 KB）是產生 `design/8bit/*.dc.html` 與 `canvas.json` 的**唯一**生成器，也是唯一有 Sega Master System 對照的地方。
- **如果用 `rsync` 或直接複製整個資料夾覆蓋 repo，這 379 KB、15 個檔案會消失。**

所以：**永遠不要整包覆蓋。逐檔搬。**

### 步驟（照著打，一行一個）

**1. 開一個乾淨的工作目錄，clone 最新遠端**

```sh
mkdir -p ~/Downloads/decide-merge && cd ~/Downloads/decide-merge
```

```sh
git clone https://github.com/crosswang-collab/general-decision.git decide && cd decide
```

**2. 確認遠端最新 commit（應該是 `92bddc5`，若不同代表遠端有新工作，先停下來看）**

```sh
git log --oneline -5
```

**3. 開新分支（絕不在 main 上動手）**

```sh
git checkout -b feat/8bit-ui-and-assets
```

**4. 設一個變數指到交付包（後面每一步都用它）**

```sh
export HANDOFF=/Users/crosswang/Downloads/general-decide/decide-codex-handoff
```

**5. 先做一次「不會弄丟什麼」的檢查 — 列出遠端有、交付包沒有的追蹤檔**

```sh
git ls-files | while read f; do [ -f "$HANDOFF/$f" ] || echo "REPO-ONLY: $f"; done
```

> 預期輸出 15 行：`design/build8bit.mjs`、`docs/ART-DIRECTION.md`、`docs/CHARACTER-BRIEF-8BIT.md`、`docs/research/` 底下 12 個檔。**這 15 個檔一個都不要動。**

**6. 搬第一組：4 個 UI 原始碼檔（這是兩輪改版的全部成果）**

```sh
for f in src/styles.css src/app.tsx src/meme.tsx src/share.ts; do cp "$HANDOFF/$f" "$f"; done
```

**7. 搬第二組：2 個設計腳本**

```sh
for f in design/sprites.mjs design/8bit/normalize.mjs; do cp "$HANDOFF/$f" "$f"; done
```

**8. 搬第三組：30 個角色資產（最重要的新交付）**

```sh
mkdir -p public/officers/0 public/officers/1 public/officers/2 && cp -R "$HANDOFF/public/officers/." public/officers/
```

**9. 驗證資產真的搬到了（必須是 30）**

```sh
find public/officers -type f \( -name '*.png' -o -name '*.webp' \) | wc -l
```

**10. 搬第四組：設計預覽入口（6 檔，這是 `src/app.tsx` 末尾那行 `export { Home, Intake, ... }` 的存在理由）**

```sh
cp "$HANDOFF/design.html" . && cp "$HANDOFF/vite.design.config.ts" . && cp "$HANDOFF/design/entry.tsx" "$HANDOFF/design/fixtures.ts" "$HANDOFF/design/mock-source.ts" "$HANDOFF/design/themes.css" design/
```

**11. 搬第五組：資產產生器與 app icon**

```sh
cp "$HANDOFF/design/8bit/export.py" design/8bit/ && mkdir -p public/design-assets && cp "$HANDOFF/public/design-assets/app-icon-1024.png" public/design-assets/
```

**12. 搬第六組：3 份新文件（純新增，不覆蓋任何東西）**

```sh
cp "$HANDOFF/CODEX-HANDOFF.md" "$HANDOFF/DESIGN.md" "$HANDOFF/PITFALLS-UI.md" .
```

**13. 搬角色 brief — 注意改名，不要覆蓋掉舊的美式卡通 brief（那是回退路徑）**

```sh
cp "$HANDOFF/docs/CHARACTER-BRIEF.md" docs/CHARACTER-BRIEF-8BIT.md
```

**14. 搬 7 張新截圖（覆蓋舊的，這是對的 — 它們反映新視覺）**

```sh
for f in 01-home 02-intake-attend 03-cmd-eat 04-cmd-buy 05-log 06-stand 07-weekly; do cp "$HANDOFF/shots/$f.png" "shots/$f.png"; done
```

**15. 明確不搬的東西（列出來，讓你知道這是決定不是遺漏）**

- `shots/CHECK.md` — **不搬**。repo 那份是「第 13.3 節 人工對照表」七列空白 PASS/FAIL，是 STOP 條件 D 要用的正本；交付包那份是另一份設計驗收紀錄，會整份蓋掉它。交付包版本已經在第 12 步以 `DESIGN.md` / `CODEX-HANDOFF.md` 的形式進來了。
- `README.md` — **不搬**。repo 那份有 `src/` 結構樹和「硬規則在伺服器算好、拿回模型答案後再強制蓋一次，判定權不在模型手上」那段架構說明，是全案最重要的設計決定；交付包版本是 Codex 接手指引，內容已被 `CODEX-HANDOFF.md` 涵蓋。
- `shots/02-intake.png`、`03-cmd.png`、`04-stop.png` — **不搬**。9/13 的舊命名孤兒檔（25–29 KB，遠小於新檔的 107–198 KB），不屬於現行七張套件。
- `handoff/` 整個子樹（119 檔，大量 PNG）— **先不搬**，見「需要 Cross 決定的事」第 17 項。
- `dist/`、`test-results/`、`node_modules/` — 已在 `.gitignore`，不入 git。

**16. 看一眼實際改了什麼（這一步一定要看，不要跳過）**

```sh
git status
```

```sh
git diff --stat
```

> 預期：13 個 modified（4 src + 2 design + 7 shots png）、約 44 個 untracked 新檔（30 資產 + 6 預覽入口 + export.py + app-icon + 3 文件 + CHARACTER-BRIEF-8BIT.md）。**如果 `git status` 出現任何 `deleted:`，立刻停下來** — 代表有東西被弄丟了。

**17. 裝依賴、跑全套驗收（合併後第一次，必須全綠才 commit）**

```sh
npm ci
```

```sh
npm run typecheck && npm run test && npm run build
```

```sh
npx playwright install webkit
```

```sh
npm run e2e && npm run e2e:shots
```

**18. 全綠才 commit**

```sh
git add -A && git commit -m "feat: 8-bit 角色資產與 UI 改版整合（來自無 git 交付包）"
```

**19. 推分支，不要碰 main**

```sh
git push -u origin feat/8bit-ui-and-assets
```

**20. 合併後補一個 commit 修斷鏈**（見階段 1）

---

## 現況三分表

判定基準：**✅ = 這台機器上實跑過看到證據**｜**⚠️ = 文件說完成但沒有可執行的驗證，或驗證方式本身是假的**｜**❌ = 明確沒做**

### 產品功能（S1–S10）

| 步 | 內容 | 判定 | 證據 |
|---|---|---|---|
| S1 | 專案骨架 + PWA manifest + .env.example | ✅ | `npm ci` exit 0（107 packages, 0 vulnerabilities）；`npm run typecheck` exit 0 |
| S2 | 七張模組卡 + 三層語料各 ≥20 句 | ✅ | `cards.test.ts`、`officers.test.ts` 綠 |
| S3 | avatar + meme 兩欄 grid | ✅ | `avatar.test.tsx` 綠；`shots/03-cmd-eat.png` 目視兩欄不相交 |
| S4 | 狀態機 + 首頁 + 點名 | ✅ | E2E `happy.spec.ts` 七卡全綠 |
| S5 | `api/order.ts`：Places + Claude + 四層解析 | ⚠️ | 單元測試綠，但**一次都沒真的呼叫過**。`npm run smoke` 的上游是 `scripts/smoke-order.mjs` 自建的假伺服器，金鑰是 `'smoke-test-key'`。`DEPLOY.md` 自述「api/ 沒有在真的 Vercel 上跑過」 |
| S6 | 前端三路 + 罰則倒數 + 錯誤分類 | ✅（UI 層） | `paths.spec.ts` 5 條 + `errors.spec.ts` 5 條綠。**但 E2E 全程 `page.route('**/api/order')` 攔截**，證明的是 UI 與狀態機，不是整合 |
| S7 | 日記 | ✅ | `diary.spec.ts` 5 條綠（含冪等與重整後仍在） |
| S8 | 週報 + 分享 | ✅（前端） | `weekly.spec.ts` 4 條綠。後端同 S5 |
| S9 | 跟隨系統 + clamp + 小螢幕 + 七張截圖 | ✅ | `system.spec.ts` 6 條綠；`npm run e2e:shots` exit 0，7 張 PNG 的 md5 全部改變（真重畫，非沿用舊檔） |
| S10 | 部署上線 | ❌ | 無 `.vercel/`、`.env.example` 仍是 `[FILL_THIS]`、`state/decide-mvp-build.json` 是 `status:"blocked"` |

### 測試

| 命令 | 判定 | 結果 |
|---|---|---|
| `npm ci` | ✅ | exit 0 · 107 packages · 0 vulnerabilities |
| `npm run typecheck` | ✅ | exit 0（另跑 `npx tsc -b --force` 防 incremental 假通過，同樣 0） |
| `npm run test` | ✅ | exit 0 · **7 檔 84 項全過**，0 fail 0 skip |
| `npm run build` | ✅ | exit 0 · 264 kB JS / 18.8 kB CSS · 287ms |
| `npm run e2e` | ✅ | exit 0 · **36 passed (58.3s)**，WebKit（iPhone 13 profile）真的開了頁面 |
| `npm run e2e:shots` | ✅ | exit 0 · **7 passed**，7 張 PNG 全部重畫 |
| `npm run smoke` | ⚠️ | exit 0，回 HTTP 200 + 合法 Order JSON。**但上游是假的** |

> **重要：交付包有四處說 E2E 沒過，全部是錯的。** `CODEX-HANDOFF.md:37`、`README.md:26`、`shots/CHECK.md`、`PITFALLS-UI.md` 都寫「WebKit 在 macOS sandbox 中無法啟動」「不得標記 Playwright E2E PASS」。那是上一輪的**環境問題**，不是程式問題。在這台機器上 36 條全過。**這四處是過期的假陰性，階段 1 要改掉。**

### 8-bit 視覺改版

**先講最關鍵的一件事**：8-bit 這一輪（09-13～09-14）**只動了一個原始碼檔** — `src/styles.css`，而且只是在 19,591 bytes 的舊樣式表**檔尾追加 1,522 bytes（7.8%）覆寫**，內容只有 `border-radius` / `box-shadow` / `border-width` / `border-style`，**一個顏色都沒有**。（`CODEX-HANDOFF.md` 說「UI 主要修改 styles.css、app.tsx、meme.tsx、share.ts」講的是 09-12 那輪軍教片改版，不是 8-bit。）

| 項目 | 判定 | 狀況 |
|---|---|---|
| 01 home | ⚠️ | 方角 ✅、pixel 頭像 ✅，但**主磁貼「吃」沒有硬陰影** — `.tile:first-child{box-shadow:0 4px 0 var(--officer-deep)}`（specificity 0,2,0）壓過 8-bit 的 `.tile{box-shadow:4px 4px 0 var(--ink)}`（0,1,0）。肉眼可見 |
| 02 intake / 03 cmd / 04 cmd-stop / 05 log | ✅ | 方角、3px 框、虛線分隔、硬陰影、圓形遮罩已解除 |
| 06 stand | ✅ | 方格節拍 track（底部 20 個白方塊），8-bit 感最強的一張 |
| 07 weekly | ⚠️ | `.weekly-score` 分隔線仍是**實線**（其他都虛線）；角色仍被裝在**卡其色方框**裡（`.meme.wide .face` 0,3,0 壓過 `.meme .face:has(img)` 0,2,1）— 全 App 唯一還有外框的頭像 |
| 08 diary | ❌ | **幾乎沒改**：`.stat{border-radius:14px}`、`.empty{border-radius:20px}`、`.ent .r{border-radius:5px}` 全部不在覆寫清單內。八個畫面裡唯一沒改的 |
| 分享輸出 1080×1350 | ❌ | `.meme[data-share="true"]{border-radius:calc(var(--radius)*3)}`（0,2,0）贏過 `.meme{border-radius:2px}`（0,1,0）→ **匯出的圖是 12px 圓角，畫面上是 2px。分享出去的圖不是 8-bit 的** — 這是唯一會被外人看到的產物 |
| **UI 色彩換 NES 硬體色** | ❌ | `src/styles.css` 全部 31 個 hex 對 NES 54 色主調色盤**命中 0**。`:root` 仍是軍教片色（`--khaki:#E3DFD0`、`--olive:#4A5733`）。NES 吸附只發生在 `design/hwpalette.mjs`，沒回灌 CSS |
| 繁中像素字體 | ❌ | 無 `@font-face`，仍是 `-apple-system, PingFang TC`。`design/8bit/canvas.json` 的 `note-todo` 自己列為待辦 |
| 三段火力在 8-bit 下 | ⚠️ | `<main data-level>` 有寫進 DOM ✅，但 8-bit 覆寫把三級 `--radius:4px;--card-edge:2px` 打平 → `DESIGN.md` 的「26/20/10px 圓角」**全部失效**，五個維度只剩綠色明暗與字重 |

**加權完成度約 56%**：角色資產 25%×100 + 接入 10%×80 + UI 幾何 25%×75 + UI 色彩 20%×**0** + 像素字 10%×**0** + 三段火力 5%×40 + 視覺回歸 5%×50。

**實際觀感**：一組 NES 原色的 sprite（亮綠 #00A800、橘膚 #FCA044）貼在一組低飽和軍教片 UI（卡其 #E3DFD0、橄欖 #4A5733）上。兩者不像同一個世界。這不是刻意混搭，是改版只做了一半。

### 角色資產

驗證方法：用純 Node 自寫 PNG 解碼器（zlib inflate + unfilter，不經任何影像庫）取 ground truth，再用 chromium canvas `getImageData` 交叉比對。15 張 PNG 的兩種讀值 **byte 完全一致**，證明無色彩管理位移。

| 項目 | 判定 | 證據 |
|---|---|---|
| 30 檔齊全、命名正確 | ✅ | 恰好 30 檔 `{0,1,2}/{idle,bark,praise,punish,soft}.{png,webp}` |
| 48×48 | ✅ | 15 張 PNG 的 IHDR 皆 48×48 / bit depth 8 / colour type 6 / 非交錯 |
| 7–8 個不透明色 | ✅ | 唯一的 7 是 `0/praise`（稱讚時不流汗，少了汗滴色），合理 |
| alpha 只有 0/255 | ✅ | 30 張零個半透明像素 |
| 三人共用膚色 | ✅ | `#FCA044` 與 `#AC7C00` 出現在全部 15 張 |
| 100% 落在 NES 色表 | ✅ | 11 個相異色全在 `hwpalette.mjs` 的 NES 陣列內，非 NES 色 **0** 個 |
| PNG↔WebP 無損一致 | ✅ | 15 對逐像素零差異；chunk 標頭皆 `VP8L`（無損） |
| **soft 接入 App** | ❌ | `src/avatar.tsx:5` 的 `Mood` 只有四種。`grep soft src/ api/ tests/` **0 命中**。檔案已交，型別上無法引用 |

**三個 source-of-truth 已飄移（不影響上述判定，但會咬人）：**

1. `hwPalettes('nes')[2]` 只回 7 色、**沒有 `#F83800`**，但老郭五張全含 10 px 的紅哨繩。**資產對、腳本沒跟上** — 若有 CI 拿 `hwPalettes()` 當白名單，老郭五張會全 fail。
2. `hwPalettes()` 不回傳 `ink`，嚴格比對時阿良／黑面會多出 `#000000` 被誤判。
3. `design/sprites.mjs:25` 是 `const INK = '#16180F'`，但那個色**不在 NES 表、也不存在於任何交付檔**（交付用 `#000000`）→ **`sprites.mjs` 不是這批檔的直接產生器**，中間還有一道吸附步驟。接手的人改 `sprites.mjs` 會發現改不動輸出。

### 部署與上架

| 項目 | 判定 | 說明 |
|---|---|---|
| Vercel 部署 | ❌ | 無 `.vercel/`。`vercel whoami → token is not valid`；`vercel login` 是互動式，agent 不做帳號登入 |
| `ANTHROPIC_API_KEY` | ❌ | 不存在。**必要** |
| `GOOGLE_PLACES_KEY` + GCP 啟用 Places API (New) | ❌ | 不存在。可選 — 沒填也能上線，「吃」「歇」走第 7 節規則 6 降級 |
| model id `claude-sonnet-5` 可用性 | ⚠️ | 未驗證。`DEPLOY.md` 預告若 404 需換成帳號可用的 id |
| Capacitor 原生殼（= 觸覺回饋） | ❌ | `package.json` **0 個** `@capacitor/*`、無 `ios/` 目錄。`navigator.vibrate` 在 iOS Safari 無效，要觸覺就非走 Capacitor 不可 |
| iOS 實機驗證 | ❌ | Dynamic Type、safe-area、`navigator.share`、高對比皆未在實機驗 |
| 五名退伍者文化盲測 | ❌ | 工具已備（`handoff/reference/characters/blind-test.html`，48px、2 秒、5 人），閘門 ≥3/5 答台灣。**不能用 AI 模擬** |
| **STOP 總判定 A∧B∧C∧D∧E** | ❌ | A ✅ B ✅ C ✅（推翻文件）D ⚠️ 半達 E ❌ |

---

## 不可推翻的規則

> 這一段是完整的。新對話沒有上下文，所以全文列出。任何改動如果違反這裡的任何一條，先停下來問 Cross。

### A. 第 9 節 · 畫面與版面八條

| # | 規則 | 具體 |
|---|---|---|
| 1 | **班長永遠在最上面** | home／intake／diary 的 `.officer` 區必須排在 topnav／back 之前。他是說話者，畫面是他的台詞 |
| 2 | **梗圖卡兩欄** | 左欄文字（top/big/bot 上中下），右欄角色 `align-self:end`。**角色不得用絕對定位壓在文字上**（v4 犯過這個錯）。現行實作是 `grid-template-columns: minmax(0,1.1fr) minmax(0,1fr)`（約 52%／48%），與原文寫的 `1fr 38%` 不同 — 見「需要 Cross 決定」第 10 項 |
| 3 | **字級上限** | 梗圖字全部 `clamp()`；超長 big 自動換行 `overflow-wrap:anywhere` |
| 4 | **步驟卡分離** | steps 放在梗圖卡下方的獨立白卡，`▸` 前綴，**無梗、不罵** |
| 5 | **一顆主按鈕** | 每畫面一顆主動詞按鈕在拇指區；「沒做」為 ghost 樣式 |
| 6 | **4:5 可截圖** | cmd／log／stand 卡 `aspect-ratio:4/5`；週報卡自動高度。⚠️ 現行實作在超大系統字級時允許增高 — 見下方「4:5 的爭議」 |
| 7 | **小螢幕** | 高度 < 700px 時首頁三顆小鍵改為一列橫向捲動 |
| 8 | **顏色 token** | 見 mock v5 `:root`，含 dark 版。⚠️ 現行 token 尚未換成 NES 硬體色 |

**9.1 跟隨系統**：`prefers-color-scheme` + `<meta name="color-scheme" content="light dark">`；全 `rem` + `@supports (font:-apple-system-body){html{font:-apple-system-body}}`（iOS Dynamic Type）；`prefers-reduced-motion`；`prefers-contrast: more` → 灰字灰線轉墨色。

**另外兩條來自 `CODEX-HANDOFF.md` 的不可推翻規則**：
- 保留七張模組卡及三位班長，不增不減。
- **無登入、無帳號、無收資料 onboarding；資料本機保存。不要新增多人功能或不必要的後端。**

#### 4:5 的爭議（這條目前是懸案，不要自己決定）

規格第 9 節把 4:5 寫成無條件的 CSS 屬性約束。實作把它降級成「標準字級下的預設比例」：`.meme{aspect-ratio:4/5; grid-template-rows:auto minmax(min-content,1fr)}` 加上 `.screen > *{flex-shrink:0}`，內容的 min-content 高度一旦超過 4:5，卡片就往下長。分享輸出不受影響（`.meme[data-share="true"]` 固定 1080×1350）。

`DESIGN.md` 與 `shots/CHECK.md` 都標明「與無條件固定 4:5 要求有差異，**尚未取得例外確認**」。

**測試盲區**：唯一驗這條的是 `tests/e2e/system.spec.ts:71`，只在預設字級下驗 `toBeCloseTo(1.25, 1)`。全 `tests/` **沒有任何 font-size／zoom／大字級的斷言** → 這個差異永遠不會被自動化抓到。

### B. 第 7 節 · 班長人設與語氣護欄（`api/order.ts` 的系統提示詞）

三種火力，由 `level` 決定：
- **level 0「菜鳥班長 阿良」**：剛下部隊，兇不起來，會結巴、會冒汗、講「你各位」會軟掉。
- **level 1「值星班長 黑面」**：標準值星班長。短句、命令式、動詞開頭。口頭禪：「你各位啊」「一個口令一個動作」「合理的要求是訓練，不合理的要求是磨練」「軍中沒有還好」。
- **level 2「士官長 老郭」**：毒舌、比喻狠、不留情。「我看過的菜鳥比你吃過的饅頭多」「這不叫拖延，這叫菜」。

**【絕對規則】七條，一字不改：**

1. **罵行為，不罵人**：只罵猶豫、拖延、菜、屁股重、賴床。禁止外貌、性別、族群、家庭、健康、性相關詞；禁止髒話。
2. **命令本體零毒性**：`steps` 與 `place` 只放可執行資訊，不放梗、不放罵。毒只放在 `meme.top` 與 `meme.bot`。
3. **log（登記）不罵、不誇**：只描述時間、口令、使用者做了什麼。例：「你去了你不想去的地方，而且準時。」
4. **不解釋、不道歉、不給第二選項**。`verdict='stop'` 時，`steps` 第一條就是替代行為（且只有一個）。
5. **大事**（工作、金錢 >3,000、健康、關係）→ 回 `verdict:'stop'`，`meme.big` = 「大事不受理」，`steps=["去找連長。"]`。
6. **只能推薦 `places` 陣列裡的店**（若有提供）。不得編造店名。`places` 為空 → 依 `promptHint` 用類型代替，並在 `meme.bot` 註明「店家資料暫時拿不到」。
7. **輸出只有 Order JSON**（第 5 節），不加任何前後文、不加 markdown fence。

語料庫三層各 ≥20 句放在 `src/officers.ts`，API 隨機抽 3 句塞進 prompt 作為當次風格樣本，不得整句重複前 5 次用過的。`src/banned.ts` 是護欄不是保證。

**架構上最重要的一條**（來自 repo `README.md`，這段在交付包裡消失了，接回時要保住）：**硬規則在伺服器算好、拿回模型答案後再強制蓋一次，判定權不在模型手上。** 目前只有單元測試在守這條。

### C. 第 14 節 · 頭像資產介面

原文規格：

```
public/officers/{lv}/{mood}.webp   lv = 0|1|2   mood = idle|bark|praise|punish
512×512，透明背景，人物置中偏下（胸像），臉佔畫面 55–65%。
avatar.tsx：若對應 .webp 存在 → <img>；否則 → 內建 SVG。零程式改動。
```

**這條的「零程式改動」已經被驗證為真**：`src/avatar.tsx` 在兩輪改版中**位元組完全沒變**（7057 bytes），新角色圖是靠它原本就有的 `assetUrl` + `img.onload` 探測機制自動接上的。

**但尺寸與 mood 數量已被 8-bit 方向取代**（這是明確的方向變更，不是違規）：
- 實際交付是 **48×48**，不是 512×512。
- 實際交付是 **5 個 mood**（多了 `soft`），但 `Mood` 型別仍是 4 個。
- 臉高：`design/sprites.mjs` 的格線 `G = {SIZE:48, CAP_TOP:5, HEAD_TOP:12, EYE_Y:24, CHIN:34, SHOULDER_Y:38}` → 臉 23/48 ≈ **47.9%**，含帽 30/48 = **62.5%**。與第 14 節的「55–65%」不符（含帽才符合）。**沒有任何文件記錄 Cross 對此裁決過** — 見「需要 Cross 決定」第 14 項。
- `src/avatar.tsx` 的 `<img width={512} height={512}>` 是過期的硬編值（只影響 aspect-ratio 佔位，不致命）。

### D. 8-bit 方向的既定決定

**方向**：C · 8-bit · 玩具電玩感（commit `22ec468`）。Cross 最新明確指定朝向**日式任天堂／紅白機（FC/NES）時代的復古 8-bit 畫風**。

**已鎖定的角色規格**（`CODEX-HANDOFF.md`「角色資產」段）：
- 三位各有 idle / bark / praise / punish / soft，共 15 張 PNG + 15 張無損 WebP。
- 48×48、7–8 個不透明色、alpha 只有 0/255。
- 阿良亮綠、黑面中綠、老郭深綠；**膚色三人共用 `#FCA044`**。
- 帽徽為**金環**，**沒有五角星**。
- 值星帶方向：角色右肩到左腰（畫面左上至右下）。
- **老郭的 `#F83800` 紅哨繩是使用者明確確認的第八色。**
- 所有圖維持可替換接口、`object-fit:contain`、`image-rendering:pixelated`，**不能用圓形遮罩切掉名牌與肩線**。
- 調色盤精確採用 `design/hwpalette.mjs` 的 NES 色表（commit `92bddc5`）。原本的品牌色（卡其 `#F0E4C6`、草綠 `#587631`）FC 與 SMS **兩台機器都畫不出來**，已被否掉。

**已鎖定的介面規格**（`DESIGN.md` 09-14 段，優先於該檔前面所有描述）：
- 介面改用 **2px 方角**（原本的 26/20/10px 圓角表作廢）。
- **硬邊陰影**（取代柔性落地陰影）。
- **虛線分隔**（取代實線 `--line` / `--rule`）。
- **方格節拍**（罰則倒數的節拍格）。
- 三段火力**保留綠色明暗與字重差異**。
- **繁中文字維持系統字**（8-bit 不代表換點陣中文字型 — 像素中文字體是加分項，不是必須）。
- 命令卡**不再用圓形遮罩裁切**透明角色，白名牌、值星帶與肩線完整顯示。
- App 圖示改成**金環像素徽章**，1024×1024、完全不透明、無文字、無五角星。

**授權層級的誠實標註**：`CODEX-HANDOFF.md` 明說「角色／介面一起改是當時未收到範圍問題回答後明示採用的預設方向，**不是使用者另行核准的畫面定稿**」。只有老郭紅哨繩那一項標明「已獲使用者確認」。所以 8-bit 的**方向**是鎖定的，**具體畫面**還沒定稿。

---

## 開發順序

排序原則：**先把已完成的東西驗證鎖定，再往前推。不要一開始就做最難的。**

---

### 階段 0 · 接回 GitHub（約 30 分鐘）

**做什麼**：照上面「第一件事」的 20 步走完。

**完成判定**：
- `git log --oneline -3` 看得到新 commit，且分支是 `feat/8bit-ui-and-assets` 不是 `main`。
- `git ls-files | while read f; do [ -f "$HANDOFF/$f" ] || echo "$f"; done` 仍列出 15 個 repo-only 檔，且它們都還在磁碟上。
- `find public/officers -type f | wc -l` = 30。
- 全套驗收命令全部 exit 0。

**驗收命令**

```sh
git branch --show-current
```

```sh
ls docs/research/ | wc -l
```
> 必須是 12。若不是，`docs/research/` 被弄丟了，回到 clone 重來。

```sh
test -f design/build8bit.mjs && echo "build8bit.mjs 還在" || echo "!!! 弄丟了"
```

```sh
npm ci && npm run typecheck && npm run test && npm run build
```

```sh
npx playwright install webkit && npm run e2e && npm run e2e:shots
```

---

### 階段 1 · 修文件斷鏈與過期宣稱（約 45 分鐘，零風險）

> ✅ **已於 2026-09-16 完成。** 六項全數執行，兩處與計劃描述不符的地方見本節末「執行結果」。
> 本節底下對 `CODEX-HANDOFF.md:37`、`README.md:26`、`shots/CHECK.md`、`PITFALLS-UI.md`、`DEV-PLAN.md:205`
> 「現在寫著假陰性」的敘述，是修改前的狀態，保留供對照。

**做什麼**（純文件，不動程式碼）：

1. **改掉四處過期的 E2E 假陰性**：`CODEX-HANDOFF.md:37`、`README.md:26`、`shots/CHECK.md`、`PITFALLS-UI.md` 第 2 條。改成：「2026-09-11 那輪的 macOS sandbox 阻擋了 WebKit 啟動，那是環境問題不是程式問題。2026-09-14 在 Node v24 / Playwright 1.63.0 環境重跑，`npm run e2e` 36 條與 `npm run e2e:shots` 7 條全部 exit 0。」
2. **修 `design/8bit/README.md` 的斷鏈**：它第 3、6 行叫人跑 `node design/build8bit.mjs`。合併後這個檔案已經在（repo 有），但要補一段講清楚分工：`.dc.html` 畫布與 `canvas.json` 由 `build8bit.mjs` 產（也是唯一有 Sega Master System 對照的地方）；`public/officers/` 的 30 個資產由 `design/8bit/export.py` 產。兩者不互相取代。
3. **標註 `sprites.mjs` 的 INK 落差**：在 `design/sprites.mjs` 檔頭加註解，說明 `INK = '#16180F'` 與交付檔的 `#000000` 不符，中間有一道 `toNES()` 吸附步驟；並寫出「重跑哪個指令能重現這 30 個檔案」的確切命令。
4. **補 `hwPalettes()` 的兩個缺口**：lv2 加上 `#F83800`（紅哨繩），並讓函式一併回傳 `ink`。這樣它才能當 CI 白名單用。
5. **更新 `state/decide-mvp-build.json` / `.md`**：目前停在 2026-09-11，不知道 8-bit 兩輪改版。至少把 STOP 條件 C 的證據來源標成「2026-09-14 重測」。
6. **從 repo 取回第 13.3 節七列人工對照表**：確認 `shots/CHECK.md` 是那張空白 PASS/FAIL 表（七列：01-home … 07-weekly），把交付包的設計驗收紀錄另存為 `shots/DESIGN-CHECK.md`。

**完成判定**：`grep -ri "sandbox" *.md shots/*.md` 不再出現「不得標記 E2E PASS」這類斷言；`node -e "import('./design/hwpalette.mjs').then(m=>console.log(m.hwPalettes('nes')[2]))"` 輸出含 `#F83800` 且含 `ink`。

**驗收命令**

```sh
grep -rn "無法啟動\|不得標記\|未到達網頁" *.md shots/*.md design/8bit/*.md
```
> 應該只剩帶日期限定的歷史敘述，沒有現在式的斷言。

```sh
node -e "import('./design/hwpalette.mjs').then(m=>{const p=m.hwPalettes('nes')[2];console.log(p);if(!Object.values(p).includes('#F83800'))process.exit(1);if(!('ink' in p))process.exit(1)})"
```

```sh
head -12 shots/CHECK.md
```
> 必須看到「第 13.3 節 人工對照表」與七列空白表。

**執行結果（2026-09-16）**

六項都做了。兩處與計劃的描述不符，照實際情況處理：

1. **第 3 項的前提不成立。** 計劃說 `design/sprites.mjs` 寫 `INK = '#16180F'` 與交付檔的 `#000000` 不符。
   實際上 repo 與交付包兩份 `sprites.mjs` 都已經是 `#000000`。`#16180F` 真正的所在是
   `design/8bit/*.dc.html`（`Sprites.dc.html` 有 1957 處）—— 那些是**舊版 sprites.mjs 的建置產物**，
   連帽頂幾何都不同（舊 `x=20 w=8`／現行 `x=22 w=4`）。也就是說工作檔與程式已經走散。
   `public/officers/` 的 30 個正式資產是現行版本，App 顯示的是對的。
   重跑 `build8bit.mjs` 會把五個 `.dc.html` 整批改掉 —— 那是視覺變更，**留給 Cross 決定，這輪沒有重生成**。
   走散的事實與重現命令已寫進 `design/sprites.mjs` 檔頭與 `design/8bit/README.md`。
2. **第 2 項的斷鏈比計劃講的更具體。** `design/8bit/README.md` 叫人跑 `node design/build8bit.mjs`，
   但那支用相對路徑寫 `8bit/*.dc.html`，在 repo 根目錄跑會直接 `ENOENT`。已改成 `cd design && node build8bit.mjs`。

另外多修了計劃沒點到的 `DESIGN.md:130` —— 它帶著同一句過期的 WebKit／sandbox 宣稱。

---

### 階段 2 · 清 CSS 債，修 4 個看得見但測不到的視覺 bug（約 2–3 小時）

> ✅ **已於 2026-09-16 完成，但驗收未收尾。** 四個 bug 與檔尾覆寫區都處理完了，
> 執行結果與**一項無法在這台機器完成的驗收**見本節末。

**為什麼在灌色盤之前做**：目前的改版方式是在 19,591 bytes 舊樣式表尾端追加 1,522 bytes 覆寫，用選擇器蓋掉前面剛定義的 token（`:root{--radius:4px}` 出現在 `:root{--radius:20px}` 之後）。**每加一層覆寫就多一個 specificity 打架。** 色彩層如果疊在一個已經打架的基底上，會更難修。

**做什麼**：把檔尾 20 行覆寫合併回主體，同時修掉這四個確認的 bug：

| # | Bug | 原因 |
|---|---|---|
| 1 | 首頁主磁貼「吃」沒有硬陰影 | `.tile:first-child{box-shadow:0 4px 0 var(--officer-deep)}`（0,2,0）壓過 `.tile{box-shadow:4px 4px 0 var(--ink)}`（0,1,0） |
| 2 | 週報頭像仍被卡其色方框包住 | `.meme.wide .face{background;border}`（0,3,0）壓過 `.meme .face:has(img)`（0,2,1）。這違反「不能用圓形遮罩／外框切掉名牌與肩線」那條規則的精神 |
| 3 | **分享輸出是 12px 圓角、畫面是 2px** | `.meme[data-share="true"]{border-radius:calc(var(--radius)*3)}`（0,2,0）贏過 `.meme{border-radius:2px}`（0,1,0）。**這是唯一會被外人看到的產物** |
| 4 | 三段火力的圓角／邊框被自己壓平 | 檔尾 `main[data-level="0"],[1],[2]{--radius:4px;--card-edge:2px}` 把三級差異抹掉。8-bit 下三段火力要重新定義成什麼（例如邊框 1/2/3px、陰影位移 2/3/4px），需要決定 |

**順便清掉兩條死規則**：`--shadow` token 已無實際消費者（三個消費點全被覆蓋，且它放在 dark media query 之後的裸 `:root`，深色模式下 `#1B1D1A` 打在 `#171813` 上幾乎看不見）；`.chip[aria-checked="true"]` 是死的（`app.tsx` 用的是 `aria-pressed`，`aria-checked` 全 repo 0 命中）。

**完成判定**：
- `src/styles.css` 沒有「檔尾覆寫區塊」，每個 token 只定義一次（dark / `[data-theme]` 分支除外）。
- 七張截圖重出後，01-home 的主磁貼有硬陰影、07-weekly 的頭像無外框。
- 分享輸出的圓角與畫面一致（2px）。
- 84 單元 + 36 E2E 仍全綠。

**驗收命令**

```sh
npm run typecheck && npm run test && npm run build && npm run e2e
```

```sh
npm run e2e:shots && open shots/01-home.png shots/07-weekly.png
```
> 目視：主磁貼有 4px 位移的硬陰影；週報右下角的頭像沒有卡其方框。

```sh
grep -c "border-radius" src/styles.css
```
> 合併後應該比合併前少（重複定義被消掉了）。實測 26 次 → 24 次。

**執行結果（2026-09-16）**

| 完成判定 | 結果 |
|---|---|
| `src/styles.css` 沒有檔尾覆寫區塊，每個 token 只定義一次 | ✅ 21 行覆寫區整個刪掉，全部併回主體。`--radius` 只在 `:root` 定義一次；`--card-edge`／`--hard-shadow` 除了 `:root`（＝lv1 標準值）之外只有 lv0／lv2 的分級與高對比分支 |
| 分享輸出的圓角與畫面一致（2px） | ✅ Chromium 量到 `share=2px screen=2px` |
| 84 單元 + 36 E2E 仍全綠 | ✅ 84/84（`TZ=Asia/Taipei`）、36/36。**零測試斷言變動** |
| 七張截圖重出後目視確認 | ❌ **做不到**：這台容器裝不了 WebKit，無法重出截圖。改以 Chromium 量 computed style 驗證（見下） |

**四個 bug 的實測值**（Chromium／`getComputedStyle`，這幾個屬性引擎無關）：

| Bug | 實測 |
|---|---|
| 1 主磁貼硬陰影 | `rgb(27,29,26) 3px 3px 0px 0px`（原本是 `0 4px 0` 的軟陰影） |
| 2 週報頭像 | `background-color: rgba(0,0,0,0)`、`border-width: 0px` |
| 3 分享輸出圓角 | `2px`，與畫面同值 |
| 4 三段火力 | 邊框 `1px / 2px / 3px`、硬陰影位移 `2 / 3 / 4` |

**兩條死規則**：`--shadow` 已刪（三個消費點改吃 `--hard-shadow`）；`.chip[aria-checked]` 已刪（`app.tsx` 用的是 `aria-pressed`）。

**Bug 4 的決定（Cross 2026-09-16 拍板）**：邊框 1/2/3px ＋ 硬陰影位移 2/3/4px，圓角三級共用 2px。
理由：8-bit 下 2px 已是最小可見單位，圓角再分級看不出來；線的粗細與影子的輕重才撐得出氣壓差。
實作上新增 `--hard-shadow` token，並把元件層從硬編 `border-radius:2px;border-width:2px` **改回吃 token**
——三段火力被抹平的真正原因不只是檔尾那行 `main[data-level]{--radius:4px}`，是元件層根本繞過了 token。

**順手修掉一個自己造成的回歸**：三段火力給了 lv0 1px 的細邊之後，`@media(prefers-contrast:more)` 裡
原本的 `border-width:2px` 會把老郭的 3px 壓回 2px，而 `:root{--card-edge:2px}` 又蓋不到 `main` 內部
（自訂屬性由最近的祖先決定，不是 specificity）。改成高對比時把 lv0 墊到 2px、元件層吃 token，
量到 `2px / 2px / 3px`——下限而不是定值。

**還沒做的一件事**：`shots/*.png` 七張已落後於這次的 CSS 修正，已在 `shots/CHECK.md` 標註。
**在有 WebKit 的機器上跑 `npm run e2e:shots` 重出七張之後，STOP D 的人工對照才有意義。**

---

### 階段 3 · 補完 8-bit 的兩個大缺口（約 4–6 小時）

這是完成度從 56% 拉到 85% 的地方。**兩件事，先做第二件（diary）暖身，再做第一件（色盤）。**

**3a. diary 畫面補 8-bit**（約 1 小時）　✅ **已於 2026-09-16 完成**
八個畫面裡唯一沒改的。`.stat{border-radius:14px}`、`.empty{border-radius:20px}`、`.ent .r{border-radius:5px}` 要進 8-bit 規則；分隔線改虛線；卡片加硬陰影。

> **執行結果**：六處全部改吃階段 2 建立的 token（`--radius` / `--card-edge` / `--hard-shadow`），
> 不再自帶圓角與 1px 細邊。實際走到日記頁用 Chromium 量 computed style，13 項全過。
>
> | 元素 | 改動 |
> |---|---|
> | `.stat` | 方角 2px、邊框吃 token、**補硬陰影**（日記頁唯一的實體卡片） |
> | `.empty` | 方角 2px、邊框吃 token、**維持虛線且刻意不給陰影**——空狀態不是卡片，給它陰影會讀成「這裡有東西」 |
> | `.empty:before` | 筆記本圖示 `border-radius:4px` → `0` |
> | `.ent .r` | 結果標籤方角、邊框吃 token |
> | `.day` | 日期分隔線 solid → **dashed**（與 `.meme .tag`／`.meme .bot` 同一個語彙） |
> | `.notice` | 方角、邊框吃 token、補硬陰影。**計劃沒點到，但它會在日記頁渲染**（`app.tsx:444` 週報失敗時） |
>
> **刻意沒動的三處**（都是跨全部八個畫面的共用外框，不屬於「日記頁補完」）：
> `[data-level="0"] .rank{border-radius:999px}` 與 `[data-level="2"] .rank{border:1px solid}`
> 是三段火力的角色差異、不是漏改；`.officer{border-bottom:1px solid}` 是全域分隔線，
> 改成虛線會動到八個畫面。這三處要不要進 8-bit 語彙，建議跟色盤（3b）一起決定。

**3b. 把 NES 色盤灌進 `src/styles.css` 的 `:root`**（約 3–5 小時，單點最大缺口，20% 權重）　✅ **已於 2026-09-16 完成**
`design/hwpalette.mjs` 的 `toNES()` 現成可用 — 把現有 31 個 hex 逐一吸附到 NES 54 色，再人工調整可讀性（NES 色表的對比不一定夠，深色模式尤其要驗）。

**⚠️ 這一步會踩紅測試，這是預期的**：`tests/e2e/system.spec.ts:8` 與 `:15` **硬驗** `rgb(23, 24, 19)`（`--ink`）與 `rgb(227, 223, 208)`（`--khaki`）。灌色盤這兩條會立刻紅燈。**正確做法是連同這兩條斷言一起改成新色值，不是把色盤改回去遷就測試。**

**⚠️ 這一步需要 Cross 點頭**：`--signal` 從「系統錯誤紅」`#B3261E` 換成 NES 的「卡通爆炸紅」`#F83800` 是語意取代，不是純視覺調整。見「需要 Cross 決定」第 9 項。

**完成判定**：
- `src/styles.css` 的每個 hex 都能在 `hwpalette.mjs` 的 NES 陣列裡找到（或明確標註為刻意例外並寫理由）。
- 深淺色兩種模式下，七＋畫面都通過 WCAG AA 對比（正文 4.5:1）。
- `system.spec.ts` 的硬編色斷言已更新，36 條 E2E 回到全綠。
- diary 畫面的截圖與其他七張視覺一致。

**驗收命令**

```sh
node -e "const css=require('fs').readFileSync('src/styles.css','utf8');const hex=[...new Set(css.match(/#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])/g)||[])];const alpha=[...new Set(css.match(/#[0-9A-Fa-f]{8}/g)||[])];import('./design/hwpalette.mjs').then(m=>{const nes=new Set(m.nesPalette().map(c=>c.toUpperCase()));const bad=hex.filter(h=>!nes.has(h.toUpperCase()));const badA=alpha.filter(h=>!nes.has(h.slice(0,7).toUpperCase()));console.log('不透明',hex.length,'色，非NES',bad.length,bad);console.log('半透明',alpha.length,'色，底色非NES',badA.length,badA);process.exit(bad.length+badA.length?1:0)})"
```
> ⚠️ 原本這行讀 `m.HW.nes.NES` —— **那個屬性不存在**（export 的是 `nesPalette()`），會拿到 `undefined` 然後 crash。
> 已修正，並補上兩件原版漏掉的事：`#RRGGBBAA` 八位色也要驗底色，而 `{6}` 沒有負向界定會把八位色的前六位誤判成獨立色。
> 實測輸出：`不透明 14 色，非NES 0` ／ `半透明 5 色，底色非NES 0`。

```sh
TZ=Asia/Taipei npm run typecheck && npm run test && npm run build && npm run e2e && npm run e2e:shots
```

**執行結果（2026-09-16）**

**⚠️ 計劃指定的做法是錯的，沒有照做。** 計劃說「把現有 31 個 hex 逐一吸附到 NES 54 色」。
實跑 `toNES()` 的結果：阿良的軍綠 `#68764B` → `#787878`（純灰）、黑面 `#4A5733` → `#503000`（棕）、
老郭 `#303B27` → `#503000`（**與黑面撞成同一色**）。NES 沒有中低飽和度的橄欖綠，最近鄰是棕與灰。
次要文字對比還會從 4.42 **倒退**到 3.02。

而 `design/hwpalette.mjs` 檔頭早就寫過正確方法：「品牌色不盲目吸附……是從硬體調色盤裡**挑一格**，
標準是保住色相身分。」角色美術當初就是這樣做的。**照既有原則走，改用挑格，並與角色共用同一組。**

| 完成判定 | 結果 |
|---|---|
| 每個 hex 都能在 NES 陣列裡找到 | ✅ 不透明 14 色、半透明 5 色，全部 NES 合法，0 例外 |
| 深淺兩模式都通過 WCAG AA | ✅ 在瀏覽器裡量渲染後的實際值，深淺各 14 項、共 28 項全過 |
| `system.spec.ts` 硬編色斷言已更新，36 條回綠 | ✅ 兩條改成新色值，36/36 |
| diary 截圖與其他七張一致 | ❌ **做不到**：這台容器裝不了 WebKit，無法重出截圖 |

**Cross 的兩個拍板（2026-09-16）**

- **A1**：`--signal` 用 NES 的爆炸紅 `#F83800`。但它配白字只有 3.68 過不了 AA，所以**紅底文字一律翻黑**。
  實作上是在 `.meme.red` 重新定義 `--memeText` 與 `--rule`，讓卡片裡所有吃這兩個 token 的東西自動連動——
  逐條列舉遲早會漏一條，變成白字打在亮紅上。日記的「沒做」標籤同樣吃 `--signal`，一併翻黑。
  新增 token `--on-signal`，深淺共用 `#000000`。
- **B1**：三段火力的綠改成 `#007800 / #006800 / #005800`，灰階差從 29.9/25.6 縮到 9.4/9.4。
  NES 只有五格可用暗綠，能拉開差距的那幾格白字都破 AA。窄梯度可接受，因為階段 2 已經把梯度做在
  幾何上：邊框 1/2/3px、硬陰影 2/3/4px、字重 750/850/950，加上綠的深淺共四個維度。

**順帶清掉的**

- 死 token `--olive2` 與 `--white`：全 repo 0 個消費點（與階段 2 的 `--shadow` 同一類）。
- 深色模式的 `main[data-level]` officer 覆寫整組刪掉——梗圖卡是飽和色塊，不像頁面底色需要調暗，
  深淺共用同一組梯度，`--officer-green`／`--officer-deep` 因此每個只定義一次。
- `--signal`／`--gold`／`--memeText` 深淺共用：NES 只有一格爆炸紅、一格金、一格白。

**一處計算出來的修正**：深色框線原本要用 `#7C7C7C`，但它在 `#503000` 卡片上只有 2.85（需 3）。
改用 `#AC7C00`（3.20），那一格本來就在角色色盤裡（`skinDark`）。

---

### 階段 4 · 真金鑰、真上游、真部署（約 2 小時，但被 Cross 卡住）

**前提**：`ANTHROPIC_API_KEY` 與 Vercel 登入到位（見下一節）。

**做什麼**：
1. `.env.local` 填真金鑰（**只在伺服器端，絕不進前端 bundle**）。
2. 本機用真金鑰打一次 `/api/order`，確認四層解析對真實 Claude 回應的容錯夠。**這是後端第一次接觸現實。**
3. 驗證 model id `claude-sonnet-5` 在該帳號可用（若 404，換成可用 id，同時改 `api/order.ts` 與 `api/weekly.ts`）。
4. `vercel --prod` 部署，Environment Variables 設 Production。
5. `curl` 線上網址回 200，`/api/order` 回合法 Order JSON。
6. iPhone Safari 開網址 → 分享 → 加入主畫面 → 允許定位。

**完成判定（= 第 15 節驗收 + STOP 條件 E）**：按「吃」→ 出現**真實店名** → 按「報告班長，完成」→ 日記有一筆。**三個動作都成立才算上線。**

**驗收命令**

```sh
npm run smoke
```
> 這只驗假上游，是 sanity check 不是真驗收。

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://你的部署網址.vercel.app
```

```sh
curl -s -X POST https://你的部署網址.vercel.app/api/order -H 'content-type: application/json' -d '{"card":"eat","level":1}' | head -c 400
```
> 必須是合法 Order JSON，且 `place.name` 是真實店名不是類型代稱。

---

### 階段 5 · 人工驗收與文化閘門（時間取決於 Cross，1 天內可完成）

**做什麼**：
1. **STOP 條件 D**：獨立 checker 在**新對話**（`/clear` 後）照第 13.3 節七列表逐格判 PASS/FAIL 填進 `shots/CHECK.md`。第 3.3 節明訂 **maker 不自評**，所以做開發的那個對話不能填這張表。
2. **五名退伍者盲測**：`handoff/reference/characters/blind-test.html`，48px、2 秒、5 人，≥3/5 答台灣才算過。**不能用 AI 模擬回答。**
3. **iPhone 實機驗證**：Dynamic Type（含最大字級）、`env(safe-area-inset-*)`、`navigator.share` 原生分享、高對比模式。
4. **補一條大字級的 E2E 斷言**（不論 4:5 那條怎麼裁決都要補）— 目前 `tests/` 完全沒有 font-size / zoom 相關斷言，這個盲區必須關掉。

**完成判定**：`shots/CHECK.md` 七格全部有 PASS/FAIL 且沒有空格；盲測結果有實際人數記錄。

**驗收命令**

```sh
grep -c "PASS\|FAIL" shots/CHECK.md
```
> 至少 7。

```sh
open handoff/reference/characters/blind-test.html
```

---

### 階段 6 · Capacitor 原生殼與上架（只在 Cross 決定要做時才開始，1–2 週）

**前提**：Cross 決定要觸覺回饋（`navigator.vibrate` 在 iOS Safari 無效，要觸覺就非走 Capacitor 不可）+ Apple Developer 帳號。

**做什麼**：Capacitor 整合、觸覺對照表串接（規格在 `DESIGN.md`，目前整欄標「尚待串接」）、safe area、App 圖示與啟動畫面、iOS 實機驗收、上架五張截圖分鏡（規格在 `docs/ART-DIRECTION.md`，這份文件**只存在於 repo，不在交付包裡**，接回後才拿得到）。

**完成判定**：iOS 實機安裝可跑完七卡；上架素材齊全。

---

## 需要 Cross 本人的事

### A. 憑證與帳號（擋住階段 4，全案唯一的硬阻塞）

| # | 缺什麼 | 去哪拿 | 大概多久 | 必要性 |
|---|---|---|---|---|
| 1 | **`ANTHROPIC_API_KEY`** | console.anthropic.com → API Keys | 5 分鐘 | **必要** |
| 2 | **Vercel 帳號登入** | 終端機跑 `vercel login`（互動式，agent 做不到） | 5 分鐘 | **必要** |
| 3 | `GOOGLE_PLACES_KEY` + 到 GCP Console **啟用 Places API (New)** | console.cloud.google.com。Key 限制設 API restrictions = Places API (New)、Application restrictions = None | 20 分鐘 | 可選 — 沒填也能上線，「吃」「歇」走降級用類型代替店名 |
| 4 | 確認 `claude-sonnet-5` 這個 model id 在你帳號可用 | 打一次 API 看有沒有 404 | 2 分鐘 | 必要（若 404 要換 id） |

> 費用參考：Places Nearby Search Enterprise 免費 1,000 次/月，單人每日 ≤5 次 = 150 次/月，安全。

### B. 真人與真機（agent 做不到）

| # | 事 | 大概多久 |
|---|---|---|
| 5 | **五名當過兵的人**做 48px、2 秒文化辨識盲測，≥3/5 答台灣。工具已備 `handoff/reference/characters/blind-test.html`。**不能用 AI 模擬** | 半天（找人） |
| 6 | **iPhone 實機驗證**：Dynamic Type、safe-area、`navigator.share`、高對比 | 30 分鐘 |
| 7 | **Apple Developer 帳號、簽章、憑證**（只在決定做 Capacitor 時） | 1–3 天（審核） |

### C. 產品裁決（沒有你點頭，工程端不該自己往下走）

| # | 要決定什麼 | 為什麼卡住 |
|---|---|---|
| 8 | **超大字級 vs 固定 4:5** | 二選一。**(a) 批准例外** → 把第 9 節規則 6 改寫成「標準字級 4:5；系統超大字級時閱讀卡可增高；分享輸出恆 1080×1350」並補一條大字級 E2E 斷言，讓例外進契約。**(b) 不批准** → 那就必須在超大字級時另選一種犧牲：縮字（違反「不把使用者指定的大字縮回去」與第 9.1 節跟隨系統字級）或卡內捲動／截斷（違反「不裁切」）。目前 `CHECK.md` 標「尚未取得例外確認」 |
| 9 | **UI 色票是否換成 NES 硬體色** | 這是階段 3b 的前提。尤其 `--signal` 從系統錯誤紅 `#B3261E` 換成 NES 卡通爆炸紅 `#F83800` 是**語意取代**。注意：改色會直接踩紅 `system.spec.ts:8,15` 的硬編斷言（那是預期的，要一起改） |
| 10 | **梗圖欄寬追認** | 明文規則寫 `1fr 38%`，實作是 52%／48%，`src/meme.tsx:1` 的註解還停在「1fr 38%」。要追認實作，還是改回規格？ |
| 11 | **步驟卡要不要金色 `▸` + 硬陰影** | 目前 `▸` 仍是橄欖綠，`.steps` 不在硬陰影規則裡。美術方向提案要改成金色，但第 9 節規則 4 說步驟卡「無梗」— 金色算不算加梗？ |
| 12 | **`soft` 表情接到哪個產品狀態** | 6 個檔案已交但型別上無法引用。美術方向建議「罰則結束、日記空狀態」，但現行 `app.tsx:400` 罰則歸零用 `idle`、`:419` 日記用 `idle`。**先決定語義再改 `Mood` 型別，不要為了用掉資產而亂加** |
| 13 | **要不要上 Capacitor**（= 要不要觸覺回饋） | 決定階段 6 做不做。不做就永遠是 PWA，沒有觸覺 |
| 14 | **臉高比例** | 原規格是 512×512 下臉佔 55–65%，實際交付是 48×48 下臉 47.9%（含帽 62.5%）。原題已被 48px 方案取代，**沒有任何文件記錄你對此裁決過** |

### D. 流程與其他

| # | 事 |
|---|---|
| 15 | **STOP 條件 D 要獨立 checker 填** — 第 3.3 節「maker 不自評」。要在新對話／`/clear` 後照第 13.3 節七列表逐格判 PASS/FAIL |
| 16 | **口令品質由你人眼迭代** — 第 3.1 節明訂不在契約內：「品質判準在 Cross 腦裡」。提示詞在 `src/prompt.ts`，語料在 `src/officers.ts` |
| 17 | **`handoff/` 那 119 個檔要不要入 git** — 大量 PNG（深淺色各 11 張 390×844、contact sheet、blind-test.html、AI 方向參考圖、5 個原始碼快照）。入 git 會讓 repo 變大；不入就只存在本機。建議不入 git，但備份到雲端 |

---

## 給新對話的第一則訊息

> 以下整段可以直接複製貼上到一個全新的 Claude Code 或 Codex 對話。

```
我要你接手一個叫「決斷連」的專案。你沒有任何先前對話的上下文，所以先讀檔案。

## 這是什麼
給選擇困難者用的 PWA。按一顆按鈕（吃／去／買／歇…七張模組卡），三位台灣軍教片
班長之一（阿良／黑面／老郭）用命令口吻幫你決定要做什麼，附可執行步驟與真實店家，
做完寫進日記，沒做就罰站倒數，週日出週報。
React 19 + Vite + TypeScript，後端只有兩支 Vercel Function，資料存本機 IndexedDB，
無登入無帳號。

## 先讀這些檔案（照順序，不要跳）
1. /Users/crosswang/Downloads/general-decide/DECIDE-DEV-DOC-v1.md
   ← 產品規格正本。第 5 節資料模型、第 7 節班長人設與語氣護欄、第 9 節版面八條、
     第 12 節 S1–S10、第 13 節測試、第 14 節資產介面。這份是最高權威。
2. /Users/crosswang/Downloads/general-decide/decide-codex-handoff/CODEX-HANDOFF.md
   ← 八條不可推翻的規則 + 角色資產規格 + 驗證邊界。
3. /Users/crosswang/Downloads/general-decide/decide-codex-handoff/DESIGN.md
   ← UI 規格。注意：末段「## 日式 8-bit 方向更新（2026-09-14）」優先於這份檔案
     前面所有描述（前面是舊的軍教片寫實方向）。
4. /Users/crosswang/Downloads/general-decide/decide-codex-handoff/PITFALLS-UI.md
   ← 六條踩坑紀錄。
5. /Users/crosswang/Downloads/general-decide/docs/ART-DIRECTION.md
   ← 美術方向。這份只在 repo 有，交付包裡沒有。

## 三個已知的文件錯誤，不要被誤導
1. 有四處文件說「Playwright WebKit 無法啟動、E2E 未通過、不得標記 E2E PASS」
   （CODEX-HANDOFF.md:37、README.md:26、shots/CHECK.md、PITFALLS-UI.md 第 2 條）。
   這是 2026-09-11 那輪的 macOS sandbox 環境問題，不是程式問題。
   2026-09-14 重跑：npm run e2e 36 條全過、npm run e2e:shots 7 條全過，都是 exit 0。
2. CODEX-HANDOFF.md 說「UI 主要修改 styles.css、app.tsx、meme.tsx、share.ts」—
   那是 09-12 軍教片改版那輪。8-bit 這輪（09-13～09-14）只動了 src/styles.css，
   而且只在檔尾追加 1,522 bytes 的覆寫（占全檔 7.8%），內容只有圓角／陰影／邊框，
   一個顏色都沒有。
3. design/sprites.mjs 的 INK = '#16180F' 與交付的 30 個資產（用 #000000）不符。
   sprites.mjs 不是這批檔的直接產生器，中間還有一道 toNES() 吸附步驟。
   改 sprites.mjs 不會改到輸出。

## 你的第一個任務（只做這一件，做完停下來回報）
把 /Users/crosswang/Downloads/general-decide/decide-codex-handoff 這個「沒有 .git」的
交付包安全地接回 GitHub。

規則：
- 遠端是 https://github.com/crosswang-collab/general-decision.git，最新 commit 92bddc5。
- 先 clone 到一個全新的空目錄，開新分支 feat/8bit-ui-and-assets。絕不在 main 上動手。
- 絕不 rsync、絕不整包覆蓋。逐檔搬。
- 有 15 個檔案遠端有、交付包沒有（docs/research/ 12 份共 337KB 的方向研究、
  design/build8bit.mjs、docs/ART-DIRECTION.md、docs/CHARACTER-BRIEF-8BIT.md）。
  這 15 個一個都不要動。搬完要驗證它們還在。
- 要搬的東西：
  * src/styles.css、src/app.tsx、src/meme.tsx、src/share.ts
  * design/sprites.mjs、design/8bit/normalize.mjs
  * public/officers/ 全部 30 個檔（三班長 × 五表情 × PNG+WebP）
  * design.html、vite.design.config.ts、design/{entry.tsx,fixtures.ts,mock-source.ts,themes.css}
  * design/8bit/export.py、public/design-assets/app-icon-1024.png
  * CODEX-HANDOFF.md、DESIGN.md、PITFALLS-UI.md
  * docs/CHARACTER-BRIEF.md → 改名存成 docs/CHARACTER-BRIEF-8BIT.md（不要覆蓋舊 brief）
  * shots/{01-home,02-intake-attend,03-cmd-eat,04-cmd-buy,05-log,06-stand,07-weekly}.png
- 明確不要搬：
  * shots/CHECK.md（repo 那份是 STOP 條件 D 要用的七列空白對照表，交付包那份會整份蓋掉它）
  * README.md（repo 那份有 src/ 結構樹與「判定權不在模型手上」的架構說明，要保住）
  * shots/{02-intake,03-cmd,04-stop}.png（9/13 的舊命名孤兒檔）
  * handoff/ 整個子樹（119 檔大量 PNG，等 Cross 決定要不要入 git）

搬完的驗收（全部要 exit 0 才 commit）：
  npm ci
  npm run typecheck && npm run test && npm run build
  npx playwright install webkit
  npm run e2e && npm run e2e:shots

預期結果：84 單元測試全過、36 E2E 全過、7 張截圖產出、find public/officers -type f | wc -l = 30、
ls docs/research/ | wc -l = 12。

如果 git status 出現任何 deleted:，立刻停下來回報，不要 commit。

## 絕對不要做的事
- 不要改 src/avatar.tsx 的 Mood 型別去加 soft。soft 的 6 個檔案已交但還沒決定要接到
  哪個產品狀態，這需要 Cross 裁決。
- 不要改 UI 色票（--khaki #E3DFD0、--olive #4A5733 等）。換成 NES 硬體色是計劃中的
  階段 3，但需要 Cross 先點頭，而且會踩紅 tests/e2e/system.spec.ts:8,15 的硬編色斷言。
- 不要新增登入、帳號、多人功能或任何後端。資料本機保存。
- 不要動語氣護欄（DECIDE-DEV-DOC-v1.md 第 7 節那七條絕對規則）。
- 不要為了讓測試變綠而改測試斷言，除非那是計劃中明確要一起改的。

做完第一個任務後回報 git status 與五個驗收命令的實際輸出，然後等我下一步指示。
```

---

## 附錄：三個最可能出事的地方

**1. 一次 rsync 抹掉 379 KB 不可重建的研究。** `docs/research/` 12 份（337 KB）是「為什麼選 8-bit 方向 C 而不是美式卡通」的全部論證 — 刪掉之後只剩結論沒有論證，重跑成本極高且不會產出相同結果。`design/build8bit.mjs`（13.6 KB）是產生 7 個 `.dc.html` 畫布（含 271 KB 的 Palette.dc.html）與 `canvas.json` 的**唯一**生成器，也是唯一有 Sega Master System 對照的地方；交付包的 `export.py` **不是替代品**（只出 PNG/WebP 與 contact sheet）。目前 `design/8bit/README.md` 還在叫人跑一個交付包裡不存在的腳本 — 這已經是既成的斷鏈。

**2. 「全綠」被誤讀成「可上線」。** 36 條 E2E 全程 mock `/api/order`，smoke 的 Claude 與 Places 都是自建假伺服器。**目前沒有任何一條路徑碰過真實 API。** 真正上 Vercel 時第一次接觸現實的會是：model id 是否存在、Places API (New) 是否已在 GCP 啟用、四層解析對真實 Claude 回應的容錯是否夠。這些全部落在 STOP 條件 E，而 E 是 BLOCKED。

**3. 檔尾追加覆寫的 CSS 會繼續長出看不見的 bug。** 已確認四個 specificity 打架（主磁貼無陰影／週報頭像有框／分享輸出圓角不一致／三段火力被壓平），全部是 typecheck 抓不到、84 單元測試抓不到、36 條 E2E 也抓不到的那種。每加一層覆寫就多一個。這筆債要在灌色盤**之前**還掉。