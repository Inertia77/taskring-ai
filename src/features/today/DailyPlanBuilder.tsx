import { useMemo, useState } from 'react'
import type { Task } from '../../data/models'
import {
  TODAY_BUCKETS,
  isTodayBucket,
  type ActiveTodayPlan,
  type PublishPlanItemInput,
  type TodayBucket,
} from '../../data/dailyPlans/models'

interface DraftPlanItem {
  taskId: string
  bucket: TodayBucket
  plannedMinutes: string
}

interface DailyPlanBuilderProps {
  currentPlan: ActiveTodayPlan | null
  candidates: Task[]
  loadingCandidates: boolean
  candidateError: string | null
  busy: boolean
  onClose: () => void
  onPublish: (items: PublishPlanItemInput[]) => Promise<void>
}

function initialItems(currentPlan: ActiveTodayPlan | null): DraftPlanItem[] {
  if (!currentPlan) return []
  return [...currentPlan.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      taskId: item.task_id,
      bucket: isTodayBucket(item.bucket) ? item.bucket : 'flex',
      plannedMinutes: item.planned_minutes?.toString() ?? '',
    }))
}

function moveWithinBucket(items: DraftPlanItem[], taskId: string, direction: -1 | 1) {
  const sourceIndex = items.findIndex((item) => item.taskId === taskId)
  if (sourceIndex < 0) return items
  const source = items[sourceIndex]
  const bucketIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.bucket === source.bucket)
    .map(({ index }) => index)
  const bucketIndex = bucketIndexes.indexOf(sourceIndex)
  const targetIndex = bucketIndexes[bucketIndex + direction]
  if (targetIndex === undefined) return items
  const next = [...items]
  ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]]
  return next
}

function buildPublishItems(items: DraftPlanItem[]) {
  const errors: Record<string, string> = {}
  const result: PublishPlanItemInput[] = []

  TODAY_BUCKETS.forEach(({ value: bucket }) => {
    items.filter((item) => item.bucket === bucket).forEach((item, position) => {
      const raw = item.plannedMinutes.trim()
      let plannedMinutes: number | null = null
      if (raw) {
        if (!/^\d+$/.test(raw)) {
          errors[item.taskId] = 'Planned minutes must be a whole number of zero or more.'
          return
        }
        plannedMinutes = Number(raw)
        if (!Number.isSafeInteger(plannedMinutes)) {
          errors[item.taskId] = 'Planned minutes is too large.'
          return
        }
      }
      result.push({ task_id: item.taskId, bucket, position, planned_minutes: plannedMinutes, reason: null })
    })
  })

  return { result, errors }
}

function controlId(prefix: string, taskId: string) {
  return `${prefix}-${taskId}`
}

export function DailyPlanBuilder({
  currentPlan,
  candidates,
  loadingCandidates,
  candidateError,
  busy,
  onClose,
  onPublish,
}: DailyPlanBuilderProps) {
  const [items, setItems] = useState<DraftPlanItem[]>(() => initialItems(currentPlan))
  const [candidateId, setCandidateId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const taskLookup = useMemo(() => {
    const entries = new Map<string, Task>()
    currentPlan?.items.forEach((item) => entries.set(item.task.id, item.task))
    candidates.filter((task) => task.status === 'active').forEach((task) => entries.set(task.id, task))
    return entries
  }, [candidates, currentPlan])

  const selectedIds = useMemo(() => new Set(items.map((item) => item.taskId)), [items])
  const availableCandidates = candidates.filter((task) => task.status === 'active' && !selectedIds.has(task.id))

  const addTask = () => {
    if (!candidateId || selectedIds.has(candidateId)) return
    const task = taskLookup.get(candidateId)
    if (!task || task.status !== 'active') return
    setItems((current) => [...current, { taskId: candidateId, bucket: 'flex', plannedMinutes: '' }])
    setCandidateId('')
  }

  const removeTask = (taskId: string) => {
    setItems((current) => current.filter((item) => item.taskId !== taskId))
    setErrors((current) => {
      const next = { ...current }
      delete next[taskId]
      return next
    })
  }

  const updateItem = (taskId: string, patch: Partial<DraftPlanItem>) => {
    setItems((current) => current.map((item) => item.taskId === taskId ? { ...item, ...patch } : item))
    setErrors((current) => {
      if (!current[taskId]) return current
      const next = { ...current }
      delete next[taskId]
      return next
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const built = buildPublishItems(items)
    if (Object.keys(built.errors).length) {
      setErrors(built.errors)
      return
    }
    setErrors({})
    await onPublish(built.result)
  }

  return (
    <section className="today-builder" aria-labelledby="today-builder-title">
      <div className="today-builder-heading">
        <div>
          <p className="page-kicker">Manual plan builder</p>
          <h2 id="today-builder-title">{currentPlan ? 'Publish a new revision' : 'Build Today Plan'}</h2>
        </div>
        <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Close</button>
      </div>

      <p className="builder-help">
        Select active tasks, place them in Today buckets, then publish. Publishing creates a new immutable plan revision.
      </p>

      {candidateError ? <p className="action-message error" role="alert">{candidateError}</p> : null}

      <div className="candidate-adder">
        <label htmlFor="today-candidate-task">Add active task</label>
        <div className="candidate-adder-controls">
          <select
            id="today-candidate-task"
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
            disabled={loadingCandidates || busy}
          >
            <option value="">{loadingCandidates ? 'Loading active tasks…' : 'Choose a task'}</option>
            {availableCandidates.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
          <button type="button" className="secondary-button" onClick={addTask} disabled={!candidateId || busy}>Add Task</button>
        </div>
      </div>

      <form className="today-builder-form" onSubmit={(event) => void submit(event)} noValidate>
        {items.length === 0 ? (
          <div className="builder-empty">
            <strong>No tasks selected.</strong>
            <p>You can publish an empty plan, or add an active task above.</p>
          </div>
        ) : null}

        {TODAY_BUCKETS.map(({ value: bucket, label }) => {
          const bucketItems = items.filter((item) => item.bucket === bucket)
          if (!bucketItems.length) return null
          return (
            <section className="builder-bucket" key={bucket} aria-labelledby={`builder-${bucket}`}>
              <h3 id={`builder-${bucket}`}>{label}</h3>
              <div className="builder-item-list">
                {bucketItems.map((item, bucketIndex) => {
                  const task = taskLookup.get(item.taskId)
                  const bucketControlId = controlId('today-bucket', item.taskId)
                  const minutesControlId = controlId('today-planned-minutes', item.taskId)
                  const minutesErrorId = controlId('today-planned-minutes-error', item.taskId)
                  return (
                    <article className="builder-item" key={item.taskId}>
                      <div className="builder-item-title">
                        <strong>{task?.title ?? 'Unavailable task'}</strong>
                        {task && task.status !== 'active' ? <span className="status-chip">{task.status}</span> : null}
                      </div>

                      <div className="builder-item-fields">
                        <div>
                          <label htmlFor={bucketControlId}>Bucket</label>
                          <select
                            id={bucketControlId}
                            value={item.bucket}
                            onChange={(event) => updateItem(item.taskId, { bucket: event.target.value as TodayBucket })}
                            disabled={busy}
                          >
                            {TODAY_BUCKETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={minutesControlId}>Planned minutes <span className="optional-label">Optional</span></label>
                          <input
                            id={minutesControlId}
                            aria-label="Planned minutes"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={item.plannedMinutes}
                            onChange={(event) => updateItem(item.taskId, { plannedMinutes: event.target.value })}
                            aria-invalid={Boolean(errors[item.taskId])}
                            aria-describedby={errors[item.taskId] ? minutesErrorId : undefined}
                            disabled={busy}
                          />
                          {errors[item.taskId] ? <span id={minutesErrorId} className="field-error" role="alert">{errors[item.taskId]}</span> : null}
                        </div>
                      </div>

                      <div className="builder-item-actions">
                        <button type="button" className="quiet-button" onClick={() => setItems((current) => moveWithinBucket(current, item.taskId, -1))} disabled={busy || bucketIndex === 0}>Move Up</button>
                        <button type="button" className="quiet-button" onClick={() => setItems((current) => moveWithinBucket(current, item.taskId, 1))} disabled={busy || bucketIndex === bucketItems.length - 1}>Move Down</button>
                        <button type="button" className="danger-button" onClick={() => removeTask(item.taskId)} disabled={busy}>Remove Task</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

        <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Publishing…' : 'Publish Plan'}</button>
      </form>
    </section>
  )
}
