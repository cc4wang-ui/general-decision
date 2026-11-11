# 8-bit 方向（C）工作檔

由 `design/sprites.mjs` 與 `design/build8bit.mjs` 產生，**不要手改這裡的 .dc.html**。

```bash
cd design && node build8bit.mjs     # 重新產生 8bit/*.dc.html + canvas.json
```

> **必須在 `design/` 底下跑。** 它用相對路徑寫 `8bit/*.dc.html`，
> 在 repo 根目錄跑 `node design/build8bit.mjs` 會直接 `ENOENT: open '8bit/Main.dc.html'`。

- `sprites.mjs` 是角色系統：三人共用格線（眼線 Y24、肩線 Y38），
  表情只換眉與嘴。改表情 = 改一個函式，不重畫任何像素。
- `design/*.dc.html`（上一層）是舊的軍教片方向，保留供對照。

## 兩支產生器的分工（不互相取代）

| 產生器 | 產出 | 用途 |
|---|---|---|
| `node design/build8bit.mjs` | `design/8bit/*.dc.html` + `design/8bit/canvas.json` | 設計工作檔與畫布。**也是唯一有 Sega Master System 對照的地方**（`Palette.dc.html` 同時畫 NES 與 SMS 兩組硬體調色盤）。 |
| `python3 design/8bit/export.py` | `public/officers/` 的 30 個檔（15 PNG + 15 無損 WebP） | 正式產品載入的角色資產。App 只吃這裡的檔案。 |

兩者都從 `design/sprites.mjs` + `design/hwpalette.mjs` 取形狀與顏色，所以改了那兩支之後**兩支產生器都要重跑**：

```bash
node design/build8bit.mjs          # 重出 .dc.html + canvas.json
python3 design/8bit/export.py      # 重出 public/officers/ 的 30 個檔
find public/officers -type f | wc -l   # 應為 30
```

只跑其中一支會讓工作檔與正式資產對不上——那正是「畫面看起來對、App 裡是舊的」這類 bug 的來源。

## ⚠️ 現存的走散（2026-09-16 實測，尚未處理）

**目前 commit 進來的 `*.dc.html` 不是現行 `sprites.mjs` 的輸出。** 它們來自舊版：

| | 舊版（現在 commit 在 repo 裡的 .dc.html） | 現行 `sprites.mjs` ／ `public/officers/` |
|---|---|---|
| 描邊色 | `#16180F`（`Sprites.dc.html` 有 1957 處） | `#000000` |
| 帽頂幾何 | `x=20 width=8` | `x=22 width=4` |

`public/officers/` 的 30 個正式資產是**現行**版本，App 顯示的是對的。走散的只有這些設計工作檔。

重跑 `cd design && node build8bit.mjs` 會把五個 `.dc.html` 整批改成現行造型——**那是視覺變更，
要先讓 Cross 看過再決定**，所以階段 1 刻意沒有重生成。在那之前，不要把這些 `.dc.html` 當成最新定稿。
