import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createHistoryRepository, type HistoryRepository } from '../../data/history/historyRepository'
import { commandDisplayAction } from '../../data/offline/projection'
import { getDefaultOfflineRepository, type OfflineRepository } from '../../data/offline/offlineRepository'
import type { OfflineCommand, SyncSummary } from '../../data/offline/models'
import { useOfflineCommands } from '../../data/offline/useOfflineCommands'
import { historyQueryKeys } from '../../data/queryKeys'
import { supabase } from '../../lib/supabaseClient'

interface HistoryPageProps {
  userId: string
  online?: boolean
  repository?: HistoryRepository
  offlineRepository?: OfflineRepository | null
  syncNow?: (force?: boolean) => Promise<SyncSummary>
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

function pendingTime(command: OfflineCommand) {
  return eventTime(command.occurred_at ?? command.created_at)
}

export function HistoryPage({
  userId,
  online = true,
  repository,
  offlineRepository,
  syncNow,
}: HistoryPageProps) {
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const resolvedRepository = useMemo(() => {
    if (repository) return repository
    if (!supabase) return null
    return createHistoryRepository(supabase, userId)
  }, [repository, userId])
  const resolvedOfflineRepository = useMemo(() => {
    if (offlineRepository !== undefined) return offlineRepository
    return getDefaultOfflineRepository()
  }, [offlineRepository])
  const { commands } = useOfflineCommands(resolvedOfflineRepository, userId)

  const eventsQuery = useQuery({
    queryKey: historyQueryKeys.events(userId),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.listRecentEvents()
    },
    enabled: online || !resolvedOfflineRepository,
  })

  const feedbackQuery = useQuery({
    queryKey: historyQueryKeys.feedback(userId),
    queryFn: () => {
      if (!resolvedRepository) throw new Error('Supabase is not configured.')
      return resolvedRepository.listRecentFeedback()
    },
    enabled: online || !resolvedOfflineRepository,
  })

  const syncedEventIds = useMemo(() => new Set((eventsQuery.data ?? []).map((event) => event.id)), [eventsQuery.data])
  const syncedFeedbackIds = useMemo(() => new Set((feedbackQuery.data ?? []).map((item) => item.id)), [feedbackQuery.data])
  const visiblePending = useMemo(() => commands.filter((command) => {
    if (command.command_type === 'record_task_action_v01' && command.event_id && syncedEventIds.has(command.event_id)) return false
    if (command.command_type === 'add_plan_item_feedback_v01' && command.feedback_id && syncedFeedbackIds.has(command.feedback_id)) return false
    return true
  }), [commands, syncedEventIds, syncedFeedbackIds])

  const runSync = async () => {
    if (!syncNow || !online) return
    setSyncBusy(true)
    setSyncMessage(null)
    try {
      const summary = await syncNow(true)
      if (summary.conflicts) setSyncMessage('Some local commands still have a Sync issue.')
      else if (summary.acknowledged) setSyncMessage(`${summary.acknowledged} local command${summary.acknowledged === 1 ? '' : 's'} synced.`)
      else setSyncMessage('No command was ready to sync.')
    } finally {
      setSyncBusy(false)
    }
  }

  const discard = async (command: OfflineCommand) => {
    if (!resolvedOfflineRepository) return
    await resolvedOfflineRepository.deleteCommand(command.local_id)
    setSyncMessage('Local pending command discarded. Server history was not changed.')
  }

  return (
    <section className="page-stack history-page" aria-labelledby="history-title">
      <header className="page-heading">
        <p className="page-kicker">Execution timeline</p>
        <h1 id="history-title">History</h1>
        <p className="page-summary">Immutable server facts plus clearly separated local Pending Sync commands.</p>
      </header>

      {visiblePending.length > 0 ? (
        <section className="history-pending-section" aria-labelledby="pending-history-title">
          <div className="history-section-heading sync-section-heading">
            <div>
              <h2 id="pending-history-title">Pending Sync</h2>
              <p>Local commands are not server Events until they receive an RPC acknowledgement and reconciliation succeeds.</p>
            </div>
            {syncNow ? <button type="button" className="secondary-button" disabled={!online || syncBusy} onClick={() => void runSync()}>Sync Now</button> : null}
          </div>
          {!online ? <p className="offline-note" role="status">Offline. These commands remain stored on this device.</p> : null}
          {syncMessage ? <p role="status">{syncMessage}</p> : null}
          <ol className="history-timeline pending-timeline" aria-label="Pending local commands">
            {visiblePending.map((command) => (
              <li key={command.local_id} className="history-event pending-history-event">
                <div className="history-event-heading">
                  <div>
                    <strong>{commandDisplayAction(command)}</strong>
                    <span className={`sync-badge ${command.sync_state === 'conflict' ? 'conflict' : 'pending'}`}>
                      {command.sync_state === 'conflict' ? 'Sync issue' : 'Pending Sync'}
                    </span>
                  </div>
                  <time dateTime={command.occurred_at ?? command.created_at}>{pendingTime(command)}</time>
                </div>
                {command.command_type === 'add_plan_item_feedback_v01' ? <p>{command.feedback_content}</p> : null}
                {command.sync_state === 'conflict' ? (
                  <div className="sync-issue-panel" role="alert">
                    <p>{command.last_error ?? 'Server state rejected this local command.'}</p>
                    <button type="button" className="tertiary-button" onClick={() => void discard(command)}>Discard local pending command</button>
                  </div>
                ) : command.last_error ? <p className="muted-text">Last sync attempt: {command.last_error}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {online && eventsQuery.isPending ? <p className="history-loading" aria-live="polite">Loading execution history…</p> : null}
      {online && eventsQuery.isError ? (
        <section className="empty-state" role="alert">
          <strong>Execution history is unavailable.</strong>
          <p>Please try again when the connection is available.</p>
        </section>
      ) : null}
      {!online && resolvedOfflineRepository ? (
        <p className="offline-note">Server-synced History requires a connection. Pending local commands remain visible above.</p>
      ) : null}
      {eventsQuery.isSuccess && eventsQuery.data.length === 0 ? (
        <section className="empty-state" aria-label="History empty state">
          <strong>No execution events yet.</strong>
          <p>Actions acknowledged by the server will appear here.</p>
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
        {online && feedbackQuery.isPending ? <p aria-live="polite">Loading feedback…</p> : null}
        {online && feedbackQuery.isError ? <p role="alert">Feedback history is unavailable.</p> : null}
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
