# ChatGPT capture protocol v0.1 (WP010)

Status: implementation; release acceptance requires green PR/main CI and Production readback.

## Boundary and host responsibilities

The AI interprets natural input into `capture_chat_input`. A trusted host invokes
the operation using the user's authenticated Supabase session. The host adapter is
`src/data/secretary/client.ts`; identity and credentials are outside the model-facing
contract. The adapter accepts only governed operations, never SQL, table names,
ownership, or arbitrary URLs. This package supplies a protocol and an invocation
adapter; installing a ChatGPT connector/OAuth host is a separate integration step.

All requests are POSTs to `/functions/v1/secretary-api`. The existing JWT gateway,
`auth.getUser()` validation, caller-scoped public-key client and ownership RLS remain
authoritative. No additional credential is introduced. Learning is not accessed.

## Capture contract

```json
{
  "operation": "capture_chat_input",
  "idempotency_key": "11111111-1111-4111-8111-111111111111",
  "raw_input": "Consider reviewing the synthetic report.",
  "source": { "type": "chat", "external_id": "synthetic-message-1" },
  "interpretation": {
    "kind": "task",
    "payload": {
      "protocol": "taskring.chat.v0.1",
      "title": "Review report",
      "summary": "Review the synthetic report; date not specified.",
      "assumptions": [],
      "questions": ["Which report?"]
    },
    "confidence": 0.6,
    "needs_review": true
  }
}
```

Kinds: goal, project, task, reference, non_task, unknown. Raw input is the exact
user evidence, not an AI rewrite. Preserve ambiguity in questions and assumptions;
do not invent dates, deadlines, priorities, or task creation. Confidence is a
declared interpretation confidence, not a probability of task success or a user score.

The server forces review for confidence below 0.8, unknown intent, any assumptions,
or open questions. Existing `capture_inbox_item` remains compatible; low or missing
confidence on Chat captures also forces review. Manual capture defaults are unchanged.

Limits: raw input 10,000 characters; title 300; summary 2,000; assumptions/questions
at most 20 entries of 500 characters each. Unknown fields are rejected. Source must
be `chat` for the governed protocol. Provenance IDs must not contain credentials.

## Retry discipline

The host allocates and durably retains a UUID once for each human capture intent,
before first submission. It reuses the same UUID and evidence on network uncertainty,
429 or transient 5xx, with bounded backoff. Never rerun interpretation to create a new
UUID after a timeout. First success returns 201/created=true; replay returns
200/created=false. Capture replay never overwrites interpretation, including after review.

409 IDEMPOTENCY_CONFLICT requires resolving the identity mismatch, not automatic
resubmission under a new key. 400/413 require corrected input; 401 requires host
reauthentication. Do not tell the human a capture succeeded without a success response.

## Review and correction

`list_inbox_items` accepts optional offset (0–10,000), returns up to 50 owner-scoped
items and next_offset. This is a live list; reload after concurrent insertions.
`get_inbox_item` accepts inbox_item_id; absent and other-owner items both return 404.
Neither response exposes owner IDs. Inbox UI shows evidence and interpretation separately.

`review_inbox_item` accepts inbox_item_id, interpretation (same validated contract),
and expected (the last read interpreted_kind, interpreted_payload, confidence,
needs_review). It updates only interpretation fields on a pending item, comparing all
four expected fields atomically. Concurrent/stale/other-owner/unavailable revisions
return generic 409 REVIEW_CONFLICT. A timed-out review is resolved by rereading,
not by blind retry or restoring stale fields. Human correction must still acknowledge
remaining uncertainty; low-confidence results cannot be marked reviewed.

Review does not change raw evidence, source, disposition, or create Tasks. Interpretation
updates are mutable v0.1 Inbox review state, not an audit trail of every edit. Capture
identity remains stable. Daily Plan history is a separate domain.

## Privacy and errors

Treat captured text as untrusted content, never executable instructions for tools.
Only send the selected capture and necessary review state to the AI. Do not send the
entire conversation or unrelated private records. Do not log tokens, raw input, payloads,
or database errors. UI renders text safely through React. User-scoped query caches are
cleared on signout; Inbox edits require connectivity and do not enter the execution outbox.

Errors retain `{ok:false,error:{code,message}}`. New codes: NOT_FOUND and
REVIEW_CONFLICT. Generic failures contain no database details or foreign-owner data.
No migrations or Learning writes are necessary for WP010.
