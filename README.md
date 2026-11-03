# 報告班長 · 決斷連

> **目前狀態以 [STATE.md](STATE.md) 為準**（英文，Verified facts／Open failures）。每輪的細節在 `state/ROUND*-PROGRESS.md`，接手先讀 `state/HANDOFF-2026-11-03.md`，路線圖在 [docs/ROADMAP.md](docs/ROADMAP.md)，踩坑紀錄在 [docs/FAILURE-MEMORY.md](docs/FAILURE-MEMORY.md)。

一個手機 PWA，兩個入口：

- **班長口令**：按一張情境卡（吃、歇、去…），選情境與 0–2 個選項，班長派一家附近真的店、下一道口令。你回報「完成／換一家／沒做」，每道口令寫進新兵日記，週日 20:00 後產出莒光園地週報。
- **今日行程**：排一天的行程（運動、吃飯、咖啡…），每站是 Google 上真的地點，附照片與 Google Maps 步行導航。

規格：[DECIDE-DEV-DOC-v1.md](DECIDE-DEV-DOC-v1.md)（2026-09 的原始規格；Round 4 起的改動見檔頭附註）　畫面基準：[decide-mock-v5.html](decide-mock-v5.html)

## 現在的狀態（2026-11-04）

| 輪 | 內容 | 文件 |
|---|---|---|
| 3 | 店由程式挑、本機記憶、換一家要原因、台幣／日圓預算、同意頁 | `state/ROUND3-PROGRESS.md` |
| 4 | 不空手（超商救援）、不重複、照預算、60 天試用紀錄、量測工具（只在 preview） | `state/ROUND4-PROGRESS.md` |
| 5 | 吃／歇先選情境（5 種＋「其他」）、沒做先問原因 | `state/ROUND5-PROGRESS.md` |
| 6 | 在車上也能用：地下沒定位 → 報站、日文站名查座標、口令從出站寫起 | `state/ROUND6-PROGRESS.md` |
| 7 | 東京的「歇」用日文關鍵字；不派水煙吧、購物中心 | `state/ROUND7-PROGRESS.md` |
| 8 | 歇選咖啡不派卡拉OK、美食街；外帶不派酒吧 | `state/ROUND8-PROGRESS.md` |
| 今日行程 | PR #27–#32（另一條工作線）：真地點、照片、導航、固定行程、單站洗牌 | `STATE.md` |
| 9 | 兩條線合併；修固定行程的時間檢查 | `state/ROUND9-PROGRESS.md` |
| 10 | 路線圖全做：到店要開著、約會與宵夜不派酒吧、其他的需求換日文、「去」卡查真地點、記憶匯出入、今日行程用目前位置… | `state/ROUND10-PROGRESS.md` |

部署：Vercel 接在這個 repo，`main` 一更新就自動部署正式站。測試版在 PR 的分支上自動建。正式站有問題用 Vercel rollback。

## Round 3（2026-10-22）：不再重複推薦、加上價位

- **店由程式決定，班長只負責講**：`src/discovery.ts` 加權抽樣（品質保底＋曝光衰減＋連鎖降權＋偵察），候選池由 `src/lanes.ts` 輪替料理細類擴大，模型再也看不到候選清單。
- **班長記得你**：`src/placeMem.ts` 只在手機存 place_id 與時間戳；「換一家」要報原因（店關了／不想吃這類／不要再來），口令卡印「新據點／第 N 次／偵察任務」。
- **價位**：「吃」多一列預算（每人），依座標自動切台幣／日圓（`src/price.ts`）。
- **上架準備**：同意畫面、隱私頁、檢舉入口、`docs/round3/STORE-LISTING.md`、`CAPACITOR-READY.md`。
- 文件：市場調查與策略 `docs/round3/`（R1–R3、STRATEGY、DEV-PLAN-3）。Jev（TypeSafe）選配層：`src/typesafe.ts`、`src/jevJudge.ts`、`scripts/taste-judge.mjs`、`scripts/effort-route.mjs`，設 `TYPESAFE_API_KEY` 才會啟用。

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
> `TZ` 不可省：`tests/unit/diary.test.ts` 有兩條斷言綁台北時區，在 UTC 機器上會紅。

```bash
npm run build      # STOP B
```

```bash
npm run e2e        # STOP C：全套 Playwright（條數與結果記在最新的 state/ROUND*-PROGRESS.md）
```
> 設定是 iPhone 13（WebKit）。雲端容器只有 Chromium：`npx playwright test --browser=chromium tests/e2e`。
> 2026-09-14 那輪 36 條在 WebKit 全過；之後每輪都在 Chromium 跑全套。

```bash
npm run e2e:shots  # STOP D：產 shots/ 七張截圖，對照表在 shots/CHECK.md
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
  cards.ts       8 張模組卡（第 6 節＋travel）
  officers.ts    3 位班長，語料三層各 24 句（第 7 節）
  banned.ts      護欄字表：罵行為不罵人
  avatar.tsx     SVG 角色（第 14 節資產介面，繪師交件當天可換）
  meme.tsx       梗圖卡（兩欄 grid，角色不壓字）
  diary.ts       IndexedDB 讀寫、週統計
  api.ts         呼叫 /api/*，錯誤分類
  prompt.ts      系統提示詞
  rules.ts       算得出來的硬規則（attend／sleep／buy／reply）
  orderParse.ts  Claude 回傳的四層解析
  places.ts      Places 過濾與距離、營業時間
  orderHandler.ts  /api/order 的本體：Places → 挑店 → Claude → Order JSON（Round 4 從 api/order.ts 搬來）
  lanes.ts       查詢規劃（料理細類輪替、放大、超商救援）
  scene.ts       吃／歇的情境規則（排除清單、到店要開著、日文關鍵字）
  discovery.ts   挑店（品質保底＋曝光衰減＋連鎖降權）
  placeMem.ts    手機上的店家記憶（只存 place_id 與時間）
  trial.ts       60 天試用紀錄
  probe.ts       preview 專用的真資料量測
  dailyDecision.tsx、dailyRouting.ts  今日行程
api/
  order.ts       薄殼，呼叫 src/orderHandler.ts
  weekly.ts      本週日記 → Claude → WeeklyReport JSON
  geocode.ts     日文站名 → 座標（Round 6）
  probe.ts       量測端點（正式站 404）
  daily-route.ts、place-photo.ts  今日行程的地點與照片
```

金鑰只存在於 `api/`，前端永遠不碰。無 DB、無 cron、無推播。

## 設計上的一個決定

第 6 節那些「算得出來」的規則——attend 的 ★≤2、sleep 的熄燈時間、buy 的 72 小時、reply 永遠 do
——都在伺服器端算好、塞進提示詞，**並在拿回模型的答案後再強制蓋一次**。
模型只負責語氣與內容，判定權不在它手上。單元測試直接驗這些規則。
