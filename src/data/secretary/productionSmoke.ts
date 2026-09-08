import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'

export const smokeRelease = 'wp010-20260908'
export const smokeReportSource = `taskring-release-report:${smokeRelease}`
export interface SmokeReport {
  release: string
  run_id: string
  status: 'passed' | 'failed'
  checks: string[]
  failed_check: string | null
  cross_user: 'not_run_requires_second_authenticated_user'
}
type Invoke = (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>

// Export the runner so the same assertions can run against a synthetic test transport.
// Only known synthetic record IDs are read. Never request the user's Inbox list.
export async function runProductionSmoke(invoke: Invoke, runId: string): Promise<SmokeReport> {
  const report: SmokeReport = { release: smokeRelease, run_id: runId, status: 'failed', checks: [],
    failed_check: null, cross_user: 'not_run_requires_second_authenticated_user' }
  let current = 'authenticated_capture'
  const interpretation = { kind: 'task', confidence: 0.2, needs_review: false,
    payload: { protocol: 'taskring.chat.v0.1', title: 'SYNTHETIC release check',
      summary: 'Synthetic API validation only. No action is required.', assumptions: [], questions: [] } }
  const capture = { operation: 'capture_chat_input', idempotency_key: runId,
    raw_input: '  SYNTHETIC TaskRing release validation. No personal task.  ',
    source: { type: 'chat', external_id: `taskring-release-capture:${runId}` }, interpretation }
  function check(ok: boolean) { if (!ok) throw new Error('Release assertion failed') }
  const get = async () => {
    const response = await invoke({ operation: 'get_inbox_item', inbox_item_id: runId })
    check(response.status === 200 && response.body.ok === true)
    return (response.body.result as { item: Record<string, unknown> }).item
  }
  const snapshot = (item: Record<string, unknown>) => ({ interpreted_kind: item.interpreted_kind,
    interpreted_payload: item.interpreted_payload, confidence: item.confidence, needs_review: item.needs_review })
  const complete = () => report.checks.push(current)
  try {
    const first = await invoke(capture)
    check(first.status === 201 && first.body.ok === true)
    complete()
    current = 'low_confidence_requires_review'
    const item = await get()
    check(item.needs_review === true && item.confidence === 0.2)
    complete()
    current = 'inbox_read_preserves_evidence'
    check(item.raw_input === capture.raw_input && item.source_type === 'chat' && !('user_id' in item))
    complete()
    current = 'interpretation_correction'
    const corrected = { ...interpretation, confidence: 1,
      payload: { ...interpretation.payload, title: 'SYNTHETIC corrected interpretation' } }
    const review = { operation: 'review_inbox_item', inbox_item_id: runId, expected: snapshot(item), interpretation: corrected }
    check((await invoke(review)).status === 200)
    const updated = await get()
    check(updated.needs_review === false && updated.raw_input === capture.raw_input &&
      (updated.interpreted_payload as { title: string }).title === corrected.payload.title)
    complete()
    current = 'capture_replay_preserves_correction'
    const replay = await invoke(capture)
    check(replay.status === 200 && (replay.body.result as { created: boolean }).created === false)
    const afterReplay = await get()
    check(afterReplay.needs_review === false && afterReplay.confidence === 1 &&
      (afterReplay.interpreted_payload as { title: string }).title === corrected.payload.title)
    complete()
    current = 'stale_review_conflict'
    check((await invoke(review)).status === 409)
    complete()
    current = 'capture_identity_conflict'
    check((await invoke({ ...capture, raw_input: 'SYNTHETIC conflicting evidence' })).status === 409)
    complete()
    current = 'concurrent_review_one_winner'
    const expected = snapshot(await get())
    const results = await Promise.all(['A', 'B'].map((suffix) => invoke({ operation: 'review_inbox_item',
      inbox_item_id: runId, expected, interpretation: { ...corrected,
        payload: { ...corrected.payload, title: `SYNTHETIC concurrent ${suffix}` } } })))
    check(results.filter((r) => r.status === 200).length === 1 && results.filter((r) => r.status === 409).length === 1)
    complete()
    current = 'caller_ownership_rejected'
    check((await invoke({ ...capture, user_id: '11111111-1111-4111-8111-111111111111' })).status === 400)
    complete()
    report.status = 'passed'
  } catch {
    report.failed_check = current
  }
  return report
}

const runs = new Map<string, Promise<SmokeReport>>()
export function startProductionSmoke(client: SupabaseClient<Database>, userId: string): Promise<SmokeReport> {
  const key = `taskring-release-check:${smokeRelease}:${userId}`
  const existing = runs.get(key)
  if (existing) return existing
  const pending = (async () => {
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SmokeReport
        if (parsed.release === smokeRelease && parsed.status === 'passed') return parsed
      } catch { /* Invalid local diagnostics are recomputed. */ }
    }
    const runId = crypto.randomUUID()
    const invoke: Invoke = async (body) => {
      const { data, error } = await client.functions.invoke('secretary-api', { body })
      if (error) {
        if (error.context instanceof Response) return { status: error.context.status, body: {} }
        return { status: 0, body: {} }
      }
      // The SDK hides successful HTTP status; capture's created flag distinguishes 201.
      return { status: data?.result?.created === true ? 201 : 200, body: data }
    }
    const report = await runProductionSmoke(invoke, runId)
    if (report.status === 'passed') {
      try {
        for (const path of ['/today', '/inbox', '/tasks', '/history', '/settings', '/release-check/deep-link']) {
          const response = await fetch(path, { headers: { Accept: 'text/html' }, cache: 'no-store', credentials: 'same-origin' })
          if (!response.ok || !response.headers.get('content-type')?.includes('text/html') ||
              !(await response.text()).includes('id="root"')) throw new Error('SPA fallback failed')
        }
        report.checks.push('spa_deep_link_fallback')
      } catch {
        report.status = 'failed'
        report.failed_check = 'spa_deep_link_fallback'
      }
    }
    const receipt = await invoke({ operation: 'capture_chat_input', idempotency_key: crypto.randomUUID(),
      raw_input: 'SYNTHETIC TaskRing release verification receipt. No personal data.',
      source: { type: 'chat', external_id: smokeReportSource },
      interpretation: { kind: 'reference', confidence: 1, needs_review: report.status !== 'passed',
        payload: { protocol: 'taskring.chat.v0.1', title: `SYNTHETIC ${smokeRelease} ${report.status}`,
          summary: JSON.stringify(report), assumptions: [], questions: [] } } })
    if (receipt.status !== 201) throw new Error('The check ran, but its receipt could not be saved. No successful verification is claimed.')
    if (report.status === 'passed') localStorage.setItem(key, JSON.stringify(report))
    return report
  })()
  runs.set(key, pending)
  return pending
}
