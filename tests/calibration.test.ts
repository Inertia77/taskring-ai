import { expect,it } from 'vitest'
import { calculateCalibration,parseSettings } from '../supabase/functions/secretary-api/calibration'
import type { PlanningContext } from '../supabase/functions/secretary-api/planning-contract'
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`
function context():PlanningContext{return{plan_date:'2026-09-08',timezone:'UTC',workday:true,preferences:{},tasks:[],projects:[],constraints:[],plans:[],feedback:[],items:[1,2,3].map(n=>({id:id(n),task_id:id(n+10),planned_minutes:30})),events:[1,2,3].flatMap(n=>[{id:id(n+20),task_id:id(n+10),plan_item_id:id(n),event_type:'partial',occurred_at:`2026-09-0${n}T10:00:00Z`,actual_minutes:20},{id:id(n+30),task_id:id(n+10),plan_item_id:id(n),event_type:'done',occurred_at:`2026-09-0${n}T11:00:00Z`,actual_minutes:40}])}}
it('derives only supported episodes and deduplicates retry evidence',()=>{
  const c=context();c.events.push(c.events[0]);const result=calculateCalibration(c)
  expect(result.sample_count).toBe(3);expect(result.duration_ratio).toBe(2)
  expect(result.observed_daily_minutes_median).toBe(60)
  expect(result.evidence[0].event_ids).toHaveLength(2)
})
it('missing or excluded effort makes an episode ineligible, never zero effort',()=>{
  const c=context();c.events[0].actual_minutes=null
  expect(calculateCalibration(c).duration_ratio).toBeNull()
  c.preferences.calibration={enabled:true,excluded_event_ids:[id(22)],corrections:[]}
  expect(calculateCalibration(c).sample_count).toBe(1)
})
it('corrections are transparent, reversible and never mutate original events',()=>{
  const c=context();c.preferences.calibration={enabled:true,excluded_event_ids:[],corrections:[{event_id:id(21),actual_minutes:50,reason:'Synthetic stopwatch correction'}]}
  expect(calculateCalibration(c).evidence[0].actual_minutes).toBe(90)
  expect(c.events[0].actual_minutes).toBe(20)
  c.preferences.calibration={enabled:false,excluded_event_ids:[],corrections:[]}
  expect(calculateCalibration(c).sample_count).toBe(0)
  expect(calculateCalibration(c).duration_ratio).toBeNull()
  expect(parseSettings({enabled:true,excluded_event_ids:[],corrections:[{event_id:id(21),actual_minutes:-1,reason:'invalid'}]})).toBeNull()
})
it('links partial effort across revisions to the original planned effort',()=>{
  const c=context();c.items.push({id:id(100),task_id:id(11),planned_minutes:10,carryover_from_item_id:id(1)})
  c.events[1].plan_item_id=id(100)
  const sample=calculateCalibration(c).evidence[0]
  expect(sample.root_item_id).toBe(id(1));expect(sample.planned_minutes).toBe(30);expect(sample.actual_minutes).toBe(60)
})
