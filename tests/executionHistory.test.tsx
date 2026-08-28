// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import type { DailyPlan, TodayPlanItem } from '../src/data/dailyPlans/models'
import type { ExecutionRepository } from '../src/data/execution/executionRepository'
import type { HistoryEvent, HistoryFeedback, HistoryRepository } from '../src/data/history/historyRepository'
import type { Task } from '../src/data/models'
import { HistoryPage } from '../src/features/history/HistoryPage'
import { TodayExecutionControls } from '../src/features/today/TodayExecutionControls'
import { TodayPage } from '../src/features/today/TodayPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', user_id: 'user-a', project_id: null, title: 'Ship TaskRing', description: null,
    status: 'active', task_kind: 'normal', priority_hint: 'high', due_at: null, not_before: null,
    estimate_minutes: 60, remaining_minutes: 60, execution_context: 'deep', recurrence_rule: null,
    recurrence_timezone: null, checklist: [], created_by: 'user', created_at: '2026-08-28T00:00:00Z',
    updated_at: '2026-08-28T00:00:00Z', completed_at: null, ...overrides,
  }
}

function item(state: TodayPlanItem['current_state'] = 'planned'): TodayPlanItem {
  const baseTask = task({ status: state === 'done' ? 'done' : state === 'blocked' ? 'blocked' : state === 'cancelled' ? 'cancelled' : 'active' })
  return {
    id: 'item-1', user_id: 'user-a', plan_id: 'plan-1', task_id: baseTask.id, bucket: 'must', position: 0,
    planned_minutes: 60, reason: null, carryover_from_item_id: null, current_state: state,
    created_at: '2026-08-28T00:00:00Z', updated_at: '2026-08-28T00:00:00Z', task: baseTask, project: null,
    latestEvent: null,
  }
}

function plan(): DailyPlan {
  return {
    id: 'plan-1', user_id: 'user-a', plan_date: '2026-08-28', revision: 1, status: 'active', capacity_minutes: null,
    capacity_breakdown: {}, brief: null, created_by: 'user', created_at: '2026-08-28T00:00:00Z',
  }
}

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('Today human execution controls', () => {
  it('uses the Done checkbox as a one-click primary action and surfaces failures without fake completion', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn(async () => undefined)
    const onFeedback = vi.fn(async () => undefined)
    const planned = item('planned')
    const view = render(<TodayExecutionControls item={planned} busy={false} online onAction={onAction} onFeedback={onFeedback} />)

    const checkbox = screen.getByRole('checkbox', { name: 'Mark Ship TaskRing done' })
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    await user.click(checkbox)
    expect(onAction).toHaveBeenCalledWith('done', undefined)
    expect((checkbox as HTMLInputElement).checked).toBe(false)

    view.unmount()
    const failing = vi.fn(async () => { throw new Error('Atomic action failed') })
    render(<TodayExecutionControls item={planned} busy={false} online onAction={failing} onFeedback={onFeedback} />)
    await user.click(screen.getByRole('checkbox', { name: 'Mark Ship TaskRing done' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Atomic action failed')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('validates and records Partial detail without allowing 100 percent', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn(async () => undefined)
    render(<TodayExecutionControls item={item()} busy={false} online onAction={onAction} onFeedback={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Partial' }))
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Progress % or Remaining minutes')

    await user.type(screen.getByLabelText('Progress %'), '100')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(screen.getByRole('alert').textContent).toContain('less than 100')
    expect(onAction).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Progress %'))
    await user.type(screen.getByLabelText('Progress %'), '40')
    await user.type(screen.getByLabelText('Remaining minutes'), '25')
    await user.type(screen.getByLabelText('Actual minutes'), '20')
    await user.type(screen.getByLabelText('Note'), 'Made progress')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(onAction).toHaveBeenCalledWith('partial', {
      progressPercent: 40,
      remainingMinutes: 25,
      actualMinutes: 20,
      note: 'Made progress',
    })
  })

  it.each([
    ['started', 'Start'],
    ['skipped', 'Skip Today'],
    ['deferred', 'Defer'],
    ['blocked', 'Blocked'],
    ['cancelled', 'Cancel'],
  ] as const)('exposes the %s action through progressive disclosure', async (action, label) => {
    const user = userEvent.setup()
    const onAction = vi.fn(async () => undefined)
    render(<TodayExecutionControls item={item()} busy={false} online onAction={onAction} onFeedback={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: label }))
    expect(onAction).toHaveBeenCalledWith(action, undefined)
  })

  it('offers Reopen for terminal states and preserves Add Feedback as a separate command', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn(async () => undefined)
    const onFeedback = vi.fn(async () => undefined)
    render(<TodayExecutionControls item={item('done')} busy={false} online onAction={onAction} onFeedback={onFeedback} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(onAction).toHaveBeenCalledWith('reopened', undefined)

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Add Feedback' }))
    await user.type(screen.getByLabelText('What should TaskRing remember?'), 'Estimate was too small')
    await user.click(screen.getByRole('button', { name: 'Save Feedback' }))
    expect(onFeedback).toHaveBeenCalledWith('Estimate was too small')
  })

  it('rejects offline execution before calling the execution repository', async () => {
    const user = userEvent.setup()
    const planned = item()
    const dailyRepository: DailyPlanRepository = {
      getActivePlan: vi.fn(async () => plan()),
      getPlanItems: vi.fn(async () => [planned]),
      getCandidateTasks: vi.fn(async () => []),
      publishPlan: vi.fn(),
    }
    const executionRepository: ExecutionRepository = {
      recordAction: vi.fn(),
      addFeedback: vi.fn(),
    }
    renderWithQuery(
      <TodayPage
        userId="user-a"
        online={false}
        repository={dailyRepository}
        executionRepository={executionRepository}
        planningTimeZone="Asia/Tokyo"
        now={new Date('2026-08-28T00:30:00Z')}
        idFactory={() => 'event-offline'}
      />,
    )
    await user.click(await screen.findByRole('checkbox', { name: 'Mark Ship TaskRing done' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Connect to the internet to record this action. Nothing was saved offline.')
    expect(executionRepository.recordAction).not.toHaveBeenCalled()
  })
})

describe('History execution timeline', () => {
  it('renders immutable event ordering and raw feedback without edit/delete controls', async () => {
    const events: HistoryEvent[] = [
      {
        id: 'event-new', user_id: 'user-a', task_id: 'task-1', plan_item_id: 'item-1', event_type: 'done',
        occurred_at: '2026-08-28T11:00:00Z', progress_percent: null, remaining_minutes: 0, actual_minutes: 45,
        reason: null, note: 'Finished', actor: 'user', metadata: {}, created_at: '2026-08-28T11:00:00Z', taskTitle: 'Ship TaskRing',
      },
      {
        id: 'event-old', user_id: 'user-a', task_id: 'task-1', plan_item_id: 'item-1', event_type: 'partial',
        occurred_at: '2026-08-28T10:00:00Z', progress_percent: 40, remaining_minutes: 25, actual_minutes: 20,
        reason: 'checkpoint', note: null, actor: 'user', metadata: {}, created_at: '2026-08-28T10:00:00Z', taskTitle: 'Ship TaskRing',
      },
    ]
    const feedback: HistoryFeedback[] = [{
      id: 'feedback-1', user_id: 'user-a', task_id: 'task-1', plan_id: 'plan-1', plan_item_id: 'item-1',
      content: 'Needed more time', source: 'frontend', ai_interpretation: null, created_at: '2026-08-28T11:05:00Z', applied_at: null,
      taskTitle: 'Ship TaskRing',
    }]
    const repository: HistoryRepository = {
      listRecentEvents: vi.fn(async () => events),
      listRecentFeedback: vi.fn(async () => feedback),
    }
    renderWithQuery(<HistoryPage userId="user-a" repository={repository} />)
    const timeline = await screen.findByRole('list', { name: 'Recent task events' })
    const rows = within(timeline).getAllByRole('listitem')
    expect(rows[0].textContent).toContain('done')
    expect(rows[1].textContent).toContain('partial')
    expect(rows[1].textContent).toContain('40% progress')
    expect(screen.getByText('Needed more time')).toBeTruthy()
    expect(screen.getByText(/No AI interpretation/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /edit event/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete event/i })).toBeNull()
  })
})
