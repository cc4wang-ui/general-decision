# 報告班長 · 決斷連

## 開發目標

**班長替你在附近挑一家沒去過、不踩雷的真店，下令，你照做；外加「今日行程」排一天的真地點。**
北極星：**WOO**＝每週回報「完成」的口令數。唯一使用者 Cross，60 天試用（2026-11-01 起算，到 2026-12-30），維持 PWA。

來源：[docs/ROADMAP.md](docs/ROADMAP.md) §1（定位與北極星出自 `docs/round3/STRATEGY.md` §1.1、§1.2；試用日期見 ROADMAP §1 ⚠️；維持 PWA 見 ROADMAP §4 Q2）。⚠️ 試用起算日在文件裡有 10-30／11-01 兩種寫法，這裡沿用 ROADMAP 的預設。今日行程的方向另見 ROADMAP §7（核心迴圈 2.0）。

> **目前狀態以 [STATE.md](STATE.md) 為準**（英文，Verified facts／Open failures）。每輪的細節在 `state/ROUND9`–`ROUND14-PROGRESS.md`（Round 3–8 與舊計畫、舊設計稿已封存在 `docs/archive/`），接手先讀 `state/HANDOFF-2026-11-03.md`，路線圖在 [docs/ROADMAP.md](docs/ROADMAP.md)，踩坑紀錄在 [docs/FAILURE-MEMORY.md](docs/FAILURE-MEMORY.md)。

一個手機 PWA，兩個入口：

- **班長口令**：按一張情境卡（吃、歇、去…），選情境與 0–2 個選項，班長派一家附近真的店、下一道口令。你回報「完成／換一家／沒做」，每道口令寫進新兵日記，週日 20:00 後產出莒光園地週報。
- **今日行程**：排一天的行程（運動、吃飯、咖啡…），每站是 Google 上真的地點，附照片與 Google Maps 步行導航。

規格：[DECIDE-DEV-DOC-v1.md](DECIDE-DEV-DOC-v1.md)（2026-09 的原始規格；Round 4 起的改動見檔頭附註）　舊畫面基準（2026-09，已封存）：[docs/archive/decide-mock-v5.html](docs/archive/decide-mock-v5.html)

## 現在的狀態（2026-11-10）

| 輪 | 內容 | 文件 |
|---|---|---|
| 3 | 店由程式挑、本機記憶、換一家要原因、台幣／日圓預算、同意頁 | `docs/archive/state/ROUND3-PROGRESS.md` |
| 4 | 不空手（超商救援）、不重複、照預算、60 天試用紀錄、量測工具（只在 preview） | `docs/archive/state/ROUND4-PROGRESS.md` |
| 5 | 吃／歇先選情境（5 種＋「其他」）、沒做先問原因 | `docs/archive/state/ROUND5-PROGRESS.md` |
| 6 | 在車上也能用：地下沒定位 → 報站、日文站名查座標、口令從出站寫起 | `docs/archive/state/ROUND6-PROGRESS.md` |
| 7 | 東京的「歇」用日文關鍵字；不派水煙吧、購物中心 | `docs/archive/state/ROUND7-PROGRESS.md` |
| 8 | 歇選咖啡不派卡拉OK、美食街；外帶不派酒吧 | `docs/archive/state/ROUND8-PROGRESS.md` |
| 今日行程 | PR #27–#32（另一條工作線）：真地點、照片、導航、固定行程、單站洗牌 | `STATE.md` |
| 9 | 兩條線合併；修固定行程的時間檢查 | `state/ROUND9-PROGRESS.md` |
| 10 | 路線圖全做：到店要開著、約會與宵夜不派酒吧、其他的需求換日文、「去」卡查真地點、記憶匯出入、今日行程用目前位置… | `state/ROUND10-PROGRESS.md` |
| 11 | 約會步行上限 15 分、Routes 403 記原因（已開通）、分享面板 e2e；PR #34 `945088a`（2026-11-04） | `state/ROUND11-PROGRESS.md` |
| 12 | 已知未修全處理、一次上線；PR #35 `0d88cdb`（2026-11-05） | `state/ROUND12-PROGRESS.md` |
| 13 | 沒評分的店不過評分門檻、朋友聚餐不派購物中心；PR #36 `acfd4d2`（2026-11-05） | `state/ROUND13-PROGRESS.md` |
| 14 | 種類只留類型＋品牌、刪整條店名判斷；PR #38 `766d2f49`（2026-11-09） | `state/ROUND14-PROGRESS.md` |
| 日記時區 | 日記顯示本地時間；PR #39 `8ffcbda2`（2026-11-09） | `src/diary.ts` |
| CI | CI＋分支保護上線（`check`／`e2e`／`required` 為 required check）；PR #40 `02999c9a`（2026-11-09） | `.github/workflows/ci.yml` |
| 步驟 3 設定 | tsconfig／ESLint／Husky／Stryker 設定落地；PR #43 `eca366cc`（2026-11-10） | `eslint.config.mjs`、`stryker.config.mjs` |
| 2026-11-10 其他 | PR #44–#49：衛生清理、ESLint／tsc 修復、Stryker 閾值、ADR-001／002 | `docs/ROADMAP.md` §6、`docs/adr/` |
| 核心迴圈 2.0 | PR #50–#52：今日行程改結構化意圖、部分行程標示、開始時間 | `docs/ROADMAP.md` §7 |

部署：Vercel 接在這個 repo，`main` 一更新就自動部署正式站。測試版在 PR 的分支上自動建。正式站有問題用 Vercel rollback。

## Round 3（2026-10-22）：不再重複推薦、加上價位

- **店由程式決定，班長只負責講**：`src/discovery.ts` 加權抽樣（品質保底＋曝光衰減＋連鎖降權＋偵察），候選池由 `src/lanes.ts` 輪替料理細類擴大，模型再也看不到候選清單。
- **班長記得你**：`src/placeMem.ts` 只在手機存 place_id 與時間戳；「換一家」要報原因（店關了／不想吃這類／不要再來），口令卡印「新據點／第 N 次／偵察任務」。
- **價位**：「吃」多一列預算（每人），依座標自動切台幣／日圓（`src/price.ts`）。
- **上架準備**：同意畫面、隱私頁、檢舉入口、`docs/round3/STORE-LISTING.md`、`CAPACITOR-READY.md`。
- 文件：市場調查與策略 `docs/round3/`（R1–R3、STRATEGY、DEV-PLAN-3）。Jev（TypeSafe）選配層：`src/typesafe.ts`＋`scripts/taste-judge.mjs`（`npm run taste`，手動跑的口令品味評分，設 `TYPESAFE_API_KEY` 才會真的判；App 本身不呼叫）。（`src/jevJudge.ts`、`scripts/effort-route.mjs` 已刪：零引用。）

```bash
npm run replay       # 離線重播：三方針 × 200 種子 × 14 天，新鮮度／品質門檻
npm run probe:lanes  # 需要 GOOGLE_PLACES_KEY：實測每條料理細類 lane 回 200
```

## 指令

```bash
npm run dev        # 本機開發（同時把 api/ 掛成 /api/*，不必 vercel dev）
```

```bash
TZ=Asia/Taipei npm run typecheck && npm run test    # STOP A
```
> 歷史上 `TZ` 不可省（`tests/unit/diary.test.ts` 綁台北時區）；PR #39 起日記改用本地時間，2026-11-11 實測 `TZ=UTC npx vitest run` 也是 1184/1184。CI 跑的是不帶 TZ 的 `npm test`。

```bash
npm run build      # STOP B
```

```bash
npm run e2e        # STOP C：全套 Playwright（條數與結果記在最新的 `state/ROUND*-PROGRESS.md`；CI 的 `e2e` job 每個 PR 都跑）
```
> 設定是 iPhone 13 的尺寸，但 `playwright.config.ts` 寫死 `browserName: 'chromium'`（WebKit 不再是契約）。
> 2026-09-14 那輪 36 條在 WebKit 全過；之後每輪都在 Chromium 跑全套。

```bash
npm run e2e:shots  # STOP D：產 shots/*.png 截圖供人工看版面（2026-09 的舊對照表已封存在 docs/archive/shots/CHECK.md）
```

```bash
npm run lint       # ESLint（src、api、tests/unit），CI 的 check job 也跑；pre-commit 由 Husky＋lint-staged 跑
```

```bash
npm run smoke      # 真 curl 打 /api/order，上游用本機假伺服器頂替
```

```bash
npm run check:bundle  # 在本機重建 Vercel lambda 版面，確認 api/ 真的載得起來
```
> `npm run dev` 與 `npm run smoke` 走 vite 的 `ssrLoadModule`，解析得了 `.ts` specifier，
> 所以本機永遠綠燈、抓不到「上線才會爆」的兩類問題（`src/` 沒進 lambda、`export default` 形狀錯）。
> `check:bundle` 就是補這個缺口的，改 `api/` 或 `vercel.json` 之後一定要跑。

## 結構

```
src/
  app.tsx        單頁狀態機 home→intake→cmd→(log|stand)；diary；weekly
  main.tsx、consent.tsx、privacy.tsx  入口、首次同意頁、隱私頁
  cards.ts       8 張模組卡（第 6 節＋travel）
  officers.ts    3 位班長，語料三層各 24 句（第 7 節）
  banned.ts      護欄字表：罵行為不罵人
  avatar.tsx     SVG 角色（第 14 節資產介面，繪師交件當天可換）
  meme.tsx       梗圖卡（兩欄 grid，角色不壓字）；share.ts 分享圖
  insignia.ts(x) 階級章；streak.ts 出勤連勝／公差假單／升階
  diary.ts       IndexedDB 讀寫、週統計
  api.ts         呼叫 /api/*，錯誤分類
  prompt.ts      系統提示詞
  rules.ts       算得出來的硬規則（attend／sleep／buy／reply）
  orderParse.ts  Claude 回傳的四層解析；template.ts Claude 失敗時的模板口令
  places.ts      Places 過濾與距離、營業時間；PlacePhoto.tsx 地點照片
  placeKind.ts   種類級排除（只看 Google 類型＋品牌，見 docs/adr/adr-001）
  venueCheck.ts  什麼不是可拜訪的店家（車站、地標、商場）；areas.ts 地區偏好
  price.ts、prefs.ts、tz.ts、locale.ts、chains.ts、modeLines.ts  價位、本機偏好、時區、台灣用語、連鎖判定、語料
  go.ts          「去」卡查真地點；geocode.ts 報站查座標
  orderHandler.ts  /api/order 的本體：Places → 挑店 → Claude → Order JSON（Round 4 從 api/order.ts 搬來）
  lanes.ts       查詢規劃（料理細類輪替、放大、超商救援）
  scene.ts       吃／歇的情境規則（排除清單、到店要開著、日文關鍵字）
  discovery.ts   挑店（品質保底＋曝光衰減＋連鎖降權）
  placeMem.ts    手機上的店家記憶（只存 place_id 與時間）
  trial.ts       60 天試用紀錄
  probe.ts       preview 專用的真資料量測；debug.ts 除錯紀錄；report.ts 檢舉
  typesafe.ts    Jev 呼叫（只給 scripts/taste-judge.mjs 用）
  dailyDecision.tsx、dailyRouting.ts  今日行程
api/
  order.ts       薄殼，呼叫 src/orderHandler.ts
  weekly.ts      本週日記 → Claude → WeeklyReport JSON
  geocode.ts     日文站名 → 座標（Round 6）
  probe.ts       量測端點（正式站 404）
  daily-route.ts、place-photo.ts  今日行程的地點與照片
tests/unit/      Vitest；tests/e2e/ Playwright；tests/shots/ 截圖
scripts/         smoke、check:bundle、probe:lanes、build-icons、taste；unpack.mjs／fetch-public.mjs 是直傳 Vercel 時代的 install／build 前置（git 部署時什麼都不做）
design/hwpalette.mjs  NES 色盤（目前 palette 測試的白名單來源）
docs/            ROADMAP、FAILURE-MEMORY、adr/、round3/ 策略與上架文件；docs/archive/ 是歷史文件
state/           HANDOFF、ROUND9–14 進度、evidence/
.github/         CI（check／e2e／required）與 PR 範本
```

金鑰只存在於 `api/`，前端永遠不碰。無 DB、無 cron、無推播。

## 設計上的一個決定

第 6 節那些「算得出來」的規則——attend 的 ★≤2、sleep 的熄燈時間、buy 的 72 小時、reply 永遠 do
——都在伺服器端算好、塞進提示詞，**並在拿回模型的答案後再強制蓋一次**。
模型只負責語氣與內容，判定權不在它手上。單元測試直接驗這些規則。
