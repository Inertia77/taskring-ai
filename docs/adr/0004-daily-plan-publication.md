# ADR 0004: Atomic Daily Plan Publication

- Status: Accepted for WP006 v0.1
- Scope: Manual Daily Plan publication only

## Context

TaskRing distinguishes Task definitions from the plan selected for a day and from later execution facts. Editing a published Daily Plan in place would destroy plan history. Publishing a replacement through several browser requests would also allow partial failure between superseding the old plan and creating the replacement.

Concurrent publishers create another risk: a client may edit revision 2 while another process publishes revision 3, then unknowingly overwrite the newer plan.

## Decision

Daily Plan publication uses one Postgres RPC, `public.publish_daily_plan_v01`.

The function is `SECURITY INVOKER`, has an empty `search_path`, derives ownership from `auth.uid()`, and is executable only by `authenticated`. It does not accept client-controlled `user_id`, revision, plan status, item state, or provenance.

The publication request supplies the planning date, the `base_plan_id` observed by the client, plan items, and optional plan metadata. A transaction-level advisory lock serializes publications for a user/date before the active plan is locked and checked. This also closes the race where two clients both believe there is no active row yet.

If the database's current active plan differs from `base_plan_id`, publication fails as stale. If any item in the current active plan is no longer `planned`, publication fails because execution-aware replanning is outside WP006.

Before superseding anything, the RPC validates item shape, official bucket values, non-negative integer positions/minutes, duplicate Task IDs, duplicate positions within a bucket, and Task ownership. Existing RLS and composite ownership foreign keys remain authoritative.

A successful publication creates revision 1 for the first plan, then monotonically creates revision 2, 3, and so on. The previous active plan becomes `superseded`; its rows and Plan Items are retained unchanged. New items always start as `planned`, with no carryover link in the manual v0.1 flow. Manual publication writes `created_by = 'user'`.

When the manual UI does not edit `capacity_minutes`, `capacity_breakdown`, or `brief`, a replacement revision inherits those values from the active plan. First manual publication uses null capacity, `{}` breakdown, and null brief unless explicitly supplied.

## Why a database RPC

Supabase browser queries are individual HTTP requests and cannot be grouped by `supabase-js` into one client-controlled database transaction. A database function keeps validation, supersession, replacement creation, and item creation inside one transaction so any raised exception rolls everything back.

## Why SECURITY INVOKER

The operation does not need to bypass RLS. Running with caller privileges keeps the existing ownership policies and foreign keys active rather than creating a privileged permission shortcut. `SECURITY DEFINER` is intentionally rejected for this boundary.

Postgres function execution privileges are explicit: `PUBLIC`, `anon`, and `service_role` are revoked, while `authenticated` alone receives `EXECUTE`.

## No Task Events in WP006

Publishing a plan describes intent, not execution. The RPC therefore writes no `task_events`. Completion, partial progress, defer, blocked, and feedback semantics belong to the future execution protocol.

## No offline publication in WP006

An offline queue would introduce persistence, retry, idempotency, and conflict-resolution semantics that belong to the future offline architecture. WP006 therefore rejects offline publication honestly instead of presenting an unsynchronized local draft as saved.

## Consequences

- Plan history remains immutable by revision.
- Exactly one active plan per user/date continues to be enforced by the existing partial unique index.
- Stale clients fail rather than silently replacing newer work.
- A plan that has entered execution cannot be reset to all-planned by this simple builder.
- Future AI planning can reuse the publication contract only after provenance and planner authorization are designed; WP006 does not imply that browser clients may spoof `created_by = 'ai'`.
