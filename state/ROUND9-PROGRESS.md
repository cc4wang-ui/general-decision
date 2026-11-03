# Round 9 進度：兩條線合併（接手用）

> 最後更新：2026-11-03 22:50 東京。分支 `claude/nifty-ramanujan-szofu5`（PR #26）。
> 正式站仍是 `main` 的 `dpl_GXH9RaKiS4FpELKoa7GDg5xgF2L5`（Round 3＋今日行程）。合併版只在測試版。

## 起因

今天 14:38–17:32 東京，另一條工作線把 PR #27–#32（今日行程）合進 `main`，Vercel 自動部署。那條線從 Round 3 長出來，正式站上的 Round 4–7 被換掉。Round 8 直傳上線因此取消（見 `state/ROUND8-PROGRESS.md` 最後一節）。

## 目標契約｜R9 兩線合併

- **Cross 原話**（2026-11-03 22:40 東京）：「A」——回覆選項「A 合併（建議）：Round 4–8 接到 main 上，「今日行程」保留。開新 PR，在測試版驗兩邊都能用，你說「上線」才合進 main 🔒」。
- **目標**：一個版本同時有 Round 4–8 的班長功能和今日行程，在測試版驗證可用，等 Cross 說上線。
- **成功指標**：兩邊的功能都在、都能用。
- **STOP 條件**：
  1. 分支含 `origin/main` 全部 commit（`75dc3cd` 是祖先）與 Round 4–8（`f93d1b5` 是祖先）；沒有衝突標記。
  2. 閘門：typecheck、單元全過、build、check:bundle、smoke 過；e2e 只容許交接文件記的 5 條既有失敗（cmd-layout ×4、memory ×1）。
  3. 測試版真資料（Round 4–8）：新宿駅情境 12/12 pass；歇派錯店 0；外帶派酒吧 0（`r8-check.mjs`）。
  4. 測試版真資料（今日行程）：`POST /api/daily-route` 200，每站有真的 place id；`/api/place-photo` 對這些 id 回 200。
  5. 測試版首頁 JS = 本機 build；JS 同時含今日行程與班長情境的字串。
  6. 獨立 checker PASS → Cross 說「上線」→ 合併 PR #26 進 `main` 🔒 → 驗正式站。
- **等級**：M。把關：獨立 checker。
- **保留事項**：合併進 `main`（= 上線正式站）🔒。
- **⚠️ 假設**：
  - 沿用 PR #26，不另開新 PR（同一條分支，少一個要管的 PR）。
  - `main` 的 bug 順手修掉：固定行程的時間檢查 `\\d` → `\d`（一字元；不修的話「加入固定行程」完全加不進去，`main` 自己的單元測試也一直失敗）。
  - 兩支新 API 補具名 export，讓 `check:bundle` 過。
  - Google Routes 回 403 不修：要在 Google Cloud 開權限，是 `main` 的既有問題（`STATE.md` P0）。測試版照實回 `routeVerified:false`。

## 做了什麼

| commit | 內容 |
|---|---|
| `b1e9d33` | merge `origin/main`。衝突只有 `src/app.tsx` 兩處（import、Screen 型別），兩邊都留 |
| `bd884c4` | `src/dailyDecision.tsx`：固定行程時間檢查 `\\d` → `\d` |
| `984645e` | `api/daily-route.ts` 補 GET、`api/place-photo.ts` 補 POST（handler 本來就回 405）；`scripts/check-api-bundle.mjs` 認 place-photo 是 GET 端點（無參數 → 400） |

## 閘門（2026-11-03 22:40 東京）

typecheck ✅、單元 606/606 ✅（`TZ=Asia/Taipei`）、build ✅（`index-BZa8PEbl.js`）、check:bundle ✅（6 支 API）、smoke ✅、e2e 108 過＋5 條既有失敗。

## 測試版實測（2026-11-03 22:47 東京）

證據：`state/evidence/r9/`（說明在 `README.meta.txt`）。測試版 `dpl_28ffDkpeN5VRGgPMsGgP3VuWB9pp`，git preview。

| 項目 | 結果 |
|---|---|
| 首頁 JS | `index-BZa8PEbl.js` = 本機 build；含今日行程與情境字串 |
| 情境（Round 4–8） | 12/12 pass；歇 0 派錯店；外帶派到 pizza_restaurant，0 酒吧 |
| 今日行程 | 200；3 站都是真店（5 CROSSTIES COFFEE、出汁林、フィットイージー 渋谷店），各有 place id |
| 店家照片 | 3/3 回 200 |
| 步行時間 | `routeVerified:false`（Google Routes 403，`main` 既有問題），畫面會照實標示 |

## Checker

（待跑）
