import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDailyPlanRepository, type DailyPlanRepository } from '../../data/dailyPlans/dailyPlanRepository'
import {
  DailyPlanPublishError,
  TODAY_BUCKETS,
  type ActiveTodayPlan,
  type PublishPlanItemInput,
} from '../../data/dailyPlans/models'
import { createExecutionRepository, type ExecutionRepository } from '../../data/execution/executionRepository'
import type { TaskAction } from '../../data/execution/models'
import {
  commandDisplayAction,
  commandsForPlanItem,
  applyOptimisticProjection,
} from '../../data/offline/projection'
import {
  getDefaultOfflineRepository,
  type OfflineRepository,
} from '../../data/offline/offlineRepository'
import type { SyncSummary } from '../../data/offline/models'
import { useOfflineCommands } from '../../data/offline/useOfflineCommands'
import { historyQueryKeys, managementQueryKeys, todayQueryKeys } from '../../data/queryKeys'
import { planDateForInstant, planningDateLabel, resolvePlanningTimeZone } from '../../data/planningDate'
import { supabase } from '../../lib/supabaseClient'
import { DailyPlanBuilder } from './DailyPlanBuilder'
import { TodayExecutionControls, type ExecutionDetails } from './TodayExecutionControls'

interface TodayPageProps {
  userId: string
  online: boolean
  repository?: DailyPlanRepository
  executionRepository?: ExecutionRepository
  offlineRepository?: OfflineRepository | null
  syncNow?: (force?: boolean) => Promise<SyncSummary>
  planningTimeZone?: string
  now?: Date
  actionClock?: () => Date
  idFactory?: () => string
}

function readableError(error: unknown) {
  if (error instanceof DailyPlanPublishError) return error.message
  return 'Today’s plan could not be loaded. Please try again.'
}

function dueLabel(value: string | null, timeZone: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function commandTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function executionSummary(item: ActiveTodayPlan['items'][number]) {
  const event = item.latestEvent
  if (!event) return null
  const parts: string[] = []
  if (event.progress_percent !== null) parts.push(`${event.progress_percent}%`)
  if (event.remaining_minutes !== null) parts.push(`${event.remaining_minutes} min remaining`)
  if (event.actual_minutes !== null) parts.push(`${event.actual_minutes} min actual`)
  if (event.reason) parts.push(event.reason)
  return parts.length ? parts.join(' · ') : null
}

interface TodayPlanProps {
  plan: ActiveTodayPlan
  timeZone: string
  online: boolean
  busy: boolean
  commands: Awaited<ReturnType<OfflineRepository['listUserCommands']>>
  onEdit: () => void
  onAction: (itemId: string, action: TaskAction, details?: ExecutionDetails) => Promise<void>
  onFeedback: (itemId: string, content: string) => Promise<void>
  onDiscard: (localId: string) => Promise<void>
}

function TodayPlan({ plan, timeZone, online, busy, commands, onEdit, onAction, onFeedback, onDiscard }: TodayPlanProps) {
  const executionStarted = plan.items.some((item) => item.current_state !== 'planned' || Boolean(item.latestEvent))

  return (
    <div className="today-plan-stack">
      <section className="today-plan-summary" aria-label="Published plan">
        <div>
          <p className="status-label">Published plan</p>
          <strong>Revision {plan.plan.revision}</strong>
        </div>
        <button type="button" className="secondary-button" onClick={onEdit} disabled={executionStarted || !online}>Edit Today’s Plan</button>
      </section>

      {plan.plan.brief ? (
        <section className="today-brief" aria-label="Plan brief">
          <p className="status-label">Plan brief</p>
          <p>{plan.plan.brief}</p>
        </section>
      ) : null}

      {executionStarted ? (
        <p className="offline-note" role="status">Execution has started. Plan history is locked; actions below record immutable execution facts.</p>
      ) : null}

      {TODAY_BUCKETS.map(({ value, label }) => {
        const items = plan.items.filter((item) => item.bucket === value).sort((a, b) => a.position - b.position)
        if (!items.length) return null
        return (
          <section className="today-bucket" key={value} aria-labelledby={`today-${value}`}>
            <div className="today-bucket-heading">
              <h2 id={`today-${value}`}>{label}</h2>
              <span>{items.length}</span>
            </div>
            <div className="today-item-list">
              {items.map((item) => {
                const due = dueLabel(item.task.due_at, timeZone)
                const summary = executionSummary(item)
                const itemCommands = commandsForPlanItem(commands, item.id)
                const conflict = itemCommands.find((command) => command.sync_state === 'conflict')
                return (
                  <article className={`today-item execution-state-${item.current_state}`} key={item.id}>
                    <div className="today-item-heading">
                      <div>
                        <h3>{item.task.title}</h3>
                        {item.project ? <p>{item.project.title}</p> : null}
                      </div>
                      <div className="sync-chip-row">
                        {item.current_state !== 'planned' ? <span className="status-chip">{item.current_state}</span> : null}
                        {conflict ? <span className="sync-badge conflict">Sync issue</span> : itemCommands.length ? <span className="sync-badge pending">Pending Sync</span> : null}
                      </div>
                    </div>
                    <div className="metadata-row">
                      {item.planned_minutes !== null ? <span>{item.planned_minutes} min planned</span> : null}
                      {due ? <span>Due {due}</span> : null}
                      {item.task.priority_hint ? <span>{item.task.priority_hint}</span> : null}
                      {item.task.task_kind !== 'normal' ? <span>{item.task.task_kind}</span> : null}
                      {item.current_state === 'partial' && item.task.remaining_minutes !== null ? <span>{item.task.remaining_minutes} min remaining</span> : null}
                    </div>
                    {summary ? <p className="execution-summary">Latest server event: {summary}</p> : null}
                    {conflict ? (
                      <div className="sync-issue-panel" role="alert">
                        <strong>Sync issue</strong>
                        <p>{commandDisplayAction(conflict)} at {commandTime(conflict.created_at)} could not sync.</p>
                        <p>{conflict.last_error ?? 'Server state changed.'}</p>
                        <button type="button" className="tertiary-button" onClick={() => void onDiscard(conflict.local_id)}>Discard local pending command</button>
                      </div>
                    ) : null}
                    <TodayExecutionControls
                      item={item}
                      busy={busy}
                      online={online}
                      blockedReason={conflict ? 'Resolve the Sync issue before recording another action on this item.' : null}
                      onAction={(action, details) => onAction(item.id, action, details)}
                      onFeedback={(content) => onFeedback(item.id, content)}
                    />
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {plan.items.length === 0 ? (
        <div className="empty-state">
          <strong>This published plan is empty.</strong>
          <p>Edit the plan to add active tasks.</p>
        </div>
      ) : null}
    </div>
  )
}

export function TodayPage({
  userId,
  online,
  repository,
  executionRepository,
  offlineRepository,
  syncNow,
  planningTimeZone,
  now,
  actionClock = () => new Date(),
  idFactory = () => crypto.randomUUID(),
}: TodayPageProps) {
  const queryClient = useQueryClient()
  const [builderOpen, setBuilderOpen] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const timeZone = planningTimeZone ?? resolvePlanningTimeZone()
  const instant = now ?? new Date()
  const planDate = planDateForInstant(instant, timeZone)
  const dateLabel = planningDateLabel(instant, timeZone)

  const resolvedRepository = useMemo(() => {
    if (repository) return repository
    if (!supabase) return null
    return createDailyPlanRepository(supabase, userId)
  }, [repository, userId])

  const resolvedExecutionRepository = useMemo(() => {
    if (executionRepository) return executionRepository
    if (!supabase) return null
    return createExecutionRepository(supabase)
  }, [executionRepository])

  const resolvedOfflineRepository = useMemo(() => {
    if (offlineRepository !== undefined) return offlineRepository
    return getDefaultOfflineRepository()
  }, [offlineRepository])

  const { commands } = useOfflineCommands(resolvedOfflineRepository, userId)
  const todayCommands = useMemo(
    () => commands.filter((command) => command.plan_date === planDate),
    [commands, planDate],
  )

  const serverTodayQuery = useQuery({
    queryKey: todayQueryKeys.plan(userId, planDate),
    queryFn: async (): Promise<ActiveTodayPlan | null> => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      const plan = await resolvedRepository.getActivePlan(planDate)
      if (!plan) return null
      const items = await resolvedRepository.getPlanItems(plan.id)
      return { plan, items }
    },
    enabled: online || !resolvedOfflineRepository,
  })

  const offlineSnapshotQuery = useQuery({
    queryKey: ['offline-today-snapshot', userId, planDate],
    queryFn: async () => {
      if (!resolvedOfflineRepository) return null
      return resolvedOfflineRepository.getTodaySnapshot(userId, planDate)
    },
    enabled: !online && Boolean(resolvedOfflineRepository),
  })

  useEffect(() => {
    if (!online || !resolvedOfflineRepository || !serverTodayQuery.isSuccess) return
    if (serverTodayQuery.data) {
      void resolvedOfflineRepository.saveTodaySnapshot(userId, planDate, serverTodayQuery.data)
    } else {
      void resolvedOfflineRepository.clearTodaySnapshot(userId, planDate)
    }
  }, [online, planDate, resolvedOfflineRepository, serverTodayQuery.data, serverTodayQuery.isSuccess, userId])

  const candidateQuery = useQuery({
    queryKey: todayQueryKeys.candidates(userId, planDate),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.getCandidateTasks()
    },
    enabled: builderOpen && (online || !resolvedOfflineRepository),
  })

  const authoritativePlan = online || !resolvedOfflineRepository
    ? serverTodayQuery.data ?? null
    : offlineSnapshotQuery.data?.plan ?? null
  const displayedPlan = useMemo(
    () => applyOptimisticProjection(authoritativePlan, todayCommands),
    [authoritativePlan, todayCommands],
  )

  const invalidateExecutionSurfaces = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: todayQueryKeys.plan(userId, planDate) }),
      queryClient.invalidateQueries({ queryKey: todayQueryKeys.candidates(userId, planDate) }),
      queryClient.invalidateQueries({ queryKey: managementQueryKeys.tasks(userId) }),
      queryClient.invalidateQueries({ queryKey: historyQueryKeys.events(userId) }),
      queryClient.invalidateQueries({ queryKey: historyQueryKeys.feedback(userId) }),
    ])
  }

  const publishMutation = useMutation({
    mutationFn: async (items: PublishPlanItemInput[]) => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.publishPlan({
        planDate,
        basePlanId: serverTodayQuery.data?.plan.id ?? null,
        items,
      })
    },
    onSuccess: async (result) => {
      setActionMessage({ kind: 'success', text: `Revision ${result.revision} published.` })
      setBuilderOpen(false)
      await invalidateExecutionSurfaces()
    },
    onError: (error) => {
      if (error instanceof DailyPlanPublishError && error.kind === 'stale') {
        setActionMessage({ kind: 'error', text: `${error.message} Reload Today before trying again.` })
        return
      }
      setActionMessage({ kind: 'error', text: readableError(error) })
    },
  })

  const trySync = async (force = false) => {
    if (!online || !syncNow) return null
    setSyncBusy(true)
    try {
      const result = await syncNow(force)
      if (result.conflicts > 0) {
        setActionMessage({ kind: 'error', text: 'One or more local actions have a Sync issue. Review them before continuing.' })
      } else if (result.acknowledged > 0) {
        setActionMessage({ kind: 'success', text: `${result.acknowledged} pending action${result.acknowledged === 1 ? '' : 's'} synced.` })
      }
      return result
    } finally {
      setSyncBusy(false)
    }
  }

  const publish = async (items: PublishPlanItemInput[]) => {
    if (!online) {
      setActionMessage({ kind: 'error', text: "Connect to the internet to publish today's plan. Nothing was saved offline." })
      return
    }
    setActionMessage(null)
    await publishMutation.mutateAsync(items).catch(() => undefined)
  }

  const recordAction = async (itemId: string, action: TaskAction, details?: ExecutionDetails) => {
    setActionMessage(null)
    const expectedState = displayedPlan?.items.find((item) => item.id === itemId)?.current_state
    if (!expectedState) throw new Error('This Today item is no longer available. Refresh Today.')

    if (resolvedOfflineRepository) {
      const occurredAt = actionClock().toISOString()
      const eventId = idFactory()
      setQueueBusy(true)
      try {
        await resolvedOfflineRepository.enqueueExecution({
          localId: `execution:${eventId}`,
          userId,
          planDate,
          eventId,
          planItemId: itemId,
          expectedState,
          action,
          occurredAt,
          createdAt: occurredAt,
          ...details,
        })
        setActionMessage({ kind: 'success', text: online ? 'Action saved. Syncing…' : 'Action saved on this device. Pending Sync.' })
      } finally {
        setQueueBusy(false)
      }
      if (online) await trySync(false)
      return
    }

    if (!online) throw new Error('Connect to the internet to record this action. Nothing was saved offline.')
    if (!resolvedExecutionRepository) throw new Error('Execution service is unavailable.')
    await resolvedExecutionRepository.recordAction({
      eventId: idFactory(),
      planItemId: itemId,
      expectedState,
      action,
      occurredAt: actionClock().toISOString(),
      ...details,
    })
    setActionMessage({ kind: 'success', text: 'Action recorded.' })
    await invalidateExecutionSurfaces()
  }

  const addFeedback = async (itemId: string, content: string) => {
    setActionMessage(null)
    if (resolvedOfflineRepository) {
      const createdAt = actionClock().toISOString()
      const feedbackId = idFactory()
      setQueueBusy(true)
      try {
        await resolvedOfflineRepository.enqueueFeedback({
          localId: `feedback:${feedbackId}`,
          userId,
          planDate,
          feedbackId,
          planItemId: itemId,
          content,
          createdAt,
        })
        setActionMessage({ kind: 'success', text: online ? 'Feedback saved. Syncing…' : 'Feedback saved on this device. Pending Sync.' })
      } finally {
        setQueueBusy(false)
      }
      if (online) await trySync(false)
      return
    }

    if (!online) throw new Error('Connect to the internet to record this action. Nothing was saved offline.')
    if (!resolvedExecutionRepository) throw new Error('Feedback service is unavailable.')
    await resolvedExecutionRepository.addFeedback({ feedbackId: idFactory(), planItemId: itemId, content })
    setActionMessage({ kind: 'success', text: 'Feedback saved.' })
    await queryClient.invalidateQueries({ queryKey: historyQueryKeys.feedback(userId) })
  }

  const discardCommand = async (localId: string) => {
    if (!resolvedOfflineRepository) return
    await resolvedOfflineRepository.deleteCommand(localId)
    setActionMessage({ kind: 'success', text: 'Local pending command discarded. Server state was not changed.' })
    if (online) await serverTodayQuery.refetch()
  }

  const openBuilder = () => {
    setActionMessage(null)
    setBuilderOpen(true)
  }

  const loading = online || !resolvedOfflineRepository ? serverTodayQuery.isPending : offlineSnapshotQuery.isPending
  const loadError = online || !resolvedOfflineRepository ? serverTodayQuery.isError : offlineSnapshotQuery.isError
  const loaded = online || !resolvedOfflineRepository ? serverTodayQuery.isSuccess : offlineSnapshotQuery.isSuccess
  const hasOfflineSnapshot = Boolean(offlineSnapshotQuery.data)

  return (
    <section className="page-stack today-page" aria-labelledby="today-title">
      <header className="page-heading">
        <p className="page-kicker">{dateLabel} · {timeZone}</p>
        <h1 id="today-title">Today</h1>
        <p className="page-summary">Your published plan and human execution record for {planDate}.</p>
      </header>

      {!online ? (
        <p className="offline-note" role="status">Offline mode. Today uses the last local snapshot when available; execution and feedback are stored as Pending Sync.</p>
      ) : null}

      {!online && hasOfflineSnapshot ? (
        <p className="offline-snapshot-label" role="status">Offline snapshot · saved {commandTime(offlineSnapshotQuery.data!.saved_at)}</p>
      ) : null}

      {todayCommands.length > 0 && syncNow ? (
        <section className="sync-summary-card" aria-label="Offline sync status">
          <div>
            <strong>{todayCommands.length} local command{todayCommands.length === 1 ? '' : 's'}</strong>
            <p>{todayCommands.some((command) => command.sync_state === 'conflict') ? 'Sync issue needs attention.' : 'Pending Sync'}</p>
          </div>
          <button type="button" className="secondary-button" disabled={!online || syncBusy} onClick={() => void trySync(true)}>Sync Now</button>
        </section>
      ) : null}

      {actionMessage ? <p className={`action-message ${actionMessage.kind}`} role={actionMessage.kind === 'error' ? 'alert' : 'status'}>{actionMessage.text}</p> : null}

      {loading ? (
        <section className="today-loading" aria-live="polite"><strong>Loading today’s plan…</strong></section>
      ) : null}

      {loadError ? (
        <section className="empty-state" role="alert">
          <strong>Today’s plan is unavailable.</strong>
          <p>{online ? readableError(serverTodayQuery.error) : 'The offline snapshot could not be read from this device.'}</p>
          {online ? <button type="button" className="secondary-button" onClick={() => void serverTodayQuery.refetch()}>Try Again</button> : null}
        </section>
      ) : null}

      {!online && resolvedOfflineRepository && loaded && !authoritativePlan && !builderOpen ? (
        <section className="empty-state">
          <strong>No offline Today plan is available.</strong>
          <p>Connect once to load today’s published plan before using execution actions offline.</p>
        </section>
      ) : null}

      {(online || !resolvedOfflineRepository) && serverTodayQuery.isSuccess && !serverTodayQuery.data && !builderOpen ? (
        <section className="empty-state">
          <strong>No plan published for today.</strong>
          <p>Build a manual plan from your active Task definitions.</p>
          <button type="button" className="primary-button" onClick={openBuilder}>Build Today Plan</button>
        </section>
      ) : null}

      {loaded && displayedPlan && !builderOpen ? (
        <TodayPlan
          plan={displayedPlan}
          timeZone={timeZone}
          online={online}
          busy={queueBusy || syncBusy}
          commands={todayCommands}
          onEdit={openBuilder}
          onAction={recordAction}
          onFeedback={addFeedback}
          onDiscard={discardCommand}
        />
      ) : null}

      {builderOpen ? (
        <DailyPlanBuilder
          currentPlan={displayedPlan}
          candidates={(candidateQuery.data ?? []).filter((task) => task.status === 'active')}
          loadingCandidates={candidateQuery.isPending}
          candidateError={candidateQuery.isError ? 'Active tasks could not be loaded.' : null}
          busy={publishMutation.isPending}
          onClose={() => setBuilderOpen(false)}
          onPublish={publish}
        />
      ) : null}
    </section>
  )
}
