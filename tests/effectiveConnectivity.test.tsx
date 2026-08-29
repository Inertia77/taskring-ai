// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import type { ActiveTodayPlan } from '../src/data/dailyPlans/models'
import { createOfflineRepository } from '../src/data/offline/offlineRepository'
import type { OutboxSyncEngine } from '../src/data/offline/syncEngine'
import { useOutboxAutoSync } from '../src/data/offline/useOutboxAutoSync'
import { TodayPage } from '../src/features/today/TodayPage'
import { useEffectiveConnectivity } from '../src/hooks/useNetworkStatus'

const projectUrl = 'https://example.supabase.co'
const publishableKey = 'publishable-key'
const databases: ReturnType<typeof createOfflineRepository>[] = []

function setBrowserOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

function offlineRepository() {
  const repository = createOfflineRepository(`wp008-connectivity-${crypto.randomUUID()}`)
  databases.push(repository)
  return repository
}

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

function dailyRepository(): DailyPlanRepository {
  return {
    getActivePlan: vi.fn(async () => todayPlan().plan),
    getPlanItems: vi.fn(async () => todayPlan().items),
    getCandidateTasks: vi.fn(async () => []),
    publishPlan: vi.fn(),
  }
}

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function ConnectivityToday({
  fetchImpl,
  repository,
  localRepository,
}: {
  fetchImpl: typeof fetch
  repository: DailyPlanRepository
  localRepository: ReturnType<typeof createOfflineRepository>
}) {
  const connectivity = useEffectiveConnectivity({
    projectUrl,
    publishableKey,
    fetchImpl,
    retryDelaysMs: [60_000],
  })

  return (
    <>
      <span data-testid="effective-health">{connectivity.supabaseHealth}</span>
      <TodayPage
        userId="user-a"
        online={connectivity.online}
        repository={repository}
        offlineRepository={localRepository}
        planningTimeZone="Asia/Tokyo"
        now={new Date('2026-08-28T00:30:00Z')}
      />
    </>
  )
}

function ConnectivitySync({ fetchImpl, syncEngine }: { fetchImpl: typeof fetch; syncEngine: OutboxSyncEngine }) {
  const connectivity = useEffectiveConnectivity({
    projectUrl,
    publishableKey,
    fetchImpl,
    retryDelaysMs: [10],
  })
  useOutboxAutoSync(connectivity.online, syncEngine)
  return <span data-testid="effective-health">{connectivity.supabaseHealth}</span>
}

beforeEach(() => {
  setBrowserOnline(true)
})

afterEach(async () => {
  cleanup()
  for (const repository of databases.splice(0)) await repository.deleteDatabase()
  vi.restoreAllMocks()
})

describe('effective connectivity boundary', () => {
  it('treats navigator.onLine=true plus an unreachable Supabase health endpoint as effectively offline', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useEffectiveConnectivity({
      projectUrl,
      publishableKey,
      fetchImpl: fetchMock,
      retryDelaysMs: [60_000],
    }))

    await waitFor(() => expect(result.current.supabaseHealth).toBe('offline'))
    expect(window.navigator.onLine).toBe(true)
    expect(result.current.online).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('goes offline immediately on a browser offline event without probing Supabase again', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))
    const { result } = renderHook(() => useEffectiveConnectivity({ projectUrl, publishableKey, fetchImpl: fetchMock }))

    await waitFor(() => expect(result.current.online).toBe(true))
    const callsBeforeOffline = fetchMock.mock.calls.length
    setBrowserOnline(false)
    window.dispatchEvent(new Event('offline'))

    await waitFor(() => expect(result.current.supabaseHealth).toBe('offline'))
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOffline)
  })

  it('uses the IndexedDB Today snapshot when health fails even though no browser offline event occurred', async () => {
    const localRepository = offlineRepository()
    await localRepository.saveTodaySnapshot('user-a', '2026-08-28', todayPlan(), '2026-08-28T09:00:00Z')
    const repository = dailyRepository()
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('net::ERR_INTERNET_DISCONNECTED'))

    renderWithQuery(
      <ConnectivityToday fetchImpl={fetchMock} repository={repository} localRepository={localRepository} />,
    )

    expect(await screen.findByText('Offline target')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('effective-health').textContent).toBe('offline'))
    expect(screen.getByText(/Offline snapshot/)).toBeTruthy()
    expect(repository.getActivePlan).not.toHaveBeenCalled()
  })

  it('shows the honest no-snapshot state instead of inventing Today when effectively offline', async () => {
    const localRepository = offlineRepository()
    const repository = dailyRepository()
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    renderWithQuery(
      <ConnectivityToday fetchImpl={fetchMock} repository={repository} localRepository={localRepository} />,
    )

    expect(await screen.findByText('No offline Today plan is available.')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('effective-health').textContent).toBe('offline'))
    expect(screen.queryByText('Offline target')).toBeNull()
    expect(repository.getActivePlan).not.toHaveBeenCalled()
  })

  it('recovers through bounded health retry and automatically drains the outbox when effective online returns', async () => {
    let resolveRecovery!: (response: Response) => void
    const recovery = new Promise<Response>((resolve) => { resolveRecovery = resolve })
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(() => recovery)
    const syncNow = vi.fn(async () => ({ attempted: 1, acknowledged: 1, retrying: 0, conflicts: 0 }))
    const syncEngine: OutboxSyncEngine = { syncNow }

    render(<ConnectivitySync fetchImpl={fetchMock} syncEngine={syncEngine} />)

    await waitFor(() => expect(screen.getByTestId('effective-health').textContent).toBe('offline'))
    expect(syncNow).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    resolveRecovery(new Response('{}', { status: 200 }))

    await waitFor(() => expect(screen.getByTestId('effective-health').textContent).toBe('online'))
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
    expect(syncNow).toHaveBeenCalledWith(false)
  })
})
