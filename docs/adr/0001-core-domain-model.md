# ADR 0001: Daily Plan Item serves as Task Instance in v0.1

- Status: Accepted
- Scope: Core Domain Schema v0.1

## Context

TaskRing needs to distinguish a durable Task definition from a dated plan selection and from execution history.

A separate `task_instances` table could model every occurrence of a Task, but the MVP does not yet need an independent instance lifecycle outside daily planning. Adding it now would create another identity layer, more joins, more ownership relationships, and migration complexity before the product has proved a need for it.

## Decision

In Core Domain Schema v0.1, `daily_plan_items` serves both as:

1. the membership/ordering row that selects a Task into a Daily Plan, and
2. the Task Instance representation for that planned occurrence.

The durable Task remains in `tasks`. Actual execution history remains in `task_events`, optionally linked to the Daily Plan Item.

Therefore:

- Task = durable definition/current state.
- Daily Plan Item = planned occurrence/instance for a dated plan revision.
- Task Event = historical execution fact.

No `task_instances` table is created in WP002.

## Consequences

### Positive

- Keeps the v0.1 model smaller and easier to reason about.
- Avoids a twelfth business table and an unnecessary identity layer.
- Makes plan ordering, buckets, planned minutes, carryover, and occurrence state available on one row.
- Preserves event-based history independently of mutable planning state.

### Trade-offs

- A Task occurrence that must exist independently of any Daily Plan has no first-class instance row in v0.1.
- Future recurring-task or scheduler requirements may justify extracting a dedicated Task Instance model.

## Revisit condition

Revisit this decision only when a concrete requirement needs Task occurrences to exist independently of Daily Plans, or when scheduler/offline semantics cannot be represented cleanly with `tasks + daily_plan_items + task_events`.
