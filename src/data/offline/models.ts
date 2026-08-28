import type { ActiveTodayPlan } from '../dailyPlans/models'
import type { PlanItemExecutionState, TaskAction } from '../execution/models'

export type OutboxCommandType = 'record_task_action_v01' | 'add_plan_item_feedback_v01'
export type OutboxSyncState = 'pending' | 'retry' | 'conflict'

export interface OfflineCommand {
  sequence?: number
  local_id: string
  user_id: string
  command_type: OutboxCommandType
  plan_date: string
  plan_item_id: string
  event_id: string | null
  feedback_id: string | null
  expected_state: PlanItemExecutionState | null
  action: TaskAction | null
  occurred_at: string | null
  progress_percent: number | null
  remaining_minutes: number | null
  actual_minutes: number | null
  reason: string | null
  note: string | null
  feedback_content: string | null
  created_at: string
  attempt_count: number
  last_attempt_at: string | null
  last_error: string | null
  next_attempt_at: string | null
  sync_state: OutboxSyncState
}

export interface TodaySnapshot {
  key: string
  user_id: string
  plan_date: string
  plan: ActiveTodayPlan
  saved_at: string
}

export interface EnqueueExecutionInput {
  localId: string
  userId: string
  planDate: string
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
  createdAt: string
}

export interface EnqueueFeedbackInput {
  localId: string
  userId: string
  planDate: string
  feedbackId: string
  planItemId: string
  content: string
  createdAt: string
}

export interface SyncSummary {
  attempted: number
  acknowledged: number
  retrying: number
  conflicts: number
}

export const EMPTY_SYNC_SUMMARY: SyncSummary = {
  attempted: 0,
  acknowledged: 0,
  retrying: 0,
  conflicts: 0,
}

export function isExecutionCommand(command: OfflineCommand) {
  return command.command_type === 'record_task_action_v01'
}

export function isFeedbackCommand(command: OfflineCommand) {
  return command.command_type === 'add_plan_item_feedback_v01'
}
