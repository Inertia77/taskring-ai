# ADR 0005 — Execution Command Boundary

Status: Accepted for WP007

## Context

TaskRing requires immutable execution facts and current projections to remain consistent. Direct browser mutations such as `INSERT task_events`, `UPDATE daily_plan_items.current_state`, or independently setting a Task to done can create half-states that cannot be audited or safely retried.

WP008 will later add offline retries, so the online command contract must already be idempotent.

## Decision

Use explicit PostgreSQL command RPCs:

- `record_task_action_v01` for execution actions.
- `add_plan_item_feedback_v01` for raw user feedback.
- retain and harden `publish_daily_plan_v01` for immutable Daily Plan publication.

Every public command RPC is `SECURITY INVOKER`, pins an empty `search_path`, resolves the owner from `auth.uid()`, explicitly revokes PUBLIC / anon / service-role execute and grants execute only to authenticated users.

Execution targets a `plan_item_id`; Task / Plan / owner identities are derived server-side. The RPC locks the Plan Item and Task, checks an `expected_state` optimistic concurrency precondition, validates the state-machine transition, appends an immutable Event and updates projections in one transaction.

Client-generated Event and Feedback UUIDs are idempotency keys. Repeating the same command ID and payload returns the existing result; conflicting reuse is rejected. Transaction advisory locks serialize retries of the same UUID.

## Transaction-local command context

Retaining `SECURITY INVOKER` means the authenticated role must keep the underlying INSERT / UPDATE privileges required by the command itself. Therefore table grants alone cannot distinguish an approved RPC from arbitrary PostgREST table mutation.

WP007 uses transaction-local custom setting `taskring.command_context`, set only by approved RPCs, plus trigger guards:

- execution context authorizes Task Event insertion and execution projection writes;
- publication context authorizes Daily Plan / Plan Item publication writes;
- feedback context authorizes feedback insertion.

Direct Data API bypass is rejected by the trigger even when the role needs the underlying privilege for an invoker RPC. The guard function itself is also SECURITY INVOKER and not executable directly by browser roles.

Daily Plan and Plan Item direct DELETE grants are removed; feedback direct UPDATE / DELETE grants are removed.

## Event facts and projections

Task Events are append-only facts. Reopen does not delete or rewrite a previous Done / Blocked / Cancelled fact; it appends `reopened` and projects the Plan Item to `started` and Task back to `active`.

A command failing anywhere rolls back both the Event and all projections. No UI optimistic write is treated as authoritative.

## WP006 compatibility

The historical WP006 migration is not modified. The WP007 migration replaces the current publication function definition to establish publication context and to strengthen the execution-start guard with Task Event existence. The original 25 WP006 pgTAP assertions and real publication integration remain regression gates.

## Feedback semantics

Feedback is user-authored evidence, not an AI conclusion. The command derives all ownership / references, fixes source to `frontend`, leaves `ai_interpretation = null`, and gives feedback an idempotent client UUID. WP007 does not calculate calibration or respond with AI advice.

## Offline boundary

No offline mutation queue is added. Offline execution / feedback attempts return an explicit connection requirement and save nothing. Service-worker runtime caching of private responses remains prohibited.

## Consequences

Benefits:

- auditable Event history;
- atomic Event + projection consistency;
- state-aware concurrency conflicts;
- safe network retry contract reusable by WP008;
- direct Data API execution bypass is blocked without privileged functions.

Costs:

- approved command RPCs must set the proper transaction context;
- management and publication regressions must run whenever the guard changes;
- command identifiers and expected-state preconditions become part of the client protocol.