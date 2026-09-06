import { describe, expect, it } from 'vitest'
import { chatProtocol, parseChatOperation } from '../supabase/functions/secretary-api/chat-contract'
import { parseSecretaryRequest } from '../supabase/functions/secretary-api/contract'

const request = () => ({ operation: 'capture_chat_input', idempotency_key: crypto.randomUUID(),
  raw_input: '  Consider reviewing the synthetic report.  ', source: { type: 'chat' },
  interpretation: { kind: 'task', confidence: 0.9, needs_review: false,
    payload: { protocol: chatProtocol, title: 'Review report', summary: 'Review the synthetic report.', assumptions: [], questions: [] } } })

describe('governed Chat capture', () => {
  it('preserves evidence and enforces uncertainty review independently of the caller', () => {
    for (const confidence of [0, 0.79, 0.8, 1]) {
      const body = request()
      body.interpretation.confidence = confidence
      const result = parseChatOperation(body)
      expect(result.ok).toBe(true)
      if (!result.ok || result.value.operation !== 'capture_chat_input') throw Error('Expected capture')
      expect(result.value.raw_input).toBe(body.raw_input)
      expect(result.value.interpretation.needs_review).toBe(confidence < 0.8)
    }
    for (const payload of [{ assumptions: ['Assumed tomorrow'], questions: [] }, { assumptions: [], questions: ['Which report?'] }]) {
      const body = request()
      const result = parseChatOperation({ ...body, interpretation: { ...body.interpretation, payload: { ...body.interpretation.payload, ...payload } } })
      expect(result.ok && result.value.operation === 'capture_chat_input' && result.value.interpretation.needs_review).toBe(true)
    }
  })
  it('rejects ownership, credentials, unbounded payloads, arbitrary tools and non-chat sources', () => {
    const body = request()
    for (const invalid of [
      { ...body, user_id: crypto.randomUUID() }, { ...body, token: 'synthetic-value' },
      { ...body, operation: 'execute_sql' }, { ...body, source: { type: 'manual' } },
      { ...body, raw_input: 'x'.repeat(10001) },
      { ...body, interpretation: { ...body.interpretation, confidence: NaN } },
      { ...body, interpretation: { ...body.interpretation, payload: { ...body.interpretation.payload, sql: 'synthetic' } } },
      { operation: 'list_inbox_items', offset: -1 }, { operation: 'list_inbox_items', offset: 10001 },
    ]) expect(parseChatOperation(invalid).ok).toBe(false)
  })
  it('requires an explicit comparison snapshot for corrections', () => {
    const body = request()
    const review = { operation: 'review_inbox_item', inbox_item_id: body.idempotency_key,
      interpretation: body.interpretation, expected: { interpreted_kind: null, interpreted_payload: {}, confidence: null, needs_review: true } }
    expect(parseChatOperation(review).ok).toBe(true)
    expect(parseChatOperation({ ...review, expected: undefined }).ok).toBe(false)
    expect(parseChatOperation({ ...review, raw_input: 'overwrite evidence' }).ok).toBe(false)
  })
  it('also protects low-confidence legacy Chat requests without changing manual capture defaults', () => {
    const body = request()
    const result = parseSecretaryRequest({ ...body, operation: 'capture_inbox_item', interpretation: { ...body.interpretation, confidence: 0.1 } })
    expect(result.ok && result.value.needsReview).toBe(true)
    const manual = parseSecretaryRequest({ operation: 'capture_inbox_item', idempotency_key: body.idempotency_key, raw_input: body.raw_input, source: { type: 'manual' } })
    expect(manual.ok && manual.value.needsReview).toBe(false)
  })
})
