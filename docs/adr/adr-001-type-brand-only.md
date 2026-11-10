# ADR-001：種類判斷只用 Google 類型與品牌表，刪除店名判斷路徑

- 狀態：**已接受**（用戶 2026-11-09 00:46 JST 決定，選項 (a)）
- 日期：2026-11-09
- 決策者：用戶（ワン）
- 相關 PR：`cc4wang-ui/general-decision` PR #38（`fix/daily-route-shuffle-dislikes`，base main `acfd4d2`）
- 實施：round 14（`src/placeKind.ts`，唯一改的產品檔；測試 round 14 先判 DO NOT MERGE（B1 tsc exit 2）→ 協調者修掉 B1 後 red-team round 14 PASS，見「驗證」一節）
- 來源（本 ADR 以以下四份報告為主要證據，另依據用戶決策紀錄、AGENTS.md root-cause 規則與 IMPROVEMENT-PLAN.md §1 layer 6（ADR 存放規則）；不發明事實）：
  - `~/workspace/general-decision-fix/tests/REPORT-ROUND13.md`（tests round 13：DO NOT MERGE）
  - `~/workspace/general-decision-fix/implementation/REPORT-ROUND14.md`（round 14 實作報告）
  - `~/workspace/general-decision-fix/tests/REPORT-ROUND14.md`（tests round 14：B1 修復後 DO NOT MERGE 解除條件）
  - `~/workspace/general-decision-fix/redteam/REPORT-ROUND14.md`（red-team round 14：PASS，可合併）
  - 用戶決策紀錄：2026-11-08 21:21 JST 條件（錯判與資料遺失永遠不接受）、2026-11-09 00:46 JST 選 (a)
  - `AGENTS.md` root-cause 規則（架構錯了就重設計，不 patch）
  - `IMPROVEMENT-PLAN.md` §1 layer 6（ADR 存放規則：repo 內 `docs/adr/`，一個決策一個檔案）
- 存放位置（計畫規定）：repo 內 `docs/adr/`，一個決策一個檔案。本文件由 staging 草稿落地而成，為草稿加上 step-4 驗證修正（C1 來源列表誠實化、C2 實施標頭補 DO NOT MERGE 經過、C6「12 輪換標記都失敗」、C7 round-13 數字加 diary 附註、N1 錯字合併前已修澄清）。舊 ADR 永不刪除或重寫，只能被新 ADR 取代。

## 背景

每日路線的種類判斷（`kindOfCandidate`，`src/placeKind.ts`）決定兩件事：使用者按「不要 X 這類」時哪些店要被排除，以及前端顯示「不要『X』這類」的按鈕。判斷訊號有兩種：Google 回傳的店家類型（`primaryType`／`types`，dish 級類型如 `ramen_restaurant`）與店名本身（關鍵字表）。

2026-11-08 21:21 JST，用戶已接受的產品條件是：錯判（種類判錯，雙向誤刪都算）與資料遺失永遠不接受、是每一輪的阻擋項；漏判（認不出種類）可以接受，寫進殘留清單即可。

round 13 的架構主張是「歧義標記一律不判，只留定義上無歧義的標記」，收斂條件是「錯判在結構上不可能」。tests round 13 的數字全過（tsc exit 0、bundle PASS、單元 1023/1025——2 敗為 diary 時區既存失敗、e2e 127/127），但新標準沒達到：留下的三個標記各有一個真實店名反例（見「決策」一節的三個結構原因）。12 輪換標記都失敗，第 13 輪證明「挑更無歧義的標記」這條路走不通。按用戶的 root-cause 規則（AGENTS.md）：架構錯了就重設計，不 patch。

## 決策

**刪除整條店名判斷路徑，只留 Google 類型與品牌表。** 具體改動（round 14，`src/placeKind.ts` 唯一產品檔，`api/daily-route.ts` 零變動）：

1. 刪除 `NAME_KINDS`（全部家族的店名關鍵字表）、`RAMEN_EXPLICIT`（沾麵／中華そば等拉麵明示表）、`UDON_STRONG`（讃岐／きしめん／ほうとう等烏龍麵強標記）、`kindOfName`（店名判斷函式）、`normalizeName` 與 `DASHES`（只為店名正規化服務的 helper）。
2. 新的 `kindOfCandidate` 順序：(1) `TYPE_KINDS`——Google dish 級類型，`primaryType` 再 `types`；(2) `BRAND_KINDS`——品牌表（見下）；(3) `GENERIC_TYPES`——泛用類型（`noodle_shop` → `noodle`）；(4) 都沒有 → `undefined`（漏判）。店名裡的任何字詞都不再決定種類。
3. 品牌表從 8 筆減為 7 筆：**刪除白木屋**（見原因 F2）。剩下的 7 筆：丸亀製麺→udon、鳥貴族→izakaya、一蘭→ramen、川上庵→soba、かつや→tonkatsu、磯丸水産→izakaya、魚民→izakaya。品牌比對是子字串（`name.includes(brand)`），是用戶決定的保留路徑，不是店名關鍵字判斷。

### 為什麼刪整條路徑：三個結構原因（tests round 13 的 F1–F3）

三個反例各打中一個不同的保留層，證明問題不在「挑錯標記」，而在「店名字詞可以決定種類」這個前提本身：

- **F1——讃岐／さぬき是地名，不是菜名。** 讃岐ラーメン はまんど是香川拉麵排名第 1 的拉麵店，卻被 `UDON_STRONG` 判成 udon；同理讃岐らぁ麺 伊吹いりこセンター、支那そば讃岐ロック、讃岐らーめん はまの、讃岐ラーメン 根ッ子。讃岐是舊國名（香川），「讃岐ラーメン」是真實存在的地方拉麵品類。round 13 報告寫「UDON_STRONG 只剩『菜名本身只屬於烏龍麵』的標記」——對讃岐這個說法本身就是錯的。
- **F2——白木屋是通用店名，不是封閉品牌。** 白木屋 しらきや是富山縣高岡的蕎麥麵店（Retty 記載ジャンル「そば（蕎麦）うどん ラーメン 丼もの」），卻被 `BRAND_KINDS` 判成 izakaya。白木屋＝白木造的店，是通用店名，不是只有連鎖居酒屋在用。品牌表「封閉集合、不會越補越長」的前提是錯的：同名不同店真實存在，而且無法用「再收一個品牌」解決（收了就是拿單店名當品牌，表無限膨脹）。
- **F3——冷麺是兩種菜。** 盛岡冷麺 寿々苑與冷麺ダイニングつるしこ是盛岡冷麺（平壌冷麺系，韓式冷麵）專門店，卻被 `RAMEN_EXPLICIT` 判成 ramen。冷麺同時指拉麵店的夏季冷拉麵與盛岡／平壌冷麵，跟被刪掉的つけ蕎麦是同一種歧義——同一個字串，一邊是拉麵店，一邊不是。

共同點：類型優先（Google dish 級類型）只能在類型本身是 dish 級時救回來；類型是泛用 `restaurant`／`noodle_shop` 時——正是店名路徑被諮詢的時候——錯判如實測發生。把正確性寄託在 Google 類型上，不是「結構上不可能錯判」。

### 品牌表規則（往後）

**任何品牌條目日後出現真實反例就刪掉，永遠不補反向規則。** 這是用戶的 standing rule（錯判的修法是刪掉猜的規則，不是補反向規則）。「7 筆沒找到反例」不是證明——round 13 搜過一蘭、魚民，round 14 搜過其餘 5 筆，tests round 14 與 red-team round 14 各自獨立逐筆對抗搜尋，皆無反例；但任何一筆日後出現反例就刪。

## 後果

### 正面後果

- **錯判在結構上不可能（就店名路徑而言）。** 新標準「店名路徑真的死了」經驗證成立：全 repo grep 無殘留店名判斷路徑（`src/placeKind.ts` 唯一對店名做 `.includes(` 的地方是品牌表）；tests round 14 自己的 25 則探針全過；red-team round 14 自己的 7 則探針全過（其中 14 個其他家族店名與 tests 的 11 店不重複）；紅綠證明：新測試在舊碼上 71 敗 → 新碼上 222 全過；牙齒探針 tests 4/4、red-team 5/5（故意寫錯的斷言全部失敗）。
- **分類邏輯變簡單、可審查。** `kindOfCandidate` 剩四步（類型→品牌→泛用→undefined），呼叫端只有兩處（`src/dailyDecision.tsx` 與 `api/daily-route.ts`，共用同一份邏輯）。不再有人需要判斷「這個標記夠不夠無歧義」——12 輪換標記都失敗。
- **其他家族也受益。** 壽司／炸豬排／串燒／麵包／咖啡／居酒屋／天ぷら 12 輪只出過漏判、從未錯判，但店名路徑刪的是整條——不是因為它們錯了，是因為前提本身被證偽。整條刪掉之後，這些家族也不可能再出現店名錯判。

### 負面後果（誠實的代價，寫在 `src/placeKind.ts` 檔案頭與 round 14 實作報告 §5）

- **大多數烏龍麵／蕎麥麵店變成 unknown（漏判）。** Google 類型表沒有 `soba_restaurant` 與 `udon_restaurant`，店名又不再判。「不要烏龍麵」「不要蕎麥麵」種類按鈕很少出現。擋這些店只能靠單店「不喜歡這間店」（仍然有效）。
- **拉麵也受影響。** 拉麵靠 `ramen_restaurant` 類型照樣認得出，一蘭靠品牌表照樣是 ramen；但名字裡有拉麵寫法、類型卻是泛用 `restaurant` 的拉麵店也變漏判（例如つけ麺 さなだ、らぁ麺 飯田商店、中華そば 青葉）。
- **其他家族同理。** スシロー、とんかつ和幸、やきとり大吉、鮨 さいとう、喫茶室ルノアール、パンとエスプレッソと、博多天ぷら たかお——類型是泛用時全部漏判。天ぷら連 dish 級類型都沒有，配 `japanese_restaurant` 也還是 `undefined`（設計決定的漏判）。
- **白木屋連鎖店本身也變漏判。** 品牌表刪掉白木屋之後，排除 izakaya 時照選，只能靠單店排除。
- **殘留漏判清單變長。** round 13 的 33 個名字（蕎麥麵 12＋拉麵 21）全部仍是漏判，加上 F1–F3 的 8 間店，再加上所有以前靠店名判的家族名字。完整清單見 `src/placeKind.ts` 檔案頭。
- **品牌表仍有殘留風險。** 7 筆「沒找到反例」不是證明；子字串比對裡最容易撞的是 3 字的「かつや」，搜尋沒找到任何一家名字含「かつや」的非連鎖店，但風險仍在（檔案頭自己也誠實寫了）。

### 未變的東西

- `api/daily-route.ts` 零變動：O1（thin-pool 全重生無候選）／O2（seen 未持久化）未動，本輪不修。
- 優先順序照舊：類型勝過品牌（丸亀製麺＋`ramen_restaurant` → ramen），品牌勝過泛用（丸亀製麺＋`noodle_shop` → udon）；泛用 fallback 照舊（藪蕎麦＋`noodle_shop` → noodle）。

## 考慮過的替代方案

| 方案 | 內容 | 為何拒絕 |
|---|---|---|
| **(a) 類型＋品牌，刪除店名路徑（本 ADR）** | 如上 | **用戶 2026-11-09 00:46 JST 選擇。已實施（round 14）。** |
| (b) 接受錯判風險 | 保留 round 13 的三個標記（或再換一批），接受「偶爾錯判真實店名」 | 違反用戶 2026-11-08 21:21 JST 的條件：錯判永遠不接受。F1–F3 證明錯判不是偶發——三個標記各有真實反例，且是三種不同的結構原因；接受它等於接受「使用者按『不要烏龍麵』會錯刪拉麵店」這個已知行為。tests round 13 已按此標準判 DO NOT MERGE。 |
| (c) 先研究第二訊號再決定 | 不刪店名路徑，先找一個能佐證店名訊號的第二訊號（例如店名訊號只在有第二訊號佐證時才判，否則回 undefined），研究完再決定 | 未被選擇。tests round 13 §3 曾指出這是結構上的出路方向之一（「改變店名路徑的地位，而不是再換一批標記」），但用戶決定直接採 (a)：第二訊號本身也要證明無歧義，研究成本不確定，且 (a) 已能達到「錯判結構上不可能」——多一個訊號只會多一個需要證明的環節。若日後 (a) 的漏判代價被認為不可接受，可由新 ADR 重新開啟 (c)，但須先證明第二訊號本身無歧義，不能只憑「看起來合理」。 |

## 驗證（本 ADR 的證據，不是事後補述）

- **tests round 14：** 新標準達到（grep 無殘留路徑、25 則探針全過、品牌表 7 筆逐筆搜過無反例、紅綠 71 敗→222 全過、牙齒 4/4、e2e 127/127、flaky 修復屬實）；唯一阻擋項 B1（`npx tsc -b` exit 2，兩個未用到的 `mockKind` helper，實作報告寫 exit 0 是說法不實——重現 round 11 T1 的類別）已由協調者修掉（刪兩個 helper），修法是刪死碼，產品碼不用動。
- **red-team round 14：PASS，可合併。** B1 獨立重驗：刪掉的兩個 helper 確實未用、留下來的兩個確實在用、刪除沒改行為、`npx tsc -b` 親自跑 exit 0；新標準獨立重驗成立（grep、7 則探針、品牌表逐筆搜尋、紅綠、牙齒 5/5、e2e 127/127、全套件連跑三次結果一致）。殘留：N1 兩個檔案頭註解錯字（合併前已順手修掉）；品牌表「沒找到反例」不是證明；O1/O2 未動；2 個 diary 時區失敗既存未修；e2e 從未進 CI。
- **書面檢討（red-team §10）：** round 12 只修了檔案（2 個測試檔），不是流程；同一類在兩輪內重現兩次，證明「tsc 是最後一步、輸出要親自讀」靠人工紀律守不住。結構修法是改進方案第 2 步（GitHub Actions CI，tsc 當 required check）。**這份 PASS 的是這個實例，不是這個類別**——本 ADR 記錄此結論，避免後人誤讀。
