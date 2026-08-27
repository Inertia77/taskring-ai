import type { SupabaseHealth } from '../../lib/supabaseHealth'
import { NetworkStatus } from '../../components/NetworkStatus'

interface SettingsPageProps {
  online: boolean
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onSignOut: () => void
}

export function SettingsPage({
  online,
  supabaseHealth,
  busy,
  authErrorMessage,
  onSignOut,
}: SettingsPageProps) {
  const connectionLabel = {
    checking: 'Checking',
    online: 'Online',
    offline: 'Unavailable',
    'not-configured': 'Not configured',
  }[supabaseHealth]

  return (
    <section className="page-stack" aria-labelledby="settings-title">
      <header className="page-heading">
        <p className="page-kicker">Private workspace</p>
        <h1 id="settings-title">Settings</h1>
        <p className="page-summary">Minimal application and session status only.</p>
      </header>

      <section className="settings-card" aria-label="Application status">
        <div className="settings-row">
          <span>Product</span>
          <strong>TaskRing AI Secretary</strong>
        </div>
        <div className="settings-row">
          <span>Session</span>
          <strong>Authenticated</strong>
        </div>
        <div className="settings-row">
          <span>Supabase</span>
          <strong>{connectionLabel}</strong>
        </div>
        <div className="settings-row">
          <span>Network</span>
          <NetworkStatus online={online} compact />
        </div>
      </section>

      {authErrorMessage ? <p className="auth-message error" role="alert">{authErrorMessage}</p> : null}

      <button className="sign-out-button" type="button" disabled={busy} onClick={onSignOut}>
        Sign Out
      </button>
    </section>
  )
}
