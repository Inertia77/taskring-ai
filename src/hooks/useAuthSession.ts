import { useCallback, useEffect, useReducer } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  restoreSession,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} from '../lib/authSession'
import { ensureProfile } from '../lib/profileBootstrap'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export type AuthStatus = 'loading' | 'signed-out' | 'authenticated'

export interface AuthSessionState {
  status: AuthStatus
  session: Session | null
  busy: boolean
  errorMessage: string | null
  notice: string | null
}

type AuthAction =
  | { type: 'begin' }
  | { type: 'session'; session: Session | null }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }

export function reduceAuthState(
  state: AuthSessionState,
  action: AuthAction,
): AuthSessionState {
  switch (action.type) {
    case 'begin':
      return { ...state, busy: true, errorMessage: null, notice: null }
    case 'session':
      return {
        status: action.session ? 'authenticated' : 'signed-out',
        session: action.session,
        busy: false,
        errorMessage: null,
        notice: null,
      }
    case 'error':
      return { ...state, busy: false, errorMessage: action.message, notice: null }
    case 'notice':
      return { ...state, busy: false, errorMessage: null, notice: action.message }
  }
}

const configuredInitialState: AuthSessionState = {
  status: 'loading',
  session: null,
  busy: false,
  errorMessage: null,
  notice: null,
}

const unconfiguredInitialState: AuthSessionState = {
  status: 'signed-out',
  session: null,
  busy: false,
  errorMessage: 'Supabase is not configured.',
  notice: null,
}

export function useAuthSession() {
  const [state, dispatch] = useReducer(
    reduceAuthState,
    isSupabaseConfigured ? configuredInitialState : unconfiguredInitialState,
  )

  useEffect(() => {
    if (!supabase) {
      return
    }

    let active = true

    void restoreSession(supabase).then((result) => {
      if (!active) return
      if (result.errorMessage) {
        dispatch({ type: 'error', message: result.errorMessage })
        dispatch({ type: 'session', session: null })
        return
      }
      dispatch({ type: 'session', session: result.session })
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        dispatch({ type: 'session', session })
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || state.status !== 'authenticated' || !state.session) {
      return
    }

    let active = true
    void ensureProfile(supabase, state.session).catch(() => {
      if (active) {
        dispatch({ type: 'error', message: 'Signed in, but profile bootstrap failed.' })
      }
    })

    return () => {
      active = false
    }
  }, [state.session, state.status])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return
    dispatch({ type: 'begin' })
    const result = await signInWithEmail(supabase, email, password)
    if (result.errorMessage) {
      dispatch({ type: 'error', message: result.errorMessage })
      return
    }
    dispatch({ type: 'session', session: result.session })
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return
    dispatch({ type: 'begin' })
    const result = await signUpWithEmail(supabase, email, password)
    if (result.errorMessage) {
      dispatch({ type: 'error', message: result.errorMessage })
      return
    }
    if (result.notice) {
      dispatch({ type: 'session', session: null })
      dispatch({ type: 'notice', message: result.notice })
      return
    }
    dispatch({ type: 'session', session: result.session })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    dispatch({ type: 'begin' })
    const result = await signOutUser(supabase)
    if (result.errorMessage) {
      dispatch({ type: 'error', message: result.errorMessage })
      return
    }
    dispatch({ type: 'session', session: null })
  }, [])

  return { ...state, signIn, signUp, signOut }
}
