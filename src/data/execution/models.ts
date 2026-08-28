import type { Database } from '../../types/database.types'

export type TaskEvent = Database['public']['Tables']['task_events']['Row']
export type UserFeedback = Database['public']['Tables']['user_feedback']['Row']
export type PlanItemExecutionState = Database['public']['Tables']['daily_plan_items']['Row']['current_state']

export const TASK_ACTIONS = ['started', 'partial', 'done', 'skipped', 'deferred', 'blocked', 'cancelled', 'reopened'] as const
export type TaskAction = (typeof TASK_ACTIONS)[number]

export interface RecordTaskActionInput {
  eventId: string
  planItemId: string
  expectedState: PlanItemExecutionState
  action: TaskAction
  occurredAt: string
  progressPercent?: number | null
  remainingMinutes?: number | null
  actualMinutes?: number | null
  reason?: string | null
  note?: string | null
}

export interface AddFeedbackInput {
  feedbackId: string
  planItemId: string
  content: string
}

export type ExecutionCommandErrorKind = 'idempotency' | 'transition' | 'validation' | 'unavailable' | 'server'

export class ExecutionCommandError extends Error {
  readonly kind: ExecutionCommandErrorKind

  constructor(kind: ExecutionCommandErrorKind, message: string) {
    super(message)
    this.name = 'ExecutionCommandError'
    this.kind = kind
  }
}
