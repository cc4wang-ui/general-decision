# 決斷連 · 三位班長 8-bit 頭像 — ChatGPT 生成簡報

> 取代 `docs/CHARACTER-BRIEF.md`（那份是舊的軍教片寫實方向，已作廢）。
> 方向：C · 8-bit · 玩具電玩感。48×48、五種表情、三位角色 = **15 張**。

---

## 0. 先讀這段，不然你會白做一輪

**AI 算圖產不出真正的像素圖。** ChatGPT / DALL·E 會給你「看起來像素風」的圖 —— 有抗鋸齒、像素不對齊格線、每一格大小不一、顏色有幾百種。那種檔案**塞不進 app**，因為 app 需要的是乾淨的 48×48 格線。

所以流程一定是三段，不能只做第一段：

```
①  ChatGPT 生成（大圖，1024×1024）
        ↓
②  用 normalize.mjs 拉回 48×48 + 鎖調色盤 + 去背
        ↓
③  目視檢查，人工補幾格（眼睛、帽徽幾乎一定要補）
```

第 ② 段的工具已經寫好了，在 repo 裡：

```bash
node design/8bit/normalize.mjs ~/Downloads/heimian-bark.png 1
```

第二個參數是角色編號（0 = 阿良、1 = 黑面、2 = 老郭）。它會縮到 48×48、把每一格吸附到該角色的調色盤、去背，輸出 PNG。

**還有一條路你可以先考慮：** repo 裡 `design/sprites.mjs` 已經有一套程式產生的 sprite，三人 × 五表情全部齊了，一致性是結構保證的。如果你只是覺得它「不夠好看」而不是「方向錯了」，把它拿去 ChatGPT 說「照這個格線畫得更精緻」，比從零生成更容易收斂。參考圖都在 `design/8bit/ref/`。

### 為什麼是硬體調色盤

自己挑的顏色再怎麼限制色數，玩過那兩台的人一眼就知道不對。

原本那組品牌色（卡其 `#F0E4C6`、草綠 `#587631`）**兩台機器都畫不出來**。
而且不能盲目吸附 —— 草綠每通道取最近階，在 SMS 上會變成 `#555555` 純灰，
在 NES 上變 `#787878`，軍綠的身分整個消失。所以是從硬體調色盤裡**挑一格**，
標準是保住色相身分，不是數值最接近。

**Sega Master System 的版本也做了**，在畫布的「調色盤」畫板上可以對照。
誠實講：到這個色數，兩者差異很小 —— SMS 的優勢（15 色/sprite vs NES 的 3 色）
要做多階陰影才顯得出來。這份簡報走 NES，因為它的 3 色紀律逼你把辨識度做在
形狀上，而形狀正是這個案子最難的一關。

---

## 1. 要上傳給 ChatGPT 的檔案

在 `design/8bit/ref/` 底下，開對話時一起丟進去：

| 檔案 | 用途 |
|---|---|
| `palette.png` | 調色盤圖卡 —— **只能用這些顏色** |
| `alang-sheet.png` | 阿良現有五表情（放大 6 倍） |
| `heimian-sheet.png` | 黑面現有五表情 |
| `laoguo-sheet.png` | 老郭現有五表情 |
| `1-idle.png` 等 15 張 | 48×48 原寸，要精確比對時用 |

---

## 2. 開場總綱（每次對話先貼這段）

```
You are creating 8-bit pixel art character portraits for a Taiwanese mobile app,
in the style of a late-1980s Famicom / NES game.

HARD TECHNICAL CONSTRAINTS
- The final asset is 48×48 pixels. Design ON that grid. Every element must be an
  integer number of pixels. No anti-aliasing, no gradients, no soft edges, no blur.
- Deliver at 1024×1024 (each logical pixel = a crisp 21×21 block of one flat color),
  so the image can be downsampled to 48×48 with nearest-neighbour and lose nothing.
- Transparent background. No frame, no border, no drop shadow, no text, no watermark.
- HARDWARE PALETTE: every color must come from the Nintendo Famicom/NES master
  palette. Use ONLY the hex values listed below. No other colors, no tints, no
  shades, no blends. The NES could only display 54 colors and a sprite could only
  use 3 of them plus transparency — that constraint is what makes it read as a
  real 1980s console game rather than "pixel-art-style" illustration.
- The three characters SHARE ONE SKIN TONE. They are told apart by UNIFORM
  BRIGHTNESS, not by skin. This is palette swap — the standard way 8-bit games
  distinguished characters of the same type.
- Every shape has a 1-pixel dark outline in #16180F.

SUBJECT
Three original drill sergeants from 1990s Taiwanese military-comedy films.
Olive-drab uniform (草綠服), garrison cap (船形帽), white nameplate on the
character's RIGHT chest (viewer's left). They are ORIGINAL characters —
do not reference or resemble any real person, actor, or existing game character.

FRAMING (identical for all three — they swap into the same UI slot)
- Bust: head and shoulders only, front-facing, centered.
- Eye line sits at row 24 of 48. Shoulder line sits at row 38 of 48.
- The head (chin to top of head, excluding cap) spans roughly rows 12–34.
- Cap occupies roughly rows 5–15.

THE CAP IS THE MOST IMPORTANT DETAIL
A 船形帽 (garrison / side cap) seen from the front: a single fold ridge running
front-to-back makes the centre the HIGHEST point, sloping down and outward to
each side, ending in a darker band above the ears.
It is NOT a baseball cap. It is NOT a dome. It is NOT a helmet. It has NO brim,
NO peak at the front, NO button on top.

CAP BADGE
A simple gold ring with a dark centre. Do NOT draw a five-pointed star —
a five-pointed star is a PRC/Soviet insignia and is wrong for this subject.

ABSOLUTELY DO NOT INCLUDE
Weapons of any kind, five-pointed stars, eagles, laurel wreaths, waving flags,
clenched fists, camouflage, dog tags, barbed wire, salutes.
No American high-and-tight haircut, no square jaw wider than the cheekbones,
no neck wider than the head — these read as a US Marine, not a Taiwanese conscript.
```

---

## 3. 三位角色（逐個貼，各生五張）

### 阿良 · 菜鳥班長（lv0）

```
CHARACTER: A-Liang, rookie sergeant, early 20s. He cannot manage to be scary.

- Head shape: a full CIRCLE. The roundest of the three.
- Cap: worn CROOKED — the whole cap is shifted about 3 pixels to his right,
  tilting the fold ridge off-centre. A tuft of dark brown hair (#3A2E1E) sticks
  out at the back-left, below the cap band.
- Eyes: LARGE and ROUND. White eyeball with a round dark pupil and a 1-pixel
  white highlight in the upper-left of each pupil. The biggest eyes of the three.
- Eyebrows: THIN, 1 pixel thick, slightly uneven — one sits a pixel higher.
- A light blue sweat drop (#2F7FB5) beside his right temple, 2 pixels wide,
  4 pixels tall. It is present in every mood except praise.
- Shoulders: NARROW and sloped.
- No sash. No whistle.

PALETTE (Nintendo FC/NES hardware colors) — use only these:
  outline #000000 · skin #FCA044 · skin shadow #AC7C00
  uniform #B8F818 (brightest of the three — he has no authority yet)
  uniform shadow #00A800 · sweat #3CBCFC
  gold #F8B800 · white #FCFCFC
```

### 黑面 · 值星班長（lv1）

```
CHARACTER: Hei-Mian, duty sergeant, around 30. The standard-issue drill sergeant.

- Head shape: a ROUNDED SQUARE. Nearly the same width top to bottom.
- Cap: worn straight and it is the TALLEST and WIDEST of the three, squared off
  at the sides — his head silhouette is the broadest.
- Eyes: NARROW horizontal bars, 5 pixels wide and 2 pixels tall, solid dark.
  (Exception: in punish they open into full round eyes.)
- Eyebrows: THICK, 2 pixels, straight, pressed low.
- A RED duty sash (#D93223) with a thin gold edge runs diagonally from his left
  shoulder down across the chest. It visibly RAISES his right shoulder —
  his shoulder line is deliberately asymmetric.
- Shoulders: the BROADEST of the three.
- No whistle. No sweat.

PALETTE (Nintendo FC/NES hardware colors) — use only these:
  outline #000000 · skin #FCA044 · skin shadow #AC7C00
  uniform #00A800 (mid — the standard) · uniform shadow #005800
  sash #F83800 · gold #F8B800 · white #FCFCFC
```

### 老郭 · 士官長（lv2）

```
CHARACTER: Lao-Guo, sergeant major, late 40s. Sharp-tongued, seen it all.

- Head shape: a LONG downward TRAPEZOID — wider at the temples, narrower at the jaw.
- Cap: worn straight and sits the LOWEST of the three.
- White-grey hair (#E8E4D6) shows below the cap band at both temples, hugging the
  side of the head and running DOWNWARD like sideburns. It must not flare upward
  or outward — upward flares read as horns, which is wrong.
- Eyes: dark SUNGLASSES — two flat rectangles 6 pixels wide, 3 pixels tall, joined
  by a 1-pixel bridge, with a small white glint in each lens. They must read as
  GLASSES, not as a mask: keep them short, do not let them cover the upper face.
- Eyebrows: VERY thick, 3 pixels, angled down, with 1–2 white hairs above them.
- Nasolabial lines: 1 pixel, in skin shadow, running down from beside the nose.
- A gold whistle (#F5B21A) hangs on a red cord around his neck, forming a shallow
  V at the collar.
- Shoulders: medium width.
- No sash. No sweat.

PALETTE (Nintendo FC/NES hardware colors) — use only these:
  outline #000000 · skin #FCA044 · skin shadow #AC7C00
  uniform #005800 (darkest — highest air pressure) · uniform shadow #000000
  white hair #F8F8F8 · gold #F8B800 · white #FCFCFC
```

---

## 4. 五種表情（每位都要，一次生一張）

把下面那句接在角色描述後面。**只改眉毛和嘴巴，其他所有像素保持一致。**

| mood | 接在角色描述後面的句子 |
|---|---|
| `idle` | `MOOD: idle. Eyebrows level. Mouth is a short flat horizontal line. Calm, waiting.` |
| `bark` | `MOOD: bark — shouting an order. Eyebrows angled sharply down toward the nose. Mouth WIDE OPEN, a dark rectangle with a white row of upper teeth.` |
| `praise` | `MOOD: praise — approval, NOT celebration. Eyebrows raised slightly at the outer ends. Mouth curves up only very slightly — barely more than a flat line. He is acknowledging you, not congratulating you. Add two short gold strokes beside each side of the head. Do NOT make him grin or laugh.` |
| `punish` | `MOOD: punish — angry. Eyebrows slammed down hard. Mouth open wide in a shout with the CORNERS TURNED DOWN. Two short dark anger strokes beside each side of the head. The mouth corners must point DOWN — upward corners read as a sneer, which is wrong.` |
| `soft` | `MOOD: soft — letting it go. Eyebrows level. Mouth flat. Eyes looking slightly to one side, away from the viewer.` |

**一致性訣竅：** 先把一個角色的 `idle` 生到滿意，然後**把那張圖上傳回去**，說「same character, same grid, same palette, only change the eyebrows and mouth to: …」。不要分五次獨立生成，那會得到五個不同的人。

---

## 5. 拿到圖之後

```bash
# 阿良的五張
node design/8bit/normalize.mjs ~/Downloads/alang-idle.png 0
node design/8bit/normalize.mjs ~/Downloads/alang-bark.png 0
# 黑面用 1、老郭用 2
```

輸出是 48×48 的 PNG。接著轉成 WebP 放到這些位置（**app 會自動用圖取代內建 SVG，零程式改動**）：

```
public/officers/0/idle.webp    public/officers/1/idle.webp    public/officers/2/idle.webp
public/officers/0/bark.webp    public/officers/1/bark.webp    public/officers/2/bark.webp
public/officers/0/praise.webp  public/officers/1/praise.webp  public/officers/2/praise.webp
public/officers/0/punish.webp  public/officers/1/punish.webp  public/officers/2/punish.webp
public/officers/0/soft.webp    public/officers/1/soft.webp    public/officers/2/soft.webp
```

⚠️ `soft` 是第五個表情，目前程式裡只有四個。要用它得先改 `src/avatar.tsx` 的 `Mood` 型別 —— 那是我的事，圖生好丟給我就行。

✅ **這項已經修好了，換資產時不用再補。** `src/styles.css` 已有
`.meme .face svg,.meme .face img{display:block;width:100%;height:100%;object-fit:contain}`
與 `[data-avatar] img{object-fit:contain;image-rendering:pixelated}`。
（`object-fit` 是下在裡面的 `<img>`／`<svg>` 上，不是 `.face` 容器本身 —— `<Avatar className="face">`
會渲染成 `<div class="face"><img></div>`，效果相同。）
目前 30 張資產都是 `normalize.mjs` 產出的 48×48 正方形，非正方形的情形還沒實際跑過視覺驗證。

---

## 6. 驗收（每張都過才收）

**格線**
- [ ] 縮到 48×48 之後，每一格是一個純色方塊，沒有半透明、沒有漸層
- [ ] 顏色數 ≤ 8，而且全部落在該角色的調色盤上
- [ ] **每一個顏色都是任天堂 FC/NES 主調色盤裡的值**（不是自己調的近似色）
- [ ] 三人膚色完全相同（用制服亮度區分，不是膚色）
- [ ] 完全透明背景，邊緣沒有白邊或灰邊

**造型**
- [ ] **帽子是船形帽**：中央有摺脊、往兩側下斜、沒有帽簷、沒有帽舌
- [ ] **帽徽是金環，不是五角星**
- [ ] 名牌在角色的右胸（＝你看的人的左邊）
- [ ] 配件沒有多也沒有少：阿良汗滴、黑面紅值星帶、老郭墨鏡＋哨子＋鬢角白髮
- [ ] 眼線與肩線三人一致（三張疊起來看）

**剪影**（這關最重要）
- [ ] 三張轉純黑、48px 並排 —— **分不分得出來是誰？**分不出來就退回重生

**分寸**
- [ ] `punish` 的嘴角朝下，不是朝上（朝上＝獰笑＝施虐）
- [ ] `praise` 是「認可」不是「慶祝」，嘴角上揚幅度極小
- [ ] 不像任何真人、不像任何現有遊戲角色
- [ ] 沒有槍、五角星、老鷹、月桂、旗幟、握拳、迷彩、狗牌

**文化**
- [ ] 找 5 個當過兵的人，看 48px、2 秒，問「這是哪一國的兵」—— **至少 3 個答台灣**

---

## 7. 還沒定的一件事

**值星帶的方向我沒有把握** —— 是左肩到右腰還是右肩到左腰。現在的 sprite 跟這份簡報都畫成左肩到右腰，但這是我推測的，不是查證過的。

**發包前請先找一張真的照片定死。** 這種細節只要錯了，當過兵的人第一眼就會看出來，而且會毀掉整組資產的可信度。


## 本輪已確認修訂

- 老郭補入 #F83800 作紅哨繩，第八個不同色（使用者確認）。
- 所有描邊用角色最終色表 #000000；舊描述的棕髮／汗滴／紅帶近似色以最終色表為準。
- 值星帶為角色右肩到左腰，畫面左上到右下；照片與文字來源見角色交付 README。
