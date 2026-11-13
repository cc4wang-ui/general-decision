# 真 API 證據（契約 STOP 7、STOP 8）
- 時間：2026-11-13 09:27–09:40 UTC（東京 18:27–18:40）。
- 正式站：`general-decision.vercel.app`（main `d8026bc`，舊版貪婪）。
- 預覽站 v1：部署 `dpl_CdJUNVmAd8FXnPBkJEXe8nntf5gD`（commit `9283882`，只比步行）。
- 預覽站 v2：部署 `dpl_ABVJ89j2XsfrARbpN8VXCFhAdB6n`（commit `1b31e87`，步行最短＋結束不晚於舊版）。
- 請求都用「指定店」（`specified:true`），店不會被自動換掉，新舊兩版才會用同一份 Google 步行矩陣。

## 1. v1 的反例（促成 STOP 8）
- 請求 `pinned-request.json`（8 家指定店＋一蘭 22:00 固定）。
- 正式站 `main-pinned.json`：總步行 112 分鐘，18:36 開始逛，22:00 準時到一蘭。
- 預覽站 v1 `preview-v1-pinned.json`：總步行 99 分鐘，但第一站就去一蘭（22:00），空等約 3.5 小時；其他 8 站排到 22:47–02:04，7 站打烊。
- 結論：只比步行分鐘會產生荒謬排法。v2 加上「結束時間不晚於舊版」。

## 2. v2 與舊版：同一份矩陣
- 請求 `pinned3-request.json`（5 家指定咖啡店＋タワーレコード 21:30 固定）。兩邊每站的 Place ID 相同。
- 正式站 `main-pinned3.json`：p4→p3→p5→p2→固定，總步行 62 分鐘。
- 預覽站 v2 `preview-pinned3.json`：p4→p2→p3→p5→固定，總步行 53 分鐘。
- 兩版 `conflicts []`、`routeVerified true`、固定行程 21:30 準時，結束時間相同（22:00）。
- 同一份矩陣的佐證：兩邊重疊的步行段分鐘數一致（出發→p4 都是 7、p3→p5 都是 9）。

## 3. 其他請求（店家解析不同，不能直接比）
- `pinned-request.json` 第二次：預覽站 v2 `preview-pinned.json` 107 分鐘、正式站 `main-pinned-2.json` 108 分鐘。v2 沒有空等，22:00 準時。一蘭、代官山 蔦屋書店、Little Nap 每次解析到的分店不同，所以只當參考。
- `pinned2-request.json`：ABOUT LIFE COFFEE BREWERS 在兩站解析到不同 Place ID（`preview-pinned2-1`、`main-pinned2-1`），所以改用 pinned3 去掉它。
