# Round 12 進度：已知未修全處理，一次上線（接手用）

> 開始：2026-11-05 21:54 東京。分支 `claude/vigilant-clarke-dsrqfi`（PR #35），基底 `main` `945088a`（正式站 `dpl_8XSAAmNtPTS9bmfbNaiJqc51Vx9f`＝回復點）。
> Round 11 的 checker 第 1 輪修正（`sceneTiers`）也在這個 PR，一起上線。

## 目標契約｜R12 已知未修全處理

- **Cross 原話**（2026-11-05 21:54 東京，回應「要先上線修正版、評分問題留到下一輪嗎？」）：「全部處理完之後一次上線 不要一直分段」
- **目標**：Round 11 結束時的「已知未修」全部修好、驗過，再一次上線；中間不分段回報。
- **成功指標**：已知未修表每一項都是「已修＋證據」；正式站只更新一次。
- **STOP 條件**：
  1. 約會：最高分被記憶擋掉 → 派「剩下的店裡最高分往下 0.2★」，一階一階往下；步行 ≤ 15 分、不派酒吧照舊。checker 的 `edge-real.mts`（07:50 新宿真候選，一蘭被擋）0 筆低於 4.0★、0 筆購物中心。
  2. 約會不派外帶店（primaryType `meal_takeaway`）、購物中心、百貨。
  3. 歇：整批放回時，類型／店名的排除不放寬（水煙吧、購物中心；選咖啡時酒吧類、卡拉OK、美食街、snack_bar）。沒有 → 超商救援。
  4. 歇選咖啡不派 snack_bar（新宿深夜 Artbar星男）。
  5. e2e `streak.spec.ts:31` 不再時好時壞：不放寬 2 px 的容許值。
  6. 閘門全過；新宿、信義真資料情境不退步（派錯、還沒開、到店已關、約會酒吧全 0）。
  7. 獨立 checker（新開）PASS；最多 2 輪，2 輪後只剩「其他」→ 列已知未修照樣上線。
  8. 上線：Cross 已授權（「全部處理完之後一次上線」）→ 合併 PR #35 → 驗正式站。
- **等級**：M。把關：獨立 checker（新開的子代理）。
- **預算**：主工作 ~150k＋checker ~250k；上限 ~600k。量測 Places／Claude ≈ US$2。
- **保留事項**：上線（Cross 已在原話授權，條件是全部處理完）。Places 上限、評分下限照 Cross 沒選的預設，不動。
- **⚠️ 假設**：
  - 「全部」＝ Round 11 已知未修表的 5 項。Places 上限維持 40、約會評分不設下限、實機測試不做（都是 Cross 沒選時的預設）。
  - probe「放寬評分不算錯」也適用「談事情」：這是 app 本來的規則（Round 10 起談事情也只放寬評分），probe 跟 app 一致，不改；`ratingRelaxed` 照樣標出來。
  - 現在是東京晚上：深夜／早上的放寬路徑用單元測試＋真候選模擬驗，真資料只量晚上。
  - 約會整批放回（只剩酒吧時）維持 Round 10 Q1 的做法（Cross 同意過），不改。

## 進度

### 程式（`2bfc78c`）

| STOP | 改了什麼 | 測試 |
|---|---|---|
| 1 評分階梯 | `src/scene.ts` `sceneTiers` 第 2 層改成「最高分往下 0.2★」一階一階往下（每階都比上一階大）；評分比較加浮點容差 `EPS` | `scene.test.ts`「Round 12」：階梯分層、4.3−0.2 含 4.1、handler 20 種子（唯一 4.3 被擋 → 派 4.2；4.3、4.2 都被擋 → 派 3.8）。突變：拿掉階梯 → 3 條失敗 |
| 2 約會類型 | 約會 `avoidTypes` 加 `meal_takeaway`、`shopping_mall`、`department_store`（只看主類別） | 同上「約會不派外帶店、購物中心、百貨」 |
| 3 歇整批放回 | `SceneRule.hardAvoid`：歇的類型／店名排除在整批放回時也不放寬（`hardPool`）；沒有 → 超商救援 | 同上＋改 2 條舊測試（Round 7／8 的「只剩水煙吧／卡拉OK → 整批放回」改成「交給超商救援」）。突變：拿掉 hardPool → 3 條失敗 |
| 4 snack_bar | `NOT_COFFEE` 加 `snack_bar`（歇選咖啡） | 同上 |
| 5 streak e2e | 兩個原因：`.screen` 0.18 秒進場動畫中途量到；重新載入後頁面被捲動 1–2 px。改成等版面停住、用整頁座標，容許值 2 px 不變 | 修前重跑 15 次 1 次失敗；修後 50/50。突變：有連勝章時導覽列變高 → 量到 22 px、失敗 |

### 閘門（`2bfc78c`，2026-11-05 22:1x 東京）

typecheck ✅、單元 723/723 ✅、build ✅（`index-CXakj8TD.js`；`scene.ts` 前端也用，hash 變了）、check:bundle ✅、smoke ✅、e2e 全套 127/127 ✅。

### 模擬（checker R11 的腳本，對 `2bfc78c` 重跑；證據 `state/evidence/r12/sims/`）

| 腳本 | 結果 |
|---|---|
| `edge-mem-loop` | A 被擋 → B（15 分內）40/40、40/40 |
| `edge-band` | S2：B3.8 40/40；S3：F4.2 40/40；S4：F4.2 40/40 |
| `edge-real`（07:50 新宿真候選，一蘭被擋） | 4.2★ そば処かめや 21、4.1★ eggslut 22、4.1★ 赤坂うまや 17；**低於 4.0★：0/60**；購物中心 0 |

### 測試版實測（`dpl_8msxWngLu4SLpDGGCtah64kDGVF4`，`2bfc78c`）

| 時間 | 地點 | 情境 | 派錯／還沒開／到店已關／約會酒吧／約會走超過 15 分 | 約會 | 證據 |
|---|---|---|---|---|---|
| 11-05 22:10 東京 | 新宿 | 12/12 | 全 0 | 東京寿司 ITAMAE SUSHI 4.5★ 走 9 分 | `state/evidence/r12/preview-2210/scene-shinjuku.*` |
| 11-05 21:10 台北 | 信義 | 12/12 | 全 0 | rén bistronomy 4.7★ 走 9 分 | `state/evidence/r12/preview-2210/scene-xinyi.*` |

Routes：`routeVerified:true`（`preview-2210/daily.json`）。

## Checker 第 1 輪（2026-11-05 22:15–22:30 東京）：FAIL（只有「其他」類）

| STOP | 判定 | 摘要 |
|---|---|---|
| 1 評分階梯 | **FAIL** | 主要路徑對（edge-real 低於 4.0★ 0/60），反例：4.3★＋2 家沒評分的店都被擋，剩 4.2／4.1／3.8 → 40 次有 8 次派 3.8★。原因：分層去重只比店數；沒評分的店在第 1 層、不在評分階梯，「每層包含上一層」不成立 |
| 2 約會類型 | **FAIL** | 正常路徑擋得住；整批放回時外帶店／購物中心／百貨又被放回（40 次 37 次）。Q1 只同意放回酒吧 |
| 3、4、5、6 | PASS | 歇整批放回 5 種情境 20/20 走救援；snack_bar 擋住；streak 30/30、容許值沒放寬；閘門全過、測試版 12/12×2 |
| 7 | FAIL | 因為 1、2 |

- 舊測試改動：checker 判「合理」（契約要求的行為改變，且補了正向案例）。
- 「probe 放寬評分不改」：理由站得住，但回報時要寫成「判定不是問題、不改」，不能算已修。

### 第 2 輪前的修正（`a83743b`）

- `sceneTiers`：每層＝前面所有層的聯集＋這層，有加進新店才留（不再只比店數）。
- `SceneRule.hardTypes`：約會整批放回時也排除 `meal_takeaway`、`shopping_mall`、`department_store`；酒吧照 Q1 放回。
- 單元 4 條（沒評分的分層、約會放回類型、handler × 2）。突變：換回只比店數 → 2 條失敗；拿掉 hardTypes → 2 條失敗。
- checker 的反例腳本重跑：`unrated-handler2` 擋 A43／U1／U2 → B42 22、C41 18（0 筆 3.8）；`date-putback` B → 40/40 派遠處餐廳（0 筆三種類型）；`prop-date` 400 例：違規 0（2 筆 no_places 是假資料的救援查詢回同一批店）。
- 閘門：typecheck ✅、單元 727/727 ✅、build ✅（`index-CQ4Wvz1u.js`）、check:bundle ✅、smoke ✅、e2e 127/127 ✅。
- 測試版 `dpl_Gy3tpz777yj9vJiMRFJjzdHPncsU`（22:32 東京）：新宿 12/12、信義 12/12，各項 0；Routes `routeVerified:true`。證據 `state/evidence/r12/preview2-2232/`。
