import type { ExecutionRepository } from '../execution/executionRepository'
import { ExecutionCommandError } from '../execution/models'
import {
  EMPTY_SYNC_SUMMARY,
  isExecutionCommand,
  type OfflineCommand,
  type SyncSummary,
} from './models'
import type { OfflineRepository } from './offlineRepository'

export interface OutboxSyncEngineOptions {
  userId: string
  repository: OfflineRepository
  executionRepository: ExecutionRepository
  reconcile: (command: OfflineCommand) => Promise<void>
  clock?: () => Date
}

export interface OutboxSyncEngine {
  syncNow(force?: boolean): Promise<SyncSummary>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown sync failure.'
}

function isRetryableFailure(error: unknown) {
  if (error instanceof ExecutionCommandError) return error.kind === 'retryable'
  const message = errorMessage(error).toLowerCase()
  return /network|failed to fetch|fetch failed|timeout|timed out|connection|reset|temporar|502|503|504|gateway|\b5\d\d\b/.test(message)
}

function retryAt(now: Date, attemptCount: number) {
  const delayMs = Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attemptCount, 7))
  return new Date(now.getTime() + delayMs).toISOString()
}

async function runCommand(executionRepository: ExecutionRepository, command: OfflineCommand) {
  if (isExecutionCommand(command)) {
    if (!command.event_id || !command.expected_state || !command.action || !command.occurred_at) {
      throw new ExecutionCommandError('validation', 'Stored execution command is incomplete.')
    }
    return executionRepository.recordAction({
      eventId: command.event_id,
      planItemId: command.plan_item_id,
      expectedState: command.expected_state,
      action: command.action,
      occurredAt: command.occurred_at,
      progressPercent: command.progress_percent,
      remainingMinutes: command.remaining_minutes,
      actualMinutes: command.actual_minutes,
      reason: command.reason,
      note: command.note,
    })
  }

  if (!command.feedback_id || !command.feedback_content) {
    throw new ExecutionCommandError('validation', 'Stored feedback command is incomplete.')
  }
  return executionRepository.addFeedback({
    feedbackId: command.feedback_id,
    planItemId: command.plan_item_id,
    content: command.feedback_content,
  })
}

export function createOutboxSyncEngine({
  userId,
  repository,
  executionRepository,
  reconcile,
  clock = () => new Date(),
}: OutboxSyncEngineOptions): OutboxSyncEngine {
  let inFlight: Promise<SyncSummary> | null = null

  const drain = async (force: boolean): Promise<SyncSummary> => {
    const summary = { ...EMPTY_SYNC_SUMMARY }
    const commands = await repository.listUserCommands(userId)

    for (const command of commands) {
      if (command.user_id !== userId) continue

      // v0.1 favors correctness over throughput: a durable conflict is the FIFO head
      // until the user explicitly resolves or discards it.
      if (command.sync_state === 'conflict') break

      const now = clock()
      if (!force && command.next_attempt_at && Date.parse(command.next_attempt_at) > now.getTime()) {
        break
      }

      summary.attempted += 1
      await repository.markAttempt(command.local_id, now.toISOString())

      try {
        await runCommand(executionRepository, command)
      } catch (error) {
        if (isRetryableFailure(error)) {
          await repository.markRetry(
            command.local_id,
            errorMessage(error),
            retryAt(now, command.attempt_count),
          )
          summary.retrying += 1
          break
        }

        await repository.markConflict(command.local_id, errorMessage(error))
        summary.conflicts += 1
        break
      }

      try {
        // Server acknowledgement alone is not sufficient. Authoritative readback and
        // local snapshot/query reconciliation must succeed before deletion.
        await reconcile(command)
      } catch (error) {
        await repository.markRetry(
          command.local_id,
          `Server acknowledged the command, but reconciliation failed: ${errorMessage(error)}`,
          retryAt(now, command.attempt_count),
        )
        summary.retrying += 1
        break
      }

      await repository.deleteCommand(command.local_id)
      summary.acknowledged += 1
    }

    return summary
  }

  return {
    async syncNow(force = false) {
      if (inFlight) return inFlight
      inFlight = drain(force).finally(() => {
        inFlight = null
      })
      return inFlight
    },
  }
}
