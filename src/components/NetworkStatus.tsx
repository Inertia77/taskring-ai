export function NetworkStatus({ online, compact = false }: { online: boolean; compact?: boolean }) {
  return (
    <span className={`network-status ${online ? 'online' : 'offline'} ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <span className="network-status-dot" aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
