# Frontend Shell

## Authenticated boundary

`App` keeps the WP003 authentication boundary intact. Signed-out users render `AuthScreen`; authenticated users render `AuthenticatedAppShell`. The application router exists only inside the authenticated shell and cannot bypass authentication.

## Primary surfaces

The authenticated shell exposes exactly five primary routes, in a fixed order:

1. `/today` — the execution-focused landing surface. WP004 contains only date, connection/network state, and structural space for future Today sections. It does not fabricate tasks or a Daily Plan.
2. `/inbox` — empty-state shell for future candidate/inbox work.
3. `/tasks` — empty-state shell for future task management.
4. `/history` — empty-state shell for future task-event history.
5. `/settings` — minimal product/auth/network/Supabase status plus Sign Out.

`/` resolves to `/today`. Unknown authenticated paths resolve back to `/today` so an installed PWA always has a stable landing surface.

## Mobile-first navigation

Primary navigation is a fixed bottom navigation with exactly five labelled items. Every item has a lightweight inline SVG icon plus text; active navigation exposes `aria-current="page"`. Touch targets are at least 44 px in each dimension and the bottom bar includes `env(safe-area-inset-bottom)`.

The shell uses `100dvh` with a `100vh` fallback, `env(safe-area-inset-top)`, and `env(safe-area-inset-bottom)` for iPhone/Android browser and installed-PWA viewport behavior.

## Responsive behavior

Mobile is the primary layout. On larger screens the application remains a single centered personal-workspace viewport rather than changing into an administrative dashboard or sidebar product. The content frame is capped at 860 px and navigation remains the same five surfaces.

## Today future structure

The Today shell intentionally leaves a flexible content region that can later accommodate the planned sections without changing the shell architecture:

- MUST
- SHOULD
- MAIN QUEST
- FLEX
- ROUTINE
- GAME
- BONUS

No fake tasks or placeholder Daily Plan records are rendered in WP004.

## Accessibility baseline

The shell provides semantic `<nav>` and `<main>` landmarks, a skip link, real links/buttons, `aria-current`, visible focus treatment, labelled navigation items, sufficient touch targets, and a `prefers-reduced-motion` rule. Page shells use semantic heading structure.
