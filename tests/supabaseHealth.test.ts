import { describe, expect, it, vi } from 'vitest'
import { buildSupabaseHealthUrl, checkSupabaseHealth } from '../src/lib/supabaseHealth'

describe('Supabase health utilities', () => {
  it('builds the auth health endpoint without duplicate slashes', () => {
    expect(buildSupabaseHealthUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1/health',
    )
  })

  it('returns true for a successful health response without permitting a browser HTTP cache hit', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))

    await expect(checkSupabaseHealth('https://example.supabase.co', 'publishable-key', fetchMock)).resolves.toBe(
      true,
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/health',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { apikey: 'publishable-key' },
      }),
    )
  })

  it('returns false for an unsuccessful health response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))

    await expect(checkSupabaseHealth('https://example.supabase.co', 'publishable-key', fetchMock)).resolves.toBe(
      false,
    )
  })

  it('surfaces transport failures to the effective-connectivity boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(checkSupabaseHealth('https://example.supabase.co', 'publishable-key', fetchMock)).rejects.toThrow(
      'Failed to fetch',
    )
  })
})
