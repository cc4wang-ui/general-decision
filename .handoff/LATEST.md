# 交接｜finish-1114（沒有待接手的開發工作）
狀態：已完成；只剩「只能 Cross 做」的項目
建立：2026-11-14 05:20 UTC｜環境：Claude Code（雲端容器）

## 1. 下一個對話先做什麼
1. 沒有待接手的開發工作。Cross 沒給新目標就不要自己開工。
2. Cross 給新目標時：先讀 `STATE.md`、本檔第 3 段、`runs/finish-1114/decisions.md`（Fable 代核的裁定，Cross 可逐條推翻）。
3. Cross 處理了下表任何一項時，照該列「之後代理做什麼」接著做。

只能 Cross 做（不要催）：

| 項目 | 為什麼只能 Cross | 要他做的一個動作 | 之後代理做什麼 |
|---|---|---|---|
| 真 iPhone Safari 實機確認 | 容器裡只有 WebKit 引擎，沒有實體手機 | 照 `runs/pending-tests/snapshots/live-README.md` §3 開正式站走一次 | 有問題就修 |
| 試用資料匯出（N4） | 資料只在他手機的 localStorage | 在 App 除錯畫面按一次「匯出」，把檔案給代理 | 分析派錯店率、WOO，調規則（N6） |
| 刪 16 個已併入 main 的舊分支 | 平台安全規則擋代理刪遠端分支，兩次：`Reason: [Git Destructive].`、`Reason: [Destructive or Unwanted Actions].` | GitHub 分支頁逐一刪，或對代理加權限規則。清單在 `runs/finish-1114/reports/main.md` 第 7 條 | 無 |
| Places 每日上限 N5 🔒 | 可能動錢 | 選方案（`state/ROUND11-PROGRESS.md` 第 3 節） | 改上限 |
| GCP 帳單上限 L6 🔒、遙測 L7 🔒 | 動錢、改權限 | 裁定 | 照做 |
| 聯絡信箱 L3 | 他的個人資料 | 給一個信箱 | 填入 `src/report.ts` |
| 試用結束後路線 Q2（12-30 前） | 產品方向；上架要 Apple 帳號與費用 🔒 | 裁定上架或維持 PWA | 開 L1–L5、X6 |
| 產品主次（hygiene #14） | 產品方向 | 裁定核心班長與今日行程的主次 | 更新 ROADMAP §1 |
| 全域步行最短 | 要他定「空等多久可以接受」 | 給一個分鐘數 | 實作 |
| Vercel 免費方案每日部署上限 | 升級方案是動錢 🔒 | 不必做；知道即可 | 少 push |

## 2. 做到哪
- 已完成：
  - 正式站重新部署並重驗：main `fb75135` → `dpl_H2rbmAB8wDWdE3Vnx6PFsnZQFLr3`。`tests/prod` iPhone＋WebKit `4 passed (54.8s)`，已完成站無 `eta`（`runs/pending-tests/prod-after/`）。
  - 2.4 行為回饋迴圈最簡版：PR #79 合併（merge `b39bbaef3829184d1563d3d93d74d53574f9ca62`）。正式站部署 `dpl_9rtFtYnM5mA5ccgpqE9X88Qf4CPQ`，前端 `assets/index-D7zkJDcg.js`。
  - 正式站真 POST（2026-11-14 05:2x UTC，`runs/finish-1114/snapshots/prod-prefer.out.json`）：10 次全 200；沒帶偏好 `preferHit` 0 次、帶偏好 3 次、壞輸入 0 次；bundle 含 `decide.daily.affinity.v1` 與「你常選這類」。
  - 閘門：typecheck 0、lint 0、`Tests  1328 passed (1328)`、`BUNDLE PASS`、build 過；PR #79 CI check／e2e／required 綠。
  - 獨立把關：第 1 輪 FAIL（未合併、未試刪分支、範圍漏項、F1、F2）→ 全修 → 第 2 輪 PASS（`runs/finish-1114/reports/gatekeeper-r1.md`、`gatekeeper-r2.md`）。
  - Fable 代核：2.4 的 Q1–Q11、2.3 文案、hygiene #10／#19／#20、步驟 4、P1 庫存類（`runs/finish-1114/decisions.md`）。
  - 文件對齊：STATE §1／§3、ROADMAP §0／§2／§6／§7.5、CI 檔頭；hygiene #12 #13 #16 #21 #22 #23。
  - 過期 PR #25、#37、#58、#62 已關閉。
- 進行中：無。
- 未開始：無。

## 3. 做了哪些決定和為什麼
- 「剩餘開發工作」的範圍＝不需要 Cross 本人資料、帳號、付費的項目。上架線（L1–L5、X6）不做，因為 Q2 已定「先維持 PWA 到試用結束」。跨裝置同步不做，因為產品定義「不做帳號、雲端」。
- 2.4 做最簡版：只做「種類偏好」軟排序。原設計稿不在 repo；權重圖、跨日目的地、讀取愛店都裁定不做。
- 偏好只在既有「前 5 名隨機挑」裡改機率（6：2：1），因為 ROADMAP §7.7：錯判與誤排除永遠不接受。
- 單次手動指定（+3）立刻算偏好；標完成要兩次、換掉要三次。手動輸入是最強訊號。
- 原因行只在伺服器回旗標，或伺服器原樣保留該站時顯示。完整重新生成剛好挑回同一間不顯示，因為那次沒有受偏好影響。
- 換店 −1 同一天同一站只算一次。連換幾間是想換店，不是討厭這個種類。
- 抽樣測試給 30 秒時限。CI 機器比本機慢，預設 5 秒超時；斷言與樣本數沒動。
- 合併不問 Cross：原話 `merge不用再我批准`、`CI 綠了就合併`、`其他fable代替我核准`。合併排在把關 PASS 之後。
- hygiene #19（直傳時代部署工具）不動：刪掉要改 `vercel.json`，風險在正式站，沒有收益。

## 4. 試過但行不通的
- `mcp__Vercel__create_deployment` 的 `gitSource.sha` 給短碼 `fb751353` → `400: incorrect_git_source_info`。不給 `sha`、只給 `ref: main` 就成功。
- 預覽站還在 `BUILDING` 時開分享連結 → 被導到 `vercel.com/login`，API 回 401／404。等建置完成再開就正常。
- 刪遠端分支：`git push origin --delete <16 個>` → `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Destructive or Unwanted Actions].`。不要再試。
- 推新 commit 時，舊 commit 的 CI run 被取消，`required` 會回報 failure。那不是程式問題；只看最新 head 的結果。
- `npm run check:bundle` 用 `git ls-files` 展開檔案：新檔沒 `git add` 會 `ERR_MODULE_NOT_FOUND`。先 add 再跑。
- 上一棒的坑仍有效：WebKit 要 `npx playwright install webkit`＋`install-deps webkit`，再把 `/opt/pw-browsers/*` 連結進同一個目錄；Vercel 每日部署上限是滾動 24 小時。

## 5. 要讀哪些檔
1. 原文：`/root/.claude/projects/-home-user-general-decision/` 底下本次 session 的 `.jsonl`（對話網址 `https://claude.ai/code/session_01NsUyzmGD4namsbTCzLsyPF`）。⚠️ 雲端容器回收後就沒了；讀不到時以本檔為準。不要整份讀。
2. `runs/finish-1114/contract.md` — 目標契約（STOP 1–7）。
3. `runs/finish-1114/decisions.md` — Fable 代核的全部裁定。
4. `runs/finish-1114/reports/` — 小組報告與兩輪把關報告。
5. `src/dailyAffinity.ts`、`api/daily-route.ts` 約第 322–325 行、`src/dailyDecision.tsx` 的 `restorePreferHit`／`recordRouteSignals` — 2.4 的全部產品碼。
6. `STATE.md` §1、§3 — 現況。
7. `.handoff/20261113-…`、`20261112-0340-next-dev.md` — 更早的交接。
