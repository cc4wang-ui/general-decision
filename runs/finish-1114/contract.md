# 目標契約｜finish-1114
凍結：2026-11-14 04:45 UTC

Cross 原話：
> 找到最新的handoff檔案
> 回顧開發目標 延續開發進度
> 分配agents做到沒有剩餘開發工作為止
> 遇到繞不過去的才問我
> 其他fable代替我核准

目標：repo 內不依賴 Cross 本人的開發工作全部做完並上線；剩下的只有「只能 Cross 做」的項目，逐項列明。

成功指標：交接檔第 2 段「進行中」「未開始」清空；剩餘項目每一項都寫明為什麼只能 Cross 做。

STOP 條件：
1. 正式站 `general-decision.vercel.app` 指向含 PR #77 修正的 main；`tests/prod` 以 `EXPECT_DONE_FIX=1` 跑 iphone＋webkit-iphone 4/4 PASS；已完成站無 `eta`。
2. 2.4 行為回饋迴圈（最簡版）實作並合併：typecheck 0、lint 0、單元測試全過、預覽站真 POST 證明 `prefer` 有作用且不排除任何店。
3. 2.4 的 Q1–Q11 由 Fable 代核，逐題寫下裁定與理由（`runs/finish-1114/decisions.md`）。
4. 待裁小項（2.3 文案、hygiene #10／#19／#20、全域步行最短）由 Fable 代核並寫進 `decisions.md`。
5. `STATE.md`、`docs/ROADMAP.md`、`.handoff/LATEST.md` 與實況一致。
6. 只能 Cross 做的項目列成一張表（項目、為什麼、要他做的一個動作）。
7. 已被取代的交接 PR（#58、#62）關閉；已合併舊分支嘗試刪除一次，被擋就列入第 6 條。

等級：L（2.4 是獨立工作線，開子代理；其餘主對話；獨立把關者驗收）
預算：預估 ~600k token，上限 ~900k
保留事項：對外發布（合併 main＝正式站部署）— Cross 既有授權 `merge不用再我批准`、`CI 綠了就合併`，本次再授權 `其他fable代替我核准`。刪遠端分支（刪資料）— 同一授權，只刪已合併的。動錢（Vercel 方案、Places 上限、GCP 帳單）、改金鑰與權限 — 不做，留給 Cross。
⚠️ 假設：
- 「剩餘開發工作」＝ROADMAP §6／§7.5 與交接檔候選清單中不需要 Cross 本人資料、帳號、付費的項目。預設不做：上架線（L1–L5、X6，依 Q2 延到試用結束）、跨裝置同步（產品定義「不做帳號、雲端」）。
- Vercel 每日部署上限仍可能擋住。預設：少 push；被擋就排程在 2026-11-14 10:35 UTC 後重試。
