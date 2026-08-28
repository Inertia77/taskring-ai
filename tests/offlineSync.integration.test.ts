import 'fake-indexeddb/auto'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createDailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import { createExecutionRepository, type ExecutionRepository } from '../src/data/execution/executionRepository'
import { ExecutionCommandError } from '../src/data/execution/models'
import { createOfflineRepository } from '../src/data/offline/offlineRepository'
import { createOfflineServerReconciliationRepository } from '../src/data/offline/reconciliationRepository'
import { createOutboxSyncEngine } from '../src/data/offline/syncEngine'
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

describe.skipIf(!hasLocalAuth)('real local IndexedDB outbox -> WP007 RPC -> reconciliation', () => {
  it('persists a lost-ack execution command, retries the same UUID exactly once on server, then syncs feedback', async () => {
    const client = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`
    const { data: signUp, error: signUpError } = await client.auth.signUp({
      email: `wp008-${suffix}@example.test`,
      password,
    })
    expect(signUpError).toBeNull()
    expect(signUp.session).not.toBeNull()
    const userId = signUp.user!.id

    const { data: task, error: taskError } = await client.from('tasks').insert({
      user_id: userId,
      title: 'WP008 synthetic local target',
      status: 'active',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
      remaining_minutes: 45,
    }).select('*').single()
    expect(taskError).toBeNull()

    const daily = createDailyPlanRepository(client, userId)
    const published = await daily.publishPlan({
      planDate: '2026-08-28',
      basePlanId: null,
      items: [{ task_id: task!.id, bucket: 'must', position: 0, planned_minutes: 45, reason: null }],
    })
    const initialItems = await daily.getPlanItems(published.planId)
    const item = initialItems[0]

    const offline = createOfflineRepository(`wp008-local-${crypto.randomUUID()}`)
    await offline.saveTodaySnapshot(userId, '2026-08-28', { plan: (await daily.getActivePlan('2026-08-28'))!, items: initialItems })

    const eventId = crypto.randomUUID()
    const occurredAt = '2026-08-28T10:00:00.000Z'
    await offline.enqueueExecution({
      localId: `execution:${eventId}`,
      userId,
      planDate: '2026-08-28',
      eventId,
      planItemId: item.id,
      expectedState: 'planned',
      action: 'done',
      occurredAt,
      createdAt: occurredAt,
      actualMinutes: 42,
    })

    const realExecution = createExecutionRepository(client)
    let loseFirstAck = true
    const lossyExecution: ExecutionRepository = {
      async recordAction(input) {
        const result = await realExecution.recordAction(input)
        if (loseFirstAck) {
          loseFirstAck = false
          throw new ExecutionCommandError('retryable', 'Simulated connection reset after server commit')
        }
        return result
      },
      addFeedback: (input) => realExecution.addFeedback(input),
    }

    const serverReadback = createOfflineServerReconciliationRepository(client, userId)
    const reconcile = async (command: Parameters<typeof serverReadback.assertAcknowledged>[0]) => {
      await serverReadback.assertAcknowledged(command)
      const plan = await daily.getActivePlan('2026-08-28')
      expect(plan).not.toBeNull()
      const items = await daily.getPlanItems(plan!.id)
      await offline.saveTodaySnapshot(userId, '2026-08-28', { plan: plan!, items })
    }
    const engine = createOutboxSyncEngine({ userId, repository: offline, executionRepository: lossyExecution, reconcile })

    expect((await engine.syncNow(true)).retrying).toBe(1)
    expect((await offline.listUserCommands(userId))[0].event_id).toBe(eventId)
    const { count: countAfterLostAck } = await client.from('task_events').select('*', { count: 'exact', head: true }).eq('id', eventId)
    expect(countAfterLostAck).toBe(1)

    expect((await engine.syncNow(true)).acknowledged).toBe(1)
    expect(await offline.listUserCommands(userId)).toEqual([])
    const { count: finalEventCount } = await client.from('task_events').select('*', { count: 'exact', head: true }).eq('id', eventId)
    expect(finalEventCount).toBe(1)
    const { data: event } = await client.from('task_events').select('occurred_at,event_type').eq('id', eventId).single()
    expect(event?.event_type).toBe('done')
    expect(new Date(event!.occurred_at).toISOString()).toBe(new Date(occurredAt).toISOString())
    const { data: projection } = await client.from('daily_plan_items').select('current_state').eq('id', item.id).single()
    const { data: taskProjection } = await client.from('tasks').select('status,completed_at,remaining_minutes').eq('id', task!.id).single()
    expect(projection?.current_state).toBe('done')
    expect(taskProjection?.status).toBe('done')
    expect(taskProjection?.remaining_minutes).toBe(0)
    expect(new Date(taskProjection!.completed_at!).toISOString()).toBe(new Date(occurredAt).toISOString())
    expect((await offline.getTodaySnapshot(userId, '2026-08-28'))?.plan.items[0].current_state).toBe('done')

    const feedbackId = crypto.randomUUID()
    await offline.enqueueFeedback({
      localId: `feedback:${feedbackId}`,
      userId,
      planDate: '2026-08-28',
      feedbackId,
      planItemId: item.id,
      content: 'WP008 synthetic feedback',
      createdAt: '2026-08-28T10:05:00.000Z',
    })
    expect((await engine.syncNow(true)).acknowledged).toBe(1)
    expect(await offline.listUserCommands(userId)).toEqual([])
    const { count: feedbackCount } = await client.from('user_feedback').select('*', { count: 'exact', head: true }).eq('id', feedbackId)
    expect(feedbackCount).toBe(1)

    await offline.deleteDatabase()
  })
})
