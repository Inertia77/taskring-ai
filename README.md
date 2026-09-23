# TaskRing AI Secretary

TaskRing AI Secretary is a React + TypeScript + Vite application backed by Supabase.

## 📱 How do I install TaskRing on my phone?

### Short answer

**TaskRing is a PWA (Progressive Web App), not a native Android/iOS app.**

Production URL:

**https://inertia77.github.io/taskring-ai/**

That means:

| Item | Current status |
| --- | --- |
| Web/PWA source code | ✅ Available |
| PWA manifest + service worker | ✅ Configured |
| Production frontend | ✅ Deployed on GitHub Pages |
| Android APK | ❌ Not provided |
| iOS IPA | ❌ Not provided |
| Google Play / App Store package | ❌ Not provided |

There is no APK to download from GitHub. Install TaskRing directly from the Production URL instead.

### Android

1. Open **https://inertia77.github.io/taskring-ai/** in Chrome.
2. Tap the browser menu **⋮**.
3. Choose **Install app** / **Add to Home screen**.
4. Confirm installation.
5. TaskRing will launch from the home screen in a standalone app-like window.

### iPhone / iPad

1. Open **https://inertia77.github.io/taskring-ai/** in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Confirm.

> If the browser only shows a normal bookmark option, wait for the page to finish loading and confirm that the site is being opened from the HTTPS Production URL above.

### Development preview on a phone

For local testing on the same network:

```bash
pnpm install --frozen-lockfile
pnpm dev --host 0.0.0.0
```

Then open the computer's LAN address from the phone, for example:

```text
http://192.168.x.x:5173
```

This is only for development preview. The normal phone installation path is the Production URL.

## Current project status

The repository contains the current TaskRing frontend implementation:

- React + TypeScript + Vite
- pnpm
- Supabase integration/local-development structure
- CI and quality gates
- PWA configuration and icons
- frontend health/connection checks
- GitHub Pages Production deployment

The repository does **not** publish a native Android/iOS package.

## Production deployment

Production is deployed automatically from `main` through GitHub Actions.

Production URL:

**https://inertia77.github.io/taskring-ai/**

Deployment workflow:

```text
.github/workflows/pages.yml
```

The GitHub Pages build uses the repository base path `/taskring-ai/`, including PWA scope/start URL and client-side routing support.

## Local setup

### Requirements

- Node.js **22.13 or newer**
- pnpm via Corepack

### Start locally

1. Clone the repository.
2. Copy `.env.example` to `.env.local`.
3. Fill in the TaskRingAI Supabase project URL and publishable key.
4. Install dependencies:

```bash
pnpm install --frozen-lockfile
```

5. Start the development server:

```bash
pnpm dev
```

For phone/LAN preview:

```bash
pnpm dev --host 0.0.0.0
```

Supabase local development is project-scoped. Run:

```bash
pnpm supabase start
```

when Docker-compatible local services are required.

## Build and verify the PWA

```bash
pnpm build
pnpm test:pwa
```

The PWA configuration lives in `vite.config.ts`.

## Quality gates

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:pwa`
- GitHub Actions security scan
- Supabase local reset in CI
