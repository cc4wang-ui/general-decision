小組報告｜main（預覽站真資料驗證）
結論：預覽站 `dpl_EDGFQtZwmco5FbBqXqhGonnC6YLe`（commit `422f47a`）用真 Google 打 17 次 POST 全 200。7 個主題各 2 次都拿到真店；手動順序被照做。
STOP 自查：
7. 自查 PASS — 總調度獨立重跑：typecheck exit 0、lint exit 0、`Test Files  64 passed (64)`／`Tests  1396 passed (1396)`、`BUNDLE PASS`、build 過。
8. 預覽站 PASS（正式站待合併後）— `snapshots/preview-guide.out.json`：
   - 主題：view_cafe（Paradise Lounge、VALLEY PARK STAND）、good_coffee（OBSCURA COFFEE ROASTERS Front、CHIMNEY COFFEE 渋谷本店）、fun（HMV record shop 渋谷、next records）、park（渋谷区立鍋島松濤公園 ×2）、new_area（原宿：ラフェデリース；恵比寿：DEAN & DELUCA カフェ…中目黒 代官山）、destination_meal（ブラッスリー・ヴィロン 渋谷店、Oysterbar&Wine BELON 渋谷店）、art（Gallery Conceal Shibuya、DIESEL ART GALLERY）。
   - 不合法主題 `hack_me`：回 200，回應不帶 `theme`，照沒帶主題處理。
   - 手動順序：自動排出 meal→shopping→creative；反過來以 `manualOrder:true, reorderOnly:true` 送 creative→shopping→meal，回應順序相同、三站的店都沒換、`routeVerified:true`、ETA 13:03／14:13／15:17、固定行程 `start` 仍是 `23:30`、`conflicts: []`。
觀察（不擋）：view_cafe 有一次回 `Paradise Lounge`（primaryType `lounge_bar`，★3.7）。景觀咖啡的查詢可能撈到酒吧型的店。park 兩次都是同一座公園（澀谷一帶合格的公園少）。
未完成／⚠️ 假設：正式站驗證在合併後做。
