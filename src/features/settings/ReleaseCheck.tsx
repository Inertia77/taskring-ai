import { useEffect, useState } from 'react'
import { startProductionSmoke, type SmokeReport } from '../../data/secretary/productionSmoke'
import { supabase } from '../../lib/supabaseClient'

export function ReleaseCheck({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [report, setReport] = useState<SmokeReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (!supabase) return
    void startProductionSmoke(supabase, userId).then((result) => {
      if (active) setReport(result)
    }).catch(() => { if (active) setError('Verification could not finish. Your tasks have not been changed.') })
    return () => { active = false }
  }, [userId])
  return <main className="health-page"><section className="health-card">
    <h1>TaskRing connection check</h1>
    <p>This release checks capture and review using synthetic records. It does not read or change your personal tasks.</p>
    {!report && !error && <p role="status">Verifying your signed-in connection…</p>}
    {error && <p role="alert">{error}</p>}
    {report && <><p role="status">{report.status === 'passed' ? 'Connection verified. The synthetic receipt is saved.' : 'Verification found a problem.'}</p>
      <p>{report.checks.length} checks passed. Cross-account production testing requires a second account and was not run.</p>
      {report.failed_check && <p>Failed check: {report.failed_check}</p>}</>}
    {(report || error) && <button onClick={onClose}>Open TaskRing</button>}
  </section></main>
}
