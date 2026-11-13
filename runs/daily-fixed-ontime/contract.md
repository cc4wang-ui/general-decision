### 目標契約｜daily-fixed-ontime（凍結）
- Cross 原話：`交接做 P0`（2026-11-13）。P0 原文（`STATE.md:42`，逐字）：`**P0 — route algorithm correctness:** src/dailyRouting.ts uses a greedy nearest-feasible heuristic, not global route optimization. Fixed appointments may be late; alerts exist, but rigorous multi-appointment optimization, opening-hour constraints, overnight boundaries and transit choices remain unverified.`
- 目標：有固定行程時，只要存在一種排法能準時趕上所有固定行程，今日行程就用那種排法；真的趕不上才顯示晚到警告。
- 成功指標（白話）：Cross 不會因為系統排法而遲到；警告只在真的趕不上時出現。
- STOP 條件：
  1. `scheduleRoute`：存在「所有有時間的固定行程都準時」的排法時，回傳的排法 `conflicts` 為空。
  2. 不存在準時排法時，仍回晚到警告（`預計晚到 N 分鐘`），不丟站、不隱藏。
  3. 隨機比對：與窮舉所有排法的結果比，「窮舉找得到準時排法、程式卻報晚到」的案例數＝0（含違反三角不等式的步行矩陣）。
  4. 原本貪婪排法沒有衝突時，輸出完全不變（不改正常情況的行為）。
  5. 計算有上限：站數多時不會卡住請求（搜尋有節點上限；超過就退回貪婪結果並照舊警告）。
  6. 新測試在修正前失敗、修正後通過；全套單元測試、lint、`npm run typecheck`、CI 都綠。
  7. 用真的 API 跑通一次：Vercel 預覽站、正式站各真 POST 一次含固定行程的請求，`routeVerified:true`，固定行程 ETA 與 conflicts 合理。證據存檔。
  8. Google 費用不增加：Routes／Places 呼叫次數不變。
- 等級：M。理由：錯了會讓 Cross 遲到（實際損失）。把關：獨立 Opus 子代理，載入 checker skill。
- 預算：預估 ~120k token，上限 ~180k。
- 保留事項：無。合併 main 已由 Cross 授權（2026-11-13 原話 `merge不用再我批准` `一律核准`）。
- ⚠️ 假設：
  - 範圍只到「固定行程準時」。到店營業時間（PR #64 已做）、大眾運輸選擇（今日行程只用 `WALK`）、總距離最短化不在範圍。
  - 跨日規則沿用 `deadlineAbs`（DESIGN §8 午夜規則），不改。
  - 有多種準時排法時，選搜尋先找到的（每步先試步行最近的站），不追求總步行最短。
  - 搜尋節點上限預設 20000；超過就退回貪婪結果。
- 開工前實測（2026-11-13，快照 `snapshots/probe-before.txt`、修正後 `snapshots/probe-after.txt`；探測腳本已收進 `tests/unit/daily-fixed-ontime.test.ts` 的隨機比對）：12 萬組隨機案例裡，貪婪排法 0 次「可準時卻報晚到」。只在步行時間違反三角不等式（繞經別站比直走快）時才會發生；手工案例重現：晚到 70 分鐘，但存在準時排法。
