# 本次驗證紀錄

- [環境] GitHub 下載與 localhost 啟動被 network sandbox 擋住 — 取得本輪網路權限後執行；未使用提高 shell 權限的繞過方式。
- [環境·已解除 2026-09-14] 2026-09-11 那輪 WebKit／Chromium headless 啟動遇到 macOS MachPort permission denied，
  當時改用內建瀏覽器檢查，且未標記 Playwright E2E PASS。2026-09-14 重跑 `npm run e2e` 36 條與 `npm run e2e:shots` 7 張，
  全部 exit 0 —— 是環境問題，不是程式問題。
- [環境] Linux 容器（2026-09-16）裝不了 WebKit：出口網路政策擋住 playwright.download.prss.microsoft.com 與 cdn.playwright.dev。
  以預裝 Chromium 跑 `tests/e2e` 36 條全過，但那不是 WebKit 契約，該環境不得據此標記 STOP C／D PASS。
- [預览] 快速截圖拍到進場透明狀態 — 展示入口提供350ms ready標記，等待後截圖，正式動畫不改長度。
- [CSS] 大字級時 flex 子容器可能收縮而讓文字延伸到下一區 — 區塊不收縮、卡片內容列保留 min-content。
- [圖片] DOM 字串回傳有長度上限，完整 data URL 會被截斷 — 保存時分段讀取已生成的 DOM 圖片來源，驗證PNG尺寸與實際解碼。
- [依賴] npm ci 的 whatwg-encoding deprecation 來自既有間接依賴 — 無新增依賴，當次 audit 0 vulnerabilities；不在視覺改版中擴大套件更新範圍。
- [CSS·2026-09-18] 自訂屬性有「兩個」坑，只躲一個不夠。已知的第一個是**按最近的祖先解析，不是按 specificity**
  （`:root` 寫的值對 `main[data-level]` 沒有作用，必須在 media query 裡再寫一次 `main[data-level]`）。
  第二個是**同 specificity 由後者勝**：深色的 `main[data-level]{--meme-edge}` 若寫在淺色的 `main[data-level]` 之前，
  會被後面的淺色宣告整個蓋掉，深色永遠吃到淺色的值。兩條規則長得一樣、都沒有警告，靠讀 CSS 看不出來。
  這次是 `tests/e2e/palette.spec.ts` 量渲染後的 `getComputedStyle` 才抓到——而且光驗「對比 ≥ 3:1」還抓不到，
  因為錯誤的值剛好也過門檻，是把每層的預期色值寫死才現形。結論：色盤類的斷言要驗「值」，不要只驗「門檻」。
  **同一天踩第二次**（lv2 名牌的 `--brass`）：淺色宣告寫在元件樣式旁（第 22 行），深色覆寫放在第 12 行的 media block，又被蓋掉。
  規則：每一層的 token（淺色與深色）一律集中在 `main[data-level]` 那一區，淺色在前、深色 media block 緊接在後，不要散到各元件旁邊。

