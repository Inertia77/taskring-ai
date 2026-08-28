import { useCallback, useEffect, useState } from 'react'
import type { OfflineCommand } from './models'
import type { OfflineRepository } from './offlineRepository'

export function useOfflineCommands(repository: OfflineRepository | null | undefined, userId: string) {
  const [commands, setCommands] = useState<OfflineCommand[]>([])
  const [loading, setLoading] = useState(Boolean(repository))

  const refresh = useCallback(async () => {
    if (!repository) {
      setCommands([])
      setLoading(false)
      return
    }
    const next = await repository.listUserCommands(userId)
    setCommands(next)
    setLoading(false)
  }, [repository, userId])

  useEffect(() => {
    let active = true
    if (!repository) {
      setCommands([])
      setLoading(false)
      return
    }

    const load = async () => {
      const next = await repository.listUserCommands(userId)
      if (active) {
        setCommands(next)
        setLoading(false)
      }
    }

    setLoading(true)
    void load()
    const unsubscribe = repository.subscribe(userId, () => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, userId])

  return { commands, loading, refresh }
}
