import { describe, expect, it } from 'vitest'
import { parsePlanningRequest, validateProposal, type Proposal, type PlanningContext } from '../supabase/functions/secretary-api/planning-contract'
const id = '11111111-1111-4111-8111-111111111111'
const proposal = (): Proposal => ({ plan_date: '2026-09-08', context_token: 'a'.repeat(64), base_plan_id: null, capacity_minutes: 120, buffer_percent: 20, buffer_reason: null, brief: 'Synthetic priority and capacity decision', items: [{ task_id: id, bucket: 'must', start_minute: 1140, planned_minutes: 60, reason: 'Synthetic deadline priority', interruptible: false, low_risk: true }] })
const context = (): PlanningContext => ({ plan_date: '2026-09-08', timezone: 'Asia/Tokyo', workday: true, tasks: [{ id, status: 'active', execution_context: 'any' }], projects: [], constraints: [], plans: [], items: [], events: [], feedback: [], preferences: {} })
describe('governed planning policy', () => {
  it('accepts explicit owned work within capacity and rejects untrusted shapes', () => {
    expect(parsePlanningRequest({ operation: 'publish_plan_proposal', proposal: proposal() })).not.toBeNull()
    expect(validateProposal(proposal(), context())).toEqual([])
    expect(parsePlanningRequest({ operation: 'get_planning_context', plan_date: '2026-02-30' })).toBeNull()
    expect(parsePlanningRequest({ operation: 'get_planning_context', plan_date: '2026-09-08', user_id: id })).toBeNull()
    const p = proposal(); p.items[0].planned_minutes = NaN
    expect(parsePlanningRequest({ operation: 'publish_plan_proposal', proposal: p })).toBeNull()
  })
  it('enforces work block, safe flex and deadlines in the profile timezone', () => {
    const p = proposal(), c = context(); p.items[0].start_minute = 600
    expect(validateProposal(p,c)).toContain('WORKDAY_HARD_BLOCK')
    p.items[0].bucket = 'flex'
    expect(validateProposal(p,c)).toContain('UNSAFE_FLEX')
    p.items[0].interruptible = true
    expect(validateProposal(p,c)).toEqual([])
    c.tasks[0].due_at = '2026-09-08T12:00:00Z'
    expect(validateProposal(p,c)).toContain('UNSAFE_FLEX')
    p.items[0].bucket = 'must'; p.items[0].start_minute = 1260
    expect(validateProposal(p,c)).toContain('DEADLINE_MISSED')
  })
  it('rejects stale base, blocked tasks, overlapping work and buffer violations', () => {
    const p = proposal(), c = context()
    c.plans = [{ id, status: 'active', plan_date: p.plan_date }]
    c.tasks[0].status = 'blocked'
    p.items.push({ ...p.items[0] }); p.buffer_percent = 0
    const errors = validateProposal(p,c)
    for (const error of ['BASE_PLAN_CHANGED','TASK_UNAVAILABLE','DUPLICATE_TASK','OVERLAPPING_ITEMS','BUFFER_JUSTIFICATION_REQUIRED']) expect(errors).toContain(error)
    p.items = [p.items[0]]; p.capacity_minutes = 50
    expect(validateProposal(p,c)).toContain('CAPACITY_EXCEEDED')
  })
  it('respects hard constraints, not-before and the main quest limit', () => {
    const p=proposal(), c=context()
    c.constraints = [{hardness:'hard',starts_at:'2026-09-08T09:00:00Z',ends_at:'2026-09-08T12:00:00Z'}]
    c.tasks[0].not_before = '2026-09-09T00:00:00Z'
    p.items[0].bucket='main_quest'; p.items.push({...p.items[0],start_minute:1250})
    for (const e of ['HARD_CONSTRAINT_OVERLAP','TASK_NOT_YET_AVAILABLE','MAIN_QUEST_LIMIT']) expect(validateProposal(p,c)).toContain(e)
    c.constraints[0].recurrence_rule = 'UNKNOWN'
    expect(validateProposal(p,c)).toContain('RECURRING_CONSTRAINT_REQUIRES_RESOLUTION')
  })
})
