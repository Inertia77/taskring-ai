import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../src/types/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const hasLocalAuth = Boolean(url && publishableKey)

function localClient() {
  if (!url || !publishableKey) throw new Error('Local Supabase integration env is missing')
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

describe.skipIf(!hasLocalAuth)('real local Auth -> JWT -> Data API -> RLS', () => {
  it('isolates two authenticated users and keeps task events append-only', async () => {
    const userAClient = localClient()
    const userBClient = localClient()
    const anonClient = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`

    const { data: signUpA, error: signUpAError } = await userAClient.auth.signUp({
      email: `wp003-a-${suffix}@example.test`,
      password,
    })
    expect(signUpAError).toBeNull()
    expect(signUpA.session).not.toBeNull()
    expect(signUpA.user).not.toBeNull()

    const { data: signUpB, error: signUpBError } = await userBClient.auth.signUp({
      email: `wp003-b-${suffix}@example.test`,
      password,
    })
    expect(signUpBError).toBeNull()
    expect(signUpB.session).not.toBeNull()
    expect(signUpB.user).not.toBeNull()

    const userAId = signUpA.user!.id
    const taskId = crypto.randomUUID()
    const eventId = crypto.randomUUID()

    const { error: taskInsertError } = await userAClient.from('tasks').insert({
      id: taskId,
      user_id: userAId,
      title: 'Local integration task',
      status: 'active',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
    })
    expect(taskInsertError).toBeNull()

    const { data: ownTask, error: ownReadError } = await userAClient
      .from('tasks')
      .select('id,user_id,title')
      .eq('id', taskId)
      .maybeSingle()
    expect(ownReadError).toBeNull()
    expect(ownTask?.user_id).toBe(userAId)

    const { data: userBView, error: userBReadError } = await userBClient
      .from('tasks')
      .select('id')
      .eq('id', taskId)
    expect(userBReadError).toBeNull()
    expect(userBView).toEqual([])

    const { data: anonView, error: anonReadError } = await anonClient
      .from('tasks')
      .select('id')
      .eq('id', taskId)
    expect(anonView ?? []).toEqual([])
    expect(anonReadError).not.toBeNull()

    const { error: eventInsertError } = await userAClient.from('task_events').insert({
      id: eventId,
      user_id: userAId,
      task_id: taskId,
      event_type: 'started',
      occurred_at: new Date().toISOString(),
      actor: 'user',
    })
    expect(eventInsertError).toBeNull()

    const { error: eventUpdateError } = await userAClient
      .from('task_events')
      .update({ note: 'history must not mutate' })
      .eq('id', eventId)
    expect(eventUpdateError).not.toBeNull()

    const { error: eventDeleteError } = await userAClient
      .from('task_events')
      .delete()
      .eq('id', eventId)
    expect(eventDeleteError).not.toBeNull()

    const { data: eventStillThere, error: eventReadError } = await userAClient
      .from('task_events')
      .select('id,note')
      .eq('id', eventId)
      .single()
    expect(eventReadError).toBeNull()
    expect(eventStillThere.id).toBe(eventId)
    expect(eventStillThere.note).toBeNull()
  })
})
