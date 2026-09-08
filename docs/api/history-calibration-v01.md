# History and calibration v0.1

`get_execution_history` and `get_calibration` accept `{operation,plan_date}`. They
use the same bounded 30-day, caller-RLS source context as planning. The history API
returns dated revisions, item projections, raw task events and feedback. Calibration
returns settings, a settings token, records, sample provenance and explanation.
`get_planning_context` includes that same recomputed calibration.

No personality scores, inference about psychology, or persistent derived model.
Each complete task episode uses incremental actual minutes from partial/done events,
compared with the original plan item's planned minutes (following explicit carryover
links). Reopened work starts a new episode. Missing duration, excluded events, or
missing original plan evidence makes an episode ineligible. UUID deduplication keeps
retries from counting twice. At least three complete episodes are required before
returning the median actual/planned ratio. This is plan-effort calibration, not a
claim about immutable task estimates. Median observed daily effort similarly needs
three observed days and remains a lower bound, never an automatic capacity target.
Feedback stays qualitative source material; it is not converted to a hidden score.

Every sample includes source event IDs, original item ID, planned/actual minutes and
ratio. The frontend History page shows recorded versus effective durations and lets
the user correct, exclude, remove a correction, or delete and disable calibration.
History remains authoritative and immutable. Corrections are explicit overlays stored
under profiles.planning_preferences.calibration and include a reason; they do not
rewrite task_events or personal Learning data.

`set_calibration_settings` accepts `{operation,plan_date,expected_token,settings}`.
Settings are `{enabled,excluded_event_ids,corrections:[{event_id,actual_minutes,reason}]}`.
Only visible owner evidence can be newly referenced. The write uses a compare-and-swap
of existing profile preferences and preserves unrelated settings. Stale changes return
409; unavailable evidence returns 422. Clear arrays and set enabled=false to delete
all calibration overrides and stop derivation. Re-enable to recompute from raw history.
No derived results are stored elsewhere, so deletion does not leave an invisible model.

The History query cache is scoped to authenticated user and cleared with the existing
history cache boundary. Calibration writes require a connection; they do not bypass
or alter the offline execution outbox. API errors never return underlying credentials
or raw database error detail. Personal history is not emitted to logs or fixtures.

Unit test mode explicitly clears frontend Supabase configuration through .env.test;
integration CI supplies loopback URL/key as process environment, and loopback guards
reject remote integration targets. Unit UI tests cannot inherit production settings
from a developer's .env.local.
