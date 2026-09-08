import { record, uuid, validDate, type PlanningContext, type Row } from './planning-contract.ts'
export type CalibrationSettings = { enabled: boolean; excluded_event_ids: string[]; corrections: {event_id:string;actual_minutes:number;reason:string}[] }
export const defaultCalibrationSettings = (): CalibrationSettings => ({enabled:true,excluded_event_ids:[],corrections:[]})
export function parseSettings(v: unknown): CalibrationSettings | null {
  if (!record(v) || Object.keys(v).some(k=>!['enabled','excluded_event_ids','corrections'].includes(k)) || typeof v.enabled !== 'boolean' ||
      !Array.isArray(v.excluded_event_ids) || v.excluded_event_ids.length>500 || !v.excluded_event_ids.every(x=>typeof x==='string'&&uuid.test(x)) ||
      new Set(v.excluded_event_ids).size!==v.excluded_event_ids.length || !Array.isArray(v.corrections) || v.corrections.length>500) return null
  const seen=new Set<string>()
  for(const c of v.corrections) {
    if(!record(c)||Object.keys(c).some(k=>!['event_id','actual_minutes','reason'].includes(k))||typeof c.event_id!=='string'||!uuid.test(c.event_id)||seen.has(c.event_id)||
      typeof c.actual_minutes!=='number'||!Number.isInteger(c.actual_minutes)||c.actual_minutes<0||c.actual_minutes>100000||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>500)return null
    seen.add(c.event_id)
  }
  return v as CalibrationSettings
}
export type HistoryRequest = {operation:'get_execution_history'|'get_calibration';plan_date:string} | {operation:'set_calibration_settings';plan_date:string;expected_token:string;settings:CalibrationSettings}
export function parseHistoryRequest(v: unknown): HistoryRequest | null {
  if(!record(v)||!validDate(v.plan_date))return null
  if(['get_execution_history','get_calibration'].includes(String(v.operation)))return Object.keys(v).every(k=>['operation','plan_date'].includes(k))?v as HistoryRequest:null
  if(v.operation!=='set_calibration_settings'||Object.keys(v).some(k=>!['operation','plan_date','expected_token','settings'].includes(k))||
    typeof v.expected_token!=='string'||!/^[a-f0-9]{64}$/.test(v.expected_token)||!parseSettings(v.settings))return null
  return v as HistoryRequest
}
const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return s.length?s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2:null}
export function calculateCalibration(c: PlanningContext) {
  const settings=parseSettings(c.preferences.calibration)??defaultCalibrationSettings()
  const samples:{task_id:string;root_item_id:string;event_ids:string[];planned_minutes:number;actual_minutes:number;ratio:number}[]=[]
  const excluded=new Set(settings.excluded_event_ids), overrides=new Map(settings.corrections.map(x=>[x.event_id,x.actual_minutes]))
  const effective=(e:Row)=>overrides.get(String(e.id))??(typeof e.actual_minutes==='number'?e.actual_minutes:null)
  const byTask=new Map<string,Row[]>(),days=new Map<string,{minutes:number;event_ids:string[]}>()
  const events=[...new Map(c.events.map(e=>[e.id,e])).values()].sort((a,b)=>String(a.occurred_at).localeCompare(String(b.occurred_at))||String(a.id).localeCompare(String(b.id)))
  if(settings.enabled) for(const e of events){
    if(!['partial','done','reopened'].includes(String(e.event_type)))continue
    const task=String(e.task_id)
    if(e.event_type==='reopened'){byTask.set(task,[]);continue}
    const list=byTask.get(task)??[];list.push(e);byTask.set(task,list)
    const actual=effective(e)
    if(!excluded.has(String(e.id))&&actual!==null){
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:c.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(String(e.occurred_at)))
      const day=days.get(date)??{minutes:0,event_ids:[]};day.minutes+=actual;day.event_ids.push(String(e.id));days.set(date,day)
    }
    if(e.event_type!=='done')continue
    let root=c.items.find(i=>i.id===list[0].plan_item_id)
    const visited=new Set<unknown>()
    while(root?.carryover_from_item_id&&!visited.has(root.id)){visited.add(root.id);root=c.items.find(i=>i.id===root!.carryover_from_item_id)}
    if(root&&typeof root.planned_minutes==='number'&&root.planned_minutes>0&&list.every(x=>!excluded.has(String(x.id))&&effective(x)!==null)){
      const minutes=list.reduce((s,x)=>s+effective(x)!,0)
      samples.push({task_id:task,root_item_id:String(root.id),event_ids:list.map(x=>String(x.id)),planned_minutes:root.planned_minutes,actual_minutes:minutes,ratio:minutes/root.planned_minutes})
    }
    byTask.set(task,[])
  }
  return {version:'taskring.calibration.v0.1',enabled:settings.enabled,window_days:30,sample_count:samples.length,
    duration_ratio:samples.length>=3?median(samples.map(s=>s.ratio)):null,
    observed_daily_minutes_median:days.size>=3?median([...days.values()].map(d=>d.minutes)):null,
    records:events.filter(e=>['partial','done'].includes(String(e.event_type))).map(e=>({event_id:String(e.id),task_title:String(c.tasks.find(t=>t.id===e.task_id)?.title??'Historical task'),occurred_at:String(e.occurred_at),recorded_minutes:typeof e.actual_minutes==='number'?e.actual_minutes:null,effective_minutes:effective(e),excluded:excluded.has(String(e.id))})),
    evidence:samples,observed_days:[...days].map(([date,d])=>({date,...d})),
    explanation:settings.enabled?'Median actual / original planned minutes, only complete recorded episodes; minimum three samples. Daily recorded minutes are an observed lower bound, not a capacity recommendation. Partial and done durations are incremental, not cumulative. Missing history never becomes zero.':'Derived calibration is disabled; no signals computed. Raw history remains authoritative.',
    settings}
}
