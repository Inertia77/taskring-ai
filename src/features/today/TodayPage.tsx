import type { SupabaseHealth } from '../../lib/supabaseHealth'
import { NetworkStatus } from '../../components/NetworkStatus'

interface TodayPageProps {
  online: boolean
  supabaseHealth: SupabaseHealth
}

export function TodayPage({ online, supabaseHealth }: TodayPageProps) {
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  const systemLabel = {
    checking: 'Checking system',
    online: 'System online',
    offline: 'Connection unavailable',
    'not-configured': 'System not configured',
  }[supabaseHealth]

  return (
    <section className="page-stack" aria-labelledby="today-title">
      <header className="page-heading">
        <p className="page-kicker">{dateLabel}</p>
        <h1 id="today-title">Today</h1>
        <p className="page-summary">Your execution surface will live here. Daily plan data is intentionally not loaded in this foundation.</p>
      </header>

      <section className="shell-status-card" aria-label="Application status">
        <div>
          <p className="status-label">App shell</p>
          <strong>{systemLabel}</strong>
        </div>
        <NetworkStatus online={online} />
      </section>

      {!online ? (
        <p className="offline-note" role="status">
          App shell available offline. Task data sync requires connection.
        </p>
      ) : null}

      <div className="today-future-space" aria-hidden="true" />
    </section>
  )
}
