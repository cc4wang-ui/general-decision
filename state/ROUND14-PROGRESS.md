# Round 14 進度：架構重設計——只留類型＋品牌，刪掉店名判斷

> 日期：2026-11-09（JST）。分支 `fix/daily-route-shuffle-dislikes`，基底 `b282682`。
> **2026-11-09 08:40 JST 上線**：PR #38 合併進 `main`（合併 commit `766d2f49`）。
> 來源：實作報告與紅隊報告（`~/workspace/general-decision-fix/implementation/REPORT-ROUND14.md`、`~/workspace/general-decision-fix/redteam/REPORT-ROUND14.md`）。本檔是摘要，細節以那兩份報告為準。

## 決定

用戶 2026-11-09 00:46 JST 選擇方案 (a)：只留類型＋品牌，刪掉店名判斷。

原因：round 13 留下的三個標記各有一個真實店名反例，而且是三種不同的結構原因——F1 讃岐／さぬき是地名不是菜名（讃岐ラーメン はまんど是香川拉麵排名第 1 的拉麵店，卻被判 udon）；F2 白木屋是通用店名不是封閉品牌（白木屋 しらきや是富山高岡的蕎麥麵店，卻被判 izakaya）；F3 冷麺是兩種菜（盛岡冷麺 寿々苑是韓式冷麵專門店，卻被判 ramen）。12 輪換標記都失敗，第 13 輪證明「挑更無歧義的標記」這條路走不通。架構錯了就重設計，不 patch。

## 改了什麼

- 唯一改的產品檔：`src/placeKind.ts`（306 行變動）。`api/daily-route.ts` 零變動（O1／O2 未動，本輪不修）。
- 刪掉：`NAME_KINDS`（全部家族）、`RAMEN_EXPLICIT`、`UDON_STRONG`、`kindOfName`、`normalizeName`、`DASHES`。
- 新的 `kindOfCandidate` 順序：(1) `TYPE_KINDS`（Google dish 級類型，`primaryType` 再 `types`，類型優先）→ (2) `BRAND_KINDS`（7 筆）→ (3) `GENERIC_TYPES`（`noodle_shop` → `noodle`）→ 都沒有 → `undefined`（漏判）。
- 品牌表：白木屋刪掉（F2 的真實反例），剩 7 筆——丸亀製麺→udon、鳥貴族→izakaya、一蘭→ramen、川上庵→soba、かつや→tonkatsu、磯丸水産→izakaya、魚民→izakaya。規則：任何一筆日後出現真實反例就刪掉，永遠不補反向規則。
- 測試：`placeKind.test.ts` 115/115、`daily-route.test.ts` 107/107。紅綠證明：舊碼 71 敗 → 新碼 222 全過。Teeth probes：實作 4/4 故意錯的斷言全敗；紅隊自寫探針 7/7 通過。
- 誠實的代價（用戶決定 (a) 的直接結果）：大多數烏龍麵／蕎麥麵店變成 unknown（漏判），Google Table A 沒有 `soba_restaurant` 與 `udon_restaurant`；拉麵靠 `ramen_restaurant` 類型照樣認得出；其他家族（壽司／炸豬排／串燒／麵包／咖啡／居酒屋／天ぷら）也一樣只剩類型與品牌。完整殘留漏判清單見 `src/placeKind.ts` 檔案頭。

## 驗證數字

| 檢查 | 結果 |
|---|---|
| `npx tsc -b` | exit 0（紅隊親自重跑；tests round 14 的 B1 阻擋項已修） |
| `npm run check:bundle` | BUNDLE PASS（6 端點） |
| 全單元套件 | 1032/1034；2 敗皆在 `tests/unit/diary.test.ts`，是既存時區失敗（乾淨 main `acfd4d2` 同樣 2 敗），非本輪引入；PR #39 已修掉 |
| e2e | 127/127（實作與紅隊各自重跑皆通過） |
| 紅隊判決 | **PASS，可合併**（2026-11-09 02:38–03:20 JST 獨立對抗審查） |

## 殘留

- O1（池子太薄時完整重新生成變無候選）、O2（`seen` 只在當次請求有效）未動。
- 品牌表 7 筆「沒找到反例」不是證明；日後有反例就刪。
- 2 個 diary 時區失敗是既存問題（PR #39 已修）。
- N1 兩個檔案頭註解錯字（`src/placeKind.ts:41` 雙頓號；殘留清單兩個店名誤寫繁體「蕎麥」）列為順手修，未在本輪修掉。
- e2e 從未進 CI（本地跑而已；步驟 2 的 CI 已含 e2e required check）。
- Live verification 從未確認「拉麵仍可出現」；AKOMEYA 食堂排除按鈕標籤讀成「不要『咖啡』這類」是單一未驗證觀察，待查。
