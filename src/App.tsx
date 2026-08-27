import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { useAuthSession } from './hooks/useAuthSession'
import { checkSupabaseHealth, type SupabaseHealth } from './lib/supabaseHealth'

const projectUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function App() {
  const auth = useAuthSession()
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealth>(
    projectUrl && publishableKey ? 'checking' : 'not-configured',
  )

  useEffect(() => {
    if (!projectUrl || !publishableKey) {
      return
    }

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

  const connectionLabel = {
    checking: 'Checking',
    online: 'Online',
    offline: 'Unavailable',
    'not-configured': 'Not configured',
  }[supabaseHealth]

  if (auth.status === 'loading') {
    return (
      <main className="health-page">
        <section className="health-card" aria-live="polite">
          <p className="eyebrow">Session</p>
          <h1>TaskRing AI Secretary</h1>
          <p className="system-status">Restoring session…</p>
        </section>
      </main>
    )
  }

  if (auth.status === 'signed-out') {
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
    <main className="health-page">
      <section className="health-card" aria-labelledby="product-name">
        <p className="eyebrow">Authenticated</p>
        <h1 id="product-name">TaskRing AI Secretary</h1>
        <p className="system-status">System Online</p>
        {auth.errorMessage ? <p className="auth-message error" role="alert">{auth.errorMessage}</p> : null}
        <div className="connection" aria-live="polite">
          <span>Supabase connection</span>
          <strong>{connectionLabel}</strong>
        </div>
        <button className="sign-out-button" type="button" disabled={auth.busy} onClick={() => void auth.signOut()}>
          Sign Out
        </button>
      </section>
    </main>
  )
}

export default App
