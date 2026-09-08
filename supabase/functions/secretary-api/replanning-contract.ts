import { parsePlanningRequest, record, uuid, type Proposal } from './planning-contract.ts'
export type Decision = { source_item_id: string; decision: 'carry' | 'omit'; reason: string }
export type ReplanningRequest = { operation: 'replan_daily_plan'; proposal: Proposal; decisions: Decision[] }
export function parseReplanningRequest(v: unknown): ReplanningRequest | null {
  if (!record(v) || v.operation !== 'replan_daily_plan' || Object.keys(v).some(k => !['operation','proposal','decisions'].includes(k)) ||
      !parsePlanningRequest({operation:'publish_plan_proposal',proposal:v.proposal}) || !Array.isArray(v.decisions) || v.decisions.length > 500) return null
  const seen = new Set<string>()
  for (const d of v.decisions) {
    if (!record(d) || Object.keys(d).some(k=>!['source_item_id','decision','reason'].includes(k)) || typeof d.source_item_id !== 'string' ||
        !uuid.test(d.source_item_id) || seen.has(d.source_item_id) || !['carry','omit'].includes(String(d.decision)) ||
        typeof d.reason !== 'string' || !d.reason.trim() || d.reason.length > 1000) return null
    seen.add(d.source_item_id)
  }
  return v as ReplanningRequest
}
export type ExecutionRequest = { operation: 'record_task_action'; event_id: string; plan_item_id: string; expected_state: string; action: string; occurred_at: string; progress_percent?: number; remaining_minutes?: number; actual_minutes?: number; reason?: string; note?: string }
export type FeedbackRequest = { operation: 'add_plan_item_feedback'; feedback_id: string; plan_item_id: string; content: string }
export function parseExecutionRequest(v: unknown): ExecutionRequest | FeedbackRequest | null {
  if (!record(v) || typeof v.plan_item_id !== 'string' || !uuid.test(v.plan_item_id)) return null
  if (v.operation === 'add_plan_item_feedback') return Object.keys(v).every(k=>['operation','feedback_id','plan_item_id','content'].includes(k)) &&
    typeof v.feedback_id === 'string' && uuid.test(v.feedback_id) && typeof v.content === 'string' && v.content.trim().length>0 && v.content.length<=5000 ? v as FeedbackRequest : null
  if (v.operation !== 'record_task_action' || Object.keys(v).some(k=>!['operation','event_id','plan_item_id','expected_state','action','occurred_at','progress_percent','remaining_minutes','actual_minutes','reason','note'].includes(k)) ||
      typeof v.event_id !== 'string' || !uuid.test(v.event_id) || !['planned','started','partial','done','skipped','deferred','blocked','cancelled'].includes(String(v.expected_state)) ||
      !['started','partial','done','skipped','deferred','blocked','cancelled','reopened'].includes(String(v.action)) ||
      typeof v.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v.occurred_at) || !Number.isFinite(Date.parse(v.occurred_at))) return null
  for (const k of ['progress_percent','remaining_minutes','actual_minutes']) if (v[k] !== undefined && (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || Number(v[k]) < 0 || Number(v[k]) > (k==='progress_percent'?100:100000))) return null
  for (const k of ['reason','note']) if(v[k]!==undefined && (typeof v[k]!=='string'||String(v[k]).length>5000)) return null
  return v as ExecutionRequest
}
