// 梗圖卡 — 第 9 節：兩欄 grid（1fr 38%），左欄文字、右欄角色，角色不得壓字。
import type { ReactNode } from 'react'
import { Avatar, type Mood } from './avatar.tsx'
import type { Level } from './types.ts'

export type MemeTone = 'olive' | 'red' | 'ok'

export interface MemeCardProps {
  tone?: MemeTone
  tag: string
  top: string
  /** 主字。與 number 二選一。 */
  big?: string
  /** 倒數數字（罰則畫面）。給了就取代 big。 */
  number?: number
  total?: number
  bot: string
  level: Level
  mood: Mood
  /** 週報用：單欄、自動高度。 */
  wide?: boolean
  children?: ReactNode
}

export function MemeCard({
  tone = 'olive', tag, top, big, number, total, bot, level, mood, wide = false, children,
}: MemeCardProps) {
  return (
    <div className={`meme ${tone}${wide ? ' wide' : ''}${number !== undefined ? ' counting' : ''}${number === 0 ? ' released' : ''}`} data-testid="meme" data-mood={mood}>
      <span className="tag">{tag}</span>
      <div className="txt">
        <div className="cap top" data-testid="meme-top">{top}</div>
        {number === undefined
          ? (big ? <div className="cap big" data-testid="meme-big">{big}</div> : null)
          : <div key={number} className="num" data-testid="meme-num" role="timer" aria-label={`剩餘 ${number}`}>{number}</div>}
        {children}
        <div className="cap bot" data-testid="meme-bot">{bot}</div>
      </div>
      <Avatar className="face" level={level} mood={mood} onDark />
      {number !== undefined && total !== undefined && (
        <div className="count-track" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <i key={i} className={i < number ? 'active' : ''} />)}
        </div>
      )}
    </div>
  )
}

/** 口令卡上的店家資訊列所需的欄位（Order['place'] 的子集）。 */
export interface PlaceMetaInput {
  name: string
  mapUrl?: string
  walkMin?: number
  openUntil?: string
  opensAt?: string
  priceText?: string
  /** Round 3：伺服器算的選店理由，畫成印章（B1：讓發掘被看見）。 */
  mode?: 'new' | 'revisit' | 'wildcard'
  visits?: number
  exhausted?: boolean
}

/** 印章文字：新店說「新據點」、回訪數「第 N 次」、偵察抽到的說「偵察」。附近都去過就說「已全數占領」。 */
export function modeStamp(p: Pick<PlaceMetaInput, 'mode' | 'visits' | 'exhausted'>): string | undefined {
  if (p.exhausted) return '這區已全數占領'
  if (p.mode === 'new') return '新據點'
  if (p.mode === 'wildcard') return '偵察任務'
  if (p.mode === 'revisit') return typeof p.visits === 'number' && p.visits > 1 ? `第 ${p.visits} 次` : '回防'
  return undefined
}

/**
 * T10：一行講完「幾分鐘走到、開到幾點、貴不貴」。每一項都來自 API 當次回傳值（T6），沒有的就不寫，不編。
 * 價位沒資料一律寫「價位未知」，不用空白帶過。
 */
export function formatPlaceMeta(p: PlaceMetaInput): string {
  const bits: string[] = []
  if (typeof p.walkMin === 'number') bits.push(`步行 ${p.walkMin} 分`)
  if (p.opensAt) bits.push(`${p.opensAt} 開`)
  else if (p.openUntil) bits.push(`營業到 ${p.openUntil}`)
  bits.push(p.priceText ?? '價位未知')
  return bits.join(' · ')
}

/**
 * 步驟卡 — 第 9 節：梗圖卡下方白卡，▸ 前綴，無梗。
 * 階段 B：伺服器端比中真實店家時，店名本身就是 Google Maps 連結。
 * 掛在店名上、不另開一顆按鈕——多一顆按鈕就是第二個動作，跟「一個口令一個動作」衝突。
 * 沒有 mapUrl（Places 降級／比不中）就整個店家區（印章、店名、meta、歸屬）都不畫：
 * 不會出現空連結，也不會把模型編的店名顯示出來（R2-01）。
 * Round 3（T10、R3§3.3）：有店就在店名下一行補 place-meta，再下一行標「Google Maps」歸屬。
 * Round 10：歸屬原本在三步驟之後（卡片最後一行），375×667 預設字級就落到第一屏外 11–13px，
 * iOS 預設字級（-apple-system-body 17px）更多；T10 要求不捲動就看得到 → 移到 place-meta 正下方，
 * 跟它標示的 Google 資料放在一起。
 */
export function StepsCard({ steps, place }: { steps: string[]; place?: PlaceMetaInput }) {
  // R2-01：只有伺服器真的比中店（有 mapUrl）才畫店家區。沒有 mapUrl 的 place 可能是模型編的，不准流到畫面。
  const real = place?.mapUrl ? place : undefined
  const stamp = real ? modeStamp(real) : undefined
  return (
    <div className="steps" data-testid="steps">
      {real && (
        // Team Lead 設計修訂：店家資訊放卡片最上面——「3 秒內知道往哪走」（T10），步驟是第二眼的事。
        <div className="place-head">
          {stamp && <span className="stamp" data-mode={real.exhausted ? 'exhausted' : real.mode} data-testid="mode-stamp">{stamp}</span>}
          <p className="place">
            <a href={real.mapUrl} target="_blank" rel="noopener noreferrer" data-testid="place-link">{real.name}</a>
            <span aria-hidden="true"> ↗</span>
          </p>
          <p className="place-meta" data-testid="place-meta">{formatPlaceMeta(real)}</p>
          <small className="attribution" translate="no" data-testid="attribution">Google Maps</small>
        </div>
      )}
      {steps.map((s, i) => <p key={i}>{s}</p>)}
    </div>
  )
}
