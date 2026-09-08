# Execution and replanning v0.1

Secretary operations use the same authenticated caller and owner RLS as capture.
`record_task_action` accepts `event_id`, `plan_item_id`, `expected_state`, `action`,
`occurred_at` and optional `progress_percent`, `remaining_minutes`, `actual_minutes`,
`reason`, `note`. It delegates to the existing execution RPC, preserving retry IDs,
state preconditions, partial progress/remaining effort and event history.
Actions: started, partial, done, skipped (Skip Today), deferred, blocked, cancelled,
reopened. `add_plan_item_feedback` takes `feedback_id`, `plan_item_id`, `content`.
No caller identity or arbitrary write target is accepted. SQL remains authoritative.

`replan_daily_plan` takes a normal planning `proposal` plus `decisions`:
`[{source_item_id, decision: "carry" | "omit", reason}]`. Each unfinished item in the
current base revision requires one decision, even if omitted. Historical sources
in the available context can be selected for a future day explicitly. No automatic
next-day rollover occurs. A task may have one carry source only. Sources must be
owned, unfinished, not from the future and consistent with the selected task.
Selected tasks must be active and fit the same planning policy as new plans.

The new replan_daily_plan_v01(jsonb) transaction checks expected current item states,
update timestamps and selected task timestamps under locks, supersedes only the
old plan header and inserts a new revision with carryover links. Old item projections,
events and feedback are preserved. Carried partial items remain partial; remaining
effort is taken from tasks/history when proposing, never reset to original estimate.
The saved proposal retains explicit decisions, capacity changes and rationale.

Publication, execution and replanning share a per-owner transaction lock. A concurrent
execution action invalidates a stale replan; concurrent replans cannot both win.
The original publish_daily_plan_v01 contract remains compatible and still refuses
execution-aware replanning; only the new explicit command provides that behavior.

## Offline coexistence

IndexedDB and FIFO outbox remain unchanged. Acknowledged events replay exactly once
across a revision change. New queued actions targeting an already superseded item
receive a conflict and remain durable at the FIFO head for user resolution. They are
not discarded, applied to a different task/revision, or called successful. Replan
from the same browser only after its outbox is reconciled; another offline device is
not observable by the server. This is an explicit multi-device conflict boundary.

Migration is compatible: no tables dropped, no history rewritten, no Learning access.
