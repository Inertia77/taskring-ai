# ADR 0002: Supabase Auth and ownership RLS

- Status: Accepted
- Scope: WP003 Auth + Ownership RLS v0.1

## Context

TaskRing's core domain is private and user-owned. WP002 intentionally left all exposed business tables deny-by-default with RLS enabled but no browser grants or policies. WP003 needs a minimal authenticated boundary without inventing a second identity system or introducing privileged application shortcuts.

## Decision

1. Supabase Auth is the identity provider; `auth.users` is identity truth.
2. MVP sign-in uses Email + Password with persistent Supabase-managed browser sessions and automatic token refresh.
3. Every business authorization decision is based on the row's `user_id` and `(select auth.uid()) = user_id` in RLS policies targeted `TO authenticated`.
4. Ten mutable business tables use owner CRUD policies with matching `USING` and `WITH CHECK` predicates.
5. `task_events` is append-only for ordinary authenticated clients: owner SELECT + INSERT, no UPDATE or DELETE grants/policies.
6. `anon` has zero business DML privileges. `service_role` is not granted business-table DML and is not a routine app runtime.
7. Profile bootstrap runs through the authenticated client using `session.user.id`; no Auth trigger or `SECURITY DEFINER` shortcut is introduced.
8. Anonymous Auth stays disabled. OAuth, MFA, passkeys, SSO, Today UI, planner, scheduler, and AI Secretary are outside this decision.
9. Production open signup is a deployment security gate: bootstrap the owner first, then disable open signup or adopt a separately approved controlled onboarding design before public deployment.
10. Future ChatGPT access must be separately authorized with least privilege and does not default to database-superuser credentials.

## Consequences

- Cross-user data access is blocked twice: by RLS for API access and by composite ownership foreign keys for relationships.
- Session persistence is delegated to Supabase JS rather than custom token storage.
- Historical task events cannot be silently rewritten by the normal authenticated client.
- The personal MVP can bootstrap locally without creating production test users or private seed data.
- A later deployment package must explicitly close or control production signup before the frontend is public.
