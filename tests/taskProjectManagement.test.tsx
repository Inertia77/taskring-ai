// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Project, ProjectCreateInput, ProjectUpdateInput, Task, TaskCreateInput, TaskUpdateInput } from '../src/data/models'
import type { ManagementRepositories } from '../src/features/tasks/TasksPage'
import { TasksPage } from '../src/features/tasks/TasksPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    user_id: 'user-a',
    goal_id: null,
    title: 'Launch project',
    status: 'active',
    priority_hint: 'high',
    target_date: null,
    notes: null,
    created_at: '2026-08-28T00:00:00.000Z',
    updated_at: '2026-08-28T00:00:00.000Z',
    ...overrides,
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-a',
    project_id: null,
    title: 'Draft task',
    description: null,
    status: 'active',
    task_kind: 'normal',
    priority_hint: null,
    due_at: null,
    not_before: null,
    estimate_minutes: null,
    remaining_minutes: null,
    execution_context: 'any',
    recurrence_rule: null,
    recurrence_timezone: null,
    checklist: [],
    created_by: 'user',
    created_at: '2026-08-28T00:00:00.000Z',
    updated_at: '2026-08-28T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

function makeRepositories(initialTasks: Task[] = [], initialProjects: Project[] = []) {
  let tasks = [...initialTasks]
  let projects = [...initialProjects]

  const repositories: ManagementRepositories = {
    tasks: {
      list: vi.fn(async () => [...tasks]),
      create: vi.fn(async (input: TaskCreateInput) => {
        const row = task({
          id: `task-${tasks.length + 1}`,
          title: input.title,
          description: input.description,
          project_id: input.projectId,
          priority_hint: input.priorityHint,
          due_at: input.dueAt,
          not_before: input.notBefore,
          estimate_minutes: input.estimateMinutes,
          execution_context: input.executionContext,
          task_kind: input.taskKind,
        })
        tasks = [row, ...tasks]
        return row
      }),
      update: vi.fn(async (id: string, input: TaskUpdateInput) => {
        const current = tasks.find((item) => item.id === id)!
        const row = {
          ...current,
          title: input.title,
          description: input.description,
          project_id: input.projectId,
          priority_hint: input.priorityHint,
          due_at: input.dueAt,
          not_before: input.notBefore,
          estimate_minutes: input.estimateMinutes,
          remaining_minutes: input.remainingMinutes,
          execution_context: input.executionContext,
          task_kind: input.taskKind,
          status: input.status,
          updated_at: '2026-08-28T01:00:00.000Z',
        }
        tasks = tasks.map((item) => item.id === id ? row : item)
        return row
      }),
      cancel: vi.fn(async (id: string) => {
        const current = tasks.find((item) => item.id === id)!
        const row = { ...current, status: 'cancelled', updated_at: '2026-08-28T01:00:00.000Z' }
        tasks = tasks.map((item) => item.id === id ? row : item)
        return row
      }),
    },
    projects: {
      list: vi.fn(async () => [...projects]),
      create: vi.fn(async (input: ProjectCreateInput) => {
        const row = project({
          id: `project-${projects.length + 1}`,
          title: input.title,
          priority_hint: input.priorityHint,
          target_date: input.targetDate,
          notes: input.notes,
        })
        projects = [row, ...projects]
        return row
      }),
      update: vi.fn(async (id: string, input: ProjectUpdateInput) => {
        const current = projects.find((item) => item.id === id)!
        const row = {
          ...current,
          title: input.title,
          priority_hint: input.priorityHint,
          target_date: input.targetDate,
          notes: input.notes,
          status: input.status,
          updated_at: '2026-08-28T01:00:00.000Z',
        }
        projects = projects.map((item) => item.id === id ? row : item)
        return row
      }),
      cancel: vi.fn(async (id: string) => {
        const current = projects.find((item) => item.id === id)!
        const row = { ...current, status: 'cancelled', updated_at: '2026-08-28T01:00:00.000Z' }
        projects = projects.map((item) => item.id === id ? row : item)
        return row
      }),
    },
  }

  return repositories
}

function renderManagement(repositories: ManagementRepositories, online = true) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <TasksPage userId="user-a" online={online} repositories={repositories} />
    </QueryClientProvider>,
  )
  return { user }
}

describe('Task + Project management surface', () => {
  it('shows a real loading state instead of an empty state while reads are pending', () => {
    const never = new Promise<Task[]>(() => undefined)
    const repositories = makeRepositories()
    repositories.tasks.list = vi.fn(() => never)
    renderManagement(repositories)
    expect(screen.getByText('Loading tasks…')).toBeTruthy()
    expect(screen.queryByText('No tasks yet.')).toBeNull()
  })

  it('distinguishes Tasks and Projects empty states', async () => {
    const repositories = makeRepositories()
    const { user } = renderManagement(repositories)
    expect(await screen.findByText('No tasks yet.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(await screen.findByText('No projects yet.')).toBeTruthy()
  })

  it('renders task and project data returned by repositories', async () => {
    const ownProject = project()
    const repositories = makeRepositories([task({ project_id: ownProject.id, title: 'Server task' })], [ownProject])
    const { user } = renderManagement(repositories)
    expect(await screen.findByText('Server task')).toBeTruthy()
    expect(screen.getByText('Launch project')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(await screen.findByRole('heading', { name: 'Launch project' })).toBeTruthy()
  })

  it('validates create task input, saves server-confirmed data, and supports project assignment', async () => {
    const ownProject = project()
    const repositories = makeRepositories([], [ownProject])
    const { user } = renderManagement(repositories)
    await screen.findByText('No tasks yet.')
    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.click(screen.getByRole('button', { name: 'Save Task' }))
    expect(screen.getByText('Title is required.')).toBeTruthy()
    await user.type(screen.getByLabelText(/^Title/), 'Write launch brief')
    await user.selectOptions(screen.getByLabelText('Project'), ownProject.id)
    await user.type(screen.getByLabelText(/Estimate minutes/), '45')
    await user.click(screen.getByRole('button', { name: 'Save Task' }))
    expect(await screen.findByText('Write launch brief')).toBeTruthy()
    expect(repositories.tasks.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: ownProject.id, estimateMinutes: 45 }))
    const submitted = vi.mocked(repositories.tasks.create).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(submitted).not.toHaveProperty('user_id')
    expect(submitted).not.toHaveProperty('created_by')
  })

  it('edits a task definition without exposing completion or blocked as editor states', async () => {
    const repositories = makeRepositories([task()])
    const { user } = renderManagement(repositories)
    const heading = await screen.findByRole('heading', { name: 'Draft task' })
    const card = heading.closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText(/^Title/)
    await user.clear(title)
    await user.type(title, 'Revised task')
    const status = screen.getByLabelText(/^Management status/) as HTMLSelectElement
    expect([...status.options].map((option) => option.value)).toEqual(['active', 'waiting', 'paused', 'someday'])
    await user.selectOptions(status, 'waiting')
    await user.click(screen.getByRole('button', { name: 'Save Task' }))
    expect(await screen.findByRole('heading', { name: 'Revised task' })).toBeTruthy()
    expect(repositories.tasks.update).toHaveBeenCalled()
  })

  it('cancels a task through a dedicated soft lifecycle action', async () => {
    const repositories = makeRepositories([task()])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderManagement(repositories)
    const heading = await screen.findByRole('heading', { name: 'Draft task' })
    await user.click(within(heading.closest('article')!).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Task cancelled. The record was kept.')).toBeTruthy()
    expect(repositories.tasks.cancel).toHaveBeenCalledWith('task-1')
    expect(screen.getByText('cancelled')).toBeTruthy()
  })

  it('creates, edits, and cancels projects without hard delete', async () => {
    const repositories = makeRepositories()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderManagement(repositories)
    await user.click(screen.getByRole('tab', { name: 'Projects' }))
    await screen.findByText('No projects yet.')
    await user.click(screen.getByRole('button', { name: 'New Project' }))
    await user.type(screen.getByLabelText(/^Title/), 'Personal launch')
    await user.click(screen.getByRole('button', { name: 'Save Project' }))
    let heading = await screen.findByRole('heading', { name: 'Personal launch' })
    await user.click(within(heading.closest('article')!).getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText(/^Title/)
    await user.clear(title)
    await user.type(title, 'Personal launch v2')
    await user.click(screen.getByRole('button', { name: 'Save Project' }))
    heading = await screen.findByRole('heading', { name: 'Personal launch v2' })
    await user.click(within(heading.closest('article')!).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Project cancelled. The record was kept.')).toBeTruthy()
    expect(repositories.projects.create).toHaveBeenCalled()
    expect(repositories.projects.update).toHaveBeenCalled()
    expect(repositories.projects.cancel).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('shows data errors separately from empty state', async () => {
    const repositories = makeRepositories()
    repositories.tasks.list = vi.fn(async () => { throw new Error('network down') })
    renderManagement(repositories)
    expect(await screen.findByText('Could not load tasks.')).toBeTruthy()
    expect(screen.getByText('network down')).toBeTruthy()
    expect(screen.queryByText('No tasks yet.')).toBeNull()
  })

  it('rejects offline mutations honestly and does not enqueue fake saves', async () => {
    const repositories = makeRepositories()
    const { user } = renderManagement(repositories, false)
    await screen.findByText('No tasks yet.')
    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText(/^Title/), 'Offline task')
    await user.click(screen.getByRole('button', { name: 'Save Task' }))
    expect(await screen.findByText('Connect to the internet to save changes. Nothing was saved offline.')).toBeTruthy()
    expect(repositories.tasks.create).not.toHaveBeenCalled()
  })

  it('does not expose a completion checkbox on task management cards', async () => {
    renderManagement(makeRepositories([task()]))
    await screen.findByRole('heading', { name: 'Draft task' })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})
