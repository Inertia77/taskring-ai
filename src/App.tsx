import { useEffect, useState } from 'react'
import { checkSupabaseHealth, type SupabaseHealth } from './lib/supabaseHealth'

const projectUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function App() {
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
        if (active) {
          setSupabaseHealth(online ? 'online' : 'offline')
        }
      })
      .catch(() => {
        if (active) {
          setSupabaseHealth('offline')
        }
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

  return (
    <main className="health-page">
      <section className="health-card" aria-labelledby="product-name">
        <p className="eyebrow">Greenfield Foundation</p>
        <h1 id="product-name">TaskRing AI Secretary</h1>
        <p className="system-status">System Online</p>
        <div className="connection" aria-live="polite">
          <span>Supabase connection</span>
          <strong>{connectionLabel}</strong>
        </div>
      </section>
    </main>
  )
}

export default App
