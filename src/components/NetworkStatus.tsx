import { useEffect, useState } from 'react'

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}

export function NetworkStatus({ online, compact = false }: { online: boolean; compact?: boolean }) {
  return (
    <span className={`network-status ${online ? 'online' : 'offline'} ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <span className="network-status-dot" aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
