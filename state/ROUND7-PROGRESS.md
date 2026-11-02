# Round 7 進度（接手用）

> 最後更新：2026-11-02 14:10（東京）。分支 `claude/nifty-ramanujan-szofu5`，repo `cc4wang-ui/general-decision`。
> 正式站是 Round 6（`dpl_EFM2ouyUzAqQC1KEzJaxCK1bh7i5`，`fe698f4`）。Round 7 只在 preview，上線由 Cross 決定 🔒。
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
| 1 | 日文關鍵字 | 做中 |
| 2 | 排除水煙吧／購物中心 | 做中 |
| 3 | 真資料 0 筆水煙吧／購物中心 | 待 preview |
| 4 | 台灣不變 | 待閘門 |
| 5 | 閘門 → preview → checker → Cross 🔒 | 待 |
