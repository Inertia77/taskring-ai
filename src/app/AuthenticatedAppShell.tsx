import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SupabaseHealth } from '../lib/supabaseHealth'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { NetworkStatus } from '../components/NetworkStatus'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { HistoryPage } from '../features/history/HistoryPage'
import { InboxPage } from '../features/inbox/InboxPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { TodayPage } from '../features/today/TodayPage'
import { historyQueryKeys, managementQueryKeys, todayQueryKeys } from '../data/queryKeys'
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
}: AppShellViewProps) {
  const route = resolveAppRoute(pathname)

  const page = {
    today: <TodayPage userId={userId} online={online} />,
    inbox: <InboxPage />,
    tasks: <TasksPage userId={userId} online={online} />,
    history: <HistoryPage userId={userId} />,
    settings: (
      <SettingsPage
        online={online}
        supabaseHealth={supabaseHealth}
        busy={busy}
        authErrorMessage={authErrorMessage}
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
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onSignOut: () => void
}

export function AuthenticatedAppShell({
  userId,
  supabaseHealth,
  busy,
  authErrorMessage,
  onSignOut,
}: AuthenticatedAppShellProps) {
  const router = useAppRouter()
  const online = useNetworkStatus()
  const queryClient = useQueryClient()

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
    />
  )
}
