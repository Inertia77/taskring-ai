import { useEffect, useState } from 'react'
import { AuthenticatedAppShell } from './app/AuthenticatedAppShell'
import { AuthScreen } from './components/AuthScreen'
import { useAuthSession, type AuthSessionState } from './hooks/useAuthSession'
import { checkSupabaseHealth, type SupabaseHealth } from './lib/supabaseHealth'

const projectUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

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
      supabaseHealth={supabaseHealth}
      busy={auth.busy}
      authErrorMessage={auth.errorMessage}
      onSignOut={() => void auth.signOut()}
    />
  )
}

function App() {
  const auth = useAuthSession()
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealth>(
    projectUrl && publishableKey ? 'checking' : 'not-configured',
  )

  useEffect(() => {
    if (!projectUrl || !publishableKey) return

    let active = true
    checkSupabaseHealth(projectUrl, publishableKey)
      .then((online) => {
        if (active) setSupabaseHealth(online ? 'online' : 'offline')
      })
      .catch(() => {
        if (active) setSupabaseHealth('offline')
      })

    return () => {
      active = false
    }
  }, [])

  return <AppView auth={auth} supabaseHealth={supabaseHealth} />
}

export default App
