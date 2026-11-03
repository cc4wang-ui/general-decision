import { useState } from 'react'

export type DailyTask = { id: string; title: string; minutes: number; kind: 'gym'|'meal'|'creative'|'shopping'|'rest'; done: boolean; place?: string; detail?: string; locked?: boolean; start?: string; custom?: boolean; variant?: number }
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
    return { ...c, ...previous.get(id), done: previous.get(id)?.done ?? false }
  })
}
export function replanDaily(s: DailyState): DailyState {
  // Keep completed tasks and their state. Only uncompleted tasks are rebuilt.
  const done = s.tasks.filter(t=>t.done || t.locked || t.custom)
  const pending = buildDaily(s).filter(t=>!t.done && !done.some(d=>d.id===t.id))
  return { ...s, tasks: [...done,...pending] }
}
const choices: Record<string, { title: string; place: string; detail: string }[]> = {
 gym: [
 { title:'FIT-EASY｜力量訓練',place:'FIT-EASY 澀谷（固定健身房）',detail:'80 分鐘；熱身 10 分鐘、主訓練 60 分鐘、收操 10 分鐘。以當天恢復狀況決定肌群。'},
 { title:'FIT-EASY｜恢復訓練',place:'FIT-EASY 澀谷（固定健身房）',detail:'60 分鐘；低強度有氧、活動度與核心。'},
 { title:'FIT-EASY｜全身訓練',place:'FIT-EASY 澀谷（固定健身房）',detail:'75 分鐘；深蹲／推／拉各 3–4 組，避免連續兩天重複高強度肌群。'}
 ],
 meal:[
 {title:'日式定食午餐',place:'澀谷站周邊',detail:'45 分鐘；選擇有主菜、米飯、蔬菜的定食，實際店名與營業狀態待確認。'},
 {title:'個人涮涮鍋',place:'澀谷站周邊',detail:'60 分鐘；蛋白質優先，實際店名與座位待確認。'},
 {title:'蕎麥麵與小菜',place:'澀谷站周邊',detail:'45 分鐘；清爽午餐，實際店名與營業狀態待確認。'}
 ],
 creative:[
 {title:'當代藝術探索',place:'澀谷／表參道',detail:'65 分鐘；找當日開放的展覽或藝廊，入場條件與票券需確認。'},
 {title:'日本 IP／設計商店觀察',place:'澀谷 PARCO 周邊',detail:'60 分鐘；觀察 IP 商品、陳列與客群，實際活動需確認。'},
 {title:'城市攝影散步',place:'宮下公園周邊',detail:'60 分鐘；拍攝 5 個設計細節，不依賴展覽開放時間。'}
 ],
 coffee:[
 {title:'安靜咖啡與閱讀',place:'澀谷／富ヶ谷',detail:'60 分鐘；閱讀 30 分鐘，記錄 3 個觀察；座位與筆電規範需確認。'},
 {title:'手沖咖啡巡禮',place:'富ヶ谷',detail:'60 分鐘；試一種未喝過的豆子，店家營業需確認。'},
 {title:'甜點與短篇閱讀',place:'代官山',detail:'60 分鐘；不處理工作，店家營業需確認。'}
 ],
 shopping:[
 {title:'運動與生活用品採買',place:'澀谷站周邊',detail:'55 分鐘；長袖訓練衣、單水肌酸或生活用品；現場庫存需確認。'},
 {title:'藥妝店採買',place:'宮下公園／澀谷站周邊',detail:'40 分鐘；詢問純クレアチン モノハイドレート；不可把 BCAA 當替代品，庫存需確認。'},
 {title:'設計雜貨探索',place:'澀谷 PARCO 周邊',detail:'50 分鐘；只買確實需要的物品，營業需確認。'}
 ],
 rest:[
 {title:'回家休息與晚餐',place:'澀谷住處周邊',detail:'75 分鐘；休息、洗澡、吃晚餐。'},
 {title:'傍晚慢走與晚餐',place:'澀谷住處周邊',detail:'75 分鐘；散步後吃飯，避免無必要轉乘。'},
 {title:'居家放鬆',place:'澀谷住處',detail:'75 分鐘；晚餐與閱讀，不安排額外工作。'}
 ]
}
export function shuffleTask(s: DailyState, id: string): DailyState {
 return { ...s, tasks:s.tasks.map(t=>{
  if(t.id!==id || t.done || t.locked) return t
  const options=choices[id]
  if(!options?.length) return t
  const next=((t.variant ?? -1)+1)%options.length
  return {...t,...options[next],variant:next}
 }) }
}
export function addFixedTask(s: DailyState, title: string, place: string, start: string, minutes: number): DailyState {
 if(!title.trim() || !place.trim() || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(start) || !Number.isFinite(minutes) || minutes<5 || minutes>720) return s
 const task:DailyTask={id:'fixed-'+Date.now()+'-'+s.tasks.length,title:title.trim().slice(0,100),place:place.trim().slice(0,120),start,minutes,kind:'rest',done:false,locked:true,custom:true,detail:'既有固定安排：不會被重排或洗牌。'}
 return {...s,tasks:[...s.tasks,task].sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'))}
}
export function DailyDecision({ onBack }: { onBack: () => void }) {
  const [state,setState] = useState(loadDaily)
  const [feedback,setFeedback] = useState('')
  const [fixedTitle,setFixedTitle] = useState('')
  const [fixedPlace,setFixedPlace] = useState('')
  const [fixedTime,setFixedTime] = useState('15:00')
  const [fixedMinutes,setFixedMinutes] = useState('60')
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
    <div style={{padding:'14px 0',borderBottom:'1px solid #7775'}}>
      <h3>加入既有安排（固定，不會被重排）</h3>
      <input aria-label="既有行程名稱" placeholder="例如：15:00 與朋友見面" value={fixedTitle} onChange={e=>setFixedTitle(e.target.value)} />
      <input aria-label="既有行程地點" placeholder="指定地點／地址" value={fixedPlace} onChange={e=>setFixedPlace(e.target.value)} />
      <label className="lab">開始時間 <input aria-label="開始時間" type="time" value={fixedTime} onChange={e=>setFixedTime(e.target.value)} /></label>
      <label className="lab">分鐘 <input aria-label="行程長度分鐘" type="number" min="5" max="720" value={fixedMinutes} onChange={e=>setFixedMinutes(e.target.value)} /></label>
      <button className="btn" disabled={!fixedTitle.trim()||!fixedPlace.trim()||Number(fixedMinutes)<5||Number(fixedMinutes)>720} onClick={()=>{change(s=>addFixedTask(s,fixedTitle,fixedPlace,fixedTime,Number(fixedMinutes)));setFixedTitle('');setFixedPlace('')}}>加入固定行程</button>
    </div>
    <div className="chips" role="group" aria-label="今日模式">
      <button className="chip" aria-pressed={state.mode==='creative'} onClick={()=>change(s=>replanDaily({...s,mode:'creative'}))}>創意探索</button>
      <button className="chip" aria-pressed={state.mode==='practical'} onClick={()=>change(s=>replanDaily({...s,mode:'practical'}))}>效率採買</button>
    </div>
    <div className="row"><button className="btn" data-testid="daily-generate" onClick={generate}>{state.tasks.length?'重排未完成事項':'生成今日行程'}</button></div>
    <p className="hint">不虛構店家、活動、即時庫存或營業時間；此版為離線決策草案，出發前需查證。</p>
    <div aria-label="今日任務">
      {state.tasks.map((t,i)=><div key={t.id} style={{padding:'12px 0',borderBottom:'1px solid #7775'}}>
        <label><input type="checkbox" checked={t.done} onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,done:e.target.checked}:x)}))} /> {i+1}. {t.title} · {t.minutes} 分</label>
        <p className="hint">{t.start ? '固定時間 '+t.start+' · ' : ''}{t.place || state.area}｜{t.detail || '建議停留時間 '+t.minutes+' 分鐘；尚未確認即時營業資訊'}</p>
        <label className="lab">指定地點 <input aria-label={t.title+' 指定地點'} value={t.place||''} placeholder="輸入地點／地址" onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,place:e.target.value}:x)}))}/></label>
        {t.place && <a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(t.place)} target="_blank" rel="noopener noreferrer">查看地圖 ↗</a>}
        {!t.done && !t.locked && <button className="chip" onClick={()=>change(s=>shuffleTask(s,t.id))}>換這一站 ↻</button>}
        {t.custom && <button className="chip" onClick={()=>change(s=>({...s,tasks:s.tasks.filter(x=>x.id!==t.id)}))}>移除安排</button>}
        {!t.done && !t.locked && <button className="chip" style={{marginLeft:8}} onClick={()=>change(s=>replanDaily({...s,avoid:[...new Set([...s.avoid,t.id])]}))}>今天略過</button>}
      </div>)}
    </div>
    <p className="lab">修正偏好（會保留供下次使用）</p>
    <div className="manual-in"><input aria-label="補充偏好" value={feedback} maxLength={160} placeholder="例如：不要再推薦新宿；我已經買到肌酸" onChange={e=>setFeedback(e.target.value)} /><button className="btn" onClick={addFeedback} disabled={!feedback.trim()}>記住</button></div>
    <details><summary>已記住的偏好</summary>{state.notes.map((n,i)=><p key={i}>{n}</p>)}</details>
    <p className="hint">目前偏好僅存在此瀏覽器，不跨裝置同步；沒有連接 ChatGPT 對話記憶。</p>
  </section>
}
