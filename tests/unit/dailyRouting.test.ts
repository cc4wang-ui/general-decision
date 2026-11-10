import {describe,it,expect,vi} from 'vitest'
import type {ScheduledStop} from '../../src/dailyRouting.ts'
import {routesErrorDetail,scheduleRoute,travelMatrix} from '../../src/dailyRouting.ts'
describe('daily route fixed appointments',()=>{
 const stops:ScheduledStop[]=[
  {id:'coffee',title:'Coffee',minutes:30,candidate:{lat:1,lng:1}},
  {id:'fixed',title:'Meeting',minutes:60,start:'15:00',locked:true,candidate:{lat:2,lng:2}},
  {id:'gym',title:'Gym',minutes:80,candidate:{lat:3,lng:3}},
 ]
 const matrix=[[0,10,20,30],[10,0,10,20],[20,10,0,10],[30,20,10,0]]
 const distances=matrix.map(row=>row.map(n=>n/10))
 it('keeps fixed appointment and assigns walking ETAs',()=>{
  const out=scheduleRoute(stops,matrix,distances,'13:00')
  expect(out.stops.map(x=>x.id)).toEqual(['coffee','fixed','gym'])
  expect(out.stops[1]?.eta).toBe('15:00')
  expect(out.travelMinutes).toBe(30)
  expect(out.conflicts).toEqual([])
 })
 it('flags lateness instead of hiding it',()=>{
  const out=scheduleRoute(stops,matrix,distances,'15:00')
  expect(out.conflicts.some(x=>x.includes('晚到'))).toBe(true)
  expect(out.stops.find(x=>x.id==='fixed')?.conflict).toBeTruthy()
 })
})

// Round 11：Routes 403 要分得出「API 沒開」還是「金鑰限制」（Cross 要做的事不一樣）；不含金鑰。
describe('Round 11：Routes 錯誤原因',()=>{
 const disabled={error:{code:403,message:'Routes API has not been used in project 123456789 before or it is disabled.',status:'PERMISSION_DENIED',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'SERVICE_DISABLED',domain:'googleapis.com',metadata:{service:'routes.googleapis.com',consumer:'projects/123456789',activationUrl:'https://console.developers.google.com/apis/api/routes.googleapis.com/overview?project=123456789'}}]}}
 const blocked={error:{code:403,status:'PERMISSION_DENIED',details:[{reason:'API_KEY_SERVICE_BLOCKED',metadata:{service:'routes.googleapis.com',consumer:'projects/123456789'}}]}}
 it('API 沒開：狀態、原因、專案、啟用網址',async()=>{
  const s=await routesErrorDetail(new Response(JSON.stringify(disabled),{status:403}))
  expect(s).toContain('SERVICE_DISABLED');expect(s).toContain('projects/123456789');expect(s).toContain('routes.googleapis.com/overview?project=123456789')
 })
 it('金鑰限制：原因是 API_KEY_SERVICE_BLOCKED',async()=>{
  expect(await routesErrorDetail(new Response(JSON.stringify(blocked),{status:403}))).toBe(' PERMISSION_DENIED API_KEY_SERVICE_BLOCKED projects/123456789')
 })
 it('串流 API 的陣列格式（[{error}]）也解得出原因',async()=>{
  const s=await routesErrorDetail(new Response(JSON.stringify([disabled]),{status:403}))
  expect(s).toContain('SERVICE_DISABLED');expect(s).toContain('projects/123456789')
 })
 it('沒有結構化原因：退回 Google 的說明文字，key= 後面遮掉',async()=>{
  const s=await routesErrorDetail(new Response(JSON.stringify([{error:{code:403,status:'PERMISSION_DENIED',message:'Requests from referer <empty> are blocked. key=AIzaSECRET'}}]),{status:403}))
  expect(s).toBe(' PERMISSION_DENIED Requests from referer <empty> are blocked. key=…')
 })
 it('不是 JSON：留前 160 字、遮掉金鑰樣式；空內容回空字串；都不丟例外',async()=>{
  expect(await routesErrorDetail(new Response('<html>403 Forbidden AIzaSyA1234567890abcdefghijk</html>',{status:403}))).toBe(' <html>403 Forbidden AIza…</html>')
  expect(await routesErrorDetail(new Response('',{status:403}))).toBe('')
 })
 it('travelMatrix 丟出的錯誤帶原因，不帶金鑰',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(disabled),{status:403}))
  await expect(travelMatrix('SECRET-KEY',{lat:35.69,lng:139.7},[{id:'a',candidate:{lat:35.691,lng:139.701}}])).rejects.toThrow(/（403） PERMISSION_DENIED SERVICE_DISABLED/)
  await travelMatrix('SECRET-KEY',{lat:35.69,lng:139.7},[{id:'a',candidate:{lat:35.691,lng:139.701}}]).catch(e=>expect(String(e)).not.toContain('SECRET-KEY'))
  f.mockRestore()
 })
})
