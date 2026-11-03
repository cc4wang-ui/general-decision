import {describe,it,expect} from 'vitest'
import {scheduleRoute} from '../../src/dailyRouting.ts'
describe('daily route fixed appointments',()=>{
 const stops=[
  {id:'coffee',title:'Coffee',minutes:30,candidate:{lat:1,lng:1}},
  {id:'fixed',title:'Meeting',minutes:60,start:'15:00',locked:true,candidate:{lat:2,lng:2}},
  {id:'gym',title:'Gym',minutes:80,candidate:{lat:3,lng:3}},
 ]
 const matrix=[[0,10,20,30],[10,0,10,20],[20,10,0,10],[30,20,10,0]]
 const distances=matrix.map(row=>row.map(n=>n/10))
 it('keeps fixed appointment and assigns walking ETAs',()=>{
  const out=scheduleRoute(stops,matrix,distances,'13:00')
  expect(out.stops.map(x=>x.id)).toEqual(['coffee','fixed','gym'])
  expect(out.stops[1].eta).toBe('15:00')
  expect(out.travelMinutes).toBe(30)
  expect(out.conflicts).toEqual([])
 })
 it('flags lateness instead of hiding it',()=>{
  const out=scheduleRoute(stops,matrix,distances,'15:00')
  expect(out.conflicts.some(x=>x.includes('晚到'))).toBe(true)
  expect(out.stops.find(x=>x.id==='fixed')?.conflict).toBeTruthy()
 })
})
