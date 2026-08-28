// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import type { ActiveTodayPlan } from '../src/data/dailyPlans/models'
import type { ExecutionRepository } from '../src/data/execution/executionRepository'
import { ExecutionCommandError } from '../src/data/execution/models'
import type { HistoryRepository } from '../src/data/history/historyRepository'
import { createOfflineRepository } from '../src/data/offline/offlineRepository'
import { createOutboxSyncEngine } from '../src/data/offline/syncEngine'
import { HistoryPage } from '../src/features/history/HistoryPage'
import { TodayPage } from '../src/features/today/TodayPage'

const databases: ReturnType<typeof createOfflineRepository>[] = []

function repository() {
  const repo = createOfflineRepository(`wp008-${crypto.randomUUID()}`)
  databases.push(repo)
  return repo
}

afterEach(async () => {
  cleanup()
  for (const repo of databases.splice(0)) await repo.deleteDatabase()
  vi.restoreAllMocks()
})

function todayPlan(): ActiveTodayPlan {
  return {
    plan: {
      id: 'plan-1', user_id: 'user-a', plan_date: '2026-08-28', revision: 1, status: 'active',
      capacity_minutes: null, capacity_breakdown: {}, brief: null, created_by: 'user', created_at: '2026-08-28T00:00:00Z',
    },
    items: [{
      id: 'item-1', user_id: 'user-a', plan_id: 'plan-1', task_id: 'task-1', bucket: 'must', position: 0,
      planned_minutes: 60, reason: null, carryover_from_item_id: null, current_state: 'planned',
      created_at: '2026-08-28T00:00:00Z', updated_at: '2026-08-28T00:00:00Z', latestEvent: null,
      task: {
        id: 'task-1', user_id: 'user-a', project_id: null, title: 'Offline target', description: null,
        status: 'active', task_kind: 'normal', priority_hint: 'high', due_at: null, not_before: null,
        estimate_minutes: 60, remaining_minutes: 60, execution_context: 'deep', recurrence_rule: null,
        recurrence_timezone: null, checklist: [], created_by: 'user', created_at: '2026-08-28T00:00:00Z',
        updated_at: '2026-08-28T00:00:00Z', completed_at: null,
      },
      project: null,
    }],
  }
}

function dailyRepository(plan: ActiveTodayPlan | null = todayPlan()): DailyPlanRepository {
  return {
    getActivePlan: vi.fn(async () => plan?.plan ?? null),
    getPlanItems: vi.fn(async () => plan?.items ?? []),
    getCandidateTasks: vi.fn(async () => []),
    publishPlan: vi.fn(),
  }
}

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('IndexedDB durable outbox', () => {
  it('persists Done, Partial, and Feedback across repository recreation without storing auth secrets', async () => {
    const dbName = `wp008-reload-${crypto.randomUUID()}`
    const first = createOfflineRepository(dbName)
    await first.enqueueExecution({
      localId: 'execution:event-done', userId: 'user-a', planDate: '2026-08-28', eventId: 'event-done',
      planItemId: 'item-1', expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00.000Z',
      createdAt: '2026-08-28T10:00:00.000Z', actualMinutes: 30,
    })
    await first.enqueueExecution({
      localId: 'execution:event-partial', userId: 'user-a', planDate: '2026-08-28', eventId: 'event-partial',
      planItemId: 'item-2', expectedState: 'planned', action: 'partial', occurredAt: '2026-08-28T10:05:00.000Z',
      createdAt: '2026-08-28T10:05:00.000Z', progressPercent: 40, remainingMinutes: 20,
    })
    await first.enqueueFeedback({
      localId: 'feedback:feedback-1', userId: 'user-a', planDate: '2026-08-28', feedbackId: 'feedback-1',
      planItemId: 'item-1', content: 'Synthetic feedback', createdAt: '2026-08-28T10:06:00.000Z',
    })
    first.close()

    const recreated = createOfflineRepository(dbName)
    databases.push(recreated)
    const commands = await recreated.listUserCommands('user-a')
    expect(commands).toHaveLength(3)
    expect(commands[0]).toMatchObject({ event_id: 'event-done', occurred_at: '2026-08-28T10:00:00.000Z', action: 'done' })
    expect(commands[1]).toMatchObject({ event_id: 'event-partial', progress_percent: 40, remaining_minutes: 20 })
    expect(commands[2]).toMatchObject({ feedback_id: 'feedback-1', feedback_content: 'Synthetic feedback' })
    const serialized = JSON.stringify(commands).toLowerCase()
    expect(serialized).not.toContain('access_token')
    expect(serialized).not.toContain('refresh_token')
    expect(serialized).not.toContain('service_role')
  })

  it('drains Start -> Partial -> Done in stable FIFO and reuses enqueue UUIDs', async () => {
    const offline = repository()
    await offline.enqueueExecution({
      localId: 'c1', userId: 'user-a', planDate: '2026-08-28', eventId: 'e1', planItemId: 'item-1',
      expectedState: 'planned', action: 'started', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
    })
    await offline.enqueueExecution({
      localId: 'c2', userId: 'user-a', planDate: '2026-08-28', eventId: 'e2', planItemId: 'item-1',
      expectedState: 'started', action: 'partial', occurredAt: '2026-08-28T10:05:00Z', createdAt: '2026-08-28T10:05:00Z',
      progressPercent: 50, remainingMinutes: 20,
    })
    await offline.enqueueExecution({
      localId: 'c3', userId: 'user-a', planDate: '2026-08-28', eventId: 'e3', planItemId: 'item-1',
      expectedState: 'partial', action: 'done', occurredAt: '2026-08-28T10:10:00Z', createdAt: '2026-08-28T10:10:00Z',
    })
    const seen: string[] = []
    const execution: ExecutionRepository = {
      recordAction: vi.fn(async (input) => { seen.push(`${input.eventId}:${input.expectedState}:${input.action}`); return input.eventId }),
      addFeedback: vi.fn(),
    }
    const engine = createOutboxSyncEngine({ userId: 'user-a', repository: offline, executionRepository: execution, reconcile: vi.fn(async () => undefined) })
    const result = await engine.syncNow(true)
    expect(result.acknowledged).toBe(3)
    expect(seen).toEqual(['e1:planned:started', 'e2:started:partial', 'e3:partial:done'])
    expect(await offline.listUserCommands('user-a')).toEqual([])
  })

  it('survives a lost response and retries the same Event UUID without duplicating the server Event', async () => {
    const offline = repository()
    await offline.enqueueExecution({
      localId: 'c1', userId: 'user-a', planDate: '2026-08-28', eventId: 'stable-event', planItemId: 'item-1',
      expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
    })
    const serverEvents = new Set<string>()
    let calls = 0
    const execution: ExecutionRepository = {
      recordAction: vi.fn(async (input) => {
        calls += 1
        serverEvents.add(input.eventId)
        if (calls === 1) throw new ExecutionCommandError('retryable', 'Connection reset after server commit')
        return input.eventId
      }),
      addFeedback: vi.fn(),
    }
    const engine = createOutboxSyncEngine({ userId: 'user-a', repository: offline, executionRepository: execution, reconcile: vi.fn(async () => undefined) })
    expect((await engine.syncNow(true)).retrying).toBe(1)
    const retained = await offline.listUserCommands('user-a')
    expect(retained[0].event_id).toBe('stable-event')
    expect((await engine.syncNow(true)).acknowledged).toBe(1)
    expect(calls).toBe(2)
    expect(serverEvents.size).toBe(1)
    expect(await offline.listUserCommands('user-a')).toEqual([])
  })

  it('keeps a semantic server conflict visible and never retries it indefinitely', async () => {
    const offline = repository()
    await offline.enqueueExecution({
      localId: 'conflict', userId: 'user-a', planDate: '2026-08-28', eventId: 'event-conflict', planItemId: 'item-1',
      expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
    })
    const execution: ExecutionRepository = {
      recordAction: vi.fn(async () => { throw new ExecutionCommandError('transition', 'Execution state changed. Refresh before retrying.') }),
      addFeedback: vi.fn(),
    }
    const engine = createOutboxSyncEngine({ userId: 'user-a', repository: offline, executionRepository: execution, reconcile: vi.fn(async () => undefined) })
    expect((await engine.syncNow(true)).conflicts).toBe(1)
    expect((await offline.listUserCommands('user-a'))[0]).toMatchObject({ sync_state: 'conflict' })
    await engine.syncNow(true)
    expect(execution.recordAction).toHaveBeenCalledTimes(1)
  })

  it('isolates queues by authenticated user and never cross-syncs after an account switch', async () => {
    const offline = repository()
    for (const [userId, eventId] of [['user-a', 'event-a'], ['user-b', 'event-b']] as const) {
      await offline.enqueueExecution({
        localId: eventId, userId, planDate: '2026-08-28', eventId, planItemId: `${userId}-item`,
        expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
      })
    }
    const seen: string[] = []
    const execution: ExecutionRepository = {
      recordAction: vi.fn(async (input) => { seen.push(input.eventId); return input.eventId }),
      addFeedback: vi.fn(),
    }
    const engineA = createOutboxSyncEngine({ userId: 'user-a', repository: offline, executionRepository: execution, reconcile: vi.fn(async () => undefined) })
    await engineA.syncNow(true)
    expect(seen).toEqual(['event-a'])
    expect((await offline.listUserCommands('user-b')).map((command) => command.event_id)).toEqual(['event-b'])
  })

  it('preserves Feedback UUID across retry', async () => {
    const offline = repository()
    await offline.enqueueFeedback({
      localId: 'feedback:stable-feedback', userId: 'user-a', planDate: '2026-08-28', feedbackId: 'stable-feedback',
      planItemId: 'item-1', content: 'Synthetic feedback', createdAt: '2026-08-28T10:00:00Z',
    })
    const ids: string[] = []
    const execution: ExecutionRepository = {
      recordAction: vi.fn(),
      addFeedback: vi.fn(async (input) => {
        ids.push(input.feedbackId)
        if (ids.length === 1) throw new ExecutionCommandError('retryable', 'Network timeout')
        return input.feedbackId
      }),
    }
    const engine = createOutboxSyncEngine({ userId: 'user-a', repository: offline, executionRepository: execution, reconcile: vi.fn(async () => undefined) })
    await engine.syncNow(true)
    await engine.syncNow(true)
    expect(ids).toEqual(['stable-feedback', 'stable-feedback'])
    expect(await offline.listUserCommands('user-a')).toEqual([])
  })
})

describe('offline Today and History surfaces', () => {
  it('does not invent Today from active tasks when no offline snapshot exists', async () => {
    const offline = repository()
    renderWithQuery(
      <TodayPage
        userId="user-a"
        online={false}
        repository={dailyRepository()}
        offlineRepository={offline}
        planningTimeZone="Asia/Tokyo"
        now={new Date('2026-08-28T00:30:00Z')}
      />,
    )
    expect(await screen.findByText('No offline Today plan is available.')).toBeTruthy()
    expect(screen.queryByText('Offline target')).toBeNull()
  })

  it('renders an offline snapshot with an optimistic Done state and Pending Sync badge', async () => {
    const user = userEvent.setup()
    const offline = repository()
    await offline.saveTodaySnapshot('user-a', '2026-08-28', todayPlan(), '2026-08-28T09:00:00Z')
    renderWithQuery(
      <TodayPage
        userId="user-a"
        online={false}
        repository={dailyRepository()}
        offlineRepository={offline}
        planningTimeZone="Asia/Tokyo"
        now={new Date('2026-08-28T00:30:00Z')}
        actionClock={() => new Date('2026-08-28T10:00:00Z')}
        idFactory={() => 'offline-done'}
      />,
    )
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark Offline target done' })
    await user.click(checkbox)
    expect(await screen.findByText('Pending Sync')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Mark Offline target done' }) as HTMLInputElement).checked).toBe(true)
    const command = (await offline.listUserCommands('user-a'))[0]
    expect(command).toMatchObject({ event_id: 'offline-done', occurred_at: '2026-08-28T10:00:00.000Z', expected_state: 'planned' })
  })

  it('deduplicates a lost-ack local Event from authoritative History and exposes Manual Sync Now', async () => {
    const user = userEvent.setup()
    const offline = repository()
    await offline.enqueueExecution({
      localId: 'local-event', userId: 'user-a', planDate: '2026-08-28', eventId: 'server-event', planItemId: 'item-1',
      expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
    })
    await offline.enqueueFeedback({
      localId: 'local-feedback', userId: 'user-a', planDate: '2026-08-28', feedbackId: 'pending-feedback', planItemId: 'item-1',
      content: 'Pending feedback', createdAt: '2026-08-28T10:05:00Z',
    })
    const history: HistoryRepository = {
      listRecentEvents: vi.fn(async () => [{
        id: 'server-event', user_id: 'user-a', task_id: 'task-1', plan_item_id: 'item-1', event_type: 'done',
        occurred_at: '2026-08-28T10:00:00Z', progress_percent: null, remaining_minutes: null, actual_minutes: null,
        reason: null, note: null, actor: 'user', metadata: {}, created_at: '2026-08-28T10:00:01Z', taskTitle: 'Offline target',
      }]),
      listRecentFeedback: vi.fn(async () => []),
    }
    const syncNow = vi.fn(async () => ({ attempted: 0, acknowledged: 0, retrying: 0, conflicts: 0 }))
    renderWithQuery(<HistoryPage userId="user-a" online repository={history} offlineRepository={offline} syncNow={syncNow} />)
    expect(await screen.findByText('Pending feedback')).toBeTruthy()
    expect(screen.getAllByText('Done')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Sync Now' }))
    expect(syncNow).toHaveBeenCalledWith(true)
  })
})
