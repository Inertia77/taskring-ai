import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createHistoryRepository, type HistoryRepository } from '../../data/history/historyRepository'
import { historyQueryKeys } from '../../data/queryKeys'
import { supabase } from '../../lib/supabaseClient'

interface HistoryPageProps {
  userId: string
  repository?: HistoryRepository
}

function eventTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function HistoryPage({ userId, repository }: HistoryPageProps) {
  const resolvedRepository = useMemo(() => {
    if (repository) return repository
    if (!supabase) return null
    return createHistoryRepository(supabase, userId)
  }, [repository, userId])

  const eventsQuery = useQuery({
    queryKey: historyQueryKeys.events(userId),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.listRecentEvents()
    },
  })

  const feedbackQuery = useQuery({
    queryKey: historyQueryKeys.feedback(userId),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.listRecentFeedback()
    },
  })

  return (
    <section className="page-stack history-page" aria-labelledby="history-title">
      <header className="page-heading">
        <p className="page-kicker">Execution timeline</p>
        <h1 id="history-title">History</h1>
        <p className="page-summary">Immutable facts from your TaskRing execution history.</p>
      </header>

      {eventsQuery.isPending ? <p className="history-loading" aria-live="polite">Loading execution history…</p> : null}
      {eventsQuery.isError ? (
        <section className="empty-state" role="alert">
          <strong>Execution history is unavailable.</strong>
          <p>Please try again when the connection is available.</p>
        </section>
      ) : null}
      {eventsQuery.isSuccess && eventsQuery.data.length === 0 ? (
        <section className="empty-state" aria-label="History empty state">
          <strong>No execution events yet.</strong>
          <p>Actions recorded from Today will appear here.</p>
        </section>
      ) : null}
      {eventsQuery.isSuccess && eventsQuery.data.length > 0 ? (
        <ol className="history-timeline" aria-label="Recent task events">
          {eventsQuery.data.map((event) => (
            <li key={event.id} className="history-event">
              <div className="history-event-heading">
                <div>
                  <strong>{event.taskTitle}</strong>
                  <span className="status-chip">{event.event_type}</span>
                </div>
                <time dateTime={event.occurred_at}>{eventTime(event.occurred_at)}</time>
              </div>
              <div className="metadata-row">
                {event.progress_percent !== null ? <span>{event.progress_percent}% progress</span> : null}
                {event.remaining_minutes !== null ? <span>{event.remaining_minutes} min remaining</span> : null}
                {event.actual_minutes !== null ? <span>{event.actual_minutes} min actual</span> : null}
              </div>
              {event.reason ? <p><strong>Reason:</strong> {event.reason}</p> : null}
              {event.note ? <p><strong>Note:</strong> {event.note}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <section className="history-feedback-section" aria-labelledby="feedback-history-title">
        <header className="history-section-heading">
          <h2 id="feedback-history-title">Feedback</h2>
          <p>Raw user feedback only. No AI interpretation is applied in this stage.</p>
        </header>
        {feedbackQuery.isPending ? <p aria-live="polite">Loading feedback…</p> : null}
        {feedbackQuery.isError ? <p role="alert">Feedback history is unavailable.</p> : null}
        {feedbackQuery.isSuccess && feedbackQuery.data.length === 0 ? <p className="muted-text">No feedback recorded yet.</p> : null}
        {feedbackQuery.isSuccess && feedbackQuery.data.length > 0 ? (
          <ul className="feedback-history-list">
            {feedbackQuery.data.map((item) => (
              <li key={item.id}>
                <div className="history-event-heading">
                  <strong>{item.taskTitle ?? 'Today feedback'}</strong>
                  <time dateTime={item.created_at}>{eventTime(item.created_at)}</time>
                </div>
                <p>{item.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  )
}
