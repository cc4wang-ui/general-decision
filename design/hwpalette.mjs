// 硬體調色盤 — 把顏色吸附到真實 8-bit 主機畫得出來的格子上。
//
// 這是「看起來像 8-bit」與「真的是 8-bit」的分界線。
// 自己挑的顏色再怎麼限制色數，玩過那兩台的人一眼就知道不對。

// ── Sega Master System（1985）────────────────────────────────────
// VDP 每個通道 2 bits → 每通道只有 4 階：0 / 85 / 170 / 255。
// 合計 4³ = 64 色。sprite 可用 15 色 + 透明，比 FC 寬鬆很多。
const SMS_LEVELS = [0, 85, 170, 255]

export function smsPalette() {
  const out = []
  for (const r of SMS_LEVELS) for (const g of SMS_LEVELS) for (const b of SMS_LEVELS) out.push([r, g, b])
  return out
}

/** 吸附到 SMS 格子。這是精確的：每通道獨立取最近的 4 階之一。 */
export function toSMS(hex) {
  const [r, g, b] = hex2rgb(hex)
  const snap = (v) => SMS_LEVELS.reduce((a, c) => (Math.abs(c - v) < Math.abs(a - v) ? c : a))
  return rgb2hex([snap(r), snap(g), snap(b)])
}

// ── 任天堂 FC / NES（1983）──────────────────────────────────────
// ⚠️ 誠實聲明：NES 沒有「唯一正確」的 RGB 調色盤。它輸出的是複合視訊訊號，
// 每一台電視、每一個模擬器解出來的顏色都略有不同。下面這組是流通最廣的
// 近似值之一（常見於 Nestopia / FCEUX 的預設）。要精確對色請以實機為準。
const NES = [
  '#7C7C7C','#0000FC','#0000BC','#4428BC','#940084','#A80020','#A81000','#881400',
  '#503000','#007800','#006800','#005800','#004058','#000000','#000000','#000000',
  '#BCBCBC','#0078F8','#0058F8','#6844FC','#D800CC','#E40058','#F83800','#E45C10',
  '#AC7C00','#00B800','#00A800','#00A844','#008888','#000000','#000000','#000000',
  '#F8F8F8','#3CBCFC','#6888FC','#9878F8','#F878F8','#F85898','#F87858','#FCA044',
  '#F8B800','#B8F818','#58D854','#58F898','#00E8D8','#787878','#000000','#000000',
  '#FCFCFC','#A4E4FC','#B8B8F8','#D8B8F8','#F8B8F8','#F8A4C0','#F0D0B0','#FCE0A8',
  '#F8D878','#D8F878','#B8F8B8','#B8F8D8','#00FCFC','#F8D8F8','#000000','#000000',
]
export const nesPalette = () => [...new Set(NES)]

/** 吸附到 NES 主調色盤（歐氏距離最近的那一格）。 */
export function toNES(hex) {
  const [r, g, b] = hex2rgb(hex)
  let best = NES[0], bd = Infinity
  for (const c of nesPalette()) {
    const [cr, cg, cb] = hex2rgb(c)
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (d < bd) { bd = d; best = c }
  }
  return best
}

// ── 工具 ─────────────────────────────────────────────────────────
export function hex2rgb(h) {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
export const rgb2hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')

/** 灰階亮度 —— 三人膚色的灰階差必須 ≥ 20（第 9 節驗收）。 */
export const luma = (hex) => {
  const [r, g, b] = hex2rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * 兩件事在這裡被決定：
 *
 * 1. 品牌色不盲目吸附。#587631（草綠）每通道取最近階會變成 #555555 純灰，
 *    軍綠身分整個消失。所以是從硬體調色盤裡「挑一格」，標準是保住色相身分。
 *
 * 2. 三人共用同一個膚色，改用制服顏色區分。這兩台機器的膚色選擇都極少，
 *    硬要三階不同的膚色會被逼到橘紅（黑面看起來像曬傷）。而 palette swap
 *    本來就是 8-bit 區分同類角色的標準技法。
 */
export const HW = {
  // Sega Master System —— 15 色/sprite，可做多階陰影，整體亮而飽和
  sms: {
    label: 'Sega Master System',
    ink: '#000000', page: '#FFFFAA', signal: '#FF0000', gold: '#FFAA00', white: '#FFFFFF',
    skin: '#FFAA55', skinDark: '#AA5500',
    // 制服由亮到暗 = 三段火力。灰階差 122 / 55，遠高於門檻
    unis: [
      { uni: '#55FF00', dark: '#55AA00' },  // 阿良：最亮，最沒有威嚴
      { uni: '#55AA00', dark: '#005500' },  // 黑面：標準
      { uni: '#005500', dark: '#000000' },  // 老郭：最暗，氣壓最高
    ],
    accents: ['#00AAFF', '#FF0000', '#FFFFFF'], // 汗 / 值星帶 / 白髮
    cords: [null, null, '#FF0000'],            // 老郭的紅哨繩（第八色）
  },
  // 任天堂 FC/NES —— 3 色/sprite，顏色極省，靠形狀撐辨識
  nes: {
    label: '任天堂 FC / NES',
    ink: '#000000', page: '#FCE0A8', signal: '#F83800', gold: '#F8B800', white: '#FCFCFC',
    skin: '#FCA044', skinDark: '#AC7C00',
    unis: [
      { uni: '#B8F818', dark: '#00A800' },
      { uni: '#00A800', dark: '#005800' },
      { uni: '#005800', dark: '#000000' },
    ],
    accents: ['#3CBCFC', '#F83800', '#F8F8F8'],
    cords: [null, null, '#F83800'],            // 老郭的紅哨繩（第八色，使用者確認）
  },
}

/**
 * 把 HW 設定攤成 sprites.mjs 吃的 PALETTES 形狀。
 *
 * 回傳的每一層都是**該角色會用到的完整色表**，可以直接當白名單用
 * （`docs/archive/design/8bit/normalize.mjs`（已封存） 就是這樣檢查的，CI 要加色數檢查也從這裡拿）。
 * 所以 `ink`（描邊色）與 `cord`（老郭的紅哨繩）都必須在裡面：
 * 少了它們，白名單會把畫面上真的存在的顏色判成非法色。
 * `cord` 只有 lv2 有，其餘兩層不放這個 key —— 讓 `Object.values()` 拿到的
 * 永遠是合法色，不會混進 null。
 */
export function hwPalettes(mode) {
  const h = HW[mode]
  if (!h) throw new Error(`未知的調色盤模式：${mode}（可用：${Object.keys(HW).join(' / ')}）`)
  // Palette swap —— 8-bit 區分同類角色的標準做法：膚色共用，換制服。
  // 這同時就是三段火力的梯度：制服由亮到暗，氣壓由低到高。
  return Object.fromEntries([0, 1, 2].map((lv) => [lv, {
    ink: h.ink,
    skin: h.skin, skinDark: h.skinDark,
    uni: h.unis[lv].uni, uniDark: h.unis[lv].dark,
    accent: h.accents[lv], gold: h.gold, white: h.white,
    ...(h.cords?.[lv] ? { cord: h.cords[lv] } : {}),
  }]))
}
