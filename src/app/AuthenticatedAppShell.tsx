import type { SupabaseHealth } from '../lib/supabaseHealth'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { NetworkStatus, useNetworkStatus } from '../components/NetworkStatus'
import { HistoryPage } from '../features/history/HistoryPage'
import { InboxPage } from '../features/inbox/InboxPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { TodayPage } from '../features/today/TodayPage'
import { resolveAppRoute, useAppRouter, type AppRoutePath } from './router'

interface AppShellViewProps {
  pathname: string
  online: boolean
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onNavigate: (path: AppRoutePath) => void
  onSignOut: () => void
}

export function AuthenticatedAppShellView({
  pathname,
  online,
  supabaseHealth,
  busy,
  authErrorMessage,
  onNavigate,
  onSignOut,
}: AppShellViewProps) {
  const route = resolveAppRoute(pathname)

  const page = {
    today: <TodayPage online={online} supabaseHealth={supabaseHealth} />,
    inbox: <InboxPage />,
    tasks: <TasksPage />,
    history: <HistoryPage />,
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
  supabaseHealth: SupabaseHealth
  busy: boolean
  authErrorMessage: string | null
  onSignOut: () => void
}

export function AuthenticatedAppShell({
  supabaseHealth,
  busy,
  authErrorMessage,
  onSignOut,
}: AuthenticatedAppShellProps) {
  const router = useAppRouter()
  const online = useNetworkStatus()

  return (
    <AuthenticatedAppShellView
      pathname={router.path}
      online={online}
      supabaseHealth={supabaseHealth}
      busy={busy}
      authErrorMessage={authErrorMessage}
      onNavigate={router.navigate}
      onSignOut={onSignOut}
    />
  )
}
