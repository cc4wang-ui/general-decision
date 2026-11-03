import { useState } from 'react'
import './dailyDecision.css'

export type DailyTask = { id: string; title: string; minutes: number; kind: 'gym'|'meal'|'creative'|'shopping'|'rest'; done: boolean; place?: string; detail?: string; locked?: boolean; start?: string; custom?: boolean; variant?: number; candidate?: {id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean}; eta?:string;departure?:string;travelMin?:number;conflict?:string }
export type DailyState = {
  day: string; area: string; currentPlace: string; mode: 'creative'|'practical'
  tasks: DailyTask[]; notes: string[]; avoid: string[]
}
const KEY = 'decide.daily.v1'
const dayInTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
const defaults = (): DailyState => ({
  day: dayInTokyo(), area: '澀谷', currentPlace: '渋谷駅', mode: 'creative',
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
  const [busy,setBusy] = useState<string | null>(null)
  const [status,setStatus] = useState('')
  const [routeKm,setRouteKm] = useState<number | null>(null)
  const [travelMin,setTravelMin] = useState<number | null>(null)
  const [conflicts,setConflicts] = useState<string[]>([])
  const [fixedTitle,setFixedTitle] = useState('')
  const [fixedPlace,setFixedPlace] = useState('')
  const [fixedTime,setFixedTime] = useState('15:00')
  const [fixedMinutes,setFixedMinutes] = useState('60')
  const change = (fn:(s:DailyState)=>DailyState) => setState(s=>{ const next=fn(s); saveDaily(next); return next })
  const searchRoute = async (shuffle?:string) => {
    if(busy)return
    const proposed=state.tasks.length?replanDaily(state):{...state,tasks:buildDaily(state)}
    setBusy(shuffle??'all');setStatus('正在搜尋真實店家並優化路線…')
    try {
      const response=await fetch('/api/daily-route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({location:state.currentPlace,stops:proposed.tasks,shuffle,exclude:shuffle?proposed.tasks.filter(t=>t.id!==shuffle).map(t=>t.candidate?.id).filter(Boolean):[]})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.message??'搜尋失敗')
      change(old=>({...old,tasks:data.stops}))
      setRouteKm(data.distanceKm)
      setTravelMin(data.travelMinutes)
      setConflicts(data.conflicts??[])
      setStatus('已依 Google Routes 步行時間更新路線'+(data.conflicts?.length?'；有固定行程衝突':''))
    }catch(e){setStatus('無法更新：'+(e instanceof Error?e.message:'未知錯誤')+'；原行程已保留')}
    finally{setBusy(null)}
  }
  const generate = () => {void searchRoute()}
  const addFeedback = () => {
    const v=feedback.trim()
    if(!v) return
    change(s=>({ ...s, notes:[...s.notes,v].slice(-20) }))
    setFeedback('')
  }
  const completed=state.tasks.filter(t=>t.done).length
  return <section className="screen dd" data-screen="daily-decision">
    <header className="dd-header">
      <button className="dd-back" onClick={onBack} aria-label="返回">← 返回</button>
      <span className="dd-brand">GENERAL DECISION / DAILY</span>
    </header>
    <div className="dd-shell">
      <div className="dd-hero">
        <div className="dd-eyebrow">{state.day} · TOKYO TIME</div>
        <h1>今天，<em>換個節奏。</em></h1>
        <p>把時間留給值得做的事。先排好，再依心情調整。</p>
        <div className="dd-progress"><span>{completed} / {state.tasks.length} 已完成</span><div className="dd-meter"><i style={{width:state.tasks.length?completed/state.tasks.length*100+'%':'0%'}}/></div></div>
      </div>
      <div className="dd-columns">
        <aside className="dd-panel">
          <div className="dd-panel-title"><span>01 / 今日設定</span><span>PERSONALIZE</span></div>
          <label htmlFor="daily-location">目前位置</label>
          <input id="daily-location" aria-label="目前位置" value={state.currentPlace} onChange={e=>change(s=>({...s,currentPlace:e.target.value.slice(0,80)}))} placeholder="例如：宮下公園" />
          <small>預設以澀谷站為出發點；可改成你現在的確切地點。未使用 GPS。</small>
          <label>今天想怎麼過？</label>
          <div className="dd-mode" role="group" aria-label="今日模式">
            <button aria-pressed={state.mode==='creative'} onClick={()=>change(s=>replanDaily({...s,mode:'creative'}))}>✦ 創意探索</button>
            <button aria-pressed={state.mode==='practical'} onClick={()=>change(s=>replanDaily({...s,mode:'practical'}))}>◈ 效率採買</button>
          </div>
          <button className="dd-primary" data-testid="daily-generate" disabled={busy!==null} onClick={generate}>{busy?'搜尋中…':state.tasks.length?'↻ 搜尋店家並優化路線':'✦ 搜尋店家並生成路線'}</button>
          <p className="dd-live-status" role="status" aria-live="polite">{status||"搜尋將使用 Google Places 與 Google Routes"}</p>
          {conflicts.length>0&&<div className="dd-conflicts" role="alert">{conflicts.map((c,i)=><p key={i}>⚠ {c}</p>)}</div>}
          <details className="dd-details">
            <summary>＋ 加入已安排的行程</summary>
            <div className="dd-form">
              <label>行程名稱<input aria-label="既有行程名稱" placeholder="例如：與朋友見面" value={fixedTitle} onChange={e=>setFixedTitle(e.target.value)}/></label>
              <label>地點<input aria-label="既有行程地點" placeholder="例如：吉祥寺" value={fixedPlace} onChange={e=>setFixedPlace(e.target.value)}/></label>
              <div className="dd-form-row">
                <label>開始時間<input aria-label="開始時間" type="time" value={fixedTime} onChange={e=>setFixedTime(e.target.value)}/></label>
                <label>分鐘<input aria-label="行程長度分鐘" type="number" min="5" max="720" value={fixedMinutes} onChange={e=>setFixedMinutes(e.target.value)}/></label>
              </div>
              <button className="dd-secondary" disabled={!fixedTitle.trim()||!fixedPlace.trim()||Number(fixedMinutes)<5||Number(fixedMinutes)>720} onClick={()=>{change(s=>addFixedTask(s,fixedTitle,fixedPlace,fixedTime,Number(fixedMinutes)));setFixedTitle('');setFixedPlace('')}}>加入固定行程</button>
            </div>
          </details>
          <details className="dd-details">
            <summary>＋ 記住我的偏好</summary>
            <div className="dd-form">
              <textarea aria-label="補充偏好" value={feedback} maxLength={160} rows={3} placeholder="例如：不要推薦跨區的咖啡店" onChange={e=>setFeedback(e.target.value)}/>
              <button className="dd-secondary" onClick={addFeedback} disabled={!feedback.trim()}>儲存偏好</button>
              <div className="dd-notes">{state.notes.map((n,i)=><p key={i}>· {n}</p>)}</div>
            </div>
          </details>
        </aside>
        <main className="dd-itinerary">
          <div className="dd-section-title"><div><span>02 / YOUR DAY</span><h2>今日路線</h2></div><span className="dd-count">{state.tasks.length} STOPS{routeKm!==null?" · "+routeKm+" KM":""}{travelMin!==null?" · 步行 "+travelMin+" MIN":""}</span></div>
          {state.tasks.length===0?<div className="dd-empty"><span>✳</span><h3>今天還沒有行程</h3><p>選擇模式後點「生成今日行程」，讓今天開始。</p></div>:<div className="dd-timeline" aria-label="今日任務">
            {state.tasks.map((t,i)=><article className={'dd-stop'+(t.done?' is-done':'')} key={t.id}>
              <div className="dd-marker"><span>{String(i+1).padStart(2,'0')}</span></div>
              <div className="dd-card">
                <div className="dd-card-top"><span className="dd-kind">{t.locked?'◆ 固定安排':t.kind==='gym'?'● FITNESS':t.kind==='meal'?'● FOOD':t.kind==='creative'?'● DISCOVER':t.kind==='shopping'?'● SHOPPING':'● RESET'}</span><span className="dd-duration">{t.start?t.start+' · ':''}{t.minutes} MIN</span></div>
                <h3>{t.title}</h3>
                {t.eta&&<p className="dd-eta">預計 {t.eta} 抵達 · {t.departure} 離開 · 前往本站步行 {t.travelMin} 分鐘</p>}
                {t.conflict&&<p className="dd-stop-conflict" role="alert">⚠ {t.conflict}</p>}
                <p className="dd-description">{t.detail||'建議停留 '+t.minutes+' 分鐘；實際營業資訊需查證。'}</p>
                {t.candidate&&<div className="dd-place-meta"><strong>{t.candidate.name}</strong><span>{t.candidate.address}</span><span>{typeof t.candidate.rating==='number'?'★ '+t.candidate.rating.toFixed(1)+' · ':''}{t.candidate.openNow===true?'Google 顯示營業中':t.candidate.openNow===false?'Google 顯示目前未營業':'營業狀態未確認'}</span></div>}
                <div className="dd-location"><span>⌖</span><input aria-label={t.title+' 指定地點'} value={t.place||''} placeholder="指定地點或輸入地址" onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,place:e.target.value,candidate:undefined,eta:undefined,departure:undefined,travelMin:undefined,conflict:undefined}:x)}))}/></div>
                <div className="dd-actions">
                  <label className="dd-done"><input type="checkbox" checked={t.done} onChange={e=>change(s=>({...s,tasks:s.tasks.map(x=>x.id===t.id?{...x,done:e.target.checked}:x)}))}/><span>{t.done?'已完成':'完成'}</span></label>
                  {!t.done&&!t.locked&&<button disabled={busy!==null} onClick={()=>{void searchRoute(t.id)}}>{busy===t.id?"搜尋中…":"↻ 換一站"}</button>}
                  {t.place&&<a href={t.candidate?.mapUrl||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(t.place)} target="_blank" rel="noopener noreferrer">↗ 地圖</a>}
                  {t.custom?<button onClick={()=>change(s=>({...s,tasks:s.tasks.filter(x=>x.id!==t.id)}))}>移除</button>:!t.done&&!t.locked?<button className="dd-muted" onClick={()=>change(s=>replanDaily({...s,avoid:[...new Set([...s.avoid,t.id])]}))}>略過</button>:null}
                </div>
              </div>
            </article>)}
          </div>}
          <p className="dd-disclaimer">店家資料來源 Google Places；步行時間由 Google Routes 預估，固定行程衝突會標示；非即時交通保證。庫存與預約尚未驗證。</p>
        </main>
      </div>
    </div>
  </section>
}
