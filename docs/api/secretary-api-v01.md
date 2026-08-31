# Secretary Inbox API v0.1

Status: WP009 implementation contract. Not a Production deployment record.

## Purpose

`secretary-api` is the first governed server-side boundary for capturing human or AI-assisted input into TaskRing's existing `public.inbox_items` domain.

WP009 deliberately exposes one operation only:

- `capture_inbox_item`

The function does not plan, replan, create Tasks, mutate Learning, or call external personal services.

## Security boundary

Requests must carry a valid Supabase user JWT in `Authorization: Bearer <jwt>`.

The Edge Function:

1. relies on the platform JWT gate (enabled by default and required for this function),
2. validates the JWT again with `auth.getUser`,
3. derives `user_id` from the validated user object,
4. creates a database client with the public project key plus the caller's Authorization header, and
5. lets the existing `inbox_items_owner_all` RLS policy remain authoritative.

The request contract does not accept `user_id`. A caller cannot select another owner.

No privileged database credential is required by this implementation, and none is exposed to a browser or AI caller.

## Request

`POST /functions/v1/secretary-api`

```json
{
  "operation": "capture_inbox_item",
  "idempotency_key": "11111111-1111-4111-8111-111111111111",
  "raw_input": "Review the design note tomorrow.",
  "source": {
    "type": "chat",
    "external_id": "provider-message-id"
  },
  "interpretation": {
    "kind": "task",
    "payload": {
      "title": "Review the design note"
    },
    "confidence": 0.82,
    "needs_review": true
  }
}
```

`interpretation` is optional. `source.external_id` is optional.

Supported `source.type` values intentionally match the existing TaskRing source vocabulary:

- `chat`
- `manual`
- `legacy_taskring`
- `inertia_1`
- `inertia_2`
- `inertia_3`
- `inertia_4`
- `notion_ai_daily`
- `gucc`
- `gmail`
- `calendar`
- `microsoft_todo_import`

Accepting a source type does not grant this function permission to contact that system. It is provenance metadata only.

## Raw input vs interpretation

`raw_input` is preserved as supplied after validation; it is not replaced by an AI rewrite.

AI-derived fields are stored separately in the existing columns:

- `interpreted_kind`
- `interpreted_payload`
- `confidence`
- `needs_review`

This preserves the distinction between user evidence and machine interpretation.

## Validation

The server rejects unknown request fields. Important limits are:

- `idempotency_key`: UUID
- `raw_input`: non-empty, maximum 10,000 characters
- body: maximum 65,536 characters
- `source.external_id`: maximum 512 characters
- `interpretation.payload`: JSON object, maximum 32,000 serialized characters
- `confidence`: `0 <= value <= 1`
- `needs_review`: boolean

Unknown ownership fields such as `user_id` are rejected instead of ignored.

## Idempotency

The caller-provided UUID is written as `inbox_items.id`.

This reuses the existing primary key as a durable idempotency key without adding another table or migration.

Behavior:

- first accepted request: `201`, `created: true`
- replay with the same UUID and same capture identity: `200`, `created: false`
- UUID collision with a different capture: `409 IDEMPOTENCY_CONFLICT`

The existing primary key supplies concurrency safety: simultaneous attempts cannot create two rows with the same idempotency UUID.

A collision owned by another user is not readable through RLS. The API returns only the generic conflict contract and does not expose the other row.

## Response contract

Created:

```json
{
  "ok": true,
  "result": {
    "inbox_item_id": "11111111-1111-4111-8111-111111111111",
    "created": true
  }
}
```

Idempotent replay uses the same shape with `created: false`.

Errors use:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "..."
  }
}
```

Defined v0.1 codes include:

- `METHOD_NOT_ALLOWED`
- `UNAUTHENTICATED`
- `SERVER_CONFIGURATION`
- `PAYLOAD_TOO_LARGE`
- `INVALID_JSON`
- `INVALID_REQUEST`
- `IDEMPOTENCY_CONFLICT`
- `DATABASE_ERROR`

Database details and raw user content are not returned in generic server errors.

## Existing database authority

WP009 reuses, rather than replaces:

- `public.inbox_items`
- its foreign key to `auth.users`
- `inbox_items_owner_all`
- existing authenticated table grants
- existing source and interpretation checks

No WP009 schema migration is required for this v0.1 contract.

## Out of scope

WP009 does not implement:

- Task creation or automatic disposition
- daily planning or replanning
- Learning schema writes or Learning integration
- direct Gmail, Calendar, Notion, or GUCC access
- external webhook authentication
- long-lived AI credentials
- privileged-key browser access
- Production deployment before the normal acceptance gate
