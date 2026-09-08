import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { calculateCalibration, CalibrationSettings } from '../../../supabase/functions/secretary-api/calibration'
type Result = { calibration: ReturnType<typeof calculateCalibration>; settings_token: string; plan_revisions: {id:string;plan_date:string;revision:number;status:string;brief:string|null;items:{id:string;reason:string|null;current_state:string;planned_minutes:number|null}[]}[] }
export function CalibrationPanel({userId,online}:{userId:string;online:boolean}){
  const [message,setMessage]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const date=new Date().toISOString().slice(0,10)
  const query=useQuery({queryKey:['history',userId,'calibration',date],enabled:online&&!!supabase,queryFn:async()=>{
    const {data,error}=await supabase!.functions.invoke('secretary-api',{body:{operation:'get_calibration',plan_date:date}})
    if(error||!data?.ok)throw new Error('Calibration unavailable')
    return data.result as Result
  }})
  async function save(settings:CalibrationSettings){
    if(!query.data||!supabase||busy)return
    setBusy(true);setMessage(null)
    try{
      const {data,error}=await supabase.functions.invoke('secretary-api',{body:{operation:'set_calibration_settings',plan_date:date,expected_token:query.data.settings_token,settings}})
      if(error||!data?.ok)throw new Error('Reload history and retry. Another change may have been saved.')
      await query.refetch();setMessage('Calibration preference saved. Original history is preserved.')
    }catch(e){setMessage(e instanceof Error?e.message:'Save failed.')}finally{setBusy(false)}
  }
  const c=query.isError?undefined:query.data?.calibration
  return <section className="history-pending-section" aria-label="Execution calibration">
    <h2>Execution calibration</h2>
    {!online?<p>Reconnect to recompute calibration from saved history.</p>:query.isPending?<p>Reading evidence…</p>:null}
    {query.isError?<p role="alert">Calibration is unavailable. History has not been changed.</p>:null}
    {c&&online&&<>
      <details><summary>Plan revisions and decisions</summary>
        {query.data!.plan_revisions.map(p=><article key={p.id}><h3>{p.plan_date} · Revision {p.revision} · {p.status}</h3><p>{p.brief}</p><ul>{p.items.map(i=><li key={i.id}>{i.current_state} · {i.planned_minutes??'Unestimated'} min · {i.reason}<small> · {i.id}</small></li>)}</ul></article>)}
      </details>
      <p>{c.explanation}</p>
      <p>{c.sample_count} complete samples. Actual / planned duration: {c.duration_ratio===null?'Insufficient evidence':`${c.duration_ratio.toFixed(2)}×`}.</p>
      <p>Median recorded daily effort: {c.observed_daily_minutes_median===null?'Insufficient evidence':`${c.observed_daily_minutes_median} minutes`}.</p>
      <button disabled={busy} onClick={()=>void save({enabled:!c.enabled,excluded_event_ids:[],corrections:[]})}>{c.enabled?'Delete calibration and disable':'Enable recalculation'}</button>
      {c.enabled&&<>
        <details><summary>Evidence and corrections</summary>
          <p>Durations are minutes spent on each action, not a running total. Corrections affect calibration only; original events stay visible.</p>
          {c.records.map(r=><form className="auth-form" key={`${query.data!.settings_token}:${r.event_id}`} onSubmit={e=>{
            e.preventDefault();const form=new FormData(e.currentTarget),minutes=Number(form.get('minutes')),reason=String(form.get('reason')??'').trim()
            if(!Number.isInteger(minutes)||minutes<0||minutes>100000||!reason){setMessage('Enter nonnegative whole minutes and a correction reason.');return}
            void save({...c.settings,corrections:[...c.settings.corrections.filter(x=>x.event_id!==r.event_id),{event_id:r.event_id,actual_minutes:minutes,reason}]})
          }}>
            <strong>{r.task_title}</strong><time dateTime={r.occurred_at}>{new Date(r.occurred_at).toLocaleString()}</time>
            <p>Original: {r.recorded_minutes??'unrecorded'}; used: {r.excluded?'excluded':r.effective_minutes??'unknown'}</p>
            <label>Corrected minutes<input name="minutes" type="number" min="0" max="100000" step="1" required defaultValue={r.effective_minutes??''}/></label>
            <label>Reason<input name="reason" maxLength={500} required defaultValue={c.settings.corrections.find(x=>x.event_id===r.event_id)?.reason??''}/></label>
            <button disabled={busy}>Save correction</button>
            <button type="button" disabled={busy} onClick={()=>void save({...c.settings,excluded_event_ids:r.excluded?c.settings.excluded_event_ids.filter(x=>x!==r.event_id):[...c.settings.excluded_event_ids,r.event_id]})}>{r.excluded?'Include evidence':'Exclude evidence'}</button>
            {c.settings.corrections.some(x=>x.event_id===r.event_id)&&<button type="button" disabled={busy} onClick={()=>void save({...c.settings,corrections:c.settings.corrections.filter(x=>x.event_id!==r.event_id)})}>Remove correction</button>}
          </form>)}
          <ul>{c.evidence.map(s=><li key={s.event_ids.join(',')}>Original plan: {s.planned_minutes} min; recorded execution: {s.actual_minutes} min; {s.event_ids.length} source events. <small>Plan item {s.root_item_id}; events {s.event_ids.join(', ')}</small></li>)}</ul>
        </details>
      </>}
    </>}
    {message&&<p role="status">{message}</p>}
  </section>
}
