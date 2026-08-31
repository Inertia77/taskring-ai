# Learning Domain

## Purpose

TaskRing AI Secretary has two complementary database domains:

- `public`: execution and task-management state.
- `learning`: learning knowledge, planning, evidence, mastery, and review state.

The Learning domain is a first-class TaskRing domain. It is not a second task system and it is not a browser-facing extension of the task tables.

## Domain boundary

A learning topic describes knowledge or skill state. A task describes executable work. A learning session describes a learning-domain planning/recording unit. A daily-plan item describes work selected for execution on a particular day.

Therefore:

- Learning Topic != Task.
- Learning Session != Task.
- Learning state must not be collapsed into execution state.

The intended long-term loop is:

1. Learning state identifies a learning need.
2. AI Secretary may translate an approved need into actionable work.
3. `public.tasks` represents that executable work.
4. `daily_plans` and `daily_plan_items` select work for execution.
5. `task_events` and `user_feedback` record execution facts.
6. A later, separately governed reconciliation process may update Learning state from those facts.

This document does not implement the translation or reconciliation steps.

## Schema ownership

`learning` currently contains these generic tables:

- `domains`
- `topics`
- `prerequisites`
- `seasons`
- `sessions`
- `session_items`
- `feedback`
- `mastery_evidence`
- `mastery`
- `review_queue`
- `planner_state`

The schema is intentionally separate from `public` so that knowledge/planning state and execution state can evolve independently while remaining inside the same TaskRingAI database.

## Privacy boundary

The public repository is the source of truth for generic schema and security design only.

Allowed in source control:

- generic tables, columns, indexes, constraints, and foreign keys;
- generic access-control design;
- schema tests;
- sanitized architecture documentation.

Not allowed in source control:

- production learning rows;
- personal preferences or priorities;
- scheduler or locale/timezone state;
- planner-state values;
- season goals or constraints;
- real session/session-item content;
- feedback text;
- private URLs;
- credentials or database dumps.

Fresh local databases therefore create an empty Learning domain. Personal Learning state is Production/private data, not seed data.

## Access model

The Learning domain is an internal database domain, not a direct browser Data API surface.

The governed baseline is:

- RLS enabled on all Learning tables as defense in depth;
- no browser-client RLS policies;
- no direct `PUBLIC`, `anon`, `authenticated`, or `service_role` privileges on the schema or tables;
- no `FORCE ROW LEVEL SECURITY`, so the database owner/admin tooling used by trusted internal workflows can continue to operate;
- no public views or public routines that proxy Learning data;
- no Realtime publication for Learning tables.

A future browser-facing Learning feature requires a separate architecture review, explicit ownership semantics, and explicit RLS policies. It must not be enabled merely by granting a client role access to the current single-person internal model.

## Migration governance

All future Learning schema changes follow the same governance as TaskRing public-domain migrations:

1. create a timestamped migration in `supabase/migrations`;
2. keep the migration generic and free of personal Production data;
3. rebuild a fresh local database from migrations and seed;
4. run pgTAP, lint, integration, generated-type, and application regression gates;
5. merge through reviewed Git history;
6. apply the exact authorized migration to Production;
7. read back schema, privileges, data integrity, and migration history.

Direct Production schema deployment outside this path is migration drift and must be treated as an incident even when the underlying domain model is valid.

## Non-goals

Adopting the Learning domain does not implement:

- automatic Learning-to-Task generation;
- a learning planner;
- mastery or spaced-repetition redesign;
- analytics;
- Notion, Calendar, Gmail, or other adapters;
- WP009 functionality.
