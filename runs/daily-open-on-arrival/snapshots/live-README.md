# 真 API 證據（契約 STOP 6）
- 預覽站：`general-decision-m6ex9pchj-cc4wang-uis-projects.vercel.app`（部署 `dpl_2ALRnqZDcBu6sVPRNtGcg5qtxUG4`，commit `cce761f`）
- 時間：2026-11-12 08:13 UTC（東京 17:13）。腳本：同目錄請求本體見 `live-*.json` 對應的 stops。
- `live-now.json`：現在出發。6 站都有 ETA，`openAtEta` 全部 `open`。
- `live-2230.json`：`startTime` 22:30。藝廊（creative）、咖啡（coffee）到店時都打烊 → `noCandidateReason:"closed"`，列進 `missingStops`。其餘站 `open`；meal 權八 ETA 翌日 01:39（`etaDayOffset:1`），營業時間週四 11:30–週五 03:30。
- 每個候選的 `candidate.hours` 就是 Google 回的 periods，可用 `src/openAtEta.ts` 逐一重算。

## R3 修正（PR #64）預覽站實測
- 預覽站：`general-decision-git-claude-handoff-9334a7-cc4wang-uis-projects.vercel.app`。請求本體：`r3-preview-request.json`、`r3-fixed-request.json`（後者給固定午餐站補 `place`）。`startTime` 22:30。
- `r3-preview-2230.*`（commit `139ba43`，只加 `??usable[0]`）：咖啡站被派到阿曼馬斯喀特的 `It’s Quiet Specialty Coffee`，`travelMin 161849`、`etaDayOffset 113`。原因：Places `locationBias` 只是偏好，池裡有遠處的店；新 fallback 不看估計就派。
- `r3-fixed-2230.*`（commit `584a574`，換店只用 3.5 km 內候選）：2026-11-12 10:25 UTC。`routeVerified true`、`partial false`、總步行 `53` 分鐘，7 站都在澀谷，`openAtEta` 只有 `open`／`unknown`。
- `r3-area-2230.*`（commit `0f6b6a8`，地區偏好時半徑以地區中心為準）：`area 澀谷`、`areaOnly true`、出發點在澀谷南方約 4.4 km（`35.6195,139.7005`）。`routeVerified true`。派出的 2 站離澀谷 0.38／0.18 km，`open`。缺 4 站：creative、coffee `closed`；shopping、meal `area`。
- `main-area-2230.*`：同一份請求打正式站（main，部署 `general-decision-oqjn9r7zk`）。缺站與原因完全相同 → 不是本 PR 造成。
- ⚠️ 既有問題（本 PR 不改）：開地區偏好且出發點離地區很遠時，第一次搜尋以出發點為中心（`locationBias`），回來的店都在地區外，被標 `area`。
