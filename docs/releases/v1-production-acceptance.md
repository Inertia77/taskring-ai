# v1 Production acceptance boundary

The release build enables a one-time signed-in browser acceptance harness. The same
harness runs first in CI against real local Auth, Edge Functions and owner RLS.
It uses the normal frontend client session, never a privileged key or exported token.

The browser creates a new synthetic Inbox capture, corrects it and explicitly resolves
it into a synthetic task/source link. It chooses an unused historical Saturday in
2000–2009 and refuses to change an existing plan on that date. It publishes a bounded
plan, records partial execution and feedback, explicitly carries remaining work into
a new revision, records completion and checks retained history. It tests a duration
correction on its own synthetic event and removes only that correction. Existing
calibration settings, personal plan items and Learning data are preserved. If the user
has disabled calibration, that preference remains disabled. No personal derived signal
is used as a test assertion. Failed synthetic tasks are cancelled by their exact new ID.

Context/history results remain inside the caller's browser. Only synthetic assertion
names, pass/fail, release ID and a random run ID are written into the final receipt:
source_external_id = taskring-release-report:v1-core-20260908
raw_input = SYNTHETIC TaskRing v1 Core verification receipt. No personal data.

The release agent reads only this narrowly filtered receipt, not user tasks, settings,
JWTs or browser storage. A saved receipt is required before claiming Production success.
Production cross-user testing remains explicitly not run; independent local two-user
integration verifies isolation. Remove the temporary release flag after readback.

The Work cloud preview remains blocked by ERR_BLOCKED_BY_CLIENT. It cannot borrow a
session from the owner's external browser. The deployed page performs its own checks
when opened with a valid normal login; browser visual/mobile QA remains a separate
unverified boundary until a usable interactive browser is available.
