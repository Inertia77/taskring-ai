# ADR 0006: Offline action outbox

- Status: Accepted for WP008
- Date: 2026-08-28

## Context

WP007 made Task execution and raw feedback safe server commands through atomic, authenticated, idempotent RPCs. A browser can still lose the user's intent if connectivity disappears before an RPC acknowledgement, or if the RPC commits but its response never reaches the client.

TaskRing also needs Today to remain useful after the app shell is opened offline without caching Supabase private HTTP responses in the service worker.

## Decision

Use Dexie over browser IndexedDB as a durable, user-scoped command outbox and Today snapshot store.

Every WP007 execution/feedback action is written to IndexedDB before network delivery. Enqueue time assigns the WP007 Event or Feedback UUID and, for execution, the action-time `occurred_at`. All retries reuse those values.

The local UI may apply an optimistic execution projection, but it must display `Pending Sync` until server acknowledgement and authoritative reconciliation complete. Server Events and Feedback remain authoritative history.

Use one stable FIFO drain per authenticated user. Commands are sent serially; same-Plan-Item commands can never race. A conflict on a Plan Item blocks its later queued commands.

After each RPC acknowledgement, refetch the authoritative plan projection, replace the local Today snapshot, invalidate relevant query surfaces, then remove the acknowledged outbox command.

Transient transport failures use bounded backoff. Semantic/auth/ownership/idempotency conflicts are retained as `Sync issue` until explicit user discard or a new action after refresh.

Signing out retains local data under the original user ID. A different account cannot read or sync it. Settings exposes an explicit destructive clear flow.

## Why IndexedDB / Dexie

IndexedDB is the browser persistence mechanism suitable for structured, durable local records. Dexie provides a small typed wrapper and predictable transactional/indexed access. `localStorage` is not used as a mutation queue.

IndexedDB is not treated as encrypted secure storage. No auth token, refresh token, privileged key, or server secret is written to the outbox.

## Why reuse WP007 UUIDs

A new sync API or cloud outbox would duplicate the server command boundary. WP007 already guarantees same-UUID retries are idempotent. Persisting those UUIDs before first delivery closes the commit-with-lost-response window without inventing another protocol.

## Why no service-worker private cache

TaskRing's Workbox service worker remains a static shell cache only. Supabase Auth/REST/RPC responses can contain user-private data and have server freshness semantics. Offline private state is therefore an explicit IndexedDB application model, not a transparent HTTP cache.

## Consequences

Positive:

- actions survive reload/crash and temporary loss of connectivity;
- action-time timestamps are preserved;
- retries cannot create duplicate Events when WP007 idempotency holds;
- optimistic UI is visibly distinguished from server truth;
- user/account isolation is explicit;
- no Production database migration is required.

Trade-offs:

- IndexedDB data is device-local and not a cryptographic vault;
- a conflict can require explicit user resolution;
- v0.1 supports only WP007 commands; planning and management mutations remain online-only;
- installed-browser offline E2E remains a future risk-reduction item even though repository/unit/local-Supabase coverage is added here.
