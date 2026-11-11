# Capacitor-ready 檢查表（CAPACITOR-READY）

> 建立：2026-10-22（DEV-PLAN-3 W3，STRATEGY §3 C4）。**本輪不打包、不開 Apple 帳號、不送審**；這份只回答「現在的程式碼離能用 Capacitor 打包本機資源還差什麼」。
> 行號以契約 commit `881dacd` 的檔案為準；W2 合併後 `src/app.tsx`、`src/api.ts` 會位移，**以符號名為準**。
> 為什麼要「本機資源」而不是 `server.url`：Apple 2.5.2 不收會下載並改變功能的程式碼，4.2 要求超越「repackaged website」（R2§3）。把 Vercel 網站當 WebView 載入（`server.url`）等於把網站包殼，風險最高。

## 1. 結論（先看這裡）

| 項目 | 狀態 |
|---|---|
| 不依賴 `server.url` | ✅ 專案裡沒有任何 Capacitor 設定，也沒有程式碼假設「網頁是從 Vercel 載入的」（見 §2-1） |
| 定位、分享、剪貼簿都有功能偵測 | ✅ 定位、分享；⚠️ 剪貼簿只靠 `try/catch`，沒有 `navigator.clipboard` 存在檢查（§2-3） |
| 資源路徑 | ✅ 全是 `/` 開頭的站內絕對路徑，Capacitor 的 `capacitor://localhost/` 也是以根目錄服務，可用（§2-4） |
| `start_url`／`scope` | ✅ 都是 `/`（§2-5）；Capacitor 不讀 manifest，這兩個欄位只對 PWA 安裝有用 |
| **API 路徑** | ❌ **阻擋項**：`/api/order` 等是相對路徑，打包後會打到 `capacitor://localhost/api/...` 而 404；而且 API 沒有 CORS 標頭（§2-2） |
| 本機資料 origin 變更 | ⚠️ PWA 與 Capacitor 的 origin 不同，記憶與日記不會跟過去（STRATEGY R5；§2-6） |
| 原生能力（通知、觸覺等） | ❌ 本輪沒做，依 STORE-LISTING 必要 2 |

## 2. 逐項檢查

### 2-1　不依賴 `server.url`
- 專案沒有 `capacitor.config.*`。打包時 `webDir` 指向 `dist/`（`npm run build` 的輸出，`vite.config.ts` 沒有改 `base`，預設 `/`）。
- 不要在 `capacitor.config` 設 `server.url`；開發時要連 dev server 才暫時用，送審前拿掉。

### 2-2　API 路徑與 CORS（**阻擋項，下一輪必做**）
- `src/api.ts:124` `post('/api/order', …)`、`src/api.ts:142` `post('/api/weekly', …)`；W2 新增的 `requestGeocode` 也會走 `/api/geocode`。全部是相對路徑，`fetch(path)` 在 `src/api.ts:90`。
- 網頁版同源所以可用；Capacitor 內 origin 是 `capacitor://localhost`（iOS），相對路徑會打到 App 自己，404。
- 做法（下一輪）：`post()` 組 URL 時加 `API_BASE`：`const API_BASE = import.meta.env.VITE_API_BASE ?? ''`，網頁版維持空字串，打包版 build 時設成正式站網址（例如 `https://<正式站>`）。
- 伺服器端：`api/order.ts`、`api/weekly.ts`、`api/geocode.ts` 目前**沒有任何 CORS 標頭**（W3 已 grep）。跨 origin 呼叫需要 `Access-Control-Allow-Origin`（允許 `capacitor://localhost` 與 `https://localhost`）、`Access-Control-Allow-Methods: POST, OPTIONS`、`Access-Control-Allow-Headers: content-type`，並處理 `OPTIONS` 預檢。**注意 Vercel 的坑**：`export default` 必須維持 `{ fetch: handler }` 形狀（DEV-PLAN-3 §E.2-1），改完跑 `npm run check:bundle`。
- 這兩段（前端 `API_BASE`、後端 CORS）分屬 W2／W1 的檔案，W3 不碰；列在這裡讓下一輪的人一次看到。

### 2-3　瀏覽器 API 的功能偵測

| API | 位置 | 現況 |
|---|---|---|
| `navigator.geolocation` | `src/api.ts:68` `getLocation()`：`typeof navigator === 'undefined' \|\| !navigator.geolocation` 就回 `denied` | ✅ 有偵測，且失敗走手動地點（W1 `api/geocode.ts`＋W2 錯誤畫面） |
| `navigator.onLine` | `src/api.ts:85`：`typeof navigator !== 'undefined' && navigator.onLine === false` | ✅ |
| `navigator.share`／`canShare` | `src/share.ts:6-12` `canShareFiles()`；`shareNode` 開頭先 `if (!canShareFiles()) return 'unsupported'`（`src/share.ts:15`），分享前再 `navigator.canShare({files})`（`src/share.ts:20`） | ✅ 有偵測，不支援時顯示 `SHARE_FALLBACK`。Capacitor 內 WKWebView 的 Web Share 支援度不一，**打包後改用 `@capacitor/share` 外掛**，介面保持 `ShareResult` 三態即可 |
| `navigator.clipboard` | `src/app.tsx:551`（除錯畫面「複製全部」） | ⚠️ 沒有 `navigator.clipboard` 存在檢查，是靠外層 `try/catch` 吃掉 `TypeError`（`src/app.tsx:550-555`）。結果可用（失敗就不顯示「已複製」），但依本計劃「都有功能偵測」的標準算半套；W2 順手加 `navigator.clipboard?.writeText` 即可。Capacitor 可改用 `@capacitor/clipboard` |
| `localStorage` | `src/api.ts:42,52`、`src/app.tsx:24,87`、`src/debug.ts:22,33` | ✅ 都有 try 包住（`debug.ts` 檔頭註明無痕模式會丟例外） |
| IndexedDB（`idb-keyval`） | `src/diary.ts:2`；W2 的 `src/placeMem.ts` 同樣 | ✅ WKWebView 支援。注意 iOS 系統在儲存空間吃緊時可能清掉網頁資料——Capacitor 的 WKWebView 同樣，下一輪「匯出／匯入記憶」要補（STRATEGY R5） |
| `html-to-image`（分享梗圖） | `src/share.ts:2,49` | ✅ 純前端；`document.fonts.ready` 在 WKWebView 可用 |

### 2-4　資源路徑
- 角色圖：`src/avatar.tsx:8` `assetUrl = /officers/${lv}/${mood}.webp`（`public/officers/`）；`index.html` 的 `/icons/…`、`/manifest.webmanifest`、`/src/main.tsx`。
- 全是站內根目錄絕對路徑。Capacitor iOS 以 `capacitor://localhost/` 為根提供 `dist/`，所以 `/officers/…` 會對。**不要**改成 `./` 或 `file://`；若日後設 `base: './'` 要連 `assetUrl` 一起測。
- ~~`public/design-assets/`、`public/icons.svg` 沒有被 `src/` 引用，打包時可以排除以縮小 App。~~ 2026-11-11 已從 repo 刪除（`runs/hygiene-ui-1111/reports/hygiene.md`）。
- 沒有 service worker（`grep -n "serviceWorker" src index.html` 0 筆）；Capacitor 不需要，也不要在打包版註冊（避免舊快取蓋掉新版 bundle）。

### 2-5　`start_url` 與 `scope`
- `public/manifest.webmanifest`：`start_url: "/"`、`scope: "/"`、`id: "/"`、`display: "standalone"`、`orientation: "portrait"`。
- Capacitor 不讀 manifest；這些欄位只管 PWA「加到主畫面」。`tests/unit/manifest.test.ts` 把 `start_url`／`scope` 鎖在 `/`，之後改動要有意識地改測試。
- 色票欄位（`theme_color`、`background_color`）由 `tests/unit/palette-guard.test.ts` 守在 NES 色盤內。

### 2-6　origin 與資料
- PWA（`https://<正式站>`）與 Capacitor（`capacitor://localhost`）是不同 origin；`localStorage`、IndexedDB 不共用。換成 App 後，使用者的日記、`PlaceMem`、同意旗標（`decide.consent`）都是空的——**第一次開啟會重新顯示同意畫面**，這是對的（5.1.2），但「班長記得你」會失憶。
- 下一輪要做「匯出／匯入記憶」（place_id JSON，STRATEGY R5）才能搬。
- 同意畫面的 `CONSENT_VERSION`（`src/consent.tsx`）升版時，所有人會重新看一次；改了揭露內容就升版。

## 3. 下一輪打包步驟（草案；本輪不執行）

1. **先修阻擋項**：W2 檔案加 `API_BASE`；W1 檔案加 CORS 與 `OPTIONS`；跑 `check:bundle`、`e2e`。
2. `npm i @capacitor/core @capacitor/cli @capacitor/ios`；`npx cap init "報告班長" <bundle id> --web-dir dist`。**不設 `server.url`**。
3. `npm run build && npx cap add ios && npx cap sync ios`（`cap sync` 把 `dist/` 複製進原生專案，R2§3）。
4. 原生能力（STORE-LISTING 必要 2，至少 4 項）：`@capacitor/local-notifications`（午晚餐點名）、`@capacitor/haptics`、`@capacitor/share`、`@capacitor/geolocation`（含 Info.plist 的 `NSLocationWhenInUseUsageDescription`，文字寫「查附近的店」）。
5. Xcode：簽章（需要 Apple Developer 帳號——Cross）、App 圖示（`public/icons/icon-512.png` 是 NES 色盤的來源，1024 版另產）、`PrivacyInfo.xcprivacy`（Privacy Manifest）、App Privacy 標籤對照 `src/privacy.tsx` 第二、三節。
6. 隱私政策要有公開網址（ASC 必填）：做 `public/privacy.html` 或獨立頁，內容與 `src/privacy.tsx` 同步。
7. TestFlight 實機測：定位拒絕→手動地點、同意畫面、離線、分享面板、Dynamic Type。
8. 填 ASC（見 [STORE-LISTING.md](STORE-LISTING.md)）。

## 4. 本輪 W3 為了 Capacitor-ready 做了什麼

- `src/consent.tsx`、`src/privacy.tsx`、`src/report.ts` 不碰 `window`／`navigator`／storage：同意旗標由呼叫端寫，檢舉走 `mailto:`（Capacitor 內由系統開信件 App；沒有信件 App 時 `mailto` 會失效，可在打包時改用 `@capacitor/share` 或表單，**這是已知限制**）。
- 隱私頁的外部連結用 `target="_blank" rel="noopener noreferrer"`；在 WKWebView 內可能直接導離 App，打包時改用 `@capacitor/browser`。
- manifest／index.html 補齊語言與分類，不動色票。
