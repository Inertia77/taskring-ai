import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createDailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import { createExecutionRepository } from '../src/data/execution/executionRepository'
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

describe.skipIf(!hasLocalAuth)('real local Auth -> Execution RPC -> projections -> history', () => {
  it('records idempotent atomic actions and feedback while rejecting bypass and cross-owner commands', async () => {
    const userAClient = localClient()
    const userBClient = localClient()
    const anonClient = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`

    const { data: signUpA, error: signUpAError } = await userAClient.auth.signUp({ email: `wp007-a-${suffix}@example.test`, password })
    const { data: signUpB, error: signUpBError } = await userBClient.auth.signUp({ email: `wp007-b-${suffix}@example.test`, password })
    expect(signUpAError).toBeNull()
    expect(signUpBError).toBeNull()
    expect(signUpA.session).not.toBeNull()
    expect(signUpB.session).not.toBeNull()
    const userAId = signUpA.user!.id
    const userBId = signUpB.user!.id


    for (const forbiddenContext of ['execution:v1', 'publication:v1', 'feedback:v1']) {
      const response = await fetch(`${url!}/rest/v1/rpc/set_config`, {
        method: 'POST',
        headers: {
          apikey: publishableKey!,
          Authorization: `Bearer ${signUpA.session!.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setting_name: 'taskring.command_context', new_value: forbiddenContext, is_local: true }),
      })
      expect(response.ok).toBe(false)
    }

    const createTask = async (client: ReturnType<typeof localClient>, userId: string, title: string) => {
      const { data, error } = await client.from('tasks').insert({
        user_id: userId,
        title,
        status: 'active',
        task_kind: 'normal',
        execution_context: 'any',
        created_by: 'user',
        remaining_minutes: 60,
      }).select('*').single()
      expect(error).toBeNull()
      return data!
    }

    const tasksA = await Promise.all([
      createTask(userAClient, userAId, 'Done target'),
      createTask(userAClient, userAId, 'Partial target'),
      createTask(userAClient, userAId, 'Concurrency target'),
      createTask(userAClient, userAId, 'Feedback target'),
    ])
    const taskB = await createTask(userBClient, userBId, 'B private')

    const dailyA = createDailyPlanRepository(userAClient, userAId)
    const published = await dailyA.publishPlan({
      planDate: '2026-08-28',
      basePlanId: null,
      items: tasksA.map((task, index) => ({
        task_id: task.id,
        bucket: index === 0 ? 'must' : index === 1 ? 'should' : index === 2 ? 'flex' : 'bonus',
        position: 0,
        planned_minutes: 30,
        reason: null,
      })),
    })
    const planItems = await dailyA.getPlanItems(published.planId)
    const itemFor = (taskId: string) => planItems.find((item) => item.task_id === taskId)!
    const doneItem = itemFor(tasksA[0].id)
    const partialItem = itemFor(tasksA[1].id)
    const concurrencyItem = itemFor(tasksA[2].id)
    const feedbackItem = itemFor(tasksA[3].id)

    const executionA = createExecutionRepository(userAClient)
    const executionB = createExecutionRepository(userBClient)

    const directEventId = crypto.randomUUID()
    const { error: directEventError } = await userAClient.from('task_events').insert({
      id: directEventId,
      user_id: userAId,
      task_id: tasksA[0].id,
      plan_item_id: doneItem.id,
      event_type: 'started',
      occurred_at: new Date().toISOString(),
      actor: 'user',
    })
    expect(directEventError).not.toBeNull()

    const { error: directStateError } = await userAClient.from('daily_plan_items').update({ current_state: 'done' }).eq('id', doneItem.id)
    expect(directStateError).not.toBeNull()

    const { error: directDoneTaskError } = await userAClient.from('tasks').update({ status: 'done' }).eq('id', tasksA[0].id)
    expect(directDoneTaskError).not.toBeNull()

    const eventId = crypto.randomUUID()
    const occurredAt = '2026-08-28T10:00:00.000Z'
    await expect(executionA.recordAction({
      eventId,
      planItemId: doneItem.id,
      expectedState: 'planned',
      action: 'done',
      occurredAt,
      actualMinutes: 35,
      note: 'completed',
    })).resolves.toBe(eventId)

    const { data: doneEvent, error: doneEventError } = await userAClient.from('task_events').select('*').eq('id', eventId).single()
    expect(doneEventError).toBeNull()
    expect(doneEvent).toMatchObject({
      id: eventId,
      user_id: userAId,
      task_id: tasksA[0].id,
      plan_item_id: doneItem.id,
      event_type: 'done',
      actor: 'user',
      actual_minutes: 35,
      metadata: {},
    })
    const { data: doneProjection } = await userAClient.from('daily_plan_items').select('current_state').eq('id', doneItem.id).single()
    const { data: doneTask } = await userAClient.from('tasks').select('status,remaining_minutes,completed_at').eq('id', tasksA[0].id).single()
    expect(doneProjection?.current_state).toBe('done')
    expect(doneTask?.status).toBe('done')
    expect(doneTask?.remaining_minutes).toBe(0)
    expect(new Date(doneTask!.completed_at!).toISOString()).toBe(new Date(occurredAt).toISOString())

    await expect(executionA.recordAction({
      eventId,
      planItemId: doneItem.id,
      expectedState: 'planned',
      action: 'done',
      occurredAt,
      actualMinutes: 35,
      note: 'completed',
    })).resolves.toBe(eventId)
    const { count: retryCount } = await userAClient.from('task_events').select('*', { count: 'exact', head: true }).eq('id', eventId)
    expect(retryCount).toBe(1)
    await expect(executionA.recordAction({
      eventId,
      planItemId: doneItem.id,
      expectedState: 'done',
      action: 'reopened',
      occurredAt: new Date().toISOString(),
    })).rejects.toThrow(/conflicts/i)

    const { error: eventUpdateError } = await userAClient.from('task_events').update({ note: 'rewrite' }).eq('id', eventId)
    const { error: eventDeleteError } = await userAClient.from('task_events').delete().eq('id', eventId)
    expect(eventUpdateError).not.toBeNull()
    expect(eventDeleteError).not.toBeNull()

    const partialEventId = crypto.randomUUID()
    await executionA.recordAction({
      eventId: partialEventId,
      planItemId: partialItem.id,
      expectedState: 'planned',
      action: 'partial',
      occurredAt: new Date().toISOString(),
      progressPercent: 40,
      remainingMinutes: 25,
      actualMinutes: 20,
    })
    const { data: partialProjection } = await userAClient.from('daily_plan_items').select('current_state').eq('id', partialItem.id).single()
    const { data: partialTask } = await userAClient.from('tasks').select('remaining_minutes,status').eq('id', tasksA[1].id).single()
    expect(partialProjection?.current_state).toBe('partial')
    expect(partialTask?.remaining_minutes).toBe(25)
    expect(partialTask?.status).toBe('active')

    await expect(executionB.recordAction({
      eventId: crypto.randomUUID(),
      planItemId: partialItem.id,
      expectedState: 'partial',
      action: 'done',
      occurredAt: new Date().toISOString(),
    })).rejects.toThrow(/no longer available/i)

    const { error: anonActionError } = await anonClient.rpc('record_task_action_v01', {
      p_event_id: crypto.randomUUID(),
      p_plan_item_id: partialItem.id,
      p_expected_state: 'partial',
      p_action: 'done',
    })
    expect(anonActionError).not.toBeNull()

    const doneConcurrentId = crypto.randomUUID()
    const blockedConcurrentId = crypto.randomUUID()
    const concurrent = await Promise.allSettled([
      executionA.recordAction({
        eventId: doneConcurrentId,
        planItemId: concurrencyItem.id,
        expectedState: 'planned',
        action: 'done',
        occurredAt: new Date().toISOString(),
      }),
      executionA.recordAction({
        eventId: blockedConcurrentId,
        planItemId: concurrencyItem.id,
        expectedState: 'planned',
        action: 'blocked',
        occurredAt: new Date().toISOString(),
      }),
    ])
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const { data: concurrentEvents } = await userAClient.from('task_events').select('event_type').eq('plan_item_id', concurrencyItem.id)
    expect(concurrentEvents).toHaveLength(1)
    const { data: concurrentProjection } = await userAClient.from('daily_plan_items').select('current_state').eq('id', concurrencyItem.id).single()
    expect(['done', 'blocked']).toContain(concurrentProjection?.current_state)

    const feedbackId = crypto.randomUUID()
    await expect(executionA.addFeedback({
      feedbackId,
      planItemId: feedbackItem.id,
      content: ' Felt more difficult than expected ',
    })).resolves.toBe(feedbackId)
    const { data: feedbackRow, error: feedbackReadError } = await userAClient.from('user_feedback').select('*').eq('id', feedbackId).single()
    expect(feedbackReadError).toBeNull()
    expect(feedbackRow).toMatchObject({
      id: feedbackId,
      user_id: userAId,
      task_id: tasksA[3].id,
      plan_id: published.planId,
      plan_item_id: feedbackItem.id,
      content: 'Felt more difficult than expected',
      source: 'frontend',
      ai_interpretation: null,
    })
    await expect(executionA.addFeedback({ feedbackId, planItemId: feedbackItem.id, content: 'Felt more difficult than expected' })).resolves.toBe(feedbackId)
    const { count: feedbackCount } = await userAClient.from('user_feedback').select('*', { count: 'exact', head: true }).eq('id', feedbackId)
    expect(feedbackCount).toBe(1)
    await expect(executionA.addFeedback({ feedbackId, planItemId: feedbackItem.id, content: 'Different' })).rejects.toThrow(/conflicts/i)
    await expect(executionB.addFeedback({ feedbackId: crypto.randomUUID(), planItemId: feedbackItem.id, content: 'cross owner' })).rejects.toThrow(/no longer available/i)

    const { error: anonFeedbackError } = await anonClient.rpc('add_plan_item_feedback_v01', {
      p_feedback_id: crypto.randomUUID(),
      p_plan_item_id: feedbackItem.id,
      p_content: 'anon',
    })
    expect(anonFeedbackError).not.toBeNull()

    const { error: directFeedbackError } = await userAClient.from('user_feedback').insert({
      id: crypto.randomUUID(),
      user_id: userAId,
      task_id: tasksA[3].id,
      plan_id: published.planId,
      plan_item_id: feedbackItem.id,
      content: 'bypass',
      source: 'frontend',
    })
    expect(directFeedbackError).not.toBeNull()

    const { data: bTaskView } = await userAClient.from('tasks').select('id').eq('id', taskB.id)
    expect(bTaskView).toEqual([])
  })
})
