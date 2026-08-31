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

async function invokeSecretary(accessToken: string | null, body: unknown) {
  if (!url || !publishableKey) throw new Error('Local Supabase integration env is missing')
  const headers: Record<string, string> = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  return fetch(`${url}/functions/v1/secretary-api`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const captureRequest = (idempotencyKey: string, rawInput = 'Capture this private task idea.') => ({
  operation: 'capture_inbox_item',
  idempotency_key: idempotencyKey,
  raw_input: rawInput,
  source: { type: 'chat', external_id: 'privacy-safe-test-message' },
  interpretation: {
    kind: 'task',
    payload: { title: 'Private test task' },
    confidence: 0.75,
    needs_review: true,
  },
})

describe.skipIf(!hasLocalAuth)('real local Secretary API -> Auth -> RLS -> inbox', () => {
  it('enforces authentication, ownership, validation, and idempotency', async () => {
    const userAClient = localClient()
    const userBClient = localClient()
    const suffix = crypto.randomUUID()
    const password = `LocalOnly!${crypto.randomUUID()}Aa1`

    const { data: signUpA, error: signUpAError } = await userAClient.auth.signUp({
      email: `wp009-a-${suffix}@example.test`,
      password,
    })
    const { data: signUpB, error: signUpBError } = await userBClient.auth.signUp({
      email: `wp009-b-${suffix}@example.test`,
      password,
    })
    expect(signUpAError).toBeNull()
    expect(signUpBError).toBeNull()
    expect(signUpA.session).not.toBeNull()
    expect(signUpB.session).not.toBeNull()

    const tokenA = signUpA.session!.access_token
    const tokenB = signUpB.session!.access_token
    const userAId = signUpA.user!.id
    const captureId = crypto.randomUUID()
    const request = captureRequest(captureId)

    const unauthenticated = await invokeSecretary(null, request)
    expect(unauthenticated.status).toBe(401)

    const firstCapture = await invokeSecretary(tokenA, request)
    expect(firstCapture.status).toBe(201)
    expect(await firstCapture.json()).toEqual({
      ok: true,
      result: { inbox_item_id: captureId, created: true },
    })

    const { data: stored, error: storedError } = await userAClient
      .from('inbox_items')
      .select('id,user_id,raw_input,source_type,source_external_id,interpreted_kind,interpreted_payload,confidence,needs_review,disposition')
      .eq('id', captureId)
      .single()
    expect(storedError).toBeNull()
    expect(stored).toMatchObject({
      id: captureId,
      user_id: userAId,
      raw_input: request.raw_input,
      source_type: 'chat',
      source_external_id: 'privacy-safe-test-message',
      interpreted_kind: 'task',
      interpreted_payload: { title: 'Private test task' },
      confidence: 0.75,
      needs_review: true,
      disposition: 'pending',
    })

    const replay = await invokeSecretary(tokenA, request)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({
      ok: true,
      result: { inbox_item_id: captureId, created: false },
    })

    const replayWithDifferentInterpretation = await invokeSecretary(tokenA, {
      ...request,
      interpretation: {
        kind: 'reference',
        payload: { title: 'Changed retry interpretation' },
        confidence: 0.1,
        needs_review: false,
      },
    })
    expect(replayWithDifferentInterpretation.status).toBe(200)
    expect(await replayWithDifferentInterpretation.json()).toEqual({
      ok: true,
      result: { inbox_item_id: captureId, created: false },
    })

    const { data: afterReplay, error: afterReplayError } = await userAClient
      .from('inbox_items')
      .select('interpreted_kind,interpreted_payload,confidence,needs_review')
      .eq('id', captureId)
      .single()
    expect(afterReplayError).toBeNull()
    expect(afterReplay).toEqual({
      interpreted_kind: 'task',
      interpreted_payload: { title: 'Private test task' },
      confidence: 0.75,
      needs_review: true,
    })

    const conflict = await invokeSecretary(tokenA, captureRequest(captureId, 'Different raw capture.'))
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({
      ok: false,
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key is already associated with another capture.',
      },
    })

    const crossUserCollision = await invokeSecretary(tokenB, request)
    expect(crossUserCollision.status).toBe(409)
    const crossUserBody = await crossUserCollision.json()
    expect(crossUserBody).toEqual({
      ok: false,
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key is already associated with another capture.',
      },
    })
    expect(JSON.stringify(crossUserBody)).not.toContain(request.raw_input)

    const { data: userBView, error: userBViewError } = await userBClient.from('inbox_items').select('id').eq('id', captureId)
    expect(userBViewError).toBeNull()
    expect(userBView).toEqual([])

    const spoofId = crypto.randomUUID()
    const spoofedOwnership = await invokeSecretary(tokenA, {
      ...captureRequest(spoofId),
      user_id: signUpB.user!.id,
    })
    expect(spoofedOwnership.status).toBe(400)

    const { data: spoofedRow, error: spoofedRowError } = await userAClient.from('inbox_items').select('id').eq('id', spoofId)
    expect(spoofedRowError).toBeNull()
    expect(spoofedRow).toEqual([])
  })
})
