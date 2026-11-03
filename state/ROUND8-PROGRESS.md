# Round 8 進度（接手用）

> 最後更新：2026-11-03（東京早上）。分支 `claude/nifty-ramanujan-szofu5`，repo `cc4wang-ui/general-decision`。
> 正式站仍是 Round 7（`dpl_GRtU7onjopNWnQ1YrXRnQ9rM6eyA`，`94b4e0b`）。Round 8 只在 preview。
> 新的 session 先讀 `state/HANDOFF-2026-11-03.md`，再讀這份。

## 目標契約｜R8 派錯店補洞

- **Cross 原話**（2026-11-03）：「開始」——回覆 Claude 的提案：「下一輪的建議：補「派錯店」的漏洞。深夜東京選「歇」，查詢範圍放大後，派到卡拉OK和美食街。「外帶」深夜派到酒吧。這兩項都只改同一處排除清單，風險低。⚠️「約會派到酒吧」我先不放進這輪。」
- **目標**：選「歇」＋咖啡，派到的不是卡拉OK、美食街；選「外帶」，派到的不是酒吧。
- **成功指標**（Cross 的白話）：深夜東京的歇不再派到卡拉OK、美食街；外帶不再派到酒吧。
- **STOP 條件**：
  1. 歇選咖啡：type `karaoke`／`food_court`，或店名含美食街／Food Court／フードコート／居酒屋／izakaya／カラオケ／卡拉OK／KTV 的店不派。選酒吧、居酒屋、熱炒燒烤時不擋。
  2. 外帶：主類別是酒吧類（bar、pub、wine_bar、cocktail_bar、lounge_bar、sports_bar、night_club、bar_and_grill、beer_hall、居酒屋）不派。
  3. 附近真的只剩這些店 → 照舊整批放回（`relaxed`），不空手。
  4. 真資料：新宿駅 preview 量測（歇 6 情境＋外帶），派到的 0 筆是卡拉OK、美食街（歇咖啡）或酒吧類（外帶）。白天量一次（回歸），深夜（東京 01:00 前後）量一次（缺陷出現的時段）。
  5. 其他行為不變：既有單元測試照原樣過（Round 7 的日文查詞、水煙吧排除、台灣查詞）。
  6. 閘門過 → preview → 獨立 checker → Cross 決定上線 🔒。
- **等級**：M（正式站交付；Cross 決定上線）。把關：獨立 checker 子代理。
- **預算**：量測 2 次 × 約 15 Places ＋ 12 Claude ≈ US$2；token 主工作 ~150k ＋ checker ~170k。
- **保留事項**：上線 🔒（正式站 production 部署）；合併 PR #26 🔒（Cross 說不要合併）。
- **⚠️ 假設**：
  - 只在「歇＋咖啡」擋卡拉OK、美食街。選居酒屋時，居酒屋美食街是對的店；選酒吧時不動。
  - 外帶的酒吧排除台灣也生效（在哪裡外帶都不該派酒吧）。
  - 「約會派到酒吧」不在這輪（Claude 提案時排除，Cross 回「開始」）。
  - 中國茶房（chinese_restaurant）不擋：是能坐下喝茶的店；Cross 要擋再加。
  - 深夜量測用這個 session 自己排的喚醒（東京 01:00），不另外建排程任務。

## 做了什麼（`f93d1b5`）

- `src/scene.ts`：
  - 歇選咖啡的 `avoidTypes` 多 `karaoke`、`food_court`（`NOT_COFFEE`）。
  - 歇選咖啡的店名檢查從 `SHISHA_RE` 換成 `NOT_COFFEE_RE`（水煙吧＋美食街／居酒屋／卡拉OK）。美食街常標成 `restaurant`，type 擋不到，要靠店名。
  - 外帶加 `avoidTypes: BARISH`（跟歇選咖啡同一份酒吧清單）。
- `tests/unit/scene.test.ts`：新增 4 條「Round 8：派錯店」（店名、type 取自深夜量測）。
- 前端 JS hash 會變（`scene.ts` 前後端共用），畫面不變。

## 閘門（2026-11-03 09:15 東京）

typecheck ✅、單元 594 條 ✅（`TZ=Asia/Taipei`，原 590＋4）、build ✅、check:bundle ✅、smoke ✅、e2e r5-scene＋budget＋r6-station 23 條 ✅。

## 部署（直傳）

- 打包工具改成 `state/handoff-tools/pack-diff.mjs`：從 git 算 BASE（正式站 commit）到 HEAD 的差異，不必找舊 bundle。
- `bundle-8a.json.gz`（sha `ddf79f8e…`，8564 bytes）只含 `src/scene.ts`。其他檔用正式站的 sha 引用。

| 名稱 | deployment | 內容 |
|---|---|---|
| R8 preview-1 | `dpl_BKFQJtdhHLUuyuhwXvKNteUa7bgW`（general-decision-4q8eho7x4-cc4wang-uis-projects.vercel.app） | `f93d1b5`。正式站的檔＋8a |

## 實測

整理工具：`node state/handoff-tools/r8-check.mjs <json>`。對 Round 7 深夜資料跑，抓得到原本的 3 筆派錯店（歇 2、外帶 1），證明工具有效。

### 白天（2026-11-03 09:25 東京，R8 preview-1）—— 回歸檢查

原始回應：`state/evidence/r8/scene-shinjuku-day.json`＋`.meta.txt`。preview 首頁回 `index-DcEuZkNv.js`，跟本機 `f93d1b5` build 一樣（bundle 有解開）。

| 情境 | 查詞 | 派到 | type |
|---|---|---|---|
| 外帶 | 弁当 | すし屋のはなれ、 | meal_takeaway |
| 歇・一個人放空 | カフェ | LUKE'S LOBSTER 新宿サザンテラス店 | cafeteria |
| 歇・工作讀書 | 電源 カフェ | カフェ・ベローチェ 南新宿店 | coffee_shop |
| 歇・朋友聊天 | カフェ | サラベス ルミネ新宿店 | western_restaurant |
| 歇・談事情 | 静か カフェ | VERVE COFFEE ROASTERS NEWoMan SHINJUKU | coffee_shop |
| 歇・等人 | カフェ | セガフレード・ザネッティ・エスプレッソ 新宿３丁目店 | cafe |
| 歇・其他／有插座 | 有插座 カフェ | 猫カフェMOCHA(モカ)ラウンジ 新宿店 | cat_cafe |

- 12/12 pass；歇 0 筆卡拉OK／美食街；外帶 0 筆酒吧。Round 7 的日文查詞照舊。
- 白天店多，本來就不會派錯；缺陷只在深夜出現。真正的驗證看深夜。
- 觀察（不是這輪造成）：09:25 有 2 筆派到 10:00 才開的店（LUKE'S LOBSTER、猫カフェ）。歇沒有「要營業中」的規則，Round 5 起就這樣。列入下一輪候選。

### 深夜（排定 2026-11-04 01:00 東京，session 自己喚醒）

（待量）

## 回復點

正式站目前是 Round 7；Round 8 上線後，回復點是 Round 7 `dpl_GRtU7onjopNWnQ1YrXRnQ9rM6eyA`。
