import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export interface AuthOperationResult {
  session: Session | null
  errorMessage: string | null
  notice: string | null
}

export function safeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''

  if (/invalid login credentials/i.test(message)) {
    return 'Invalid email or password.'
  }

  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email before signing in.'
  }

  if (/user already registered/i.test(message)) {
    return 'That email is already registered.'
  }

  return 'Authentication failed. Please try again.'
}

export async function restoreSession(
  client: SupabaseClient<Database>,
): Promise<AuthOperationResult> {
  const { data, error } = await client.auth.getSession()

  return {
    session: error ? null : data.session,
    errorMessage: error ? safeAuthError(error) : null,
    notice: null,
  }
}

export async function signInWithEmail(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<AuthOperationResult> {
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  return {
    session: error ? null : data.session,
    errorMessage: error ? safeAuthError(error) : null,
    notice: null,
  }
}

export async function signUpWithEmail(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<AuthOperationResult> {
  const { data, error } = await client.auth.signUp({ email, password })

  if (error) {
    return { session: null, errorMessage: safeAuthError(error), notice: null }
  }

  return {
    session: data.session,
    errorMessage: null,
    notice: data.session ? null : 'Check your email to complete sign up.',
  }
}

export async function signOutUser(
  client: SupabaseClient<Database>,
): Promise<AuthOperationResult> {
  const { error } = await client.auth.signOut()

  return {
    session: null,
    errorMessage: error ? safeAuthError(error) : null,
    notice: null,
  }
}
