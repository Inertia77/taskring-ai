# ADR 0007: Learning Domain Boundary

- Status: Accepted
- Scope: INC-DB-001 migration-governance repair

## Context

A valid Learning-domain schema reached TaskRingAI Production before it had an authorized migration in the public TaskRing repository. The incident is therefore a deployment-governance failure, not evidence that Learning belongs outside TaskRing.

At the same time, the original Production deployment mixed generic schema definition with private/personal seed state. Reproducing that migration verbatim in the public repository would violate the repository's privacy boundary.

## Decision

Learning is adopted as a first-class TaskRing AI Secretary domain inside the existing TaskRingAI database.

The database boundary is:

- `public`: execution and task-management domain;
- `learning`: learning knowledge and planning domain.

Learning topics and sessions are domain state. They are not tasks. Execution work remains represented by the existing public task, planning, event, and feedback model.

The authorized Learning migration is schema-only. It creates the generic Learning schema and security posture on a fresh database and non-destructively adopts matching objects already present in Production. It contains no personal seed data.

## Privacy decision

Generic schema is public source code.

Personal Learning state is private Production data.

The public repository must never contain real Learning rows, personal preferences, planner state, season content, session content, feedback, private URLs, credentials, or database dumps.

## Security decision

The Learning schema is internal, not browser-facing.

- RLS is enabled on all Learning tables.
- No browser-client policies are created.
- Direct privileges for `PUBLIC`, `anon`, `authenticated`, and `service_role` are revoked.
- RLS is not forced, preserving the trusted database-owner/admin path for internal operational workflows.
- Learning is not exposed through public proxy views/routines or Realtime publications.

A future browser-facing access model requires a new reviewed authorization design; no artificial ownership column is introduced as part of this incident repair.

## Migration-governance decision

Future Learning DDL changes use the same reviewed migration lifecycle as the rest of TaskRing:

1. generic timestamped migration in Git;
2. fresh local rebuild;
3. database/security/regression CI;
4. reviewed merge;
5. exact Production deployment;
6. Production readback and migration-history verification.

Unreviewed direct Production deployment is prohibited even when the proposed schema is otherwise valid.

## Consequences

Positive:

- TaskRing owns Learning as a coherent domain without duplicating execution semantics.
- local environments can reproduce the generic Learning schema without private data.
- the public repository remains safe to publish.
- browser access remains closed by default.
- future Learning schema changes become governed and testable.

Trade-offs:

- trusted internal writers remain an operational dependency and must continue to use owner/admin access until a separately reviewed service boundary exists;
- Learning and execution remain intentionally separate, so future reconciliation requires explicit application/domain design rather than implicit foreign-key coupling.

## Out of scope

This ADR does not authorize WP009, automatic Learning-to-Task generation, learning-planner logic, mastery/spaced-repetition redesign, analytics, external integrations, or a separate Learning database.
