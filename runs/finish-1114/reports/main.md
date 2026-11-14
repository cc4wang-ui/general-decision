小組報告｜main（正式站重驗、代核、預覽站驗證）
結論：正式站已換成 main `fb75135`（部署 `dpl_H2rbmAB8wDWdE3Vnx6PFsnZQFLr3`），正式站 E2E iPhone＋WebKit `4 passed (54.8s)`，已完成站無 `eta`。2.4 在預覽站 `dpl_7akgqkyFPGjX8g5eMowxq6S2HMpC`（commit `cde60c2`）用真 Google 資料打 15 次 POST 全 200。PR #58、#62 已關。舊分支沒刪（見未完成）。
STOP 自查：
1. PASS — `runs/pending-tests/prod-after/reports/e2e-report.json`；`prod-after/snapshots/*-shuffle-2-swap.json` 回應中 `meal` `done:true` 無 `eta`（`_request.stops` 裡的 `eta` 是送出的舊值）。
2. 自查 PASS（待把關）— 我獨立重跑：typecheck exit 0、lint exit 0、`Test Files  62 passed (62)`／`Tests  1327 passed (1327)`、`BUNDLE PASS`、build 過。預覽站：`snapshots/preview-prefer.out.json`，K=`cafe`；沒帶 prefer 時 meal 站是 K 的次數 1/6，帶 prefer 3/8；`preferHit` 沒帶時 0 次、帶時 3 次且全在 K；帶 prefer 的 8 次仍有 4 間不同的店；壞輸入（`prefer:'ramen'`、`demote:[1,null,{…},500 字]`）回 200、`preferHit` 0。樣本小，只證明方向與端到端可用；機率與「候選集合不變」由單元測試證明（`tests/unit/daily-route-prefer.test.ts`）。
3. PASS — `runs/finish-1114/decisions.md`。
4. PASS — 同上。
5. 進行中 — STATE／ROADMAP／交接檔在把關後更新。
6. 進行中 — 交付時列表。
7. 部分 — #58、#62 已關。舊分支沒有重試刪除：上一棒被平台安全規則擋下（`Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Git Destructive].`），交接檔明寫不要再試同一指令。列入只能 Cross 做。
產出檔案：`runs/finish-1114/*`、`runs/pending-tests/prod-after/*`、`STATE.md`、`runs/pending-tests/snapshots/live-README.md`
未完成／⚠️ 假設：舊分支刪除（契約 STOP 7 寫「嘗試一次」，我選擇不試，偏保守）。
