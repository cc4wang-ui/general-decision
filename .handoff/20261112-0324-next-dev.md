# 交接｜next-dev
狀態：待接手
建立：2026-11-12 03:24 UTC｜環境：Claude Code（雲端容器）｜上下文：474,471／400k

## 1. 下一個對話先做什麼
1. 先問 Cross 一題（AskUserQuestion，第一個選項標「（建議）」）：「下一步開發哪一項？」選項照第 2 段「未開始」的 A、B、C、D。Cross 已選就跳過這條。
2. Cross 選 A（建議）時：`git fetch origin main && git checkout -B <指定分支> origin/main && npm ci`，再讀 `src/dailyDecision.tsx` 第 211 行起的 `loadDaily` 與第 476 行 `useState(loadDaily)`，修第 2 段 A 的三個錯。走 /board-intake，S 或 M 級。
3. Cross 選 B、C、D：照第 2 段該項寫的「要 Cross 給什麼」，用一句話請他給，給了再開工。

## 2. 做到哪
- 已完成：今日行程版面重排上線（PR #55，2026-11-11 合併）；空行程說明卡不再被底部按鍵遮住＋CI 安裝瀏覽器失敗自動重試 3 次（PR #57，Cross 說 `核准` 後於 2026-11-12 01:16 UTC 合併，正式站 `dpl_DxG4zKBcK7asvmR6LdFdobwcGkZ3` READY，已抓正式站 CSS 確認含 `.dd-empty{padding:12px 16px}`）。
- 已完成：上一份交接檔（`.handoff/20261111-1457-daily-layout.md`）第 1 段兩條都做完：PR #56、#57 正式部署都是 Ready；今日行程版面沒有待做。
- 外部動作（都做了，不要重做）：合併 #57；取消 #57 的 PR 訂閱與定期檢查；本交接檔 push 到分支 `claude/handoff-daily-layout-j63hzm` 並開草稿 PR。
- 進行中：無。停在安全點，沒有做到一半的檔案或外部動作。
- 未開始：下一步開發，等 Cross 選。候選（依建議順序）：
  - A（建議）今日行程三個已知小錯，一次修掉。理由：ROADMAP §0 規定試用期（到 2026-12-30）`試用期內不加新功能，只修派錯店`；這三個都是修錯、不用 Cross 拍板產品方向。
    1. ROADMAP §7.6 O2：重開頁面後，意圖附著的站從路線掉落（`loadDaily` 過濾器濾掉無候選的指定站，掛載不重跑 `replanDaily`），摘要卻仍說已附著。⚠️ 預設修法：掛載時重跑 `replanDaily`（另一個選項是過濾器保留意圖站）。
    2. ROADMAP §7.4 紅隊殘留 `RT2-F1 rest-only 行程狀態列說錯話`。
    3. 同上 `RT2-F2 missingStops 不完整時漏缺站`。
  - B 2.4 行為回饋迴圈（新功能）。要 Cross 給：核准 Q1–Q11。⚠️ 設計稿在 `~/workspace/general-decision-core-loop-2.0/design-2.4/DESIGN-feedback-loop.md`，不在 repo、本容器也沒有（`ls: cannot access '/root/workspace': No such file or directory`）；Cross 手上若沒有，要重寫設計稿。
  - C 用試用資料調派店規則（ROADMAP N4、N6）。要 Cross 給：在 App 除錯畫面按一次「匯出」，把檔案給我們。
  - D Cross 的待決清單，不寫程式只要裁定：hygiene 報告 #10 試用結束日（12-30 或 12-29）、#14 產品主次（核心班長 vs 今日行程）、#19 直傳時代部署工具要不要拿掉、#20 `npm run taste` 要不要留；ROADMAP N5 Places 上限 🔒、L3 聯絡信箱、L6 GCP 帳單上限 🔒、L7 遙測 🔒。另 2.3 AKOMEYA 按鈕文案待裁。
  - 順手可做（不用問）：刪遠端已合併的舊分支。2026-11-12 `git ls-remote --heads origin` 還有 `claude/fable-repo-hygiene-ui-redesign-6h7sxl`、`claude/handoff-daily-layout-hha4hi`、`claude/vigilant-clarke-dsrqfi`、`docs/adr-001`、`docs/adr-002`、`docs/roadmap-2.0`、`feature/daily-intent-first`、`feature/start-time-input`、`progress/memory-sync`、`server/pr2-partial-seen`、`step3/stryker-threshold`。⚠️ 刪分支前先確認已合併，未合併的不刪（刪資料是保留事項）。

## 3. 做了哪些決定和為什麼
- 建議先做 A，因為試用期規則只准修錯；A 不用 Cross 拍板方向，風險低、都在 `src/dailyDecision.tsx` 與 `api/daily-route.ts`。
- 這一棒不自動開下一棒，因為「下一步做什麼」是定目標，屬 Cross（Claude.md §4：董事長定目標）；Cross 原話：`寫交接檔 看下一步要開發甚麼`，要的是看候選，不是直接開工。
- #57 用一般合併、合併前把 draft 轉正式，因為 `main` 慣例是合併 commit；Cross 原話 `核准`。
- CI 改成安裝瀏覽器失敗重試 3 次，因為 GitHub 執行機兩次解析不到套件伺服器，Cross 說 `我不懂 你想辦法解決`；只重試安裝、不重試測試，門檻沒有放寬。
- 本交接檔走草稿 PR 進 `main`，因為合併 `main` 會觸發正式站部署（保留事項），要 Cross 說 `核准`。

## 4. 試過但行不通的
- 試了重跑一次 CI（rerun_failed_jobs）：失敗，錯誤 `Temporary failure resolving 'azure.archive.ubuntu.com'` → `Failed to install browsers`。原因：GitHub 執行機 DNS 問題，不是程式。已用 `.github/workflows/ci.yml` 的安裝重試解決，不要再手動重跑等它好。
- 試了讓把關子代理在用量上限時繼續跑：失敗，錯誤 `You've hit your 5-hour limit · resets 9am (UTC)`。原因：Opus 用量上限。等重置後用 SendMessage 讓同一個子代理接續，不要另開新的。
- 試了在今日行程用位移進場動畫配固定底部選單：失敗，一進畫面就點膠囊會把頁面捲走 `151` px。原因：transform 讓 fixed 選單改以畫面為定位基準。已改成只淡入，不要再加位移動畫。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/d9eced95-5f75-5249-b568-3637aaaa75b8.jsonl`。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。對話網址：`https://claude.ai/code/session_01NsUyzmcpYr6iApPt9sAFVe`。檢索方法見 §7。不要整份讀。
2. `docs/ROADMAP.md` — §0 試用期規則、§6 待 Cross 清單、§7.4 紅隊殘留、§7.5 2.4 狀態、§7.6 O2 原文。
3. `runs/hygiene-ui-1111/reports/hygiene.md` — 24 條衝突清單，#10、#14、#19、#20 待 Cross。
4. `src/dailyDecision.tsx` — 候選 A 要改的地方：第 211 行 `loadDaily`、第 476 行起元件。
5. `STATE.md` — 產品規則與踩過的坑；開工前先讀。
6. `.handoff/20261111-0627-daily-layout.md` — 今日行程的 testid、色盤守門、版面坑。
