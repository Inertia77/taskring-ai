import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  restoreSession,
  safeAuthError,
  signInWithEmail,
  signOutUser,
} from '../src/lib/authSession'
import { reduceAuthState, type AuthSessionState } from '../src/hooks/useAuthSession'
import type { Database } from '../src/types/database.types'

const fakeSession = { user: { id: 'synthetic-user' } } as Session

function clientWithAuth(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient<Database>
}

const signedOutState: AuthSessionState = {
  status: 'signed-out',
  session: null,
  busy: false,
  errorMessage: null,
  notice: null,
}

describe('minimal auth session boundary', () => {
  it('restores no session as signed out', async () => {
    const client = clientWithAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    })
    const restored = await restoreSession(client)
    const state = reduceAuthState(signedOutState, { type: 'session', session: restored.session })
    expect(state.status).toBe('signed-out')
  })

  it('restores an existing session as authenticated', async () => {
    const client = clientWithAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
    })
    const restored = await restoreSession(client)
    const state = reduceAuthState(signedOutState, { type: 'session', session: restored.session })
    expect(state.status).toBe('authenticated')
    expect(state.session).toBe(fakeSession)
  })

  it('shows a safe sign-in error without reflecting sensitive details', async () => {
    const client = clientWithAuth({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error('backend detail password=hunter2'),
      }),
    })
    const result = await signInWithEmail(client, 'synthetic@example.invalid', 'hunter2')
    expect(result.errorMessage).toBe('Authentication failed. Please try again.')
    expect(result.errorMessage).not.toContain('hunter2')
  })

  it('maps invalid credentials to a concise safe message', () => {
    expect(safeAuthError(new Error('Invalid login credentials'))).toBe('Invalid email or password.')
  })

  it('sign out clears authenticated state', async () => {
    const client = clientWithAuth({ signOut: vi.fn().mockResolvedValue({ error: null }) })
    const result = await signOutUser(client)
    const state = reduceAuthState(
      { ...signedOutState, status: 'authenticated', session: fakeSession },
      { type: 'session', session: result.session },
    )
    expect(state.status).toBe('signed-out')
    expect(state.session).toBeNull()
  })

  it('never logs credentials or session objects during auth helpers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = clientWithAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    })

    await restoreSession(client)
    await signInWithEmail(client, 'synthetic@example.invalid', 'LocalOnlyPassword!1')
    await signOutUser(client)

    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
