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

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

describe.skipIf(!hasLocalAuth)('real local Auth -> JWT -> Data API -> RLS', () => {
  it('supports Task/Project management while preserving ownership and append-only history', async () => {
    const userAClient = localClient()
    const userBClient = localClient()
    const anonClient = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`

    const { data: signUpA, error: signUpAError } = await userAClient.auth.signUp({ email: `wp005-a-${suffix}@example.test`, password })
    const { data: signUpB, error: signUpBError } = await userBClient.auth.signUp({ email: `wp005-b-${suffix}@example.test`, password })
    expect(signUpAError).toBeNull()
    expect(signUpBError).toBeNull()
    expect(signUpA.session).not.toBeNull()
    expect(signUpB.session).not.toBeNull()

    const userAId = signUpA.user!.id
    const userBId = signUpB.user!.id

    const { data: projectA, error: projectAError } = await userAClient
      .from('projects')
      .insert({ user_id: userAId, title: 'User A project', status: 'active', priority_hint: 'high' })
      .select('*')
      .single()
    expect(projectAError).toBeNull()
    expect(projectA?.user_id).toBe(userAId)

    const { data: projectB, error: projectBError } = await userBClient
      .from('projects')
      .insert({ user_id: userBId, title: 'User B project', status: 'active' })
      .select('*')
      .single()
    expect(projectBError).toBeNull()

    const { data: ownProjectRead, error: ownProjectReadError } = await userAClient.from('projects').select('id,title').eq('id', projectA!.id).single()
    expect(ownProjectReadError).toBeNull()
    expect(ownProjectRead?.title).toBe('User A project')

    const projectUpdatedAt = projectA!.updated_at
    await delay(8)
    const { data: updatedProject, error: updatedProjectError } = await userAClient
      .from('projects')
      .update({ notes: 'edited by owner', status: 'waiting' })
      .eq('id', projectA!.id)
      .select('*')
      .single()
    expect(updatedProjectError).toBeNull()
    expect(updatedProject?.notes).toBe('edited by owner')
    expect(new Date(updatedProject!.updated_at).getTime()).toBeGreaterThan(new Date(projectUpdatedAt).getTime())

    const { data: userBProjectView, error: userBProjectReadError } = await userBClient.from('projects').select('id').eq('id', projectA!.id)
    expect(userBProjectReadError).toBeNull()
    expect(userBProjectView).toEqual([])

    const { data: userBProjectMutation, error: userBProjectMutationError } = await userBClient
      .from('projects')
      .update({ title: 'cross-user mutation' })
      .eq('id', projectA!.id)
      .select('id')
    expect(userBProjectMutationError).toBeNull()
    expect(userBProjectMutation).toEqual([])

    const { error: spoofProjectError } = await userAClient.from('projects').insert({ user_id: userBId, title: 'spoofed owner', status: 'active' })
    expect(spoofProjectError).not.toBeNull()

    const { data: taskA, error: taskAError } = await userAClient
      .from('tasks')
      .insert({
        user_id: userAId,
        project_id: projectA!.id,
        title: 'User A task',
        status: 'active',
        task_kind: 'normal',
        execution_context: 'any',
        created_by: 'user',
      })
      .select('*')
      .single()
    expect(taskAError).toBeNull()
    expect(taskA?.project_id).toBe(projectA!.id)

    const { data: ownTaskRead, error: ownTaskReadError } = await userAClient.from('tasks').select('id,title').eq('id', taskA!.id).single()
    expect(ownTaskReadError).toBeNull()
    expect(ownTaskRead?.title).toBe('User A task')

    const taskUpdatedAt = taskA!.updated_at
    await delay(8)
    const { data: editedTask, error: editedTaskError } = await userAClient
      .from('tasks')
      .update({ title: 'User A task edited', status: 'paused', remaining_minutes: 25 })
      .eq('id', taskA!.id)
      .select('*')
      .single()
    expect(editedTaskError).toBeNull()
    expect(editedTask?.status).toBe('paused')
    expect(new Date(editedTask!.updated_at).getTime()).toBeGreaterThan(new Date(taskUpdatedAt).getTime())

    const { data: userBTaskView, error: userBTaskReadError } = await userBClient.from('tasks').select('id').eq('id', taskA!.id)
    expect(userBTaskReadError).toBeNull()
    expect(userBTaskView).toEqual([])

    const { data: userBTaskMutation, error: userBTaskMutationError } = await userBClient
      .from('tasks')
      .update({ title: 'cross-user mutation' })
      .eq('id', taskA!.id)
      .select('id')
    expect(userBTaskMutationError).toBeNull()
    expect(userBTaskMutation).toEqual([])

    const { error: crossOwnerProjectAssignmentError } = await userAClient.from('tasks').insert({
      user_id: userAId,
      project_id: projectB!.id,
      title: 'invalid project ownership',
      status: 'active',
      task_kind: 'normal',
      execution_context: 'any',
      created_by: 'user',
    })
    expect(crossOwnerProjectAssignmentError).not.toBeNull()

    const eventId = crypto.randomUUID()
    const { error: eventInsertError } = await userAClient.from('task_events').insert({
      id: eventId,
      user_id: userAId,
      task_id: taskA!.id,
      event_type: 'started',
      occurred_at: new Date().toISOString(),
      actor: 'user',
    })
    expect(eventInsertError).toBeNull()

    const { error: eventUpdateError } = await userAClient.from('task_events').update({ note: 'history must not mutate' }).eq('id', eventId)
    const { error: eventDeleteError } = await userAClient.from('task_events').delete().eq('id', eventId)
    expect(eventUpdateError).not.toBeNull()
    expect(eventDeleteError).not.toBeNull()

    const { data: cancelledTask, error: cancelTaskError } = await userAClient
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', taskA!.id)
      .select('id,status')
      .single()
    expect(cancelTaskError).toBeNull()
    expect(cancelledTask?.status).toBe('cancelled')

    const { data: cancelledProject, error: cancelProjectError } = await userAClient
      .from('projects')
      .update({ status: 'cancelled' })
      .eq('id', projectA!.id)
      .select('id,status')
      .single()
    expect(cancelProjectError).toBeNull()
    expect(cancelledProject?.status).toBe('cancelled')

    const { data: retainedTask } = await userAClient.from('tasks').select('id,status').eq('id', taskA!.id).single()
    const { data: retainedProject } = await userAClient.from('projects').select('id,status').eq('id', projectA!.id).single()
    expect(retainedTask?.status).toBe('cancelled')
    expect(retainedProject?.status).toBe('cancelled')

    const { data: anonView, error: anonReadError } = await anonClient.from('tasks').select('id').eq('id', taskA!.id)
    expect(anonView ?? []).toEqual([])
    expect(anonReadError).not.toBeNull()
  })
})
