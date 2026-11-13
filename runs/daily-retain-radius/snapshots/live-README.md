# 真 API 證據（契約 STOP 7）
- 時間：2026-11-13 07:57 UTC。單站換店（`shuffle: shopping`），出發點澀谷（目前位置 35.6595,139.7005）。
- 預覽站：分支別名 `general-decision-git-claude-friendl-f005c9`（部署 `dpl_B4RMTCQXFHkG3GJsVbCzWMCxdN8q`，commit `f159695`＝修正 commit）。
- 對照：正式站 `general-decision.vercel.app`（main `47817b1`，修正前）。同一時間、同一份請求。
- 請求：
  - `far-request.json`：晚餐站帶舊店「遠店テスト（横浜）」（真店 権八 的資料，座標改到橫濱，離出發點 24.65 km）。
  - `near-request.json`：晚餐站帶真店 権八（0.50 km）。

| 請求 | 正式站（修正前） | 預覽站（修正後） |
|---|---|---|
| 晚餐舊店在 24.65 km 外 | 保留遠店（24.65 km） | 換成 GYUMON（0.13 km） |
| 晚餐舊店 権八 0.50 km | 保留 権八 | 保留 権八（不變） |

- 換的那一站（shopping）兩版都換了新店，都在 0.2 km 內；店名不同是前 5 名隨機挑。
- 逐站摘要：`preview-*.summary.txt`、`main-*.summary.txt`；原始回應：同名 `.json`。
