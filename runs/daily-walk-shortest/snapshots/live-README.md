# 真 API 證據（契約 STOP 7、STOP 8）
- 東京 2026-11-13 18:xx。正式站 `general-decision.vercel.app`（main `d8026bc`，舊版貪婪）。
- 請求都用「指定店」（`specified:true`），店不會被自動換掉，新舊兩版才用同一份 Google 步行矩陣。

## 1. v1（commit 9283882，只比步行）的反例 → 促成不跨段
- 部署 `dpl_CdJUNVmAd8FXnPBkJEXe8nntf5gD`。請求 `pinned-request.json`（8 家指定店＋一蘭 22:00 固定）。
- 正式站 `main-pinned.json`：總步行 112 分鐘，18:36 開始逛，22:00 準時到一蘭。
- 預覽站 v1 `preview-v1-pinned.json`：總步行 99 分鐘，但第一站就去一蘭（22:00 空等約 3.5 小時）；其他 8 站排到 22:47–02:04，7 站打烊。
- 結論：只比步行會產生荒謬排法。v2 加「結束不晚於舊版」，但把關第 1 輪又找到「已完成站被拉到前面」的反例，最終改成「固定站不動、每段內最短」。

## 2. 最終版 v3（commit 80f9a45）與舊版：同一份矩陣
- 部署 `dpl_8BRVxHuGv3M7gyAaLG6nenvWqGfW`。請求 `pinned3-request.json`（5 家指定咖啡店＋タワーレコード 21:30 固定）。兩邊每站 Place ID 相同。
- 正式站 `main-v3-pinned3.json`：p4→p3→p5→p2→固定，總步行 62 分鐘。
- 預覽站 v3 `preview-v3-pinned3.json`：p4→p2→p3→p5→固定，總步行 53 分鐘。
- 兩版 `conflicts []`、`routeVerified true`、固定行程 21:30 準時，結束時間相同（22:00）。重疊步行段分鐘數一致（出發→p4 都是 7）。

## 3. v3：固定行程不空等（`pinned-request.json`，8 店＋一蘭 22:00）
- 預覽站 v3 `preview-v3-pinned.json`：總步行 105 分鐘，18:53 開始逛，一蘭 22:00 準時（不是第一站，沒有空等）。
- 正式站 `main-v3-pinned.json`：總步行 110 分鐘。
- 一蘭、代官山 蔦屋書店每次解析到不同分店，所以總步行只當參考；重點是 v3 沒有 v1 的空等行為。

備：v2（`1b31e87`）的對照在舊版 git 歷史；最終交付版是 v3。

## 4. 合併後正式站驗收（2026-11-13 09:57 UTC）
- PR #75 合併（merge `fe0b9dd`）。正式部署 `dpl_7mXffyDvhx6ZoVtKHKW8cNcbvvf9` READY，別名 `general-decision.vercel.app`。
- `prod-pinned3.json`：總步行 53 分鐘（合併前正式站 62 分鐘，同一組 Place ID），`conflicts []`、`routeVerified true`，タワーレコード 21:30 準時。
- `prod-pinned.json`：一蘭 22:00 準時，排在第 7 站（沒有 v1 的「先去空等」），`conflicts []`、`routeVerified true`。
