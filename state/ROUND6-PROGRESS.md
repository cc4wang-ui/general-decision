# Round 6 進度（接手用）

> 最後更新：2026-11-02 01:20（東京）。分支 `claude/nifty-ramanujan-szofu5`，repo `cc4wang-ui/general-decision`（舊網址 crosswang-collab 會自動轉）。
> 正式站是 Round 5（`dpl_52gRcv8zFHehsdU9BTYJG6H98Jc2`，`3c5018d`）。Round 6 只在 preview。
> ⚠️ Vercel 接在 repo：合併到 `main` 會部署正式站。Round 6 上線由 Cross 決定 🔒。
> 新的 session 先讀 `state/ROUND4-PROGRESS.md`（直傳做法）、`state/ROUND5-PROGRESS.md`，再讀這份。

## 起因

Cross 2026-11-01（東京地鐵上）：「在日本捷運會失效，想辦法適應這邊交通環境。」

查到三個壞掉的地方（都是「假設使用者站在街上」造成）：

1. 地下收不到 GPS → 等 6 秒 → 錯誤頁寫「開定位再報告」（定位明明開著）。手動報站每次重打，不記上次。
2. 車在動 → 定位是 2 分鐘前的或誤差幾百公尺 → 派到上一站附近的店。
3. 手動報站只用 zh-TW 查，範例寫「台北車站」。

## STOP 條件（Cross 回「ok」）

| # | 條件 | 現況 |
|---|---|---|
| 1 | 地下沒定位：不再叫人開定位；錯誤頁和選單都能一鍵報最近的站 | ✅ e2e `r6-station.spec.ts`：錯誤訊息「地下收不到定位。報你要下車的站。」、最近站 chips 一鍵派 |
| 2 | 10 個日文站名換得到座標，誤差 ≤ 300 m | ✅ 真資料 10/10，最大 95 m（六本木駅），其餘 ≤ 40 m |
| 3 | 舊或粗的定位不直接派店 | ✅ 單元 `geo.test.ts`＋e2e：超過 60 秒或誤差 > 300 m → 先問「你在車上？」 |
| 4 | 選了站，派出的店離該站 ≤ 情境半徑，口令以該站為起點 | ⚠️ 口令 12/12 從出站寫起（PASS）。距離：preview-2 新宿駅 02:47，12 筆有 4 筆超過情境本身的半徑（538/500、939/600、755/600、1106/1000），都是第一次查不到、半徑放大 2.5 倍（Round 4 既有機制）後找到的。checker 判 FAIL ×2 → 交 Cross |
| 5 | 閘門過 → preview → checker → Cross 決定上線 🔒 | 閘門 ✅；preview-2 ✅；checker 兩輪都 FAIL 在條件 4a（見下）→ 依規則停下，交 Cross 決定 |

## 做了什麼（`edf8948`）

- `src/api.ts`：定位結果多 `reason`（denied／unavailable／timeout／unsupported）、`accuracy`、`fixAt`。`geoDoubt()`：超過 60 秒或誤差 > 300 m → stale／coarse。maximumAge 120s → 30s。新錯誤種類 `no_signal`。
- `src/prefs.ts`：最近 5 站，**只存站名不存座標**（座標每次重查；R12 不落地的原則不變）。
- `src/app.tsx`：
  - 選單右上「📍目前位置／站名」標籤，跟情境標籤同一行（不加高度，T5 一屏規則仍過）。點開底部選單：目前位置／最近 5 站／打字報站。
  - 送出時定位可疑 → 同一個底部選單，標題寫原因；「就用目前位置」照那個座標派，選站就直接派。
  - 錯誤頁（地下）：最近站 chips 一鍵派＋輸入框（範例「新宿駅、台北車站」）。
  - 站名跟座標一起送（`loc.label`）。
- `src/geocode.ts`（新）：查詢本體，api/geocode.ts 與量測共用。有假名用 ja 查，其餘 zh-TW（純漢字兩邊都查得到，回來的名稱是中文：「新宿」「東京車站」）。
- `src/orderHandler.ts`：`loc.label` 去控制字元、截 40 字，不進 log。`src/prompt.ts`：有 label → 「使用者剛在「X」下車，steps 第一步從出站寫起」。
- `src/probe.ts`／`api/probe.ts`：`mode=geocode`（10 站 vs 參考座標）、地點加 `shinjuku`。

## 閘門（2026-11-02）

- typecheck ✅、單元 580 條 ✅（`TZ=Asia/Taipei`）、build ✅、check:bundle ✅、smoke ✅。
- e2e（Chromium）：108 過、5 不過（cmd-layout ×4、memory ×1，正式版本一樣不過，既有的 Chromium 差異）。新增 `r6-station.spec.ts` 7 條全過。`manual-location.spec.ts` B17 改成預期 loc 帶 label。

## Preview

| 名稱 | deployment | 內容 |
|---|---|---|
| R6 preview-1 | `dpl_2D81dE7dmgPJNpngiEAYA7aThsyS`（general-decision-cu77vqn6m-cc4wang-uis-projects.vercel.app） | `edf8948`。正式站的檔＋6a–6d（src 8 個檔）＋新 api/geocode.ts、api/probe.ts |
| R6 preview-2（上線候選） | `dpl_4mZZRHxWPGznKoYnRPQiKupJqnJW`（general-decision-qiw16vmid-cc4wang-uis-projects.vercel.app） | `83a92ba`。preview-1 ＋ 6e–6i（checker 第 1 輪修正：orderHandler、rules、probe、places、types、geocode） |

直傳做法同 Round 4／5；打包腳本在 scratchpad `tools/pack-r6.mjs`（從上一版 bundle 重建、跟 HEAD 比、差異打成 6*，驗證 bad=0）。

## 實測（2026-11-02 01:14 東京）

- `mode=geocode`：10/10 在 300 m 內。新宿 3、東京 11、渋谷 5、池袋 0、品川 10、上野 8、秋葉原 3、銀座 40、六本木 95、恵比寿 2 m。
- `mode=scene&loc=shinjuku`（深夜 01:15）：12/12 符合情境規則，鐘點都對（01:17 到店等）。這也是 Round 5 第一次深夜量測。
- 量測費：10 次 Places（geocode）＋約 15 次 Places＋12 次 Claude（scene）。約 US$1。

## 獨立 checker

1. 第 1 輪（2026-11-02 02:00，preview-1）FAIL，條件 4：
   - 4a 距離：rest「其他／有插座」派到步行 14 分的麥當勞，直線 1099 m > 情境半徑 1000 m。原因：Text Search 的 locationRestriction 只收方框，角落可到半徑 1.41 倍；量測工具只驗 maxWalk，沒驗距離。
   - 4b 口令起點：只有單元測試驗 prompt 文字，真模型輸出零筆（probe 的 loc 沒帶站名）→ Rule 6 不算證據。
   - 其餘條件 1、2、3、5 與既有規則（T5 一屏、只存站名、站名不進 log、改動 ≤ 300 行）PASS。
   - 已修（`83a92ba`）：候選帶 distM，方框查到、距離 > 半徑的切掉；`stationStart()` 伺服器保證第一步從出站寫起；probe 帶站名、驗距離與出站；查詞含「駅」用 ja（標籤回「新宿駅」不是「新宿」）。單元 583 條、e2e 26 條（r6／manual-location／budget／r5-scene）全過。
   - preview-2 真資料（新宿駅 02:47）：12/12 距離 ≤ 半徑、12/12 口令從出站寫起。存檔 scratchpad `r6check/scene-shinjuku-label.json`。

2. 第 2 輪（2026-11-02 02:50，preview-2）FAIL，條件 4a；4b PASS；1、2、3、5 PASS：
   - 4a：12 筆有 4 筆距離 > 情境半徑（快吃 538/500、外帶 939/600、放空 755/600、其他 1106/1000），全是第一次查不到、半徑放大 2.5 倍後找到的；量測工具把放大後的半徑當合格，帳面 12/12。「歇／其他」兩輪都派到同一家 1106 m 的麥當勞。
   - 修正沒修到的地方：切圓只對 `restrict`（方框）查詢生效；「歇」的關鍵字查詢用 locationBias，沒有 restrict，所以沒被濾到。
   - 另：Round 6 程式新增 323 行（src＋api，含量測工具 49、app.tsx 129），文件沒寫理由 → Rule 7 FAIL。
   - 兩輪同一條件 FAIL → checker 規則停下，交 Cross 決定（見下「待 Cross 決定」）。

## 待 Cross 決定（2026-11-02）

「情境半徑」要不要把「附近找不到就放大 2.5 倍再找」算進去？
- 接受放大（建議）：STOP 4 改寫成「≤ 情境半徑；附近沒有時 ≤ 2.5 倍」。maker 先把距離上限套到所有關鍵字查詢（含「歇」），再用原始 probe 回應重量一次，然後補 300 行理由。
- 不接受放大：深夜會常常派不出店，要另開一輪處理。

## 已知風險／下一輪候選

- 站名：查詞含假名或「駅」用 ja 查（回「新宿駅」）；打中文「新宿站」用 zh-TW（回「新宿」）。改了之後沒再重量 10 站的 geocode（省 10 次 Places；查法只差 languageCode）。
- 方框切回圓之後，候選會少一些（角落的店不算）；單元測試裡「一個人快吃」的 total 從 6 變 1。
- 深夜東京「歇」派到水煙吧（hookah_bar）×2、購物中心（新宿サザンテラス）×2、麥當勞 ×1。原因是 Round 4 就有的「東京歇關鍵字是中文咖啡廳」。不是這輪造成；下一輪候選：rest 在日本用日文關鍵字、排除 hookah_bar／shopping_mall。
- 深夜「約會」派到酒吧（Bar Vier，type=bar）：約會的排除清單沒有酒吧類。下一輪候選。
- 「去」卡的交通選項（走路／捷運／計程車／開車）仍然沒有作用。
- 定位可疑的判斷用 60 秒／300 m：沒有實機數據，可能太常問或太少問。要看 Cross 在東京實際用的感覺。
- 最近 5 站存 localStorage，清網站資料就沒了。
