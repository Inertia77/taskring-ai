import { describe, expect, it, vi } from 'vitest'
import { buildSupabaseHealthUrl, checkSupabaseHealth } from '../src/lib/supabaseHealth'

describe('Supabase health utilities', () => {
  it('builds the auth health endpoint without duplicate slashes', () => {
    expect(buildSupabaseHealthUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1/health',
    )
  })

  it('returns true for a successful health response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))

    await expect(checkSupabaseHealth('https://example.supabase.co', 'publishable-key', fetchMock)).resolves.toBe(
      true,
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns false for an unsuccessful health response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))

    await expect(checkSupabaseHealth('https://example.supabase.co', 'publishable-key', fetchMock)).resolves.toBe(
      false,
    )
  })
})
