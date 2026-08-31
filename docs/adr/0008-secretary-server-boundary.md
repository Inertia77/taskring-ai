# ADR-0008: Secretary Server Boundary

Status: Proposed by WP009

## Context

TaskRing already has authenticated user-owned `public` state, including `inbox_items`, and ownership RLS based on `auth.uid() = user_id`. The browser currently talks to Supabase with a publishable key and a user session. Before AI Secretary integrations can safely capture input, TaskRing needs a governed server-side boundary that does not introduce a privileged client or weaken the existing ownership model.

## Decision

WP009 introduces a Supabase Edge Function named `secretary-api`.

The v0.1 API supports only `capture_inbox_item`.

Authentication and authorization are intentionally layered:

1. a valid user JWT is required at the Edge Function boundary;
2. the handler resolves the user with Supabase Auth;
3. the handler never accepts caller-selected ownership;
4. database access uses the caller's JWT, so existing RLS remains authoritative;
5. no privileged database credential is used for the capture path.

The canonical record remains `public.inbox_items`; WP009 does not introduce a parallel Inbox table.

The caller supplies a UUID idempotency key. The UUID becomes `inbox_items.id`, making the existing primary key the concurrency-safe duplicate boundary.

Raw user input remains separate from optional AI interpretation fields.

## Consequences

### Positive

- RLS remains the final authorization boundary.
- The server cannot accidentally assign an Inbox item to a caller-supplied user ID.
- Duplicate retries cannot create duplicate rows for one idempotency UUID.
- The API can be called by the browser or another user-authorized client without exposing a privileged project key.
- No database migration is required for the initial contract.

### Trade-offs

- A global UUID collision across users produces a generic idempotency conflict. The colliding row is not readable through RLS.
- V0.1 does not translate Inbox items into Tasks. Interpretation remains advisory data until a later accepted workflow handles disposition.
- Source metadata is recorded in `inbox_items`; WP009 does not create or synchronize `source_links` as a side effect.

## Rejected alternatives

### Privileged server client for all writes

Rejected because it would bypass the RLS boundary and create a larger blast radius. WP009 has no operation that requires bypassing owner RLS.

### Direct browser insert as the Secretary API

Rejected because WP009 specifically establishes a governed server boundary with server-side validation and a stable error/idempotency contract.

### New Inbox schema/table

Rejected because `public.inbox_items` already models the required raw input, source, interpretation, confidence, review, and disposition fields.

### Learning integration in WP009

Rejected as scope expansion. Learning remains a separate first-class domain and is not required to capture an Inbox item.

## Follow-up

Later WPs may add explicitly authorized operations for interpretation/disposition, task creation, or other Secretary behavior. Those operations must preserve authenticated user scope and must not silently turn this Edge Function into an RLS-bypassing general backend.
