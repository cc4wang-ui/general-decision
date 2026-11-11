// 三位班長的向量造型（2026-11 改版）。純字串、無 JSX：scripts/build-icons.mjs 也直接 import 這支。
// 一個零件化函式組出 3 人 × 5 表情：共用身體、描邊與五官格線，靠頭型、帽子、配件區分三人。
// 色值全部來自 src/palette.ts，由 tests/unit/palette-guard.test.ts 把關。
import type { Level } from './types.ts'

export type Mood = 'idle' | 'bark' | 'praise' | 'punish' | 'soft'

export const MOODS: Mood[] = ['idle', 'bark', 'praise', 'punish', 'soft']

const INK = '#1D2B24'
const WHITE = '#FFFFFF'
const GREEN = '#1F7A4D'
const GREEN_DEEP = '#14573A'
const SUN = '#FFC93C'
const CORAL = '#FF6B4A'
const CORAL_DEEP = '#C7361A'
const SKY = '#4DB8FF'
const HAIR = '#E6E6E6'
const BLUSH = '#FF9E8A'

/** 每位班長的膚色、陰影色與背景色。 */
const LOOK = [
  { skin: '#FFD2A6', shade: '#F2B181', bg: '#C9EFD8' }, // 阿良：菜鳥下士，白淨
  { skin: '#C98850', shade: '#A86A38', bg: '#FFC93C' }, // 黑面：值星班長，曬得黑
  { skin: '#F2BC8C', shade: '#D99A66', bg: '#FFDDCF' }, // 老郭：士官長
] as const

const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`
const line = (d: string, w = 3, color = INK) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`

function body(lv: Level): string {
  const { shade } = LOOK[lv]
  let s = `<rect x="51" y="80" width="18" height="16" fill="${shade}" ${O}/>`
  s += `<path d="M14 124 C14 100 36 92 60 92 C84 92 106 100 106 124 Z" fill="${GREEN}" ${O}/>`
  s += `<path d="M47 93 L60 107 L73 93 L67 90 L60 98 L53 90 Z" fill="${GREEN_DEEP}" ${O}/>`
  if (lv === 1) {
    // 值星帶
    s += `<path d="M22 124 L70 92 L80 97 L38 124 Z" fill="${CORAL_DEEP}" ${O}/>`
    s += line('M31 122 L75 95', 2, SUN)
  }
  if (lv === 2) {
    // 哨子
    s += line('M60 106 V112', 2)
    s += `<rect x="53" y="111" width="14" height="8" rx="3" fill="${SUN}" ${O}/>`
  }
  return s
}

function head(lv: Level): string {
  const { skin } = LOOK[lv]
  const ears = `<circle cx="33" cy="63" r="6" fill="${skin}" ${O}/><circle cx="87" cy="63" r="6" fill="${skin}" ${O}/>`
  if (lv === 0) return ears + `<circle cx="60" cy="61" r="27" fill="${skin}" ${O}/>`
  if (lv === 1) return ears + `<rect x="33" y="35" width="54" height="52" rx="17" fill="${skin}" ${O}/>`
  return ears
    + `<path d="M36 46 C36 32 84 32 84 46 L86 70 C86 86 72 95 60 95 C48 95 34 86 34 70 Z" fill="${skin}" ${O}/>`
    + `<path d="M34 54 h5 v11 h-5 Z M81 54 h5 v11 h-5 Z" fill="${HAIR}" ${O}/>` // 白鬢角
}

function cap(lv: Level): string {
  const star = (cx: number, cy: number) =>
    `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${SUN}" ${O}/>`
  if (lv === 0) {
    // 船形帽，戴歪
    return `<g transform="rotate(-8 60 38)"><path d="M35 44 C37 22 83 22 85 44 Z" fill="${GREEN}" ${O}/>`
      + `<path d="M31 41 H89 L87 51 C72 46 48 46 33 51 Z" fill="${GREEN_DEEP}" ${O}/>${star(60, 33)}</g>`
  }
  if (lv === 1) {
    // 鋼盔
    return `<path d="M29 47 C27 12 93 12 91 47 Z" fill="${GREEN_DEEP}" ${O}/>`
      + line('M27 47 H93', 5) + line('M41 30 C45 23 52 20 58 19', 3, GREEN)
  }
  // 大盤帽
  return `<g transform="translate(0 -7)"><path d="M29 40 C27 20 93 20 91 40 L86 47 H34 Z" fill="${GREEN}" ${O}/>`
    + `<rect x="34" y="40" width="52" height="8" fill="${GREEN_DEEP}" ${O}/>`
    + `<path d="M34 48 C44 55 76 55 86 48 C78 45 42 45 34 48 Z" fill="${INK}" ${O}/>${star(60, 31)}</g>`
}

function brows(lv: Level, mood: Mood): string {
  // [外側 y 位移, 內側 y 位移]
  const [o, i] = { idle: [0, 0], bark: [-3, 3], praise: [-3, -3], punish: [-5, 4], soft: [1, -2] }[mood] as [number, number]
  const y = lv === 1 ? 55 : 52
  const d = `M40 ${y + o} L55 ${y + i} M80 ${y + o} L65 ${y + i}`
  if (lv === 2) return line(d, 6.5) + line(d, 3, HAIR) // 白眉：墨線打底
  return line(d, lv === 0 ? 3 : 5)
}

function eyes(lv: Level, mood: Mood): string {
  if (lv === 2) {
    // 飛行員墨鏡：情緒交給眉毛和嘴
    return `<rect x="37" y="58" width="20" height="13" rx="6" fill="${INK}" ${O}/><rect x="63" y="58" width="20" height="13" rx="6" fill="${INK}" ${O}/>`
      + line('M57 62 H63', 3) + line('M42 62 l4 -1 M68 62 l4 -1', 2, WHITE)
  }
  if (mood === 'praise') return line('M42 65 q6 -8 12 0 M66 65 q6 -8 12 0', 3.5)
  if (lv === 0) {
    const r = mood === 'punish' ? 2 : 3.2
    return `<circle cx="48" cy="64" r="7" fill="${WHITE}" ${O}/><circle cx="72" cy="64" r="7" fill="${WHITE}" ${O}/>`
      + `<circle cx="49" cy="65" r="${r}" fill="${INK}"/><circle cx="73" cy="65" r="${r}" fill="${INK}"/>`
  }
  return `<ellipse cx="48" cy="64" rx="3.4" ry="4.4" fill="${INK}"/><ellipse cx="72" cy="64" rx="3.4" ry="4.4" fill="${INK}"/>`
}

function mouth(lv: Level, mood: Mood): string {
  const dy = lv === 2 ? 9 : lv === 1 ? 1 : 0 // 老郭的嘴在鬍子下面
  const t = `transform="translate(0 ${dy})"`
  const shapes: Record<Mood, string> = {
    idle: lv === 0 ? line('M54 78 q6 -3 12 0') : line('M52 78 H68'),
    bark: `<path d="M49 73 q11 -5 22 0 q-1 13 -11 13 q-10 0 -11 -13 Z" fill="${INK}" ${O}/><ellipse cx="60" cy="82" rx="5" ry="2.6" fill="${CORAL}"/>`,
    praise: `<path d="M49 73 q11 4 22 0 q-2 11 -11 11 q-9 0 -11 -11 Z" fill="${INK}" ${O}/><path d="M53 76 h14 v2 h-14 Z" fill="${WHITE}"/>`,
    punish: `<rect x="49" y="72" width="22" height="10" rx="3" fill="${WHITE}" ${O}/>` + line('M56 72 v10 M64 72 v10 M49 77 h22', 2),
    soft: line('M52 76 q8 6 16 0'),
  }
  const moustache = lv === 2
    ? `<path d="M45 81 q7 -9 15 -3 q8 -6 15 3 q-8 3 -15 -1 q-7 4 -15 1 Z" fill="${HAIR}" ${O}/>`
    : ''
  return `<g ${t}>${shapes[mood]}</g>${moustache}`
}

function extras(lv: Level, mood: Mood): string {
  let s = ''
  if (lv === 0 || mood === 'soft' || mood === 'praise') {
    s += `<circle cx="41" cy="73" r="4" fill="${BLUSH}"/><circle cx="79" cy="73" r="4" fill="${BLUSH}"/>`
  }
  if (lv === 0 && (mood === 'idle' || mood === 'bark' || mood === 'punish')) {
    s += `<path d="M96 42 q6 9 0 13 q-6 -4 0 -13 Z" fill="${SKY}" ${O}/>` // 冒汗
  }
  if (mood === 'bark') s += line('M97 70 l9 -4 M99 78 h10 M97 86 l9 4')
  if (mood === 'punish') s += line('M92 26 q5 3 3 8 M103 27 q-5 3 -3 8 M90 38 q6 -1 9 3 M105 38 q-6 -1 -9 3', 3, CORAL_DEEP)
  if (mood === 'praise') {
    const spark = (x: number, y: number, k: number) =>
      `<path d="M${x} ${y - k} q1 ${k - 1} ${k} ${k} q${1 - k} 1 -${k} ${k} q-1 ${1 - k} -${k} -${k} q${k - 1} -1 ${k} -${k} Z" fill="${SUN}" ${O}/>`
    s += spark(100, 30, 8) + spark(18, 44, 6)
  }
  return s
}

/**
 * 回傳一張 120×120 的 SVG 字串。
 * onDark＝放在口令卡上：只畫圓形底，不畫滿版底色，四角透明。
 */
export function avatarSvg(lv: Level, mood: Mood = 'idle', onDark = false): string {
  const { bg } = LOOK[lv]
  const backdrop = onDark
    ? `<circle cx="60" cy="62" r="56" fill="${bg}"/>`
    : `<rect width="120" height="120" fill="${bg}"/>`
  const clip = onDark ? `<clipPath id="av-clip-${lv}"><circle cx="60" cy="62" r="56"/></clipPath>` : ''
  const open = onDark ? `<g clip-path="url(#av-clip-${lv})">` : '<g>'
  return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">'
    + clip + backdrop + open + body(lv) + '</g>'
    + head(lv) + extras(lv, mood) + eyes(lv, mood) + brows(lv, mood) + mouth(lv, mood) + cap(lv)
    + '</svg>'
}
