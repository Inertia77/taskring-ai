import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const pwaVerifier = readFileSync(new URL('../scripts/verify-pwa-build.mjs', import.meta.url), 'utf8')

describe('PWA private response boundary', () => {
  it('keeps Workbox runtime caching empty so Supabase responses are never cached', () => {
    expect(viteConfig).toMatch(/runtimeCaching:\s*\[\s*\]/)
    expect(viteConfig).not.toMatch(/urlPattern\s*:/)
  })

  it('keeps the production service-worker verifier guarding private Supabase endpoint markers', () => {
    for (const marker of ['supabase.co', '/rest/v1/', '/auth/v1/', '/storage/v1/']) {
      expect(pwaVerifier).toContain(marker)
    }
  })
})
