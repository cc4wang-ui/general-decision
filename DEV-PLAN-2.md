# 決斷連 · 第二輪開發計劃（階段 A–D）

> **歷史文件**（2026-09）。目前狀態看 `STATE.md` 與 `state/HANDOFF-2026-11-03.md`。

> 建立日期：2026-09-17
> 上一輪：`DEV-PLAN.md`（階段 0–6），階段 0–3 已完成並上線，階段 4 剩 Places 一項。
> 這份文件是給**新對話**接手用的。讀完這份 + `DECIDE-DEV-DOC-v1.md` 就能開工，不需要回頭翻第一輪的對話。

---

## 0. 現況（2026-09-17 實測，不是推測）

| 項目 | 狀態 | 證據 |
|---|---|---|
| 正式站 | 上線中 `https://general-decision.vercel.app` | `dpl_7254EGNqPnmRt5hNSjtFJDvXQ6iT` |
| `/api/order` | ✅ 正常 | `05:16:06 POST /api/order 200`，24h 內零 runtime error |
| `/api/weekly` | ✅ 載得起來 | GET → `405 {"error":"method_not_allowed"}` |
| `ANTHROPIC_API_KEY` | ✅ 已驗證有效 | 真實 POST 回 200，班長正常回話 |
| `GOOGLE_PLACES_KEY` | ⚠️ **未驗證** | 測試時沒給定位 → Places 整段跳過；且 2026-09-18 前 `api/order.ts` 把 Places 失敗靜靜吞掉不寫 log，從外面無法判斷。現已補 `[places] ok/fail` log |
| Places API (New) | ✅ Cross 2026-09-18 確認已啟用 | 之前文件寫「未啟用」是舊資訊，未經查證就一路沿用，錯 |
| 階段 2 / 3a / 3b | ✅ 已上線 | 正式站 CSS 資產量到完整 NES 色盤 |

**開工前的唯一外部相依**：階段 B 需要先啟用 Places API (New)
→ https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=919994638922

---

## 1. 不可推翻的規則（承接第一輪，一條都沒有失效）

1. **永遠不要整包覆蓋。逐檔搬。** 如果 `git status` 出現任何 `deleted:`，立刻停下來。
2. **不要為了讓測試變綠而改測試斷言**，除非那是計劃中明確寫出要一起改的。
3. **不要改 `src/avatar.tsx` 的 `Mood` 型別**去加 `soft`。
4. **不要改 UI 色票**（本文件階段 A 是唯一例外，且必須先拿到 Cross 的明確選擇）。
5. **不要新增登入、帳號、多人功能或任何後端。** 資料本機保存（IndexedDB）。
6. **不要動語氣護欄** —— `DECIDE-DEV-DOC-v1.md` 第 7 節那七條絕對規則。
7. **凍結目錄，一個字都不要改**：`decide-codex-handoff/`、`decide-design/`、`docs/research/`。

### 第二輪新增的規則

8. **模型永遠不准產生 URL。** 任何連結一律伺服器端用真實資料組出來（階段 B 的核心）。
9. **prompt 是盡力，`enforceRules()` 才是保證。** 凡是「必須如此」的事，不能只寫在 prompt 裡（階段 D 的核心）。
10. **不要猜軍事常識。** 階級與徽章查到一手來源再動手，查不到就回報，不要畫一個看起來像的（階段 C）。

---

## 2. 開工前必須知道的三個坑

### 2.1 Vercel Node runtime 的 `export default`

只要 `export default` 是**函式**，Vercel 走舊式 `(req, res) => void`：回傳的 `Response` 被丟棄、請求永遠掛住、狀態碼 0、**不會產生 error log**，而且具名 `GET`/`POST` 完全不被理會。

正確形狀（`api/order.ts:79`、`api/weekly.ts` 已經是）：

```ts
export function GET(request: Request): Promise<Response> { return handler(request) }
export function POST(request: Request): Promise<Response> { return handler(request) }
export default { fetch: handler }   // ← 物件，不是函式
```

改 `api/` 之後**一定要跑** `npm run check:bundle`。本機 dev 結構上抓不到這個坑（`ssrLoadModule` 解析得了 `.ts`、也不管 export 形狀）。

### 2.2 `vercel.json` 不能刪

`api/*.ts` 用 `'../src/cards.ts'` 這種帶副檔名的 specifier。Vercel 的 dependency tracing 解析不了 `.ts` specifier，`src/` 整個不會被放進 lambda → `ERR_MODULE_NOT_FOUND`。`vercel.json` 的 `functions[].includeFiles` 是唯一的逃生口。

### 2.3 CSS 自訂屬性按「最近的祖先」解析，不是按 specificity

`:root{--x}` 寫在 media query 裡，**無法**覆蓋 `main[data-level]{--x}`。第一輪的高對比模式就踩過這個：`@media(prefers-contrast:more){:root{--card-edge:2px}}` 對 `main[data-level="0"]` 完全沒有作用，必須在 media query 裡再寫一次 `main[data-level="0"]{--card-edge:2px}`。

---

## 3. 驗證閘門（每個階段交付前都要全跑）

```bash
npm run typecheck                    # tsc -b
TZ=Asia/Taipei npm test              # 84 個單元測試
npm run build                        # tsc -b && vite build
npm run check:bundle                 # lambda 版面重現，api/ 載得起來
npm run e2e                          # 36 條 E2E
```

**環境限制（必須誠實回報，不要當成通過）**：這個容器裝不了 WebKit（出口網路政策擋住 Playwright 下載網域），只有 Chromium 1194。`playwright.config.ts` 用 `devices['iPhone 13']` → WebKit。在容器裡跑要指定
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`，**那是回歸檢查，不是 WebKit 契約**。不要據此宣稱 STOP C / STOP D 通過。

`shots/*.png` 那七張截圖**已經全部過期**（拍攝時間早於階段 2、3a、3b，整個色盤都換過了）。要重拍才能評 STOP D，需要一台裝得起 WebKit 的機器跑 `npx playwright install webkit && npm run e2e:shots`。

---

## 階段 A：UI 色盤重做

> **狀態：✅ 已完成（2026-09-18 套用）。** Cross 於 2026-09-17 拍板「選項 A」——守 NES 硬體色盤約束、改變用量；
> 2026-09-18 看過預覽後確認 A（深色拉開、淺色靠幾何），已全面套用。驗收見 `tests/e2e/palette.spec.ts`。
> Cross 原話：「整個 UI 顏色還是太醜」。
> 執行規格見 A-2，**動手前先讀 A-2.4 那條材料級後果**。

### A-1. 為什麼醜 —— 診斷，不是感覺

「太醜」不可執行，先把它拆成四條可驗證的成因。四條都有證據。

**① NES 54 色表幾乎沒有低彩度色。**
這張表是設計給 CRT 上的小面積 sprite，不是給整片鋪滿的 UI 表面。決斷連的梗圖卡佔螢幕約 60%，整片都是 `#006800` 這種全彩度綠。大面積 × 高彩度 = 視覺疲勞。這是硬約束帶來的必然結果，不是配色沒選好。

**② 深色模式沒有「中性休息區」。**
目前深色模式：`--khaki` = `#000000` 純黑、`--card` = `#503000` 棕、`--officer-green` = 飽和綠、`--action` = `#F8B800` 金、`--signal` = `#F83800` 紅。**四個高彩度色相互相打，沒有任何一塊中性灰讓眼睛休息。** NES 表裡有 `#787878` / `#BCBCBC` 這些灰階格可用，目前只拿去當 `--line`。

**③ 階層只做在色相上，沒做在彩度上。**
所有元件都坐在最大彩度。正常的視覺階層應該是「重要的高彩度、次要的低彩度」，目前是「全部都很大聲」。

**④ 頭像 SVG fallback 完全還是舊色稿，而且會閃。**
`src/avatar.tsx` 有 19 個硬編色，**沒有任何一個在 NES 54 色表裡**（完整清單見附錄 A-4）。更嚴重的是它的載入邏輯：

```ts
const [hasAsset, setHasAsset] = useState(false)   // ← 起始為 false
useEffect(() => {
  setHasAsset(false)                              // ← 每次 url 變更都重設
  const img = new Image(); img.onload = () => setHasAsset(true); img.src = url
}, [url])
return hasAsset ? <img src={url}/> : <div dangerouslySetInnerHTML={avatarSvg(...)}/>
```

`hasAsset` 起始 false、且 **mood 每次變更都會重設成 false**，所以每次班長換表情（bark / praise / punish）都會先閃一次舊色稿的向量頭像，再換成 8-bit webp。這是使用者真的看得到的缺陷，八成是「醜」的感受來源之一。

> **這條可以獨立於色盤決策先修**，而且應該先修 —— 它是 bug，不是品味問題。修法建議：預載三張 mood 資產，或把 fallback SVG 的色改成吃 `hwPalettes('nes')`，或在資產確定存在時直接跳過 fallback。

### A-2. 執行規格（Cross 已選定「選項 A：守 NES，改變用量」）

被否決的另外兩案存查：**B** 分層放寬（角色守 NES、UI 表面自由）、**C** 只留幾何（放棄 8-bit 配色）。不要重新討論。

#### A-2.1 把 54 格按彩度分層（實際算出來的，不是印象）

彩度定義用 `max(R,G,B) − min(R,G,B)`，範圍 0–255。灰階值用 `0.299R + 0.587G + 0.114B`，與專案既有的 `≥20` 門檻同一套算法。

**重跑指令**（唯一真相來源是 `design/hwpalette.mjs`，這份文件不另存一份色表）：

```bash
cd design && node -e '
import("./hwpalette.mjs").then(({nesPalette,hex2rgb})=>{
  const c=h=>{const[r,g,b]=hex2rgb(h);return Math.max(r,g,b)-Math.min(r,g,b)}
  const P=nesPalette()
  console.log("L1", P.filter(h=>c(h)===0).length, "L2", P.filter(h=>c(h)>0&&c(h)<=120).length,
              "L3", P.filter(h=>c(h)>120).length, "總計", P.length)
})'
```

```
中性帶  c = 0      共  6 格   #000000 #787878 #7C7C7C #BCBCBC #F8F8F8 #FCFCFC
中彩帶  c = 1–120  共 15 格   #F8D8F8(32) #B8B8F8/#D8B8F8/#F8B8F8/#F0D0B0/#B8F8B8/#B8F8D8(64)
                             #503000(80) #F8A4C0(84) #FCE0A8(84) #005800(88) #004058(88)
                             #A4E4FC(88) #006800(104) #007800(120)
高彩帶  c > 120    共 34 格   含 #F83800(248) #F8B800(248) #AC7C00(172) #00A800(168) #00B800(184)
```

> ⚠️ 這裡的**色帶**（中性／中彩／高彩，依彩度分）和 A-2.2 的**表面層級**（L1／L2／L3，依面積分）是兩套不同的東西，不要混用。色帶描述「這個顏色是什麼」，表面層級描述「這塊面積能吃多高的彩度」。

> **關於「54 色」**：專案各處（`design/build8bit.mjs:148`、`DEV-PLAN.md`、本文件早先段落）都寫「NES 54 色」，但 `nesPalette()` 實際回傳 **55** 個相異值 —— 原始表是 64 格的 PPU 版面，去掉重複的 `#000000` 之後剩 55，而且這份近似表同時保留了 `#787878` 與 `#7C7C7C` 兩個相近灰。
>
> **54 是硬體文獻的慣用說法，55 是這份近似表的實際格數。驗收白名單一律以 `nesPalette()` 為準，不要用文件裡的數字。**

**這組數字直接證實了 A-1 的診斷**，而且點名了三個最嚴重的違規：

| 目前的用法 | 彩度 | 問題 |
|---|---|---|
| `--line` 深色 = `#AC7C00` | **172** | 高彩度色被用在**畫面上每一個元件的邊框**。這是最嚴重的一個 |
| `--action` 深色 = `#F8B800` | **248** | 全表最高彩度，用在最大的主按鈕填色 |
| `--officer-green` = `#006800`/`#007800` | 104 / 120 | 中彩帶的天花板，鋪滿約 60% 螢幕 |

NES 表只有 **6 格**真正中性，卻有 **34 格**高彩 —— 這就是為什麼「照著表挑」必然挑出刺眼的組合。規則必須管用量。

#### A-2.2 面積 × 彩度 規則

**唯一原則：出現得越大、越頻繁，彩度就要越低。**

| 層級 | 定義 | 彩度上限 | 例子 |
|---|---|---|---|
| **L1 底層面** | 大面積填色（>25% 螢幕） | **c ≤ 88** | `body` 底、梗圖卡底、日記頁底 |
| **L2 元件面** | 元件填色，**以及全域重複的線條** | **c ≤ 120** | 磁貼、按鈕、卡片底、`--line`、`--mute` |
| **L3 點綴** | 單次出現的小面積 | **不限，全 54 格開放** | 標籤、徽章、圖示、強調字、單一卡片的邊框 |

「全域重複的線條算 L2」是刻意的：`--line` 單看是細線，但它出現在每一個元件上，聚合起來的視覺份量等同一個元件面。`#AC7C00`(172) 因此出局。

#### A-2.3 各 token 的處置方向

這是方向，不是最終值 —— 實際值要在瀏覽器裡量渲染後結果並過 WCAG 後才定案。

| token | 現值 | 層級 | 處置 |
|---|---|---|---|
| `--line` 深色 | `#AC7C00` (172) | L2 | **必改**。換中性格（`#787878` 或 `#BCBCBC`） |
| `--action` 深色 | `#F8B800` (248) | L2 | **必改**。金色降級成 L3 點綴（徽章、`.tag:after` 的雙槓），按鈕改中彩 |
| `--officer-green` | 104 / 120 | 見 A-2.4 | 從卡片底移到邊框 |
| `--khaki` 淺色 | `#FCE0A8` (84) | L1 | 合格，留著 |
| `--card` 深色 | `#503000` (80) | L1 | 合格，但要確認它與 `--khaki` 深色 `#000000` 的層次夠 |
| `--signal` | `#F83800` (248) | L3 | 合格 —— 它本來就只用在「沒做」標籤與 `.notice` 左邊 4px 線 |
| `--gold` | `#F8B800` (248) | L3 | 合格，維持點綴用途 |

#### A-2.4 ⚠️ 材料級後果：梗圖卡不再是綠底

這是選項 A 的**直接推論**，不是另一個可選項 —— L1 上限 c ≤ 88 把 `#006800`(104) 與 `#007800`(120) 都擋在外面。

**規格：梗圖卡底改中性（深色 `#000000` / 淺色 `#FCFCFC`），三段火力的綠移到卡片邊框。**

這在 8-bit 語彙裡是正統的 —— 紅白機的選單框就是黑底、白字、一圈彩色邊。而且梗圖卡是要被分享出去的產物，黑底白字比綠底更搶眼。

**而且它順手修好階段 3b 留下的問題。** 3b 當時抱怨三段綠的灰階差只有 9.4 / 9.4，因為卡片底要承載白字，受 4.5:1 文字對比綁死。改當邊框之後：

- 單一卡片的邊框屬於 **L3**，全 54 格開放
- 邊框是非文字元素，WCAG 要求降成 **3:1**（1.4.11），不是 4.5:1

所以綠梯度可以真的拉開。候選（灰階值標在後面）：

| 火力 | 候選格 | 灰階 |
|---|---|---|
| lv0 阿良（菜） | `#58D854` | 163 |
| lv1 黑面（標準） | `#00B800` | 108 |
| lv2 老郭（狠） | `#006800` | 61 |

灰階差 **55 / 47**，對照階段 3b 的 **9.4 / 9.4**。三段火力終於能靠顏色本身分辨，不用只靠幾何撐。

> **⚠️ 實測修正（2026-09-18）：上面這組數字只在深色模式成立。**
> 深色卡底是純黑，邊框只要對黑過 3:1，綠可以往亮的挑。**淺色模式的邊框同時貼著白卡底與卡其頁底，兩邊都要過 3:1**，
> 能同時通過的只剩 `#007800` / `#006800` / `#005800`，灰階 70 / 61 / 52，差 **9.4 / 9.4** —— 跟階段 3b 一模一樣。
> 所以淺色模式的三段火力仍然主要靠幾何（邊框 1/2/3px、硬陰影、字重）分辨，顏色是第四個維度而不是主維度。
>
> 定案值（淺／深各一套，寫在 `src/styles.css` 的 `--meme-edge`）：
>
> | 火力 | 淺色 | 深色 |
> |---|---|---|
> | lv0 阿良 | `#007800` | `#58D854` |
> | lv1 黑面 | `#006800` | `#00B800` |
> | lv2 老郭 | `#005800` | `#007800` |
>
> 文件原先寫的 lv2 深色候選 `#006800` 對黑底只有 2.98:1，差 0.02 不過，換成 `#007800`。
> 另外：紅卡（verdict=stop）的底原本是 `--signal` `#F83800`（c=248）鋪滿整張卡，同樣違反 L1 上限，
> 一併改成中性底 + 紅邊框，否則「梗圖卡底一律中性」這條規則會自相矛盾。

> 替代做法（若 Cross 看了預覽仍想要綠底）：梗圖卡底統一用 `#005800`(c=88，剛好合格)，三段火力全部靠邊框與幾何。這條會讓三個班長的卡片底色一模一樣，**不建議**，但技術上在規格內。
>
> **動手順序**：先把這個變更做成可看的預覽（單一 HTML 或 preview 部署），拿給 Cross 看過再全面套用。這是整輪視覺衝擊最大的一步，不要直接推。

### A-3. 不管選哪個，都要一起處理的連帶項

| 項目 | 現值 | 說明 |
|---|---|---|
| `index.html:7` `theme-color` | `#006800` | 第二輪已補成 NES 值，色盤再改要再改一次 |
| `public/manifest.webmanifest:9` `background_color` | `#FCE0A8` | 同上。PWA 啟動畫面底色 |
| `public/manifest.webmanifest:10` `theme_color` | `#006800` | 同上 |
| `public/icons/*.png`（3 張） | 舊色稿 | 圖示還是第一輪的配色，沒有跟著換 |
| `src/avatar.tsx` 19 色 | 全部非 NES | 見 A-1 ④ |
| `tests/e2e/system.spec.ts` | 兩條硬編色斷言 | ✅ **不用改**。那兩條驗的是頁面底色（淺 `#FCE0A8`／深 `#000000`），階段 A 沒有動到頁底 |
| `tests/unit/avatar.test.tsx` | 三條硬編色斷言 | ✅ 已改（值星帶／白髮線／冒汗）。理由是「正確答案變了」，新值的合法性由 `palette-guard.test.ts` 獨立把關 |
| 階段 3b 的 28 項 WCAG 檢查 | 已通過 | ✅ 已改成會自己跑的 `tests/e2e/palette.spec.ts`（8 畫面 × 淺深，共 22 條），不再依賴人工重跑 |

### A-4. 建議加一條守門測試

階段 3b 會漏掉 `index.html` 與 manifest 那三個色，根本原因是**沒有任何測試覆蓋它們**（實測：`grep -rn "theme-color\|theme_color\|manifest\|background_color" tests/` 零筆）。

建議加一條單元測試：掃 `index.html`、`public/manifest.webmanifest`、`src/avatar.tsx` 的所有 hex，比對當前色盤白名單。`design/hwpalette.mjs` 的 `hwPalettes()` 已經回傳完整的每層色表，可以直接當白名單用（`design/normalize.mjs` 就是這樣檢查的）。

沒有這條，色盤第三次改的時候會第三次漏掉。

### A-5. 驗收標準

1. ✅ 全站（8 個畫面 × 淺／深兩種模式）沒有任何色值落在選定色盤之外 —— `tests/e2e/palette.spec.ts` 量 `getComputedStyle` 的渲染後實際值
2. ✅ WCAG AA 對比全過（正文 4.5:1、大字 3:1），淺深兩套各自驗；邊框另驗非文字 3:1（對卡底與頁底各一次）
3. ✅ 三段火力仍然分得出來（幾何梯度不動：邊框 1/2/3px、硬陰影 2/3/4px、字重 750/850/950，色是第四個維度）
4. ✅ 高對比模式不會讓任何一層的邊框變細（既有規則未動；`--rule` 與頭像圈邊框改成跟著 `--ink` 走，不再寫死白色）
5. ✅ `npm run e2e` 全綠（58 條：原 36 + 色盤驗收 22）

---

## 階段 B：店名 → Google Maps 連結

> **前置：Places API (New) 要先啟用，否則永遠走降級路徑，做完也看不到效果。**

### B-1. 現況

`api/order.ts:82` 的 `withPlace()` 已經在做正確的事：

```ts
function withPlace(order: Order, places: PlaceCandidate[]): Order {
  if (!order.place) return order
  const match = places.find((p) => p.id === order.place!.id || p.name === order.place!.name)
  if (!match) return order
  return { ...order, place: { id: match.id, name: match.name, walkMin: match.walkMin, openUntil: match.openUntil } }
}
```

它拿模型挑的店去比對**伺服器端的真實候選清單**，比中了就用真實資料覆寫。這正是加 Maps 連結的正確位置 —— 用的是 Places API 回來的真 id，不是模型講的。

`match.id` 就是 Places API (New) 的 place ID（`src/places.ts:5` 的 `FIELD_MASK` 有要 `places.id`，`toCandidates()` 原樣帶過來），而 place ID 正是 Google 官方 URL scheme 的 `query_place_id` 參數要的東西。

### B-2. 鐵則

**模型永遠不准產生 URL。** 讓 Claude 輸出連結必然會幻覺 place_id，而且幻覺的連結會把使用者導到錯的店 —— 這比沒有連結糟糕得多。URL 只能在 `withPlace()` 裡用 `match` 組出來。

`DECIDE-DEV-DOC-v1.md` 第 7 節絕對規則第 7 條已經規定「輸出只有 Order JSON」，不要為了塞 URL 去動那條。

### B-3. 做法

1. **`src/types.ts:41`** —— `Order.place` 加一個可選欄位：
   ```ts
   place?: { id: string; name: string; walkMin?: number; openUntil?: string; mapUrl?: string }
   ```

2. **`api/order.ts:82` `withPlace()`** —— 組 URL。用 Google 官方的 Maps URLs scheme（穩定、有文件、不是逆向出來的）：
   ```
   https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(name)>&query_place_id=<id>
   ```
   `query` 是給 `query_place_id` 失效時的後備，兩個都要帶。

3. **UI 落點** —— 這裡要小心語氣護欄。絕對規則第 2 條：「命令本體零毒性：steps 與 place 只放可執行資訊」，而「一個口令一個動作」是產品的核心。

   **建議**：連結掛在店名本身（`place.name` 變成 `<a>`），**不要**新增一顆獨立按鈕。新增按鈕等於給了第二個動作，跟「一個口令一個動作」直接衝突，也會跟「不給第二選項」（絕對規則第 4 條）打架。

   如果 Cross 要更明顯的入口，次佳解是在現有的 `.row` 按鈕列裡當 `.btn.line` 次要按鈕（跟「店關了」同一層級），不要做成主按鈕。

4. **`target="_blank" rel="noopener noreferrer"`** —— 開新分頁，不要把使用者踢出 PWA。

### B-4. 測試

`withPlace()` 是純函式，可以完全確定性地測：

- 給定 `places=[{id:'ChIJxxx',name:'阿財魯肉飯'}]` 且 `order.place.id='ChIJxxx'` → `mapUrl` 必須是預期字串
- 店名含空白／中文／`&` → `encodeURIComponent` 正確
- `order.place` 比對不到 `match` → 原樣回傳，**不得產生 mapUrl**
- `order.place` 為 undefined → 不炸

### B-5. 驗收標準

1. 真實定位 + Places API 已啟用 → 按「吃」→ 出現真的店名，點下去開 Google Maps 且開到**正確那家店**
2. Places 降級（沒定位 / API 403）→ 沒有店名也沒有連結，不會出現空連結或 `undefined`
3. 模型輸出裡若混進 URL 字串 → 被 `enforceRules()` 擋掉（跟階段 D 一起做）
4. 單元測試涵蓋 B-4 四種情形

---

## 階段 C：階級與軍徽

> **狀態：需要先做功課，再決定範圍。不要猜。**
> Cross 原話：「必須要調整班長跟值星官等等實際上的階級徽章 士官, 軍官, 不同等級的軍官都有不同軍徽」

### C-1. 現況盤點

| 位置 | 現況 |
|---|---|
| `src/types.ts:3` | `type Level = 0 \| 1 \| 2 // 菜鳥班長 / 值星班長 / 士官長` |
| `src/officers.ts:26/59/93` | `rank` 是自由字串：`'菜鳥班長'` / `'值星班長'` / `'士官長'` |
| `src/app.tsx:216` | `<span className="rank">{o.rank}</span>` —— 純文字 |
| `src/styles.css` `.plate .rank:before` | 金色雙橫線 `border-top:2px solid var(--gold);border-bottom:2px solid var(--gold)` —— **三層完全共用同一個圖案** |
| `[data-level="0"] .rank` | 只差一個 999px 膠囊底 |
| `[data-level="2"] .rank` | 只差一個 1px 邊框 + 反白 |
| `src/avatar.tsx:26` | level 1 有一條紅色值星帶（`#C0392B` / `#F1D36A`，非 NES 色） |
| `src/avatar.tsx:35` | 註解寫「帽：船形軍帽＋帽徽」 |

**核心問題**：那條金色雙橫線是一個**裝飾**，不是階級章。三個角色戴同一個，而且它不對應任何真實階級。

### C-2. 觀念錯誤要先修

「班長」和「值星官」是**職務**，不是**階級**。

- 班長 = 帶一個班的職務
- 值星官 / 值星班長 = 輪值當週負責出操帶隊的職務
- 士官長 = 這個是真的階級

目前三個角色的 `rank` 欄位混著職務與階級在用。要做徽章，資料結構就得把兩者分開，否則畫不出對的東西：

```ts
export interface Officer {
  level: Level
  duty: string      // 職務：班長 / 值星班長 …
  rank: string      // 階級：下士 / 中士 / 一等士官長 …
  insignia: ...     // 徽章資料，形狀待 C-3 研究後決定
  name: string
  // …其餘不變
}
```

**注意**：`rank` 這個欄位名現在被當職務用，改結構會動到 `src/prompt.ts:41`（`${officer.rank} ${officer.name}` 進 prompt）、`src/prompt.ts:89` `levelName()`、`src/app.tsx:216`、以及 `design/build.mjs:22/29` 的設計稿資料。逐一搬，不要整包改。

### C-3. 要查的事（一手來源，不要憑印象）

中華民國國軍階級體系分成士官與軍官，軍官再分尉官 / 校官 / 將官，各級的徽章圖案不同。**本文件刻意不寫出具體圖案** —— 憑印象寫下來的軍事細節，錯了會很難看，而且這是給台灣人用的 App，錯誤會被一眼認出來。

> **狀態：✅ 已實作（2026-09-18），查證仍為待核。** Cross 2026-09-18 指示「不要再新增 input，自己做完，我看結果再改」，
> 據此以二手來源一致的數量規則實作，階級採 C-4.1 建議案（阿良下士、黑面中士、老郭三等士官長，職務改「連士官長」）。
> 二手來源沒有可引述文字的三件事（V 形方向、粗細槓上下順序、顏色）集中在 `src/insignia.tsx` 的假設區常數，看到附圖三後只改常數。
>
> **原始阻礙紀錄：** 一手來源抓不到（2026-09-17、09-18 各試一次）。 容器的出口政策對 `law.moj.gov.tw`、
> `www.president.gov.tw`、`zh.wikipedia.org` 一律回 `CONNECT tunnel failed, 403`
> （proxy status 記為 `connect_rejected`／policy denial），`www.rootlaw.com.tw` 回 `Host not in allowlist`。
> 這是組織 egress 政策，不是暫時性故障，重試或換路徑都沒有意義。
> **依規則 10（不猜軍事常識），徽章在有人打開附圖三之前不動手。** 現有整理見 `docs/C3-insignia-research.md`（標示為待核）。

接手的對話要先查清楚並附上來源：

1. 士官各階（下士 / 中士 / 上士 / 三等～一等士官長）的徽章圖案與數量規則
2. 尉官（少尉 / 中尉 / 上尉）的圖案與數量規則
3. 校官（少校 / 中校 / 上校）的圖案與數量規則
4. 將官（少將 / 中將 / 上將）的圖案與數量規則
5. 陸軍與其他軍種是否不同（決斷連的設定是陸軍軍教片，應以陸軍為準）
6. 這些徽章在 16×16 或 24×24 的像素網格上畫不畫得出可辨識的差異 —— **這是可行性上限**，查完要先做這個判斷

### C-4. 範圍（Cross 已於 2026-09-17 選定 **C-1：只修徽章**）

**範圍就是 `Level 0/1/2` 三個士官角色，各自畫上對的士官階級章。不加角色、不擴充 `Level` 型別。**

被否決的另外兩案存查，不要重新討論也不要順手做：

- **C-2 加連長**（`src/rules.ts:31-32` 與絕對規則第 5 條的「去找連長。」是現成的鉤子，連長是軍官）—— 要新增語料庫 ≥20 句、5 張 sprite、擴充 `Level` 型別。**留給獨立一輪。**
- **C-3 完整階級體系**（士官 + 尉 + 校 + 將）—— 將官在「班長給你一道命令」這個敘事裡沒有位置。

> ⚠️ `Level = 0 | 1 | 2` 被大量使用（`officers.ts`、`avatar.tsx`、`prompt.ts`、`types.ts`、`app.tsx`、`design/*.mjs`）。**C-1 不准動這個型別** —— 一旦動了就是在做 C-2。

#### C-4.1 C-1 範圍內還有一個小決策要提給 Cross

三個角色目前只有**職務**（菜鳥班長 / 值星班長 / 士官長），沒有**階級**。要畫階級章就得先指定階級。

「士官長」本身是階級，另外兩個不是。所以要決定的是阿良與黑面各掛什麼階級 —— 這個提案要在 C-3 的查證做完之後，連同徽章圖案一起提給 Cross 點頭，不要自己決定。

判準：階級要能對得上人設（阿良剛下部隊、黑面是標準值星班長），而且三個階級的徽章在 16×16 像素網格上要分得出來。

### C-5. 驗收標準（對應 C-1）

1. ✅ 三層的階級章圖案互不相同（1粗1細／1粗2細／2粗1細）；⚠️ 對應的階級規則來自二手來源，一手附圖仍待核
2. ✅ `Officer` 拆成 `duty`（職務）與 `rank`（階級）；prompt 帶「中士 值星班長 黑面」
3. ✅ iPhone 13 實際尺寸淺深各拍過三層名牌，肉眼分得出來
4. ✅ 徽章色在 NES 色盤內且對名牌底過 3:1，由 `tests/e2e/palette.spec.ts` 每層驗（含 lv2 反白名牌的銅金色反轉）
5. ✅ `npm run e2e` 58 條全綠、124 個單元測試全綠

---

## 階段 D：繁體中文台灣情境

> Cross 原話：「必須要確保產出的 text 必須要符合台灣情境的繁體中文」

### D-1. 問題定義

模型輸出中文時會混進兩類問題，而且**兩類的修法不同**：

| 類別 | 例子 | 修法 |
|---|---|---|
| **① 簡→繁轉換殘留的中國用語** | 質量（→品質）、視頻（→影片）、信息（→資訊 / 訊息）、屏幕（→螢幕）、默認（→預設）、用戶（→使用者）、激活（→啟用）、軟件（→軟體）、網絡（→網路）、出租車（→計程車）、自行車（→腳踏車 / 單車）、盒飯（→便當）、早點（→早餐）、地鐵（→捷運） | 黑名單，可機器偵測 |
| **② 語境不對的軍事用語** | 指導員、政委（那是解放軍編制，國軍沒有）；連、排、班、值星、莒光日、寢室、出操、放假單 才是國軍語彙 | 黑名單 + prompt 正面指示 |

### D-2. 鐵則：prompt 是盡力，`enforceRules()` 才是保證

只把「請用台灣繁體中文」寫進 prompt，是**盡力而為**，不是保證。溫度、上下文、模型版本任何一個變動都可能讓它失守，而且失守時沒有任何訊號。

`api/order.ts:59` 的管線已經是：

```ts
const order = enforceRules(parseOrder(text), req.module, req.choices ?? {}, now, req.recentOrders)
```

`enforceRules()`（`src/rules.ts`）**已經在攔截路徑上**，而且已經在做硬規則判定（sleep 的熄燈時間、attend / buy 的 verdict）。用語檢查加在這裡是自然的，不需要新架構。

### D-3. 做法

**① prompt 層（`src/prompt.ts:15` `ORDER_SYSTEM_PROMPT`）**

在【絕對規則】加一條（會變成第 8 條，要同步更新 `DECIDE-DEV-DOC-v1.md` 第 7 節，那份是這段 prompt 的真相來源）：

> 8. 一律用**台灣**的繁體中文與台灣生活用語。禁止中國用語（質量／視頻／信息／屏幕／默認／用戶／激活／軟件／網絡／出租車／自行車／盒飯／早點／地鐵）。軍事用語只用國軍的（連、排、班、值星、出操、寢室），不得使用解放軍編制用語（指導員、政委）。

**② 強制層（`src/rules.ts` `enforceRules()`）**

加一個黑名單掃描，涵蓋 `meme.top` / `meme.big` / `meme.bot` / `steps[]` / `log`。

命中時的處理方式**要先決定**（兩個都可行，選一個）：

- **就地替換**：黑名單做成 `Map<中國用語, 台灣用語>`，直接改掉。優點是使用者永遠看不到壞輸出；缺點是替換可能造成語句不通（例：「質量」在「質量守恆」裡是對的）。
- **擋下並回退**：視為 `ParseError`，走既有的 502 降級路徑「班長在開會。30 秒後再報告。」。優點是不會產生半通不通的句子；缺點是使用者會看到失敗。

**建議：就地替換 + 記一筆 `console.warn`。** 決斷連是「按一顆鍵拿一道命令」的產品，讓使用者看到失敗的代價高於偶爾一句不順。`console.warn` 讓 Vercel runtime log 可以看出黑名單命中頻率，累積夠了再決定要不要調 prompt。

**③ 黑名單放哪裡**

放 `src/locale.ts`（新檔），純資料 + 純函式，`src/rules.ts` 引用。不要塞進 `rules.ts`，那支已經在管商業規則了。

`api/weekly.ts` 的輸出走的是 `WEEKLY_SYSTEM_PROMPT`（`src/prompt.ts:82`，繼承 `ORDER_SYSTEM_PROMPT`），prompt 層自動涵蓋；但週報的 `body` 不經過 `enforceRules()`，**強制層要另外接上去**，不要漏掉。

### D-4. 測試（這一階段可以完全確定性地測）

不需要真的呼叫模型 —— 黑名單掃描是純函式：

- 給定含「質量」的 `Order` → 輸出必須是「品質」
- 給定含「指導員」的 `steps` → 被處理
- 給定乾淨的台灣用語 `Order` → **原樣通過，一個字都不能動**（避免過度替換）
- 邊界：「質量守恆」這類誤判要有明確立場（建議：只做詞彙層替換，接受少數誤判，並在測試裡把已知誤判列出來當文件）
- 週報路徑同樣涵蓋

### D-5. 驗收標準

1. 黑名單至少涵蓋 D-1 表列的全部詞彙
2. `enforceRules()` 與週報路徑都接上，`npm test` 有對應測試
3. 乾淨輸入原樣通過（零誤動）
4. `DECIDE-DEV-DOC-v1.md` 第 7 節同步更新 —— 那份是 prompt 的真相來源，不同步下一輪會被改回去
5. 真實 POST 一次，檢查輸出

---

## 附錄 A：這一輪查到的事實（含證據）

### A-1. 三個過期硬編色（本輪已修）

| 檔案 | 舊值 | 新值 |
|---|---|---|
| `index.html:7` `theme-color` | `#4A5733` | `#006800` |
| `public/manifest.webmanifest:9` `background_color` | `#E3DFD0` | `#FCE0A8` |
| `public/manifest.webmanifest:10` `theme_color` | `#4A5733` | `#006800` |

`#4A5733` 是第一輪的黑面橄欖綠，**不在 NES 54 色表裡**（階段 3b 實測它會吸附到 `#503000` 棕色）。`#E3DFD0` 是舊卡其，現值是 `#FCE0A8`。

影響過：瀏覽器網址列／PWA 狀態列是舊色；裝成 App 後啟動畫面先閃舊卡其再進新卡其。

`design/`、`decide-design/`、`dist/`、`decide-mock-v5.html` 裡還有同樣的舊色 —— **那些是凍結目錄與建置產物，刻意不動**。

### A-2. `x-places-calls` header

`api/order.ts:61` 與 `:67` 都會回 `x-places-calls`：`1` = Places 真的被呼叫過，`0` = 整段被跳過。除錯 Places 時這是第一個要看的東西 —— 它直接區分「有呼叫但失敗降級」與「根本沒呼叫」。

### A-3. Places 降級有兩條不同的路徑，長得一模一樣

```ts
if (card.needsPlaces && req.loc) { … }   // api/order.ts:44
```

- **沒有定位** → 整段跳過，`placesCalled = 0`，Google key 完全沒被讀到
- **有定位但 Places 失敗**（403 / 逾時 / 5xx）→ `api/order.ts:51` 的 `catch` 吃掉，`places = []`

兩條路徑最後都讓 `places` 為空，Claude 依 `src/prompt.ts:26` 規則 6 在 `meme.bot` 寫「店家資料暫時拿不到」。**畫面完全一樣，從外面分不出來。** 2026-09-17 的驗證就踩到這個：以為驗過了 Places，其實是第一條路徑。

用 `x-places-calls` 或畫面上有沒有「不報座標？行，班長用常識。」（`src/api.ts:24` `GEO_DENIED_LINE`，定位被拒才出現）來區分。

### A-4. `src/avatar.tsx` 的 19 個硬編色，零個在 NES 表內

```
#1F1F1C  #33402A  #5B6A3F  #5DADE2  #7A6314  #8C8C8C  #9A9A9A
#A9734C  #BF8C62  #C0392B  #C98F62  #D4AF37  #D9A87C  #D9AE8B
#E7E2D0  #EFC9A6  #F1D36A  #F1EBD8  #F6F3E8
```

這是 8-bit 改版前的向量頭像色稿。搭配 A-1 ④ 描述的載入邏輯，**每次 mood 變更都會閃一次**。

### A-5. 測試覆蓋缺口

```bash
grep -rn "theme-color\|theme_color\|manifest\|background_color" tests/   # 零筆
```

`index.html`、`public/manifest.webmanifest`、`src/avatar.tsx` 的色值**完全沒有任何測試覆蓋**。這是階段 3b 漏掉它們的直接原因。見 A-4 節的守門測試建議。

### A-6. Vercel 專案座標

| | |
|---|---|
| team | `team_6HL0acbpoaKW1HCfcLy7fA0h`（`cc4wang-uis-projects`，hobby 方案） |
| project | `prj_bKA0WAdn6Nm03CaN5bDARIVAkLmi`（`general-decision`） |
| 正式站 | `https://general-decision.vercel.app` |
| GCP 專案 | `919994638922` |

環境變數改完**一定要 redeploy** 才生效。

---

## 附錄 B：建議的執行順序

| 順序 | 階段 | 為什麼排這裡 | 相依 |
|---|---|---|---|
| 1 | **A-1 ④ 頭像閃爍** | 這是 bug 不是品味，可以獨立修，而且它可能就是「醜」的主因之一。先修完再看還醜不醜，避免在錯的問題上花力氣 | 無 |
| 2 | **D 繁中台灣情境** | 純邏輯、完全可確定性測試、不動視覺、不需要外部相依。風險最低，先拿一個穩的交付 | 無 |
| 3 | **B Maps 連結** | 改動小且範圍清楚 | Places API (New) 要先啟用 |
| 4 | **A 色盤** | ✅ 方向已定（選項 A）。會讓階段 3b 的 28 項 WCAG 驗證全部作廢、要重跑。A-2.4 的梗圖卡改底要**先做預覽給 Cross 看過**再全面套用 | 無（已解鎖） |
| 5 | **C 階級徽章** | ✅ 範圍已定（C-1）。仍要先做 C-3 的軍徽查證，且徽章色值取決於階段 A 的結果 | 階段 A 完成 + C-3 查證 |

**不要把 A 和 C 綁在一起做。** 色盤是全域決策，徽章是局部資產，綁在一起會讓任何一邊的問題卡住另一邊。

---

## 附錄 C：Cross 待辦（不在開發範圍內）

| 項目 | 連結 / 說明 |
|---|---|
| **轉掉兩把 API key** | 第一輪曾以明文貼出，設定已確認可用，應立即輪替 |
| **啟用 Places API (New)** | https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=919994638922 |
| ~~階段 A 三選一~~ | ✅ 2026-09-17 已決：**選項 A**（守 NES、改用量），見 A-2 |
| ~~階段 C 範圍決策~~ | ✅ 2026-09-17 已決：**C-1**（只修徽章、不加角色），見 C-4 |
| ~~看梗圖卡新樣子的預覽~~ | ✅ 2026-09-18 已看過並確認 A（深色拉開、淺色靠幾何），色盤已全面套用 |
| ~~指定阿良與黑面的階級~~ | ✅ 2026-09-18 Cross 授權自行定案，採建議案：阿良下士、黑面中士、老郭三等士官長（職務連士官長）。看結果再改 |
| **打開服制條例附圖三核對徽章** | https://www.president.gov.tw/Portals/0/Bulletins/paper/pdf/6769-2.pdf 。要核的三件事都在 `src/insignia.tsx` 假設區：V 形方向、粗細槓上下順序、士官長金色／士官素色 |
| **重拍七張截圖** | 需要裝得起 WebKit 的機器，`npx playwright install webkit && npm run e2e:shots` |
