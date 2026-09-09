# TaskRing AI Secretary v1 Core acceptance

Production acceptance was read back on 2026-09-09. The synthetic receipt was
created at 03:50:13 UTC (12:50:13 JST), with status `passed`, 17 checks and no
failed check. No personal tasks, credentials, browser storage or screenshots
are included in this record.

The owner used the normal authenticated frontend session. The new v1 page was
initially hidden by the previously loaded WP010 client; refreshing loaded the
current client and completed the full check. Deployment success alone was not
treated as authenticated acceptance.

## Verified loop

- Authenticated chat capture, low-confidence review marking, raw input readback.
- Interpretation correction, stable idempotent capture replay, stale/conflicting
  input rejection, exactly one concurrent review winner, caller ownership rejection.
- Explicit synthetic Inbox resolution, task/source link, current planning context,
  proposal validation and publication.
- Partial execution, feedback and event replay; explicit carryover into a new
  revision with the previous revision preserved and stale replan rejected.
- Completion, history readback, explainable calibration evidence, correction,
  unchanged raw duration, correction removal and restored evidence in next context.

Production cross-user checks were not run because only one normal user session
was available. Independent local two-user integration passed against real Auth,
Edge Functions and RLS in CI. The exact 17-check browser harness also passed there.

## Release evidence

| Package | PR | Merge commit | Successful main CI |
| --- | --- | --- | --- |
| WP010 capture | 14 | 30fe6daf62be26517e3eae720fc1634556d6ad5b | 34050595906 |
| Frontend hosting / WP010 acceptance | 15 | 5b7576e86891310304a8289494dd029ebd1a055c | 34190017402 |
| WP011 planning | 16 | babfb4bf47b87081aeb32592cd7cb70e790c4faf | 34191659705 |
| WP012 replanning | 17 | 9bde0e78ba86f5de4f4e52eeb16c9806057573a2 | 34216887516 |
| WP013 history / calibration | 18 | 2b46468134c819194376e5786bc2f0b44d7aa18b | 34217814751 |
| Full-loop acceptance frontend | 19 | 27afcb947e3cd9d48ae5305d10bc200f37c8e035 | 34218201396 |

Each merged PR and main passed Quality, Security and Supabase Local Reproducibility.
This closeout removes both automatic acceptance routes and the production release
flag. Synthetic test runners remain available to CI; normal login enters the app.
The closeout itself must pass PR/main CI before publishing. Its final merge and
deployment are recorded in the delivery report rather than predicted here.

## Production state

`secretary-api`: ACTIVE, version 5, verify_jwt=true. Reviewed source readback
matched all eight files. Caller authentication and owner RLS remain authoritative;
the browser and Secretary use no privileged database key.

Migration ledger:

```
20260827145827 core_domain_v01
20260827150828 cover_owner_fks
20260827160924 auth_rls_v01
20260828024023 task_project_updated_at
20260828051500 publish_daily_plan_v01
20260828095725 execution_events_feedback_v01
20260831035848 learning_domain_v01
20260908104556 replanning_v01
```

The replanning migration is additive/compatible. The repository filename matches
the version assigned by the production migration tool; SQL is byte-identical to
the reviewed migration. No ledger was manually edited. Public has 11 RLS tables
and 25 validated foreign keys. Learning retains its separate 11-table private
schema; pre/post migration counts and per-table content fingerprints matched.
Learning rows were not modified by these work packages. GUCC was not accessed.

Available operations: capture_inbox_item, capture_chat_input, list_inbox_items,
get_inbox_item, review_inbox_item, get_planning_context, validate_plan_proposal,
publish_plan_proposal, replan_daily_plan, record_task_action,
add_plan_item_feedback, get_execution_history, get_calibration,
set_calibration_settings.

## Frontend and offline audit

Today retains MUST, SHOULD, MAIN QUEST, FLEX, ROUTINE, GAME and BONUS, with Done
as the primary checkbox and state-appropriate Partial, Skip Today, Defer, Blocked,
Cancel, Edit and Add Feedback controls. A stale Tasks description was corrected.
Existing interaction tests cover execution and history. Offline tests cover local
persistence, optimistic state, refresh, FIFO, replay, reconnect acknowledgement,
conflicts and user isolation; CI runs the real database integration cases.
Unacknowledged actions against superseded plan items remain explicit durable FIFO
conflicts; they are never silently discarded or reassigned to a new revision.

Owner screenshots confirmed desktop login, navigation, online status, Today empty
state and the successful v1 check. A fresh mobile visual/browser interaction audit
could not run in the Work browser (ERR_BLOCKED_BY_CLIENT). Responsive source and
interaction tests passed; this is not a claim of new physical-device mobile QA.

## Remaining non-blocking limits

- Main branch remains unprotected; connected repository tools lack administration
  mutation access. No red CI was merged.
- CORS remains `*` with explicit Bearer authentication. Narrow origin policy is a
  follow-up now that a stable owner-private frontend origin exists.
- Security Advisor: one WARN for disabled leaked-password protection and eleven
  INFO findings for intentionally policy-free private Learning RLS tables.
  [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  and [RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Performance Advisor: eleven INFO Learning foreign keys without covering indexes
  and fifteen INFO unused indexes at final readback. No speculative indexes added
  or existing indexes removed. [Foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
  and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Context reads have an explicit 500-row bound per collection and fail on overflow.
  Unexpanded recurring hard constraints fail closed. Automatic recurrence expansion
  and a holiday calendar are outside this release. Multi-query context reads are
  not a serializable snapshot; revision publication is serialized and state-checked.
- Service-worker clients may require a refresh to load a new frontend release.
  Existing IndexedDB data and login storage must not be cleared for an update.
- Synthetic acceptance history is deliberately retained. Calibration is derived
  from history, with visible correction/exclusion/disable controls, not a hidden model.

SPA deep-link fallback is configured and WP010 Production checks verified it.
The frontend is hosted privately for its owner; broader public access is not required.
