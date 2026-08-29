// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTaskRingQueryClient } from '../src/app/queryClient'
import type { DailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import type { ActiveTodayPlan } from '../src/data/dailyPlans/models'
import { createOfflineRepository } from '../src/data/offline/offlineRepository'
import { TodayPage } from '../src/features/today/TodayPage'

const databases: ReturnType<typeof createOfflineRepository>[] = []

function offlineRepository() {
  const repository = createOfflineRepository(`wp008-r2-${crypto.randomUUID()}`)
  databases.push(repository)
  return repository
}

afterEach(async () => {
  cleanup()
  onlineManager.setOnline(true)
  for (const repository of databases.splice(0)) await repository.deleteDatabase()
  vi.restoreAllMocks()
})

function plan(): ActiveTodayPlan {
  return {
    plan: {
      id: 'plan-1',
      user_id: 'user-a',
      plan_date: '2026-08-28',
      revision: 1,
      status: 'active',
      capacity_minutes: null,
      capacity_breakdown: {},
      brief: null,
      created_by: 'user',
      created_at: '2026-08-28T00:00:00Z',
    },
    items: [{
      id: 'item-1',
      user_id: 'user-a',
      plan_id: 'plan-1',
      task_id: 'task-1',
      bucket: 'must',
      position: 0,
      planned_minutes: 60,
      reason: null,
      carryover_from_item_id: null,
      current_state: 'planned',
      created_at: '2026-08-28T00:00:00Z',
      updated_at: '2026-08-28T00:00:00Z',
      latestEvent: null,
      task: {
        id: 'task-1',
        user_id: 'user-a',
        project_id: null,
        title: 'Offline target',
        description: null,
        status: 'active',
        task_kind: 'normal',
        priority_hint: 'high',
        due_at: null,
        not_before: null,
        estimate_minutes: 60,
        remaining_minutes: 60,
        execution_context: 'deep',
        recurrence_rule: null,
        recurrence_timezone: null,
        checklist: [],
        created_by: 'user',
        created_at: '2026-08-28T00:00:00Z',
        updated_at: '2026-08-28T00:00:00Z',
        completed_at: null,
      },
      project: null,
    }],
  }
}

function serverRepository(): DailyPlanRepository {
  return {
    getActivePlan: vi.fn(async () => plan().plan),
    getPlanItems: vi.fn(async () => plan().items),
    getCandidateTasks: vi.fn(async () => []),
    publishPlan: vi.fn(),
  }
}

function renderOffline(repository: ReturnType<typeof createOfflineRepository>, server: DailyPlanRepository) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <TodayPage
        userId="user-a"
        online={false}
        repository={server}
        offlineRepository={repository}
        planningTimeZone="Asia/Tokyo"
        now={new Date('2026-08-28T00:30:00Z')}
      />
    </QueryClientProvider>,
  )
}

describe('WP008 R2 offline local query scheduling', () => {
  it('executes the IndexedDB Today snapshot query while TanStack onlineManager is offline', async () => {
    const offline = offlineRepository()
    await offline.saveTodaySnapshot('user-a', '2026-08-28', plan(), '2026-08-28T09:00:00Z')
    const readSnapshot = vi.spyOn(offline, 'getTodaySnapshot')
    const server = serverRepository()

    onlineManager.setOnline(false)
    renderOffline(offline, server)

    expect(await screen.findByText('Offline target')).toBeTruthy()
    expect(screen.getByText(/Offline snapshot/)).toBeTruthy()
    expect(readSnapshot).toHaveBeenCalledWith('user-a', '2026-08-28')
    expect(server.getActivePlan).not.toHaveBeenCalled()
    expect(server.getPlanItems).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading today’s plan…')).toBeNull()
  })

  it('completes the local read and renders the honest no-snapshot state while browser queries are offline', async () => {
    const offline = offlineRepository()
    const readSnapshot = vi.spyOn(offline, 'getTodaySnapshot')
    const server = serverRepository()

    onlineManager.setOnline(false)
    renderOffline(offline, server)

    expect(await screen.findByText('No offline Today plan is available.')).toBeTruthy()
    expect(readSnapshot).toHaveBeenCalledWith('user-a', '2026-08-28')
    expect(server.getActivePlan).not.toHaveBeenCalled()
    expect(server.getPlanItems).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading today’s plan…')).toBeNull()
  })

  it('keeps Pending Sync commands readable offline without TanStack network scheduling', async () => {
    const offline = offlineRepository()
    await offline.saveTodaySnapshot('user-a', '2026-08-28', plan(), '2026-08-28T09:00:00Z')
    await offline.enqueueExecution({
      localId: 'execution:pending-event',
      userId: 'user-a',
      planDate: '2026-08-28',
      eventId: 'pending-event',
      planItemId: 'item-1',
      expectedState: 'planned',
      action: 'done',
      occurredAt: '2026-08-28T10:00:00Z',
      createdAt: '2026-08-28T10:00:00Z',
    })
    const server = serverRepository()

    onlineManager.setOnline(false)
    renderOffline(offline, server)

    expect(await screen.findByText('Offline target')).toBeTruthy()
    expect(await screen.findByText('Pending Sync')).toBeTruthy()
    expect(server.getActivePlan).not.toHaveBeenCalled()
  })

  it('does not globally force Supabase-backed queries to networkMode always', () => {
    const client = createTaskRingQueryClient()
    expect(client.getDefaultOptions().queries?.networkMode).not.toBe('always')
    client.clear()
  })
})
