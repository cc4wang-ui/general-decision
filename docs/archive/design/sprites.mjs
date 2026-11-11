// 8-bit 班長 sprite 系統 — 方向 C（玩具／電玩感）· 48×48。
//
// 設計原則（這是「一致性是結構保證而非檢查項目」的實作）：
//   三人共用同一組格線常數，只換零件。表情只換眉與嘴。
//   改表情 = 改一個函式；改配色 = 換 palette；不重畫任何像素。
//
// 調色：NES 合法 —— 每個角色用 3 組 palette，每組 3 色 + 透明。
//   P0 膚 / P1 制服 / P2 專屬配件。合計 ≤ 8 色，與 NES 的多 palette sprite 規則一致。

// ── 共用格線（三人鎖死，不可個別調整）────────────────────────────
export const G = {
  SIZE: 48,
  CX: 24,        // 中軸
  CAP_TOP: 5,    // 帽頂
  CAP_BAND: 13,  // 帽簷帶
  HEAD_TOP: 12,  // 頭頂（被帽子蓋住）
  EYE_Y: 24,     // ★ 眼線，三人絕對一致
  CHIN: 34,      // 下顎
  NECK_Y: 34,
  SHOULDER_Y: 38, // ★ 肩線，三人絕對一致
  EYE_DX: 6,     // 眼中心距中軸
}

// ── 調色盤 ────────────────────────────────────────────────────────
//
// 顏色的唯一真相在 hwpalette.mjs，這裡不再自己宣告任何色值。
// （2026-09-16 前這裡有兩處硬編：`const INK = '#000000'` 與
//  `PALETTES[2].cord = '#F83800'`。兩份真相遲早會走散，已收回色盤。）
//
// ⚠️ INK 與 `#16180F` 的落差 —— 已實測，結論寫在這裡免得再查一次：
//   描邊色走的**不是** `toNES()`（那是把任意色吸附到 NES 54 格主調色盤用的，
//   描邊色沒經過它）。INK 直接取 `HW.nes.ink` = `#000000`，與 `public/officers/`
//   裡實際解出來的黑一致。
//   但 `design/8bit/*.dc.html` 裡的 sprite 描邊是 `#16180F`（Sprites.dc.html 有 1957 處）。
//   那**不是**現在這份程式的輸出，是舊版 sprites.mjs（軍教片方向、INK = '#16180F'、
//   帽型也不同）留下的建置產物。這些 .dc.html 已經與 sprites.mjs 走散。
//   重跑 build8bit.mjs 會把它們整批改掉 —— 那是視覺變更，需要 Cross 點頭，
//   不在階段 1 的範圍，所以這輪刻意沒有重生成。
//
// 重現 public/officers/ 那 30 個檔的確切命令（兩支都要跑，見 design/8bit/README.md）：
//   cd design && node build8bit.mjs    # 重出 design/8bit/*.dc.html + canvas.json（必須在 design/ 底下跑）
//   python3 design/8bit/export.py      # 重出 public/officers/ 15 PNG + 15 無損 WebP
//   find public/officers -type f | wc -l   # 應為 30
import { hwPalettes } from './hwpalette.mjs'
export const PALETTES = hwPalettes('nes')
const INK = PALETTES[0].ink

// ── 像素畫布 ──────────────────────────────────────────────────────
const blank = () => Array.from({ length: G.SIZE }, () => Array(G.SIZE).fill(null))
const put = (b, x, y, c) => {
  if (c && x >= 0 && x < G.SIZE && y >= 0 && y < G.SIZE) b[y][x] = c
}
const rect = (b, x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(b, x + i, y + j, c)
}
/** 對稱畫：同時畫左右兩邊（dx = 距中軸的偏移）。保證五官左右對齊。 */
const mirror = (b, dx, y, w, h, c) => {
  rect(b, G.CX + dx, y, w, h, c)
  rect(b, G.CX - dx - w, y, w, h, c)
}
/** 用每列的寬度陣列畫一個左右對稱的形狀（widths[i] = 第 i 列的半寬）。 */
const shape = (b, y0, halfWidths, c) => {
  halfWidths.forEach((hw, i) => {
    if (hw > 0) rect(b, G.CX - hw, y0 + i, hw * 2, 1, c)
  })
}
/** 沿著已填色區域的外緣描一圈 ink（8-bit 的厚描邊）。 */
const outline = (b, c = INK) => {
  const src = b.map((r) => [...r])
  for (let y = 0; y < G.SIZE; y++) {
    for (let x = 0; x < G.SIZE; x++) {
      if (src[y][x]) continue
      const near = [[0,1],[0,-1],[1,0],[-1,0]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy
        return nx >= 0 && nx < G.SIZE && ny >= 0 && ny < G.SIZE && src[ny][nx] && src[ny][nx] !== c
      })
      if (near) put(b, x, y, c)
    }
  }
}

// ── 頭形：三人三個基本形（剪影差異的主要來源）────────────────────
// 回傳每一列的半寬，從 HEAD_TOP 到 CHIN。
function headShape(lv) {
  const h = G.CHIN - G.HEAD_TOP + 1 // 23 列
  const out = []
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1)
    let hw
    if (lv === 0) {
      // 正圓：最寬在中段，上下對稱收圓
      hw = 12 * Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.62) ** 2))
    } else if (lv === 1) {
      // 圓角方：幾乎等寬，四角收
      hw = 11 - (t < 0.1 ? (0.1 - t) * 28 : 0) - (t > 0.9 ? (t - 0.9) * 26 : 0)
    } else {
      // 長倒梯：上寬下窄
      hw = 11.5 - t * 4 - (t < 0.08 ? (0.08 - t) * 30 : 0)
    }
    out.push(Math.max(0, Math.round(hw)))
  }
  return out
}

// ── 帽子：船形帽 ──────────────────────────────────────────────────
function drawCap(b, lv, P) {
  // 船形帽（garrison cap）正面：中央一道摺脊最高，往兩側下斜蓋住耳朵上緣。
  // 不是圓頂，不是棒球帽 —— 這是台灣兵的第一辨識符號，畫錯整個方向就白做。
  const tilt = lv === 0 ? -3 : 0          // 阿良歪帽
  const lift = lv === 1 ? -1 : lv === 2 ? 1 : 0  // 黑面帽最高、老郭最低
  const top = G.CAP_TOP + lift

  // 摺脊 → 兩側下斜。halfWidths 由窄到寬，形成尖頂。
  const profile = [2, 4, 6, 7, 8, 9, 10, 12, 12]
  profile.forEach((hw, i) => {
    const y = top + i
    const shift = Math.round(tilt * (1 - i / profile.length))
    rect(b, G.CX - hw + shift, y, hw * 2, 1, P.uni)
  })
  // 摺脊高光線（塑膠件的分模邊緣 + 帽子的摺痕，一筆兩用）
  for (let i = 0; i < 5; i++) {
    put(b, G.CX + Math.round(tilt * (1 - i / 9)), top + i, P.uniDark)
  }
  // 帽簷帶
  const bandY = top + profile.length
  rect(b, G.CX - 12, bandY, 24, 2, P.uniDark)

  // 帽徽：金環 + 深心（不是五角星 —— 五角星是解放軍／蘇聯系統）
  const bx = G.CX - 2 + Math.round(tilt * 0.35)
  rect(b, bx, top + 4, 4, 4, P.gold)
  rect(b, bx + 1, top + 5, 2, 2, P.uniDark)

  // ── 剪影差異：三人必須在純黑 48px 並排時分得出來 ──────────────
  if (lv === 0) {
    // 阿良：整頂帽子右歪（靠 tilt 位移），後腦一撮頭髮翹出來。
    // 不在帽頂兩側加突起 —— 那會讀成角，不是歪帽。
    rect(b, G.CX - 14, bandY - 2, 3, 4, INK)
    rect(b, G.CX - 16, bandY, 2, 3, INK)
  }
  if (lv === 1) {
    // 黑面：帽體最方最高，兩側各外推 2 —— 最寬的頭部剪影
    rect(b, G.CX - 14, bandY - 3, 2, 3, P.uni)
    rect(b, G.CX + 12, bandY - 3, 2, 3, P.uni)
    rect(b, G.CX - 14, bandY, 28, 2, P.uniDark)
  }
  if (lv === 2) {
    // 老郭：帽簷下的鬢角白髮，貼著臉側往下，不往上翻。
    // 太陽穴處最寬 —— 這是他的剪影特徵，但形狀是頭髮不是角。
    mirror(b, 10, bandY + 1, 2, 6, P.accent)
    mirror(b, 12, bandY + 2, 1, 4, P.accent)
  }
}

// ── 眼 ────────────────────────────────────────────────────────────
function drawEyes(b, lv, P, mood) {
  const y = G.EYE_Y, away = mood === 'soft' ? 1 : 0
  for (const cx of [18, 30]) {
    if (lv === 0 || (lv === 1 && mood === 'punish')) {
      rect(b, cx - 2, y - 2, 5, lv === 0 ? 6 : 5, P.white)
      if (lv === 0) {
        // Clip white corners to make the eyes round at native size.
        for (const dx of [-2,2]) for (const dy of [-2,2]) put(b,cx+dx,y+dy,P.skin)
      }
      rect(b, cx - 1 + away, y - 1, 3, lv === 0 ? 4 : 3, INK)
      if (lv === 0) put(b, cx - 1 + away, y - 1, P.white)
    } else if (lv === 1) {
      rect(b, cx - 2 + away, y - 1, 5, 2, INK)
    } else {
      rect(b, cx - 3, y - 1, 6, 3, INK)
      rect(b, cx - 2 + away, y - 1, 2, 1, P.white)
    }
  }
  if (lv === 2) rect(b,21,y,6,1,INK) // 1 px 高的鏡橋
}

// ── 眉：表情的主要載體 ────────────────────────────────────────────
const BROWS = {
  //        [外端 dy, 內端 dy, 粗細]
  idle:   [0, 0],
  bark:   [-1, 2],
  praise: [-2, -1],
  punish: [-2, 3],
  soft:   [0, 0],
}
function drawBrows(b, lv, P, mood) {
  const [outer, inner] = BROWS[mood]
  const th = lv === 0 ? 1 : lv === 1 ? 2 : 3   // 阿良細、黑面粗、老郭極粗
  const len = lv === 2 ? 7 : lv === 0 ? 5 : 6
  const baseY = G.EYE_Y - (lv === 2 ? 6 : 5)
  for (let i = 0; i < len; i++) {
    const t = i / (len - 1)                     // 0 = 外側，1 = 內側
    const dy = Math.round(outer + (inner - outer) * t)
    const x = G.EYE_DX + 3 - i
    rect(b, G.CX + x - 1, baseY + dy, 1, th, INK)
    rect(b, G.CX - x, baseY + dy + (lv === 0 ? 1 : 0), 1, th, INK)
  }
  // 老郭：眉上兩道白毛
  if (lv === 2) mirror(b, G.EYE_DX + 1, baseY - 1 + Math.round(outer), 2, 1, P.accent)
}

// ── 嘴：表情的另一個載體 ──────────────────────────────────────────
function drawMouth(b, lv, P, mood) {
  const y = G.EYE_Y + 6
  if (mood === 'idle' || mood === 'soft') {
    const w = lv === 0 ? 5 : 7
    rect(b, G.CX - Math.floor(w / 2), y + 1, w, 1, INK)
  } else if (mood === 'bark') {
    rect(b, G.CX - 4, y, 8, 5, INK)
    rect(b, G.CX - 3, y + 1, 6, 1, P.white)  // 上齒
  } else if (mood === 'praise') {
    // 上揚弧 —— 幅度極小，這是「認可」不是「慶祝」（第 7 節規則 3）
    rect(b, G.CX - 3, y + 1, 6, 1, INK)
    rect(b, G.CX - 4, y, 1, 1, INK)
    rect(b, G.CX + 3, y, 1, 1, INK)
  } else if (mood === 'punish') {
    // 最大張口，但嘴角向下（向上 = 獰笑 = 施虐，禁止）
    rect(b, G.CX - 5, y - 1, 10, 6, INK)
    rect(b, G.CX - 4, y, 8, 1, P.white)
    rect(b, G.CX - 6, y + 2, 1, 2, INK)
    rect(b, G.CX + 5, y + 2, 1, 2, INK)
  }
  // 老郭：法令紋
  if (lv === 2) mirror(b, 5, y - 2, 1, 3, P.skinDark)
}

// ── 身體：制服、名牌、專屬配件 ────────────────────────────────────
function drawBody(b, lv, P) {
  // 頸
  rect(b, G.CX - 4, G.NECK_Y, 8, 5, P.skinDark)
  // 肩：三人不同寬窄與斜度，是剪影差異的第二個來源
  const SH = { 0: { grow: 1.3, max: 15 }, 1: { grow: 2.0, max: 21 }, 2: { grow: 1.6, max: 18 } }[lv]
  const rows = G.SIZE - G.SHOULDER_Y
  for (let i = 0; i < rows; i++) {
    const hw = Math.min(SH.max, 8 + i * SH.grow)
    rect(b, G.CX - Math.round(hw), G.SHOULDER_Y + i, Math.round(hw) * 2, 1, P.uni)
  }
  // 黑面：值星帶把右肩抬高（肩線刻意不對稱）
  if (lv === 1) rect(b, G.CX - 20, G.SHOULDER_Y + 2, 7, 2, P.uni)
  // 立領
  rect(b, G.CX - 6, G.SHOULDER_Y, 12, 2, P.uniDark)
  rect(b, G.CX - 2, G.SHOULDER_Y, 4, 3, P.skinDark)
  // 翻領以兩個像素階梯勾出，不增加顏色。
  for (let i=0;i<4;i++) {
    put(b, G.CX-6+i, G.SHOULDER_Y+i, P.uniDark)
    put(b, G.CX+5-i, G.SHOULDER_Y+i, P.uniDark)
  }
  rect(b,G.CX-1,G.SHOULDER_Y+4,1,6,P.uniDark)
  // 名牌：角色的右胸 = 看的人的左邊
  const nx = lv === 1 ? 7 : 11, ny = lv === 1 ? 44 : 42
  rect(b, nx, ny, 7, 3, P.white)
  rect(b, nx + 1, ny + 1, 5, 1, P.uniDark)

  if (lv === 1) {
    // 黑面：紅色值星帶，角色右肩到左腰（畫面左上往右下），金線鑲邊
    for (let i = 0; i < 10; i++) {
      const y = G.SHOULDER_Y + i
      const x = G.CX - 17 + i * 2
      if (y < G.SIZE) {
        rect(b, x, y, 5, 1, P.accent)
        put(b, x + 5, y, P.gold)
      }
    }
  }
  if (lv === 2) {
    // 老郭：哨子 + 紅繩
    for (let i = 0; i < 5; i++) {
      put(b, G.CX - 5 + i, G.SHOULDER_Y + 1 + i, P.cord)
      put(b, G.CX + 5 - i, G.SHOULDER_Y + 1 + i, P.cord)
    }
    rect(b, G.CX - 2, G.SHOULDER_Y + 6, 5, 3, P.gold)
    rect(b, G.CX + 3, G.SHOULDER_Y + 7, 1, 1, P.skinDark)
  }
  // 玩具材質層：硬邊高光（左上）。避開值星帶的路徑。
  if (lv !== 1) rect(b, G.CX - 15, G.SHOULDER_Y + 4, 3, 1, P.uniDark)
}

// ── 額外元素 ──────────────────────────────────────────────────────
function drawExtras(b, lv, P, mood) {
  if (lv === 0 && mood !== 'praise') {
    // 阿良：汗滴（直徑要夠大，否則縮小後會被讀成髒點）
    rect(b, 9, 19, 2, 4, P.accent) // 角色右側太陽穴，所有非 praise 表情固定同一滴
  }
  if (mood === 'punish') {
    // 怒氣線（兩側各兩道）
    mirror(b, 15, G.EYE_Y - 8, 1, 3, INK)
    mirror(b, 17, G.EYE_Y - 5, 3, 1, INK)
  }
  if (mood === 'praise') {
    // 金色放射短芒：只在兩側、成對、絕不成圓（成圓 = 聖光 = 慶祝）
    mirror(b, 15, G.EYE_Y - 9, 1, 3, P.gold)
    mirror(b, 17, G.EYE_Y - 6, 3, 1, P.gold)
  }
}

// ── 組裝 ──────────────────────────────────────────────────────────
export const MOODS = ['idle', 'bark', 'praise', 'punish', 'soft']

/** 回傳 48×48 的顏色矩陣（null = 透明）。 */
export function spriteGrid(lv, mood = 'idle', palettes = PALETTES) {
  const P = palettes[lv]
  const b = blank()

  drawBody(b, lv, P)
  // 小耳朵與輪廓階梯：增加日式遊戲肖像的漫畫感。
  const ew = lv === 0 ? 12 : lv === 1 ? 12 : 11
  mirror(b, ew - 1, 23, 3, 5, P.skin)
  mirror(b, ew + 1, 24, 1, 3, P.skinDark)
  shape(b, G.HEAD_TOP, headShape(lv), P.skin)
  // 臉頰陰影（固定左上光源 → 右下為陰影，一階硬邊）
  headShape(lv).forEach((hw, i) => {
    const y = G.HEAD_TOP + i
    if (hw > 4 && i > 12) rect(b, G.CX + hw - 3, y, 3, 1, P.skinDark)
  })
  drawCap(b, lv, P)
  outline(b)              // 先描外框，五官畫在框內
  drawEyes(b, lv, P, mood)
  drawBrows(b, lv, P, mood)
  drawMouth(b, lv, P, mood)
  const extras = blank()
  drawExtras(extras, lv, P, mood)
  outline(extras)
  for (let y=0;y<G.SIZE;y++) for(let x=0;x<G.SIZE;x++) if(extras[y][x]) b[y][x]=extras[y][x]
  return b
}

/** 轉成 SVG（同列同色的像素合併成一個 rect，檔案小很多）。 */
export function spriteSvg(lv, mood = 'idle', { scale = 1, bg = null, palettes = PALETTES } = {}) {
  const g = spriteGrid(lv, mood, palettes)
  const parts = []
  if (bg) parts.push(`<rect width="${G.SIZE}" height="${G.SIZE}" fill="${bg}"/>`)
  for (let y = 0; y < G.SIZE; y++) {
    let x = 0
    while (x < G.SIZE) {
      const c = g[y][x]
      if (!c) { x++; continue }
      let w = 1
      while (x + w < G.SIZE && g[y][x + w] === c) w++
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`)
      x += w
    }
  }
  const px = G.SIZE * scale
  return `<svg viewBox="0 0 ${G.SIZE} ${G.SIZE}" width="${px}" height="${px}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${parts.join('')}</svg>`
}

/** 純黑剪影 —— 第 9 節第一道驗收閘門用。 */
export function silhouetteSvg(lv, mood = 'idle', scale = 1) {
  const g = spriteGrid(lv, mood)
  const parts = []
  for (let y = 0; y < G.SIZE; y++) {
    let x = 0
    while (x < G.SIZE) {
      if (!g[y][x]) { x++; continue }
      let w = 1
      while (x + w < G.SIZE && g[y][x + w]) w++
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="#000"/>`)
      x += w
    }
  }
  const px = G.SIZE * scale
  return `<svg viewBox="0 0 ${G.SIZE} ${G.SIZE}" width="${px}" height="${px}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}
