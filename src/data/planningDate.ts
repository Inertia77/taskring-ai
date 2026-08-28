export function resolvePlanningTimeZone() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timeZone || 'UTC'
}

export function planDateForInstant(instant: Date, timeZone: string) {
  if (Number.isNaN(instant.getTime())) throw new Error('A valid instant is required.')

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const { year, month, day } = values
  if (!year || !month || !day) throw new Error('Unable to resolve planning date.')
  return `${year}-${month}-${day}`
}

export function planningDateLabel(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(instant)
}
