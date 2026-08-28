import { useMemo, useState } from 'react'
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
  onEdit: () => void
  onAction: (itemId: string, action: TaskAction, details?: ExecutionDetails) => Promise<void>
  onFeedback: (itemId: string, content: string) => Promise<void>
}

function TodayPlan({ plan, timeZone, online, busy, onEdit, onAction, onFeedback }: TodayPlanProps) {
  const executionStarted = plan.items.some((item) => item.current_state !== 'planned' || Boolean(item.latestEvent))

  return (
    <div className="today-plan-stack">
      <section className="today-plan-summary" aria-label="Published plan">
        <div>
          <p className="status-label">Published plan</p>
          <strong>Revision {plan.plan.revision}</strong>
        </div>
        <button type="button" className="secondary-button" onClick={onEdit} disabled={executionStarted}>Edit Today’s Plan</button>
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
                return (
                  <article className={`today-item execution-state-${item.current_state}`} key={item.id}>
                    <div className="today-item-heading">
                      <div>
                        <h3>{item.task.title}</h3>
                        {item.project ? <p>{item.project.title}</p> : null}
                      </div>
                      {item.current_state !== 'planned' ? <span className="status-chip">{item.current_state}</span> : null}
                    </div>
                    <div className="metadata-row">
                      {item.planned_minutes !== null ? <span>{item.planned_minutes} min planned</span> : null}
                      {due ? <span>Due {due}</span> : null}
                      {item.task.priority_hint ? <span>{item.task.priority_hint}</span> : null}
                      {item.task.task_kind !== 'normal' ? <span>{item.task.task_kind}</span> : null}
                      {item.current_state === 'partial' && item.task.remaining_minutes !== null ? <span>{item.task.remaining_minutes} min remaining</span> : null}
                    </div>
                    {summary ? <p className="execution-summary">Latest: {summary}</p> : null}
                    <TodayExecutionControls
                      item={item}
                      busy={busy}
                      online={online}
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
  planningTimeZone,
  now,
  actionClock = () => new Date(),
  idFactory = () => crypto.randomUUID(),
}: TodayPageProps) {
  const queryClient = useQueryClient()
  const [builderOpen, setBuilderOpen] = useState(false)
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

  const todayQuery = useQuery({
    queryKey: todayQueryKeys.plan(userId, planDate),
    queryFn: async (): Promise<ActiveTodayPlan | null> => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      const plan = await resolvedRepository.getActivePlan(planDate)
      if (!plan) return null
      const items = await resolvedRepository.getPlanItems(plan.id)
      return { plan, items }
    },
  })

  const candidateQuery = useQuery({
    queryKey: todayQueryKeys.candidates(userId, planDate),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.getCandidateTasks()
    },
    enabled: builderOpen,
  })

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
        basePlanId: todayQuery.data?.plan.id ?? null,
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

  const executionMutation = useMutation({
    mutationFn: async ({ itemId, action, details }: { itemId: string; action: TaskAction; details?: ExecutionDetails }) => {
      if (!online) throw new Error('Connect to the internet to record this action. Nothing was saved offline.')
      if (!resolvedExecutionRepository) throw new Error('Execution service is unavailable.')
      return resolvedExecutionRepository.recordAction({
        eventId: idFactory(),
        planItemId: itemId,
        action,
        occurredAt: actionClock().toISOString(),
        ...details,
      })
    },
    onSuccess: async () => {
      setActionMessage({ kind: 'success', text: 'Action recorded.' })
      await invalidateExecutionSurfaces()
    },
  })

  const feedbackMutation = useMutation({
    mutationFn: async ({ itemId, content }: { itemId: string; content: string }) => {
      if (!online) throw new Error('Connect to the internet to record this action. Nothing was saved offline.')
      if (!resolvedExecutionRepository) throw new Error('Feedback service is unavailable.')
      return resolvedExecutionRepository.addFeedback({
        feedbackId: idFactory(),
        planItemId: itemId,
        content,
      })
    },
    onSuccess: async () => {
      setActionMessage({ kind: 'success', text: 'Feedback saved.' })
      await queryClient.invalidateQueries({ queryKey: historyQueryKeys.feedback(userId) })
    },
  })

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
    await executionMutation.mutateAsync({ itemId, action, details })
  }

  const addFeedback = async (itemId: string, content: string) => {
    setActionMessage(null)
    await feedbackMutation.mutateAsync({ itemId, content })
  }

  const openBuilder = () => {
    setActionMessage(null)
    setBuilderOpen(true)
  }

  return (
    <section className="page-stack today-page" aria-labelledby="today-title">
      <header className="page-heading">
        <p className="page-kicker">{dateLabel} · {timeZone}</p>
        <h1 id="today-title">Today</h1>
        <p className="page-summary">Your published plan and human execution record for {planDate}.</p>
      </header>

      {!online ? (
        <p className="offline-note" role="status">App shell remains available offline. Recording actions or publishing a plan requires a connection.</p>
      ) : null}

      {actionMessage ? <p className={`action-message ${actionMessage.kind}`} role={actionMessage.kind === 'error' ? 'alert' : 'status'}>{actionMessage.text}</p> : null}

      {todayQuery.isPending ? (
        <section className="today-loading" aria-live="polite"><strong>Loading today’s plan…</strong></section>
      ) : null}

      {todayQuery.isError ? (
        <section className="empty-state" role="alert">
          <strong>Today’s plan is unavailable.</strong>
          <p>{readableError(todayQuery.error)}</p>
          <button type="button" className="secondary-button" onClick={() => void todayQuery.refetch()}>Try Again</button>
        </section>
      ) : null}

      {todayQuery.isSuccess && !todayQuery.data && !builderOpen ? (
        <section className="empty-state">
          <strong>No plan published for today.</strong>
          <p>Build a manual plan from your active Task definitions.</p>
          <button type="button" className="primary-button" onClick={openBuilder}>Build Today Plan</button>
        </section>
      ) : null}

      {todayQuery.isSuccess && todayQuery.data && !builderOpen ? (
        <TodayPlan
          plan={todayQuery.data}
          timeZone={timeZone}
          online={online}
          busy={executionMutation.isPending || feedbackMutation.isPending}
          onEdit={openBuilder}
          onAction={recordAction}
          onFeedback={addFeedback}
        />
      ) : null}

      {builderOpen ? (
        <DailyPlanBuilder
          currentPlan={todayQuery.data ?? null}
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
