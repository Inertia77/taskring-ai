import { useEffect } from 'react'
import type { OutboxSyncEngine } from './syncEngine'

export function useOutboxAutoSync(online: boolean, syncEngine: OutboxSyncEngine | null) {
  useEffect(() => {
    if (!online || !syncEngine) return
    void syncEngine.syncNow(false)
  }, [online, syncEngine])
}
