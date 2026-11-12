# 報告班長 · 決斷連 — 產品路線圖

> 建立：2026-11-03。依據：`README.md`、`DECIDE-DEV-DOC-v1.md`、`docs/round3/*`、`docs/archive/DEV-PLAN.md`、`docs/archive/DEV-PLAN-2.md`、`state/*`、`src/`。
> ⚠️ 2026-11-04 更新：寫這份時正式站是 Round 7；2026-11-03 下午 `main` 換成今日行程版。Round 9 把兩條線合併（PR #26），Round 10 做完下表。**各項最新狀態看 §6。**
> 唯一使用者是 Cross，60 天試用中（2026-11-01 起算）。

## 0. 結論

下一輪先上線 Round 8，再補「歇要營業中」規則。兩項都只改 `src/scene.ts` 的排除與過濾，風險低。試用期內不加新功能，只修派錯店。上架與擴大使用者留到試用結束後，用試用匯出的數據決定。

## 1. 產品目標

| 項目 | 內容 | 來源 |
|---|---|---|
| 定位 | 班長替你在附近挑一家沒去過、不踩雷的真店，下令，你照做 | `docs/round3/STRATEGY.md` §1.1 |
| 使用者 | MVP 只有 Cross；2026-10-30 決定自己試用 60 天 | `DECIDE-DEV-DOC-v1.md` §1；`docs/archive/state/ROUND4-PROGRESS.md` |
| 北極星 | 每週被服從的口令數（WOO）＝每週回報「完成」的口令數 | `docs/round3/STRATEGY.md` §1.2 |
| 護欄 G1 | 7 天內同店重複率 < 15%；12 餐不重複 ≥ 9 家 | `docs/round3/STRATEGY.md` §1.3 |
| 護欄 G2 | 被選店平均評分降幅 ≤ 0.15；「不要再來」≤ 10% | 同上 |
| 護欄 G3 | 「店關了」≤ 5%；p95 ≤ 6 秒；Places ≤ 2 次／口令 | 同上（Round 4 已放寬到 4 次，見 §5） |
| 品味原則 | T1–T10：一道命令一個答案、店由程式決定、數字不編 | `docs/round3/STRATEGY.md` §5 |
| 不做 | 帳號、雲端、模型選店、快取 Google 內容 | `docs/round3/STRATEGY.md` §4；`docs/archive/DEV-PLAN-2.md` §1 |

⚠️ WOO 的量法文件寫「伺服器匿名 log＋本機服從率」。試用期預設改用 `src/trial.ts` 匯出的紀錄算「完成」數，不另建遙測。
⚠️ 試用起算日有兩種寫法（10-30 決定、11-01 上線）。預設以 2026-11-01 起算，2026-12-30 結束。

## 2. 現況（正式站有什麼）

| 輪 | 上線時間（東京） | 內容 | 來源 |
|---|---|---|---|
| 3 | 2026-10-26 | 店由程式挑、本機記憶、換一家要原因、台幣／日圓預算、同意頁、日本店名用 ja | `docs/archive/state/ROUND3-PROGRESS.md` |
| 4 | 2026-11-01 11:25 | 不空手（超商救援）、不重複、照預算、模型失敗用模板口令、60 天試用紀錄 | `docs/archive/state/ROUND4-PROGRESS.md` |
| 5 | 2026-11-01 21:45 | 吃／歇先選情境（5 種＋其他）、沒做先問原因、看剩餘營業時間 | `docs/archive/state/ROUND5-PROGRESS.md` |
| 6 | 2026-11-02 13:52 | 地下沒定位 → 報站、定位可疑先問、日文站名查座標、距離切圓、口令從出站寫起 | `docs/archive/state/ROUND6-PROGRESS.md` |
| 7 | 2026-11-02 15:48（現況） | 東京的歇用日文關鍵字；不派水煙吧、購物中心；未跑 checker | `docs/archive/state/ROUND7-PROGRESS.md` |
| 8 | 只在 preview | 歇選咖啡不派卡拉OK／美食街；外帶不派酒吧；白天 12/12；深夜未量 | `docs/archive/state/ROUND8-PROGRESS.md` |

## 3. 路線圖

規模：S ≤ 1 天、M 2–5 天、L > 1 週（⚠️ 文件沒定義，這是預設）。🔒 = 碰保留事項（上線正式站、動錢、對外發布、改權限或金鑰）。

### Now（下 1–2 輪，試用期內修體驗）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| N1 | Round 8 上線 | 深夜歇派到卡拉OK、美食街；外帶派到酒吧（`docs/archive/state/ROUND7-PROGRESS.md` 深夜；`docs/archive/state/ROUND8-PROGRESS.md`） | 東京 01:00 手動量 preview-1 → `state/handoff-tools/r8-check.mjs` → checker → Cross 上線 | 深夜新宿歇 6 情境＋外帶：0 筆派錯店；上線後 runtime error 0 | S | 深夜量測、checker | 🔒 上線 |
| N2 | 歇要「營業中」 | 09:25 派到 10:00 才開的店；歇只有宵夜有 openNow（`docs/archive/state/ROUND8-PROGRESS.md` 白天觀察；`src/scene.ts:118,245`） | 歇全部情境：走到店時還沒開的不派；只剩這些才整批放回 | 白天量測：0 筆到店時間早於開門；台灣單元測試原樣過 | S | N1 上線後 | 🔒 上線 |
| N3 | 約會派到酒吧 | Round 6 起約會派到 Bar Vier；約會排除清單沒有酒吧類（`docs/archive/state/ROUND6-PROGRESS.md` 風險；`src/scene.ts:109`） | 依決策 Q1 | 深夜量測：約會 0 筆主類別是酒吧 | S | Q1 | 🔒 上線 |
| N4 | 試用期中匯出 | 試用紀錄存 localStorage，清資料就沒了；文件建議每 2 週匯出（`docs/archive/state/ROUND4-PROGRESS.md` 風險） | Cross 從除錯畫面匯出 JSON；分析派錯店率、服從率、WOO | 一份 JSON＋一頁分析；列出前 3 種派錯店 | S | Cross 動作 | — |
| N5 | Places 每日上限 | 上限 40 次／日，每道口令最多 4 次 ≈ 10 道／日（`src/places.ts:30`；`docs/archive/state/ROUND4-PROGRESS.md` 風險） | 上限改用「每日口令數」計，或提高到 80 | 試用匯出中 0 筆因上限被擋；月用量 ≤ 免費 1,000 次 | S | N4 數據 | 🔒 可能動錢 |
| N6 | 定位可疑門檻 | 60 秒／300 m 沒有實機數據（`state/HANDOFF-2026-11-03.md` §6.5；`src/api.ts` geoDoubt） | 試用紀錄記「被問你在車上？」次數；Cross 回報感受 | 兩週內 Cross 回報「太常問／剛好／太少問」一次 | S | N4 | — |
| N7 | e2e 既有 5 條失敗 | cmd-layout ×4、memory ×1，Chromium 差異（`state/HANDOFF-2026-11-03.md` §6.7） | 在裝得起 WebKit 的機器跑一次；過不了就標 skip 並寫理由 | `npm run e2e` exit 0，或 5 條明確 skip | S | WebKit 機器 | — |
| N8 | 文件對齊 | README 停在 Round 3；規格沒反映 Round 4–8（見 §5） | 改 README「現在的狀態」；規格 §6、§8 加 Round 4–8 附註 | §5 的矛盾清空 | S | — | — |

### Next（試用期結束前後）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| X1 | 合併 PR #26 | GitHub main 仍是 Round 3；有人推 main 會蓋掉正式站（`docs/archive/state/ROUND4-PROGRESS.md` 風險；`state/HANDOFF-2026-11-03.md` §2） | Cross 選時機合併；合併會從 git 重建正式站 | main = 正式站程式碼；重建後首頁與 `/api/order` 驗證同前 | S | Cross | 🔒 上線 |
| X2 | 「去」卡交通沒作用 | 走路／捷運／計程車／開車只進 prompt（`src/cards.ts:33`；`state/HANDOFF-2026-11-03.md` §6.4；`DECIDE-DEV-DOC-v1.md` §16） | 交通決定半徑與步行上限；接 Places `tourist_attraction` 為選配 | 四種交通的查詢指紋互不相同；真資料 4/4 距離合半徑 | M | — | 🔒 上線 |
| X3 | 「其他／有插座」 | Google 沒插座欄位；深夜 0 候選（`state/HANDOFF-2026-11-03.md` §6.6） | 卡上標「插座未驗證」；深夜維持超商救援 | 口令不再宣稱有插座；「其他」mismatch ≤ 20%（⚠️ 預設） | S | N4 | 🔒 上線 |
| X4 | 記憶匯出／匯入 | 記憶只在本機；換手機、清資料、換 Capacitor 都會失憶（`docs/round3/STRATEGY.md` R5；`docs/round3/CAPACITOR-READY.md` §2-6） | 除錯畫面匯出 place_id JSON，可匯入 | 匯出 → 清資料 → 匯入，記憶筆數一致（e2e） | M | — | — |
| X5 | lane 實測 | 新料理 lane 標 verified:false，沒用真金鑰驗過（`docs/archive/state/ROUND3-PROGRESS.md` #4；`src/lanes.ts`） | 有金鑰的環境跑 `npm run probe:lanes`；回 200 的翻 true | 每條 lane 有實測結果；0 條回 400 | S | GOOGLE_PLACES_KEY | 🔒 金鑰 |
| X6 | 專業模式（文書兵） | 毒舌沒有關閉鈕；審核 1.1.1 風險（`docs/round3/STRATEGY.md` B3；`docs/round3/R2-personality-store.md` §0-2） | 加第四位中性語氣；只改語料與 prompt，不加角色圖 | 50 次 mock 輸出禁詞 0 命中 | M | 角色素材確認（Cross） | — |
| X7 | 連勝／公差假單／升階 | 缺留存機制（`docs/round3/STRATEGY.md` §4；`docs/round3/R2-personality-store.md` §6-3） | 連續服從天數＋公差保連勝；用現有 `src/insignia.tsx` 階級 | 單元測試覆蓋連勝規則；上線後兩週 WOO 不降 | M | N4 證明每日使用 | — |

### Later（上架、擴大使用者）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| L1 | Capacitor 阻擋項 | API 是相對路徑、沒有 CORS（`docs/round3/CAPACITOR-READY.md` §2-2；`src/api.ts`、`api/` 都沒有 `API_BASE`／`Access-Control`） | `src/api.ts` 加 `API_BASE`；`api/` 加 CORS 與 OPTIONS | `check:bundle`、e2e 過；打包版能打到正式站 API | M | Q2 | — |
| L2 | 原生能力 4 項 | 上架必要 2 只有 2 項可算（`docs/round3/STORE-LISTING.md` 必要 2） | 本機通知、觸覺、分享面板、定位外掛 | TestFlight 實機 4 項可用 | M | L1、Apple 帳號 | 🔒 動錢 |
| L3 | 合規缺口 | 聯絡信箱仍是 `[CONTACT_EMAIL]`；隱私政策沒有公開網址；舊日記店名未處置（`src/report.ts:7`；`docs/round3/STORE-LISTING.md` 必要 3、7；`docs/archive/state/ROUND3-PROGRESS.md`） | Cross 給信箱；做 `public/privacy.html`；依 Q3 處理店名 | 審核備註對照表 1–8 沒有「缺」 | S | Cross、Q3 | 🔒 對外 |
| L4 | 送審台灣區 | 需要 Xcode、Apple 帳號、真機截圖（`docs/round3/STORE-LISTING.md`；`docs/round3/CAPACITOR-READY.md` §3） | 照 CAPACITOR-READY §3 的 8 步做 | App Store 審核通過；沒有 4.3(b) 退件 | L | L1–L3 | 🔒 發布、動錢 |
| L5 | 日本區 | 沒有日文介面；文案沒經母語者（`docs/round3/STORE-LISTING.md` 日本章） | 日文介面＋母語者驗證；先只上台灣 | 母語者簽核一次；日本章三個前提成立 | L | L4 | 🔒 發布 |
| L6 | 多人前的成本與配額 | Places 免費 1,000 次／月；單人一輪量測就用 640 次（`DECIDE-DEV-DOC-v1.md` §16；`docs/archive/state/ROUND4-PROGRESS.md`） | GCP 配額上限、每人每日口令上限、成本告警 | 月帳單有上限；超過自動降級不中斷 | M | — | 🔒 動錢 |
| L7 | WOO 遙測 | Vercel log 保留短，匿名 log 會斷（`docs/round3/STRATEGY.md` R11、§1.2） | 每週人工匯出，或接 log drain（先過隱私評估） | 每週有 WOO 數字；log 不含 place_id、座標 | M | 隱私評估 | 🔒 改權限 |

## 4. Cross 要做的決定

| # | 問題 | 建議 | 理由 |
|---|---|---|---|
| Q1 | 「約會吃好一點」要不要擋酒吧類？ | 擋。把外帶用的酒吧清單加到約會的排除清單；只剩酒吧時整批放回 | 情境名是「吃好一點」，口令要點菜（`src/scene.ts:109`）。軟篩放回保證不空手（`docs/archive/state/ROUND5-PROGRESS.md` 做了什麼）。改動 ≤ 5 行 |
| Q2 | 試用結束後走哪條路：上架 iOS，還是維持 PWA 自用？ | 先維持 PWA 到試用結束。WOO 連續 4 週 ≥ 10（⚠️ 預設門檻）才開 L1–L4 | 上架要 Apple 帳號與費用 🔒；真功能先硬才值得上（`docs/round3/R2-personality-store.md` §0-1；`docs/round3/STRATEGY.md` §4） |
| Q3 | 舊日記與除錯畫面裡的店名怎麼處理？ | 試用期不動；送審前一併處理，列為 L3 依賴 | 單人本機資料；條款結論文件寫「無法下結論」（`docs/round3/R3-discovery-price.md` §3.4）；改存法有費用 |

## 5. 文件之間的矛盾或過時內容

> 2026-11-11：逐條複查（含新找到的矛盾）見 `runs/hygiene-ui-1111/reports/hygiene.md` 衝突清單。舊計畫、Round 3–8 紀錄已移到 `docs/archive/`，下表路徑已同步。

| # | 矛盾 | 證據 |
|---|---|---|
| 1 | README 說「剩兩件事：填 API 金鑰、啟用 Places」。金鑰與 Places 早已驗證可用，正式站已到 Round 7 | `README.md` 現在的狀態；`docs/archive/DEV-PLAN-2.md` §0；`state/HANDOFF-2026-11-03.md` |
| 2 | README 只寫到 Round 3；Round 4–8 只在 `state/` | `README.md`；`docs/archive/state/ROUND4-PROGRESS.md` 起 |
| 3 | 卡片數：README 與規格 §3.1、§13.1 寫 7 張；規格 §6 標題寫八張；程式有 8 張（含 travel） | `README.md` 結構；`DECIDE-DEV-DOC-v1.md` §3.1、§6、§13.1；`src/cards.ts` |
| 4 | e2e 條數四種寫法：36、38、94、108＋5 | `README.md`；`docs/round3/DEV-PLAN-3.md` §0；`docs/archive/state/ROUND3-PROGRESS.md`；`docs/archive/state/ROUND6-PROGRESS.md` |
| 5 | README 說 `/api/order` 實作在 `api/order.ts`；Round 4 已搬到 `src/orderHandler.ts` | `README.md` 結構；`docs/archive/state/ROUND4-PROGRESS.md` commit `d18b35d` |
| 6 | 規格 §8 說單人每日 ≤ 5 次 Places、不會超免費額度；Round 4 每道口令最多 4 次，一輪量測用 640 次 | `DECIDE-DEV-DOC-v1.md` §8、§16；`docs/archive/state/ROUND4-PROGRESS.md` |
| 7 | 護欄 G3 寫 Places ≤ 2 次／口令；Round 4 放寬到 4 次，沒有改 STRATEGY | `docs/round3/STRATEGY.md` §1.3；`docs/archive/state/ROUND4-PROGRESS.md` 風險 |
| 8 | 規格 §6 的吃／歇流程沒有「先選情境」；reissue 仍寫「店關了」；Round 3 改「換一家」、Round 5 加情境頁 | `DECIDE-DEV-DOC-v1.md` §6；`docs/archive/state/ROUND5-PROGRESS.md`；`src/scene.ts` |
| 9 | 規格 §1.2 說「使用者自建情境」是 v2 不做；Round 5 的「其他」已可手打情境 | `DECIDE-DEV-DOC-v1.md` §1.2；`docs/archive/state/ROUND5-PROGRESS.md` |
| 10 | 試用起算日：10-30 決定 vs 11-01 上線（§1 已標 ⚠️） | `docs/archive/state/ROUND4-PROGRESS.md`；`state/HANDOFF-2026-11-03.md` §2 |
| 11 | `docs/archive/DEV-PLAN.md` 寫 S10 部署 ❌、E2E 未過；兩者在 `docs/archive/DEV-PLAN-2.md` §0 起已過時 | `docs/archive/DEV-PLAN.md` 現況三分表；`docs/archive/DEV-PLAN-2.md` §0 |

## 6. 狀態（2026-11-10，Round 14＋步驟 3＋核心迴圈 2.0）

Q1–Q3 照 §4 的建議答案（Cross 2026-11-03 23:05「全部產品路線圖做完」）。證據多在 `state/ROUND10-PROGRESS.md` 與 `state/evidence/r10/`。

| # | 狀態 | 證據／原因 |
|---|---|---|
| N1 | ✅ 已上線 | 2026-11-04 09:28 隨 PR #26 上線 |
| N2 | ✅ | 歇全部情境到店要開著；整批放回也不派到店已關的店。實測「歇還沒開」「到店已關」0 |
| N3 | ✅（Q1：擋） | 約會酒吧 0；宵夜也不派純酒吧 |
| N4 | ✅ 工具／⏳ 待 Cross | 一鍵匯出含記憶。資料只在你手機上，要你在除錯畫面按一次「匯出」 |
| N5 | ⏳ 待 Cross 🔒 | 提高每日 Places 上限可能動錢。2026-11-04 給了三個方案與最壞月費（`state/ROUND11-PROGRESS.md` 第 3 節），Cross 沒選 → 維持 40 次 |
| N6 | ✅ 工具＋修正 | 試用紀錄記「你在車上？」的原因與選擇；修掉「在選單停超過 1 分鐘被誤問」。門檻要等你的試用資料 |
| N7 | ✅ | e2e 124／124。cmd-layout 4 條是真的版面 bug（Google Maps 標示超出第一屏），memory 1 條是測試競態 |
| N8 | ✅ | README、規格、策略、舊計畫、`STATE.md` 已對齊 |
| X1 | ✅ 2026-11-04 09:28 | PR #26 合併進 `main`（`a9f9871`），正式站 `dpl_6bFCi5QrsQXRrR9qiqp89ZQmSfPq` |
| X2 | ✅ | 「去」卡查真地點；交通與時間決定半徑；找不到說實話，不派超商。實測新宿、信義各 4/4 |
| X3 | ✅ | 口令不保證有插座；日本把「有插座」等中文需求換成日文查 |
| X4 | ✅ | 記憶匯出／匯入（壞檔不動資料，同一檔匯入多次結果相同） |
| X5 | ✅ | lane 實測：東京 83、信義 92 條全 200、0 條 400；10 條翻成 verified |
| X6 | ⏳ 依 Q2 延後 | 專業模式是為上架審核；Q2 先維持 PWA |
| X7 | ✅ | 出勤連勝、公差假單（每 7 天 1 張、最多 2 張）、升階（3／7／14／30／60／100 天） |
| L1–L5 | ⏳ 依 Q2 延後 | 上架需要 Apple 帳號與費用 🔒、對外發布 🔒、日文母語者 |
| L3 | ⏳ 待 Cross | 聯絡信箱要你提供 |
| L6 | ⏳ 待 Cross 🔒 | GCP 配額與帳單上限（動錢） |
| L7 | ⏳ 待 Cross 🔒 | 遙測要改權限並先做隱私評估 |
| 今日行程・目前位置 | ✅ | 可用 GPS 當出發點；壞座標 400；定位被拒保留原行程 |
| 今日行程・步行時間 | ✅ 2026-11-04 | 403 原因是專案沒開 Routes API（`SERVICE_DISABLED`）。Cross 開了之後，正式站 `routeVerified:true`（`state/evidence/r11/`） |
| Round 11 | ✅ 2026-11-04 | PR #34（`945088a`）：約會步行上限 15 分、Routes 403 原因已記、分享面板 e2e |
| Round 12 | ✅ 2026-11-05 | PR #35（`0d88cdb`）：已知未修全處理、一次上線 |
| Round 13 | ✅ 2026-11-05 | PR #36（`acfd4d2`）：沒評分的店不過評分門檻、朋友聚餐不派購物中心 |
| Round 14 | ✅ 2026-11-09 | PR #38（`766d2f49`）：種類只留類型＋品牌，刪整條店名判斷；紅隊 round 14 PASS |
| 日記時區 | ✅ 2026-11-09 | PR #39（`8ffcbda2`）：日記顯示本地時間 |
| CI | ✅ 2026-11-09 | PR #40（`02999c9a`）：CI＋分支保護上線（`check`／`e2e`／`required` 為 required check） |
| 步驟 3 設定 | ✅ 2026-11-10 | PR #43（`eca366cc`）：tsconfig／ESLint／Husky／Stryker 設定落地 |
| 衛生清理 | ✅ 2026-11-10 | PR #44（`f7d0fff`）：刪凍結快照與死碼，補 `.gitignore` 缺口 |
| 步驟 3 修復 | ✅ 2026-11-10 | PR #45（`f8c1bbe`）：ESLint／tsc 修復；CI 5/5 綠（見 `docs/adr/adr-002-ci-gate.md:16`） |
| Stryker 測試 | ✅ 2026-11-10 | PR #46（`5fa0a2e`）：`placeKind` 映射斷言補齊（`57de1ca`） |
| Stryker 閾值 | ✅ 2026-11-10 | PR #47（`7ebb72d`）：`thresholds.break` 設為 95（`c6de73b`） |
| ADR-001 | ✅ 2026-11-10 | PR #48（`25e9d9c`）：`docs/adr/adr-001-type-brand-only.md`（種類只留類型＋品牌，刪整條店名判斷） |
| ADR-002 | ✅ 2026-11-10 | PR #49（`f289074`）：`docs/adr/adr-002-ci-gate.md`（CI 門檻＋分支保護） |
| 核心迴圈 2.0・PR-1 | ✅ 2026-11-10 | PR #50（`5bf71a87`）：結構化意圖，刪 `mode`；見 §7 |
| 2.1／2.2・PR-2 | ✅ 2026-11-10 | PR #51（`ce7827e5`）：部分行程標示＋seen 跨請求留存；production 已驗（bundle index-BtC-1r0b.js）；見 §7 |
| 開始時間・PR-4 | ✅ 2026-11-10 | PR #52（`43a82820`）：開始時間輸入；rebase 後 head `09e8cd7`；production 已驗（bundle index-ScDXdLMo.js）；見 §7 |
| 2.3 AKOMEYA 觀察 | ✅ 觀察完成 | Production bundle 與 main @ `5bf71a87` SHA-256 一致；按鈕今日文字未確認，文案待裁定；見 §7 |
| 2.4 回饋迴圈設計 | ✅ 設計完成 | 設計稿待使用者核准（Q1–Q11），未實作；見 §7 |
| 步驟 4 | ⏳ 進行中 | ADR-001／ADR-002 已合併（PR #48／#49）；錯誤分類統計在 workspace（`~/workspace/improvement-research/ERROR-TAXONOMY-STATS.md`），defect escape rate 追蹤未確認（repo 內無對應檔案） |
| 分支清理 | ⏳ 部分 | PR #44／#45／#46 的分支已刪；遠端仍有 `feature/daily-intent-first`、`docs/adr-001`、`docs/adr-002`、`step3/stryker-threshold`（2026-11-10 查 `git branch -r`） |

~~已知未修：早上「約會吃好一點」常找不到 4.3★，改派附近最高分（4.1–4.2★），可能走 30 分以上（checker 第 2 輪）。~~ Round 11（2026-11-04 19:21 上線）：約會最多走 15 分；放寬評分時派 15 分內最高分。早上實測排在 11-05。

下一步：Cross 處理表中「待 Cross」各項，並決定約會要不要加步行上限；日期未知。

## 7. 核心迴圈重構 2.0（2026-11-10）

> 範圍：取代「效率採買 vs 偵查探索」分支（使用者 2026-11-10 裁定：該分支是錯誤命題，丟掉）。一天從當下時間出發，由使用者決定今天想去哪裡或想做什麼；完全沒想法時，發揮最大創意探索東京（使用者在東京住 7 年，深主題探索，觀光客行程毫無興趣）。
> 來源：映射報告 `~/workspace/general-decision-core-loop-2.0/mapping/REPORT.md`（快照 main `f2890748`，PR #49 合併點）；各 PR 歷程見本節所列報告路徑。

### 7.1 映射結論：分支只有一個落點

| 事實 | 來源 |
|---|---|
| 全 repo 唯一讀 `DailyState.mode` 的地方是 `src/dailyDecision.tsx:151` 的 `buildDaily` | mapping REPORT.md §1 S4 |
| `mode` 不進伺服器：送往 `/api/daily-route` 的請求本體沒有 `mode`；`api/daily-route.ts` 全檔 grep `mode` 零命中；`src/dailyRouting.ts` 同樣零命中 | mapping REPORT.md §1 S7–S9 |
| 兩個模式的差別只有兩件事：`creative` 站出現／消失、`coffee` 與 `shopping` 前後對調；`gym`／`meal`／`rest` 兩邊完全相同 | mapping REPORT.md §0 |
| `notes`／備註不是意圖來源：`addFeedback` 只寫進 `notes`，從未送往伺服器，輸入框明寫「僅備註，不影響搜尋」 | mapping REPORT.md §3 R4 |
| 文件裡這個 split 完全不存在：`docs/ROADMAP.md`（當時 140 行）無 2.0 項目；2.0 需新增一節，不是修改既有文字 | mapping REPORT.md §4 D1 |
| 不動：`seen`／`disliked`（N1／N2）、地區偏好（N3）、隨機化（N4）、種類判斷 type＋brand only（N5）、`specified`／`custom`／出發地／`avoid`（R1–R3）、核心 app 的 `PickMode`（X1–X3） | mapping REPORT.md §2、§4 |

### 7.2 已批准的 5 個決定（使用者，2026-11-10 12:40 JST）

| # | 決定 | 備註 |
|---|---|---|
| (1) | 意圖＝結構化輸入（目的地欄位＋活動選項）；無意圖時預設＝創意探索 | 12:40 原裁定為「意圖＝一個自由文字欄位」；自由文字解析在紅隊第三輪觸及架構極限後，使用者 2026-11-10 16:46 JST 裁定改結構化輸入（見 §7.3）。解析器已刪除，不是現行方案 |
| (2) | 意圖不跨天保留 | 換天歸零；開始時間（PR-4）同規則 |
| (3) | 舊 `mode:'practical'` 存檔：該欄位忽略，現有行程保留原樣 | `loadDaily` 明確剝掉舊存檔的 `mode`，不因型別收緊丟掉整份行程 |
| (4) | 重新探索＝完整重新生成（`fullRegen`） | 不另立混合語意 |
| (5) | `specified`：地理重排維持現狀；有 `start` 時當時間錨點 | 映射 U5（specified 站是否為地理錨點）仍未裁定；PR-1 不碰伺服器 `order()` |

來源：`~/workspace/general-decision-core-loop-2.0/pr1/pr-body.md`（Summary 決定清單）；16:46 結構化裁定見 `~/workspace/general-decision-core-loop-2.0/pr1/REPORT.md`「Structured input rework」一節。

### 7.3 PR-1：結構化意圖，刪 `mode`（✅ 已合併）

| 項目 | 內容 |
|---|---|
| PR | #50，merge commit `5bf71a87`（2026-11-10 18:24 JST），分支 `feature/daily-intent-first`，7 個 commits（`653de0c` → `da67c16`），head `da67c16` |
| 改動 | `git diff f2890748..da67c16 --stat`：6 檔，934 insertions、46 deletions（`src/dailyDecision.tsx`、`src/dailyDecision.css`、`tests/unit/dailyDecision.test.ts`、`tests/unit/dailyDecision-ui.test.tsx`、`tests/unit/dailyDecision-intent.test.ts`（新）、`tests/e2e/daily-location.spec.ts`） |
| 內容 | 刪 `mode` 欄位（舊存檔剝離）；意圖輸入＝目的地欄位（max 120 字）＋目的地站選單（5 個可搜尋站）＋5 個活動 checkbox（健身／吃飯／看展覽／喝咖啡／購物，rest 永遠不在選項內）；目的地站走既有 specified 語意（查詢字串＝原文、不套類型／地區／評論門檻、完整重生時保留）；`appliedIntent` state 層快照保留同一意圖重跑的候選；便利預設只在兩個 UI 輸入處理器觸發；選站選單會解除該站的 `avoid` |
| 測試 | 全套 1125/1125（52 檔）；lint 0 errors／0 warnings；`npx tsc -b` exit 0；e2e `daily-location` 2 passed |
| CI | 5/5 綠（check／e2e／required＋Vercel） |
| Production 驗證 | 2026-11-10 ~18:27 JST：bundle `assets/index-VHua357e.js`；結構化輸入 testid 在、舊模式按鈕 gone、`parseIntent` absent |
| 紅隊 | 第 5 輪 PASS（0 findings；聚焦重審 RT4 fix） |

歷程（自由文字解析器已刪除，以下是歷史，不是現行方案）：

| 階段 | 結果 | 關鍵點 |
|---|---|---|
| 自由文字解析（`parseIntent` 關鍵字表） | 紅隊第 1 輪 FAIL：3 blocking（F1 伺服器往返標記失效、F2 否定語境當肯定、F3 CJK 單字子字串誤命中）＋3 non-blocking | 見 `pr1/redteam/REPORT.md` |
| Fix round 2（`31a220e`） | 紅隊第 2 輪 FAIL：R2-F1 否定邏輯缺口、R2-F2 子字串誤命中未除根（blocking）、R2-F3 搜尋後候選保留失效 | 同類問題第三次出現；使用者裁定 (a) 結構性重做意圖解析 |
| Fix round 3（`501fd7d`） | 紅隊第 3 輪 FAIL：R3-F1～F3 否定形缺口（blocking）、R3-F4 詞邊界新殺合法複合詞 | 架構錯誤信號：日文自由文字解析無真正分詞不可能收斂；不得開 fix round 4 |
| 使用者裁定（2026-11-10 16:46 JST） | 改結構化輸入；解析器整塊刪除（23 個識別字在 `src/`／`tests/`／`api/` 全數零命中） | 見 `pr1/DESIGN-structured-input.md` |
| 結構化重做（`5b31687`）＋略過修復（`e547894`） | 紅隊第 4 輪 FAIL：RT4-F1（略過後再選站，摘要宣稱附著、路線無該站）blocking＋O1 觀察（先選站、後填目的地被彈回） | 使用者 2026-11-10 17:50 JST 裁定兩項都照協調員建議做：(a) 選站移除其 `avoid`；(b) 放寬不變量，站可先選、目的地後填 |
| RT4 fix（`da67c16`） | 紅隊第 5 輪 PASS：0 findings | 見 `pr1/redteam/REPORT-5.md`；PR #50 合併 |

來源：`~/workspace/general-decision-core-loop-2.0/pr1/REPORT.md`、`pr1/pr-body.md`、`pr1/redteam/REPORT.md`、`REPORT-2.md`、`REPORT-3.md`、`REPORT-4.md`、`REPORT-5.md`。

已知殘留（PR-1）：R-1 目的地查無此店＝既有 specified 行為（`noCandidate`）；R-3 活動勾選無目的地時對路由無可見影響；R-5 舊自由文字意圖升級時一次性遺失（需重新勾選）；R-7 specified 站是否為地理錨點（U5）仍未裁定。**O2 見 §7.6，不在本批次。**

### 7.4 PR-2 與 PR-4（✅ 已合併：PR #51、#52）

#### PR-2：部分行程標示（2.1 O1）＋ seen 跨請求留存（2.2 O2）

| 項目 | 內容 |
|---|---|
| 分支／head | `server/pr2-partial-seen`，head `dd9ed651cc778a501d30ecc650bab1ef5ede608a`（parent `40a523e` ← base `5bf71a87`）；已合併 PR #51（merge `ce7827e5`），production 已驗（bundle index-BtC-1r0b.js） |
| 改動 | `git diff 5bf71a87..HEAD --stat`：5 檔，543 insertions、7 deletions（`api/daily-route.ts`、`src/dailyDecision.tsx`、`tests/unit/daily-route.test.ts`、`tests/unit/dailyDecision-pr2.test.ts`（新）、`tests/unit/dailyDecision-ui.test.tsx`） |
| 內容 | (a) creative 表項驗證為活碼、不退役（三張表一字未動）；(b) intent 請求欄位不需要、不加（目的地已編碼為指定站，活動勾選不改變伺服器行為）；(c) 2.1 O1：頂層 `partial`＋`missingStops: {id, reason}[]`（兩個成功回應都帶；`reason` 為 `area`／`filtered`／`empty`；純文字 rest 不列入，被指定了地點的 rest 查無店家時列入）；前端 `partial` 為真時明寫「部分行程：」；(d) 2.2 O2：完整重生路徑新增 `withCurrentAsSeen` 寫回 `state.seen`（只記自動站），＋設定面板「清除今天換掉的店紀錄」按鈕（只清 seen，disliked 不動）；換天過期（既有） |
| 測試 | 全套 1152/1152（53 檔）；lint 0；tsc exit 0；e2e `daily-location` 2 passed |
| 紅隊 | 第 1 輪 PASS（0 blocking、3 non-blocking 已於修正輪 `dd9ed65` 修掉：F1 說法更正、F2 空行程文案、F3 空 `missingStops` 退回掃描）；第 2 輪 PASS（0 blocking、2 non-blocking 殘留：RT2-F1 rest-only 行程狀態列說錯話、RT2-F2 `missingStops` 不完整時漏缺站）。**2026-11-12 兩項都已修**（見 §7.6 下方） |

來源：`~/workspace/general-decision-core-loop-2.0/pr2/REPORT.md`、`pr2/pr-body.md`、`pr2/redteam2/REPORT.md`。

#### PR-4：開始時間輸入

| 項目 | 內容 |
|---|---|
| 分支／head | `feature/start-time-input`，head `09e8cd7eaf9c2cf5132a83e9a7f3178dc62b399b`（parent `1c9f79a` ← base `ce7827e5`；原 `b4a09a8` rebase 到 PR-2 合併後的 main）；已合併 PR #52（merge `43a82820`），production 已驗（bundle index-ScDXdLMo.js） |
| 改動 | `git diff ce7827e5..HEAD --stat`：5 檔，503 insertions、24 deletions（`api/daily-route.ts`、`src/dailyDecision.tsx`、`src/dailyRouting.ts`、`tests/unit/dailyDecision-start-time.test.ts`（新）、`tests/unit/dailyDecision-ui.test.tsx`）；rebase 解開三處 PR-2／PR-4 衝突（成功回應同時帶 `partial`／`missingStops` 與 `anchorTime`；`DailyRouteResponse` 同時含兩者；狀態列取 PR-2 的 `mappedMissing`／`hasCandidate`／F2 邏輯＋PR-4 的 `anchorNote`） |
| 內容 | 開始時間輸入（`type="time"`，testid `daily-start-time`，在出發地之下、意圖欄位之上）；`effectiveStartTime`：合法未來時間當錨點，否則伺服器當下東京時間（過去時間 clamp）；午夜跨日 day-aware 運算：ETA 標「翌日」（`etaDayOffset`／`departureDayOffset`），固定安排 deadline 取當天／隔天離錨點最近的一次；回應加 `anchorTime`；改時間不搜尋、不重建任務，`clearRoute` 同時清逐站舊 ETA／衝突；開始時間只留今天、換天歸零 |
| 測試 | 全套 1184/1184（54 檔，rebase 後 head 主代理重跑）；lint 0；tsc exit 0；e2e 由 CI 全跑 |
| 紅隊 | 第 1 輪 FAIL（F1 午夜跨日 blocking；F2 逐站衝突殘留；O1 時區未標明、O2 有效錨點不可見）→ 修正輪（結構性修法，非 23:59 特例）→ 第 2 輪 PASS（0 blocking、0 non-blocking） |

來源：`~/workspace/general-decision-core-loop-2.0/pr4/REPORT.md`、`pr4/DESIGN-start-time.md`、`pr4/pr-body.md`、`pr4/redteam2/REPORT.md`。

### 7.5 2.1～2.4 狀態

| 項 | 狀態 | 說明 |
|---|---|---|
| 2.1 O1：池子太薄時回傳部分行程並標示缺站 | ✅ PR-2 已合併（PR #51） | 已裁定（2026-11-10，使用者授權按目的決定）；見 §7.4 PR-2 (c) |
| 2.2 O2：`seen` 跨請求保存（當天、弱於 `disliked`、可清除） | ✅ PR-2 已合併（PR #51） | 已裁定（同上）；見 §7.4 PR-2 (d)。注意：此處的 O2 是「seen 跨請求保存」；PR-1 紅隊第 5 輪的 O2 觀察是另一件事，見 §7.6 |
| 2.3 AKOMEYA 食堂排除按鈕標籤 | ✅ 觀察 done（文案待裁） | Production 觀察 2026-11-10 19:03–19:07 JST：production bundle 與 main @ `5bf71a87` SHA-256 一致（`a2667822762537875babe8381fc2658a1a84134337e24109abbe7e2cc979e366`，`assets/index-VHua357e.js`）；按鈕模板唯一：`不要「{kindLabel}」這類`；kind 唯一來源是當下候選的 Google Places types／primaryType（type＋brand 判定，店名零貢獻）；stale 標籤假設在 UI 渲染層不成立。**AKOMEYA 今日的 types 未確認**（需瀏覽器實測 production 渲染）；文案決定待使用者看證據後做 |
| 2.4 行為回饋迴圈＋權重圖 | ✅ 設計 done（待核准，未實作） | 設計稿 `~/workspace/general-decision-core-loop-2.0/design-2.4/DESIGN-feedback-loop.md`；訊號三層（手動輸入最強／明確表態／隱性訊號）、圖譜軟分數、半衰期 30 天、`prefer` 加權皆為提案；待核准問題 Q1–Q11（權重數字、衰減、儲存位置、清除粒度、跨日目的地、標記完成是否寫入核心記憶、`prefer` 加權與放寬、種類親和閾值、說明文字、活動跨日效果、是否讀取愛店）。核准後才實作 |

### 7.6 不在本批次：O2（PR-1 紅隊第 5 輪觀察）

重開頁面後，未搜尋過的意圖附著站會從路線掉落（`loadDaily` 過濾器濾掉無候選的指定站，掛載不重跑 `replanDaily`），而摘要仍宣稱附著，直到下一次改動意圖觸發 `replanDaily` 才自癒。`e547894` 上一模一樣，既有行為、非 PR-1 迴歸。**明確不在 Wave-2 批次內**，需使用者另行裁定（掛載重跑 `replanDaily`，或過濾器保留意圖站）。PR-2／PR-4 皆未碰。

來源：`~/workspace/general-decision-core-loop-2.0/pr1/redteam/REPORT-5.md` 觀察 O2；`pr1/pr-body.md` Known residuals O2。

**2026-11-12 已修（O2＋RT2-F1＋RT2-F2）**：
- O2：選了「過濾器保留指定站」，不是「掛載重跑 `replanDaily`」。理由：重跑只救得回意圖站；逐站指定（使用者自己打的地點）還沒搜尋就重開頁面，一樣會被濾掉，下次搜尋時地點遺失。`loadDaily` 過濾器多留 `specified` 的站，兩種都救到。沒指定、沒候選的自動站照舊濾掉。
- RT2-F1：只剩純文字 rest 時，狀態列改寫「行程已更新：今天只剩散步回家，不用找店家。」，不再說「沒有找到符合條件的店家」。
- RT2-F2：缺站清單改成 `missingStops` 與逐站 `noCandidate` 取聯集，依站序、不重複。F3 的空清單／缺清單情況也由聯集涵蓋。
- 測試：`tests/unit/dailyDecision-intent.test.ts`（O2 三條）、`tests/unit/dailyDecision-ui.test.tsx`（RT2 三條）；舊程式上這些新測試有 4 條失敗。

### 7.7 本節未改的守則

- 錯判（種類判錯、雙向誤導排除）與資料遺失（清掉使用者明確封鎖）永遠不接受，每輪仍是 blocking 條件。
- `notes` 絕不當意圖來源；自由文字解析器已刪除，不得寫回文件當作現行方案。
- 地區偏好（結構化、可選、預設澀谷／開、伺服器端執行）、隨機化（完整重新生成必須不同路線）、種類判斷（type＋brand only，歧義回 `undefined`）維持不變。
