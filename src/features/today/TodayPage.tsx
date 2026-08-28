import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDailyPlanRepository, type DailyPlanRepository } from '../../data/dailyPlans/dailyPlanRepository'
import {
  DailyPlanPublishError,
  TODAY_BUCKETS,
  type ActiveTodayPlan,
  type PublishPlanItemInput,
} from '../../data/dailyPlans/models'
import { managementQueryKeys, todayQueryKeys } from '../../data/queryKeys'
import { planDateForInstant, planningDateLabel, resolvePlanningTimeZone } from '../../data/planningDate'
import { supabase } from '../../lib/supabaseClient'
import { DailyPlanBuilder } from './DailyPlanBuilder'

interface TodayPageProps {
  userId: string
  online: boolean
  repository?: DailyPlanRepository
  planningTimeZone?: string
  now?: Date
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

function TodayPlan({ plan, timeZone, onEdit }: { plan: ActiveTodayPlan; timeZone: string; onEdit: () => void }) {
  const executionStarted = plan.items.some((item) => item.current_state !== 'planned')

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
        <p className="offline-note" role="status">Execution has started; replanning is not supported by this stage.</p>
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
                return (
                  <article className="today-item" key={item.id}>
                    <div className="today-item-heading">
                      <div>
                        <h3>{item.task.title}</h3>
                        {item.project ? <p>{item.project.title}</p> : null}
                      </div>
                      {item.task.status !== 'active' ? <span className="status-chip">{item.task.status}</span> : null}
                    </div>
                    <div className="metadata-row">
                      {item.planned_minutes !== null ? <span>{item.planned_minutes} min planned</span> : null}
                      {due ? <span>Due {due}</span> : null}
                      {item.task.priority_hint ? <span>{item.task.priority_hint}</span> : null}
                      {item.task.task_kind !== 'normal' ? <span>{item.task.task_kind}</span> : null}
                    </div>
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

      <p className="execution-boundary-note">Execution controls arrive in the next stage.</p>
    </div>
  )
}

export function TodayPage({ userId, online, repository, planningTimeZone, now }: TodayPageProps) {
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: todayQueryKeys.plan(userId, planDate) }),
        queryClient.invalidateQueries({ queryKey: todayQueryKeys.candidates(userId, planDate) }),
        queryClient.invalidateQueries({ queryKey: managementQueryKeys.tasks(userId) }),
      ])
    },
    onError: (error) => {
      if (error instanceof DailyPlanPublishError && error.kind === 'stale') {
        setActionMessage({ kind: 'error', text: `${error.message} Reload Today before trying again.` })
        return
      }
      setActionMessage({ kind: 'error', text: readableError(error) })
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

  const openBuilder = () => {
    setActionMessage(null)
    setBuilderOpen(true)
  }

  return (
    <section className="page-stack today-page" aria-labelledby="today-title">
      <header className="page-heading">
        <p className="page-kicker">{dateLabel} · {timeZone}</p>
        <h1 id="today-title">Today</h1>
        <p className="page-summary">Your published execution plan for {planDate}.</p>
      </header>

      {!online ? (
        <p className="offline-note" role="status">App shell remains available offline. Publishing a plan requires a connection.</p>
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
        <TodayPlan plan={todayQuery.data} timeZone={timeZone} onEdit={openBuilder} />
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
