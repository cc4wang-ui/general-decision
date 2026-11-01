# Round 5 進度（接手用）

> 最後更新：2026-11-01。分支 `claude/nifty-ramanujan-szofu5`（本機 commit，GitHub 推送仍被擋）。
> 正式站仍是 Round 4 v5（`dpl_AoLhnWJ9TW4FssNLH3YAySvqPThj`）。Round 5 只在 preview。
> 新的 session 先讀 `state/ROUND4-PROGRESS.md`（直傳做法、回復點），再讀這份。

## 起因

Cross 2026-11-01：「返回的結果不符合我的需求。需要在第一步先確認使用者情境偏好，使用幾種常見預設偏好或支援手動輸入其他。否則使用者按沒做很冤枉。」

## STOP 條件（Cross 回「ok」）

| # | 條件 | 現況 |
|---|---|---|
| 1 | 吃、歇各 ≥ 5 種預設＋「其他」（≤ 20 字），必選 | ✅ 吃 5＋其他、歇 5＋其他（歇加了「等人」湊滿 5 種）。單元＋e2e |
| 2 | 每種預設都量得到查法改變；手動輸入變成關鍵字 | ✅ `tests/unit/scene.test.ts`：每種預設的第一次查詢指紋跟「沒選」零重疊 |
| 3 | 真資料：每種預設 × 2 地點都派到真店、符合該情境規則 | ⏳ preview `mode=scene` 量測中 |
| 4 | 沒做 → 不符合情境：不罰站、不扣服從率、有紀錄 | ✅ 單元（diary／trial）＋e2e（`tests/e2e/r5-scene.spec.ts`） |
| 5 | 閘門過 → preview → 獨立 checker → Cross 決定上線 🔒 | 閘門 ✅；preview 建置中；checker 未跑 |

## 做了什麼

- `src/scene.ts`：情境規則。
  - 吃：一個人快吃（500 m、步行 ≤ 8 分）、外帶（600 m）、朋友聚餐（1.2 km、排除速食超商）、約會吃好一點（1.5 km、排除速食、評分 ≥ 4.3）、宵夜（第一次就 openNow）、其他（使用者的字＋餐廳／甜點／素食）。
  - 歇：一個人放空（600 m）、工作讀書（咖啡 → 不限時 咖啡廳）、朋友聊天（1 km）、談事情（安靜、評分 ≥ 4.2）、等人（400 m、步行 ≤ 6 分）、其他（使用者的字＋喝什麼）。
  - 排除規則是軟的：篩完一家都不剩就整批放回，debug 標 relaxed。
- 畫面：吃／歇點進去先到情境頁（獨立一頁）。點預設直接進原本的選單；「其他」要打字才能下一步。原本選單維持 ≤ 3 題、一屏放得下；返回鍵旁可「改」情境。上次選的排第一個，不預選。
- 沒做：吃／歇先問原因。「不符合我現在的情境」→ 記 `mismatch`、這家這次排除、回情境頁重選。「我就是不想做」→ 照舊罰站。
- 服從率分母不含 mismatch；週報 prompt 說 mismatch 不罵。
- 試用紀錄摘要加 `mismatch` 與 `byScene`（依情境分的成績）。
- 伺服器 log 不記「其他」使用者打的字（手機上的 debug 照留）。

## 閘門（2026-11-01）

- typecheck ✅、單元 547 條 ✅（要 `TZ=Asia/Taipei`）、build ✅、check:bundle ✅、smoke ✅。
- e2e（Chromium 代替 WebKit）：101 過、5 不過。5 條（cmd-layout ×4、memory ×1）在上線版本一樣不過，是既有的 Chromium 差異。

## commit（本機）

| commit | 內容 |
|---|---|
| `90df98e` | 情境第一步、沒做先問原因 |
| `bfd72e7` | 量測工具 `mode=scene`；除錯候選帶主類別 |

## Preview

| 名稱 | deployment | 內容 |
|---|---|---|
| R5 preview-1 | `dpl_GDQjtxBK13CjwwutZ7xzmw7JsCYT` | `bfd72e7`。直傳：Round 4 的 0a–0i、2a–2c ＋ 新的 3a–3e 覆蓋包＋新 `api/probe.ts` |

## 已知風險

- 「其他」的字直接進 Google 關鍵字，查不到時會擴大一次再退回超商。
- 情境的排除規則是軟的：附近只有速食店時，聚餐一樣會派速食店（debug 標 relaxed）。
- 「宵夜」白天選也會只查營業中的店。
- 「上次選的」存 localStorage，清網站資料就沒了（不影響功能）。
