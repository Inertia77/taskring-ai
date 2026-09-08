import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import { runProductionSmoke, type SmokeReport } from './productionSmoke'
import type { CalibrationSettings } from '../../../supabase/functions/secretary-api/calibration'
export const coreSmokeRelease='v1-core-20260908'
const runs=new Map<string,Promise<SmokeReport>>()
export function startCoreSmoke(client:SupabaseClient<Database>,userId:string):Promise<SmokeReport>{
  const key=`taskring-release-check:${coreSmokeRelease}:${userId}`
  const existing=runs.get(key);if(existing)return existing
  const pending=(async()=>{
    const cached=localStorage.getItem(key)
    if(cached){try{const r=JSON.parse(cached) as SmokeReport;if(r.release===coreSmokeRelease&&r.status==='passed')return r}catch{/* Recompute invalid diagnostics. */}}
    const runId=crypto.randomUUID(),taskId=crypto.randomUUID(),partialId=crypto.randomUUID()
    const timestamp=new Date(Date.UTC(2000,0,1)+(parseInt(runId.slice(0,6),16)%500)*7*86400000).toISOString()
    const date=timestamp.slice(0,10)
    const invoke=async(body:Record<string,unknown>):Promise<{status:number;body:Record<string,unknown>} >=>{
      const {data,error}=await client.functions.invoke('secretary-api',{body})
      if(error)return{status:error.context instanceof Response?error.context.status:0,body:{}}
      return{status:data?.result?.created===true||data?.result?.publication?201:200,body:data as Record<string,unknown>}
    }
    const call=async(body:Record<string,unknown>,status=200)=>{
      const r=await invoke(body);if(r.status!==status||r.body.ok!==true)throw new Error('Synthetic acceptance failed')
      return r.body.result as Record<string,unknown>
    }
    const report=await runProductionSmoke(invoke,runId);report.release=coreSmokeRelease
    let current='synthetic_task_resolution',created=false
    const getContext=()=>call({operation:'get_planning_context',plan_date:date})
    const getCalibration=()=>call({operation:'get_calibration',plan_date:date})
    type CalResponse={settings_token:string;calibration:{enabled:boolean;settings:CalibrationSettings;records:{event_id:string;effective_minutes:number|null}[];evidence:{root_item_id:string;actual_minutes:number}[]}}
    try{
      if(report.status!=='passed')throw new Error('Capture checks failed')
      report.status='failed'
      // Refuse to modify any pre-existing plan, including earlier synthetic runs.
      const initial=await getContext()
      if((initial.context as {plans:{plan_date:string}[]}).plans.some(p=>p.plan_date===date))throw new Error('Date already occupied')
      const task=await client.from('tasks').insert({id:taskId,user_id:userId,title:'SYNTHETIC v1 release validation',status:'active',task_kind:'normal',execution_context:'any',estimate_minutes:20,remaining_minutes:20,created_by:'user'}).select('id').single()
      if(task.error)throw new Error('Synthetic task could not be created');created=true
      const accepted=await client.from('inbox_items').update({disposition:'accepted',resolved_at:new Date().toISOString()}).eq('id',runId).eq('disposition','pending').select('id').single()
      if(accepted.error)throw new Error('Synthetic resolution failed')
      const link=await client.from('source_links').insert({user_id:userId,task_id:taskId,source_type:'chat',external_id:runId})
      if(link.error)throw new Error('Synthetic source link failed')
      report.checks.push(current)
      current='planning_context_and_validation'
      const context=await getContext()
      const proposal={plan_date:date,context_token:context.context_token,base_plan_id:null,capacity_minutes:40,buffer_percent:20,buffer_reason:null,brief:'SYNTHETIC acceptance plan on an unused historical date',items:[{task_id:taskId,bucket:'must',start_minute:60,planned_minutes:20,reason:'SYNTHETIC bounded validation',interruptible:false,low_risk:true}]}
      await call({operation:'validate_plan_proposal',proposal});report.checks.push(current)
      current='plan_publication'
      const published=await call({operation:'publish_plan_proposal',proposal},201)
      const plan=(published.publication as {plan_id:string}[])[0]
      const old=(await client.from('daily_plan_items').select('id').eq('plan_id',plan.plan_id).eq('task_id',taskId).single()).data
      if(!old)throw new Error('Synthetic item unavailable');report.checks.push(current)
      current='partial_feedback_and_replay'
      const action={operation:'record_task_action',event_id:partialId,plan_item_id:old.id,expected_state:'planned',action:'partial',occurred_at:`${date}T01:15:00Z`,progress_percent:50,remaining_minutes:10,actual_minutes:12}
      await call(action);await call(action)
      await call({operation:'add_plan_item_feedback',feedback_id:crypto.randomUUID(),plan_item_id:old.id,content:'SYNTHETIC capacity loss; retain only remaining effort.'})
      report.checks.push(current)
      current='replanning_preserves_history'
      const fresh=await getContext()
      const next={...proposal,base_plan_id:plan.plan_id,context_token:fresh.context_token,capacity_minutes:30,items:[{...proposal.items[0],planned_minutes:10}],brief:'SYNTHETIC explicit carry decision after capacity loss'}
      const replan={operation:'replan_daily_plan',proposal:next,decisions:[{source_item_id:old.id,decision:'carry',reason:'SYNTHETIC remaining ten minutes fit capacity'}]}
      const revised=await call(replan,201)
      if((await invoke(replan)).status!==409)throw new Error('Stale replan accepted')
      const newPlan=(revised.publication as {plan_id:string}[])[0]
      const item=(await client.from('daily_plan_items').select('id,current_state,carryover_from_item_id').eq('plan_id',newPlan.plan_id).eq('task_id',taskId).single()).data
      const previous=(await client.from('daily_plans').select('status').eq('id',plan.plan_id).single()).data
      if(!item||item.current_state!=='partial'||item.carryover_from_item_id!==old.id||previous?.status!=='superseded')throw new Error('Revision history mismatch')
      report.checks.push(current)
      current='completion_and_history'
      await call({operation:'record_task_action',event_id:crypto.randomUUID(),plan_item_id:item.id,expected_state:'partial',action:'done',occurred_at:`${date}T01:30:00Z`,actual_minutes:8})
      const history=await call({operation:'get_execution_history',plan_date:date})
      if(!(history.events as {id:string}[]).some(e=>e.id===partialId))throw new Error('History evidence unavailable')
      report.checks.push(current)
      current='calibration_correction_and_removal'
      const before=await getCalibration() as unknown as CalResponse
      if(before.calibration.enabled&&!before.calibration.evidence.some(e=>e.root_item_id===old.id&&e.actual_minutes===20))throw new Error('Calibration evidence mismatch')
      const settings={...before.calibration.settings,corrections:[...before.calibration.settings.corrections,{event_id:partialId,actual_minutes:6,reason:'SYNTHETIC correction validation'}]}
      await call({operation:'set_calibration_settings',plan_date:date,expected_token:before.settings_token,settings})
      const corrected=await getCalibration() as unknown as CalResponse
      if(!corrected.calibration.records.some(r=>r.event_id===partialId&&r.effective_minutes===6))throw new Error('Correction failed')
      const raw=(await client.from('task_events').select('actual_minutes').eq('id',partialId).single()).data
      if(raw?.actual_minutes!==12)throw new Error('Raw history changed')
      await call({operation:'set_calibration_settings',plan_date:date,expected_token:corrected.settings_token,settings:{...corrected.calibration.settings,corrections:corrected.calibration.settings.corrections.filter(x=>x.event_id!==partialId)}})
      report.checks.push(current)
      current='next_context_uses_restored_evidence'
      const final=await getContext(),cal=final.calibration as CalResponse['calibration']
      if(!cal.records.some(r=>r.event_id===partialId&&r.effective_minutes===12))throw new Error('Next context mismatch')
      report.checks.push(current);report.status='passed';report.failed_check=null
    }catch{report.status='failed';report.failed_check=report.failed_check??current}
    finally{
      // Remove only our correction if an interrupted run left one; preserve all personal settings.
      if(created){
        try{
          const latest=await getCalibration() as unknown as CalResponse
          if(latest.calibration.settings.corrections.some(x=>x.event_id===partialId))await call({operation:'set_calibration_settings',plan_date:date,expected_token:latest.settings_token,settings:{...latest.calibration.settings,corrections:latest.calibration.settings.corrections.filter(x=>x.event_id!==partialId)}})
        }catch{report.status='failed';report.failed_check='synthetic_correction_cleanup'}
        if(report.status!=='passed')await client.from('tasks').update({status:'cancelled'}).eq('id',taskId).eq('title','SYNTHETIC v1 release validation').neq('status','done')
      }
    }
    await call({operation:'capture_chat_input',idempotency_key:crypto.randomUUID(),raw_input:'SYNTHETIC TaskRing v1 Core verification receipt. No personal data.',source:{type:'chat',external_id:`taskring-release-report:${coreSmokeRelease}`},interpretation:{kind:'reference',confidence:1,needs_review:report.status!=='passed',payload:{protocol:'taskring.chat.v0.1',title:`SYNTHETIC ${coreSmokeRelease} ${report.status}`,summary:JSON.stringify(report),assumptions:[],questions:[]}}},201)
    if(report.status==='passed')localStorage.setItem(key,JSON.stringify(report))
    return report
  })()
  runs.set(key,pending);return pending
}
