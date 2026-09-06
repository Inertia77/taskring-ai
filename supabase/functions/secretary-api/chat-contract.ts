// Shared, dependency-free model boundary. Never accepts identity or credentials.
export const chatProtocol = 'taskring.chat.v0.1' as const
export const reviewThreshold = 0.8
export const kinds = ['goal', 'project', 'task', 'reference', 'non_task', 'unknown'] as const
export type ChatInterpretation = {
  kind: (typeof kinds)[number]
  payload: {
    protocol: typeof chatProtocol
    title: string
    summary: string
    assumptions: string[]
    questions: string[]
  }
  confidence: number
  needs_review: boolean
}
export type InterpretationSnapshot = {
  interpreted_kind: string | null
  interpreted_payload: Record<string, unknown>
  confidence: number | null
  needs_review: boolean
}
export type ChatOperation =
  | { operation: 'capture_chat_input'; idempotency_key: string; raw_input: string;
      source: { type: 'chat'; external_id?: string | null }; interpretation: ChatInterpretation }
  | { operation: 'list_inbox_items'; offset: number }
  | { operation: 'get_inbox_item'; inbox_item_id: string }
  | { operation: 'review_inbox_item'; inbox_item_id: string; expected: InterpretationSnapshot;
      interpretation: ChatInterpretation }
type Result = { ok: true; value: ChatOperation } | { ok: false; message: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 500)
}
export function parseChatInterpretation(value: unknown): ChatInterpretation | null {
  if (!record(value) || !keys(value, ['kind', 'payload', 'confidence', 'needs_review']) ||
      !kinds.includes(value.kind as ChatInterpretation['kind']) ||
      typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1 || typeof value.needs_review !== 'boolean') return null
  const p = value.payload
  if (!record(p) || !keys(p, ['protocol', 'title', 'summary', 'assumptions', 'questions']) ||
      p.protocol !== chatProtocol || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 300 ||
      typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 2000 ||
      !strings(p.assumptions) || !strings(p.questions)) return null
  return {
    kind: value.kind as ChatInterpretation['kind'],
    confidence: value.confidence,
    needs_review: value.needs_review || value.confidence < reviewThreshold || value.kind === 'unknown' ||
      p.questions.length > 0 || p.assumptions.length > 0,
    payload: { protocol: chatProtocol, title: p.title, summary: p.summary,
      assumptions: [...p.assumptions], questions: [...p.questions] },
  }
}
export function parseChatOperation(input: unknown): Result {
  const bad: Result = { ok: false, message: 'Invalid chat protocol request.' }
  if (!record(input)) return bad
  if (input.operation === 'list_inbox_items') {
    if (!keys(input, ['operation', 'offset'])) return bad
    const offset = input.offset ?? 0
    return Number.isInteger(offset) && (offset as number) >= 0 && (offset as number) <= 10000
      ? { ok: true, value: { operation: input.operation, offset: offset as number } } : bad
  }
  if (input.operation === 'get_inbox_item') {
    return keys(input, ['operation', 'inbox_item_id']) && typeof input.inbox_item_id === 'string' && uuid.test(input.inbox_item_id)
      ? { ok: true, value: { operation: input.operation, inbox_item_id: input.inbox_item_id } } : bad
  }
  const interpretation = parseChatInterpretation(input.interpretation)
  if (!interpretation) return bad
  if (input.operation === 'capture_chat_input') {
    if (!keys(input, ['operation', 'idempotency_key', 'raw_input', 'source', 'interpretation']) ||
        typeof input.idempotency_key !== 'string' || !uuid.test(input.idempotency_key) ||
        typeof input.raw_input !== 'string' || !input.raw_input.trim() || input.raw_input.length > 10000 ||
        !record(input.source) || !keys(input.source, ['type', 'external_id']) || input.source.type !== 'chat') return bad
    const externalId = input.source.external_id
    if (externalId !== undefined && externalId !== null && (typeof externalId !== 'string' || externalId.length > 512)) return bad
    return { ok: true, value: { operation: input.operation, idempotency_key: input.idempotency_key,
      raw_input: input.raw_input, source: { type: 'chat', external_id: externalId as string | null | undefined }, interpretation } }
  }
  if (input.operation === 'review_inbox_item') {
    const e = input.expected
    if (!keys(input, ['operation', 'inbox_item_id', 'expected', 'interpretation']) ||
        typeof input.inbox_item_id !== 'string' || !uuid.test(input.inbox_item_id) ||
        !record(e) || !keys(e, ['interpreted_kind', 'interpreted_payload', 'confidence', 'needs_review']) ||
        !(e.interpreted_kind === null || kinds.includes(e.interpreted_kind as ChatInterpretation['kind'])) ||
        !record(e.interpreted_payload) || JSON.stringify(e.interpreted_payload).length > 32000 ||
        !(e.confidence === null || (typeof e.confidence === 'number' && Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 1)) ||
        typeof e.needs_review !== 'boolean') return bad
    return { ok: true, value: { operation: input.operation, inbox_item_id: input.inbox_item_id,
      expected: e as InterpretationSnapshot, interpretation } }
  }
  return bad
}
