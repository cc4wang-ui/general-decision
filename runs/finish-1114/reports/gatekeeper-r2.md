# 獨立把關｜finish-1114｜第 2 輪（最後一輪，Loop mode）

VERDICT: **PASS（附條件）**
ROUND  : 2 / 2
範圍：`git diff faea752..6b88e57`，HEAD 是 `6b88e57`（PR #79，目前仍是 draft）。沒有打正式站和預覽站；GitHub 只用來唯讀查 PR、分支和 CI。

附條件（合併後由總調度確認）：
1. PR #79 在 `6b88e57` 的 CI 跑完而且是綠的。我查的時候 run #117（id 43559722766）還是 `status:"in_progress"`；前一個 commit `0cfa829` 的 run #116 是 `conclusion:"success"`。
2. 合併後 main 的 CI 是綠的。
3. 正式站 `/api/daily-route` 真 POST 回 200。
4. 寫 `.handoff/LATEST.md`（附合併 commit 與正式站證據），並做 STOP 6 的 Cross 表。

## 逐條判定
```
┌──────────────┬──────┬──────┬─────────────────────────────────────────────┐
│ 條件           │ 判定   │ 類別   │ 證據                                          │
├──────────────┼──────┼──────┼─────────────────────────────────────────────┤
│ A 契約忠實度     │ PASS │ —    │ decisions.md「把關第 1 輪後補裁」7 列；只剩 #79 開著 │
│ STOP1         │ PASS │ —    │ 同第 1 輪；prod-after 證據沒有變動              │
│ STOP2         │ PASS │ —    │ 合併前條件 PASS，可以合併（見下）                  │
│ STOP3         │ PASS │ —    │ 同第 1 輪                                      │
│ STOP4         │ PASS │ —    │ 同第 1 輪                                      │
│ STOP5         │ 未到   │ —    │ LATEST 刻意留到合併後；殘留問題見最後一節             │
│ STOP6         │ 未到   │ —    │ 刻意留到合併後（交接檔＋交付訊息）                   │
│ STOP7         │ PASS │ —    │ main.md 第 7 條：逐字的拒絕訊息＋16＋6 分支清單      │
└──────────────┴──────┴──────┴─────────────────────────────────────────────┘
```

## 1. F1 `restorePreferHit`：已修
- `src/dailyDecision.tsx:359–366`：只有在 `kept = t.done === true || (shuffle !== undefined && t.id !== shuffle)` 時才補回旗標。呼叫點 `:584` 有把 `shuffle` 傳進去。
- 完整重新生成時 `shuffle` 是 undefined，自動站的 `kept` 是 false，**不會補**。已完成站會補，單站換店時的其他站也會補。
- 新測試 `tests/unit/dailyDecision-affinity.test.tsx`：
  - 「已完成站…原因行留著」
  - 「完整重新生成的自動站：伺服器沒回旗標就不顯示，就算剛好挑回同一間」
- 有沒有新的謊稱路徑：
  - 單站換店時，伺服器會對沒通過保留重驗的其他站重新搜尋。理論上它有可能均勻抽回同一間店，前端就會補回旗標。
  - 但重新搜尋用的 `usableHere`／`nearOk`／`areaOk`／`venueOk` 跟 `retentionOk` 擋的是同一批條件（排除清單、排除種類、拒絕名單、地區、搜尋半徑、本次已挑）。唯一的差別是：保留重驗用前端送來的舊候選欄位，新搜尋用 Google 的新資料，例如評論數從門檻以下長到門檻以上。這只是理論上的縫，我給不出真實可重現的輸入。
  - 結論：**沒有找到可重現的新謊稱路徑**。
- 已完成站沿用旗標，說的是當初挑選時的原因，屬實。

## 2. F2 換店 −1：已修，沒有引入新問題
- `src/dailyDecision.tsx:376`：src＝`swap:<day>:<stopId>:*`。`recordAffinity` 寫入前會先刪掉同一個 src，所以同一天同一站最多只有 1 筆。測試已改成期待 `[['ramen', -1]]`。
- src 鍵衝突：前綴 `swap:`、`done:`、`spec:` 彼此不同，Google Place ID 也不會是 `*`，所以不會衝突。
- 取消完成誤刪：`dropAffinity` 只刪 `done:<day>:<stop>:<place>` 這個 src，碰不到 `swap:`。
- 清除按鈕仍然清掉全部，這是 Q4 的設計。
- 觀察（不算 FAIL）：同一天同一站先換掉拉麵、再換掉壽司，結果只留「壽司 −1」，拉麵那筆被蓋掉（最後一次為準）。這符合補裁「同一天同一站只算一次」，只是記到的是最後換掉的種類。

## 3. CI 超時的修法：合理，沒有掩蓋問題
- `tests/unit/daily-route-prefer.test.ts:83` 改的是 describe 層級的 `{ timeout: 30_000 }`。斷言沒動，`N = 1500`（`:70`）也沒動。
- 本機用 verbose 實測（逐字）：
  - `沒帶偏好…約 2/8 3298ms`
  - `可用候選集合不變…2908ms`
  - `偏好不會把隨機變成確定… 44ms`
- 每個測試跑 4500 次完整 handler，平均約 0.7 ms 一次；亂數有 seed，結果是確定的，不是卡住或不穩定。CI 的 run #116 在加了時限之後是 `success`。這是測試的工作量問題，跟產品行為無關。
- 建議（可選）：如果 CI 時間是考量，可以把 N 降到 500，同時放寬比例的容忍度。

## 4. A-1～A-4：逐項有處置
- A-1：GitHub 上開著的 PR 只剩 #79，#25、#37 已關。decisions.md 有寫理由。
- A-2：
  - #12：ROADMAP §0 加了「已過時」的註記。
  - #13：ROADMAP §2 第 7 列加了「最新看 §6」。
  - #16：STATE §1 的 Latest release 更新了。
  - #21：`.github/workflows/ci.yml:1–3` 的檔頭更新了。
  - #22：ROADMAP §6 加了「`~/workspace` 沒入庫」的註記。
  - #23：N1 加了「工具已在 PR #44 刪除」。
- A-3：ROADMAP §6 第 2.3 列補了證據：AKOMEYA 的種類判成 `cafe`（`preview-prefer.out.json`），文案維持不變。
- A-4：步驟 4 標成「⏸ 不再追」，decisions.md 寫了「不做＋理由」。
- STATE §3 的 P1 商品庫存、展覽、訂位也寫明不做，並附理由。

## 5. STOP 7：PASS
- `reports/main.md` 第 7 條有逐字結果：`git push origin --delete <16 個已併入 main 的分支>` → `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Destructive or Unwanted Actions].`
- 列了 16 個已併入、6 個未併入的分支（附 commit 數）。跟我第 1 輪用 GitHub 唯讀查詢得到的 23 個分支一致，16 個已併入的數字也和我本機的 `merge-base` 檢查一致。
- 要列進 STOP 6 的 Cross 表（目前未到）。

## 6. 閘門重跑（逐字）
- `npm run typecheck` → `EXIT typecheck=0`
- `npm run lint` → `EXIT lint=0`
- `npm test` → `Test Files  62 passed (62)`／`Tests  1328 passed (1328)`／`EXIT test=0`
- `npm run check:bundle` → `BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`／`EXIT bundle=0`
- `npm run build` → `✓ built in 207ms`／`EXIT build=0`

### STOP 2：合併前條件 PASS，可以合併
- 閘門全過（見上）。
- 2.4 伺服器端完全沒改（diff 不含 `api/`、`src/dailyAffinity.ts`），所以第 1 輪的獨立判斷仍然成立：只做軟排序、不排除候選、不放寬門檻、沒帶欄位時行為不變、完整重新生成仍隨機、不寫 log、伺服器不會謊報 preferHit。
- 預覽站真 POST 證據 `preview-prefer.out.json` 沒有變動，第 1 輪重算的數字仍然有效。
- 前端在預覽站部署（`cde60c2`）之後有改，但只改前端旗標和記分去重，伺服器回應不受影響；有單元測試覆蓋。

## 發現清單（都不擋合併）
| # | 類別 | 位置 | 問題 | 建議 |
|---|---|---|---|---|
| G1 | 其他 | `docs/ROADMAP.md` §6「步驟 4」列、§7.5「2.4」列 | 表頭只有 3 欄，這兩列卻寫了 4 格。GitHub 會把第 4 格丟掉，結果「不做的理由」和「2026-11-14 實作範圍」在 GitHub 頁面上看不到（decisions.md 裡有，所以 A-4 仍然成立）。 | 把第 4 格的內容併進第 3 格。 |
| G2 | 其他 | `docs/ROADMAP.md` §7.5「2.3」列 | 狀態欄已改成「結案」，說明欄還寫「AKOMEYA 今日的 types 未確認…文案決定待使用者看證據後做」，同一列前後矛盾。 | 把說明欄的那句話改掉，或在旁邊註記已經補了證據。 |
| G3 | 其他 | `src/dailyDecision.tsx:376` | 同一天同一站只記最後一次換掉的種類（見第 2 節的觀察）。 | 接受，或在 decisions.md 註明。 |

## 7. 第 1 輪列的「文件與實況不符」1–9
1. STATE 寫 PR #54 not merged：**已修**。
2. STATE 檔頭日期與 Latest release：**已修**（寫的是 PR #79，合併後內容才成立）。
3. STATE P1 live shop information：**已修**。
4. ROADMAP §6／§7.5 的 2.3、2.4：§6 **已修**；§7.5 **部分修**（G1、G2 還在）。
5. ROADMAP 分支清理：**已修**（23／16，待 Cross）。
6. N4 等「待 Cross」列與 STOP 6 表對齊：**還在**，STOP 6 刻意留到合併後；§6「下一步」已改成指向 LATEST 和 decisions.md。
7. `.handoff/LATEST.md`：**還在**，刻意留到合併後；要寫進合併 commit 和正式站證據。
8. #25、#37：**已修**（已關，ROADMAP 有記錄）。
9. feedback-loop.md 第 7、9 條：**已修**（加了總調度註記）。

## 若 FAIL — 交還 maker 的最小修正指示
不適用（PASS）。G1、G2 建議在 STOP 5 收尾時一起修。
