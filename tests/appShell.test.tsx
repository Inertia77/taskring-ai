import type { Session } from '@supabase/supabase-js'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppView, type AppViewAuth } from '../src/App'
import { AuthenticatedAppShellView } from '../src/app/AuthenticatedAppShell'
import { PRIMARY_ROUTES, resolveAppRoute } from '../src/app/router'

const noopAsync = async () => undefined
const fakeSession = { user: { id: 'synthetic-user' } } as Session

function authState(status: AppViewAuth['status']): AppViewAuth {
  return {
    status,
    session: status === 'authenticated' ? fakeSession : null,
    busy: false,
    errorMessage: null,
    notice: null,
    signIn: noopAsync,
    signUp: noopAsync,
    signOut: noopAsync,
  }
}

function shellMarkup(pathname: string) {
  return renderToStaticMarkup(
    <AuthenticatedAppShellView
      pathname={pathname}
      online
      supabaseHealth="online"
      busy={false}
      authErrorMessage={null}
      onNavigate={() => undefined}
      onSignOut={() => undefined}
    />,
  )
}

describe('mobile application shell', () => {
  it('signed-out state still renders the AuthScreen', () => {
    const markup = renderToStaticMarkup(<AppView auth={authState('signed-out')} supabaseHealth="online" />)
    expect(markup).toContain('Sign in')
    expect(markup).toContain('TaskRing AI Secretary')
    expect(markup).not.toContain('aria-label="Primary"')
  })

  it('authenticated shell exposes the five primary surfaces', () => {
    const markup = shellMarkup('/today')
    expect(markup).toContain('AI Secretary')
    expect(PRIMARY_ROUTES).toHaveLength(5)
    expect((markup.match(/data-primary-nav-item/g) ?? [])).toHaveLength(5)
  })

  it('root redirects to /today', () => {
    expect(resolveAppRoute('/')).toEqual({ key: 'today', path: '/today', redirectTo: '/today' })
  })

  it.each([
    ['/today', '<h1 id="today-title">Today</h1>'],
    ['/inbox', '<h1 id="inbox-title">Inbox</h1>'],
    ['/tasks', '<h1 id="tasks-title">Tasks</h1>'],
    ['/history', '<h1 id="history-title">History</h1>'],
    ['/settings', '<h1 id="settings-title">Settings</h1>'],
  ])('renders route %s', (path, heading) => {
    expect(shellMarkup(path)).toContain(heading)
  })

  it('marks only the active primary route with aria-current', () => {
    const markup = shellMarkup('/history')
    expect((markup.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
    expect(markup).toContain('href="/history" aria-current="page"')
  })

  it('keeps Sign Out reachable in Settings', () => {
    const markup = shellMarkup('/settings')
    expect(markup).toContain('>Sign Out</button>')
  })

  it('unknown authenticated routes resolve safely to Today', () => {
    expect(resolveAppRoute('/does-not-exist')).toEqual({ key: 'today', path: '/today', redirectTo: '/today' })
    expect(shellMarkup('/does-not-exist')).toContain('<h1 id="today-title">Today</h1>')
  })
})
