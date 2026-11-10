# ADR-002：CI 門檻——GitHub Actions 三個 job 加 main 分支保護，紅燈不能合併

- 狀態：**已接受**（改進方案第 2 步，2026-11-09 落地並驗證通過；整體計畫由用戶 2026-11-08 ~23:53 批准「全部做到完」）
- 日期：2026-11-09
- 決策者：用戶（ワン）
- 相關 PR：`cc4wang-ui/general-decision` PR #40（`ci/add-workflows`，base main `8ffcbda2`，merge commit `02999c9a`）；`cc4wang-ui/daily-ten` PR #31（`ci/add-workflows`，merge commit `0362b917`）；後續修訂 PR #45（CI lint gate＋job 改名，merge `f8c1bbe5`，見「決策」一節的改名紀錄）
- 實施：step 2（`.github/workflows/ci.yml`＋main 分支保護；驗證 A／B／C 全過，見「驗證」一節）
- 來源（本 ADR 依據以下全部來源，不只一份文件；沒有任何主張是憑空寫的）：
  - `~/workspace/improvement-research/IMPROVEMENT-PLAN.md` §1 第 4 層（CI 門檻設計）與 §3 誠實限制第 4 項（Danger／PR 模板只能防「沒寫」）、§1 第 6 層（ADR 存放規則）
  - `~/workspace/improvement-research/ci-gates/REPORT.md` §1（required checks、skipped 漏洞、Strict、Do not allow bypassing）、§2（TypeScript 的 `required` 彙總 job 模式）、§3（merge queue：私有 repo 需 Enterprise Cloud）、§4（Danger 核心限制）、§5（可直接套用的 YAML 模式，Node 22）
  - `~/workspace/improvement-research/staging/ci-landing/LOG.md`（全文：step 2 落地過程、分支保護規則 GD 86036621／DT 86036664、驗證 A／B／C）
  - `~/workspace/improvement-research/staging/step3-fix-general-decision/REPORT.md` §6（`check` job 改名為 `check (tsc + lint + vitest)`、新增 Lint step）
  - `~/workspace/improvement-research/ERROR-TAXONOMY-STATS.md`（G79、G91、G101、G109、G114 各行與 §3 第 4 層小結）
  - `~/workspace/improvement-research/staging/step4/adr-verification/REPORT.md`（額外 ADR 候選評估：候選 1 建議落地為 ADR-002；候選 4 併入本 ADR 當 guardrail）
  - `~/workspace/improvement-research/staging/adr-001-type-brand-only.md`（ADR-001 草稿：格式與語氣的對照本；另引其「驗證」一節轉述的 red-team round 14 §10 書面檢討）
  - `~/MEMORY.md`（僅一處：PR #45 merge `f8c1bbe5`、CI 5/5 綠燈；ERROR-TAXONOMY-STATS.md §5 第 11 項亦引此處為合併紀錄）
  - 落地當時的 `.github/workflows/ci.yml` 快照：`~/workspace/improvement-research/staging/ci-gd-push/.github/workflows/ci.yml`（GD，160 行）與 `~/workspace/improvement-research/staging/ci-dt-push/.github/workflows/ci.yml`（DT，173 行）
  - 協調者對話紀錄（非 stage-report 檔案，見「驗證」一節誠實註明）：browser task `7093c0d5` 回報＋協調者 API 驗證（PR #45 的 `mergeable_state: blocked` → `clean`）
- 存放位置（計畫規定）：repo 內 `docs/adr/`，一個決策一個檔案。**本文件是 staging 草稿**，正式落地時由實施 PR 移入 general-decision repo 的 `docs/adr/adr-002-ci-gate.md`，內容不改。本 ADR 是 general-decision `docs/adr/` 的 canonical 副本；daily-ten 鏡像同一設計，不另存第二份（見「決策」一節的範圍註記）。舊 ADR 永不刪除或重寫，只能被新 ADR 取代。

## 背景

改進方案之前，「PASS」是人寫出來的字，不是機器跑出來的結果。round 11 實作報告寫「tsc：PASS」，實際 `npx tsc -b` 是 exit 2，5 個型別錯誤全在測試檔（G79）；round 14 又重演一次，實作報告寫「`npx tsc -b` exit 0」，實際是 exit 2，2 個 TS6133 未用 helper（G91）。同一類說法不實在兩輪內重現兩次，證明「tsc 是最後一步、輸出要親自讀」靠人工紀律守不住（red-team round 14 §10 書面檢討）。同時 e2e 從沒進 CI，只在本地跑；Chromium 1194 全敗／1243 全過曾被誤讀為 flaky，其實是環境漂移。計畫第 2 層已定下「PASS 的唯一可信來源是 CI 產出的報告」，本 ADR 把那句話落成機器門檻。

## 決策

**GitHub Actions CI（三個 job）＋ main 分支保護（classic rule），三個檢查全綠才能合併。** 具體設計（general-decision，daily-ten 鏡像同一結構，job 名見範圍註記）：

1. **`check` job（快速回饋）：tsc ＋ lint ＋ vitest，Node 22。** 落地當時（step 2，PR #40）是 tsc ＋ vitest，job 名 `check (tsc + vitest)`——當時 repo 沒有 lint script 也沒有 ESLint 相依套件，workflow 沒有編造一個 lint 指令（ci.yml 快照註解明載）。step 3 修復 PR（PR #45）加了 `npm run lint`（置於 Typecheck 之後、Unit tests 之前），job 名隨之改為 `check (tsc + lint + vitest)`（fix-GD REPORT §6）。tsc 是獨立的一步，不可併進 vitest：Vitest 用 esbuild 跑測試，不做型別檢查，單元測試全過不代表型別沒錯。
2. **`e2e` job（Playwright，Chromium）：獨立 job，不拖慢快速檢查。** `npx playwright install --with-deps chromium` 裝 lockfile 決定的版本（落地時 GD：Playwright 1.63.0／Chromium 1243；DT：1.56.1／1194），瀏覽器版本寫進 run log；`playwright.config.ts` 已寫 `browserName: 'chromium'`（PR #39 已加，落地前置條件）。失敗時也要上傳 Playwright 報告（`if: ${{ !cancelled() }}`）。
3. **`required` 彙總 job（`if: always()`，`needs: [check, e2e]`，jq 檢查每個結果嚴格等於 `success`）。** 這是整個設計的關鍵，不是裝飾。
4. **觸發與併發：** `pull_request` 全跑；`push` 只跑 main。同分支新 push 取消舊 run，避免舊綠燈覆蓋新紅燈。
5. **分支保護（main，classic rule）：** general-decision rule **86036621**，daily-ten rule **86036664**。兩邊相同設定：Require PR（0 required approvals）、Require status checks（三個皆選：`check`、`e2e`、`required`）、Strict（Require branches to be up to date）、Require conversation resolution、Do not allow bypassing（管理員亦不可繞過）。未開：linear history、Code Owners、deployments、Restrict push、force push、deletions；Pull Requests 設定未動（維持 merge commit）。

### 為什麼需要 `required` 彙總 job：skipped 洞

GitHub 自己的 required-check 判定把 **skipped 當成 Success**——即使是 required check 也不擋合併；依賴失敗 job 的 job 會被跳過、可能不擋合併。這個漏洞記載於 ci-gates 研究報告 §1「漏洞注意」（附 GitHub 官方文件連結，官方建議對這類 required checks 用 `always()` 搭配 `needs`），計畫 §1 第 4 層亦明載同一句話，落地版 ci.yml 的註解也寫了同一機制。**誠實註明：LOG 本身沒有寫這段 rationale**——LOG 只記載「兩個 workflow YAML 皆驗過（jobs check／e2e／required）」與規則設定，沒有解釋彙總 job 為何存在。Rationale 的來源是上述研究報告與計畫，不是 LOG。

彙總 job 的堵洞方式是：不問「有沒有 failure」，而是要求每個 `needs` 的 result 嚴格等於 `"success"`；任何 skipped／failure／cancelled 都讓 `required` 失敗。`if: always()` 保證即使 `check` 或 `e2e` 失敗，`required` 仍會跑起來判定，而不是跟著被跳過。模式取自 microsoft/TypeScript 的 `required` job（ci-gates REPORT §2 關鍵發現 2）：狀態來自 job 結果本身，不是人工填寫——這是讓「報告寫 PASS、實際 FAIL」變成不可能的結構。

### 護欄：CI job 改名須同步更新分支保護 required-check 清單，否則合併被擋

分支保護的 required-check 清單認的是 **job 顯示名稱**（例如 `check (tsc + lint + vitest)`），不是 job ID。改 job 名而不改清單，舊名永遠不會再回報，PR 合併面板永遠顯示 Expected，合併被擋住——而擋住的規則不在 repo 任何檔案裡，在 GitHub 設定裡，`grep` 搜不到。**事件證據（G114）：** step 3 修復 PR #45 把 job 改名為 `check (tsc + lint + vitest)`（fix-GD REPORT §6），rule 86036621 仍要求舊名 `check (tsc + vitest)`，舊名顯示 Expected、擋合併；更新 rule（刪舊名、加新名）後 PR #45 才可合併，合併 `f8c1bbe5`。**來源誠實註明：** rule 更新與 API 驗證（`mergeable_state: blocked` → `clean`）只有協調者對話紀錄（browser task `7093c0d5` 回報＋協調者 API 驗證），沒有 stage-report 檔案；ERROR-TAXONOMY-STATS.md §5 第 11 項亦明載此限制。改名本身有檔案證據（fix-GD REPORT §6），合併有紀錄（PR #45 merge `f8c1bbe5`，CI 5/5 綠燈）。

**往後規則：任何改 CI job 名稱的 PR，必須在同一 PR 的描述裡寫明「已同步更新分支保護 rule 的 required-check 清單」，否則視為未完成。** 檢查清單不在 repo 內，所以只能靠 PR 描述與人工核對——這是本設計已知的人工缺口，見「負面後果」。

### 範圍註記：canonical 在 general-decision，daily-ten 鏡像

本 ADR 存在 general-decision `docs/adr/`，是唯一 canonical 副本。daily-ten 鏡像同一設計與同一規則設定（DT rule 86036664；DT PR #31 落地、PR #32 驗證 C），不維護第二份 ADR，避免兩份漂移。兩邊 job 名不同是刻意的：DT 的 `check` job 名是 `check (repo checks + glossary + unit)`（repo 檢查＋glossary＋單元測試），GD 的是 `check (tsc + lint + vitest)`；`e2e` 與 `required` 兩邊同名。鏡像的是結構（三 job＋三 required＋同一保護設定），不是字面 job 名。

## 後果

### 正面後果

- **T1／B1 類的 tsc 假 PASS 缺陷，現在由機器在 push 時擋下，不再靠人親自讀輸出。** 首例已發生：G101——step 3 修復 PR #45 在舊基底驗過全綠，合併態 15 個 tsc 錯誤（`rules.ts` 4、`areas.test.ts` 9、`place-photo.test.ts` 2），是 PR #45 的 CI `check` 在合併態擋下的，不是人發現的。ERROR-TAXONOMY-STATS.md 記為「step 2 上線後首次抓到 finding」，上線前 0 個。
- **紅燈 PR 合併被鎖住，正常 PR 不受影響。** 驗證 A（故意 tsc 失敗 PR #41）：check exit 2、`required` exit 5，Merge 按鈕全程鎖住，PR 關閉未合併。驗證 B（正常 PR #42）：CI 全綠（1034 個測試全過）後 Merge 按鈕啟用，以 merge commit 合併（`1bc58506`）。驗證 C（DT PR #32）：三個 required checks 出現且合併鎖住。保護擋得住紅燈、擋不住正常流程——step 2 完整驗證通過（LOG，2026-11-09 13:54 JST）。
- **「報告寫 PASS、實際 FAIL」在結構上不可能再由一張嘴決定。** 狀態來自 job 結果本身（`required` 彙總 job，見「決策」一節）；PR 描述必須貼 CI 連結或數字，審查者對照 CI 結果核對（計畫第 2 層）。

### 負面後果（誠實的代價）

- **每個 PR 都要付 CI 時間，最慢的是 e2e。** 實測：驗證 A 的 run 4 分 01 秒（check 12 秒失敗、e2e 3 分 53 秒通過）；驗證 B 的 run 4 分 20 秒（check 34 秒、e2e 4 分 12 秒、`required` 3 秒）。e2e 佔每次 run 的九成以上時間。CI 分鐘數本身未在本 ADR 量化（沒有帳單數字來源），不編數字。
- **紅燈就擋合併，沒有例外通道。** Do not allow bypassing 含管理員在內——紅燈時連管理員也不能強行合併，只能修綠再合併。驗證 A 證明這點是真的，不是設定上的裝飾。
- **門檻只覆蓋 job 實際跑的東西，沒跑的就不擋。Stryker 不在 CI 裡。** `grep`（不分大小寫）計數 stryker 於 `.github/workflows/ci.yml` → **0**（G109，紅隊獨立確認）；`thresholds.break: 95` 只管本地 run，不擋任何 CI check。加 CI Stryker job 明確 out of scope，待使用者裁定。同理 e2e 門檻只跑 `tests/e2e`，不含 `tests/shots` 截圖比對（ci.yml 註解明載，刻意不跑）。
- **分支保護規則不在 repo 裡，改名、改規則都可能漂移。** G114 就是漂移的實例：job 改名了，rule 沒跟上，合併被擋——這次擋住的是好事（fail-closed），但同一機制也意味著「rule 被人改壞」不會出現在任何 PR diff 裡。本 ADR 把 rule 號（86036621／86036664）與設定寫下來，是目前唯一的文字錨點；rule 本身沒有版本控制。
- **本地 hook 仍可被繞過。** Husky pre-push 跑 `tsc --noEmit`，但 `--no-verify` 就能跳過本地 hook——所以 CI 必須重跑同一套檢查（計畫第 3 層）。CI 是最後一道門，不是第一道。

### 未變的東西

- Linear history **未開**：合併仍用 merge commit（PR #40、#42 皆為 merge commit；Settings → General → Pull Requests 未動）。
- **0 required approvals**：沒有人類核准門檻。擋合併的是 CI，不是 reviewer。PR 仍需經過 PR 流程（不能直接 push main，編輯器亦顯示 "You can't commit to main because it is a protected branch."），但核准人數要求是 0。
- 測試本身的品質要求未變：紅綠證明、牙齒探針、mutation testing 仍是第 5 層的要求，CI 只保證「跑了且綠了」，不保證「斷言有意義」。期望值本身對不對，CI 證明不了（計畫 §3 誠實限制第 2 項）。

## 考慮過的替代方案

| 方案 | 內容 | 為何拒絕／未採 |
|---|---|---|
| **本 ADR：GitHub Actions 三 job＋分支保護（已實施）** | 如上 | **已落地（PR #40／#31），驗證 A／B／C 全過。** |
| (a) 沒有 CI，靠本地紀律 | 本地跑 tsc／lint／vitest／e2e，靠「tsc 是最後一步、輸出要親自讀」守住 | 拒絕。G79（round 11 T1）與 G91（round 14 B1）是同一類失敗在兩輪內重現兩次的證據：人工紀律已經兩次守不住。CI 是結構修法，不是第三次提醒。 |
| (b) 只用 Danger／PR 模板檢查 | Danger 規則（改程式碼沒改測試就擋、PR 描述太短就擋）＋PR 模板必填根因／Before／After／測試證據 | 拒絕（作為唯一防線）。計畫 §3 誠實限制第 4 項與 ci-gates REPORT §4 核心限制：Danger 與模板只能防「沒寫、沒附」，防不了「寫假的」。它們仍有價值（PR 模板已在計畫步驟 1 採用），但不能替代 CI 親自跑、親自上報。 |
| (c) Merge queue | PR 全綠後進佇列，在「合併後實際會出現的組合」上重跑 required checks，通過才合併 | 未採。私有 repo 要用 merge queue 需要 Enterprise Cloud（ci-gates REPORT §3，計畫 §1 第 4 層亦同）；本專案是公開 repo，技術上可用，但 PR 量未到需要佇列的規模。**未來選項：** PR 量成長、合併態衝突（G101 類：舊基底驗過、合併態失敗）反覆出現時，由新 ADR 重新評估；CI 必須把 `merge_group` 列為 workflow 觸發事件，否則檢查不會跑。 |
| （附註）Ruleset 而非 classic branch protection | GitHub 較新的 ruleset 機制，可套多 repo、可改 enforcement 狀態 | 未採。研究報告指出 ruleset 較新靈活、官方未宣告舊版棄用；落地時選 classic rule（GD 86036621／DT 86036664），規模已夠用。日後若要跨 repo 統一規則，可由新 ADR 評估遷移。 |

## 驗證（本 ADR 的證據，不是事後補述）

- **PR #40（GD CI 落地，2026-11-09）：** 瀏覽器上傳 ci.yml（commit `f908c8b4`，160 行，remote blob 已驗 byte-identical）；PR CI run 42559294395 completed success；瀏覽器合併（merge commit `02999c9a`，PR 頁合併前顯示 5 successful checks）；main push run 42560022080 completed success（head `02999c9a`）。
- **PR #31（DT CI 落地，2026-11-09）：** ci.yml 覆寫（舊 58 行 → 173 行，commit `c8bc1b88`，129+/14-）；PR CI run 42559347265 completed success；瀏覽器合併（merge commit `0362b917`，PR 頁合併前顯示 3 successful checks）；main push run 42560082789 completed success（head `0362b917`）。
- **分支保護已開（2026-11-09 13:13–13:17 JST，瀏覽器）：** GD classic rule 86036621、DT classic rule 86036664；瀏覽器開完後重開已存規則確認過。設定見「決策」一節第 5 點（LOG「分支保護已開」一節全文）。
- **驗證 A 通過（2026-11-09 13:19–13:38 JST）：** GD PR #41「test: branch protection blocks red checks (do not merge)」，分支 `test/branch-protection-fail`（`src/diary.ts` 末尾加 `const _protection_test: string = 123;`，commit `ed62e6c`）。三個 required checks 皆出現；執行中 Merge 按鈕鎖住；CI run 42561316901 completed／failure，4 分 01 秒——check 12 秒失敗 exit 2（TS2322＋TS6133）、`required` 彙總 job 失敗 exit 5、e2e 通過（3 分 53 秒）；紅燈後 Merge 按鈕仍鎖住，全程未曾可用。PR #41 已關（未合併），分支已刪；main 仍 `02999c9a`。
- **驗證 B 通過（2026-11-09 13:38–13:51 JST）：** GD PR #42「test: branch protection normal flow (merge me)」，分支 `test/branch-protection-ok`（`src/diary.ts` 末尾加一行情註解）。三個 required checks 皆出現；執行中 Merge 按鈕鎖住；CI run 全綠，4 分 20 秒（check 34 秒，47 個測試檔、1034 個測試全過；e2e 4 分 12 秒；`required` 3 秒）；全綠後 Merge 按鈕可用，merge commit `1bc58506`（雙 parent `02999c9`＋`8b86775`）；main push run 42563994963 completed／success。測試分支已刪。
- **驗證 C 通過（2026-11-09 13:38–13:41 JST）：** DT PR #32「test: branch protection checks appear (do not merge)」，分支 `test/branch-protection-dt`（`js/game/core.js` 末尾加一行情註解，commit `9e9fde7`）。三個 required checks 皆出現，標為 Required、"Expected — Waiting for status to be reported"；Merge 按鈕鎖住；編輯器顯示 "You can't commit to main because it is a protected branch."。PR #32 已關（未合併），分支已刪；DT main 仍 `0362b917`。
- **G101（CI 首次抓到 finding，PR #45）：** fix PR 在舊基底驗過全綠，合併態 15 個 tsc 錯誤，PR #45 的 CI `check` exit 2 擋下。來源：ERROR-TAXONOMY-STATS.md G101 行（引 `staging/step3-fix-gd-rebase/REPORT.md` §1、§3）與 §3 第 4 層小結。本 ADR 草稿撰寫者未重讀 rebase 報告全文，G101 的細節（15 錯分布、修法）以 taxonomy 的記載為準。
- **G114（stale required-check，PR #45）：** 見「決策」一節護欄段的來源誠實註明。rule 更新與 API 驗證只有協調者對話紀錄（browser task `7093c0d5`＋`mergeable_state: blocked` → `clean`，合併 `f8c1bbe5`），無 stage-report 檔案；ERROR-TAXONOMY-STATS.md §5 第 11 項亦明載此限制。若日後需要檔案級證據，須補一份合併階段紀錄。
- **Step 2 完整驗證通過（2026-11-09 13:54 JST，LOG 結論）：** A 紅燈鎖住、B 正常合併、C DT 檢查出現＋鎖住——三項皆成立，保護擋得住紅燈 PR、擋不住正常流程。
