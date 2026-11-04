# 報告班長 · 決斷連 — 產品路線圖

> 建立：2026-11-03。依據：`README.md`、`DECIDE-DEV-DOC-v1.md`、`docs/round3/*`、`DEV-PLAN.md`、`DEV-PLAN-2.md`、`state/*`、`src/`。
> ⚠️ 2026-11-04 更新：寫這份時正式站是 Round 7；2026-11-03 下午 `main` 換成今日行程版。Round 9 把兩條線合併（PR #26），Round 10 做完下表。**各項最新狀態看 §6。**
> 唯一使用者是 Cross，60 天試用中（2026-11-01 起算）。

## 0. 結論

下一輪先上線 Round 8，再補「歇要營業中」規則。兩項都只改 `src/scene.ts` 的排除與過濾，風險低。試用期內不加新功能，只修派錯店。上架與擴大使用者留到試用結束後，用試用匯出的數據決定。

## 1. 產品目標

| 項目 | 內容 | 來源 |
|---|---|---|
| 定位 | 班長替你在附近挑一家沒去過、不踩雷的真店，下令，你照做 | `docs/round3/STRATEGY.md` §1.1 |
| 使用者 | MVP 只有 Cross；2026-10-30 決定自己試用 60 天 | `DECIDE-DEV-DOC-v1.md` §1；`state/ROUND4-PROGRESS.md` |
| 北極星 | 每週被服從的口令數（WOO）＝每週回報「完成」的口令數 | `docs/round3/STRATEGY.md` §1.2 |
| 護欄 G1 | 7 天內同店重複率 < 15%；12 餐不重複 ≥ 9 家 | `docs/round3/STRATEGY.md` §1.3 |
| 護欄 G2 | 被選店平均評分降幅 ≤ 0.15；「不要再來」≤ 10% | 同上 |
| 護欄 G3 | 「店關了」≤ 5%；p95 ≤ 6 秒；Places ≤ 2 次／口令 | 同上（Round 4 已放寬到 4 次，見 §5） |
| 品味原則 | T1–T10：一道命令一個答案、店由程式決定、數字不編 | `docs/round3/STRATEGY.md` §5 |
| 不做 | 帳號、雲端、模型選店、快取 Google 內容 | `docs/round3/STRATEGY.md` §4；`DEV-PLAN-2.md` §1 |

⚠️ WOO 的量法文件寫「伺服器匿名 log＋本機服從率」。試用期預設改用 `src/trial.ts` 匯出的紀錄算「完成」數，不另建遙測。
⚠️ 試用起算日有兩種寫法（10-30 決定、11-01 上線）。預設以 2026-11-01 起算，2026-12-30 結束。

## 2. 現況（正式站有什麼）

| 輪 | 上線時間（東京） | 內容 | 來源 |
|---|---|---|---|
| 3 | 2026-10-26 | 店由程式挑、本機記憶、換一家要原因、台幣／日圓預算、同意頁、日本店名用 ja | `state/ROUND3-PROGRESS.md` |
| 4 | 2026-11-01 11:25 | 不空手（超商救援）、不重複、照預算、模型失敗用模板口令、60 天試用紀錄 | `state/ROUND4-PROGRESS.md` |
| 5 | 2026-11-01 21:45 | 吃／歇先選情境（5 種＋其他）、沒做先問原因、看剩餘營業時間 | `state/ROUND5-PROGRESS.md` |
| 6 | 2026-11-02 13:52 | 地下沒定位 → 報站、定位可疑先問、日文站名查座標、距離切圓、口令從出站寫起 | `state/ROUND6-PROGRESS.md` |
| 7 | 2026-11-02 15:48（現況） | 東京的歇用日文關鍵字；不派水煙吧、購物中心；未跑 checker | `state/ROUND7-PROGRESS.md` |
| 8 | 只在 preview | 歇選咖啡不派卡拉OK／美食街；外帶不派酒吧；白天 12/12；深夜未量 | `state/ROUND8-PROGRESS.md` |

## 3. 路線圖

規模：S ≤ 1 天、M 2–5 天、L > 1 週（⚠️ 文件沒定義，這是預設）。🔒 = 碰保留事項（上線正式站、動錢、對外發布、改權限或金鑰）。

### Now（下 1–2 輪，試用期內修體驗）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| N1 | Round 8 上線 | 深夜歇派到卡拉OK、美食街；外帶派到酒吧（`state/ROUND7-PROGRESS.md` 深夜；`state/ROUND8-PROGRESS.md`） | 東京 01:00 手動量 preview-1 → `state/handoff-tools/r8-check.mjs` → checker → Cross 上線 | 深夜新宿歇 6 情境＋外帶：0 筆派錯店；上線後 runtime error 0 | S | 深夜量測、checker | 🔒 上線 |
| N2 | 歇要「營業中」 | 09:25 派到 10:00 才開的店；歇只有宵夜有 openNow（`state/ROUND8-PROGRESS.md` 白天觀察；`src/scene.ts:118,245`） | 歇全部情境：走到店時還沒開的不派；只剩這些才整批放回 | 白天量測：0 筆到店時間早於開門；台灣單元測試原樣過 | S | N1 上線後 | 🔒 上線 |
| N3 | 約會派到酒吧 | Round 6 起約會派到 Bar Vier；約會排除清單沒有酒吧類（`state/ROUND6-PROGRESS.md` 風險；`src/scene.ts:109`） | 依決策 Q1 | 深夜量測：約會 0 筆主類別是酒吧 | S | Q1 | 🔒 上線 |
| N4 | 試用期中匯出 | 試用紀錄存 localStorage，清資料就沒了；文件建議每 2 週匯出（`state/ROUND4-PROGRESS.md` 風險） | Cross 從除錯畫面匯出 JSON；分析派錯店率、服從率、WOO | 一份 JSON＋一頁分析；列出前 3 種派錯店 | S | Cross 動作 | — |
| N5 | Places 每日上限 | 上限 40 次／日，每道口令最多 4 次 ≈ 10 道／日（`src/places.ts:30`；`state/ROUND4-PROGRESS.md` 風險） | 上限改用「每日口令數」計，或提高到 80 | 試用匯出中 0 筆因上限被擋；月用量 ≤ 免費 1,000 次 | S | N4 數據 | 🔒 可能動錢 |
| N6 | 定位可疑門檻 | 60 秒／300 m 沒有實機數據（`state/HANDOFF-2026-11-03.md` §6.5；`src/api.ts` geoDoubt） | 試用紀錄記「被問你在車上？」次數；Cross 回報感受 | 兩週內 Cross 回報「太常問／剛好／太少問」一次 | S | N4 | — |
| N7 | e2e 既有 5 條失敗 | cmd-layout ×4、memory ×1，Chromium 差異（`state/HANDOFF-2026-11-03.md` §6.7） | 在裝得起 WebKit 的機器跑一次；過不了就標 skip 並寫理由 | `npm run e2e` exit 0，或 5 條明確 skip | S | WebKit 機器 | — |
| N8 | 文件對齊 | README 停在 Round 3；規格沒反映 Round 4–8（見 §5） | 改 README「現在的狀態」；規格 §6、§8 加 Round 4–8 附註 | §5 的矛盾清空 | S | — | — |

### Next（試用期結束前後）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| X1 | 合併 PR #26 | GitHub main 仍是 Round 3；有人推 main 會蓋掉正式站（`state/ROUND4-PROGRESS.md` 風險；`state/HANDOFF-2026-11-03.md` §2） | Cross 選時機合併；合併會從 git 重建正式站 | main = 正式站程式碼；重建後首頁與 `/api/order` 驗證同前 | S | Cross | 🔒 上線 |
| X2 | 「去」卡交通沒作用 | 走路／捷運／計程車／開車只進 prompt（`src/cards.ts:33`；`state/HANDOFF-2026-11-03.md` §6.4；`DECIDE-DEV-DOC-v1.md` §16） | 交通決定半徑與步行上限；接 Places `tourist_attraction` 為選配 | 四種交通的查詢指紋互不相同；真資料 4/4 距離合半徑 | M | — | 🔒 上線 |
| X3 | 「其他／有插座」 | Google 沒插座欄位；深夜 0 候選（`state/HANDOFF-2026-11-03.md` §6.6） | 卡上標「插座未驗證」；深夜維持超商救援 | 口令不再宣稱有插座；「其他」mismatch ≤ 20%（⚠️ 預設） | S | N4 | 🔒 上線 |
| X4 | 記憶匯出／匯入 | 記憶只在本機；換手機、清資料、換 Capacitor 都會失憶（`docs/round3/STRATEGY.md` R5；`docs/round3/CAPACITOR-READY.md` §2-6） | 除錯畫面匯出 place_id JSON，可匯入 | 匯出 → 清資料 → 匯入，記憶筆數一致（e2e） | M | — | — |
| X5 | lane 實測 | 新料理 lane 標 verified:false，沒用真金鑰驗過（`state/ROUND3-PROGRESS.md` #4；`src/lanes.ts`） | 有金鑰的環境跑 `npm run probe:lanes`；回 200 的翻 true | 每條 lane 有實測結果；0 條回 400 | S | GOOGLE_PLACES_KEY | 🔒 金鑰 |
| X6 | 專業模式（文書兵） | 毒舌沒有關閉鈕；審核 1.1.1 風險（`docs/round3/STRATEGY.md` B3；`docs/round3/R2-personality-store.md` §0-2） | 加第四位中性語氣；只改語料與 prompt，不加角色圖 | 50 次 mock 輸出禁詞 0 命中 | M | 角色素材確認（Cross） | — |
| X7 | 連勝／公差假單／升階 | 缺留存機制（`docs/round3/STRATEGY.md` §4；`docs/round3/R2-personality-store.md` §6-3） | 連續服從天數＋公差保連勝；用現有 `src/insignia.tsx` 階級 | 單元測試覆蓋連勝規則；上線後兩週 WOO 不降 | M | N4 證明每日使用 | — |

### Later（上架、擴大使用者）

| # | 項目 | 問題（證據） | 做法 | 成功指標 | 規模 | 依賴 | 🔒 |
|---|---|---|---|---|---|---|---|
| L1 | Capacitor 阻擋項 | API 是相對路徑、沒有 CORS（`docs/round3/CAPACITOR-READY.md` §2-2；`src/api.ts`、`api/` 都沒有 `API_BASE`／`Access-Control`） | `src/api.ts` 加 `API_BASE`；`api/` 加 CORS 與 OPTIONS | `check:bundle`、e2e 過；打包版能打到正式站 API | M | Q2 | — |
| L2 | 原生能力 4 項 | 上架必要 2 只有 2 項可算（`docs/round3/STORE-LISTING.md` 必要 2） | 本機通知、觸覺、分享面板、定位外掛 | TestFlight 實機 4 項可用 | M | L1、Apple 帳號 | 🔒 動錢 |
| L3 | 合規缺口 | 聯絡信箱仍是 `[CONTACT_EMAIL]`；隱私政策沒有公開網址；舊日記店名未處置（`src/report.ts:7`；`docs/round3/STORE-LISTING.md` 必要 3、7；`state/ROUND3-PROGRESS.md`） | Cross 給信箱；做 `public/privacy.html`；依 Q3 處理店名 | 審核備註對照表 1–8 沒有「缺」 | S | Cross、Q3 | 🔒 對外 |
| L4 | 送審台灣區 | 需要 Xcode、Apple 帳號、真機截圖（`docs/round3/STORE-LISTING.md`；`docs/round3/CAPACITOR-READY.md` §3） | 照 CAPACITOR-READY §3 的 8 步做 | App Store 審核通過；沒有 4.3(b) 退件 | L | L1–L3 | 🔒 發布、動錢 |
| L5 | 日本區 | 沒有日文介面；文案沒經母語者（`docs/round3/STORE-LISTING.md` 日本章） | 日文介面＋母語者驗證；先只上台灣 | 母語者簽核一次；日本章三個前提成立 | L | L4 | 🔒 發布 |
| L6 | 多人前的成本與配額 | Places 免費 1,000 次／月；單人一輪量測就用 640 次（`DECIDE-DEV-DOC-v1.md` §16；`state/ROUND4-PROGRESS.md`） | GCP 配額上限、每人每日口令上限、成本告警 | 月帳單有上限；超過自動降級不中斷 | M | — | 🔒 動錢 |
| L7 | WOO 遙測 | Vercel log 保留短，匿名 log 會斷（`docs/round3/STRATEGY.md` R11、§1.2） | 每週人工匯出，或接 log drain（先過隱私評估） | 每週有 WOO 數字；log 不含 place_id、座標 | M | 隱私評估 | 🔒 改權限 |

## 4. Cross 要做的決定

| # | 問題 | 建議 | 理由 |
|---|---|---|---|
| Q1 | 「約會吃好一點」要不要擋酒吧類？ | 擋。把外帶用的酒吧清單加到約會的排除清單；只剩酒吧時整批放回 | 情境名是「吃好一點」，口令要點菜（`src/scene.ts:109`）。軟篩放回保證不空手（`state/ROUND5-PROGRESS.md` 做了什麼）。改動 ≤ 5 行 |
| Q2 | 試用結束後走哪條路：上架 iOS，還是維持 PWA 自用？ | 先維持 PWA 到試用結束。WOO 連續 4 週 ≥ 10（⚠️ 預設門檻）才開 L1–L4 | 上架要 Apple 帳號與費用 🔒；真功能先硬才值得上（`docs/round3/R2-personality-store.md` §0-1；`docs/round3/STRATEGY.md` §4） |
| Q3 | 舊日記與除錯畫面裡的店名怎麼處理？ | 試用期不動；送審前一併處理，列為 L3 依賴 | 單人本機資料；條款結論文件寫「無法下結論」（`docs/round3/R3-discovery-price.md` §3.4）；改存法有費用 |

## 5. 文件之間的矛盾或過時內容

| # | 矛盾 | 證據 |
|---|---|---|
| 1 | README 說「剩兩件事：填 API 金鑰、啟用 Places」。金鑰與 Places 早已驗證可用，正式站已到 Round 7 | `README.md` 現在的狀態；`DEV-PLAN-2.md` §0；`state/HANDOFF-2026-11-03.md` |
| 2 | README 只寫到 Round 3；Round 4–8 只在 `state/` | `README.md`；`state/ROUND4-PROGRESS.md` 起 |
| 3 | 卡片數：README 與規格 §3.1、§13.1 寫 7 張；規格 §6 標題寫八張；程式有 8 張（含 travel） | `README.md` 結構；`DECIDE-DEV-DOC-v1.md` §3.1、§6、§13.1；`src/cards.ts` |
| 4 | e2e 條數四種寫法：36、38、94、108＋5 | `README.md`；`docs/round3/DEV-PLAN-3.md` §0；`state/ROUND3-PROGRESS.md`；`state/ROUND6-PROGRESS.md` |
| 5 | README 說 `/api/order` 實作在 `api/order.ts`；Round 4 已搬到 `src/orderHandler.ts` | `README.md` 結構；`state/ROUND4-PROGRESS.md` commit `d18b35d` |
| 6 | 規格 §8 說單人每日 ≤ 5 次 Places、不會超免費額度；Round 4 每道口令最多 4 次，一輪量測用 640 次 | `DECIDE-DEV-DOC-v1.md` §8、§16；`state/ROUND4-PROGRESS.md` |
| 7 | 護欄 G3 寫 Places ≤ 2 次／口令；Round 4 放寬到 4 次，沒有改 STRATEGY | `docs/round3/STRATEGY.md` §1.3；`state/ROUND4-PROGRESS.md` 風險 |
| 8 | 規格 §6 的吃／歇流程沒有「先選情境」；reissue 仍寫「店關了」；Round 3 改「換一家」、Round 5 加情境頁 | `DECIDE-DEV-DOC-v1.md` §6；`state/ROUND5-PROGRESS.md`；`src/scene.ts` |
| 9 | 規格 §1.2 說「使用者自建情境」是 v2 不做；Round 5 的「其他」已可手打情境 | `DECIDE-DEV-DOC-v1.md` §1.2；`state/ROUND5-PROGRESS.md` |
| 10 | 試用起算日：10-30 決定 vs 11-01 上線（§1 已標 ⚠️） | `state/ROUND4-PROGRESS.md`；`state/HANDOFF-2026-11-03.md` §2 |
| 11 | `DEV-PLAN.md` 寫 S10 部署 ❌、E2E 未過；兩者在 `DEV-PLAN-2.md` §0 起已過時 | `DEV-PLAN.md` 現況三分表；`DEV-PLAN-2.md` §0 |

## 6. 狀態（2026-11-04，Round 10）

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

~~已知未修：早上「約會吃好一點」常找不到 4.3★，改派附近最高分（4.1–4.2★），可能走 30 分以上（checker 第 2 輪）。~~ Round 11（2026-11-04 19:21 上線）：約會最多走 15 分；放寬評分時派 15 分內最高分。早上實測排在 11-05。

下一步：Cross 處理表中「待 Cross」各項，並決定約會要不要加步行上限；日期未知。
