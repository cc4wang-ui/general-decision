# 真 API 證據（契約 STOP 7）
- 時間：2026-11-13 03:45 UTC（東京星期五 12:45）。`startTime` 22:30。
- 預覽站：部署 `dpl_8bExGubVS3Z56GKh8QADNs2oHtPC`（`general-decision-jvglbrz7w`，commit `1798c7b`）。
- 對照：正式站部署 `dpl_ErmcKmUo23jpKg4XBCoKFJR4ZDiA`（`general-decision-7g0n5cnjp`，main `a7e571b`）。同一時間、同一份請求。
- 請求：`area-request.json`＝`r3-area-request.json`（`area 澀谷`、`areaOnly true`、目前位置在澀谷南方約 4.4 km）。`noarea-request.json`＝`r3-fixed-request.json`（出發點澀谷、沒開地區偏好）。

| 請求 | 正式站（修正前） | 預覽站（修正後） |
|---|---|---|
| 地區偏好 | shopping、meal `area`；creative、coffee `closed` | shopping 派 スギ薬局 道玄坂店（離澀谷 0.07 km）、creative 派 バツアートギャラリー（0.99 km）。沒有 `area`。coffee、meal `closed` |
| 沒開偏好 | creative、coffee、meal `closed` | 同左。行為不變 |

- meal `closed` 不是本 PR 造成：正式站同一份「沒開偏好」請求也是 `closed`（今天星期五的 Google 營業資料）。
- 所有派出的店都在澀谷 1 km 內。逐站摘要見 `preview-*.summary.txt`、`main-*.summary.txt`，原始回應見同名 `.json`。

## 最終 commit 複驗（`c41264c`，把關第 1 輪問題 1 修正後）
- 2026-11-13 03:52 UTC。分支預覽別名 `general-decision-git-claude-sleepy-ded984`（當時最新部署 `dpl_8GjbmnpjTcvMRJL77mhgmXk5EbMx`＝`c41264c`）。
- `final-area-2230.*`：沒有 `area`。shopping 派 スギ薬局 道玄坂店（0.07 km）。creative、coffee、meal `closed`（到店時打烊，跟正式站同時段一致）。
- `final-noarea-2230.*`：跟正式站、上一版預覽站一致（creative、coffee、meal `closed`）。
- ⚠️ 直接用部署網址 `general-decision-fdfml4xft` 的分享連結回 302 轉登入頁（HTTP 401）；改用分支別名的分享連結就成功。
