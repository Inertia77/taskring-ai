import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionRepository } from '../src/data/execution/executionRepository'
import { ExecutionCommandError } from '../src/data/execution/models'
import { createOfflineRepository } from '../src/data/offline/offlineRepository'
import { createOutboxSyncEngine } from '../src/data/offline/syncEngine'

const repositories: ReturnType<typeof createOfflineRepository>[] = []

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.deleteDatabase()
  vi.restoreAllMocks()
})

describe('offline outbox conflict ordering', () => {
  it('treats a durable conflict as the global FIFO head until the user resolves or discards it', async () => {
    const repository = createOfflineRepository(`wp008-conflict-${crypto.randomUUID()}`)
    repositories.push(repository)

    await repository.enqueueExecution({
      localId: 'first', userId: 'user-a', planDate: '2026-08-28', eventId: 'event-first', planItemId: 'item-a',
      expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:00:00Z', createdAt: '2026-08-28T10:00:00Z',
    })
    await repository.enqueueExecution({
      localId: 'second', userId: 'user-a', planDate: '2026-08-28', eventId: 'event-second', planItemId: 'item-b',
      expectedState: 'planned', action: 'done', occurredAt: '2026-08-28T10:01:00Z', createdAt: '2026-08-28T10:01:00Z',
    })

    const seen: string[] = []
    const executionRepository: ExecutionRepository = {
      recordAction: vi.fn(async (input) => {
        seen.push(input.eventId)
        if (input.eventId === 'event-first') {
          throw new ExecutionCommandError('transition', 'Execution state changed. Refresh before retrying.')
        }
        return input.eventId
      }),
      addFeedback: vi.fn(),
    }

    const engine = createOutboxSyncEngine({ userId: 'user-a', repository, executionRepository, reconcile: vi.fn(async () => undefined) })
    const firstRun = await engine.syncNow(true)
    expect(firstRun.conflicts).toBe(1)
    expect(seen).toEqual(['event-first'])

    const secondRun = await engine.syncNow(true)
    expect(secondRun.attempted).toBe(0)
    expect(seen).toEqual(['event-first'])
    expect((await repository.listUserCommands('user-a')).map((command) => [command.local_id, command.sync_state])).toEqual([
      ['first', 'conflict'],
      ['second', 'pending'],
    ])
  })
})
