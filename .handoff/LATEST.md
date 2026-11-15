# 交接｜guide-1115（個人生活導遊：把關 R1 修正做到一半）
狀態：待接手
建立：2026-11-15 04:15 UTC｜環境：Claude Code（雲端容器）｜分支 `claude/vigilant-carson-fxshf7`｜草稿 PR #81

## 1. 下一個對話先做什麼
1. `git pull`；確認 HEAD 是本檔所在 commit（訊息 `wip(guide-1115): 把關 R1 修正（做到一半）`）。
2. 讀 `runs/guide-1115/reports/gatekeeper-r1.md` 的發現清單，和本檔第 2 段 A–H 表。逐項核對程式碼：每項「已做／沒做／做一半」寫進 `runs/guide-1115/reports/guide.md` 末尾新節「把關 R1 修正」，附檔案:行與測試名。
3. 補完沒做的項目（第 2 段表）。每項加單元測試。限制：只改 `src/`、`api/`、`tests/`、`runs/guide-1115/`；不寫自由文字解析器；種類只用 type＋品牌；不發明店與時間。
4. 閘門：`npm run typecheck`、`npm run lint`、`npm test`、`npm run check:bundle`（新檔先 `git add`）、`npm run build`。真瀏覽器：本機 `npx vite --port 5199 --strictPort` 後跑 `node runs/guide-1115/snapshots/verify-guide.mjs`（WebKit 加 `BROWSER=webkit`，瀏覽器路徑見第 4 段）。
5. commit、push。等 PR #81 預覽站 READY，跑 `SHARE_URL=<分享連結> node runs/guide-1115/snapshots/preview-guide.mjs`（分享連結用 `mcp__Vercel__get_access_to_vercel_url`；預覽站還在 BUILDING 時會被導去登入頁）。看 view_cafe／good_coffee 不再回 lounge／bar。
6. 請獨立把關第 2 輪（最後一輪；新的 Opus 子代理載入 `anthropic-skills:checker`，只給 Cross 原話、`runs/guide-1115/contract.md`、成品 diff、報告證據欄）。範圍＝R1 發現 A–H＋閘門。
7. 把關 PASS 且 PR #81 最新 head 的 check／e2e／required 全綠 → 轉正式 PR、合併（授權見第 3 段）。合併後：正式站 `BASE=https://general-decision.vercel.app OUT=prod-guide.out.json node runs/guide-1115/snapshots/preview-guide.mjs`；更新 `STATE.md` §1、`docs/ROADMAP.md`（§6 加一列；§7.2 活動標籤「看展覽」→「探索」；新請求欄位與本機 key）、本檔、`.handoff/LATEST.md`。
8. 交付 Cross：一張表（做了什麼、怎麼親眼看到）；請他用真 iPhone 確認鍵盤遮擋與日文輸入法組字（模擬器驗不到）。

## 2. 做到哪
- 已完成：
  - 契約 `runs/guide-1115/contract.md`（STOP 1–9，凍結）。
  - 實作 commit `422f47a`：手動排序（↑↓、`manualOrder`、`reorderOnly`）、輸入修 5 個根因＋「想去哪」輸入框、探索 7 主題＋輪替、沒去過的區域、理由行。單元 1328→1396。報告 `runs/guide-1115/reports/guide.md`。
  - 預覽站 `dpl_EDGFQtZwmco5FbBqXqhGonnC6YLe` 真 POST：主題 16 次全 200、7 主題都有真店；手動順序照做、店沒換、固定行程 23:30 不動（`snapshots/preview-guide.out.json`；報告 `reports/main.md`）。
  - 獨立把關 R1：FAIL（`reports/gatekeeper-r1.md`）。唯一擋合併：STOP 4「看過」沒記。
- 進行中（本 commit 是半成品，但閘門全綠：typecheck 0、lint 0、`Tests  1407 passed (1407)`；未跑 check:bundle、build、e2e、瀏覽器腳本）：把關 R1 修正。修正子代理撞到 Fable 用量上限中斷（`You've hit your Fable limit · resets 3am (UTC)`），沒交報告。我用 grep 粗估各項（不保證完整）：

| # | 項目 | 粗估 |
|---|---|---|
| A | 「看過」的店區域也記；挑區域優先序：沒紀錄→只看過→最久沒去 | 有改動＋測試 |
| B | 輪替跳過已有同類站的主題（有咖啡站跳 view_cafe/good_coffee；有吃飯站跳 destination_meal） | 只有 1 處，可能不完整 |
| C | 「照這個順序更新時間」重開頁面後還在（存檔記待重算） | 有改動＋測試 |
| D | 9 站滿時按 Enter 保留文字並提示 | **看不到改動，視為沒做** |
| E | 按 ↑↓ 後卡片捲回可見、焦點留在按鈕 | 有 scrollIntoView＋測試；瀏覽器驗證要重跑 |
| F | 「沒去過的區域」只挑 3.5 公里內可達區；可達時輪替含 new_area | 有改動＋測試 |
| G | view_cafe／good_coffee 只收咖啡類 primaryType | 有改動＋測試 |
| H | 理由行：不說「你還沒去過」；第一站寫「從出發地步行」 | 有改動＋測試 |

- 未開始：第 1 段第 4–8 步。報告 `guide.md` 第 3 行（STOP 4 實況）、第 18 行（沒帶新欄位時唯一差異＝探索站沒店時標題文案）的更正。

## 3. 做了哪些決定和為什麼
- 手動順序優先於步行最短；沒排過維持自動排法（契約 ⚠️）。
- 改順序後不自動重算，要按「照這個順序更新時間」（避免每按一下就打 Google Routes）。`reorderOnly:true` 只重排不換店。
- 固定行程沒有上下鍵：契約同條寫「固定行程照自己的時間」，把關判可接受。
- 「特別針對一間好吃的餐廳」兩種讀法都支援：主題「值得專程去的餐廳」，或「想去哪」直接打店名。
- 半成品照樣 commit：閘門全綠，不會讓 CI 紅；容器回收會丟掉未 commit 的工作。
- 合併不問 Cross：原話 `merge不用再我批准`、`CI 綠了就合併`、`其他fable代替我核准`。合併排在把關 PASS 之後。
- 已知未修（列入交付）：park 在澀谷一帶合格公園少；午餐站仍固定查定食；地區清單只有 6 區；真 iPhone 鍵盤遮擋與 WebKit 日文組字未實機驗。

## 4. 試過但行不通的
- 子代理跑太久會撞 Fable 用量上限（本次約 34 分鐘＋第二輪中斷）。下一棒一次派小一點的工作，或主對話自己做。
- 推新 commit 時舊 commit 的 CI run 被取消，`required` 記 failure；只看最新 head。
- 預覽站 BUILDING 時開分享連結 → 導到 `vercel.com/login`、API 401／404。等 READY。
- `mcp__Vercel__create_deployment` 的 `gitSource.sha` 給短碼 → `400: incorrect_git_source_info`。
- 刪遠端分支被平台擋（`Reason: [Destructive or Unwanted Actions].`）；不要再試。
- WebKit：`PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/pw`，先 `npx playwright install webkit`＋`npx playwright install-deps webkit`，再 `for d in /opt/pw-browsers/*; do ln -sfn $d <pw>/$(basename $d); done`。容器換了要重做。
- 抽樣類單元測試在 CI 會超過預設 5 秒；給 `{ timeout: 30_000 }`。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/e13d5178-9da8-5d09-bba8-27d225fda2ac.jsonl`（對話 `https://claude.ai/code/session_01NsUyzmGD4namsbTCzLsyPF`）。⚠️ 容器回收後就沒了；讀不到以本檔為準。不要整份讀。
2. `runs/guide-1115/contract.md` — 契約與 Cross 原話。
3. `runs/guide-1115/reports/gatekeeper-r1.md` — R1 發現與修法建議。
4. `runs/guide-1115/reports/guide.md` — 實作報告：新欄位（`manualOrder`、`reorderOnly`、`stops[].theme`、`stops[].themeArea`）、本機 key（`decide.daily.v1` 新欄位、`decide.daily.areas.v1`）、testid、主題→查詢表。
5. `src/dailyThemes.ts`、`src/dailyDecision.tsx`、`api/daily-route.ts`、`src/dailyRouting.ts` — 產品碼。
6. `runs/guide-1115/snapshots/verify-guide.mjs`、`preview-guide.mjs` — 驗證腳本。
7. `STATE.md` §2、`docs/ROADMAP.md` §7.7 — 守則。
