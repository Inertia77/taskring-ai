# Task + Project Management MVP

WP005 makes `/tasks` the authenticated management surface for real `tasks` and `projects` rows.

## Data access

UI components do not call `supabase.from(...)` directly. `src/data/tasks/taskRepository.ts` and `src/data/projects/projectRepository.ts` own Data API access. Repositories are constructed with the authenticated `session.user.id`; mutation form inputs never contain `user_id`, `created_by`, `id`, or `updated_at`.

Queries also filter by the session user as defense in depth while Postgres RLS remains the authoritative ownership boundary.

## Query lifecycle

TanStack Query manages server state with keys scoped by authenticated user ID. Successful mutations are server-confirmed and then invalidate/refetch the relevant query. Management queries are removed when the authenticated shell unmounts, preventing one signed-in user's cached management rows from being reused by another session.

No persistent client cache or IndexedDB queue is introduced. Offline mutation attempts are rejected visibly before a request is issued; request failures remain errors and are never displayed as empty state.

## Lifecycle boundary

Task definition editing exposes only `active`, `waiting`, `paused`, and `someday`. `done`, `blocked`, and `cancelled` are not ordinary editor values. Cancellation is a dedicated soft lifecycle mutation to `status = 'cancelled'`; no normal hard-delete UI exists.

Project definition editing exposes `active`, `paused`, `waiting`, and `done`. Project cancellation is likewise a dedicated soft lifecycle mutation.

Task completion remains reserved for Task Events in a later execution work package.

## Time handling

`datetime-local` fields are parsed as local wall-clock values with the `Date(year, month, day, hour, minute)` constructor, validated against calendar normalization, and only then serialized with `toISOString()` for `timestamptz`. Raw database timestamps are not shown in editors.

## PWA boundary

WP004 remains unchanged: static application-shell precaching only, with `runtimeCaching: []`. Supabase Auth/Data API responses are not cached by the service worker.
