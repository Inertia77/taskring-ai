# TaskRing AI Secretary

Greenfield foundation for TaskRing AI Secretary.

## WP001 scope

This repository contains only the reproducible engineering foundation: React + TypeScript + Vite, pnpm, Supabase local-development structure, CI, documentation skeleton, a minimal frontend health page, and a connection health check.

No production task, goal, project, scheduler, AI, Notion, Gmail, Calendar, GUCC, or migration functionality is implemented in WP001.

## Local setup

1. Install Node.js 22.13 or newer and enable pnpm via Corepack.
2. Copy `.env.example` to `.env.local`.
3. Fill only the new TaskRingAI project URL and publishable key.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm dev`.

Supabase local development is project-scoped. Run `pnpm supabase start` when Docker-compatible local services are required.

## Quality gates

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- GitHub Actions security scan
- Supabase local reset in CI
