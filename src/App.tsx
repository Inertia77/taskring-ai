import { useState } from 'react'
import { AuthenticatedAppShell } from './app/AuthenticatedAppShell'
import { ReleaseCheck } from './features/settings/ReleaseCheck'
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
  const [releaseCheckClosed, setReleaseCheckClosed] = useState(false)
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

  if (import.meta.env.VITE_RELEASE_CHECK === 'wp010-20260908' && !releaseCheckClosed) {
    return <ReleaseCheck key={auth.session.user.id} userId={auth.session.user.id} onClose={() => setReleaseCheckClosed(true)} />
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
