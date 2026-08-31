import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { parseSecretaryRequest } from './contract.ts'

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

function jsonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => jsonEquals(value, right[index]))
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(leftRecord[key], rightRecord[key]))
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

  const parsed = parseSecretaryRequest(requestBody)
  if (!parsed.ok) {
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
    .select('id,raw_input,source_type,source_external_id,interpreted_kind,interpreted_payload,confidence,needs_review,disposition')
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
    existing.source_external_id === capture.sourceExternalId &&
    existing.interpreted_kind === capture.interpretedKind &&
    jsonEquals(existing.interpreted_payload, capture.interpretedPayload) &&
    existing.confidence === capture.confidence &&
    existing.needs_review === capture.needsReview &&
    existing.disposition === 'pending'
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
