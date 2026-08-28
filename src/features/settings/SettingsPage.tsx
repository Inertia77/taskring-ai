import { useMemo, useState } from 'react'
import type { SupabaseHealth } from '../../lib/supabaseHealth'
import { NetworkStatus } from '../../components/NetworkStatus'
import { getDefaultOfflineRepository, type OfflineRepository } from '../../data/offline/offlineRepository'
import type { SyncSummary } from '../../data/offline/models'
import { useOfflineCommands } from '../../data/offline/useOfflineCommands'

interface SettingsPageProps {
  online: boolean
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  userId?: string
  offlineRepository?: OfflineRepository | null
  syncNow?: (force?: boolean) => Promise<SyncSummary>
  onSignOut: () => void
}

export function SettingsPage({
  online,
  supabaseHealth,
  busy,
  authErrorMessage,
  userId = '',
  offlineRepository,
  syncNow,
  onSignOut,
}: SettingsPageProps) {
  const [clearConfirm, setClearConfirm] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const resolvedOfflineRepository = useMemo(() => {
    if (!userId) return null
    if (offlineRepository !== undefined) return offlineRepository
    return getDefaultOfflineRepository()
  }, [offlineRepository, userId])
  const { commands } = useOfflineCommands(resolvedOfflineRepository, userId)

  const connectionLabel = {
    checking: 'Checking',
    online: 'Online',
    offline: 'Unavailable',
    'not-configured': 'Not configured',
  }[supabaseHealth]

  const runSync = async () => {
    if (!syncNow || !online) return
    setLocalBusy(true)
    setMessage(null)
    try {
      const result = await syncNow(true)
      if (result.conflicts) setMessage('Some local commands still have a Sync issue.')
      else setMessage(`${result.acknowledged} local command${result.acknowledged === 1 ? '' : 's'} synced.`)
    } finally {
      setLocalBusy(false)
    }
  }

  const clearOfflineData = async () => {
    if (!resolvedOfflineRepository || !userId) return
    setLocalBusy(true)
    try {
      await resolvedOfflineRepository.clearUserData(userId)
      setClearConfirm(false)
      setMessage('Offline data for this account was cleared from this device.')
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <section className="page-stack" aria-labelledby="settings-title">
      <header className="page-heading">
        <p className="page-kicker">Private workspace</p>
        <h1 id="settings-title">Settings</h1>
        <p className="page-summary">Application, session, and local offline persistence status.</p>
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

      {resolvedOfflineRepository ? (
        <section className="settings-card offline-settings-card" aria-label="Offline data">
          <div className="settings-row">
            <span>Pending local commands</span>
            <strong>{commands.length}</strong>
          </div>
          <p className="muted-text">Pending commands and Today snapshots are stored in IndexedDB on this device and scoped to this account. They do not contain auth tokens.</p>
          {commands.length > 0 ? <p className="offline-note">Signing out does not delete these unsynced actions. They remain local and cannot sync under another account.</p> : null}
          {syncNow ? <button type="button" className="secondary-button" disabled={!online || localBusy || commands.length === 0} onClick={() => void runSync()}>Sync Now</button> : null}
          {!clearConfirm ? (
            <button type="button" className="tertiary-button" disabled={localBusy} onClick={() => setClearConfirm(true)}>Clear offline data</button>
          ) : (
            <div className="clear-offline-confirm" role="alert">
              <strong>Delete this account’s offline data from this device?</strong>
              <p>{commands.length > 0 ? `${commands.length} pending command${commands.length === 1 ? '' : 's'} will be permanently lost and will not reach the server.` : 'The local Today snapshot will be removed.'}</p>
              <div className="button-row">
                <button type="button" className="danger-button" disabled={localBusy} onClick={() => void clearOfflineData()}>Delete offline data</button>
                <button type="button" className="tertiary-button" disabled={localBusy} onClick={() => setClearConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {message ? <p role="status">{message}</p> : null}
        </section>
      ) : null}

      {authErrorMessage ? <p className="auth-message error" role="alert">{authErrorMessage}</p> : null}

      <button className="sign-out-button" type="button" disabled={busy || localBusy} onClick={onSignOut}>
        Sign Out
      </button>
    </section>
  )
}
