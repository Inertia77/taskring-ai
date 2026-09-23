# TaskRing AI Secretary

TaskRing AI Secretary is a React + TypeScript + Vite application backed by Supabase.

## 📱 How do I install TaskRing on my phone?

### Short answer

**TaskRing is currently a PWA (Progressive Web App), not a native Android/iOS app.**

That means:

| Item | Current status |
| --- | --- |
| Web/PWA source code | ✅ Available |
| PWA manifest + service worker | ✅ Configured |
| Android APK | ❌ Not provided |
| iOS IPA | ❌ Not provided |
| Google Play / App Store package | ❌ Not provided |
| Public Production frontend URL | ⚠️ Not published in this repository yet |

So **there is currently no APK file to download from GitHub**.

Once the Production frontend is deployed over HTTPS, the intended phone installation flow is:

### Android

1. Open the **Production frontend URL** in Chrome.
2. Tap the browser menu **⋮**.
3. Choose **Install app** / **Add to Home screen**.
4. Confirm installation.
5. TaskRing will then launch from the home screen in a standalone app-like window.

### iPhone / iPad

1. Open the **Production frontend URL** in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Confirm.

> If the browser only shows a normal bookmark option, first confirm that the site is served over HTTPS and that the PWA manifest/service worker are active.

### Can I try it on my phone before Production is deployed?

Yes, for **development preview** on the same local network:

```bash
pnpm install --frozen-lockfile
pnpm dev --host 0.0.0.0
```

Then open the computer's LAN address from the phone, for example:

```text
http://192.168.x.x:5173
```

This is useful for UI testing, but a normal LAN HTTP address is **not the final PWA installation path**. The proper install experience should use the HTTPS Production deployment.

## Current project status

The repository contains the reproducible engineering foundation and the current frontend implementation:

- React + TypeScript + Vite
- pnpm
- Supabase integration/local-development structure
- CI and quality gates
- PWA configuration and icons
- frontend health/connection checks

The repository does **not** currently publish a native Android/iOS package.

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

## Next deployment milestone

To make TaskRing directly installable on a phone, the next practical step is to deploy the frontend to a stable **HTTPS Production URL**. After that, Android/iOS users can install the PWA from their browser without needing an APK or app-store release.
