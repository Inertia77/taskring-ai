// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyPlanRepository } from '../src/data/dailyPlans/dailyPlanRepository'
import {
  DailyPlanPublishError,
  type ActiveTodayPlan,
  type DailyPlan,
  type PublishDailyPlanInput,
  type TodayPlanItem,
} from '../src/data/dailyPlans/models'
import type { Project, Task } from '../src/data/models'
import { TodayPage } from '../src/features/today/TodayPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', user_id: 'user-a', project_id: null, title: 'Plan the launch', description: null,
    status: 'active', task_kind: 'normal', priority_hint: 'high', due_at: '2026-08-28T06:00:00.000Z',
    not_before: null, estimate_minutes: 45, remaining_minutes: 45, execution_context: 'deep', recurrence_rule: null,
    recurrence_timezone: null, checklist: [], created_by: 'user', created_at: '2026-08-28T00:00:00.000Z',
    updated_at: '2026-08-28T00:00:00.000Z', completed_at: null, ...overrides,
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1', user_id: 'user-a', goal_id: null, title: 'Launch project', status: 'active', priority_hint: null,
    target_date: null, notes: null, created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z',
    ...overrides,
  }
}

function plan(overrides: Partial<DailyPlan> = {}): DailyPlan {
  return {
    id: 'plan-1', user_id: 'user-a', plan_date: '2026-08-28', revision: 1, status: 'active', capacity_minutes: null,
    capacity_breakdown: {}, brief: null, created_by: 'user', created_at: '2026-08-28T00:00:00.000Z', ...overrides,
  }
}

function planItem(overrides: Partial<TodayPlanItem> = {}): TodayPlanItem {
  const baseTask = task()
  return {
    id: 'item-1', user_id: 'user-a', plan_id: 'plan-1', task_id: baseTask.id, bucket: 'must', position: 0,
    planned_minutes: 45, reason: null, carryover_from_item_id: null, current_state: 'planned',
    created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z', task: baseTask, project: null,
    ...overrides,
  }
}

function renderToday(repository: DailyPlanRepository, online = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TodayPage userId="user-a" online={online} repository={repository} planningTimeZone="Asia/Tokyo" now={new Date('2026-08-28T00:30:00.000Z')} />
    </QueryClientProvider>,
  )
}

function makeRepository(initialPlan: ActiveTodayPlan | null, candidates: Task[] = []) {
  let current = initialPlan
  let revision = initialPlan?.plan.revision ?? 0
  const repository: DailyPlanRepository = {
    getActivePlan: vi.fn(async () => current?.plan ?? null),
    getPlanItems: vi.fn(async () => current?.items ?? []),
    getCandidateTasks: vi.fn(async () => candidates),
    publishPlan: vi.fn(async (input: PublishDailyPlanInput) => {
      revision += 1
      const nextPlan = plan({ id: `plan-${revision}`, revision })
      current = {
        plan: nextPlan,
        items: input.items.map((item, index) => {
          const selected = candidates.find((candidate) => candidate.id === item.task_id)
            ?? initialPlan?.items.find((existing) => existing.task_id === item.task_id)?.task
            ?? task({ id: item.task_id, title: `Task ${index + 1}` })
          return planItem({ id: `item-${revision}-${index}`, plan_id: nextPlan.id, task_id: item.task_id, task: selected, bucket: item.bucket, position: item.position, planned_minutes: item.planned_minutes })
        }),
      }
      return { planId: nextPlan.id, revision }
    }),
  }
  return repository
}

function builderItem(title: string) {
  return screen.getByText(title, { selector: 'strong' }).closest('article')!
}

describe('Today Daily Plan surface', () => {
  it('shows loading and then the real no-plan state without fake tasks', async () => {
    let resolvePlan!: (value: DailyPlan | null) => void
    const pending = new Promise<DailyPlan | null>((resolve) => { resolvePlan = resolve })
    const repository: DailyPlanRepository = {
      getActivePlan: vi.fn(() => pending), getPlanItems: vi.fn(async () => []), getCandidateTasks: vi.fn(async () => []), publishPlan: vi.fn(),
    }
    renderToday(repository)
    expect(screen.getByText('Loading today’s plan…')).toBeTruthy()
    resolvePlan(null)
    expect(await screen.findByText('No plan published for today.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Build Today Plan' })).toBeTruthy()
  })

  it('renders real plan buckets in official order and items by position with execution controls and no fake brief', async () => {
    const launchProject = project()
    const mustLater = task({ id: 'must-2', title: 'Second MUST', project_id: launchProject.id })
    const mustFirst = task({ id: 'must-1', title: 'First MUST', project_id: launchProject.id })
    const should = task({ id: 'should-1', title: 'Only SHOULD' })
    const bonus = task({ id: 'bonus-1', title: 'Optional bonus' })
    const active: ActiveTodayPlan = {
      plan: plan({ revision: 3 }),
      items: [
        planItem({ id: 'b', task_id: bonus.id, task: bonus, bucket: 'bonus', position: 0 }),
        planItem({ id: 'm2', task_id: mustLater.id, task: mustLater, project: launchProject, bucket: 'must', position: 1 }),
        planItem({ id: 's', task_id: should.id, task: should, bucket: 'should', position: 0 }),
        planItem({ id: 'm1', task_id: mustFirst.id, task: mustFirst, project: launchProject, bucket: 'must', position: 0 }),
      ],
    }
    renderToday(makeRepository(active))
    expect(await screen.findByText('Revision 3')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['🔥 MUST', '⭐ SHOULD', '💭 BONUS'])
    const mustSection = screen.getByRole('heading', { name: '🔥 MUST' }).closest('section')!
    expect(within(mustSection).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['First MUST', 'Second MUST'])
    expect(within(mustSection).getAllByText('Launch project')).toHaveLength(2)
    expect(screen.queryByText('Plan brief')).toBeNull()
    for (const forbidden of ['Done', 'Partial', 'Defer', 'Blocked']) expect(screen.queryByRole('button', { name: forbidden })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeTruthy()
  })

  it('builder offers active candidates only, prevents duplicate selection, validates minutes, changes buckets, reorders and removes', async () => {
    const user = userEvent.setup()
    const first = task({ id: 'a', title: 'Alpha' })
    const second = task({ id: 'b', title: 'Beta' })
    const paused = task({ id: 'paused', title: 'Paused candidate', status: 'paused' })
    const repository = makeRepository(null, [first, second, paused])
    renderToday(repository)
    await user.click(await screen.findByRole('button', { name: 'Build Today Plan' }))
    const candidate = await screen.findByLabelText('Add active task')
    expect(within(candidate).getByRole('option', { name: 'Alpha' })).toBeTruthy()
    expect(within(candidate).getByRole('option', { name: 'Beta' })).toBeTruthy()
    expect(within(candidate).queryByRole('option', { name: 'Paused candidate' })).toBeNull()
    await user.selectOptions(candidate, 'a')
    await user.click(screen.getByRole('button', { name: 'Add Task' }))
    expect(within(candidate).queryByRole('option', { name: 'Alpha' })).toBeNull()
    await user.selectOptions(candidate, 'b')
    await user.click(screen.getByRole('button', { name: 'Add Task' }))

    await user.selectOptions(within(builderItem('Alpha')).getByLabelText('Bucket'), 'must')
    await user.selectOptions(within(builderItem('Beta')).getByLabelText('Bucket'), 'must')

    let alpha = builderItem('Alpha')
    await user.clear(within(alpha).getByLabelText(/Planned minutes/))
    await user.type(within(alpha).getByLabelText(/Planned minutes/), '1.5')
    await user.click(screen.getByRole('button', { name: 'Publish Plan' }))
    alpha = builderItem('Alpha')
    expect((await within(alpha).findByRole('alert')).textContent).toContain('whole number')
    expect(repository.publishPlan).not.toHaveBeenCalled()

    alpha = builderItem('Alpha')
    await user.clear(within(alpha).getByLabelText(/Planned minutes/))
    await user.type(within(alpha).getByLabelText(/Planned minutes/), '30')
    alpha = builderItem('Alpha')
    await user.click(within(alpha).getByRole('button', { name: 'Move Down' }))
    const mustBucket = screen.getByRole('heading', { name: '🔥 MUST' }).closest('section')!
    expect(within(mustBucket).getAllByRole('article').map((article) => article.querySelector('strong')?.textContent)).toEqual(['Beta', 'Alpha'])
    await user.click(within(builderItem('Beta')).getByRole('button', { name: 'Remove Task' }))
    expect(screen.queryByText('Beta', { selector: 'strong' })).toBeNull()
    expect(within(candidate).getByRole('option', { name: 'Beta' })).toBeTruthy()
  })

  it('publishes and refetches into a new displayed revision', async () => {
    const user = userEvent.setup()
    const first = task({ id: 'a', title: 'Alpha' })
    const repository = makeRepository(null, [first])
    renderToday(repository)
    await user.click(await screen.findByRole('button', { name: 'Build Today Plan' }))
    const candidate = await screen.findByLabelText('Add active task')
    await user.selectOptions(candidate, 'a')
    await user.click(screen.getByRole('button', { name: 'Add Task' }))
    await user.click(screen.getByRole('button', { name: 'Publish Plan' }))
    expect(await screen.findByText('Revision 1')).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(repository.publishPlan).toHaveBeenCalledTimes(1)
    expect(repository.getActivePlan).toHaveBeenCalledTimes(2)
  })

  it('shows a clear stale-plan refresh message', async () => {
    const user = userEvent.setup()
    const repository = makeRepository(null, [])
    repository.publishPlan = vi.fn(async () => { throw new DailyPlanPublishError('stale', 'Today’s plan changed elsewhere. Refresh before publishing again.') })
    renderToday(repository)
    await user.click(await screen.findByRole('button', { name: 'Build Today Plan' }))
    await user.click(screen.getByRole('button', { name: 'Publish Plan' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Refresh before publishing again')
    expect(alert.textContent).toContain('Reload Today')
  })

  it('rejects offline publication honestly and does not call the repository', async () => {
    const user = userEvent.setup()
    const repository = makeRepository(null, [])
    renderToday(repository, false)
    await user.click(await screen.findByRole('button', { name: 'Build Today Plan' }))
    await user.click(screen.getByRole('button', { name: 'Publish Plan' }))
    expect((await screen.findByRole('alert')).textContent).toContain("Connect to the internet to publish today's plan. Nothing was saved offline.")
    expect(repository.publishPlan).not.toHaveBeenCalled()
  })

  it('blocks editing once a plan item has entered execution state', async () => {
    const repository = makeRepository({ plan: plan(), items: [planItem({ current_state: 'started' })] })
    renderToday(repository)
    expect(await screen.findByText(/Execution has started\. Plan history is locked/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Today’s Plan' }).hasAttribute('disabled')).toBe(true)
  })
})
