import { useState, type FormEvent } from 'react'

interface AuthScreenProps {
  busy: boolean
  errorMessage: string | null
  notice: string | null
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
}

export function AuthScreen({
  busy,
  errorMessage,
  notice,
  onSignIn,
  onSignUp,
}: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submitSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSignIn(email.trim(), password)
  }

  return (
    <main className="health-page">
      <section className="health-card auth-card" aria-labelledby="product-name">
        <p className="eyebrow">Private Workspace</p>
        <h1 id="product-name">TaskRing AI Secretary</h1>
        <p className="system-status">Sign in</p>

        <form className="auth-form" onSubmit={submitSignIn}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              disabled={busy}
            />
          </label>

          {errorMessage ? <p className="auth-message error" role="alert">{errorMessage}</p> : null}
          {notice ? <p className="auth-message" role="status">{notice}</p> : null}

          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Sign In'}
          </button>

          {import.meta.env.DEV ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void onSignUp(email.trim(), password)}
            >
              Bootstrap / Development Sign Up
            </button>
          ) : null}
        </form>
      </section>
    </main>
  )
}
