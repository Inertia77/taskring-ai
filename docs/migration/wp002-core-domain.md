# WP002 Core Domain Migrations

Primary schema migration:

- `supabase/migrations/20260827145827_core_domain_v01.sql`

Performance follow-up migration:

- `supabase/migrations/20260827150828_cover_owner_fks.sql`

Together these migrations establish TaskRing AI Secretary Core Domain Schema v0.1 and provide covering indexes for composite ownership foreign keys.

## Discipline

- Both SQL changes were created and verified through the Supabase CLI migration workflow.
- Repository migration versions are aligned with the versions recorded by the TaskRingAI cloud deployment so future migration tooling sees one consistent history.
- Verified locally with `supabase db reset --local`.
- Verified by pgTAP schema tests in `supabase/tests/`.
- Generated TypeScript database types live at `src/types/database.types.ts`.
- No production/private seed data is included.
- Cloud deployment targets only TaskRingAI.

## Security posture

All eleven public business tables enable Row Level Security immediately. WP002 intentionally installs no end-user policies and revokes Data API table privileges from browser-facing roles; WP003 will add authenticated ownership grants and policies.
