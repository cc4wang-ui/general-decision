# Round 10 進度：路線圖全做（接手用）

> 開始：2026-11-03 23:10 東京。分支 `claude/nifty-ramanujan-szofu5`（PR #26）。基底：Round 9 合併版 `421e925`。
> 正式站仍是 `main` 的 `dpl_GXH9RaKiS4FpELKoa7GDg5xgF2L5`（Round 3＋今日行程）。

## 目標契約｜R10 路線圖全做

- **Cross 原話**（2026-11-03 23:05 東京）：「從現在開始 全部產品路線圖做完 修完 檢核完成後才上線 明天早上起來我要看到完整品」
- **目標**：明天早上，正式站是合併版＋路線圖裡所有不碰保留事項的項目，都驗過；碰保留事項或只有 Cross 能做的，列在「待你處理」。
- **成功指標**：Cross 早上打開正式站看到完整品；路線圖每一項都有「完成＋證據」或「待你處理＋原因」。
- **STOP 條件**：
  1. `docs/ROADMAP.md` 每一項都有狀態：完成（附證據路徑）或待 Cross（附原因：保留事項／只有 Cross 有的資料／依決策預設延後）。
  2. 閘門：typecheck、單元全過、build、check:bundle、smoke；e2e 全套（既有 5 條失敗要修好，或證明是環境差異並寫明）。
  3. 測試版真資料：新宿駅情境 12/12；歇不派到「到店時沒開或已關」的店（含整批放回時）；0 派錯店；約會 0 酒吧；今日行程 200 真店＋照片；每個新功能各有一次實測或 e2e。
  4. 獨立 checker PASS（最多 2 輪；2 輪後只剩「其他」類 → 照樣上線並列已知未修；有「跑不完／壞資料」→ 不上線）。
  5. Cross 已授權：檢核完成後上線 → 合併 PR #26 進 `main` → 驗正式站（首頁新 JS、`/api/probe` 404、`/api/order` GET 405、runtime error 0、今日行程 200）。
  6. 早上的報告：一張表，做了什麼、怎麼親眼看到、待你處理。
- **等級**：L（有可並行的工作線）。把關：獨立 checker。
- **預算**：主對話 ~300k＋3 條子代理線 ~170k×3＋checker ~170k×2 ≈ 1.1M token；上限 ~1.6M。Places／Claude 量測約 US$5。
- **保留事項**：上線（Cross 已在原話授權，條件是檢核完成）；動錢（Places 每日上限、Apple 帳號、GCP 配額）、改權限或金鑰（Google Routes 403）、對外發布（App Store）→ 不做，列「待你處理」。
- **⚠️ 假設（Cross 睡了，照路線圖的建議答案）**：
  - Q1 約會擋酒吧：擋。
  - Q2 試用後先維持 PWA：L1–L5（上架）延後。
  - Q3 舊店名：試用期不動。
  - 「全部路線圖」包含合併後的今日行程（`STATE.md` 的開放問題），不碰保留事項的部分一起做。

## 工作線

| 線 | 誰 | 項目 | 主要檔案 |
|---|---|---|---|
| A 挑店規則 | 主對話 | N2 歇要營業中、checker 第 1 輪的「放回時派到快關門」、N3 約會擋酒吧、X3 插座不宣稱 | `src/scene.ts`、`src/orderHandler.ts`、`src/prompt.ts` |
| B 「去」卡＋lane 實測 | 子代理（worktree） | X2 交通決定半徑、改查真地點；X5 probe 加 lane 實測模式 | `src/cards.ts`、`src/lanes.ts`、`src/probe.ts` |
| C 手機端資料 | 子代理（worktree） | X4 記憶匯出／匯入；N6 試用紀錄記「你在車上？」；N4 匯出一鍵含記憶 | `src/app.tsx` 除錯畫面、`src/placeMem.ts`、`src/trial.ts` |
| D 今日行程＋e2e | 子代理（worktree） | 今日行程用目前位置當出發點；N7 e2e 5 條失敗 | `src/dailyDecision.tsx`、`api/daily-route.ts`、`tests/e2e/` |
| E 文件 | 主對話（最後） | N8 README、`STATE.md`、規格附註、ROADMAP 狀態 | 文件 |
| F 連勝 | 子代理（worktree） | X7 出勤連勝＋公差假單＋升階（最小可用版） | `src/streak.ts`（新）、`src/app.tsx` 首頁與日記頁 |

## 進度

### A 線（主對話）✅

| commit | 內容 |
|---|---|
| `e053d25` | 歇全部情境：走到店時還沒開門的不派（`openOnArrival`）。到店剩不到 10 分（或已關）的店一律不派，含整批放回（`viable`、`HARD_OPEN_MIN`）；連這都沒有 → 超商救援。約會擋酒吧（Q1）。日本把「其他」的中文需求換成日文（`localizeNeed`：有插座→電源…）。工作讀書與其他的口令不保證有插座（X3） |
| `b504d8e` | probe 的「其他」查詞檢查認換過的日文；`state/handoff-tools/preview-measure.sh`、`r10-check.mjs` |
| `7ca1ea4` | 宵夜不派純酒吧（居酒屋照派）——量測時看到 bar moon walk |

- 單元 614/614。handler 測試「附近全是到店已關的店 → 超商救援」做過突變檢查（規則關掉就失敗）。
- 測試版實測（新宿駅）：23:40 → 12/12 的實質指標全 0，但 probe 字詞檢查誤判 2 格；修 probe 後 **23:42 → 12/12 pass**，歇派錯 0、外帶酒吧 0、約會酒吧 0、歇還沒開 0、到店已關 0。「其他／有插座」候選從 3 家變 11 家。證據 `state/evidence/r10/lineA-2340/`、`lineA-2345/`。

### E 線（主對話）進行中

- `263d43a`：README 換成現況；規格、策略、舊計畫加附註。`STATE.md` 與 ROADMAP 狀態等各線合併後寫。
