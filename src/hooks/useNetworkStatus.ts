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
  const retrySchedule = retryDelaysMs.length > 0 ? retryDelaysMs.join(',') : ''
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealth>(() => {
    if (!configured) return 'not-configured'
    return browserOnline() ? 'checking' : 'offline'
  })

  useEffect(() => {
    if (!configured || !projectUrl || !publishableKey || typeof fetchImpl !== 'function') {
      setSupabaseHealth(configured ? 'offline' : 'not-configured')
      return
    }

    const normalizedRetryDelays = retrySchedule
      ? retrySchedule
          .split(',')
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
      : []

    let active = true
    let retryAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let probeGeneration = 0
    let probeInFlight = false
    let probeAgain = false

    function clearRetry() {
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    function markOffline() {
      if (active) setSupabaseHealth('offline')
    }

    function retryDelay() {
      if (normalizedRetryDelays.length === 0) {
        return DEFAULT_RETRY_DELAYS_MS[DEFAULT_RETRY_DELAYS_MS.length - 1]
      }
      return normalizedRetryDelays[Math.min(retryAttempt, normalizedRetryDelays.length - 1)]
    }

    function scheduleRetry() {
      if (!active || !browserOnline()) return
      clearRetry()
      const delay = retryDelay()
      retryAttempt += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        void probe()
      }, delay)
    }

    async function probe() {
      if (!active) return
      if (probeInFlight) {
        probeAgain = true
        return
      }
      if (!browserOnline()) {
        probeGeneration += 1
        markOffline()
        return
      }

      probeInFlight = true
      probeAgain = false
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
        if (active && probeAgain) {
          probeAgain = false
          void probe()
        }
      }
    }

    function handleOffline() {
      probeGeneration += 1
      probeAgain = false
      clearRetry()
      markOffline()
    }

    function handleOnline() {
      retryAttempt = 0
      clearRetry()
      void probe()
    }

    function handleFocus() {
      if (!browserOnline()) {
        handleOffline()
        return
      }
      void probe()
    }

    function handleVisibility() {
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
      probeAgain = false
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
  }, [configured, fetchImpl, projectUrl, publishableKey, retrySchedule])

  return {
    online: supabaseHealth === 'online',
    supabaseHealth,
  }
}

export function useNetworkStatus(options?: EffectiveConnectivityOptions) {
  return useEffectiveConnectivity(options).online
}
