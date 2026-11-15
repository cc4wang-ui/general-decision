# 交接｜guide-1115（個人生活導遊：已合併、正式站驗收）
狀態：完成（待 Cross 實機確認）
建立：2026-11-15 09:40 UTC｜環境：Claude Code（雲端容器）｜分支 `claude/vigilant-carson-fxshf7`

## 1. 下一個對話先做什麼
1. 沒有待辦的開發工作。等 Cross 用真 iPhone 回報兩件事：鍵盤會不會遮住輸入框、日文輸入法組字順不順。
2. Cross 回報有問題 → 開新任務，先讀 `runs/guide-1115/contract.md` STOP 2 和 `reports/gatekeeper-r2.md` 建議欄。

## 2. 做到哪
- 已完成：PR #81 合併（`26220ec`）。把關 R1 FAIL → 修 A–H → R2 PASS（`runs/guide-1115/reports/gatekeeper-r2.md`）。CI check／e2e／required 全綠（head `57468ac`）。預覽站真 POST 18 次全 200（`snapshots/preview-guide-r1.out.json`）。正式站：`dpl_Cjbj9qqe3tV5ZEFQTb5tNrqaspbr`（真 POST 18 次全 200、手動順序照做、固定行程 23:30 不動、咖啡主題只回 cafe；`runs/guide-1115/snapshots/prod-guide.out.json`；`snapshots/prod-guide.out.json`）。STATE.md §1、ROADMAP §6／§7.2 已同步。
- 進行中：無。
- 未開始：無（下列「已知未修」是建議，不是待辦）。

## 3. 做了哪些決定和為什麼
- 手動順序優先於步行最短；改順序後不自動重算（避免每按一下就打 Google Routes）。
- 「看過」用新 key `decide.daily.areasSeen.v1`，只影響挑區域先後，不讓區域變成「去過」。
- 「沒去過的區域」只挑區域中心 3.5 公里內（伺服器同一個半徑）；附近沒有就改回讓導遊決定並提示。
- 輪替不跟同一天的咖啡站／午餐站重複。
- 合併依 Cross 原話 `merge不用再我批准`、`CI 綠了就合併`，排在把關 PASS 之後。
- 已知未修：只顯示站名的精簡排序清單；澀谷一帶合格公園少；午餐站固定查定食；地區清單只有 6 區；區域邊緣仍可能查不到店；「沒去過的區域」主題沒限類型，正式站曾回酒吧（Zakka+Sake Bar DEARYOU，primaryType `bar`）。

## 4. 試過但行不通的
- 子代理跑久會撞用量上限；本棒改成主對話自己做，只派一個小範圍把關子代理（約 2 分鐘）。
- 新推送會取消舊 commit 的 CI，舊 run 的 `required` 記 failure；只看最新 head。
- 新容器沒有 node_modules：先 `npm ci`，否則 typecheck 報 `TS2688`。
- WebKit：`PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/pw`，`npx playwright install webkit`＋`install-deps webkit`，再把 `/opt/pw-browsers/*` symlink 進去。

## 5. 要讀哪些檔
1. 原文：本對話 `https://claude.ai/code/session_01NsUyziQeizXcGxu3h6AZHv`；前一棒 `/root/.claude/projects/-home-user-general-decision/e13d5178-9da8-5d09-bba8-27d225fda2ac.jsonl`（容器回收後就沒了）。
2. `runs/guide-1115/contract.md`、`reports/guide.md`（末節「把關 R1 修正」）、`reports/gatekeeper-r1.md`、`reports/gatekeeper-r2.md`。
3. `src/dailyThemes.ts`、`src/dailyDecision.tsx`、`api/daily-route.ts`、`src/dailyRouting.ts`。
4. `STATE.md` §1、`docs/ROADMAP.md` §6。
