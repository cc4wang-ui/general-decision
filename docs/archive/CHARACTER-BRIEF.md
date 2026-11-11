# 決斷連 · 三位班長角色圖 — 生成簡報（帶去 ChatGPT）

> 用法：先貼「§0 風格總綱」建立脈絡，再逐張貼 §3 的 prompt。每張生成後用 §4 檢查表驗收，不合格就退回重生，不要將就。
> 目標不是「可愛的軍人貼圖」，是 **App Store 精選會放在首屏的角色**：一眼認得、放大到 1024 不崩、縮到 96px 仍有表情。

---

## 0. 風格總綱（每次對話先貼這段）

```
You are illustrating three original characters for a Taiwanese mobile app. They are drill sergeants
in the style of 1990s Taiwanese military-comedy films (草綠服 olive-drab uniform, 船形帽 garrison cap).
They must be ORIGINAL — do not reference or resemble any real actor or real person.

ART DIRECTION
- Flat vector illustration with thick, confident outlines (line weight ~3% of canvas width), no gradients,
  no drop shadows, no texture, no 3D shading. Two-tone cel shading at most: one base tone + one darker shadow tone.
- Think: Duolingo / Headspace / Carrot Weather mascot quality. Editorial, not cute-sticker. Adult characters.
- Character is a BUST (chest up), centered slightly low, face fills 55–65% of the canvas height.
- Strong readable silhouette: cap, ears, jaw and shoulders should read at 96px.
- Exaggerated but not caricature: eyebrows and mouth carry the emotion. Eyes are simple shapes.
- Eye line and shoulder line must be at the SAME height across all three characters (they swap in the same slot).

PALETTE (use these exact values, nothing else)
- Skin base per character (given below); shadow tone = same hue, ~15% darker.
- Uniform olive #4A5733, uniform shadow #39452A, cap badge & trim gold #D4AF37, badge core #7A6314
- Outline ink #1F1F1C · Signal red #B3261E (only for 黑面's sash and 老郭's whistle cord)
- Highlight white #F1EBD8 (nameplate, teeth)

OUTPUT
- Square 1:1, 1024×1024 minimum, TRANSPARENT background (no backdrop, no circle, no frame, no text, no watermark).
- Deliver as PNG with alpha.
```

---

## 1. 角色設定（三位，人設鎖定，不可增減配件）

| | 阿良 · 菜鳥班長 (level 0) | 黑面 · 值星班長 (level 1) | 老郭 · 士官長 (level 2) |
|---|---|---|---|
| 性格 | 剛下部隊，兇不起來，會結巴、冒汗 | 標準值星班長，短句命令，一個口令一個動作 | 毒舌、比喻狠、不留情 |
| 年齡感 | 22–24，圓臉 | 28–32，方臉 | 45–50，長臉 |
| 帽子 | 船形帽 **歪戴**（右傾約 7°） | 船形帽正戴，帽徽正中 | 船形帽正戴，帽下露出**白髮線** |
| 眼 | **圓眼**，大而亮，有高光 | 一字平眼，細長 | **墨鏡**（深色鏡片，方框） |
| 眉 | 細、彎、不對稱（一邊抬高） | **粗眉**，直、壓低 | 極粗、斜壓、有白毛 |
| 嘴 | 微張、不確定 | **平嘴**，一條線 | 下垂，兩側**法令紋** |
| 專屬配件 | **右額一滴汗**（淺藍 #5DADE2） | **紅色值星帶**從左肩斜到右腰，金線鑲邊 | **哨子**掛頸，金色，紅繩 |
| 膚色 | #EFC9A6 | #D9A87C | #C98F62 |
| 名牌 | 右胸白色名牌 | 右胸白色名牌 | 右胸白色名牌 |

**三人共同**：草綠上衣、立領、右胸名牌、船形帽帽徽（金色五角星在圓框內）。沒有槍、沒有徽章以外的裝飾、沒有背景物件。

---

## 2. 四種表情（每位都要）

| mood | 用在哪 | 眉 | 眼 | 嘴 | 額外 |
|---|---|---|---|---|---|
| **idle** | 首頁待命 | 自然 | 自然 | 閉合／微張 | 阿良保留汗滴 |
| **bark** | 點名、下命令 | 內壓、皺 | 瞇 | **大張口**，看得到牙與舌 | 阿良汗滴變兩滴；老郭墨鏡微下滑 |
| **praise** | 完成登記 | 上揚放鬆 | 瞇成弧 | 大笑弧 | 頭兩側各兩道金色小放射線 |
| **punish** | 罰則倒數 | 極度下壓 | 圓瞪／墨鏡反光 | 咧牙怒吼 | 頭兩側各兩道墨色怒氣線；黑面值星帶飄起 |

阿良即使在 bark／punish 也要「兇不起來」：眉毛壓下去但眼睛還是圓的，這是他的笑點。

---

## 3. 逐張 prompt（12 張，貼一段生一張）

每張都在 §0 之後貼。`{MOOD_LINE}` 換成 §2 那列的描述。

### 阿良 · 阿良 (level 0)
```
Character: 阿良, rookie drill sergeant, 22–24 years old, round face, skin #EFC9A6 (shadow #C9A585).
Garrison cap tilted 7° to his right. Big round eyes with a white highlight. Thin uneven eyebrows, one raised.
One light-blue sweat drop (#5DADE2) on his right temple. Small white nameplate on right chest. No sash, no whistle.
Expression: {MOOD_LINE}
Bust, centered slightly low, face 55–65% of canvas height, transparent background, 1024×1024 PNG.
```

### 黑面 · 值星班長 (level 1)
```
Character: 黑面, duty sergeant, 28–32 years old, square jaw, skin #D9A87C (shadow #B8865C).
Garrison cap worn straight, gold badge centered. Long narrow flat eyes. Thick heavy straight eyebrows pressed low.
Mouth is a single flat line (except when barking). A RED duty sash (#B3261E) with a thin gold edge runs from his left
shoulder to right hip across the chest. White nameplate on right chest. No whistle.
Expression: {MOOD_LINE}
Bust, centered slightly low, face 55–65% of canvas height, transparent background, 1024×1024 PNG.
```

### 老郭 · 士官長 (level 2)
```
Character: 老郭, veteran sergeant major, 45–50 years old, long weathered face, skin #C98F62 (shadow #A9734C).
Garrison cap worn straight; a strip of white/grey hair shows under the cap brim. Dark square sunglasses.
Very thick eyebrows angled down, with a few white hairs. Mouth turned down with deep nasolabial folds.
A gold whistle (#D4AF37) on a red cord around his neck. White nameplate on right chest. No sash.
Expression: {MOOD_LINE}
Bust, centered slightly low, face 55–65% of canvas height, transparent background, 1024×1024 PNG.
```

### MOOD_LINE 四句（直接替換）
```
idle   → neutral, at ease, mouth closed, calm eyebrows.
bark   → shouting an order: eyebrows knitted inward, eyes narrowed, mouth wide open showing teeth and tongue.
praise → proud approval: eyebrows relaxed and raised, eyes squeezed into happy arcs, big grin; two small gold radiating strokes beside each side of the head.
punish → furious: eyebrows slammed down, eyes wide (or sunglasses glinting), teeth bared in a roar; two short dark anger strokes beside each side of the head.
```

**一致性訣竅**：先生 idle，滿意後對 ChatGPT 說「同一角色、同一構圖、同一線寬，只改表情為 bark」，用 idle 那張當參考圖上傳，四張才會是同一個人。

---

## 4. 驗收檢查表（每張都過才收）

- [ ] 一眼看得出是哪位（歪帽汗滴 / 紅值星帶 / 墨鏡哨子），配件**沒有多也沒有少**
- [ ] 眼線高度與肩線高度三人一致（疊起來看）
- [ ] 縮到 96px 表情仍讀得出來（縮小看一次）
- [ ] 完全透明背景，邊緣乾淨無白邊、無陰影
- [ ] 沒有漸層、沒有 3D 光澤、沒有文字、沒有水印
- [ ] 線條粗細全圖一致，沒有細到消失的線
- [ ] 不像任何真人演員；不像任何現有 IP（不能像 Duolingo 的鳥、不能像日本動漫）
- [ ] 顏色只用 §0 調色盤，沒有自己加色

---

## 5. 檔名與尺寸（照第 14 節資產介面，程式零改動）

```
public/officers/0/idle.webp    public/officers/1/idle.webp    public/officers/2/idle.webp
public/officers/0/bark.webp    public/officers/1/bark.webp    public/officers/2/bark.webp
public/officers/0/praise.webp  public/officers/1/praise.webp  public/officers/2/praise.webp
public/officers/0/punish.webp  public/officers/1/punish.webp  public/officers/2/punish.webp
```
- 512×512，透明背景，WebP（無損或 q≥90）。生成用 1024 再縮到 512。
- 0 = 阿良、1 = 黑面、2 = 老郭。
- 放進去 app 會自動用圖取代內建 SVG，不用改任何程式。PNG 轉 WebP 丟給我就好。

---

## 6. 順手一起生：App 圖示（1 張）

```
App icon, 1024×1024, iOS style (flat, no text, no photo). Same flat thick-outline vector style as the characters.
Composition: olive-drab (#4A5733) background with a subtle darker (#39452A) diagonal stripe pattern at ~10% contrast;
a gold (#D4AF37) five-point star inside a gold ring, centered; a red duty sash (#B3261E) with thin gold edge running
diagonally from bottom-left to top-right BEHIND the ring. Bold, legible at 60px. No border, no rounded corners
(iOS masks it), no text, no characters.
```
