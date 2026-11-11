# Codex 接手說明

交付日：2026-09-14。

## 目標與最新決定

把「決斷連」完成為可實際使用的React/Vite PWA，再準備Capacitor iOS包裝。使用者最新指定朝向**日式任天堂／紅白機時代的復古8-bit畫風**。請延續既有程式與產品邏輯，不重做成另一個產品。

視覺最新一輪已修改角色耳朵、眉眼、翻領，介面改方框、硬邊陰影與節拍方格。角色／介面一起改是當時未收到範圍問題回答後明示採用的預設方向，不是使用者另行核准的畫面定稿。最新AI方向圖只是美術參考，實際可用資產是public/officers下的48px檔案。

## 不可推翻的規則

1. 首頁／點名／日記的班長頭像及名牌在頂端。
2. 梗圖文字左欄、角色右欄；不得絕對定位壓字。
3. 梗圖文字用clamp，長店名換行；步驟在獨立白卡、▸前綴、沒有毒舌。
4. 每畫面一個主要動詞；沒做為ghost。保留七張模組卡及三位班長。
5. 命令／登記／罰則標準比例4:5；高度低於700px時首頁小鍵一列橫捲。
6. 深淺色、動態字級、減少動態、高對比跟隨系統。
7. 罵行為不罵人；命令本體零毒性，登記文字不罵不誇。沿用既有產品文案。
8. 無登入、帳號或收資料onboarding；資料本機保存。不要新增多人或不必要的後端。

## 角色資產

三位各有idle/bark/praise/punish/soft，共15張PNG及15張無損WebP，48×48、7–8個不透明色、alpha只有0/255。阿良亮綠、黑面中綠、老郭深綠，膚色都#FCA044。帽徽為金環，沒有五角星。值星帶角色右肩到左腰（畫面左上至右下）；照片來源在handoff/reference/characters/README.md。

老郭新增#F83800紅哨繩是使用者明確確認的第八色。所有圖維持可替換接口、object-fit:contain、image-rendering:pixelated，不能用圓形遮罩切掉名牌與肩線。

`src/avatar.tsx`仍只有四種Mood。soft已交檔但尚未接入；先釐清哪個產品狀態要使用，再整合型別，不能任意改動既有狀態語義。

## 已完成與验证邊界

- UI主要修改：src/styles.css、src/app.tsx、src/meme.tsx、src/share.ts。
- 最新方向的Vite設計build與TypeScript檢查通過。
- 前一輪正式build、7個測試檔84項測試通過。**美術／CSS 改版後的自動化檢查已於 2026-09-14 完整重跑並通過**：
  `npm run build` exit 0、7 個測試檔 84 項單元測試全過（需 `TZ=Asia/Taipei`，UTC 機器上會有 2 條時區斷言紅，
  那是環境不是程式）、`npm run e2e` 36 條與 `npm run e2e:shots` 7 條全部 exit 0。
  仍未完成的是**人工**視覺回歸與 `shots/CHECK.md` 的七列對照（見下一條）。
- 前一輪內建瀏覽器檢查首頁→點名→命令；checker確認修正後角色名牌、肩線完整、兩欄不相交。
- 最新日式8-bit更新尚未完成**人工**視覺回歸（`shots/CHECK.md` 第 13.3 節七列 PASS/FAIL 仍留白，maker 不自評）。
  ⚠️ 但 `shots/` 的七張 PNG **不是**上版截圖 —— 它們在 8-bit 改版的同一個 commit（`edf0321`）就一併重畫了，
  畫面已是改版後的新視覺，那就是 STOP D 要對照的素材。原句說「不能當成最新成果」會讓 checker 拒用唯一可用的對照。
  `handoff/reference/screens/`（實際在歷史快照 `decide-codex-handoff/` 底下）確實是上版，維持不採用。
- Playwright E2E（已於 2026-09-14 解除；本行保留歷史敘述，不是現在式斷言）：
  - 2026-09-11 那輪在 macOS sandbox 下 WebKit 啟動被擋，E2E 未到達網頁。**那是環境問題，不是程式問題。**
  - 2026-09-14 重跑：`npm run e2e` 36 條、`npm run e2e:shots` 7 張，全部 exit 0。
  - 2026-09-16 於 Linux 容器：出口網路政策擋住 playwright.download.prss.microsoft.com 與
    cdn.playwright.dev，裝不了 WebKit；改用容器預裝 Chromium 跑同一組 `tests/e2e`，36 條全過。
    Chromium 不是 WebKit 契約，所以 STOP C／D 在該容器上仍算未驗證。有 WebKit 的機器上請以 2026-09-14 那輪為準。
- 原生觸覺目前只有規格，未串接Capacitor；尚未建立或驗收iOS原生專案。
- 五名退伍者48px、2秒文化辨識盲測未執行；附blind-test.html，不能用AI模擬回答。
- 超大字級時閱讀卡允許增高，以保留全文；固定4:5分享輸出另行處理。這與「任何字級均固定4:5」的嚴格規則有差異，尚未得到使用者例外確認。

## 建議完成順序

1. 安裝依賴並檢查目前來源；啟動/design.html確認最新角色、方框與深淺色。不要依據舊截圖退回已更新的風格。
2. 完成七畫面視覺回歸，確認390×844、小螢幕、長店名、大字級、各角色與減少動態。清理累加CSS時保持最終效果。
3. 重跑型別、單元、build、E2E及e2e:shots，更新shots/CHECK.md；檢查命令→完成登記／沒做倒數→日記／週報全流程。
4. 確認後端環境變數載入方式与正式API可用；金鑰僅存在伺服器，禁止放進前端。設計入口的固定資料不得進正式流程。
5. 完成4:5／動態字級策略與分享實測，然後整合Capacitor觸覺、safe area、圖示與啟動畫面，在iOS實機驗證。
6. 整理可安裝／可測試版本；上架所需開發者帳號、簽章、真機與文化盲測需要使用者或外部資源時，明確列出缺項，不虛報完成。

## Git來源與同步注意

來源：https://github.com/crosswang-collab/general-decision
原始基底：aafa780f2078878a7860242338acaf6c50ebb5d4。
曾fetch到遠端92bddc5並逐檔取回design/8bit、sprites、hwpalette，沒有把整個遠端main合併。

> **⚠️ 以下兩段已過期（2026-09-16 更新）。** 原文寫「本資料夾包含未推送的本次修改；沒有.git」「若要接回GitHub，
> 先另行clone最新遠端、比對這份快照，再以新分支整合」。那是交付包當時的狀態。
>
> **現在這個資料夾就是 git 工作區**，`origin` = https://github.com/crosswang-collab/general-decision 。
> 交付包已由 PR #1（commit `edf0321`）逐檔接回，後續三個 Vercel 修正是 PR #2／#3／#4，
> 四個都已併進遠端 `main`，tip 為 `a3feddf` 並已部署到正式站。
> **不需要另行 clone、比對快照、開新分支整合 —— 那會重做一次已經完成的合併。** 直接在本 repo 接手即可。
> 交付包的原始快照保留在 `decide-codex-handoff/`，那份裡的同一句話是歷史紀錄，不要改。
> 接手前先 `git status` 確認自己在哪個分支，並以遠端最新狀態為準。

## 可以直接貼給Codex的任務

請先閱讀這個專案根目錄的CODEX-HANDOFF.md、DESIGN.md與docs/CHARACTER-BRIEF.md，接手完成決斷連app。延續使用者指定的日式任天堂紅白機復古8-bit方向，保留產品邏輯、七張卡、三位班長和所有鎖定規則。先啟動最新設計入口並完成視覺回歸，再完成正式API全流程、測試與Capacitor iOS整合。不要將上版截圖當成最新定稿，不要將固定展示資料帶進正式流程。自主處理可逆實作與驗證；需要真實金鑰、簽章、帳號、真機或人類盲測時再清楚列出所需條件。未執行的驗證不得宣稱通過。
