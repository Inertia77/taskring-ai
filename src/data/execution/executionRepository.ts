import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import {
  ExecutionCommandError,
  type AddFeedbackInput,
  type RecordTaskActionInput,
} from './models'

export interface ExecutionRepository {
  recordAction(input: RecordTaskActionInput): Promise<string>
  addFeedback(input: AddFeedbackInput): Promise<string>
}

function commonTransportError(message: string) {
  const lower = message.toLowerCase()
  if (/authentication required|permission denied|not authorized|unauthorized|forbidden|row-level security|jwt/.test(lower)) {
    return new ExecutionCommandError('auth', 'Your session can no longer sync this command. Sign in again or discard the local command.')
  }
  if (/failed to fetch|fetch failed|network|timeout|timed out|connection|reset|temporar|bad gateway|service unavailable|gateway timeout/.test(lower)) {
    return new ExecutionCommandError('retryable', 'The server is temporarily unreachable. This command remains Pending Sync.')
  }
  return null
}

function commandError(message: string) {
  const common = commonTransportError(message)
  if (common) return common
  if (message.includes('Idempotency conflict.')) {
    return new ExecutionCommandError('idempotency', 'This action conflicts with an earlier retry. Refresh before trying again.')
  }
  if (
    message.includes('Invalid execution state transition.') ||
    message.includes('Task is no longer executable.') ||
    message.includes('Execution state changed.')
  ) {
    return new ExecutionCommandError('transition', 'This task changed state. Refresh Today before trying that action again.')
  }
  if (
    message.includes('Partial requires') ||
    message.includes('Partial progress') ||
    message.includes('Remaining minutes') ||
    message.includes('Actual minutes') ||
    message.includes('Unsupported task action') ||
    message.includes('Expected execution state')
  ) {
    return new ExecutionCommandError('validation', 'Review the action details and try again.')
  }
  if (message.includes('Plan Item is unavailable.') || message.includes('Task is unavailable.')) {
    return new ExecutionCommandError('unavailable', 'This Today item is no longer available. Refresh Today.')
  }
  return new ExecutionCommandError('server', 'The action could not be recorded. Review the server state before retrying.')
}

function feedbackError(message: string) {
  const common = commonTransportError(message)
  if (common) return common
  if (message.includes('Idempotency conflict.')) {
    return new ExecutionCommandError('idempotency', 'This feedback conflicts with an earlier retry. Refresh before trying again.')
  }
  if (message.includes('Feedback content is required.')) {
    return new ExecutionCommandError('validation', 'Feedback cannot be empty.')
  }
  if (message.includes('Plan Item is unavailable.')) {
    return new ExecutionCommandError('unavailable', 'This Today item is no longer available. Refresh Today.')
  }
  return new ExecutionCommandError('server', 'Feedback could not be saved. Review the server state before retrying.')
}

export function createExecutionRepository(client: SupabaseClient<Database>): ExecutionRepository {
  return {
    async recordAction(input) {
      const args: Database['public']['Functions']['record_task_action_v01']['Args'] = {
        p_event_id: input.eventId,
        p_plan_item_id: input.planItemId,
        p_expected_state: input.expectedState,
        p_action: input.action,
        p_occurred_at: input.occurredAt,
        ...(input.progressPercent !== undefined && input.progressPercent !== null ? { p_progress_percent: input.progressPercent } : {}),
        ...(input.remainingMinutes !== undefined && input.remainingMinutes !== null ? { p_remaining_minutes: input.remainingMinutes } : {}),
        ...(input.actualMinutes !== undefined && input.actualMinutes !== null ? { p_actual_minutes: input.actualMinutes } : {}),
        ...(input.reason ? { p_reason: input.reason } : {}),
        ...(input.note ? { p_note: input.note } : {}),
      }
      try {
        const { data, error } = await client.rpc('record_task_action_v01', args)
        if (error) throw commandError(error.message)
        const result = data?.[0]
        if (!result) throw new ExecutionCommandError('retryable', 'The server response was incomplete. This command remains Pending Sync.')
        return result.event_id
      } catch (error) {
        if (error instanceof ExecutionCommandError) throw error
        throw commonTransportError(error instanceof Error ? error.message : String(error))
          ?? new ExecutionCommandError('retryable', 'The server response could not be received. This command remains Pending Sync.')
      }
    },

    async addFeedback(input) {
      const args: Database['public']['Functions']['add_plan_item_feedback_v01']['Args'] = {
        p_feedback_id: input.feedbackId,
        p_plan_item_id: input.planItemId,
        p_content: input.content,
      }
      try {
        const { data, error } = await client.rpc('add_plan_item_feedback_v01', args)
        if (error) throw feedbackError(error.message)
        const result = data?.[0]
        if (!result) throw new ExecutionCommandError('retryable', 'The server response was incomplete. This feedback remains Pending Sync.')
        return result.feedback_id
      } catch (error) {
        if (error instanceof ExecutionCommandError) throw error
        throw commonTransportError(error instanceof Error ? error.message : String(error))
          ?? new ExecutionCommandError('retryable', 'The server response could not be received. This feedback remains Pending Sync.')
      }
    },
  }
}
