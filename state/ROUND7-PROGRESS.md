# Round 7 進度（接手用）

> 最後更新：2026-11-02 15:55（東京）。分支 `claude/nifty-ramanujan-szofu5`，repo `cc4wang-ui/general-decision`。
> **2026-11-02 15:48 正式站上線 Round 7**（Cross 回「麥當勞不用排除 直接上線」）：`dpl_GRtU7onjopNWnQ1YrXRnQ9rM6eyA`，程式碼 `94b4e0b`，檔案跟 R7 preview-1 相同，直傳 target production。別名 general-decision.vercel.app。
> 上線驗證：首頁回 `index-Bhx1KeXk.js`、`/api/probe` 404、`/api/order` GET 405、runtime error 0。
> 回復點：Round 6 `dpl_EFM2ouyUzAqQC1KEzJaxCK1bh7i5`（Vercel rollback 一鍵）。
> ⚠️ Vercel 接在 repo：合併到 `main` 會從 git 重新部署正式站（程式碼相同）。合併時機由 Cross 決定 🔒。
> 新的 session 先讀 `state/ROUND4-PROGRESS.md`（直傳做法）、`state/ROUND6-PROGRESS.md`，再讀這份。

## 目標契約｜R7 東京歇關鍵字

- **Cross 原話**（2026-11-02 14:05）：「開始修東京「歇」的關鍵字」
- **目標**：人在日本選「歇」，派到的是真的能坐下喝一杯的店，不是水煙吧、購物中心。
- **成功指標**（Cross 的白話，來自 Round 6 文件「下一輪候選」）：rest 在日本用日文關鍵字；排除 hookah_bar／shopping_mall。
- **STOP 條件**：
  1. 日本的「歇」查詢送日文關鍵字：咖啡→カフェ、酒吧→バー、居酒屋→居酒屋、熱炒燒烤→焼き鳥。修飾詞照舊（電源／静か）。台灣的查詞一字不改。
  2. 選「歇」時，水煙吧（type `hookah_bar`，或店名含 シーシャ／shisha／水煙）、購物中心（`shopping_mall`／`department_store`）不派；附近真的只剩這些才整批放回（`relaxed` 標記）。
  3. 真資料：新宿駅 6 個歇情境（含「其他／有插座」），派到的 0 筆是水煙吧或購物中心；查詞在 `how` 裡看得到是日文。白天量一次，深夜（東京 01:00 前後）再量一次。
  4. 台灣的行為不變：既有單元測試（歇的 TW 查詞、篩選）照原樣過。
  5. 閘門過 → preview → checker → Cross 決定上線 🔒。
- **等級**：M（正式站交付；Cross 決定上線）。把關：獨立 checker 子代理。
- **預算**：量測約 2 次 × 15 Places ＋ 12 Claude ≈ US$2；token 主工作 ~150k ＋ checker ~170k。
- **保留事項**：上線 🔒（正式站 production 部署）。
- **⚠️ 假設**：
  - 熱炒燒烤在日本對應「焼き鳥」（日本沒有熱炒攤；居酒屋已是另一個選項）。
  - 麥當勞（`fast_food_restaurant`）不排除：深夜東京常是唯一有插座、還開著的店。Cross 要排再加。
  - 「約會派到酒吧」不在這輪（Cross 原話只講歇）。
  - 深夜量測用這個 session 自己排的喚醒（東京 01:00），不另外建排程任務。

## STOP 現況

| # | 條件 | 現況 |
|---|---|---|
| 1 | 日文關鍵字 | ✅ 單元 `scene.test.ts`「Round 7」；preview-1 真資料 6/6 查詞日文（カフェ／電源 カフェ／静か カフェ／有插座 カフェ） |
| 2 | 排除水煙吧／購物中心 | ✅ 單元：type hookah_bar／shopping_mall／department_store、店名シーシャ／shisha 不派；只剩這些才放回 |
| 3 | 真資料 0 筆水煙吧／購物中心 | 白天 ✅（14:40，6/6 咖啡店）；深夜：Cross 決定不等，直接上線。東京 01:00 仍會量一次當上線後驗證（不是閘門） |
| 4 | 台灣不變 | ✅ 單元 590 全過（含 Round 5 的 TW 查詞測試原樣） |
| 5 | 閘門 → preview → checker → Cross 🔒 | 閘門 ✅；preview-1 ✅；**checker 沒跑**：Cross 2026-11-02 15:45 決定直接上線（Cross 原話「麥當勞不用排除 直接上線」）。這是 Cross 的決定，不是 maker 跳過 |

## 做了什麼（`94b4e0b`）

- `src/scene.ts`：`restBase(base, country)` 日本把卡片上的中文基本詞換成日文（咖啡廳→カフェ、酒吧→バー、居酒屋→居酒屋、熱炒 燒烤→焼き鳥）。歇一律 `avoidTypes` 加 hookah_bar／shopping_mall／department_store；選咖啡再加 `avoidNames: SHISHA_RE`（店名シーシャ／shisha／hookah／水煙，因為 NAROZ 把自己標成 cafe）。`passes()` 多一條店名檢查。
- `src/lanes.ts`：`pickLane` 的歇查詞先過 `restBase`。修飾詞（電源／静か）與第二次放大查詢（同關鍵字）照舊。
- `src/probe.ts`：量測的規則檢查把店名傳進去（店名擋得到才量得到）。
- 測試：`tests/unit/scene.test.ts` 新增 4 條（restBase、pickLane 日文、widen 保留、篩選）；既有 1 條預期值 `電源 咖啡廳` → `電源 カフェ`。
- 改動：src 3 檔 +30／−6 行。

## 閘門（2026-11-02 14:20）

typecheck ✅、單元 590 條 ✅（`TZ=Asia/Taipei`）、build ✅（前端 JS hash 不變：改的都是伺服器端用到的分支）、check:bundle ✅、smoke ✅、e2e r5-scene＋budget＋r6-station 23 條 ✅。

## Preview

| 名稱 | deployment | 內容 |
|---|---|---|
| R7 preview-1（= 正式站） | `dpl_9jUthkLRmM64Zy1y1t1SKE9kCvJd`（general-decision-3jj8zlppn-cc4wang-uis-projects.vercel.app） | `94b4e0b`。正式站（Round 6）的檔＋7a–7c（lanes、scene、probe）。直傳做法同前；打包腳本 scratchpad `tools/pack-r7.mjs` |

## 實測

### 白天（2026-11-02 14:40 東京，preview-1）

原始回應逐字存 scratchpad `r7check/scene-shinjuku-day.json`＋`.meta.txt`；整理腳本 `tools/r7-rest.mjs`。

| 歇情境 | 查詞 | 派到 | type | 距離 |
|---|---|---|---|---|
| 一個人放空 | カフェ | コメダ珈琲店 新宿ファーストウェスト店 | cafe | 444／600 |
| 工作讀書 | 電源 カフェ | ギャップ カフェ 新宿フラッグス店 | coffee_shop | 107／1000 |
| 朋友聊天 | カフェ | Shinjuku CROSSING cafe&dining | cafe | 327／1000 |
| 談事情 | 静か カフェ | カフェ BORECA新宿 | cafe | 581／1000 |
| 等人 | カフェ | Shinjuku CROSSING cafe&dining | cafe | 327／400 |
| 其他／有插座 | 有插座 カフェ | 猫カフェMOCHA ラウンジ 新宿店 | cat_cafe | 304／1000 |

- 歇 6/6 查詞日文、6/6 咖啡類、0 筆水煙吧／商場、0 筆放大查詢。吃 6/6 也過（12/12）。
- 對照：同一地點深夜 preview-2（Round 6，中文「咖啡廳」）歇 6 筆是水煙吧 ×2、商場 ×2、shisha cafe ×1、麥當勞 ×1。
- 「其他／有插座」派到貓咖啡：是咖啡店，但有插座與否沒驗（Google 沒這個欄位）。跟 Round 5 一樣是關鍵字盡力。
- 量測費：約 15 次 Places＋12 次 Claude。

### 深夜（上線後驗證，東京 2026-11-03 01:00）

session 自己排了喚醒，到時打 preview-1 的 probe（程式跟正式站相同；正式站的 probe 是 404），存 `r7check/scene-shinjuku-night.json`，只回報不開 checker。

## Cross 決定（2026-11-02 15:45）

「麥當勞不用排除 直接上線」→ 麥當勞（fast_food_restaurant）維持不排除；不等深夜量測、不跑 checker，直接上正式站。

## 已知風險／下一輪候選

- 深夜東京「歇」的真資料還沒有（白天 6/6 乾淨）。深夜店少，放大 2.5 倍後有沒有又撈到水煙吧，01:00 的量測會知道。
- 「其他／有插座」派到貓咖啡：Google 沒有插座欄位，關鍵字只能盡力。
- 「約會」派到酒吧（Bar Vier）：約會的排除清單沒有酒吧類。下一輪候選。
- 「去」卡的交通選項仍然沒有作用。
- 定位可疑 60 秒／300 m 的門檻沒有實機數據。
