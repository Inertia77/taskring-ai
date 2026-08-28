import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatLocalDateTime, isoToLocalDateTimeValue } from '../../data/dateTime'
import {
  type ProjectDraft,
  type TaskDraft,
  validateProjectDraft,
  validateTaskDraft,
} from '../../data/formValidation'
import {
  EXECUTION_CONTEXTS,
  PRIORITY_HINTS,
  PROJECT_MANAGEABLE_STATUSES,
  TASK_KINDS,
  TASK_MANAGEABLE_STATUSES,
  isAssignableProject,
  type Project,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  type Task,
  type TaskCreateInput,
  type TaskUpdateInput,
} from '../../data/models'
import { createProjectRepository, type ProjectRepository } from '../../data/projects/projectRepository'
import { managementQueryKeys } from '../../data/queryKeys'
import { createTaskRepository, type TaskRepository } from '../../data/tasks/taskRepository'
import { supabase } from '../../lib/supabaseClient'

export interface ManagementRepositories {
  tasks: TaskRepository
  projects: ProjectRepository
}

interface TasksPageProps {
  userId: string
  online: boolean
  repositories?: ManagementRepositories
}

type Surface = 'tasks' | 'projects'
type TaskEditorState = { mode: 'create' } | { mode: 'edit'; task: Task }
type ProjectEditorState = { mode: 'create' } | { mode: 'edit'; project: Project }

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'The server request failed.'
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error" role="alert">{message}</span> : null
}

function TaskEditor({
  state,
  projects,
  busy,
  onSave,
  onClose,
}: {
  state: TaskEditorState
  projects: Project[]
  busy: boolean
  onSave: (input: TaskCreateInput | TaskUpdateInput) => Promise<void>
  onClose: () => void
}) {
  const task = state.mode === 'edit' ? state.task : null
  const [draft, setDraft] = useState<TaskDraft>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    projectId: task?.project_id ?? '',
    priorityHint: task?.priority_hint ?? '',
    dueAtLocal: isoToLocalDateTimeValue(task?.due_at ?? null),
    notBeforeLocal: isoToLocalDateTimeValue(task?.not_before ?? null),
    estimateMinutes: task?.estimate_minutes?.toString() ?? '',
    remainingMinutes: task?.remaining_minutes?.toString() ?? '',
    executionContext: task?.execution_context ?? 'any',
    taskKind: task?.task_kind ?? 'normal',
    status: task?.status ?? 'active',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const allowedProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects])

  const set = (field: keyof TaskDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = validateTaskDraft(draft, allowedProjectIds, state.mode)
    if (!result.value) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    await onSave(result.value)
  }

  return (
    <section className="management-editor" aria-labelledby="task-editor-title">
      <div className="management-editor-heading">
        <div>
          <p className="page-kicker">Task definition</p>
          <h2 id="task-editor-title">{state.mode === 'create' ? 'New Task' : 'Edit Task'}</h2>
        </div>
        <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Close</button>
      </div>

      <form className="management-form" onSubmit={(event) => void submit(event)} noValidate>
        <label>
          Title
          <input value={draft.title} onChange={(event) => set('title', event.target.value)} aria-invalid={Boolean(errors.title)} />
          <FieldError message={errors.title} />
        </label>

        <label>
          Description <span className="optional-label">Optional</span>
          <textarea value={draft.description} onChange={(event) => set('description', event.target.value)} rows={3} />
        </label>

        <div className="form-grid">
          <label>
            Project
            <select value={draft.projectId} onChange={(event) => set('projectId', event.target.value)} aria-invalid={Boolean(errors.projectId)}>
              <option value="">No Project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <FieldError message={errors.projectId} />
          </label>

          <label>
            Priority <span className="optional-label">Optional</span>
            <select value={draft.priorityHint} onChange={(event) => set('priorityHint', event.target.value)}>
              <option value="">None</option>
              {PRIORITY_HINTS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            Due <span className="optional-label">Local time</span>
            <input type="datetime-local" value={draft.dueAtLocal} onChange={(event) => set('dueAtLocal', event.target.value)} aria-invalid={Boolean(errors.dueAtLocal)} />
            <FieldError message={errors.dueAtLocal} />
          </label>
          <label>
            Not before <span className="optional-label">Local time</span>
            <input type="datetime-local" value={draft.notBeforeLocal} onChange={(event) => set('notBeforeLocal', event.target.value)} aria-invalid={Boolean(errors.notBeforeLocal)} />
            <FieldError message={errors.notBeforeLocal} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Estimate minutes <span className="optional-label">Optional</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={draft.estimateMinutes} onChange={(event) => set('estimateMinutes', event.target.value)} aria-invalid={Boolean(errors.estimateMinutes)} />
            <FieldError message={errors.estimateMinutes} />
          </label>
          {state.mode === 'edit' ? (
            <label>
              Remaining minutes <span className="optional-label">Optional</span>
              <input type="number" min="0" step="1" inputMode="numeric" value={draft.remainingMinutes} onChange={(event) => set('remainingMinutes', event.target.value)} aria-invalid={Boolean(errors.remainingMinutes)} />
              <FieldError message={errors.remainingMinutes} />
            </label>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            Execution context
            <select value={draft.executionContext} onChange={(event) => set('executionContext', event.target.value)}>
              {EXECUTION_CONTEXTS.map((context) => <option key={context} value={context}>{context}</option>)}
            </select>
          </label>
          <label>
            Task kind
            <select value={draft.taskKind} onChange={(event) => set('taskKind', event.target.value)}>
              {TASK_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
        </div>

        {state.mode === 'edit' ? (
          <label>
            Management status
            <select value={draft.status} onChange={(event) => set('status', event.target.value)} aria-invalid={Boolean(errors.status)}>
              {TASK_MANAGEABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <FieldError message={errors.status} />
            <span className="field-help">Completion and blocked state are handled by the future execution event flow.</span>
          </label>
        ) : null}

        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Task'}</button>
      </form>
    </section>
  )
}

function ProjectEditor({
  state,
  busy,
  onSave,
  onClose,
}: {
  state: ProjectEditorState
  busy: boolean
  onSave: (input: ProjectCreateInput | ProjectUpdateInput) => Promise<void>
  onClose: () => void
}) {
  const project = state.mode === 'edit' ? state.project : null
  const [draft, setDraft] = useState<ProjectDraft>({
    title: project?.title ?? '',
    priorityHint: project?.priority_hint ?? '',
    targetDate: project?.target_date ?? '',
    notes: project?.notes ?? '',
    status: project?.status ?? 'active',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (field: keyof ProjectDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = validateProjectDraft(draft, state.mode)
    if (!result.value) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    await onSave(result.value)
  }

  return (
    <section className="management-editor" aria-labelledby="project-editor-title">
      <div className="management-editor-heading">
        <div>
          <p className="page-kicker">Project definition</p>
          <h2 id="project-editor-title">{state.mode === 'create' ? 'New Project' : 'Edit Project'}</h2>
        </div>
        <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Close</button>
      </div>

      <form className="management-form" onSubmit={(event) => void submit(event)} noValidate>
        <label>
          Title
          <input value={draft.title} onChange={(event) => set('title', event.target.value)} aria-invalid={Boolean(errors.title)} />
          <FieldError message={errors.title} />
        </label>

        <div className="form-grid">
          <label>
            Priority <span className="optional-label">Optional</span>
            <select value={draft.priorityHint} onChange={(event) => set('priorityHint', event.target.value)}>
              <option value="">None</option>
              {PRIORITY_HINTS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label>
            Target date <span className="optional-label">Optional</span>
            <input type="date" value={draft.targetDate} onChange={(event) => set('targetDate', event.target.value)} />
          </label>
        </div>

        <label>
          Notes <span className="optional-label">Optional</span>
          <textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
        </label>

        {state.mode === 'edit' ? (
          <label>
            Management status
            <select value={draft.status} onChange={(event) => set('status', event.target.value)} aria-invalid={Boolean(errors.status)}>
              {PROJECT_MANAGEABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <FieldError message={errors.status} />
          </label>
        ) : null}

        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Project'}</button>
      </form>
    </section>
  )
}

function TaskCard({ task, project, busy, onEdit, onCancel }: { task: Task; project?: Project; busy: boolean; onEdit: () => void; onCancel: () => void }) {
  const due = formatLocalDateTime(task.due_at)
  return (
    <article className="management-card">
      <div className="management-card-heading">
        <div>
          <h3>{task.title}</h3>
          <p>{project?.title ?? 'No Project'}</p>
        </div>
        <span className={`status-chip ${task.status === 'cancelled' ? 'cancelled' : ''}`}>{task.status}</span>
      </div>
      <div className="metadata-row">
        {due ? <span>Due {due}</span> : null}
        {task.estimate_minutes !== null ? <span>{task.estimate_minutes} min</span> : null}
        {task.priority_hint ? <span>{task.priority_hint}</span> : null}
      </div>
      {task.description ? <p className="card-description">{task.description}</p> : null}
      <div className="card-actions">
        <button type="button" className="quiet-button" onClick={onEdit} disabled={busy || task.status === 'cancelled'}>Edit</button>
        <button type="button" className="danger-button" onClick={onCancel} disabled={busy || task.status === 'cancelled'}>Cancel</button>
      </div>
    </article>
  )
}

function ProjectCard({ project, busy, onEdit, onCancel }: { project: Project; busy: boolean; onEdit: () => void; onCancel: () => void }) {
  return (
    <article className="management-card">
      <div className="management-card-heading">
        <div>
          <h3>{project.title}</h3>
          <p>{project.target_date ? `Target ${project.target_date}` : 'No target date'}</p>
        </div>
        <span className={`status-chip ${project.status === 'cancelled' ? 'cancelled' : ''}`}>{project.status}</span>
      </div>
      <div className="metadata-row">{project.priority_hint ? <span>{project.priority_hint}</span> : <span>No priority</span>}</div>
      {project.notes ? <p className="card-description">{project.notes}</p> : null}
      <div className="card-actions">
        <button type="button" className="quiet-button" onClick={onEdit} disabled={busy || project.status === 'cancelled'}>Edit</button>
        <button type="button" className="danger-button" onClick={onCancel} disabled={busy || project.status === 'cancelled'}>Cancel</button>
      </div>
    </article>
  )
}

export function TasksPage({ userId, online, repositories }: TasksPageProps) {
  const queryClient = useQueryClient()
  const [surface, setSurface] = useState<Surface>('tasks')
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null)
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(null)
  const [actionMessage, setActionMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const resolvedRepositories = useMemo<ManagementRepositories | null>(() => {
    if (repositories) return repositories
    if (!supabase) return null
    return {
      tasks: createTaskRepository(supabase, userId),
      projects: createProjectRepository(supabase, userId),
    }
  }, [repositories, userId])

  const taskQuery = useQuery({
    queryKey: managementQueryKeys.tasks(userId),
    queryFn: () => {
      if (!resolvedRepositories) throw new Error('Supabase is not configured.')
      return resolvedRepositories.tasks.list()
    },
  })

  const projectQuery = useQuery({
    queryKey: managementQueryKeys.projects(userId),
    queryFn: () => {
      if (!resolvedRepositories) throw new Error('Supabase is not configured.')
      return resolvedRepositories.projects.list()
    },
  })

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: managementQueryKeys.tasks(userId) })
  const invalidateProjects = () => queryClient.invalidateQueries({ queryKey: managementQueryKeys.projects(userId) })

  const createTask = useMutation({ mutationFn: (input: TaskCreateInput) => resolvedRepositories!.tasks.create(input) })
  const updateTask = useMutation({ mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) => resolvedRepositories!.tasks.update(id, input) })
  const cancelTask = useMutation({ mutationFn: (id: string) => resolvedRepositories!.tasks.cancel(id) })
  const createProject = useMutation({ mutationFn: (input: ProjectCreateInput) => resolvedRepositories!.projects.create(input) })
  const updateProject = useMutation({ mutationFn: ({ id, input }: { id: string; input: ProjectUpdateInput }) => resolvedRepositories!.projects.update(id, input) })
  const cancelProject = useMutation({ mutationFn: (id: string) => resolvedRepositories!.projects.cancel(id) })

  const busy = [createTask, updateTask, cancelTask, createProject, updateProject, cancelProject].some((mutation) => mutation.isPending)
  const projects = projectQuery.data ?? []
  const assignableProjects = projects.filter(isAssignableProject)
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  const requireConnection = () => {
    if (online) return true
    setActionMessage({ kind: 'error', text: 'Connect to the internet to save changes. Nothing was saved offline.' })
    return false
  }

  const handleTaskSave = async (input: TaskCreateInput | TaskUpdateInput) => {
    if (!requireConnection()) return
    try {
      if (taskEditor?.mode === 'edit') await updateTask.mutateAsync({ id: taskEditor.task.id, input: input as TaskUpdateInput })
      else await createTask.mutateAsync(input as TaskCreateInput)
      await invalidateTasks()
      setTaskEditor(null)
      setActionMessage({ kind: 'success', text: 'Task saved from the server.' })
    } catch (error) {
      setActionMessage({ kind: 'error', text: `Task was not saved: ${errorMessage(error)}` })
    }
  }

  const handleProjectSave = async (input: ProjectCreateInput | ProjectUpdateInput) => {
    if (!requireConnection()) return
    try {
      if (projectEditor?.mode === 'edit') await updateProject.mutateAsync({ id: projectEditor.project.id, input: input as ProjectUpdateInput })
      else await createProject.mutateAsync(input as ProjectCreateInput)
      await invalidateProjects()
      setProjectEditor(null)
      setActionMessage({ kind: 'success', text: 'Project saved from the server.' })
    } catch (error) {
      setActionMessage({ kind: 'error', text: `Project was not saved: ${errorMessage(error)}` })
    }
  }

  const handleTaskCancel = async (task: Task) => {
    if (!requireConnection()) return
    if (!window.confirm(`Cancel task “${task.title}”? The task will stay in history.`)) return
    try {
      await cancelTask.mutateAsync(task.id)
      await invalidateTasks()
      setActionMessage({ kind: 'success', text: 'Task cancelled. The record was kept.' })
    } catch (error) {
      setActionMessage({ kind: 'error', text: `Task was not cancelled: ${errorMessage(error)}` })
    }
  }

  const handleProjectCancel = async (project: Project) => {
    if (!requireConnection()) return
    if (!window.confirm(`Cancel project “${project.title}”? The project will stay in history.`)) return
    try {
      await cancelProject.mutateAsync(project.id)
      await invalidateProjects()
      setActionMessage({ kind: 'success', text: 'Project cancelled. The record was kept.' })
    } catch (error) {
      setActionMessage({ kind: 'error', text: `Project was not cancelled: ${errorMessage(error)}` })
    }
  }

  return (
    <section className="page-stack" aria-labelledby="tasks-title">
      <header className="page-heading management-page-heading">
        <div>
          <p className="page-kicker">Management</p>
          <h1 id="tasks-title">Tasks</h1>
          <p className="page-summary">Define work and projects here. Completion belongs to the future Today execution flow.</p>
        </div>
        <button className="primary-button compact" type="button" onClick={() => surface === 'tasks' ? setTaskEditor({ mode: 'create' }) : setProjectEditor({ mode: 'create' })}>
          {surface === 'tasks' ? 'New Task' : 'New Project'}
        </button>
      </header>

      <div className="segment-control" role="tablist" aria-label="Task management sections">
        <button type="button" role="tab" aria-selected={surface === 'tasks'} onClick={() => { setSurface('tasks'); setProjectEditor(null) }}>Tasks</button>
        <button type="button" role="tab" aria-selected={surface === 'projects'} onClick={() => { setSurface('projects'); setTaskEditor(null) }}>Projects</button>
      </div>

      {!online ? <p className="offline-note" role="status">Offline view: loaded in-memory data can remain visible, but edits require a connection.</p> : null}
      {actionMessage ? <p className={`management-message ${actionMessage.kind}`} role={actionMessage.kind === 'error' ? 'alert' : 'status'}>{actionMessage.text}</p> : null}

      {surface === 'tasks' && taskEditor ? <TaskEditor key={taskEditor.mode === 'edit' ? taskEditor.task.id : 'new-task'} state={taskEditor} projects={assignableProjects} busy={busy} onSave={handleTaskSave} onClose={() => setTaskEditor(null)} /> : null}
      {surface === 'projects' && projectEditor ? <ProjectEditor key={projectEditor.mode === 'edit' ? projectEditor.project.id : 'new-project'} state={projectEditor} busy={busy} onSave={handleProjectSave} onClose={() => setProjectEditor(null)} /> : null}

      {surface === 'tasks' ? (
        taskQuery.isPending || projectQuery.isPending ? (
          <section className="state-card" aria-live="polite"><strong>Loading tasks…</strong><p>Reading your current TaskRing data.</p></section>
        ) : taskQuery.isError || projectQuery.isError ? (
          <section className="state-card error-state" role="alert"><strong>Could not load tasks.</strong><p>{errorMessage(taskQuery.error ?? projectQuery.error)}</p><button className="quiet-button" type="button" onClick={() => { void taskQuery.refetch(); void projectQuery.refetch() }}>Retry</button></section>
        ) : taskQuery.data.length === 0 ? (
          <section className="state-card empty-state" aria-label="Tasks empty state"><strong>No tasks yet.</strong><p>Create a task definition when you have something to manage.</p></section>
        ) : (
          <div className="management-list" aria-label="Task list">{taskQuery.data.map((task) => <TaskCard key={task.id} task={task} project={task.project_id ? projectById.get(task.project_id) : undefined} busy={busy} onEdit={() => setTaskEditor({ mode: 'edit', task })} onCancel={() => void handleTaskCancel(task)} />)}</div>
        )
      ) : (
        projectQuery.isPending ? (
          <section className="state-card" aria-live="polite"><strong>Loading projects…</strong><p>Reading your current TaskRing data.</p></section>
        ) : projectQuery.isError ? (
          <section className="state-card error-state" role="alert"><strong>Could not load projects.</strong><p>{errorMessage(projectQuery.error)}</p><button className="quiet-button" type="button" onClick={() => void projectQuery.refetch()}>Retry</button></section>
        ) : projectQuery.data.length === 0 ? (
          <section className="state-card empty-state" aria-label="Projects empty state"><strong>No projects yet.</strong><p>Projects are optional containers for related tasks.</p></section>
        ) : (
          <div className="management-list" aria-label="Project list">{projectQuery.data.map((project) => <ProjectCard key={project.id} project={project} busy={busy} onEdit={() => setProjectEditor({ mode: 'edit', project })} onCancel={() => void handleProjectCancel(project)} />)}</div>
        )
      )}
    </section>
  )
}
