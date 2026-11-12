# 真 API 證據（契約 STOP 6）
- 預覽站：`general-decision-m6ex9pchj-cc4wang-uis-projects.vercel.app`（部署 `dpl_2ALRnqZDcBu6sVPRNtGcg5qtxUG4`，commit `cce761f`）
- 時間：2026-11-12 08:13 UTC（東京 17:13）。腳本：同目錄請求本體見 `live-*.json` 對應的 stops。
- `live-now.json`：現在出發。6 站都有 ETA，`openAtEta` 全部 `open`。
- `live-2230.json`：`startTime` 22:30。藝廊（creative）、咖啡（coffee）到店時都打烊 → `noCandidateReason:"closed"`，列進 `missingStops`。其餘站 `open`；meal 權八 ETA 翌日 01:39（`etaDayOffset:1`），營業時間週四 11:30–週五 03:30。
- 每個候選的 `candidate.hours` 就是 Google 回的 periods，可用 `src/openAtEta.ts` 逐一重算。
