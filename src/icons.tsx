// 首頁四張主卡的插圖。筆觸跟班長插畫一致：3px 墨線、圓角、實色塊。色值來自 src/palette.ts。
import type { ModuleId } from './types.ts'

const INK = '#1D2B24'
const O = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

const ART: Partial<Record<ModuleId, React.ReactNode>> = {
  // 吃：一碗冒煙的飯＋筷子
  eat: (
    <>
      <path d="M22 14 q-4 5 0 10 M34 10 q-4 5 0 10" fill="none" {...O} />
      <path d="M40 30 L58 8 M46 32 L62 12" fill="none" {...O} />
      <path d="M10 30 H54 C54 30 50 24 32 24 C14 24 10 30 10 30 Z" fill="#FFFFFF" {...O} />
      <path d="M6 30 H58 C58 46 46 54 32 54 C18 54 6 46 6 30 Z" fill="#FF6B4A" {...O} />
      <path d="M22 54 H42 V58 H22 Z" fill="#C7361A" {...O} />
    </>
  ),
  // 去：路標
  go: (
    <>
      <path d="M30 6 V58" fill="none" {...O} />
      <path d="M30 12 H50 L58 19 L50 26 H30 Z" fill="#4DB8FF" {...O} />
      <path d="M30 32 H14 L6 39 L14 46 H30 Z" fill="#FFC93C" {...O} />
      <path d="M20 58 H40" fill="none" {...O} />
    </>
  ),
  // 赴：請帖
  attend: (
    <>
      <rect x="6" y="16" width="52" height="36" rx="6" fill="#FFFFFF" {...O} />
      <path d="M6 20 L32 38 L58 20" fill="none" {...O} />
      <circle cx="46" cy="16" r="9" fill="#FF6B4A" {...O} />
      <path d="M46 12 V17 M46 21 V21.5" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  // 歇：一杯飲料
  rest: (
    <>
      <path d="M26 8 q-4 5 0 10 M36 8 q-4 5 0 10" fill="none" {...O} />
      <path d="M46 30 H52 C60 30 60 44 52 44 H46" fill="none" {...O} />
      <path d="M12 24 H48 V44 C48 52 42 56 30 56 C18 56 12 52 12 44 Z" fill="#FFFFFF" {...O} />
      <path d="M12 32 H48 V44 C48 52 42 56 30 56 C18 56 12 52 12 44 Z" fill="#1F7A4D" {...O} />
    </>
  ),
}

export function CardIcon({ id }: { id: ModuleId }) {
  const art = ART[id]
  if (!art) return null
  return <svg className="ico" viewBox="0 0 64 64" aria-hidden="true">{art}</svg>
}
