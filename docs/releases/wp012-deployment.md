# WP012 deployment

PR17 merged as 9bde0e78ba86f5de4f4e52eeb16c9806057573a2.
PR CI 34216539333 and main CI 34216887516 passed all three gates, including
fresh reset/replay, pgTAP, DB lint, real Auth integration and generated type check.

The connected migration service applied the reviewed SQL as migration version
20260908104556, name replanning_v01. The repository filename is aligned with that
service-assigned version in WP013; SQL is byte-for-byte unchanged. The production
migration ledger was never edited manually, and this rename does not apply SQL again.
Secretary API v4 is ACTIVE with JWT verification enabled.

Read-only before/after comparisons found identical row counts and content digests
for all eleven Learning tables. No Learning content or identifiers are stored here.
Production authenticated full-loop smoke for the new planning/replan/history
operations remains distinct from local real-Auth integration and deployment readback;
only WP010 has a user-browser Production receipt at this point.
