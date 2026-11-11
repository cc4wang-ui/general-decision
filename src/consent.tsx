// 首次同意畫面（App Store 5.1.2(i)；DEV-PLAN-3 W3）。
// 元件本身不碰 storage：寫入 decide.consent 由呼叫端在 onAccept 裡做（key 與版本見下面兩個常數）。
// Round 3 設計修訂（Team Lead）：這是新使用者看到的第一屏，先講「這是什麼、為什麼值得用」，再講三件資料的去向。
// 揭露本文仍是白話、法務看得懂（對象、內容、存哪）；班長口吻只放在開頭一句。
import { Avatar } from './avatar.tsx'
import type { Level } from './types.ts'

export const CONSENT_KEY = 'decide.consent'
export const CONSENT_VERSION = 'v1'

/** 第一屏的產品承諾（不是人設台詞，是使用者為什麼要留下來）。 */
export const CONSENT_PITCH = {
  title: '報告班長',
  line: '吃什麼、去哪喝一杯，班長一次只給一個答案。',
  sub: '而且記得你去過哪裡——每次都派你去沒去過的好店。',
}

/** 開頭一句（依班長火力）。只有這一句帶人設，揭露本文不帶。 */
export const CONSENT_LEAD: Record<Level, string> = {
  0: '報、報告！下令之前，先把三件事講清楚。',
  1: '你各位聽好。下令之前，三件事先交代。',
  2: '站好。三件事，聽完才開始。',
}

/** 三項揭露。導出給測試與 Privacy 對照用，改字請連同 privacy.tsx 一起看。 */
export const CONSENT_ITEMS: readonly { label: string; text: string }[] = [
  {
    label: '位置 → Google',
    text: '查附近的店時，位置會送到 Google 地圖。不想給，手動報個車站或地標也行。',
  },
  {
    label: '選擇 → Anthropic',
    text: '你選的忌口、預算和班長的記憶（只有店家代碼和時間，沒有店名、沒有位置）用來挑店，伺服器不留存；挑好的店與近 7 天的口令交給 Anthropic 的 AI 寫成口令。',
  },
  {
    label: '日記與記憶 → 只在這支手機',
    text: '去過哪些店、你的偏好，只存在這支手機。沒有帳號，伺服器不留你的資料。',
  },
]

export const CONSENT_CLOSING = '按「是！班長」代表同意以上三項。想反悔，清除這個網站的資料就全部歸零。'
export const CONSENT_DECLINE = '不同意？直接關掉就好，班長不勉強。'

export function Consent({ level, onAccept, onPrivacy }: {
  level: Level
  onAccept: () => void
  /** 選配：點「看完整隱私說明」。沒給就不顯示這顆鍵。 */
  onPrivacy?: () => void
}) {
  return (
    <section className="screen consent" data-screen="consent">
      <header className="consent-hero">
        <Avatar className="av" level={level} mood="soft" />
        <div>
          <h1>{CONSENT_PITCH.title}</h1>
          <p>{CONSENT_PITCH.line}</p>
          <small>{CONSENT_PITCH.sub}</small>
        </div>
      </header>
      <div className="consent-body" data-testid="consent">
        <p className="consent-lead">{CONSENT_LEAD[level]}</p>
        <ol className="consent-list">
          {CONSENT_ITEMS.map((it) => (
            <li key={it.label}><b>{it.label}</b><span>{it.text}</span></li>
          ))}
        </ol>
        <small>{CONSENT_CLOSING}</small>
      </div>
      <div className="row">
        <button className="btn" data-testid="consent-accept" onClick={onAccept}>是！班長</button>
      </div>
      <p className="hint consent-foot">
        {CONSENT_DECLINE}
        {onPrivacy && <button className="linkish" data-testid="consent-privacy" onClick={onPrivacy}>看完整隱私說明</button>}
      </p>
    </section>
  )
}
