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
| 4 | 選了站，派出的店離該站 ≤ 情境半徑，口令以該站為起點 | ✅ 距離：新宿駅 01:15 真資料 12/12 符合情境規則。⚠️ 「口令從出站寫起」只有單元測試驗 prompt 文字，真模型輸出未量（量測工具沒帶站名） |
| 5 | 閘門過 → preview → checker → Cross 決定上線 🔒 | 閘門 ✅；preview ✅；checker 待跑 |

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
| R6 preview-1（上線候選） | `dpl_2D81dE7dmgPJNpngiEAYA7aThsyS`（general-decision-cu77vqn6m-cc4wang-uis-projects.vercel.app） | `edf8948`。正式站的檔＋6a–6d（src 8 個檔）＋新 api/geocode.ts、api/probe.ts |

直傳做法同 Round 4／5；打包腳本在 scratchpad `tools/pack-r6.mjs`（從上一版 bundle 重建、跟 HEAD 比、差異打成 6*，驗證 bad=0）。

## 實測（2026-11-02 01:14 東京）

- `mode=geocode`：10/10 在 300 m 內。新宿 3、東京 11、渋谷 5、池袋 0、品川 10、上野 8、秋葉原 3、銀座 40、六本木 95、恵比寿 2 m。
- `mode=scene&loc=shinjuku`（深夜 01:15）：12/12 符合情境規則，鐘點都對（01:17 到店等）。這也是 Round 5 第一次深夜量測。
- 量測費：10 次 Places（geocode）＋約 15 次 Places＋12 次 Claude（scene）。約 US$1。

## 已知風險／下一輪候選

- ⚠️ 「口令從出站寫起」的真模型輸出沒量過（量測工具的地點沒有 label）。單元測試只驗 prompt 有那一句。
- 站名回中文（zh-TW）：使用者打「新宿駅」，標籤顯示「新宿」。Cross 看中文沒問題；要日文得改成「有漢字＋駅」也用 ja。
- 深夜東京「歇」派到水煙吧（hookah_bar）×2、購物中心（新宿サザンテラス）×2、麥當勞 ×1。原因是 Round 4 就有的「東京歇關鍵字是中文咖啡廳」。不是這輪造成；下一輪候選：rest 在日本用日文關鍵字、排除 hookah_bar／shopping_mall。
- 深夜「約會」派到酒吧（Bar Vier，type=bar）：約會的排除清單沒有酒吧類。下一輪候選。
- 「去」卡的交通選項（走路／捷運／計程車／開車）仍然沒有作用。
- 定位可疑的判斷用 60 秒／300 m：沒有實機數據，可能太常問或太少問。要看 Cross 在東京實際用的感覺。
- 最近 5 站存 localStorage，清網站資料就沒了。
