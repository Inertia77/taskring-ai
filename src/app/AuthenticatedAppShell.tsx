import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SupabaseHealth } from '../lib/supabaseHealth'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { NetworkStatus } from '../components/NetworkStatus'
import { HistoryPage } from '../features/history/HistoryPage'
import { InboxPage } from '../features/inbox/InboxPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { TodayPage } from '../features/today/TodayPage'
import { createDailyPlanRepository } from '../data/dailyPlans/dailyPlanRepository'
import { createExecutionRepository } from '../data/execution/executionRepository'
import { EMPTY_SYNC_SUMMARY, type OfflineCommand, type SyncSummary } from '../data/offline/models'
import { getDefaultOfflineRepository, type OfflineRepository } from '../data/offline/offlineRepository'
import { createOfflineServerReconciliationRepository } from '../data/offline/reconciliationRepository'
import { createOutboxSyncEngine, type OutboxSyncEngine } from '../data/offline/syncEngine'
import { useOutboxAutoSync } from '../data/offline/useOutboxAutoSync'
import { historyQueryKeys, managementQueryKeys, todayQueryKeys } from '../data/queryKeys'
import { supabase } from '../lib/supabaseClient'
import { resolveAppRoute, useAppRouter, type AppRoutePath } from './router'

interface AppShellViewProps {
  pathname: string
  userId: string
  online: boolean
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onNavigate: (path: AppRoutePath) => void
  onSignOut: () => void
  offlineRepository?: OfflineRepository | null
  syncNow?: (force?: boolean) => Promise<SyncSummary>
}

export function AuthenticatedAppShellView({
  pathname,
  userId,
  online,
  supabaseHealth,
  busy,
  authErrorMessage,
  onNavigate,
  onSignOut,
  offlineRepository,
  syncNow,
}: AppShellViewProps) {
  const route = resolveAppRoute(pathname)

  const page = {
    today: <TodayPage userId={userId} online={online} offlineRepository={offlineRepository} syncNow={syncNow} />,
    inbox: <InboxPage />,
    tasks: <TasksPage userId={userId} online={online} />,
    history: <HistoryPage userId={userId} online={online} offlineRepository={offlineRepository} syncNow={syncNow} />,
    settings: (
      <SettingsPage
        online={online}
        supabaseHealth={supabaseHealth}
        busy={busy}
        authErrorMessage={authErrorMessage}
        userId={userId}
        offlineRepository={offlineRepository}
        syncNow={syncNow}
        onSignOut={onSignOut}
      />
    ),
  }[route.key]

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="app-header">
          <a className="skip-link" href="#main-content">Skip to content</a>
          <div>
            <p className="app-wordmark">TaskRing</p>
            <p className="app-subtitle">AI Secretary</p>
          </div>
          <NetworkStatus online={online} compact />
        </header>

        <main id="main-content" className="app-content" tabIndex={-1}>
          {page}
        </main>
      </div>

      <BottomNavigation activeRoute={route.key} onNavigate={onNavigate} />
    </div>
  )
}

interface AuthenticatedAppShellProps {
  userId: string
  online: boolean
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onSignOut: () => void
}

export function AuthenticatedAppShell({
  userId,
  online,
  supabaseHealth,
  busy,
  authErrorMessage,
  onSignOut,
}: AuthenticatedAppShellProps) {
  const router = useAppRouter()
  const queryClient = useQueryClient()
  const offlineRepository = useMemo(() => getDefaultOfflineRepository(), [])
  const dailyPlanRepository = useMemo(() => {
    if (!supabase) return null
    return createDailyPlanRepository(supabase, userId)
  }, [userId])
  const executionRepository = useMemo(() => {
    if (!supabase) return null
    return createExecutionRepository(supabase)
  }, [])
  const serverReconciliationRepository = useMemo(() => {
    if (!supabase) return null
    return createOfflineServerReconciliationRepository(supabase, userId)
  }, [userId])

  const reconcile = useCallback(async (command: OfflineCommand) => {
    if (!offlineRepository || !dailyPlanRepository || !serverReconciliationRepository) {
      throw new Error('Authoritative reconciliation is unavailable.')
    }

    // Verify that the immutable server Event/Feedback row exists before local ack removal.
    await serverReconciliationRepository.assertAcknowledged(command)

    const plan = await dailyPlanRepository.getActivePlan(command.plan_date)
    if (plan) {
      const items = await dailyPlanRepository.getPlanItems(plan.id)
      await offlineRepository.saveTodaySnapshot(userId, command.plan_date, { plan, items })
    } else {
      await offlineRepository.clearTodaySnapshot(userId, command.plan_date)
    }

    // Invalidate and await active server reads before the outbox command is removed.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: todayQueryKeys.plan(userId, command.plan_date) }),
      queryClient.invalidateQueries({ queryKey: todayQueryKeys.candidates(userId, command.plan_date) }),
      queryClient.invalidateQueries({ queryKey: managementQueryKeys.tasks(userId) }),
      queryClient.invalidateQueries({ queryKey: historyQueryKeys.events(userId) }),
      queryClient.invalidateQueries({ queryKey: historyQueryKeys.feedback(userId) }),
    ])
  }, [dailyPlanRepository, offlineRepository, queryClient, serverReconciliationRepository, userId])

  const syncEngine: OutboxSyncEngine | null = useMemo(() => {
    if (!offlineRepository || !executionRepository) return null
    return createOutboxSyncEngine({
      userId,
      repository: offlineRepository,
      executionRepository,
      reconcile,
    })
  }, [executionRepository, offlineRepository, reconcile, userId])

  const syncNow = useCallback((force = true) => {
    if (!syncEngine) return Promise.resolve({ ...EMPTY_SYNC_SUMMARY })
    return syncEngine.syncNow(force)
  }, [syncEngine])

  // Covers authenticated startup and every effective offline -> online transition.
  useOutboxAutoSync(online, syncEngine)

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: managementQueryKeys.root(userId) })
      queryClient.removeQueries({ queryKey: todayQueryKeys.root(userId) })
      queryClient.removeQueries({ queryKey: historyQueryKeys.root(userId) })
    }
  }, [queryClient, userId])

  return (
    <AuthenticatedAppShellView
      pathname={router.path}
      userId={userId}
      online={online}
      supabaseHealth={supabaseHealth}
      busy={busy}
      authErrorMessage={authErrorMessage}
      onNavigate={router.navigate}
      onSignOut={onSignOut}
      offlineRepository={offlineRepository}
      syncNow={syncNow}
    />
  )
}
