# Auth and Ownership RLS v0.1

## Identity and session boundary

TaskRing AI Secretary uses Supabase Auth as the identity provider. `auth.users` is the identity truth; the application does not store passwords, mint its own JWTs, or maintain a parallel session database.

The browser client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Supabase JS owns session persistence and refresh with `persistSession = true` and `autoRefreshToken = true`. TaskRing does not copy passwords, access tokens, or refresh tokens into custom storage or logs.

MVP authentication is Email + Password only. Anonymous Auth, OAuth providers, MFA, passkeys, and SSO are outside WP003. Local anonymous sign-in remains disabled.

## Ownership authorization

Every private business row is owned by `user_id`, which references `auth.users(id)`. RLS policies target `authenticated` and require `(select auth.uid()) = user_id`.

The ten mutable owner tables grant authenticated users SELECT, INSERT, UPDATE, and DELETE, but RLS limits those operations to the caller's rows. UPDATE policies use both `USING` and `WITH CHECK`, so an owner cannot transfer a row to another user by changing `user_id`.

`task_events` is append-only history for normal authenticated clients. Owners receive SELECT and INSERT only. UPDATE and DELETE table privileges are not granted, and there are no UPDATE or DELETE RLS policies for this table. Corrections are represented by later events rather than rewriting history.

`anon` retains zero business-table DML grants. `service_role` also retains zero business-table DML grants in this foundation and is not a normal application runtime identity. Future privileged operations must be designed explicitly rather than casually bypassing RLS.

Database-level composite ownership foreign keys from WP002 remain in place, so cross-user references are rejected independently of RLS.

## Profile bootstrap

There is no Auth trigger and no privileged function for profile creation. After a browser session is established, the authenticated client checks its own `profiles` row and inserts one if absent. `user_id` is taken only from `session.user.id`; timezone and locale are detected from the browser. Form input never supplies ownership identity.

## Production deployment security gate

TaskRing is currently a personal application, not an open SaaS onboarding surface. The repository keeps local Email signup enabled for bootstrap and disposable integration tests, but the production project is not seeded with a real account by WP003.

**Before any public frontend deployment:**

1. bootstrap the intended owner account through a controlled process;
2. disable open production signup, or replace it with an architecture-approved controlled onboarding mechanism;
3. verify anonymous Auth remains disabled; and
4. rerun Auth/RLS isolation tests and security advisors.

This gate must be completed before treating the public frontend as production-ready.

## Future boundaries

Future ChatGPT/Secretary access does not automatically receive database-superuser or RLS-bypass credentials. It must use a separately reviewed authorization path with the least privilege required.

Future account deletion can rely on the existing `user_id -> auth.users(id) ON DELETE CASCADE` relationships for private application data, subject to a later product-level deletion flow that first handles active sessions appropriately.
