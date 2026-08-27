# WP002 Core Domain Migration

Migration: `supabase/migrations/20260827145827_core_domain_v01.sql`

This migration establishes TaskRing AI Secretary Core Domain Schema v0.1.

## Discipline

- The SQL was created and verified through the Supabase CLI migration workflow.
- The repository migration version is aligned with the version recorded by the TaskRingAI cloud deployment so future migration tooling sees one consistent history.
- Verified locally with `supabase db reset --local`.
- Verified by pgTAP schema tests in `supabase/tests/`.
- Generated TypeScript database types live at `src/types/database.types.ts`.
- No production/private seed data is included.
- Cloud deployment targets only TaskRingAI.

## Security posture

All eleven public business tables enable Row Level Security immediately. WP002 intentionally installs no end-user policies and revokes Data API table privileges from browser-facing roles; WP003 will add authenticated ownership grants and policies.
