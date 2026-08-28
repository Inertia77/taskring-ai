import {
  EXECUTION_CONTEXTS,
  PRIORITY_HINTS,
  PROJECT_MANAGEABLE_STATUSES,
  TASK_KINDS,
  TASK_MANAGEABLE_STATUSES,
  type ExecutionContext,
  type PriorityHint,
  type ProjectCreateInput,
  type ProjectManageableStatus,
  type ProjectUpdateInput,
  type TaskCreateInput,
  type TaskKind,
  type TaskManageableStatus,
  type TaskUpdateInput,
} from './models'
import { localDateTimeToIso } from './dateTime'

export interface TaskDraft {
  title: string
  description: string
  projectId: string
  priorityHint: string
  dueAtLocal: string
  notBeforeLocal: string
  estimateMinutes: string
  remainingMinutes: string
  executionContext: string
  taskKind: string
  status: string
}

export interface ProjectDraft {
  title: string
  priorityHint: string
  targetDate: string
  notes: string
  status: string
}

export interface ValidationResult<T> {
  value: T | null
  errors: Record<string, string>
}

function optionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function nonNegativeInteger(value: string, label: string, errors: Record<string, string>, field: string) {
  if (!value.trim()) return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    errors[field] = `${label} must be a non-negative whole number.`
    return null
  }
  return number
}

export function validateTaskDraft(
  draft: TaskDraft,
  allowedProjectIds: ReadonlySet<string>,
  mode: 'create' | 'edit',
): ValidationResult<TaskCreateInput | TaskUpdateInput> {
  const errors: Record<string, string> = {}
  const title = draft.title.trim()
  if (!title) errors.title = 'Title is required.'

  const projectId = draft.projectId || null
  if (projectId && !allowedProjectIds.has(projectId)) errors.projectId = 'Choose a project you can currently assign.'

  const priorityHint = draft.priorityHint || null
  if (priorityHint && !PRIORITY_HINTS.includes(priorityHint as PriorityHint)) errors.priorityHint = 'Choose a valid priority.'

  if (!EXECUTION_CONTEXTS.includes(draft.executionContext as ExecutionContext)) errors.executionContext = 'Choose a valid execution context.'
  if (!TASK_KINDS.includes(draft.taskKind as TaskKind)) errors.taskKind = 'Choose a valid task kind.'

  const estimateMinutes = nonNegativeInteger(draft.estimateMinutes, 'Estimate', errors, 'estimateMinutes')
  const remainingMinutes = nonNegativeInteger(draft.remainingMinutes, 'Remaining time', errors, 'remainingMinutes')

  let dueAt: string | null = null
  let notBefore: string | null = null
  try {
    dueAt = localDateTimeToIso(draft.dueAtLocal)
  } catch {
    errors.dueAtLocal = 'Enter a valid due date and time.'
  }
  try {
    notBefore = localDateTimeToIso(draft.notBeforeLocal)
  } catch {
    errors.notBeforeLocal = 'Enter a valid not-before date and time.'
  }

  if (mode === 'edit' && !TASK_MANAGEABLE_STATUSES.includes(draft.status as TaskManageableStatus)) {
    errors.status = 'Choose an allowed management status.'
  }

  if (Object.keys(errors).length) return { value: null, errors }

  const base: TaskCreateInput = {
    title,
    description: optionalText(draft.description),
    projectId,
    priorityHint: priorityHint as PriorityHint | null,
    dueAt,
    notBefore,
    estimateMinutes,
    executionContext: draft.executionContext as ExecutionContext,
    taskKind: draft.taskKind as TaskKind,
  }

  return mode === 'edit'
    ? {
        value: {
          ...base,
          remainingMinutes,
          status: draft.status as TaskManageableStatus,
        },
        errors,
      }
    : { value: base, errors }
}

export function validateProjectDraft(
  draft: ProjectDraft,
  mode: 'create' | 'edit',
): ValidationResult<ProjectCreateInput | ProjectUpdateInput> {
  const errors: Record<string, string> = {}
  const title = draft.title.trim()
  if (!title) errors.title = 'Title is required.'

  const priorityHint = draft.priorityHint || null
  if (priorityHint && !PRIORITY_HINTS.includes(priorityHint as PriorityHint)) errors.priorityHint = 'Choose a valid priority.'

  if (draft.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.targetDate)) errors.targetDate = 'Enter a valid target date.'

  if (mode === 'edit' && !PROJECT_MANAGEABLE_STATUSES.includes(draft.status as ProjectManageableStatus)) {
    errors.status = 'Choose an allowed project status.'
  }

  if (Object.keys(errors).length) return { value: null, errors }

  const base: ProjectCreateInput = {
    title,
    priorityHint: priorityHint as PriorityHint | null,
    targetDate: draft.targetDate || null,
    notes: optionalText(draft.notes),
  }

  return mode === 'edit'
    ? { value: { ...base, status: draft.status as ProjectManageableStatus }, errors }
    : { value: base, errors }
}
