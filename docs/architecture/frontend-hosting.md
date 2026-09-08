# TaskRing frontend hosting and WP010 acceptance

The authoritative application source remains Inertia77/taskring-ai. Sites hosts a
build of the reviewed GitHub revision; the Sites Git source is a deployment mirror,
not a second product or database. Supabase remains the sole master state.

The frontend is a static Vite build, privately published through Sites. Its hosting
manifest uses `static.directory=dist` and
`static.not_found_handling=single-page-application`, so initial requests and refreshes
on /today, /inbox, /tasks, /history and /settings fall back to the application entry.
The existing Workbox offline navigation fallback and empty runtimeCaching remain unchanged.

Only the project URL and publishable key are included in .env.production. These are
public client configuration; server credentials are never included. The existing
email/password Supabase login, session handling and ownership RLS remain in place.

## Temporary authenticated release check

The explicit VITE_RELEASE_CHECK=wp010-20260908 build flag shows the acceptance check
after normal login. It performs nine assertions through the caller's own Secretary
session using only newly generated synthetic Inbox records. It never reads the Inbox
list or personal tasks. It preserves the original capture evidence and tests
low-confidence review, correction, replay, stale/conflicting operations and concurrent
reviews. It also tests rejection of caller-supplied ownership. Two-user Production
isolation is explicitly reported as not run unless a second authenticated user is
available; local real-Auth CI covers two-user isolation.

The check stores a clearly marked synthetic reference receipt in Inbox with source
external ID `taskring-release-report:wp010-20260908`. The summary includes only a
synthetic run UUID, release ID, assertion names and pass/fail status. It contains no
credentials, emails, owner IDs, real task data or raw network error details. The release
agent can read back this receipt with a narrowly filtered management query; it must
not fabricate success from deployment state or substitute management identity for the
browser caller. In-browser completion is not claimed unless the receipt was saved.
After API assertions pass, browser GET requests verify all five application deep links
and an unknown nested route return the HTML application entry. These requests do not
read task data and explicitly avoid the HTTP cache. The result is included in the receipt.

The check is deduplicated within a browser page (including React strict effects), and
successful completion is cached per user locally. A reload after an interrupted run
may create a fresh, clearly synthetic run. This does not change API capture idempotency.
Synthetic records remain reviewable; cleanup must target known synthetic IDs only.

Remove the temporary build flag in the next release after the Production receipt is
verified. Preserve the runner for explicit future release checks. No Task/Plan creation,
Learning mutation, credential transfer, or auth policy change occurs in this check.

## Environment verification

Work installed the frozen dependencies and started the frontend successfully, but
its cloud browser returned ERR_BLOCKED_BY_CLIENT for the supervised preview. This is
an environment access failure, not a Supabase login result. Browser visual QA is not
claimed. Hosted login is performed by the user in their own browser; the checks run
inside that same session without exporting any credential to an agent.
