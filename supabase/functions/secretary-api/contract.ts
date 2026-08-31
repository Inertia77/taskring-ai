export const secretaryOperation = 'capture_inbox_item' as const

export const sourceTypes = [
  'chat',
  'manual',
  'legacy_taskring',
  'inertia_1',
  'inertia_2',
  'inertia_3',
  'inertia_4',
  'notion_ai_daily',
  'gucc',
  'gmail',
  'calendar',
  'microsoft_todo_import',
] as const

export const interpretedKinds = ['goal', 'project', 'task', 'reference', 'non_task', 'unknown'] as const

export type SourceType = (typeof sourceTypes)[number]
export type InterpretedKind = (typeof interpretedKinds)[number]

export type CaptureInboxItem = {
  operation: typeof secretaryOperation
  idempotencyKey: string
  rawInput: string
  sourceType: SourceType
  sourceExternalId: string | null
  interpretedKind: InterpretedKind | null
  interpretedPayload: Record<string, unknown>
  confidence: number | null
  needsReview: boolean
}

type ParseResult =
  | { ok: true; value: CaptureInboxItem }
  | { ok: false; message: string }

const topLevelKeys = new Set(['operation', 'idempotency_key', 'raw_input', 'source', 'interpretation'])
const sourceKeys = new Set(['type', 'external_id'])
const interpretationKeys = new Set(['kind', 'payload', 'confidence', 'needs_review'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isSourceType(value: unknown): value is SourceType {
  return typeof value === 'string' && (sourceTypes as readonly string[]).includes(value)
}

function isInterpretedKind(value: unknown): value is InterpretedKind {
  return typeof value === 'string' && (interpretedKinds as readonly string[]).includes(value)
}

export function parseSecretaryRequest(input: unknown): ParseResult {
  if (!isRecord(input) || !hasOnlyKeys(input, topLevelKeys)) {
    return { ok: false, message: 'Request must contain only supported fields.' }
  }

  if (input.operation !== secretaryOperation) {
    return { ok: false, message: 'Unsupported operation.' }
  }

  if (typeof input.idempotency_key !== 'string' || !uuidPattern.test(input.idempotency_key)) {
    return { ok: false, message: 'idempotency_key must be a UUID.' }
  }

  if (typeof input.raw_input !== 'string' || input.raw_input.trim().length === 0) {
    return { ok: false, message: 'raw_input is required.' }
  }
  if (input.raw_input.length > 10_000) {
    return { ok: false, message: 'raw_input exceeds the maximum length.' }
  }

  if (!isRecord(input.source) || !hasOnlyKeys(input.source, sourceKeys) || !isSourceType(input.source.type)) {
    return { ok: false, message: 'source.type is invalid.' }
  }

  let sourceExternalId: string | null = null
  if (input.source.external_id !== undefined && input.source.external_id !== null) {
    if (typeof input.source.external_id !== 'string') {
      return { ok: false, message: 'source.external_id must be a string or null.' }
    }
    const normalized = input.source.external_id.trim()
    if (normalized.length > 512) {
      return { ok: false, message: 'source.external_id exceeds the maximum length.' }
    }
    sourceExternalId = normalized.length === 0 ? null : normalized
  }

  let interpretedKind: InterpretedKind | null = null
  let interpretedPayload: Record<string, unknown> = {}
  let confidence: number | null = null
  let needsReview = false

  if (input.interpretation !== undefined && input.interpretation !== null) {
    if (!isRecord(input.interpretation) || !hasOnlyKeys(input.interpretation, interpretationKeys)) {
      return { ok: false, message: 'interpretation contains unsupported fields.' }
    }

    if (input.interpretation.kind !== undefined && input.interpretation.kind !== null) {
      if (!isInterpretedKind(input.interpretation.kind)) {
        return { ok: false, message: 'interpretation.kind is invalid.' }
      }
      interpretedKind = input.interpretation.kind
    }

    if (input.interpretation.payload !== undefined) {
      if (!isRecord(input.interpretation.payload)) {
        return { ok: false, message: 'interpretation.payload must be an object.' }
      }
      const serializedPayload = JSON.stringify(input.interpretation.payload)
      if (serializedPayload.length > 32_000) {
        return { ok: false, message: 'interpretation.payload exceeds the maximum size.' }
      }
      interpretedPayload = input.interpretation.payload
    }

    if (input.interpretation.confidence !== undefined && input.interpretation.confidence !== null) {
      if (
        typeof input.interpretation.confidence !== 'number' ||
        !Number.isFinite(input.interpretation.confidence) ||
        input.interpretation.confidence < 0 ||
        input.interpretation.confidence > 1
      ) {
        return { ok: false, message: 'interpretation.confidence must be between 0 and 1.' }
      }
      confidence = input.interpretation.confidence
    }

    if (input.interpretation.needs_review !== undefined) {
      if (typeof input.interpretation.needs_review !== 'boolean') {
        return { ok: false, message: 'interpretation.needs_review must be boolean.' }
      }
      needsReview = input.interpretation.needs_review
    }
  }

  return {
    ok: true,
    value: {
      operation: secretaryOperation,
      idempotencyKey: input.idempotency_key,
      rawInput: input.raw_input,
      sourceType: input.source.type,
      sourceExternalId,
      interpretedKind,
      interpretedPayload,
      confidence,
      needsReview,
    },
  }
}
