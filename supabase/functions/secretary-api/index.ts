import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { parseSecretaryRequest } from './contract.ts'
import { parseChatOperation } from './chat-contract.ts'
import { parsePlanningRequest } from './planning-contract.ts'
import { handlePlanning } from './planning-service.ts'
import { parseReplanningRequest, parseExecutionRequest } from './replanning-contract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  })
}

function getPublishableKey() {
  const namedKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>
      if (typeof parsed.default === 'string' && parsed.default.length > 0) return parsed.default
    } catch {
      return null
    }
  }

  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY')
  return legacyKey && legacyKey.length > 0 ? legacyKey : null
}

function isBearerHeader(value: string | null): value is string {
  return Boolean(value && /^Bearer\s+\S+$/i.test(value))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' },
    })
  }

  const authorization = req.headers.get('Authorization')
  if (!isBearerHeader(authorization)) {
    return jsonResponse(401, {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = getPublishableKey()
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse(500, {
      ok: false,
      error: { code: 'SERVER_CONFIGURATION', message: 'Secretary API is unavailable.' },
    })
  }

  const contentLength = Number(req.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    return jsonResponse(413, {
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    })
  }

  const rawBody = await req.text()
  if (rawBody.length > 65_536) {
    return jsonResponse(413, {
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    })
  }

  let requestBody: unknown
  try {
    requestBody = JSON.parse(rawBody)
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    })
  }

  const planning = parsePlanningRequest(requestBody) ?? parseReplanningRequest(requestBody)
  const execution = parseExecutionRequest(requestBody)
  const chat = parseChatOperation(requestBody)
  const parsed = parseSecretaryRequest(chat.ok && chat.value.operation === 'capture_chat_input'
    ? { ...chat.value, operation: 'capture_inbox_item' } : requestBody)
  if (!parsed.ok && !chat.ok && !planning && !execution) {
    return jsonResponse(400, {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: parsed.message },
    })
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const token = authorization.replace(/^Bearer\s+/i, '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return jsonResponse(401, {
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    })
  }

  if (execution) {
    const { operation, ...fields } = execution
    const args = Object.fromEntries(Object.entries(fields).map(([key,value])=>['p_'+key,value]))
    const { data, error } = await supabase.rpc(operation === 'record_task_action' ? 'record_task_action_v01' : 'add_plan_item_feedback_v01', args)
    return error ? jsonResponse(error.code === 'P0001' ? 409 : 500, { ok: false, error: { code: 'EXECUTION_CONFLICT', message: 'Refresh execution state before retrying.' } })
      : jsonResponse(200, { ok: true, result: { receipt: data } })
  }
  if (planning) {
    const response = await handlePlanning(supabase, planning)
    return jsonResponse(response.status, response.body)
  }

  if (chat.ok && chat.value.operation !== 'capture_chat_input') {
    const command = chat.value
    const columns = 'id,raw_input,source_type,source_external_id,interpreted_kind,interpreted_payload,confidence,needs_review,disposition,created_at'
    if (command.operation === 'list_inbox_items') {
      const { data, error } = await supabase.from('inbox_items').select(columns)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(command.offset, command.offset + 49)
      return error ? jsonResponse(500, { ok: false, error: { code: 'DATABASE_ERROR', message: 'Inbox read failed.' } })
        : jsonResponse(200, { ok: true, result: { items: data, next_offset: data.length === 50 && command.offset < 10000 ? command.offset + 50 : null } })
    }
    if (command.operation === 'get_inbox_item') {
      const { data, error } = await supabase.from('inbox_items').select(columns).eq('id', command.inbox_item_id).maybeSingle()
      if (error) return jsonResponse(500, { ok: false, error: { code: 'DATABASE_ERROR', message: 'Inbox read failed.' } })
      return data ? jsonResponse(200, { ok: true, result: { item: data } })
        : jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Inbox item unavailable.' } })
    }
    const e = command.expected
    const i = command.interpretation
    let update = supabase.from('inbox_items').update({ interpreted_kind: i.kind,
      interpreted_payload: i.payload, confidence: i.confidence, needs_review: i.needs_review })
      .eq('id', command.inbox_item_id).eq('disposition', 'pending')
      .eq('interpreted_payload', JSON.stringify(e.interpreted_payload)).eq('needs_review', e.needs_review)
    update = e.interpreted_kind === null ? update.is('interpreted_kind', null) : update.eq('interpreted_kind', e.interpreted_kind)
    update = e.confidence === null ? update.is('confidence', null) : update.eq('confidence', e.confidence)
    const { data, error } = await update.select(columns).maybeSingle()
    if (error) return jsonResponse(500, { ok: false, error: { code: 'DATABASE_ERROR', message: 'Inbox review failed.' } })
    return data ? jsonResponse(200, { ok: true, result: { item: data } })
      : jsonResponse(409, { ok: false, error: { code: 'REVIEW_CONFLICT', message: 'Reload this item before reviewing.' } })
  }
  if (!parsed.ok) return jsonResponse(400, { ok: false, error: { code: 'INVALID_REQUEST', message: parsed.message } })
  const capture = parsed.value
  const row = {
    id: capture.idempotencyKey,
    user_id: user.id,
    raw_input: capture.rawInput,
    source_type: capture.sourceType,
    source_external_id: capture.sourceExternalId,
    interpreted_kind: capture.interpretedKind,
    interpreted_payload: capture.interpretedPayload,
    confidence: capture.confidence,
    needs_review: capture.needsReview,
    disposition: 'pending',
  }

  const { data: inserted, error: insertError } = await supabase
    .from('inbox_items')
    .insert(row)
    .select('id')
    .single()

  if (!insertError && inserted) {
    return jsonResponse(201, {
      ok: true,
      result: { inbox_item_id: inserted.id, created: true },
    })
  }

  if (insertError?.code !== '23505') {
    return jsonResponse(500, {
      ok: false,
      error: { code: 'DATABASE_ERROR', message: 'Inbox capture failed.' },
    })
  }

  const { data: existing, error: existingError } = await supabase
    .from('inbox_items')
    .select('id,raw_input,source_type,source_external_id')
    .eq('id', capture.idempotencyKey)
    .maybeSingle()

  if (existingError) {
    return jsonResponse(500, {
      ok: false,
      error: { code: 'DATABASE_ERROR', message: 'Inbox capture failed.' },
    })
  }

  if (
    existing &&
    existing.raw_input === capture.rawInput &&
    existing.source_type === capture.sourceType &&
    existing.source_external_id === capture.sourceExternalId
  ) {
    return jsonResponse(200, {
      ok: true,
      result: { inbox_item_id: existing.id, created: false },
    })
  }

  return jsonResponse(409, {
    ok: false,
    error: {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'The idempotency key is already associated with another capture.',
    },
  })
})
