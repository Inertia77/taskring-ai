import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { planningContext, contextToken } from './planning-service.ts'
import { calculateCalibration, type HistoryRequest } from './calibration.ts'
export async function handleHistory(db:SupabaseClient,userId:string,command:HistoryRequest){
  const fail=(status:number,code:string)=>({status,body:{ok:false,error:{code,message:'Reload history before retrying.'}}})
  try{
    const c=await planningContext(db,command.plan_date)
    const settingsToken=await contextToken({...c,tasks:[],projects:[],constraints:[],plans:[],items:[],events:[],feedback:[]})
    if(command.operation==='get_execution_history')return{status:200,body:{ok:true,result:{timezone:c.timezone,window_days:30,plans:c.plans,items:c.items,events:c.events,feedback:c.feedback}}}
    if(command.operation==='get_calibration')return{status:200,body:{ok:true,result:{calibration:calculateCalibration(c),settings_token:settingsToken,plan_revisions:c.plans.map(p=>({...p,items:c.items.filter(i=>i.plan_id===p.id)}))}}}
    if(command.expected_token!==settingsToken)return fail(409,'SETTINGS_CHANGED')
    const refs=[...command.settings.excluded_event_ids,...command.settings.corrections.map(x=>x.event_id)]
    // Existing older settings may be retained. Newly supplied evidence must be visible in the bounded caller history.
    const current=calculateCalibration(c).settings
    const old=new Set([...current.excluded_event_ids,...current.corrections.map(x=>x.event_id)])
    if(refs.some(id=>!old.has(id)&&!c.events.some(e=>e.id===id)))return fail(422,'EVIDENCE_UNAVAILABLE')
    const preferences={...c.preferences,calibration:command.settings}
    const profile=await db.from('profiles').select('user_id').eq('user_id',userId).maybeSingle()
    if(profile.error)return fail(503,'HISTORY_UNAVAILABLE')
    const result=profile.data?await db.from('profiles').update({planning_preferences:preferences}).eq('user_id',userId)
      .eq('planning_preferences',JSON.stringify(c.preferences)).select('user_id').maybeSingle():await db.from('profiles').insert({user_id:userId,planning_preferences:preferences}).select('user_id').single()
    if(result.error||!result.data)return fail(409,'SETTINGS_CHANGED')
    return{status:200,body:{ok:true,result:{saved:true}}}
  }catch{return fail(503,'HISTORY_UNAVAILABLE')}
}
