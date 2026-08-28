import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createDailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import type { Database } from '../src/types/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const hasLocalAuth = Boolean(url && publishableKey)

function localClient() {
  if (!url || !publishableKey) throw new Error('Local Supabase integration env is missing')
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

describe.skipIf(!hasLocalAuth)('real local Auth -> RPC -> Data API -> Daily Plan RLS', () => {
  it('publishes immutable revisions atomically with ownership and stale-write protection', async () => {
    const userAClient = localClient()
    const userBClient = localClient()
    const anonClient = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`

    const { data: signUpA, error: signUpAError } = await userAClient.auth.signUp({ email: `wp006-a-${suffix}@example.test`, password })
    const { data: signUpB, error: signUpBError } = await userBClient.auth.signUp({ email: `wp006-b-${suffix}@example.test`, password })
    expect(signUpAError).toBeNull()
    expect(signUpBError).toBeNull()
    expect(signUpA.session).not.toBeNull()
    expect(signUpB.session).not.toBeNull()

    const userAId = signUpA.user!.id
    const userBId = signUpB.user!.id
    const planDate = '2026-08-28'

    const { data: taskA1, error: taskA1Error } = await userAClient.from('tasks').insert({
      user_id: userAId,
      title: 'A active one',
      status: 'active',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
    }).select('*').single()
    const { data: taskA2, error: taskA2Error } = await userAClient.from('tasks').insert({
      user_id: userAId,
      title: 'A active two',
      status: 'active',
      task_kind: 'routine',
      execution_context: 'flex',
      created_by: 'user',
    }).select('*').single()
    const { data: pausedA, error: pausedAError } = await userAClient.from('tasks').insert({
      user_id: userAId,
      title: 'A paused',
      status: 'paused',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
    }).select('*').single()
    const { data: taskB, error: taskBError } = await userBClient.from('tasks').insert({
      user_id: userBId,
      title: 'B private task',
      status: 'active',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
    }).select('*').single()
    expect(taskA1Error).toBeNull()
    expect(taskA2Error).toBeNull()
    expect(pausedAError).toBeNull()
    expect(taskBError).toBeNull()

    const repositoryA = createDailyPlanRepository(userAClient, userAId)
    const candidates = await repositoryA.getCandidateTasks()
    expect(candidates.map((task) => task.id).sort()).toEqual([taskA1!.id, taskA2!.id].sort())
    expect(candidates.some((task) => task.id === pausedA!.id)).toBe(false)

    const first = await repositoryA.publishPlan({
      planDate,
      basePlanId: null,
      items: [
        { task_id: taskA1!.id, bucket: 'must', position: 0, planned_minutes: 40, reason: null },
        { task_id: taskA2!.id, bucket: 'flex', position: 0, planned_minutes: null, reason: null },
      ],
      capacityMinutes: 180,
      capacityBreakdown: { deep: 120, flex: 60 },
      brief: 'Preserve me',
    })
    expect(first.revision).toBe(1)

    const ownPlan1 = await repositoryA.getActivePlan(planDate)
    expect(ownPlan1?.id).toBe(first.planId)
    expect(ownPlan1?.revision).toBe(1)
    const ownItems1 = await repositoryA.getPlanItems(first.planId)
    expect(ownItems1).toHaveLength(2)
    expect(ownItems1.every((item) => item.current_state === 'planned')).toBe(true)

    const { data: userBPlanView, error: userBPlanReadError } = await userBClient.from('daily_plans').select('id').eq('id', first.planId)
    const { data: userBItemView, error: userBItemReadError } = await userBClient.from('daily_plan_items').select('id').eq('plan_id', first.planId)
    expect(userBPlanReadError).toBeNull()
    expect(userBItemReadError).toBeNull()
    expect(userBPlanView).toEqual([])
    expect(userBItemView).toEqual([])

    const { data: anonPlanView, error: anonPlanReadError } = await anonClient.from('daily_plans').select('id').eq('id', first.planId)
    expect(anonPlanView ?? []).toEqual([])
    expect(anonPlanReadError).not.toBeNull()
    const { error: anonRpcError } = await anonClient.rpc('publish_daily_plan_v01', {
      p_plan_date: planDate,
      p_base_plan_id: null,
      p_items: [],
      p_capacity_minutes: null,
      p_capacity_breakdown: null,
      p_brief: null,
    })
    expect(anonRpcError).not.toBeNull()

    const repositoryB = createDailyPlanRepository(userBClient, userBId)
    await expect(repositoryB.publishPlan({
      planDate,
      basePlanId: null,
      items: [{ task_id: taskA1!.id, bucket: 'must', position: 0, planned_minutes: 30, reason: null }],
    })).rejects.toThrow()

    const second = await repositoryA.publishPlan({
      planDate,
      basePlanId: first.planId,
      items: [
        { task_id: taskA2!.id, bucket: 'should', position: 0, planned_minutes: 25, reason: null },
        { task_id: taskA1!.id, bucket: 'main_quest', position: 0, planned_minutes: 70, reason: null },
      ],
    })
    expect(second.revision).toBe(2)

    const { data: plansAfterSecond, error: plansAfterSecondError } = await userAClient
      .from('daily_plans')
      .select('id,revision,status,capacity_minutes,capacity_breakdown,brief')
      .eq('user_id', userAId)
      .eq('plan_date', planDate)
      .order('revision')
    expect(plansAfterSecondError).toBeNull()
    expect(plansAfterSecond?.map((plan) => [plan.revision, plan.status])).toEqual([[1, 'superseded'], [2, 'active']])
    expect(plansAfterSecond?.[1]?.capacity_minutes).toBe(180)
    expect(plansAfterSecond?.[1]?.capacity_breakdown).toEqual({ deep: 120, flex: 60 })
    expect(plansAfterSecond?.[1]?.brief).toBe('Preserve me')

    const { data: revision1Items } = await userAClient.from('daily_plan_items').select('task_id,bucket,position').eq('plan_id', first.planId).order('position')
    expect(revision1Items).toHaveLength(2)
    expect(revision1Items?.some((item) => item.task_id === taskA1!.id && item.bucket === 'must')).toBe(true)

    await expect(repositoryA.publishPlan({ planDate, basePlanId: first.planId, items: [] })).rejects.toThrow(/changed elsewhere/i)
    const activeAfterStale = await repositoryA.getActivePlan(planDate)
    expect(activeAfterStale?.id).toBe(second.planId)

    await expect(repositoryA.publishPlan({
      planDate,
      basePlanId: second.planId,
      items: [{ task_id: taskB!.id, bucket: 'must', position: 0, planned_minutes: 30, reason: null }],
    })).rejects.toThrow(/invalid or unavailable/i)
    const activeAfterCrossOwner = await repositoryA.getActivePlan(planDate)
    expect(activeAfterCrossOwner?.id).toBe(second.planId)

    const { data: activeRows, error: activeRowsError } = await userAClient
      .from('daily_plans')
      .select('id')
      .eq('user_id', userAId)
      .eq('plan_date', planDate)
      .eq('status', 'active')
    expect(activeRowsError).toBeNull()
    expect(activeRows).toHaveLength(1)

    const { count: plannedEventCount, error: eventCountError } = await userAClient
      .from('task_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userAId)
    expect(eventCountError).toBeNull()
    expect(plannedEventCount).toBe(0)

    const { error: stateUpdateError } = await userAClient
      .from('daily_plan_items')
      .update({ current_state: 'started' })
      .eq('plan_id', second.planId)
      .eq('task_id', taskA1!.id)
    expect(stateUpdateError).toBeNull()

    await expect(repositoryA.publishPlan({ planDate, basePlanId: second.planId, items: [] })).rejects.toThrow(/Execution has started/)
    const activeAfterExecutionGuard = await repositoryA.getActivePlan(planDate)
    expect(activeAfterExecutionGuard?.id).toBe(second.planId)
  })
})
