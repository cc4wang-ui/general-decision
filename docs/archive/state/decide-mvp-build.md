# decide-mvp-build — 人類版狀態

- **狀態**：blocked（S1–S10 完成，正式站已部署；STOP E 仍卡在兩項只有 Cross 能做的設定）
- **run_id**：run-20260911-230006（2026-09-14 8-bit 改版、2026-09-16 接手修復續作）
- **進度**：10 / 10 步完成，驗收未收尾
- **輪數**：2 / 5
- **更新時間**：2026-09-16T02:51:54.000Z

## 完成
- S1 ～ S9
- S10 部署（Vercel 已上線，`/api/order`、`/api/weekly` 在正式站可回應）

## 待辦
- 在 Vercel 填 `ANTHROPIC_API_KEY`（必要）與 `GOOGLE_PLACES_KEY`（可選），然後 redeploy
- 在 GCP 專案 919994638922 啟用 Places API (New)
- STOP D：checker 填 `shots/CHECK.md` 的七列表

## 失敗紀錄
- 2026-09-15 正式站 `/api/*` 全掛。兩個 bug，第二個被第一個蓋住：
  1. `ERR_MODULE_NOT_FOUND: /var/task/src/cards.ts` —— Vercel 的 dependency tracing 解析不了帶 `.ts`
     副檔名的 import specifier，`src/` 整個沒進 lambda。修法：新增 `vercel.json` 的
     `functions["api/*.ts"].includeFiles = "src/**"`。
  2. 請求永遠掛住、狀態碼 0、log 只有 `WARN: default export returned a 'Response'` —— Vercel 的 Node
     runtime 看到**函式型的 export default** 就走舊式 `(req, res) => void`，回傳的 Response 被丟棄，
     而且此時具名 `GET`／`POST` export 完全不被理會（第一次只加具名 export 沒有修好，正式站 log 一字不差）。
     修法：`export default { fetch: handler }`。
- 這兩個 bug 本機測試結構上抓不到：`npm run dev`／`npm run smoke` 走 vite 的 `ssrLoadModule`，
  解析得了 `.ts` specifier，也不管 export 形狀。已補 `npm run check:bundle`
  （`scripts/check-api-bundle.mjs`：在本機重建 lambda 的 `/var/task` 版面並斷言兩件事），
  並讓 `vite.config.ts` 的本機 API shim 照 Vercel 的 dispatch 順序解析入口。

## STOP 條件現況
- **A**：PASS — `TZ=Asia/Taipei npm run typecheck && npm run test` 退出碼 0，84/84。
  ⚠️ `TZ` 不可省：`tests/unit/diary.test.ts` 有兩條斷言綁台北時區，在 UTC 機器上會紅。那是環境，不是程式。
- **B**：PASS — `npm run build` 退出碼 0
- **C**：PASS（證據來源：**2026-09-14 重測**）— `npm run e2e` 36 條退出碼 0，WebKit／iPhone 13 profile。
  2026-09-11 那輪「WebKit 被 macOS sandbox 擋住」是環境問題，已解除。
  2026-09-16 的 Linux 容器裝不了 WebKit（出口網路政策擋住 playwright.download.prss.microsoft.com 與
  cdn.playwright.dev），以預裝 Chromium 跑同一組 36 條全過，但 Chromium 不是 WebKit 契約，該容器不據此宣稱 PASS。
- **D**：待 checker 判定 — `shots/` 七張是 2026-09-14 那輪 `npm run e2e:shots` 的產出，
  `shots/CHECK.md` 表格留白（第 3.3 節 maker 不自評）。交付包的設計驗收敘述另存為 `shots/DESIGN-CHECK.md`。
- **E**：BLOCKED（範圍已縮小）— 程式面已通，剩環境設定

## 需要 Cross 做什麼
原本卡三項，現在剩兩項：

| 項目 | 狀態 |
|---|---|
| Vercel token | ✅ 已解除 —— 走 GitHub 整合部署，不需要 CLI 登入 |
| `ANTHROPIC_API_KEY` | ⏳ 金鑰本身已驗證可用（實打 `claude-sonnet-5` 成功），**但還沒填進 Vercel 的環境變數** |
| `GOOGLE_PLACES_KEY` | ⏳ 金鑰本身有效，**但 GCP 專案 919994638922 尚未啟用 Places API (New)**，且還沒填進 Vercel |

見 DEPLOY.md 第 2、3 步。填完要 redeploy 才會生效。

> 這兩把金鑰曾經以明文貼進對話，設定完請到各自的 console 輪替一次。
