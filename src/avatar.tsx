// 角色 — 從 decide-mock-v5.html 的 avatar() 搬入，資產介面見第 14 節。
import { useEffect, useState } from 'react'
import type { Level } from './types.ts'

export type Mood = 'idle' | 'bark' | 'praise' | 'punish'

/** 第 14 節：繪師資產路徑。存在就用 <img>，否則用內建 SVG，零程式改動。 */
export const assetUrl = (lv: Level, mood: Mood) => `/officers/${lv}/${mood}.webp`

/** 內建 SVG（mock v5 avatar() 逐行移植）。onDark = 放在深色梗圖卡上，不畫米白底。 */
export function avatarSvg(lv: Level, mood: Mood = 'idle', onDark = false): string {
  // 三人共用膚色、靠制服區分（palette swap）——與 design/hwpalette.mjs 的 HW.nes 同一套色。
  // 不盲目吸附：hwpalette.mjs 已說明舊的軍帽草綠逐通道取最近階會變成純灰，軍綠身分整個消失。
  const skin = '#FCA044'
  const shade = '#AC7C00'
  const uni = '#00A800'
  const capD = '#005800'
  const ink = '#000000'
  const gold = '#F8B800'
  const bg = onDark ? 'none' : '#FCE0A8'
  // NES 畫不出漸層，制服與底色一律扁平填色。
  let s = '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">'
  s += '<rect width="120" height="120" fill="' + bg + '"/>'
  /* 身體：制服＋領口＋名牌 */
  s += '<path d="M14 122 C22 92 42 86 60 86 C78 86 98 92 106 122 Z" fill="' + uni + '"/>'
  s += '<path d="M48 86 L60 100 L72 86 L66 84 L60 92 L54 84 Z" fill="' + shade + '"/>'
  s += '<rect x="70" y="98" width="18" height="6" rx="1" fill="#FCFCFC"/><rect x="72" y="100" width="14" height="2" fill="' + ink + '" opacity=".55"/>'
  if (lv === 1) s += '<path d="M24 122 L70 84 L78 90 L34 122 Z" fill="#F83800"/><path d="M26 122 L72 86" stroke="#F8B800" stroke-width="1.5"/>' /* 值星帶 */
  if (lv === 2) s += '<path d="M60 92 v12" stroke="#787878" stroke-width="1.6"/><rect x="54" y="104" width="12" height="7" rx="2" fill="' + gold + '"/><circle cx="66" cy="107" r="1.6" fill="#AC7C00"/>' /* 哨子 */
  /* 頸 */
  s += '<rect x="50" y="72" width="20" height="16" fill="' + shade + '"/>'
  /* 耳 */
  s += '<ellipse cx="34" cy="60" rx="5" ry="7" fill="' + skin + '"/><ellipse cx="86" cy="60" rx="5" ry="7" fill="' + skin + '"/>'
  /* 頭 */
  s += '<path d="M60 20 C40 20 34 38 35 56 C36 74 46 84 60 84 C74 84 84 74 85 56 C86 38 80 20 60 20 Z" fill="' + skin + '"/>'
  s += '<path d="M38 60 C42 78 52 84 60 84 C68 84 78 78 82 60 C80 76 70 82 60 82 C50 82 40 76 38 60 Z" fill="' + shade + '" opacity=".55"/>'
  /* 帽：船形軍帽＋帽徽 */
  const tilt = lv === 0 ? ' transform="rotate(-7 60 36)"' : ''
  s += '<g' + tilt + '><path d="M30 42 C36 22 84 22 90 42 L86 44 C74 34 46 34 34 44 Z" fill="' + uni + '"/>'
  s += '<path d="M28 42 L92 42 L90 50 C74 46 46 46 30 50 Z" fill="' + capD + '"/>'
  s += '<circle cx="60" cy="33" r="4.5" fill="' + gold + '"/><path d="M60 29.5 l1.2 2.5 2.8 .3 -2 1.9 .5 2.8 -2.5 -1.3 -2.5 1.3 .5 -2.8 -2 -1.9 2.8 -.3 Z" fill="#AC7C00"/></g>'
  if (lv === 2) s += '<path d="M42 48 q18 -6 36 0" stroke="#BCBCBC" stroke-width="1" fill="none"/>' /* 白髮線 */
  /* 眉 */
  const brow = { idle: [0, 0], bark: [-3, 3], praise: [-2, -2], punish: [-4, 4] }[mood]
  if (lv === 0) s += '<path d="M42 ' + (52 + brow[0]!) + ' q7 -4 14 0 M64 ' + (52 + brow[0]!) + ' q7 -4 14 0" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
  else s += '<path d="M40 ' + (50 + brow[0]!) + ' L56 ' + (54 + brow[1]!) + ' M80 ' + (50 + brow[0]!) + ' L64 ' + (54 + brow[1]!) + '" stroke="' + ink + '" stroke-width="' + (lv === 2 ? 4.5 : 3.8) + '" fill="none" stroke-linecap="round"/>'
  /* 眼 */
  if (lv === 2) {
    s += '<path d="M38 60 h18 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -3 3 h-14 a4 4 0 0 1 -4 -4 Z M64 60 h18 v6 a4 4 0 0 1 -4 4 h-14 a3 3 0 0 1 -3 -3 v-4 a3 3 0 0 1 3 -3 Z" fill="' + ink + '"/><path d="M59 62 h2" stroke="' + ink + '" stroke-width="2"/><path d="M42 62 l6 6" stroke="#FCFCFC" stroke-width="1.5" opacity=".5"/>'
  } else if (lv === 0) {
    s += '<circle cx="49" cy="62" r="4.2" fill="#FCFCFC"/><circle cx="71" cy="62" r="4.2" fill="#FCFCFC"/><circle cx="49.5" cy="62.5" r="2.6" fill="' + ink + '"/><circle cx="71.5" cy="62.5" r="2.6" fill="' + ink + '"/><circle cx="50.5" cy="61.5" r=".9" fill="#FCFCFC"/><circle cx="72.5" cy="61.5" r=".9" fill="#FCFCFC"/>'
  } else {
    s += '<path d="M43 62 h12 v3.5 h-12 Z M65 62 h12 v3.5 h-12 Z" fill="' + ink + '"/>'
  }
  /* 法令紋（士官長） */
  if (lv === 2) s += '<path d="M50 70 q-2 6 0 10 M70 70 q2 6 0 10" stroke="' + shade + '" stroke-width="1.6" fill="none"/>'
  /* 嘴 */
  const mouths: Record<Mood, string> = {
    idle: lv === 0
      ? '<path d="M52 75 q8 -3 16 0" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
      : '<path d="M50 75 h20" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>',
    bark: '<path d="M50 72 q10 -4 20 0 q-2 10 -10 10 q-8 0 -10 -10 Z" fill="' + ink + '"/><path d="M53 73 q7 -2 14 0" stroke="#FCFCFC" stroke-width="1.6"/>',
    praise: '<path d="M50 74 q10 8 20 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>',
    punish: '<path d="M48 71 q12 -6 24 0 q-1 12 -12 12 q-11 0 -12 -12 Z" fill="' + ink + '"/><path d="M51 72 q9 -3 18 0" stroke="#FCFCFC" stroke-width="1.8"/><path d="M54 80 q6 3 12 0" stroke="#F83800" stroke-width="2" fill="none"/>',
  }
  s += mouths[mood]
  if (lv === 0 && (mood === 'idle' || mood === 'bark')) s += '<path d="M88 48 q5 7 0 10 q-5 -3 0 -10 Z" fill="#3CBCFC"/>' /* 冒汗 */
  if (mood === 'punish') s += '<path d="M22 40 l6 -8 M18 52 l8 -2 M98 40 l-6 -8 M102 52 l-8 -2" stroke="' + (onDark ? 'currentColor' : ink) + '" stroke-width="2.5" stroke-linecap="round"/>'
  if (mood === 'praise') s += '<path d="M20 30 l4 4 M26 24 l1 6 M100 30 l-4 4 M94 24 l-1 6" stroke="' + gold + '" stroke-width="2.2" stroke-linecap="round"/>'
  return s + '</svg>'
}

export interface AvatarProps {
  level: Level
  mood?: Mood
  onDark?: boolean
  className?: string
  onClick?: () => void
  title?: string
}

const MOODS: Mood[] = ['idle', 'bark', 'praise', 'punish']

/**
 * 資產探測結果快取（模組層級，跨元件、跨 mood 共用）。
 * 沒有它，每次 mood 變更 hasAsset 都會重設成 false，先閃一幀舊色稿的向量頭像
 * 再換成 8-bit webp（DEV-PLAN-2 A-1 ④）。true = 載得到；false = 404 / 載入失敗。
 */
const assetKnown = new Map<string, boolean>()
const assetProbes = new Map<string, Promise<boolean>>()

/** 探測一張資產是否存在；同一個 url 只會真的發出一次請求。 */
export function probeAsset(url: string): Promise<boolean> {
  const known = assetKnown.get(url)
  if (known !== undefined) return Promise.resolve(known)
  const pending = assetProbes.get(url)
  if (pending) return pending
  if (typeof Image === 'undefined') return Promise.resolve(false)
  const p = new Promise<boolean>((resolve) => {
    const img = new Image()
    img.onload = () => { assetKnown.set(url, true); assetProbes.delete(url); resolve(true) }
    img.onerror = () => { assetKnown.set(url, false); assetProbes.delete(url); resolve(false) }
    img.src = url
  })
  assetProbes.set(url, p)
  return p
}

/** 一次把同一位班長的四種表情都探測（並讓瀏覽器快取），換表情時就不用等。 */
export function preloadOfficer(lv: Level): void {
  for (const mood of MOODS) void probeAsset(assetUrl(lv, mood))
}

/** 測試用：清空探測快取。 */
export function resetAssetCache(): void {
  assetKnown.clear()
  assetProbes.clear()
}

/**
 * 第 14 節資產介面：public/officers/{lv}/{mood}.webp 存在就用圖，否則內建 SVG。
 * 第一次：先畫 SVG（不閃白），背景探測 .webp，載到了才換掉，並順手預載同一位班長的其他表情。
 * 之後換表情：探測結果已在快取裡，直接用 <img>，不再退回 SVG 閃一下。
 */
export function Avatar({ level, mood = 'idle', onDark = false, className, onClick, title }: AvatarProps) {
  const url = assetUrl(level, mood)
  const [hasAsset, setHasAsset] = useState(() => assetKnown.get(url) ?? false)

  useEffect(() => {
    let alive = true
    const known = assetKnown.get(url)
    // 已知結果直接套用；未知才探測。未知時不把 hasAsset 打回 false，避免閃回 SVG。
    if (known !== undefined) setHasAsset(known)
    else void probeAsset(url).then((ok) => { if (alive) setHasAsset(ok) })
    preloadOfficer(level)
    return () => { alive = false }
  }, [url, level])

  const common = { className, onClick, title, 'data-avatar': `${level}-${mood}` }
  return hasAsset
    ? <div {...common}><img src={url} alt="" width={512} height={512} /></div>
    : <div {...common} dangerouslySetInnerHTML={{ __html: avatarSvg(level, mood, onDark) }} />
}
