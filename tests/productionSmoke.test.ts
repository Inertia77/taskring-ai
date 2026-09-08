import { describe, expect, it } from 'vitest'
import { runProductionSmoke } from '../src/data/secretary/productionSmoke'

function transport(failCapture = false) {
  let row: Record<string, unknown> | null = null
  const calls: Record<string, unknown>[] = []
  const invoke = async (request: Record<string, unknown>) => {
    calls.push(request)
    if ('user_id' in request) return { status: 400, body: {} }
    if (request.operation === 'capture_chat_input') {
      if (failCapture) return { status: 401, body: {} }
      if (row) return row.raw_input === request.raw_input
        ? { status: 200, body: { ok: true, result: { created: false } } } : { status: 409, body: {} }
      const i = request.interpretation as Record<string, unknown>
      row = { id: request.idempotency_key, raw_input: request.raw_input, source_type: 'chat',
        interpreted_kind: i.kind, interpreted_payload: i.payload, confidence: i.confidence, needs_review: true }
      return { status: 201, body: { ok: true, result: { created: true } } }
    }
    if (request.operation === 'get_inbox_item') return { status: 200, body: { ok: true, result: { item: structuredClone(row) } } }
    if (request.operation === 'review_inbox_item' && row) {
      const expected = request.expected as Record<string, unknown>
      if (Object.keys(expected).some((key) => JSON.stringify(expected[key]) !== JSON.stringify(row![key]))) return { status: 409, body: {} }
      const i = request.interpretation as Record<string, unknown>
      row = { ...row, interpreted_kind: i.kind, interpreted_payload: i.payload, confidence: i.confidence, needs_review: false }
      return { status: 200, body: { ok: true, result: { item: structuredClone(row) } } }
    }
    return { status: 400, body: {} }
  }
  return { invoke, calls }
}

describe('production release check runner', () => {
  it('checks the full synthetic capture/review lifecycle without listing private data', async () => {
    const { invoke, calls } = transport()
    const id = crypto.randomUUID()
    const result = await runProductionSmoke(invoke, id)
    expect(result.status).toBe('passed')
    expect(result.checks).toHaveLength(9)
    expect(result.cross_user).toBe('not_run_requires_second_authenticated_user')
    expect(calls.filter((r) => r.operation === 'get_inbox_item').every((r) => r.inbox_item_id === id)).toBe(true)
    expect(calls.some((r) => r.operation === 'list_inbox_items')).toBe(false)
  })
  it('does not claim success or continue writes after an authentication failure', async () => {
    const { invoke, calls } = transport(true)
    const result = await runProductionSmoke(invoke, crypto.randomUUID())
    expect(result.status).toBe('failed')
    expect(result.failed_check).toBe('authenticated_capture')
    expect(result.checks).toEqual([])
    expect(calls).toHaveLength(1)
  })
})
