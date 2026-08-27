# Core Domain Model v0.1

TaskRing AI Secretary keeps one authoritative application state in Supabase. External systems may contribute sources, but they are not parallel sources of truth.

## Core distinction

- **Task = what exists.** A Task is the durable current definition/state of work.
- **Daily Plan = what is selected for today.** A Daily Plan is a dated, revisioned selection of work and capacity assumptions.
- **Task Event = what actually happened.** Task Events are append-oriented historical facts about execution and progress.

This separation prevents the daily planning view from becoming the task database and prevents mutable task rows from erasing execution history.

## Entities

### Profile

`profiles` stores application-level settings for an authenticated Supabase user. Identity and credentials remain in `auth.users`.

### Goal

`goals` represents a durable outcome. A Goal may contain Projects, but deleting a Goal detaches Projects rather than deleting them.

### Project

`projects` groups Tasks toward a bounded effort and may optionally belong to a Goal. Deleting a Project detaches Tasks rather than deleting them.

### Task

`tasks` is the durable work definition and current state. It may belong to a Project. It stores human-scale hints such as status, kind, priority hint, time estimates, recurrence metadata, execution context, and checklist state; it does not contain a large AI scoring vector.

Physical Task deletion is intentionally not the normal lifecycle path. Historical references make cancellation/state transitions preferable to deleting facts.

### Inbox Item

`inbox_items` stores raw candidate input before it is accepted, rejected, merged, or interpreted into a domain entity. It separates uncertain ingestion from committed task truth.

### Daily Plan

`daily_plans` is a revisioned plan for one user and date. Multiple revisions may exist, but only one revision may be active for a user/date at once.

### Daily Plan Item

`daily_plan_items` selects a Task into a Daily Plan, assigns a planning bucket/position, and records the item-level execution state for that planned occurrence.

In v0.1 this row also serves the Task Instance role. See ADR 0001.

### Task Event

`task_events` records what happened to a Task at a point in time. Event IDs are UUIDs supplied by the caller when desired, allowing offline clients to pre-generate IDs and safely deduplicate retries with the primary key.

### User Feedback

`user_feedback` records explicit user feedback from the frontend, chat, AI review, or import. Feedback may reference a Task, Daily Plan, or Daily Plan Item, but general/day-level feedback may intentionally have no entity reference.

### Constraint

`constraints` represents availability, fixed events, unavailable periods, preferred windows, or office-flex constraints. WP002 defines only schema; it contains no real personal schedule data.

### Source Link

`source_links` records provenance from an external or manual source to exactly one Goal, Project, Task, or Inbox Item. When an external ID is present, `(user_id, source_type, external_id)` is unique for deduplication.

## Ownership and referential integrity

Every private business row is directly owned by `user_id -> auth.users(id)` with delete cascade.

Relationships between user-owned entities also include `user_id` in composite foreign keys. A child row therefore cannot reference an entity owned by another user even if application code or future RLS configuration is wrong.

Examples:

- `tasks(project_id, user_id) -> projects(id, user_id)`
- `projects(goal_id, user_id) -> goals(id, user_id)`
- `daily_plan_items(plan_id, user_id) -> daily_plans(id, user_id)`
- `daily_plan_items(task_id, user_id) -> tasks(id, user_id)`
- `task_events(task_id, user_id) -> tasks(id, user_id)`

## Security boundary in WP002

All 11 business tables live in the exposed `public` schema, so RLS is enabled immediately on every table. WP002 intentionally creates no end-user policies and explicitly revokes Data API table privileges from public client roles. The schema is deny-by-default until WP003 defines authenticated ownership grants and policies.
