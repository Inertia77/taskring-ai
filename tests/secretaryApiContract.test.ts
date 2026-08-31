import { describe, expect, it } from 'vitest'
import { parseSecretaryRequest } from '../supabase/functions/secretary-api/contract'

const validRequest = () => ({
  operation: 'capture_inbox_item',
  idempotency_key: crypto.randomUUID(),
  raw_input: 'Remember to review the design note.',
  source: { type: 'chat', external_id: 'message-1' },
  interpretation: {
    kind: 'task',
    payload: { title: 'Review the design note' },
    confidence: 0.82,
    needs_review: true,
  },
})

describe('Secretary API contract', () => {
  it('preserves raw input and separates interpretation fields', () => {
    const input = validRequest()
    input.raw_input = '  Keep these spaces exactly.  '

    const parsed = parseSecretaryRequest(input)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.rawInput).toBe('  Keep these spaces exactly.  ')
    expect(parsed.value.interpretedKind).toBe('task')
    expect(parsed.value.interpretedPayload).toEqual({ title: 'Review the design note' })
    expect(parsed.value.sourceType).toBe('chat')
    expect(parsed.value.sourceExternalId).toBe('message-1')
  })

  it('rejects caller-supplied ownership fields', () => {
    const parsed = parseSecretaryRequest({ ...validRequest(), user_id: crypto.randomUUID() })
    expect(parsed).toEqual({ ok: false, message: 'Request must contain only supported fields.' })
  })

  it('requires a UUID idempotency key', () => {
    const parsed = parseSecretaryRequest({ ...validRequest(), idempotency_key: 'retry-1' })
    expect(parsed).toEqual({ ok: false, message: 'idempotency_key must be a UUID.' })
  })

  it('rejects invalid confidence and non-object interpretation payloads', () => {
    const badConfidence = validRequest()
    badConfidence.interpretation.confidence = 1.1
    expect(parseSecretaryRequest(badConfidence)).toEqual({
      ok: false,
      message: 'interpretation.confidence must be between 0 and 1.',
    })

    const badPayload = validRequest() as ReturnType<typeof validRequest> & {
      interpretation: ReturnType<typeof validRequest>['interpretation'] & { payload: unknown }
    }
    badPayload.interpretation.payload = []
    expect(parseSecretaryRequest(badPayload)).toEqual({
      ok: false,
      message: 'interpretation.payload must be an object.',
    })
  })

  it('supports capture without AI interpretation', () => {
    const input = validRequest()
    const parsed = parseSecretaryRequest({
      operation: input.operation,
      idempotency_key: input.idempotency_key,
      raw_input: input.raw_input,
      source: { type: 'manual' },
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.interpretedKind).toBeNull()
    expect(parsed.value.interpretedPayload).toEqual({})
    expect(parsed.value.confidence).toBeNull()
    expect(parsed.value.needsReview).toBe(false)
  })
})
