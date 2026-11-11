# 上線五步（第 15 節）

> **歷史文件，不是指令。** 這份文件寫的是 2026-09-15 的上線步驟，內容已過時（正式站早就改走 Vercel GitHub 連動自動部署）。不要照著做；現況以 `STATE.md` 為準。

S1–S10 已經完成並且全綠。

**第 1 步（匯入）與第 4 步（Deploy）已經做完了** —— Vercel 專案已存在並與 GitHub 連動，
2026-09-15 的 commit `a3feddf` 已部署上去，`/api/order`、`/api/weekly` 在正式站可以回應。

**你真正還要做的只剩第 2 步（填金鑰）與第 5 步（裝到手機）。** 第 3 步（Google Places）可以晚點再補。
第 1、4 步留在下面只是為了保留完整脈絡，不用重做。

---

## 1. Vercel 匯入 repo　✅ 已完成，不用重做

Vercel 專案已經存在並與 GitHub 連動，正式網址是 https://general-decision.vercel.app 。
不需要再去 https://vercel.com/new 匯入一次。

<details><summary>當初的步驟（保留供參考）</summary>

到 https://vercel.com/new → Import `crosswang-collab/general-decision`
Framework 選 **Vite**（通常會自動偵測）。Root Directory 留空（專案就在根目錄）。

</details>

## 2. 填環境變數

Settings → Environment Variables，Production 環境：

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | 你的 Anthropic 金鑰（**必要**） |
| `GOOGLE_PLACES_KEY` | Google Places 金鑰（**可選**，見第 3 步） |

> 沒填 `GOOGLE_PLACES_KEY` 也能上線。「吃」「歇」會走第 7 節規則 6 降級：
> 班長不推薦具體店名，改講類型，並在梗圖下標註明「店家資料暫時拿不到」。
> 其他五張卡完全不受影響。

## 3.（可選）Google Places

Google Cloud Console → 啟用 **Places API (New)**
金鑰限制：API restrictions = Places API (New)；Application restrictions = **None**（我們從 server 端呼叫）。
費用：第 16 節——Nearby Search Enterprise 免費 1,000 次/月，單人用不完（程式內另有每日 40 次硬上限）。

## 4. Deploy　✅ 已完成，但**改完第 2 步要再 Redeploy 一次**

正式網址：https://general-decision.vercel.app
最近一次部署：2026-09-15 16:48 UTC，`dpl_AeAKjrqmarnrXYoioXFALY3dJqVi`（commit `a3feddf`）。

⚠️ **環境變數是在函式啟動時才讀進去的。** 填完第 2 步的金鑰之後，一定要回
Deployments → 最新那筆的「⋯」→ **Redeploy**，新金鑰才會生效。只按 Save 不重新部署，線上還是拿不到口令。

## 5. 裝到手機

iPhone Safari 開網址 → 分享 → 加入主畫面 → 開啟允許定位。

---

## 驗收（第 15 節）

三個動作都成立才算上線：

1. 按「吃」→ **出現一道口令**
2. 按「報告班長，完成」
3. 打開新兵日記 → 有一筆

> ⚠️ 這條原本寫「出現店名」，那是錯的驗收標準。**沒做第 3 步之前，班長一定不會報店名。**
> 目前 `GOOGLE_PLACES_KEY` 金鑰本身有效，但它所屬的 GCP 專案 `919994638922` 尚未啟用
> Places API (New)，Places 一定回 403，走第 7 節規則 6 降級：只講類型、不給具體店名，
> 並在梗圖下標註明「店家資料暫時拿不到」。**那是規格內的正確行為，不是驗收失敗。**
> 要看到真實店名，必須先完成第 3 步，而且手機要允許定位。

命令列也可以驗一次：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://你的網址.vercel.app
```

```bash
curl -s -X POST https://你的網址.vercel.app/api/order -H 'content-type: application/json' -d '{"module":"sleep","level":1,"choices":{"wake":"07:30"},"now":"2026-09-12T22:00:00+08:00","recentOrders":[]}'
```

第二個應該回一段 JSON，`meme.big` 是「23:30 熄燈」。

---

## 想先在電腦上看

不需要任何金鑰就能看畫面（API 會回錯誤畫面，那條路徑也是照第 11 節設計的）：

```bash
npm run dev
```

有 Anthropic 金鑰的話，整支都會動：

```bash
ANTHROPIC_API_KEY=你的金鑰 npm run dev
```

---

## 改 `api/` 之前必讀（兩個只在 Vercel 上才會爆的坑）

這兩個真的發生過，都已修好並在正式站驗證。寫在這裡是因為它們很容易被「改一行 api/ 就順手部署」重新踩回去，
而且**本機測試結構上抓不到**。

1. **`src/` 不會自動被打包進 lambda。** 症狀是每次呼叫都 `ERR_MODULE_NOT_FOUND: /var/task/src/cards.ts`，
   函式在載入階段就死，連 405 都回不出來。原因是 Vercel 的 dependency tracing 解析不了帶 `.ts` 副檔名的
   import specifier。修法是 `vercel.json` 的 `functions["api/*.ts"].includeFiles = "src/**"`。
   **不要刪掉或改壞 `vercel.json`**，那等於回到出事的狀態。

2. **`export default` 不可以是函式。** Vercel 的 Node runtime 一看到函式型的 default export 就走舊式
   `(req, res) => void`：回傳的 `Response` 被直接丟棄、請求永遠掛住（狀態碼 0、不是 500，所以連 error log 都沒有），
   而且此時具名 `GET`／`POST` export 完全不被理會。正確形狀是 `export default { fetch: handler }`。

為什麼本機看不出來：`npm run dev` 與 `npm run smoke` 走 vite 的 `ssrLoadModule`，它解析得了 `.ts` specifier，
也不管 export 是什麼形狀，所以這兩個 bug 在本機永遠綠燈。回歸檢查用：

```bash
npm run check:bundle
```

它會在本機重建 lambda 的 `/var/task` 版面（只放 `vercel.json` 承諾要打包的檔案），
斷言函式載得起來、`export default` 不是函式、具名 `GET`／`POST` 齊全、`GET` 回 405。**改完 `api/` 或 `vercel.json` 一定要跑。**

---

## 已知風險（誠實區）

- **api/ 已經在真的 Vercel 上跑過了**（這條原本寫「沒有跑過」，已過期）。
  2026-09-15 16:48 UTC 的部署 `dpl_AeAKjrqmarnrXYoioXFALY3dJqVi`（commit `a3feddf`）上，
  `GET /api/order` 與 `GET /api/weekly` 都回 405 `{"error":"method_not_allowed"}`，runtime log 乾淨。
  上正式站才暴露出來的兩個致命問題見下一節，都已修好。
  若 `/api/order` 回 500，第一個要看的仍是 Vercel 的 Function Logs。
- **Claude 的口令品質沒有被測過。** 第 3.1 節寫明產品內 loop（口令品質）不在契約內，要你用人眼迭代。
  提示詞在 `src/prompt.ts`，語料在 `src/officers.ts`。
- **`claude-sonnet-5` 這個 model id** 寫在 `api/order.ts` 與 `api/weekly.ts`。
  2026-09-15 已用你帳號的真金鑰打完整 handler 三次（吃／吃+定位／買），全部 HTTP 200 並回出合法 Order JSON，
  所以這個 id 在你的帳號可用，不用換。只有換成別的帳號、API 回 404 model not found 時才需要改。
