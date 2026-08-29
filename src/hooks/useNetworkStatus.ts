import { useEffect, useState } from 'react'
import { checkSupabaseHealth, type SupabaseHealth } from '../lib/supabaseHealth'

const DEFAULT_RETRY_DELAYS_MS = [3_000, 10_000, 30_000] as const

export interface EffectiveConnectivityOptions {
  projectUrl?: string
  publishableKey?: string
  fetchImpl?: typeof fetch
  retryDelaysMs?: readonly number[]
}

export interface EffectiveConnectivity {
  online: boolean
  supabaseHealth: SupabaseHealth
}

function browserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function useEffectiveConnectivity({
  projectUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  fetchImpl = globalThis.fetch,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: EffectiveConnectivityOptions = {}): EffectiveConnectivity {
  const configured = Boolean(projectUrl && publishableKey)
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealth>(() => {
    if (!configured) return 'not-configured'
    return browserOnline() ? 'checking' : 'offline'
  })

  useEffect(() => {
    if (!configured || !projectUrl || !publishableKey || typeof fetchImpl !== 'function') {
      setSupabaseHealth(configured ? 'offline' : 'not-configured')
      return
    }

    let active = true
    let retryAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let probeGeneration = 0
    let probeInFlight = false

    const clearRetry = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    const markOffline = () => {
      if (active) setSupabaseHealth('offline')
    }

    const retryDelay = () => {
      if (retryDelaysMs.length === 0) return DEFAULT_RETRY_DELAYS_MS.at(-1)!
      return retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length - 1)]
    }

    let probe: () => Promise<void>

    const scheduleRetry = () => {
      if (!active || !browserOnline()) return
      clearRetry()
      const delay = retryDelay()
      retryAttempt += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        void probe()
      }, delay)
    }

    probe = async () => {
      if (!active || probeInFlight) return
      if (!browserOnline()) {
        probeGeneration += 1
        markOffline()
        return
      }

      probeInFlight = true
      const generation = ++probeGeneration

      try {
        const healthy = await checkSupabaseHealth(projectUrl, publishableKey, fetchImpl)
        if (!active || generation !== probeGeneration) return

        if (!browserOnline()) {
          markOffline()
          return
        }

        if (healthy) {
          retryAttempt = 0
          clearRetry()
          setSupabaseHealth('online')
        } else {
          markOffline()
          scheduleRetry()
        }
      } catch {
        if (!active || generation !== probeGeneration) return
        markOffline()
        scheduleRetry()
      } finally {
        probeInFlight = false
      }
    }

    const handleOffline = () => {
      probeGeneration += 1
      probeInFlight = false
      clearRetry()
      markOffline()
    }

    const handleOnline = () => {
      retryAttempt = 0
      clearRetry()
      void probe()
    }

    const handleFocus = () => {
      if (!browserOnline()) {
        handleOffline()
        return
      }
      void probe()
    }

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleFocus()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      window.addEventListener('focus', handleFocus)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }

    if (browserOnline()) {
      setSupabaseHealth('checking')
      void probe()
    } else {
      markOffline()
    }

    return () => {
      active = false
      probeGeneration += 1
      clearRetry()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener('focus', handleFocus)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [configured, fetchImpl, projectUrl, publishableKey, retryDelaysMs])

  return {
    online: supabaseHealth === 'online',
    supabaseHealth,
  }
}

export function useNetworkStatus(options?: EffectiveConnectivityOptions) {
  return useEffectiveConnectivity(options).online
}
