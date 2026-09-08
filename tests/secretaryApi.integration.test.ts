import { hasLocalSupabase } from './localIntegrationGuard'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../src/types/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const hasLocalAuth = hasLocalSupabase(url, publishableKey)

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

    // WP010: governed capture -> read -> correction -> capture replay.
    const chatId = crypto.randomUUID()
    const interpretation = { kind: 'task', confidence: 0.2, needs_review: false,
      payload: { protocol: 'taskring.chat.v0.1', title: 'Synthetic report', summary: 'Review a synthetic report.', assumptions: [], questions: [] } }
    const chatRequest = { operation: 'capture_chat_input', idempotency_key: chatId,
      raw_input: '  Synthetic report review.  ', source: { type: 'chat' }, interpretation }
    expect((await invokeSecretary(tokenA, chatRequest)).status).toBe(201)
    const get = { operation: 'get_inbox_item', inbox_item_id: chatId }
    const captured = (await (await invokeSecretary(tokenA, get)).json()).result.item
    expect(captured.raw_input).toBe(chatRequest.raw_input)
    expect(captured.needs_review).toBe(true)
    expect(captured).not.toHaveProperty('user_id')
    expect((await invokeSecretary(tokenB, get)).status).toBe(404)
    const expected = { interpreted_kind: captured.interpreted_kind, interpreted_payload: captured.interpreted_payload,
      confidence: captured.confidence, needs_review: captured.needs_review }
    const review = { operation: 'review_inbox_item', inbox_item_id: chatId, expected,
      interpretation: { ...interpretation, confidence: 1, payload: { ...interpretation.payload, title: 'Corrected synthetic report' } } }
    expect((await invokeSecretary(tokenB, review)).status).toBe(409)
    const correction = await invokeSecretary(tokenA, review)
    expect(correction.status).toBe(200)
    expect((await correction.json()).result.item.needs_review).toBe(false)
    expect((await invokeSecretary(tokenA, review)).status).toBe(409)
    expect((await invokeSecretary(tokenA, chatRequest)).status).toBe(200)
    const afterCorrection = (await (await invokeSecretary(tokenA, get)).json()).result.item
    expect(afterCorrection.interpreted_payload.title).toBe('Corrected synthetic report')
    expect(afterCorrection.raw_input).toBe(chatRequest.raw_input)
    const ownList = (await (await invokeSecretary(tokenA, { operation: 'list_inbox_items' })).json()).result.items
    expect(ownList.some((item: { id: string }) => item.id === chatId)).toBe(true)
    const otherList = (await (await invokeSecretary(tokenB, { operation: 'list_inbox_items' })).json()).result.items
    expect(otherList).toEqual([])

    // WP011: real caller context -> validate -> publish -> stale retry and isolation.
    const taskId = crypto.randomUUID()
    expect((await userAClient.from('tasks').insert({ id: taskId, user_id: userAId,
      title: 'Synthetic planning task', status: 'active', task_kind: 'normal',
      execution_context: 'any', created_by: 'user' })).error).toBeNull()
    const contextRequest = { operation: 'get_planning_context', plan_date: '2026-09-08' }
    const planningResponse = await invokeSecretary(tokenA, contextRequest)
    expect(planningResponse.status).toBe(200)
    const planning = (await planningResponse.json()).result
    expect(planning.context.tasks.some((t: {id:string}) => t.id === taskId)).toBe(true)
    expect(planning.context.tasks[0]).not.toHaveProperty('user_id')
    const otherPlanning = (await (await invokeSecretary(tokenB, contextRequest)).json()).result
    expect(otherPlanning.context.tasks).toEqual([])
    const proposal = { plan_date: '2026-09-08', context_token: planning.context_token,
      base_plan_id: null, capacity_minutes: 120, buffer_percent: 20, buffer_reason: null,
      brief: 'Synthetic deliberate selection within capacity', items: [{ task_id: taskId,
        bucket: 'must', start_minute: 1140, planned_minutes: 60, reason: 'Synthetic priority',
        interruptible: false, low_risk: true }] }
    expect((await invokeSecretary(tokenA, { operation: 'validate_plan_proposal', proposal })).status).toBe(200)
    expect((await invokeSecretary(tokenB, { operation: 'publish_plan_proposal', proposal: { ...proposal, context_token: otherPlanning.context_token } })).status).toBe(422)
    const published = await invokeSecretary(tokenA, { operation: 'publish_plan_proposal', proposal })
    expect(published.status).toBe(201)
    const publication = (await published.json()).result.publication[0]
    expect(publication.revision).toBe(1)
    expect((await invokeSecretary(tokenA, { operation: 'publish_plan_proposal', proposal })).status).toBe(409)
    const planRead = await userAClient.from('daily_plans').select('capacity_breakdown').eq('id', publication.plan_id).single()
    expect(planRead.data?.capacity_breakdown).toMatchObject({ context_token: planning.context_token, buffer_percent: 20 })

  })
})
