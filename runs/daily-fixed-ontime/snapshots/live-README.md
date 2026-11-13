# 真 API 證據（契約 STOP 7）
- 時間：2026-11-13 06:40–06:41 UTC（東京星期五 15:40）。`startTime` 22:30。
- 預覽站：分支別名 `general-decision-git-claude-friendl-f005c9`（部署 `dpl_9yYjtwF3pVNtPvbLMZq3U2GwrCXX`，commit `a2721b0`＝修正 commit）。
- 對照：正式站 `general-decision.vercel.app`（main `99984a1`，修正前）。同一時間、同一份請求。
- 請求：`fixed-ok-request.json`、`fixed-late-request.json`。兩者都改自 `runs/daily-open-on-arrival/snapshots/r3-fixed-request.json`：一蘭改成固定行程（`locked:true`），`start` 分別是 `23:30`（趕得上）與 `22:31`（出發後 1 分鐘，步行 7 分鐘，真的趕不上）。

| 請求 | 正式站（修正前） | 預覽站（修正後） |
|---|---|---|
| 一蘭 23:30 | `conflicts []`；一蘭 ETA 23:30；`routeVerified true` | 完全相同 |
| 一蘭 22:31 | `一蘭 渋谷店：預計晚到 6 分鐘` | 完全相同（真的趕不上，照舊警告） |

- 兩版結果逐站相同：真實 Google 步行矩陣符合三角不等式，貪婪排法本來就準時；新邏輯只在貪婪報晚到、且繞路排法能準時時才改排法（單元測試 `tests/unit/daily-fixed-ontime.test.ts` 覆蓋）。
- creative、coffee（兩版）、meal（late 請求兩版）`closed`：當晚 Google 營業資料，跟本 PR 無關（兩版相同）。
- late 請求的一蘭派到「一蘭 渋谷スペイン坂店」：固定站名稱比對 Places 的結果，兩版相同，不是本 PR 造成。
- 逐站摘要：`preview-*.summary.txt`、`main-*.summary.txt`；原始回應：同名 `.json`。

## 把關第 1 輪修正後複驗（commit `5ae7e70`）
- 2026-11-13 06:52 UTC。預覽站部署 `dpl_3GyiSSLzX348z7TDDNA4EUsbCYBN`（同一分支別名）。正式站同時再打一次（`main-r2-*`）。
- 結果：`preview-r2-*`、`main-r2-*`。`routeVerified true`；ok 請求兩版都 `conflicts []`、一蘭 ETA 23:30；late 請求兩版都報晚到。
- 兩版派的店不同（例：正式站 06:41 派スギ薬局、06:52 派マツモトキヨシ）：自動站從前 5 名隨機挑，固定站名稱比對 Places 也會變。同一版前後兩次就不同，不是本 PR 造成。
- 排程一致性（`live-consistency.txt`，8 份回應逐站重算）：每站 ETA＝上一站離開時間＋步行分鐘（早到等到開始時間）。晚到警告只在「步行分鐘 > 剩餘時間」時出現，分鐘數吻合。
