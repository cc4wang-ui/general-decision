小組報告｜整理線

## 結論

基底是 `8daa667`（契約 commit，在設計線 `b7b57f3` 之前），tracked 檔案從 330 減到 326（含本報告）。處置如下：
- 封存 84 個：`git mv` 到 `docs/archive/`，包括舊計畫、2026-09 的設計工作區、研究稿、Round 3–8 紀錄、舊 shots 對照表。
- 刪除 5 個零引用檔：`effort-route.mjs`、兩份 effort json、`public/design-assets/`、`public/icons.svg`。
- live 文件的引用路徑已同步改好。README 最上方加了「開發目標」，並修掉 4 處過時的句子。

衝突清單共 24 條：ROADMAP §5 原有的 11 條，加上新找到的 13 條。

驗證全過：typecheck、lint、單元 1184/1184、build、check:bundle。build 的前端 bundle 是 `index-ScDXdLMo.js`，和正式站 PR-4 的 bundle 同一個 hash，代表 App 行為沒有變。設計線負責的檔案一個都沒碰。

## STOP 自查

| STOP | 結果 | 證據 |
|---|---|---|
| 1 README 最上方一處寫開發目標（一句定位＋北極星＋來源檔） | PASS | `README.md:3–9`「## 開發目標」：定位、北極星 WOO、唯一使用者、試用 2026-11-01～12-30、維持 PWA；來源 `docs/ROADMAP.md` §1、`docs/round3/STRATEGY.md` §1.1／§1.2、ROADMAP §4 Q2 |
| 2 不相干檔案已刪除或封存，每項附零引用證據 | PASS | 見「處置清單」。`git ls-files \| wc -l`：330 → 326 |
| 3 衝突清單：哪兩處矛盾、證據位置、建議；不自行裁決產品決定 | PASS | 見「衝突清單」。產品決定類（#14、#15、#21、#22）只寫建議，沒有改 |
| 8（整理線負責的部分） | PASS（e2e 照分工不跑） | `TZ=Asia/Taipei npm run typecheck` exit 0（先清掉 tsbuildinfo 快取再跑）<br>`TZ=Asia/Taipei npm test`：54 files、1184 passed、exit 0；`TZ=UTC npx vitest run` 也是 1184 passed<br>`npm run build` exit 0，`fetch-public.mjs` 沒有連網（SHA1 全部對上），產出 `dist/assets/index-ScDXdLMo.js`<br>`npm run lint` exit 0<br>`npm run check:bundle`：BUNDLE PASS<br>`npx playwright test --list tests/e2e`：Total 127 tests in 23 files（只列出，沒有執行） |

## 處置清單

判準：live 檔＝`src/ api/ tests/ scripts/ index.html` 與各設定檔（vite、playwright、tsconfig*、eslint、stryker、vercel.json、package.json、`.github/`、`.husky/`、`public/`），再加上現行文件 `README STATE ROADMAP FAILURE-MEMORY adr/ HANDOFF ROUND9–14`。grep 都在基底 `8daa667` 的工作樹上跑；指令是 `rg -l -F <basename> -g '!package-lock.json' .`，再扣掉檔案本身。

### 刪除（5 個；git 歷史可復原：`git checkout 8daa667 -- <path>`）

| 檔案 | 處置 | 理由 | 零引用證據（grep 指令 → 結果） |
|---|---|---|---|
| `scripts/effort-route.mjs`，以及 npm script `route` | 刪除 | Round 3 把開發任務分派給模型 effort 等級的工具，跟產品無關 | `rg -l -F effort-route.mjs` → `docs/round3/DEV-PLAN-3.md`、`README.md`、`state/ROUND3-PROGRESS.md`、`package.json`。只有 package.json 的 `route` 會呼叫它，src／api／tests 0 筆 |
| `docs/round3/effort-tasks.json` | 刪除 | effort-route 的輸入 | `rg -l -F effort-tasks.json` → DEV-PLAN-3、package.json（`route`）、effort-route.mjs，三者都隨本次刪除或屬於歷史 |
| `docs/round3/effort-routing.json` | 刪除 | effort-route 的輸出 | `rg -l -F effort-routing.json` → **0 筆** |
| `public/design-assets/app-icon-1024.png` | 刪除 | 9 月的帽徽圖；manifest、index.html、src 都沒用到 | `rg -l -F app-icon-1024.png` → DEV-PLAN.md、research/handoff-audit.md、DESIGN.md（都已封存）、`scripts/public-manifest.json`（清單本身）。`index.html`、`public/manifest.webmanifest`、src 0 筆 |
| `public/icons.svg` | 刪除 | 沒有任何頁面引用 | `rg -l -F icons.svg` → `docs/round3/CAPACITOR-READY.md`（說明它可排除，已加刪除註記）、`scripts/public-manifest.json` |
| `scripts/public-manifest.json` | 修改 | `tests/unit/public-manifest.test.ts` 要求清單和 `git ls-files public` 一致。改法：先 `git rm`，再跑 `node scripts/fetch-public.mjs --write`（36 檔） | 測試 1184/1184 通過 |

### 封存（`git mv` → `docs/archive/`，共 84 個。規則：根目錄檔 → `docs/archive/<檔名>`；`docs/x` → `docs/archive/x`；`state/x`、`shots/x` → `docs/archive/state/x`、`docs/archive/shots/x`。和設計線的 `docs/archive/officers-8bit/` 用同一套）

| 檔案或目錄 | 處置 | 理由 | 引用與處理 |
|---|---|---|---|
| `CODEX-HANDOFF.md` | 封存 | 2026-09-14 Codex 交接，已被 STATE／HANDOFF 取代 | `rg -l -F CODEX-HANDOFF.md` → DEV-PLAN.md、research/handoff-audit.md，都一起封存 |
| `DEV-PLAN.md`、`DEV-PLAN-2.md` | 封存 | 檔頭已自標「歷史文件」 | 只被 `docs/ROADMAP.md`（:3、:22、§5 表）和彼此引用；ROADMAP 已改路徑 |
| `DEPLOY.md` | 封存 | STATE:24 明寫內容過時 | STATE:5、:24、:45、:72 已改路徑 |
| `DESIGN.md` | 封存 | 2026-09-13 視覺提案 v1。設計線的新文件 `docs/DESIGN-2026-11.md`（`b7b57f3`）明寫「取代 8-bit／NES 那一版」 | live 引用只有 `src/styles.css:1` 的註解（禁改檔）。設計線的 `b7b57f3` 已把這行改成指向 `src/palette.ts`，合併後就沒有引用 |
| `PITFALLS-UI.md` | 封存 | 2026-09 驗證紀錄；現行踩坑紀錄在 `docs/FAILURE-MEMORY.md` | `rg -l -F PITFALLS-UI.md` → DEV-PLAN.md、handoff-audit（已封存）。`src/styles.css:17` 和 DEV-PLAN-3 用裸名「PITFALLS-UI」提到 |
| `decide-mock-v5.html` | 封存 | 9 月畫面基準，已被 8-bit 版和本輪新設計取代 | README:17、`DECIDE-DEV-DOC-v1.md:12,19,121` 已改路徑。`src/avatar.tsx:1`、`tests/shots/shots.spec.ts:1` 是禁改檔，但 `b7b57f3` 已改掉這兩行 |
| `design.html`、`vite.design.config.ts` | 封存 | 設計預覽入口；沒有 npm script、tsconfig、eslint、CI 用到 | `rg -l -F design.html` → DEV-PLAN、vite.design.config.ts、handoff-audit、CODEX-HANDOFF、DESIGN.md，全都已封存 |
| `design/`（47 檔，只留 `design/hwpalette.mjs`） | 封存 → `docs/archive/design/` | 舊 8-bit 角色和 `.dc.html` 畫布工作檔 | `rg -l "design/" tests src scripts api index.html vite.config.ts playwright.config.ts eslint.config.mjs stryker.config.mjs` → 只有 `tests/unit/palette-guard.test.ts`、`tests/e2e/palette.spec.ts`（import `hwpalette.mjs`）、`scripts/build-icons.mjs`、`src/avatar.tsx`（註解）。所以 hwpalette 留在原位，其餘封存。封存的 `sprites.mjs` 原本 import `./hwpalette.mjs`，封存後相對路徑斷了；封存品不執行，可以接受 |
| `docs/research/`（14 檔） | 封存 → `docs/archive/research/` | 9 月美術方向研究稿 | 只被 DEV-PLAN、DEV-PLAN-3 和彼此引用 |
| `docs/ART-DIRECTION.md`、`CHARACTER-BRIEF.md`、`CHARACTER-BRIEF-8BIT.md`、`DESIGN-BRIEF.md` | 封存 | 舊角色／UI 簡報，本輪已被設計線取代 | 只被 DEV-PLAN、research、CODEX-HANDOFF 和彼此引用 |
| `state/ROUND3–8-PROGRESS.md`（6 檔） | 封存 → `docs/archive/state/` | Round 3–8 早已上線，被 ROUND9–14、STATE 取代 | README（6 處）、ROADMAP（約 25 處）、STRATEGY:40、ROUND9:8、HANDOFF:4／:26 已改路徑 |
| `state/decide-mvp-build.md`、`.json` | 封存 → `docs/archive/state/` | STATE:5 明寫是 9 月 MVP 的歷史 | STATE、`DECIDE-DEV-DOC-v1.md:20,95,113,120` 已改路徑 |
| `shots/CHECK.md`、`shots/DESIGN-CHECK.md` | 封存 → `docs/archive/shots/` | 2026-09 七張截圖對 mock-v5 的人工對照表。設計線已把 `shots/*.png` 加進 `.gitignore`，截圖改為產出物，新數量是 11 張 | README:79、`DECIDE-DEV-DOC-v1.md:81` 已改路徑。`tests/shots/shots.spec.ts` 只寫 png，不讀這兩份 md |

### 保留

| 檔案或目錄 | 理由 |
|---|---|
| `src/`（47）、`api/`（6）、`tests/`（unit 56、e2e 24、shots 1）、`index.html` | 現行程式與測試。src 的每個模組至少有 1 個 importer（逐檔 grep `/<name>(.tsx?)?['"]`） |
| 設定：`package*.json`、`tsconfig*.json`（4 份）、`vite.config.ts`、`playwright.config.ts`、`vercel.json`、`eslint.config.mjs`、`stryker.config.mjs`、`.github/`（CI＋PR 範本）、`.husky/`、`.gitignore`、`.env.example` | 現行設定。`tsconfig.node.json` 被 `tsconfig.check.json:13` extends |
| `src/typesafe.ts`、`scripts/taste-judge.mjs` | **不是零引用**：`npm run taste` 會呼叫，typesafe 被 taste-judge import。這是手動跑的口令品味評分工具，要 `TYPESAFE_API_KEY`。和開發目標的關係是弱相關（評估口令品質），列為「待決」，見衝突 #20 |
| `scripts/unpack.mjs`、`fetch-public.mjs`、`public-manifest.json` | **保留，但要決定去留**（衝突 #19）。`unpack.mjs` 是 `postinstall`（`package.json:8`）和 `vercel.json:3` 的 installCommand，沒有 `deploy/` 目錄時直接 exit 0。`fetch-public.mjs` 是 build 第一步：public/ 有缺檔或 SHA1 不符時，會從正式站下載補上。`public-manifest.json` 是它的清單，也是 `tests/unit/public-manifest.test.ts` 的比對對象。這三支都是 Round 4 直傳 Vercel 時代的工具，現在 git 部署用不到。但刪掉要改部署設定（vercel.json），這次不動 |
| `scripts/check-api-bundle.mjs`、`smoke-order.mjs`、`probe-lanes.mjs`、`build-icons.mjs` | npm script 會用到；build-icons 是設計線的 |
| `design/hwpalette.mjs` | 本基底上兩個 palette 測試 import 它。只改了第 110 行註解裡的路徑。⚠️ 設計線 `b7b57f3` 把兩個測試改成 import `src/palette.ts`，build-icons 也不再引用它。兩線合併後它就是零引用，下一輪可以封存 |
| `README.md`、`STATE.md`、`docs/ROADMAP.md`、`docs/FAILURE-MEMORY.md`、`docs/adr/*`（2）、`state/HANDOFF-2026-11-03.md`、`state/ROUND9–14-PROGRESS.md`、`state/evidence/`（20） | 現行文件與證據 |
| `DECIDE-DEV-DOC-v1.md` | 唯一的產品規格，檔頭有 Round 4–10 附註。src 註解用檔名引用它（`types.ts:1`、`prompt.ts:1`、`cards.ts:1`、`officers.ts:1`），ROADMAP §1、ROUND11 也引用 |
| `docs/round3/`（STRATEGY、R1–R3、DEV-PLAN-3、CAPACITOR-READY、STORE-LISTING、W3-HANDOFF） | STRATEGY 是開發目標的來源。STORE-LISTING 被 `tests/unit/store-listing.test.ts`、`manifest.test.ts` 讀取。ROADMAP 的 Later 項目引用 CAPACITOR-READY、R2、R3。src 約 30 處註解用「DEV-PLAN-3 §x」引用 |
| `docs/C3-insignia-research.md` | `src/insignia.ts:5` 引用 |
| `runs/hygiene-ui-1111/contract.md` | 本輪契約 |

## 衝突清單

| # | 矛盾 | 證據位置 | 建議 | 是否已直接修 |
|---|---|---|---|---|
| 1 | （ROADMAP §5-1）README 說「剩兩件事：填 API 金鑰」 | README 已沒有這句 | — | 已不成立 |
| 2 | （§5-2）README 只寫到 Round 3 | `README.md:19–40` 已到 Round 14＋PR #52 | — | 已不成立（本次補了 PR #44–#52 兩列） |
| 3 | （§5-3）卡片數：規格 7 張，程式 8 張 | `DECIDE-DEV-DOC-v1.md:75,135,342,350` 寫 7；`src/cards.ts` 有 8 個 id；規格檔頭 `:4` 已有附註 | 維持附註 | 以附註處理 |
| 4 | （§5-4）e2e 條數多種寫法；新的落差：ROADMAP N7 寫 124，現在是 127 | `docs/ROADMAP.md:117`、`docs/FAILURE-MEMORY.md:32` 寫 124；`npx playwright test --list tests/e2e` → 127 tests in 23 files；`README.md:76` 寫 36（標為 2026-09） | 以 CI 的 e2e job 為唯一來源，文件不寫死條數 | 未修（124 在當時是對的；寫進 STATE 前應由 CI 確認 127 全過） |
| 5 | （§5-5）README 說 `/api/order` 實作在 api/order.ts | `README.md` 結構段已寫 `src/orderHandler.ts` | — | 已不成立 |
| 6 | （§5-6）規格：每日 ≤5 次 Places；程式：上限 40 次 | `DECIDE-DEV-DOC-v1.md:269` 對 `src/places.ts:30`；檔頭 `:6` 已有附註 | 維持附註；N5 等 Cross 決定 | 以附註處理 |
| 7 | （§5-7）STRATEGY 護欄 G3 寫 ≤2 次 | `docs/round3/STRATEGY.md:40` 已加「Round 4 起放寬到 ≤ 4 次」 | — | 已處理 |
| 8 | （§5-8）規格 §6 沒有「先選情境」 | 檔頭 `:5` 有附註 | 維持 | 以附註處理 |
| 9 | （§5-9）規格 §1.2「使用者自建情境 v2 不做」 | `DECIDE-DEV-DOC-v1.md:41` 對檔頭 `:5` | 維持 | 以附註處理 |
| 10 | （§5-10）試用起算日：10-30 決定 vs 11-01 上線 | `docs/ROADMAP.md:5,16,25`；程式 `src/trial.ts:63,79` 用滾動的 60 天，沒有固定起算日 | Cross 確認試用結束日（12-30 或 12-29） | 未修（產品決定）；README 沿用 ROADMAP 的預設並標 ⚠️ |
| 11 | （§5-11）DEV-PLAN.md 寫 S10 ❌ | 檔頭已自標歷史 | — | 已處理（封存） |
| 12 | **新**：ROADMAP §0 說「下一輪先上線 Round 8」，§6 說全部已上線到 PR #52 | `docs/ROADMAP.md:9` 對 `docs/ROADMAP.md:105–156` | 改寫 §0，或標「2026-11-03 寫的」 | 未修（路線判斷文字留給主線／Cross） |
| 13 | **新**：ROADMAP §2 把 Round 7 標為「現況」、Round 8 寫「只在 preview」 | `docs/ROADMAP.md:35–36` 對 `docs/ROADMAP.md:105–156`、`STATE.md:8` | §2 加註「見 §6」或補列 | 未修（檔頭 `:4` 已有「看 §6」的 ⚠️） |
| 14 | **新（產品方向）**：三處寫法不一。ROADMAP §1 和本輪契約的開發目標是「班長替你挑一家店、下令」；ROADMAP §7 把今日行程重定為「一天從當下時間出發，由使用者決定今天想去哪；沒想法時發揮最大創意探索東京」；STATE 通則第一條寫「Product is a real, executable daily itinerary」 | `docs/ROADMAP.md:15` 對 `docs/ROADMAP.md:159`、`STATE.md:28` | Cross 確認兩個入口的主次，以及北極星 WOO（只計口令）要不要也涵蓋今日行程 | **未修（產品決定）**；README 開發目標照契約假設寫，並註明今日行程方向見 §7 |
| 15 | **新（北極星量法）**：WOO 的量法文件寫「伺服器匿名 log＋本機服從率」，試用期預設用 `src/trial.ts` 匯出；但匯出要 Cross 手動按（N4 ⏳），目前沒有任何一週的 WOO 數字 | `docs/ROADMAP.md:24`、`:114`（N4 待 Cross） | Cross 決定量法和匯出時程 | 未修（產品決定） |
| 16 | **新**：STATE 的「Latest release」停在 PR #43（2026-11-10），單元 1050；ROADMAP §6 記到 PR #52，現在單元 1184 | `STATE.md:8` 對 `docs/ROADMAP.md:140–148`、本次 `npm test` 1184 | 主線下次上線時更新 STATE §1 | 部分修：STATE:25 加了本次整理紀錄和實測閘門數字；release 事實沒有代寫 |
| 17 | **新**：README 說 `TZ` 不可省（UTC 會紅），實測 UTC 也全過；CI 也是跑不帶 TZ 的 `npm test` | 原 `README.md:57` 對 `TZ=UTC npx vitest run` → 1184 passed、`.github/workflows/ci.yml:71–72` | 改說明 | **已修**（`README.md:66`） |
| 18 | **新**：README 說 Playwright 設定是 WebKit，實際設定寫死 chromium | 原 `README.md:66` 對 `playwright.config.ts:19`（`browserName: 'chromium'`） | 改說明 | **已修**（`README.md:75`） |
| 19 | **新**：STATE 說絕不直傳 production、走 git 部署；但 install／build 還帶著直傳時代的工具：unpack 在 postinstall 和 installCommand 各跑一次，fetch-public 缺檔時會從正式站下載 public/ | `STATE.md:50`、`state/HANDOFF-2026-11-03.md:8` 對 `package.json:8`、`vercel.json:3`、`scripts/fetch-public.mjs:1–10` | Cross 確認不再直傳後，移除三支並改 vercel.json 和 build script。這會影響部署 | **未修（影響部署）** |
| 20 | **新**：README 說 Jev 選配層「設 TYPESAFE_API_KEY 才會啟用」，聽起來像 App 功能；實際上只有手動跑的 `npm run taste` 會用到，App 不呼叫 | 原 `README.md:41` 對 `rg -n typesafe src api` → 只有 `src/typesafe.ts` 自己 | 決定 taste-judge 要不要留下來當評估工具。不留就刪 `typesafe.ts`、`taste-judge.mjs`、`taste` script | 說明已修（`README.md:50`）；檔案保留待決 |
| 21 | **新**：CI 檔頭寫「草稿，step 2 準備用，未推送」，但 CI 已上線並設為 required check；註解引用的 `IMPROVEMENT-PLAN.md`、`ci-gates/REPORT.md`、`staging/branch-protection-checklist.md`、`AGENTS.md` 都不在 repo | `.github/workflows/ci.yml:1–13` 對 `README.md:37`、`docs/adr/adr-002-ci-gate.md` | 下一次改 CI 時順手更新檔頭；把外部報告的關鍵結論寫進 ADR | 未修（照指示不碰 CI） |
| 22 | **新**：ROADMAP §6／§7 和 ADR-002 有大量證據指向 repo 外的 `~/workspace/...` 路徑，從 repo 無法驗證 | `docs/ROADMAP.md:150,160` 起的「來源」行；`docs/adr/adr-002-ci-gate.md:9–17` | 把要長期保留的報告搬進 `docs/` 或 `state/evidence/`，或標「外部、未入庫」 | 未修 |
| 23 | **新**：HANDOFF 和 ROADMAP 還指向已刪除的 `state/handoff-tools/`（PR #44 `67974f8` 刪掉） | `state/HANDOFF-2026-11-03.md:47`、`docs/ROADMAP.md:46`（N1 做法欄 `r8-check.mjs`） | 從 git 歷史取回，或改指向歷史 | HANDOFF:47 **已加註**；ROADMAP N1 是歷史列，沒改 |
| 24 | **新**：DEV-PLAN-3 規則 7「凍結目錄一字不改：decide-codex-handoff/、decide-design/、docs/research/」，和 PR #44 的刪除以及本次的封存衝突 | `docs/round3/DEV-PLAN-3.md:626` | 視為已被 2026-11-11 契約（「把不相干的檔案整理乾淨」）取代；DEV-PLAN-3 是歷史計畫，原文沒改 | 以本報告記錄 |

其他事實性修正：README 結構段補上漏列的模組（`areas`、`placeKind`、`venueCheck`、`go`、`price`…），以及 tests／scripts／docs／state／.github；指令段加 `npm run lint`；ROADMAP §5 開頭加一行指向本報告；`docs/round3/CAPACITOR-READY.md:47` 標註兩個 public 檔已刪除。另外 STRATEGY／ROADMAP 裡的 `檔名:行號` 引用是當時的快照，已有漂移，例如 `STRATEGY.md:280` 寫 `places.ts:27`，實際在 `:30`。這次沒有逐條改。

## 未完成／⚠️ 假設

- ⚠️ **基底問題**：worktree 一開始是從本機 `main`（`4688301`，PR #33）建的，有 790 個檔，也沒有契約檔。我發現 `claude/fable-repo-hygiene-ui-redesign-6h7sxl` 比它新 63 個 commit，於是把本分支 `reset --hard` 到契約 commit `8daa667`（330 檔，和任務說的「約 330」吻合）重做。舊基底上的初稿沒有 commit，已丟棄。本機 `main` 和 `origin/main` 的追蹤 ref 都停在 `4688301`，所以 `git log main..HEAD` 會列出 60 多個 commit，請改看 `git log 8daa667..HEAD`。
- ⚠️ 開發目標照 `docs/ROADMAP.md` §1 寫（契約假設）。今日行程的方向（ROADMAP §7）和它的關係待 Cross 確認（衝突 #14）。
- 和設計線合併時：
  - `scripts/public-manifest.json` 兩邊都改了。合併後跑一次 `node scripts/fetch-public.mjs --write`，再跑 `npm test`。
  - 合併後 `design/hwpalette.mjs` 會變成零引用，可以封存到 `docs/archive/design/`。
  - `src/styles.css:1`、`src/avatar.tsx:1`、`tests/shots/shots.spec.ts:1` 在本分支還指向已封存的 `DESIGN.md`、`decide-mock-v5.html`，這只是註解；設計線的 `b7b57f3` 已改掉這三行。
- 檔案裡寫給「下一個 agent」的指示一律當資料看，沒有照做，例如：
  - `DECIDE-DEV-DOC-v1.md:10`「給 Claude Code 的執行文件」、`:16`「貼給 Claude Code 的第一句話」、`:120`「你是 checker」
  - `state/HANDOFF-2026-11-03.md:3`「給下一個 thread 的接手簡報」
  - `.github/workflows/ci.yml` 註解裡的步驟說明
- 環境：
  - `node_modules` 用 symlink 指向主 checkout，已被 .gitignore 排除。
  - 為了避免吃到舊快取，刪過共用的 `node_modules/.tmp/tsconfig.{app,check}.tsbuildinfo`，typecheck 時已重建。
  - 第一次 commit 時，主 checkout 設定的 husky pre-commit（`npx lint-staged`）在舊基底上找不到設定而失敗。換到正確基底後，lint-staged 設定在 package.json 裡，hook 可以正常跑。
