// Governed, dependency-free planning boundary. Times are minutes in profile timezone.
export const buckets = ['must', 'should', 'main_quest', 'flex', 'routine', 'game', 'bonus'] as const
export type PlanItem = { task_id: string; bucket: typeof buckets[number]; start_minute: number; planned_minutes: number; reason: string; interruptible: boolean; low_risk: boolean }
export type Proposal = { plan_date: string; context_token: string; base_plan_id: string | null; capacity_minutes: number; buffer_percent: number; buffer_reason: string | null; brief: string; items: PlanItem[] }
export type PlanningRequest = { operation: 'get_planning_context'; plan_date: string } | { operation: 'validate_plan_proposal' | 'publish_plan_proposal'; proposal: Proposal }
export type Row = Record<string, unknown>
export type PlanningContext = { plan_date: string; timezone: string; workday: boolean; tasks: Row[]; projects: Row[]; constraints: Row[]; plans: Row[]; items: Row[]; events: Row[]; feedback: Row[]; preferences: Row }
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Row, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
export function validDate(v: unknown): v is string { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v }
export function parsePlanningRequest(v: unknown): PlanningRequest | null {
  if (!record(v)) return null
  if (v.operation === 'get_planning_context') return keys(v, ['operation', 'plan_date']) && validDate(v.plan_date) ? v as PlanningRequest : null
  if (!['validate_plan_proposal', 'publish_plan_proposal'].includes(String(v.operation)) || !keys(v, ['operation', 'proposal'])) return null
  const p = v.proposal
  if (!record(p) || !keys(p, ['plan_date', 'context_token', 'base_plan_id', 'capacity_minutes', 'buffer_percent', 'buffer_reason', 'brief', 'items']) ||
      !validDate(p.plan_date) || typeof p.context_token !== 'string' || !/^[a-f0-9]{64}$/.test(p.context_token) ||
      !(p.base_plan_id === null || typeof p.base_plan_id === 'string' && uuid.test(p.base_plan_id)) || !integer(p.capacity_minutes, 0, 1440) ||
      !integer(p.buffer_percent, 0, 90) || !(p.buffer_reason === null || text(p.buffer_reason, 500)) || !text(p.brief, 2000) || !Array.isArray(p.items) || p.items.length > 100) return null
  for (const i of p.items) {
    if (!record(i) || !keys(i, ['task_id', 'bucket', 'start_minute', 'planned_minutes', 'reason', 'interruptible', 'low_risk']) ||
        typeof i.task_id !== 'string' || !uuid.test(i.task_id) || !buckets.includes(i.bucket as PlanItem['bucket']) ||
        !integer(i.start_minute, 0, 1439) || !integer(i.planned_minutes, 1, 1440) || i.start_minute + i.planned_minutes > 1440 ||
        !text(i.reason, 1000) || typeof i.interruptible !== 'boolean' || typeof i.low_risk !== 'boolean') return null
  }
  return v as PlanningRequest
}
function localTime(value: unknown, timezone: string): { date: string; minute: number } | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const get = (name: string) => p.find(x => x.type === name)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) }
}
export function validateProposal(p: Proposal, c: PlanningContext): string[] {
  const errors: string[] = []
  const fail = (s: string) => { if (!errors.includes(s)) errors.push(s) }
  const active = c.plans.find(x => x.plan_date === p.plan_date && x.status === 'active')
  if ((active?.id ?? null) !== p.base_plan_id) fail('BASE_PLAN_CHANGED')
  if (p.buffer_percent < 15 || p.buffer_percent > 25) { if (!p.buffer_reason) fail('BUFFER_JUSTIFICATION_REQUIRED') }
  if (p.items.reduce((s, i) => s + i.planned_minutes, 0) > Math.floor(p.capacity_minutes * (1 - p.buffer_percent / 100))) fail('CAPACITY_EXCEEDED')
  if (c.workday && p.items.filter(i => i.bucket === 'main_quest').length > 1) fail('MAIN_QUEST_LIMIT')
  const seen = new Set<string>()
  const sorted = [...p.items].sort((a, b) => a.start_minute - b.start_minute)
  for (let n = 0; n < sorted.length; n++) {
    const i = sorted[n], end = i.start_minute + i.planned_minutes
    if (seen.has(i.task_id)) fail('DUPLICATE_TASK')
    seen.add(i.task_id)
    if (n && sorted[n-1].start_minute + sorted[n-1].planned_minutes > i.start_minute) fail('OVERLAPPING_ITEMS')
    const t = c.tasks.find(t => t.id === i.task_id)
    if (!t || t.status !== 'active') { fail('TASK_UNAVAILABLE'); continue }
    const due = localTime(t.due_at, c.timezone), notBefore = localTime(t.not_before, c.timezone)
    if (notBefore && (notBefore.date > p.plan_date || notBefore.date === p.plan_date && notBefore.minute > i.start_minute)) fail('TASK_NOT_YET_AVAILABLE')
    if (due?.date === p.plan_date && end > due.minute) fail('DEADLINE_MISSED')
    const office = c.workday && i.start_minute < 1080 && end > 540
    if (office && i.bucket !== 'flex') fail('WORKDAY_HARD_BLOCK')
    if (i.bucket === 'flex' && (!i.interruptible || !i.low_risk || t.execution_context === 'deep' || t.priority_hint === 'critical' || t.due_at != null)) fail('UNSAFE_FLEX')
    for (const constraint of c.constraints) {
      if (constraint.hardness !== 'hard') continue
      if (constraint.recurrence_rule) { fail('RECURRING_CONSTRAINT_REQUIRES_RESOLUTION'); continue }
      const start = localTime(constraint.starts_at, c.timezone), finish = localTime(constraint.ends_at, c.timezone)
      if (!start || !finish) { fail('HARD_CONSTRAINT_TIME_REQUIRED'); continue }
      if (start.date > p.plan_date || finish.date < p.plan_date) continue
      const a = start.date < p.plan_date ? 0 : start.minute, b = finish.date > p.plan_date ? 1440 : finish.minute
      if (i.start_minute < b && end > a) fail('HARD_CONSTRAINT_OVERLAP')
    }
  }
  return errors
}
