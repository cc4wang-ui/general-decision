### 目標契約｜daily-open-on-arrival（凍結）
- Cross 原話：`好，做第 1 項`。第 1 項是上一棒建議表的原文：`今日行程：走到店時店要開著`；理由原文：`今日行程只在搜尋當下看店有沒有開（openNow），不管走到時是幾點。`
- 目標：今日行程派出的自動站店家，在預估到店時間（ETA）是營業中，而且離打烊至少 10 分鐘（和主程式 N2 同一條規則）。
- STOP 條件：
  1. 自動站候選在 ETA 時已打烊、未開門、或剩不到 10 分鐘 → 不派，換下一個符合的候選；全部不符合 → 該站標無候選，新原因（例如 `closed`），卡片寫白話原因。
  2. 指定站、固定安排不換店；ETA 時不營業只在卡片警告。
  3. 沒有營業時間資料的店：維持現在的行為（顯示「營業狀態未確認」），不擋。⚠️ 假設，預設值即此。
  4. 午夜跨日（`etaDayOffset`）判斷正確：翌日的 ETA 用翌日的營業時間。
  5. 新測試在修正前失敗、修正後通過；全套單元測試、lint、`npm run typecheck`、CI（check、e2e、required）都綠。
  6. 用真的 API 跑通一次：在 Vercel 預覽站對 `/api/daily-route` 真送一次 POST，回應裡看得到營業判斷生效（證據存檔）。
  7. Places 費用不增加：不改 `MASK` 加新欄位。`currentOpeningHours` 已在 mask 裡，用它的 `periods`／`weekdayDescriptions`。
- 等級：M。理由：錯了會讓 Cross 走到關門的店（實際損失）。把關：獨立 Opus 子代理載入 checker skill，只給它 Cross 原話、本契約、PR 連結、證據。
- 預算：預估 ~150k token，上限 ~225k。
- 保留事項：合併 main（正式部署）🔒。其他無。

