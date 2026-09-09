import { AuthenticatedAppShell } from './app/AuthenticatedAppShell'
import { AuthScreen } from './components/AuthScreen'
import { useAuthSession, type AuthSessionState } from './hooks/useAuthSession'
import { useEffectiveConnectivity } from './hooks/useNetworkStatus'
import type { SupabaseHealth } from './lib/supabaseHealth'

export interface AppViewAuth extends AuthSessionState {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export function AppView({ auth, supabaseHealth }: { auth: AppViewAuth; supabaseHealth: SupabaseHealth }) {
  if (auth.status === 'loading') {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-live="polite">
          <p className="eyebrow">Session</p>
          <h1>TaskRing AI Secretary</h1>
          <p className="system-status">Restoring session…</p>
        </section>
      </main>
    )
  }

  if (auth.status === 'signed-out' || !auth.session) {
    return (
      <AuthScreen
        busy={auth.busy}
        errorMessage={auth.errorMessage}
        notice={auth.notice}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
      />
    )
  }

  return (
    <AuthenticatedAppShell
      userId={auth.session.user.id}
      online={supabaseHealth === 'online'}
      supabaseHealth={supabaseHealth}
      busy={auth.busy}
      authErrorMessage={auth.errorMessage}
      onSignOut={() => void auth.signOut()}
    />
  )
}

function App() {
  const connectivity = useEffectiveConnectivity()
  const auth = useAuthSession(connectivity.online)

  return <AppView auth={auth} supabaseHealth={connectivity.supabaseHealth} />
}

export default App
