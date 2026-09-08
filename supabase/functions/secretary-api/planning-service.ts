import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import type { ReplanningRequest } from './replanning-contract.ts'
import { type PlanningContext, type PlanningRequest, type Row, validateProposal } from './planning-contract.ts'

const columns = {
  tasks: 'id,project_id,title,description,status,task_kind,priority_hint,due_at,not_before,estimate_minutes,remaining_minutes,execution_context,recurrence_rule,recurrence_timezone,updated_at',
  projects: 'id,goal_id,title,status,priority_hint,target_date,notes,updated_at',
  constraints: 'id,kind,hardness,starts_at,ends_at,recurrence_rule,metadata,updated_at',
  plans: 'id,plan_date,revision,status,capacity_minutes,capacity_breakdown,brief,created_at',
  items: 'id,plan_id,task_id,bucket,position,planned_minutes,reason,carryover_from_item_id,current_state,updated_at',
  events: 'id,task_id,plan_item_id,event_type,occurred_at,progress_percent,remaining_minutes,actual_minutes,reason,note,metadata',
  feedback: 'id,task_id,plan_id,plan_item_id,content,source,ai_interpretation,created_at',
}
export async function planningContext(db: SupabaseClient, date: string): Promise<PlanningContext> {
  const from = new Date(Date.parse(date) - 30 * 86400000).toISOString()
  const until = new Date(Date.parse(date) + 2 * 86400000).toISOString()
  const results = await Promise.all([
    db.from('profiles').select('timezone,planning_preferences').limit(1).maybeSingle(),
    db.from('tasks').select(columns.tasks).order('id').limit(501),
    db.from('projects').select(columns.projects).order('id').limit(501),
    db.from('constraints').select(columns.constraints).eq('active', true).order('id').limit(501),
    db.from('daily_plans').select(columns.plans).gte('plan_date', from.slice(0,10)).lte('plan_date', date).order('id').limit(501),
    db.from('task_events').select(columns.events).gte('occurred_at', from).lt('occurred_at', until).order('id').limit(501),
    db.from('user_feedback').select(columns.feedback).gte('created_at', from).lt('created_at', until).order('id').limit(501),
  ])
  if (results.some(r => r.error)) throw new Error('CONTEXT_READ_FAILED')
  if (results.some(r => Array.isArray(r.data) && r.data.length > 500)) throw new Error('CONTEXT_TOO_LARGE')
  const profile = results[0].data as Row | null
  const timezone = typeof profile?.timezone === 'string' ? profile.timezone : 'UTC'
  new Intl.DateTimeFormat('en', { timeZone: timezone }) // Invalid stored timezone fails closed.
  const plans = results[4].data as Row[]
  const items = plans.length ? await db.from('daily_plan_items').select(columns.items).in('plan_id', plans.map(p => p.id)).order('id').limit(501) : { data: [], error: null }
  if (items.error) throw new Error('CONTEXT_READ_FAILED')
  if (items.data!.length > 500) throw new Error('CONTEXT_TOO_LARGE')
  const day = new Date(date).getUTCDay()
  return { plan_date: date, timezone, workday: day !== 0 && day !== 6, preferences: (profile?.planning_preferences ?? {}) as Row,
    tasks: results[1].data as Row[], projects: results[2].data as Row[], constraints: results[3].data as Row[],
    plans, items: items.data as Row[], events: results[5].data as Row[], feedback: results[6].data as Row[] }
}
export async function contextToken(context: PlanningContext) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(context)))
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('')
}
const failure = (status: number, code: string) => ({ status, body: { ok: false, error: { code, message: 'Refresh planning context and review the proposal.' } } })
export async function handlePlanning(db: SupabaseClient, command: PlanningRequest | ReplanningRequest) {
  try {
    const date = command.operation === 'get_planning_context' ? command.plan_date : command.proposal.plan_date
    const context = await planningContext(db, date)
    const token = await contextToken(context)
    if (command.operation === 'get_planning_context') return { status: 200, body: { ok: true, result: { context, context_token: token,
      policy: { workday_block: '09:00-18:00', main_quest_workday_max: 1, default_buffer_percent: 20,
        carryover: 'explicit decision only', history_days: 30, recurrence: 'rules supplied as evidence; never automatically expanded' } } } }
    const p = command.proposal
    if (p.context_token !== token) return failure(409, 'STALE_CONTEXT')
    const errors = validateProposal(p, context)
    if (errors.length) return { status: 422, body: { ok: false, error: { code: 'INVALID_PLAN', message: 'Proposal violates planning policy.', violations: errors } } }
    if (command.operation === 'validate_plan_proposal') return { status: 200, body: { ok: true, result: { valid: true, context_token: token, planned_minutes: p.items.reduce((s,i) => s+i.planned_minutes, 0) } } }
    if (command.operation === 'replan_daily_plan') {
      const sourceIds = new Set(command.decisions.map(d => d.source_item_id))
      const baseItems = context.items.filter(i => i.plan_id === p.base_plan_id)
      if (baseItems.some(i => !['done','cancelled'].includes(String(i.current_state)) && !sourceIds.has(String(i.id)))) return failure(422, 'CARRYOVER_DECISION_REQUIRED')
      for (const d of command.decisions) {
        const source = context.items.find(i => i.id === d.source_item_id)
        if (!source || ['done','cancelled'].includes(String(source.current_state)) ||
            (d.decision === 'carry') !== p.items.some(i => i.task_id === source.task_id)) return failure(422, 'INVALID_CARRYOVER')
      }
      const { data, error } = await db.rpc('replan_daily_plan_v01', { p_request: { ...p, decisions: command.decisions,
        expected_items: baseItems.map(i=>({id:i.id,current_state:i.current_state,updated_at:i.updated_at})),
        expected_tasks: context.tasks.filter(t=>p.items.some(i=>i.task_id===t.id)).map(t=>({id:t.id,updated_at:t.updated_at})) } })
      return error ? failure(error.code === 'P0001' ? 409 : 500, error.code === 'P0001' ? 'REPLAN_CONFLICT' : 'REPLAN_FAILED')
        : { status: 201, body: { ok: true, result: { publication: data } } }
    }
    const { data, error } = await db.rpc('publish_daily_plan_v01', { p_plan_date: date, p_base_plan_id: p.base_plan_id,
      p_items: p.items.map((i, position) => ({ task_id: i.task_id, bucket: i.bucket, position, planned_minutes: i.planned_minutes, reason: i.reason })),
      p_capacity_minutes: p.capacity_minutes, p_capacity_breakdown: { protocol: 'taskring.plan.v0.1', context_token: token,
        timezone: context.timezone, buffer_percent: p.buffer_percent, buffer_reason: p.buffer_reason, schedule: p.items }, p_brief: p.brief })
    if (error) return failure(error.code === 'P0001' ? 409 : 500, error.code === 'P0001' ? 'PLAN_CONFLICT' : 'PUBLICATION_FAILED')
    return { status: 201, body: { ok: true, result: { publication: data } } }
  } catch (error) {
    const code = error instanceof Error && error.message === 'CONTEXT_TOO_LARGE' ? 'CONTEXT_TOO_LARGE' : 'CONTEXT_UNAVAILABLE'
    return failure(code === 'CONTEXT_TOO_LARGE' ? 422 : 503, code)
  }
}
