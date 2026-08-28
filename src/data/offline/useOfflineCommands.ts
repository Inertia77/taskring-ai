import { useCallback, useEffect, useState } from 'react'
import type { OfflineCommand } from './models'
import type { OfflineRepository } from './offlineRepository'

export function useOfflineCommands(repository: OfflineRepository | null | undefined, userId: string) {
  const [commands, setCommands] = useState<OfflineCommand[]>([])
  const [loading, setLoading] = useState(Boolean(repository))

  const refresh = useCallback(async () => {
    if (!repository) return
    const next = await repository.listUserCommands(userId)
    setCommands(next)
    setLoading(false)
  }, [repository, userId])

  useEffect(() => {
    if (!repository) return
    let active = true

    const load = async () => {
      const next = await repository.listUserCommands(userId)
      if (active) {
        setCommands(next)
        setLoading(false)
      }
    }

    void load()
    const unsubscribe = repository.subscribe(userId, () => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, userId])

  return {
    commands: repository ? commands : [],
    loading: repository ? loading : false,
    refresh,
  }
}
