import { useState } from 'react'
import type { TodayPlanItem } from '../../data/dailyPlans/models'
import type { TaskAction } from '../../data/execution/models'

export interface ExecutionDetails {
  progressPercent?: number | null
  remainingMinutes?: number | null
  actualMinutes?: number | null
  reason?: string | null
  note?: string | null
}

interface TodayExecutionControlsProps {
  item: TodayPlanItem
  busy: boolean
  online: boolean
  onAction: (action: TaskAction, details?: ExecutionDetails) => Promise<void>
  onFeedback: (content: string) => Promise<void>
}

const terminalStates = new Set(['done', 'skipped', 'deferred', 'cancelled'])

export function TodayExecutionControls({
  item,
  busy,
  online,
  onAction,
  onFeedback,
}: TodayExecutionControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<'partial' | 'feedback' | null>(null)
  const [progress, setProgress] = useState('')
  const [remaining, setRemaining] = useState('')
  const [actual, setActual] = useState('')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const state = item.current_state
  const isDone = state === 'done'
  const isTerminal = terminalStates.has(state)
  const canDone = ['planned', 'started', 'partial', 'blocked'].includes(state)

  const run = async (action: TaskAction, details?: ExecutionDetails) => {
    setMessage(null)
    try {
      await onAction(action, details)
      setMenuOpen(false)
      setDetailMode(null)
      setProgress('')
      setRemaining('')
      setActual('')
      setNote('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The action could not be recorded.')
    }
  }

  const submitPartial = async () => {
    const progressValue = progress.trim() === '' ? null : Number(progress)
    const remainingValue = remaining.trim() === '' ? null : Number(remaining)
    const actualValue = actual.trim() === '' ? null : Number(actual)

    if (progressValue === null && remainingValue === null) {
      setMessage('Partial requires Progress % or Remaining minutes.')
      return
    }
    if (progressValue !== null && (!Number.isFinite(progressValue) || progressValue <= 0 || progressValue >= 100)) {
      setMessage('Progress must be greater than 0 and less than 100.')
      return
    }
    if (remainingValue !== null && (!Number.isInteger(remainingValue) || remainingValue < 0)) {
      setMessage('Remaining minutes must be a whole number of zero or more.')
      return
    }
    if (actualValue !== null && (!Number.isInteger(actualValue) || actualValue < 0)) {
      setMessage('Actual minutes must be a whole number of zero or more.')
      return
    }

    await run('partial', {
      progressPercent: progressValue,
      remainingMinutes: remainingValue,
      actualMinutes: actualValue,
      note: note.trim() || null,
    })
  }

  const submitFeedback = async () => {
    const content = feedback.trim()
    if (!content) {
      setMessage('Feedback cannot be empty.')
      return
    }
    setMessage(null)
    try {
      await onFeedback(content)
      setFeedback('')
      setDetailMode(null)
      setMenuOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Feedback could not be saved.')
    }
  }

  return (
    <div className="execution-controls" aria-label={`Execution controls for ${item.task.title}`}>
      <div className="execution-primary-row">
        {canDone || isDone ? (
          <label className="done-control">
            <input
              type="checkbox"
              checked={isDone}
              disabled={busy || isDone || !canDone}
              onChange={() => void run('done')}
              aria-label={`Mark ${item.task.title} done`}
            />
            <span>{isDone ? 'Done' : 'Mark done'}</span>
          </label>
        ) : (
          <span className="execution-state-label">{state}</span>
        )}

        <button
          type="button"
          className="tertiary-button compact-action-button"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((open) => !open)
            setDetailMode(null)
            setMessage(null)
          }}
          disabled={busy}
        >
          Actions
        </button>
      </div>

      {menuOpen ? (
        <div className="execution-action-panel">
          <div className="execution-action-grid">
            {state === 'planned' ? <button type="button" onClick={() => void run('started')} disabled={busy}>Start</button> : null}
            {['planned', 'started', 'partial'].includes(state) ? (
              <button type="button" onClick={() => setDetailMode('partial')} disabled={busy}>Partial</button>
            ) : null}
            {['planned', 'started'].includes(state) ? <button type="button" onClick={() => void run('skipped')} disabled={busy}>Skip Today</button> : null}
            {['planned', 'started', 'partial', 'blocked'].includes(state) ? <button type="button" onClick={() => void run('deferred')} disabled={busy}>Defer</button> : null}
            {['planned', 'started', 'partial'].includes(state) ? <button type="button" onClick={() => void run('blocked')} disabled={busy}>Blocked</button> : null}
            {['planned', 'started', 'partial', 'blocked'].includes(state) ? <button type="button" onClick={() => void run('cancelled')} disabled={busy}>Cancel</button> : null}
            {(isTerminal || state === 'blocked') ? <button type="button" onClick={() => void run('reopened')} disabled={busy}>Reopen</button> : null}
            <button type="button" onClick={() => setDetailMode('feedback')} disabled={busy}>Add Feedback</button>
          </div>

          {detailMode === 'partial' ? (
            <fieldset className="execution-detail-form" disabled={busy}>
              <legend>Record partial progress</legend>
              <label>
                <span>Progress %</span>
                <input type="number" min="1" max="99" step="1" value={progress} onChange={(event) => setProgress(event.target.value)} />
              </label>
              <label>
                <span>Remaining minutes</span>
                <input type="number" min="0" step="1" value={remaining} onChange={(event) => setRemaining(event.target.value)} />
              </label>
              <label>
                <span>Actual minutes</span>
                <input type="number" min="0" step="1" value={actual} onChange={(event) => setActual(event.target.value)} />
              </label>
              <label className="execution-detail-wide">
                <span>Note</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <button type="button" className="primary-button" onClick={() => void submitPartial()}>Save Partial</button>
            </fieldset>
          ) : null}

          {detailMode === 'feedback' ? (
            <fieldset className="execution-detail-form" disabled={busy}>
              <legend>Add feedback</legend>
              <label className="execution-detail-wide">
                <span>What should TaskRing remember?</span>
                <textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
              </label>
              <button type="button" className="primary-button" onClick={() => void submitFeedback()}>Save Feedback</button>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {!online ? <p className="execution-offline-hint">Connect to record actions.</p> : null}
      {message ? <p className="action-message error" role="alert">{message}</p> : null}
    </div>
  )
}
