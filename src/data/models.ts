import type { Database } from '../types/database.types'

export type Task = Database['public']['Tables']['tasks']['Row']
export type Project = Database['public']['Tables']['projects']['Row']

export const TASK_MANAGEABLE_STATUSES = ['active', 'waiting', 'paused', 'someday'] as const
export const PROJECT_MANAGEABLE_STATUSES = ['active', 'paused', 'waiting', 'done'] as const
export const PRIORITY_HINTS = ['low', 'normal', 'high', 'critical'] as const
export const EXECUTION_CONTEXTS = ['any', 'deep', 'flex'] as const
export const TASK_KINDS = ['normal', 'routine', 'game'] as const

export type TaskManageableStatus = (typeof TASK_MANAGEABLE_STATUSES)[number]
export type ProjectManageableStatus = (typeof PROJECT_MANAGEABLE_STATUSES)[number]
export type PriorityHint = (typeof PRIORITY_HINTS)[number]
export type ExecutionContext = (typeof EXECUTION_CONTEXTS)[number]
export type TaskKind = (typeof TASK_KINDS)[number]

export interface TaskCreateInput {
  title: string
  description: string | null
  projectId: string | null
  priorityHint: PriorityHint | null
  dueAt: string | null
  notBefore: string | null
  estimateMinutes: number | null
  executionContext: ExecutionContext
  taskKind: TaskKind
}

export interface TaskUpdateInput extends TaskCreateInput {
  remainingMinutes: number | null
  status: TaskManageableStatus
}

export interface ProjectCreateInput {
  title: string
  priorityHint: PriorityHint | null
  targetDate: string | null
  notes: string | null
}

export interface ProjectUpdateInput extends ProjectCreateInput {
  status: ProjectManageableStatus
}

export function isAssignableProject(project: Project) {
  return project.status !== 'cancelled' && project.status !== 'done'
}
