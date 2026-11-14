# 獨立把關｜finish-1114｜第 1 輪（Loop mode）

VERDICT: **FAIL**
ROUND  : 1 / 2
驗收對象：分支 `claude/vigilant-carson-fxshf7` HEAD `faea752`（draft PR #79），基準 `origin/main` = `fb75135`
驗收時間：2026-11-14 04:55 UTC 前後。沒有打正式站和預覽站；GitHub 只做了唯讀查詢（列出 PR 和分支）。

## 總判定：FAIL
- A 契約忠實度：FAIL（類別：其他）。範圍少收了一些不需要 Cross 就能做的項目，見 A。
- B：STOP 1、3、4 PASS。STOP 2 FAIL，只差「合併」這一步，實作和證據的子項都 PASS。STOP 7 FAIL，舊分支這次沒有嘗試刪除。STOP 5、6 未到。

---

## A 契約忠實度：FAIL（其他）

**有涵蓋的**：目標「repo 內不依賴 Cross 本人的開發工作全部做完並上線」和 STOP 1–7 對得上 Cross 原話的「找到 handoff → 延續進度 → 做到沒有剩餘開發工作 → 繞不過去才問 → 其他由 Fable 核准」。STOP 3、4 把以前「待 Cross 裁」的項目改由 Fable 代裁，這符合「其他fable代替我核准」。上架線 L1–L5、X6 延後，依據是 ROADMAP §6 已採用的 Q2（「先維持 PWA 到試用結束」，Cross 2026-11-03 授權照建議答案走）。這不是偷換。跨裝置同步不做，也有產品定義「不做帳號、雲端」（ROADMAP §1）當依據。

**縮小或漏掉的**（這些都不需要 Cross 本人，卻沒有列進 STOP，也沒有歸到「不做＋理由」）：
1. **還開著的舊 PR #25、#37**（GitHub 唯讀查詢：open PR 只有 #79、#37 `docs：Round 13 上線紀錄、交接更新`、#25 `docs: 記憶檔同步到 Round 3 最新進度`）。STOP 7 只點名 #58、#62。#25 和 #37 一樣是已被取代的文件或交接 PR，沒有列入關閉。
2. **hygiene 衝突清單裡不需要 Cross 的文件項目**（`runs/hygiene-ui-1111/reports/hygiene.md:87–98`）：#12（ROADMAP §0 寫「先上線 Round 8」，跟 §6 矛盾）、#13（ROADMAP §2 現況停在 Round 7）、#16（STATE §1「Latest release」停在 PR #43）、#21（CI 檔頭寫「草稿，未推送」，引用的檔案不在 repo；當時沒修是因為「照指示不碰 CI」，這次沒有這個限制）、#22（證據指向 repo 外的 `~/workspace/...`）、#23（ROADMAP N1 指向已刪除的 `state/handoff-tools/`）。decisions.md 只裁了 #10、#14、#19、#20。上面 6 項既不在 STOP 裡，也沒寫不做的理由。
3. **2.3 AKOMEYA 今天的 types 沒確認**（ROADMAP §7.5 第 2.3 列：「AKOMEYA 今日的 types 未確認（需瀏覽器實測 production 渲染）」）。decisions.md 用推理（「stale 假設不成立」）裁定維持原文案，但 ROADMAP 自己說這一點要實測，這次沒有測。順帶一提，`preview-prefer.out.json` 裡 AKOMEYA食堂 被判成 `cafe`，這就是一筆現成的 types 證據，還沒寫回 2.3。
4. **ROADMAP §6「步驟 4 ⏳ 進行中」**（`docs/ROADMAP.md:150`，defect escape rate 追蹤）。契約沒有說它算不算剩餘工作，也沒有寫為什麼只能 Cross 做。

最小修正：總調度把 1–4 逐項歸類：要嘛做掉（關閉 #25、#37；改 ROADMAP §0、§2 和 N1 的指向；更新 STATE §1；更新 CI 檔頭；2.3 補上 types 證據），要嘛寫進 decisions.md 註明「不做＋理由」或列入 STOP 6 的 Cross 表。

---

## B 逐條判定

```
┌──────┬──────┬──────┬────────────────────────────────────────────┐
│ 條件   │ 判定   │ 類別   │ 證據                                         │
├──────┼──────┼──────┼────────────────────────────────────────────┤
│ STOP1 │ PASS │ —    │ e2e-report.json stats: expected 4, unexpected 0│
│ STOP2 │ FAIL │ 其他   │ 未合併：PR #79 draft:true、state open           │
│ STOP3 │ PASS │ —    │ decisions.md Q1–Q11 每題都有裁定＋理由          │
│ STOP4 │ PASS │ —    │ decisions.md「其他待裁小項」6 列                 │
│ STOP5 │ 未到   │ —    │ 文件與實況不符的地方見最後一節                   │
│ STOP6 │ 未到   │ —    │ 表還沒做                                      │
│ STOP7 │ FAIL │ 其他   │ #58/#62 已關；舊分支這次 0 次嘗試                │
└──────┴──────┴──────┴────────────────────────────────────────────┘
```

### STOP 1：PASS
- `runs/pending-tests/prod-after/reports/e2e-report.json`：`"expected": 4, "skipped": 0, "unexpected": 0, "flaky": 0`，`duration 54767.604`。iphone ×2、webkit-iphone ×2 都是 `passed`。
- 我自己看了回應的頂層 `stops`（不是 `_request`）：
  - `iphone-shuffle-2-swap.json`：`meal done=True eta=None`（`_request` 裡同一站是 `17:35`，那是瀏覽器送出的舊值）
  - `webkit-iphone-shuffle-2-swap.json`：`meal done=True eta=None`（`_request` 是 `21:28`）
  - `*-shuffle-3-regenerate.json` 兩份：`meal eta=None`
- 報告 annotation `done-stop-eta` 的值是 `"(none)"`（`e2e-report.json:176–177`），可以獨立證明已完成站沒有 ETA，不依賴有沒有設 `EXPECT_DONE_FIX`。
- PR #77（`e391097`）在 main `fb75135` 的歷史裡：`git merge-base --is-ancestor` 成立。
- 限制：正式站別名現在指向 `dpl_H2rbmAB8wDWdE3Vnx6PFsnZQFLr3` 這一點，我照指示沒有打 Vercel，沒有獨立確認，只有測試時間 `searchedAt 2026-11-14T04:41:38Z` 的回應行為（已完成站沒有 eta，這是修正後才有的行為）可以間接佐證。

### STOP 2：FAIL（其他）。只差合併，其他子項 PASS
- **未合併**：PR #79 `draft:true`、`state:open`，main 還是 `fb75135`。契約寫的是「實作並合併」。
- 我自己重跑的閘門（逐字）：
  - `npm run typecheck` → `tsc -b`，`EXIT typecheck=0`
  - `npm run lint` → `eslint src api tests/unit`，`EXIT lint=0`
  - `npm test` → `Test Files  62 passed (62)`／`Tests  1327 passed (1327)`，`EXIT test=0`
  - `npm run check:bundle` → `BUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。`，`EXIT bundle=0`（`src/dailyAffinity.ts` 已 commit，feedback-loop 報告提到的未追蹤檔問題已經不存在）
  - `npm run build` → `✓ built in 248ms`，`dist/assets/index-HrL4SZeT.js 368.35 kB │ gzip: 122.93 kB`，`EXIT build=0`
- 預覽站真 POST：我用 `runs/finish-1114/snapshots/preview-prefer.out.json` 的原始 A/B/C 陣列重算，結果和 summary 逐項一致：
  - 15 次全部 `200`
  - K=`cafe`（A 的 meal 種類分布：`yakitori 3, cafe 1, izakaya 1, sushi 1`）
  - A meal 是 K 的次數 `1/6`，B `3/8`
  - preferHit：A `0` 次；B `3` 次，全在 `meal` 站、種類都是 `cafe`（AKOMEYA食堂 東急プラザ渋谷）
  - B meal 有 `4` 間不同的店；不是 K 的 5 次：`極上黒毛和牛 本格焼肉 ビーフキッチン渋谷店`、`とりや幸NEO`、`牛かつもと村 渋谷本店`、`とりや幸NEO`、`牛かつもと村 渋谷本店`
  - C（壞輸入）status `200`、preferHit `0`
  - coffee 站 A/B 每一間都是 `cafe`，所以權重全相同、weights 是 null、沒有 preferHit。這是正確的誠實行為，旗標沒有謊報。
  - 註：1/6 對 3/8 樣本很小，統計上不顯著。「有作用」的硬證據是 preferHit 只在帶 prefer 時出現、而且只出現在 K。「不排除任何店」在真資料上無法證明（A、B 店集合不同，是 Google 每次回傳的差異造成），要靠程式碼閱讀和單元測試，見下面獨立判斷。
- **我對 2.4 的獨立判斷**（`api/daily-route.ts` 2.4 改動＋`src/dailyAffinity.ts`）：
  - 只做軟排序、不排除候選：prefer／demote 只出現在 `api/daily-route.ts:195–196`（解析）和 `:322–325`（從 `top=found.ranked.slice(0,5)` 裡挑）。`usableHere`、`venueOk`、`areaOk`、`retentionOk`、`nearOk`、`pools` 都沒有讀它。`SOFT_WEIGHT` 最小值是 1（`src/dailyAffinity.ts:82`），所以 5 間每一間都抽得到。**成立。**
  - 不放寬門檻：沒有任何門檻常數或條件被改動（diff 只動上面兩處、Stop 型別、兩處清 `preferHit`）。**成立。**
  - 沒帶 prefer／demote 時行為不變：`softWeights` 在兩份清單都空時回 null（`:88`），走原本的 `top[randomIndex(top.length)]`，連亂數用量都一樣；回應不會多出 `preferHit` 鍵。指定、固定、已完成站 `auto=false`，weights 也是 null。**成立。**
  - 完整重新生成仍然隨機：`randomIndex(總權重)` 均勻抽，權重都 ≥1。**成立。**
  - 輸入驗證（`sanitizeKindList`，`src/dailyAffinity.ts:77–80`）：非陣列回 `[]`；非字串、空字串、長度超過 40 的元素丟掉；先 normalize 再用 Set 去重，最多 20 個。同時出現在 prefer 和 demote 的種類兩邊都拿掉（`:196`）。大小寫：不轉小寫，`"RAMEN"` 對不到任何種類，等於一般權重，無害。沒有找到能讓候選被排除或門檻被放寬的反例。
  - 會不會進 log：daily-route 唯一的 log 是 `:436` `console.warn('[daily-route] Routes matrix unavailable:', ...)`，沒有輸出 prefer。**成立。**
  - `preferHit` 會不會在伺服器端謊報：輸入的 stops 由逐欄白名單重建（`:161–165`），不會帶 `preferHit`，客戶端偽造不了。旗標只在 `weights` 不是 null、而且挑中的是偏好種類時才設（`:325`）。到店時沒營業而換店、或標 closed 時會清掉（`:367`、`:409`）。伺服器端**成立**。客戶端有一個小謊報，見發現 F1。
- 前端 `src/dailyDecision.tsx`：
  - localStorage 壞掉：`loadAffinity` 有 try/catch，並用 `isEvent` 過濾（`src/dailyAffinity.ts:29–33`）；`save`、`clear` 也包了 try。頁面不會壞。**成立**（另有測試 `dailyDecision-affinity.test.tsx`）。
  - 取消完成會撤回：`toggleDone`（`:635`）取消勾選時呼叫 `dropAffinity(src)`，src 是 `done:<day>:<stopId>:<placeId>`。**成立。**
  - 清除只清偏好：`clearAffinity` 只 `removeItem(AFFINITY_KEY)`，另外只拿掉卡片上的 preferHit（`:629–633`）。**成立。**
  - 重複記分：標記完成和手動指定都帶 src（同一天、同一站、同一間店只留一筆，`recordAffinity` 先 filter 掉同 src）。重複點完成、重新整理、同一站重複搜尋都**不會**重複加分。記分不在 state updater 裡，React StrictMode 也不會重算。「換掉 −1」沒有 src，每換一次記一次，這是 Q1 和補裁定的設計，不算重複記分。副作用見發現 F2，嚴重度低。
- 程式規模：產品碼 `api/daily-route.ts | 24`、`src/dailyDecision.tsx | 54`、`src/dailyAffinity.ts | 100`，約 178 行，在 300 行以內。

### STOP 3：PASS
`runs/finish-1114/decisions.md` 的「2.4 行為回饋迴圈 Q1–Q11」表有 11 列，每列都有「裁定」和「理由」兩欄。實作和裁定對得上：+3/+2/−1（`src/dailyAffinity.ts:8`）、半衰期 30（`:9`、`:61`）、新的 localStorage key（`:6`）、±2 閾值和 20 個上限（`:11–12`）、只做軟排序（見 STOP 2）、原因行「你常選這類，優先挑了這間」（`src/dailyDecision.tsx` 原因行）。另有「實作後補裁」4 列，處理 Q1 和 Q8 的落差、權重 6/2/1 等。

### STOP 4：PASS
decisions.md「其他待裁小項」：2.3 文案（維持原文）、hygiene #10（2026-12-30）、#19（不動）、#20（保留）、全域步行最短（不做，要 Cross 定空等可接受多久）、#14（不裁，只有 Cross 能定）。契約點名的 5 項都有裁定和理由。（其他 hygiene 項目的缺口算在 A。）

### STOP 5：未到
### STOP 6：未到

### STOP 7：FAIL（其他）
- #58、#62 已關（GitHub：`number 62 state closed merged false closed_at 2026-11-14T04:42:29Z`、`number 58 … 04:42:28Z`）。**這一半 PASS。**
- 已合併舊分支：這次 0 次嘗試（`reports/main.md` 第 7 條自述「我選擇不試」）。契約寫的是「嘗試刪除一次，被擋就列入第 6 條」，理由是上一棒被擋過，但那不是這一棒的嘗試。目前遠端除了 main 還有 23 個分支；用本機有的 commit 檢查，其中 16 個已經是 `origin/main` 的祖先（包括 `claude/pending-tests`、`feature/start-time-input`、`docs/adr-001`、`step3/stryker-threshold` 等），另外 6 個本機沒有 commit，判斷不了。
- 最小修正：對已合併的分支嘗試刪除一次，逐字留下結果；被擋就列入 STOP 6 的表，並附分支清單。

---

## 發現清單

| # | 類別 | 位置 | 問題與重現方式 | 建議修法（我不修） |
|---|---|---|---|---|
| F1 | 其他 | `src/dailyDecision.tsx:359–363`（`restorePreferHit`），呼叫點 `:581` | 完整重新生成時，伺服器會重挑自動站。如果這次是均勻隨機剛好挑回同一間（weights 是 null：例如這一站前 5 名全是偏好種類；或使用者取消兩次完成，偏好掉到閾值以下，不再送 prefer），回應不會帶 preferHit，但前端看到同一站、同一 candidate id、舊 state 有旗標，就把旗標補回去，卡片寫「你常選這類，優先挑了這間」，實際上這次挑選沒有受偏好影響。重現：同一天把兩站拉麵標完成（+4，會送 prefer:["ramen"]），完整生成時 meal 挑到拉麵店 A 並帶 preferHit；取消這兩個完成（分數變 0）；再按「重新生成」，大約 1/5 機率又挑回 A，原因行還在。 | 只在「這次請求伺服器原樣保留的站」才補回旗標（單站換店時的其他站、done、locked、指定站），完整重新生成時自動站不要補。 |
| F2 | 其他 | `src/dailyDecision.tsx:373` | 「換掉 −1」沒有去重：同一站連按 3 次「換這一站」（只是想換一間，不是討厭這個種類），那個種類就變成 −3，會被降權。降權的效果會擴散到別站，例如 AKOMEYA食堂 被判成 `cafe`，咖啡站換了 3 次之後，meal 站的 cafe 類店機率也跟著降。不會排除任何店，也不算壞資料，但和 Q8 的理由「單次行為不改變結果」比起來偏敏感。 | 由總調度決定接受，或改成同一天、同一站最多記一次 −1。 |
| F3 | 其他 | `runs/finish-1114/reports/feedback-loop.md` 第 7 條 | 報告說 `check:bundle` 會 FAIL，原因是檔案未追蹤；commit `cde60c2` 之後已經不成立，我重跑 `BUNDLE PASS`。報告內容過時。 | 加註「已 commit，已重驗 PASS」。 |
| F4 | 其他 | `runs/finish-1114/reports/feedback-loop.md` 第 9 條 | 寫「預覽站真 POST 還沒做」，已經被 `preview-prefer.out.json` 取代。 | 加註，或交叉引用 main.md。 |

找不到的反例：在 2.4 伺服器端，我沒有找到「排除候選、放寬門檻、沒帶欄位卻改變行為、偽造 preferHit」的具體輸入。

---

## 文件與實況不符的地方（供 STOP 5 更新）
1. `STATE.md:26`：寫「Visual redesign (2026-11-11, PR #54, not merged)」。GitHub 顯示 #54 `merged:true`，`closed_at 2026-11-11T14:23:32Z`。
2. `STATE.md:2`：檔頭寫「Updated 2026-11-10」；§1「Latest release」停在 PR #43。main 已經到 PR #78（`fb75135`）。
3. `STATE.md` §3「P1 — live shop information」：寫「does not enforce opening hours for planned arrival」。PR #63（`c757998`）已經做到「到店要開著」（ROADMAP §6 也有記錄）。
4. `docs/ROADMAP.md` §6 第 2.3、2.4 列和 §7.5 第 2.3、2.4 列：還寫「文案待裁」「設計 done（待核准，未實作）」。現在已經代核，2.4 也實作了（未合併）。
5. `docs/ROADMAP.md` §6「分支清理」列：只列 4 個遠端分支（2026-11-10）。實際遠端除了 main 有 23 個。
6. `docs/ROADMAP.md` §6 N4 等「待 Cross」列：要和 STOP 6 的表對齊。
7. `.handoff/LATEST.md`：還是上一棒「prod-redeploy 待接手」，§2「未開始：第 1 段第 2–4 步」都已經做完。
8. 遠端還開著 #25、#37（見 A-1），任何文件都沒有提到。
9. `runs/finish-1114/reports/feedback-loop.md` 第 7、9 條過時（F3、F4）。

OUT-OF-SCOPE（只記錄，不影響判定）
- 測試和證據加起來 diff 約 2 萬行，大多是 JSON 快照。產品碼約 178 行。

## 交還 maker 的最小修正指示
1. STOP 2：PR #79 轉成正式 PR，CI 綠了就合併；合併後在 main 上確認 CI 綠，正式站用一次真 POST 確認 `/api/daily-route` 載得起來（bundle）。
2. STOP 7：對已合併的遠端分支嘗試刪除一次，結果逐字記下；被擋就列入 STOP 6 的表。
3. A：把 A-1～A-4 逐項做掉，或寫進 decisions.md／STOP 6 表，註明「不做＋理由」。
4. （建議）F1：前端只在伺服器原樣保留的站補回 preferHit。
5. STOP 5：依上面「文件與實況不符的地方」1–9 更新。
