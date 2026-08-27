# ADR 0003 — PWA Offline Boundary

Status: Accepted for WP004

## Decision

WP004 defines offline support as **static application-shell availability only**.

The service worker precaches build-time application assets needed to load the installed TaskRing shell. It does not implement runtime caching for Supabase, Auth, task data, Daily Plans, feedback, private JSON, or external-source responses.

The PWA configuration therefore keeps runtime caching empty. Navigation fallback may return the precached application entry point so the static shell can open after a successful prior load, but authenticated API responses are not stored in Cache Storage by TaskRing service-worker rules.

## Why

TaskRing contains private user-owned business data. Caching authenticated API responses in a generic runtime cache would enlarge the local privacy boundary, complicate logout/account-switch semantics, and create stale-data behavior before an offline synchronization model exists.

WP008 is expected to design offline business mutations and synchronization deliberately. That future design may use IndexedDB and an explicit queue, but it must not be inferred from WP004's static-shell cache.

## Consequences

- An installed or previously loaded build can reopen its static shell while offline when the service worker and browser storage are available.
- WP004 does **not** promise offline task reads, writes, completion, feedback, or synchronization.
- The UI may report that the app shell is available offline while task-data synchronization requires a connection.
- No Legacy TaskRing service-worker architecture or runtime script composition is reused.
- No Supabase/Auth/API runtime-caching rule is permitted in this ADR's scope.
