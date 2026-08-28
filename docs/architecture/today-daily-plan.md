# Today + Daily Plan v0.1

WP006 turns `/today` into the authenticated execution-plan surface backed by `daily_plans`, `daily_plan_items`, `tasks`, and optional project metadata.

## Domain boundary

- **Task** = what exists.
- **Daily Plan** = what is selected for one user and one planning date.
- **Daily Plan Item** = one Task instance inside one immutable plan revision.
- **Task Event** = what actually happened.

WP006 is deliberately plan-only. It does not create Task Events, completion controls, progress controls, defer/blocked actions, feedback, or execution-state mutations from Today.

## Planning date

Today derives `plan_date` from an instant plus the user's current planning timezone. v0.1 uses the browser-resolved IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. The date utility formats calendar parts in that timezone; it does not use a UTC `toISOString().slice(0, 10)` shortcut.

A future Settings capability may override the planning timezone through the profile, without changing the Daily Plan date model.

## Read model

Today queries exactly one `daily_plans` row for:

- authenticated `user_id`
- planning `plan_date`
- `status = 'active'`

It then reads the matching `daily_plan_items` and resolves current Task definitions plus optional Project titles. Plan Items are historical plan instances; later Task definition changes such as paused, done, or cancelled do not remove the item from the plan. Today can display the Task's current status alongside the preserved Plan Item.

Seven official buckets render in fixed product order:

1. `must` — 🔥 MUST
2. `should` — ⭐ SHOULD
3. `main_quest` — 🌙 MAIN QUEST
4. `flex` — 🪶 FLEX
5. `routine` — 🔁 ROUTINE
6. `game` — 🎮 GAME
7. `bonus` — 💭 BONUS

Emoji are presentation only and are never persisted. Items within a bucket render by `position ASC`.

## Manual builder

Until an AI Planner is introduced, the Manual Daily Plan Builder keeps TaskRing usable without pretending to automate planning.

New candidates are limited to the authenticated user's Tasks with `status = 'active'`. The builder supports:

- add Task
- remove Task from the local draft
- choose one of the seven buckets
- optional non-negative whole-number `planned_minutes`
- deterministic Move Up / Move Down ordering within a bucket
- publish

The builder does not automatically rank, schedule, estimate capacity, carry over, select MUST/SHOULD, or call an LLM.

## Revision model

A published plan is never edited in place. Editing Today's Plan loads the active revision into a local draft. Publishing creates a new revision, supersedes the prior active plan, and preserves the prior plan and all of its items.

The client sends the active `base_plan_id`. The database rejects publication when that ID no longer matches the current active revision, including the inverse case where the client believes no plan exists but another publisher created one.

## Atomic publication

`public.publish_daily_plan_v01` is the single publication boundary. One RPC request runs the whole publication inside the database transaction:

1. resolve owner from `auth.uid()`
2. serialize publication for the user/date
3. lock and validate the current active plan
4. validate `base_plan_id`
5. reject simple replanning if any active-plan item has entered a state other than `planned`
6. validate all input items, ownership, duplicates, and deterministic positions
7. compute the next revision
8. preserve existing capacity/brief metadata when the manual builder does not edit it
9. supersede the previous active plan
10. create the new active plan with `created_by = 'user'`
11. insert all new items with `current_state = 'planned'` and no carryover
12. return the new plan ID and revision

Any exception rolls the RPC request back, so a failed publication cannot leave an old plan superseded without a complete replacement.

## Ownership and RPC security

The RPC is `SECURITY INVOKER` with an empty `search_path`. It never accepts `user_id`, plan lifecycle state, revision, or `created_by` from the browser. Ownership is derived from `auth.uid()` and remains enforced by the existing RLS policies and composite ownership foreign keys.

Function execution is explicitly revoked from `PUBLIC`, `anon`, and `service_role`, then granted only to `authenticated`.

## Query cache privacy

TanStack Query keys include both authenticated user ID and planning date. The authenticated shell clears both management and Today user-scoped query roots when that user's shell unmounts, so a later session cannot reuse another user's in-memory Today data.

## Offline boundary

WP006 does not add IndexedDB, persistent Daily Plan caching, or an offline publication queue. If currently loaded in-memory data exists it may remain visible, but Publish while offline is rejected with an explicit message that nothing was saved offline.

The WP004 Service Worker boundary remains unchanged: static app-shell precaching only with no Supabase Auth, Data API, `/rpc/`, or other private business runtime caching.
