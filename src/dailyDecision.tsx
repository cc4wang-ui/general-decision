import { useState } from 'react'

export type DailyTask = { id: string; title: string; minutes: number; kind: 'gym'|'meal'|'creative'|'shopping'|'rest'; done: boolean }
export type DailyState = {
  day: string; area: string; currentPlace: string; mode: 'creative'|'practical'
  tasks: DailyTask[]; notes: string[]; avoid: string[]
}
const KEY = 'decide.daily.v1'
const dayInTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
const defaults = (): DailyState => ({
  day: dayInTokyo(), area: '澀谷', currentPlace: '澀谷住處', mode: 'creative',
  tasks: [], notes: ['固定健身房：FIT-EASY；不推薦其他付費健身房', '以澀谷為生活基地，避免不必要跨區', '偏好安靜咖啡廳、日式定食、藝術與日本 IP'], avoid: []
})
export function loadDaily(): DailyState {
  const fresh = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<DailyState> | null
    if (!raw || !Array.isArray(raw.notes) || !Array.isArray(raw.tasks)) return fresh
    return { ...fresh, ...raw, day: fresh.day, tasks: raw.day === fresh.day ? raw.tasks.filter(t => typeof t.id === 'string') : [], notes: raw.notes.slice(0,20), avoid: Array.isArray(raw.avoid) ? raw.avoid.slice(0,20) : [] }
  } catch { return fresh }
}
export function saveDaily(s: DailyState): void { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }
const catalog: Omit<DailyTask,'done'>[] = [
  { id:'gym', title:'FIT-EASY｜80 分鐘力量訓練', minutes:80, kind:'gym' },
  { id:'meal', title:'澀谷｜一人友善的日式定食', minutes:45, kind:'meal' },
  { id:'creative', title:'澀谷｜藝術展／日本 IP 快閃探索（出發前查活動與營業）', minutes:65, kind:'creative' },
  { id:'coffee', title:'安靜咖啡廳｜閱讀、寫下 3 個新觀察', minutes:60, kind:'creative' },
  { id:'shopping', title:'澀谷｜運動長袖、純單水肌酸或生活用品（先查庫存）', minutes:55, kind:'shopping' },
  { id:'rest', title:'散步回家、休息與晚餐', minutes:75, kind:'rest' },
]
export function buildDaily(s: DailyState): DailyTask[] {
  const previous = new Map(s.tasks.map(t=>[t.id,t]))
  const order = s.mode === 'creative' ? ['gym','meal','creative','coffee','shopping','rest'] : ['gym','meal','shopping','coffee','rest']
  return order.filter(id=>!s.avoid.includes(id)).map(id=>{
    const c = catalog.find(t=>t.id===id)!
    return { ...c, done: previous.get(id)?.done ?? false }
  })
}
export function replanDaily(s: DailyState): DailyState {
  // Keep completed tasks and their state. Only uncompleted tasks are rebuilt.
  const done = s.tasks.filter(t=>t.done)
  const pending = buildDaily(s).filter(t=>!t.done && !done.some(d=>d.id===t.id))
  return { ...s, tasks: [...done,...pending] }
}
export function DailyDecision({ onBack }: { onBack: () => void }) {
  const [state,setState] = useState(loadDaily)
  const [feedback,setFeedback] = useState('')
  const change = (fn:(s:DailyState)=>DailyState) => setState(s=>{ const next=fn(s); saveDaily(next); return next })
  const generate = () => change(s=>replanDaily(s))
  const addFeedback = () => {
    const v=feedback.trim()
    if(!v) return
    change(s=>({ ...s, notes:[...s.notes,v].slice(-20) }))
    setFeedback('')
  }
  return <section className="screen" data-screen="daily-decision" style={{paddingBottom:40}}>
    <button className="back" onClick={onBack}>← 回報告</button>
    <h2>今日決策</h2>
    <p className="hint">少問問題，直接執行。固定偏好保留在此裝置；今日行程每天重置。</p>
    <label className="lab" htmlFor="daily-location">現在在哪裡？</label>
    <input id="daily-location" aria-label="目前位置" value={state.currentPlace} onChange={e=>change(s=>({...s,currentPlace:e.target.value.slice(0,80)}))} />
    <p className="hint">目前位置：{state.currentPlace || state.area}。這是手動輸入，不代表已取得 GPS。</p>
    <div className="chips" role="group" aria-label="今日模式">
      <button className="chip" aria-pressed={state.mode==='creative'} onClick={()=>change(s=>replanDaily({...s,mode:'creative'}))}>創意探索</button>
      <button className="chip" aria-pressed={state.mode==='practical'} onClick={()=>change(s=>replanDaily({...s,mode:'practical'}))}>效率採買</button>
    </div>
    <div className="row"><button className="btn" data-testid="daily-generate" onClick={generate}>{state.tasks.length?'重排未完成事項':'生成今日行程'}</button></div>
    <p className="hint">不虛構店家、活動、即時庫存或營業時間；此版為離線決策草案，出發前需查證。</p>
    <div aria-label="今日任務">
      {state.tasks.map((t,i)=><div key={t.id} style={{padding:'12px 0',borderBottom:'1px solid #7775'}}>
        <label><input type="checkbox" checked={t.done} onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,done:e.target.checked}:x)}))} /> {i+1}. {t.title} · {t.minutes} 分</label>
        {!t.done && <button className="chip" style={{marginLeft:8}} onClick={()=>change(s=>replanDaily({...s,avoid:[...new Set([...s.avoid,t.id])]}))}>今天略過</button>}
      </div>)}
    </div>
    <p className="lab">修正偏好（會保留供下次使用）</p>
    <div className="manual-in"><input aria-label="補充偏好" value={feedback} maxLength={160} placeholder="例如：不要再推薦新宿；我已經買到肌酸" onChange={e=>setFeedback(e.target.value)} /><button className="btn" onClick={addFeedback} disabled={!feedback.trim()}>記住</button></div>
    <details><summary>已記住的偏好</summary>{state.notes.map((n,i)=><p key={i}>{n}</p>)}</details>
    <p className="hint">目前偏好僅存在此瀏覽器，不跨裝置同步；沒有連接 ChatGPT 對話記憶。</p>
  </section>
}
