小組報告｜版面重排（daily-layout-1111）

結論：今日行程不再有直排的「今日設定」表單。設定收成七顆摘要膠囊，點一顆開一張底部選單。行程清單在第一屏就看得到。「搜尋店家並生成路線」固定在畫面底部，狀態列跟著它。只動了版面，邏輯和 API 沒改。

STOP 自查：
1. 沒有直排表單、只有膠囊 — `runs/daily-layout-1111/shots/after-09-daily.png`；e2e `tests/e2e/daily-location.spec.ts`「版面：…」（欄位 toBeHidden、七顆膠囊 toBeVisible）。
2. 一顆膠囊開一項、最多兩欄、關掉後膠囊換新值 — 單元測試 `tests/unit/dailyDecision-ui.test.tsx`「2026-11 版面重排」四條；截圖 `after-09b-daily-sheet.png`。
3. 第一屏看得到行程 — 同一條 e2e：`list.y < dock.y - 80`；截圖 `after-09-daily.png`、`after-09c-daily-route.png`（390×664）。
4. 主按鍵固定底部、不蓋最後一張卡片 — 同一條 e2e：捲到中段按鍵仍在視窗底；捲到底時最後一站的下緣 ≤ 底部列上緣；截圖 `after-09d-daily-route-end.png`。
5. 功能都在 — 原有單元測試 1184 條全數照過（只改 2 處斷言，見下）；`daily-location.spec.ts` 原有 2 條改成先點膠囊再操作後照過。
6. 只改版面 — `git diff` 中 `src/dailyDecision.tsx` 元件之前的部分只多一行 import 與三個版面常數；`api/` 無變更。
7. 沒有新 token、沒有 `<main>`、沒有新實色 — `src/dailyDecision.css` 新增段只用 `var(--…)`；`tests/unit/palette-guard.test.ts` 與 `tests/e2e/palette.spec.ts` 通過。
8. `data-testid` 全保留 — `grep -c` 見把關；另新增 `daily-chip-<id>`、`daily-sheet`、`daily-sheet-close`。
9. 五道關卡 — typecheck 0、lint 0、單元 1188 passed、build 成功、e2e 128 passed（2026-11-11 本容器）。
10. 改前改後截圖 — `runs/daily-layout-1111/shots/before-09-daily.png` 與 `after-*.png` 四張。
11. 草稿 PR — 見交付訊息。

產出檔案：`src/dailyDecision.tsx`、`src/dailyDecision.css`、`tests/unit/dailyDecision-ui.test.tsx`、`tests/e2e/daily-location.spec.ts`、`tests/shots/shots.spec.ts`
新快照：`runs/daily-layout-1111/shots/`

改掉的既有斷言（規格變了，不是放寬）：
- 空狀態指引：原句指向已不存在的「今天想去哪裡／想做什麼」區塊，改指兩顆膠囊的名字。「再點『搜尋店家並生成路線』」那句沒動。
- 「前往地區偏好設定」連結：`href` 斷言保留，另加「點了會開地區選單」。
- e2e 兩條：操作出發地前先點「出發地」膠囊；出發地的現值改看膠囊。

未完成／⚠️ 假設：
- ⚠️ 方向是交接檔的提案，Cross 沒拍板。
- ⚠️ 各選單的欄位一直掛在畫面上，只是收起來（`hidden`）。好處：值不會因開關重置，原有單元測試不用改。
- ⚠️ 狀態列沒有訊息時不顯示。原本的預設句「搜尋將使用 Google Places 與 Google Routes」拿掉了；頁尾的資料來源聲明還在。
- ⚠️ 路線標題上方的小字「▸ 任務路線」拿掉了，為了讓第一屏放得下行程。
- ⚠️ 選了「用目前位置」或加完固定行程，選單會自己收起來。
- ⚠️ 進今日行程時回到頁面最上方；這個畫面的進場動畫改成只淡入。原因：位移動畫進行中，底部選單會定位錯、把頁面捲走（實測捲了 151px）。
