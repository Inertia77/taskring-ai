import Dexie, { type Table } from 'dexie'
import type { ActiveTodayPlan } from '../dailyPlans/models'
import type {
  EnqueueExecutionInput,
  EnqueueFeedbackInput,
  OfflineCommand,
  TodaySnapshot,
} from './models'

const DEFAULT_DB_NAME = 'taskring-ai-offline-v1'

class TaskRingOfflineDatabase extends Dexie {
  outbox!: Table<OfflineCommand, number>
  todaySnapshots!: Table<TodaySnapshot, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      outbox: '++sequence,&local_id,user_id,[user_id+sequence],[user_id+plan_item_id],sync_state,created_at,next_attempt_at',
      todaySnapshots: '&key,user_id,plan_date,[user_id+plan_date],saved_at',
    })
  }
}

export interface OfflineRepository {
  enqueueExecution(input: EnqueueExecutionInput): Promise<OfflineCommand>
  enqueueFeedback(input: EnqueueFeedbackInput): Promise<OfflineCommand>
  listUserCommands(userId: string): Promise<OfflineCommand[]>
  getTodaySnapshot(userId: string, planDate: string): Promise<TodaySnapshot | null>
  saveTodaySnapshot(userId: string, planDate: string, plan: ActiveTodayPlan, savedAt?: string): Promise<void>
  clearTodaySnapshot(userId: string, planDate: string): Promise<void>
  markAttempt(localId: string, attemptedAt: string): Promise<void>
  markRetry(localId: string, error: string, nextAttemptAt: string): Promise<void>
  markConflict(localId: string, error: string): Promise<void>
  deleteCommand(localId: string): Promise<void>
  clearUserData(userId: string): Promise<void>
  subscribe(userId: string, listener: () => void): () => void
  close(): void
  deleteDatabase(): Promise<void>
}

function snapshotKey(userId: string, planDate: string) {
  return `${userId}:${planDate}`
}

export function canUseOfflineStorage() {
  return typeof indexedDB !== 'undefined'
}

export function createOfflineRepository(databaseName = DEFAULT_DB_NAME): OfflineRepository {
  const db = new TaskRingOfflineDatabase(databaseName)
  const listeners = new Map<string, Set<() => void>>()

  const emit = (userId: string) => {
    for (const listener of listeners.get(userId) ?? []) listener()
  }

  const commandByLocalId = async (localId: string) => db.outbox.where('local_id').equals(localId).first()

  const updateCommand = async (localId: string, changes: Partial<OfflineCommand>) => {
    const command = await commandByLocalId(localId)
    if (!command?.sequence) return
    await db.outbox.update(command.sequence, changes)
    emit(command.user_id)
  }

  return {
    async enqueueExecution(input) {
      const command: OfflineCommand = {
        local_id: input.localId,
        user_id: input.userId,
        command_type: 'record_task_action_v01',
        plan_date: input.planDate,
        plan_item_id: input.planItemId,
        event_id: input.eventId,
        feedback_id: null,
        expected_state: input.expectedState,
        action: input.action,
        occurred_at: input.occurredAt,
        progress_percent: input.progressPercent ?? null,
        remaining_minutes: input.remainingMinutes ?? null,
        actual_minutes: input.actualMinutes ?? null,
        reason: input.reason ?? null,
        note: input.note ?? null,
        feedback_content: null,
        created_at: input.createdAt,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null,
        next_attempt_at: null,
        sync_state: 'pending',
      }
      const sequence = await db.outbox.add(command)
      const stored = { ...command, sequence }
      emit(input.userId)
      return stored
    },

    async enqueueFeedback(input) {
      const command: OfflineCommand = {
        local_id: input.localId,
        user_id: input.userId,
        command_type: 'add_plan_item_feedback_v01',
        plan_date: input.planDate,
        plan_item_id: input.planItemId,
        event_id: null,
        feedback_id: input.feedbackId,
        expected_state: null,
        action: null,
        occurred_at: null,
        progress_percent: null,
        remaining_minutes: null,
        actual_minutes: null,
        reason: null,
        note: null,
        feedback_content: input.content,
        created_at: input.createdAt,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null,
        next_attempt_at: null,
        sync_state: 'pending',
      }
      const sequence = await db.outbox.add(command)
      const stored = { ...command, sequence }
      emit(input.userId)
      return stored
    },

    async listUserCommands(userId) {
      const commands = await db.outbox.where('user_id').equals(userId).toArray()
      return commands.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    },

    async getTodaySnapshot(userId, planDate) {
      return (await db.todaySnapshots.get(snapshotKey(userId, planDate))) ?? null
    },

    async saveTodaySnapshot(userId, planDate, plan, savedAt = new Date().toISOString()) {
      await db.todaySnapshots.put({
        key: snapshotKey(userId, planDate),
        user_id: userId,
        plan_date: planDate,
        plan,
        saved_at: savedAt,
      })
      emit(userId)
    },

    async clearTodaySnapshot(userId, planDate) {
      await db.todaySnapshots.delete(snapshotKey(userId, planDate))
      emit(userId)
    },

    async markAttempt(localId, attemptedAt) {
      const command = await commandByLocalId(localId)
      if (!command) return
      await updateCommand(localId, {
        attempt_count: command.attempt_count + 1,
        last_attempt_at: attemptedAt,
        last_error: null,
      })
    },

    async markRetry(localId, error, nextAttemptAt) {
      await updateCommand(localId, {
        sync_state: 'retry',
        last_error: error,
        next_attempt_at: nextAttemptAt,
      })
    },

    async markConflict(localId, error) {
      await updateCommand(localId, {
        sync_state: 'conflict',
        last_error: error,
        next_attempt_at: null,
      })
    },

    async deleteCommand(localId) {
      const command = await commandByLocalId(localId)
      if (!command?.sequence) return
      await db.outbox.delete(command.sequence)
      emit(command.user_id)
    },

    async clearUserData(userId) {
      await db.transaction('rw', db.outbox, db.todaySnapshots, async () => {
        await db.outbox.where('user_id').equals(userId).delete()
        await db.todaySnapshots.where('user_id').equals(userId).delete()
      })
      emit(userId)
    },

    subscribe(userId, listener) {
      let userListeners = listeners.get(userId)
      if (!userListeners) {
        userListeners = new Set()
        listeners.set(userId, userListeners)
      }
      userListeners.add(listener)
      return () => {
        userListeners?.delete(listener)
        if (userListeners?.size === 0) listeners.delete(userId)
      }
    },

    close() {
      db.close()
    },

    async deleteDatabase() {
      db.close()
      await Dexie.delete(databaseName)
    },
  }
}

let defaultRepository: OfflineRepository | null = null

export function getDefaultOfflineRepository() {
  if (!canUseOfflineStorage()) return null
  if (!defaultRepository) defaultRepository = createOfflineRepository()
  return defaultRepository
}
