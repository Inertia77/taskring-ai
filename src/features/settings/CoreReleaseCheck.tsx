import { useEffect,useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { startCoreSmoke } from '../../data/secretary/coreSmoke'
export function CoreReleaseCheck({userId,onClose}:{userId:string;onClose:()=>void}){
  const [message,setMessage]=useState('Verifying the signed-in release with synthetic records…')
  const [finished,setFinished]=useState(false)
  useEffect(()=>{
    let active=true
    if(!supabase)return
    void startCoreSmoke(supabase,userId).then(r=>{
      if(!active)return
      setMessage(r.status==='passed'?`${r.checks.length} checks passed; the private receipt is saved.`:`Verification stopped at ${r.failed_check}. The synthetic receipt is saved.`)
      setFinished(true)
    }).catch(()=>{if(active){setMessage('Verification could not finish or save its receipt. No success is claimed.');setFinished(true)}})
    return()=>{active=false}
  },[userId])
  return <main className="health-page"><section className="health-card"><h1>TaskRing v1 connection check</h1>
    <p>This one-time release check uses synthetic tasks on an unused historical date. Personal plans and Learning data are preserved.</p>
    <p role="status">{message}</p><p>Cross-account Production checks were not run. Local two-user integration separately verifies isolation.</p>
    {finished&&<button onClick={onClose}>Open TaskRing</button>}
  </section></main>
}
