/** Isolated review harness. No API keys or live API calls. Production index.html never imports this file. */
import { useRef, useState } from 'react'
import { renderShareCard } from '../src/share.ts'
import { createRoot } from 'react-dom/client'
import { App, Intake, Cmd, LogScreen, Stand, Diary, Weekly } from '../src/app.tsx'
import { MemeCard } from '../src/meme.tsx'
import { CARD_BY_ID } from '../src/cards.ts'
import { OFFICER_BY_LEVEL } from '../src/officers.ts'
import { enforceRules, lightsOut } from '../src/rules.ts'
import type { Level, OrderRequest } from '../src/types.ts'
import { MOD } from './mock-source.ts'
import { EAT, BUY, WEEKLY } from './fixtures.ts'
import '../src/styles.css'
import './themes.css'
const params = new URLSearchParams(location.search)
const theme=params.get('theme');if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme
if(params.get('large')==='1')document.documentElement.style.fontSize='32px'
const initialLevel=Number(params.get('level')||1) as Level
const screen=params.get('screen')||'home'
if(params.has('level'))localStorage.setItem('decide.level',String(initialLevel))
const nativeFetch=window.fetch.bind(window)
window.fetch=async (input, init)=>{
  const url=typeof input==='string'?input:input instanceof Request?input.url:input.href
  if(url.includes('/api/weekly'))return new Response(JSON.stringify(WEEKLY),{headers:{'Content-Type':'application/json'}})
  if(url.includes('/api/order')){
    const req=JSON.parse(String(init?.body||'{}')) as OrderRequest
    const m=MOD[req.module];const level=req.level
    let order={verdict:m.stop?'stop' as const:'do' as const,meme:{top:m.top[level],big:m.big,bot:m.bot[level]},steps:[...m.steps],log:m.log.replace(/<br>/g,'，')}
    // This old mock contains one bark in steps; use the clean dress-code value in the locked spec.
    if(req.module==='attend')order.steps=['19:00 到，不早不晚。','smart casual。','90 分鐘，可以走。']
    if(req.module==='eat')order={...EAT,meme:{...EAT.meme,top:m.top[level],bot:m.bot[level]}}
    let corrected=enforceRules(order, req.module,req.choices,new Date(req.now),req.recentOrders)
    if(req.module==='sleep')corrected={...corrected,meme:{...corrected.meme,big:lightsOut(String(req.choices.wake))+' 熄燈'}}
    if(req.module==='attend' && corrected.verdict==='stop')corrected={...corrected,meme:{...corrected.meme,big:'不去。'},steps:['傳一句話給對方。']}
    if(req.exclude?.length)corrected={...corrected,meme:{top:'店關了不是你的錯',big:'巷口牛肉麵',bot:'第二道口令一樣算'},place:{id:'p2',name:'巷口牛肉麵',walkMin:3},steps:['步行 3 分鐘，營業中。','清燉，不加辣。'],log:'13:05 牛肉麵，13:22 完成。'}
    return new Response(JSON.stringify(corrected),{headers:{'Content-Type':'application/json'}})
  }
  return nativeFetch(input,init)
}
// Fixed demo coordinates from existing screenshot fixture; never requests device location.
Object.defineProperty(navigator.geolocation,'getCurrentPosition',{configurable:true,value:(success:PositionCallback)=>success({coords:{latitude:25.033,longitude:121.5654,accuracy:1,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()})})
function ShareProof(){
 const ref=useRef<HTMLDivElement>(null)
 const [src,setSrc]=useState('')
 const [error,setError]=useState('')
 const long=params.get('long')==='1'
 const log=params.get('screen')==='log'
 const order=log?{top:'登記',big:long?'12:41 完成今日指定的午餐與步行任務，12:58 回報。':EAT.log,bot:'雄壯！威武！'}:long?{top:'這是一段很長的上標很長很長',big:'超級無敵長的店名要換行測試用',bot:'下標也很長很長很長很長很長'}:EAT.meme
 return <main data-level={initialLevel}><section className="screen" data-screen={log?'log':'cmd'}><div ref={ref}><MemeCard tone={log?'ok':'olive'} tag="決斷連 · 一個口令一個動作" {...order} level={initialLevel} mood={log?'praise':'bark'}/></div><button className="btn" onClick={async()=>{try{setSrc(await renderShareCard(ref.current!.querySelector('.meme')!))}catch(e){setError(String(e))}}}>產生分享圖片</button>{error&&<p role="alert">{error}</p>}{src&&<img data-testid="share-export" src={src} alt="分享輸出" style={{width:'100%'}}/>}</section></main>
}
function Review(){
 const level=initialLevel
 const [choices,setChoices]=useState<Record<string,string|number>>({occasion:'飯局',stars:4})
 const [next,setNext]=useState(screen)
 if(params.get('export')==='1')return <ShareProof/>
 const o=params.get('long')==='1'?{...EAT,meme:{top:'這是一段很長的上標很長很長',big:'超級無敵長的店名要換行測試用',bot:'下標也很長很長很長很長很長'}}:EAT
 const home=()=>setNext('home')
 if(next==='play'||next==='home')return <App/>
 return <><main data-level={level}>

 {next==='intake'&&<Intake card={CARD_BY_ID.attend} level={level} choices={choices} onChange={(k,v)=>setChoices({...choices,[k]:v})} onBack={home} onSubmit={()=>setNext('cmd')}/>}
 {(next==='cmd'||next==='stop')&&<Cmd card={next==='stop'?CARD_BY_ID.buy:CARD_BY_ID.eat} level={level} order={next==='stop'?BUY:o} geoDenied={false} canReissue={next==='cmd'} onDone={()=>setNext('log')} onReissue={()=>setNext('intake')} onSkip={()=>setNext('stand')}/>}
 {next==='log'&&<LogScreen level={level} order={o} onHome={home}/>}
 {next==='stand'&&<Stand level={level} onDone={home}/>}
 {next==='release'&&<section className="screen" data-screen="stand"><MemeCard tone="olive" tag="決斷連 · 違紀登記" top={`${OFFICER_BY_LEVEL[level].punishment.action}，${OFFICER_BY_LEVEL[level].punishment.countLabel}！數給我聽！`} number={0} total={OFFICER_BY_LEVEL[level].punishment.count} bot={OFFICER_BY_LEVEL[level].punishment.line} level={level} mood="idle"/></section>}
 {next==='empty'&&<Diary level={level} entries={[]} weeklyFailed={false} onBack={home} onWeekly={()=>setNext('weekly')}/>}
 {next==='weekly'&&<Weekly level={level} report={WEEKLY} failed={false} onBack={()=>setNext('empty')} onHome={home}/>}
 </main><footer>班長有什麼了不起？— 你小學當的那個不算。</footer></>
}
createRoot(document.getElementById('root')!).render(<Review/> )

setTimeout(()=>{document.documentElement.dataset.ready='true'},350)
