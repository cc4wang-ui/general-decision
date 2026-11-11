# 第 13.3 節 人工對照表

**這張表由 checker 填，maker 不自評（第 3.3 節）。**

怎麼用：
1. 開新對話（或 `/clear`），貼第 3.3 節的 checker 指令。
2. 並排打開 `shots/*.png` 與 `decide-mock-v5.html`（用瀏覽器開，切到 iPhone 尺寸）。
3. 逐格填 PASS / FAIL。任一格 FAIL → STOP 條件 D 不成立 → VERDICT: FAIL。

截圖環境：WebKit（對齊 iPhone Safari）、iPhone 13 視窗、淺色模式、`npm run e2e:shots` 產出。
這七張 PNG 來自 **2026-09-14** 那輪 `npm run e2e:shots`（exit 0）。2026-09-11 交付包裡「WebKit 被 macOS sandbox 擋住、
不得標記 E2E PASS」的說法只適用於那一輪的機器，已於 2026-09-14 解除。2026-09-16 的 Linux 容器裝不了 WebKit，
沒有重出截圖。設計面的驗收敘述另存於 [DESIGN-CHECK.md](DESIGN-CHECK.md)，不取代本表。

> ⚠️ **這七張 PNG 已經嚴重落後於程式碼（2026-09-16，階段 2＋3）。整個配色都換掉了，不要拿來對照。**
>
> - **階段 2**：主磁貼補上硬陰影、週報頭像拿掉卡其方框、分享輸出圓角 12px→2px、
>   三段火力的邊框與陰影重新分級（1/2/3px 與 2/3/4px）。
> - **階段 3a**：日記頁進 8-bit（數字卡、空狀態、結果標籤、虛線分隔、硬陰影）。
> - **階段 3b**：**全部色票換成 NES 硬體色盤**。卡其 `#E3DFD0`→`#FCE0A8`、墨 `#1B1D1A`→`#000000`、
>   軍綠三級 → `#007800/#006800/#005800`、紅卡 `#B3261E`→`#F83800` 且**文字翻成黑色**。
>
> **下面七張截圖是這些改動全部發生之前的樣子。**
> 這台容器裝不了 WebKit（出口網路政策擋住 Playwright 下載網域），無法重出。
> **請在有 WebKit 的機器上先跑 `npm run e2e:shots` 重出七張，再填下表**，否則會對照到過期畫面。
> 階段 2 的四個 bug 已用 Chromium 量過 computed style 確認修好，但那是程式層驗證，
> 不取代這張人工對照表。

| 截圖 | 對照 mock v5 | 判定項 | PASS/FAIL | 備註 |
|---|---|---|---|---|
| 01-home.png | home | 班長在上、對話框、4 磁貼、3 小鍵 | | |
| 02-intake-attend.png | intake | 星星 5 顆、chips | | |
| 03-cmd-eat.png | cmd | 兩欄，角色不壓字，steps 白卡在下 | | |
| 04-cmd-buy.png | cmd red | 紅卡、stop | | |
| 05-log.png | log | 登記卡 + 雄壯威武 + 分享鍵 | | |
| 06-stand.png | stand | 紅卡倒數 | | |
| 07-weekly.png | weekly | 單欄文字 + 角色在下 | | |

## 已知的刻意差異（不是 bug，但 checker 請自行判斷是否接受）

- **首頁 meta 文字**：mock 寫「入伍第 12 天 · 饅頭剩 ∞ 顆」（假資料），本版寫「決斷連 · 大事不受理」，
  因為 MVP 沒有入伍天數這個概念。
- **三顆按鈕在 390px 寬會換行**：`.row` 的 `flex-wrap:wrap` 與 `.btn{min-width:8.75rem}` 是照抄 mock v5 的，
  同寬度下 mock 也會換行。
