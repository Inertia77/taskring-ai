import { expect, it } from 'vitest'
import { hasLocalSupabase } from './localIntegrationGuard'

it('permits only loopback Supabase integration endpoints', () => {
  expect(hasLocalSupabase('http://127.0.0.1:54321', 'synthetic')).toBe(true)
  expect(hasLocalSupabase('http://localhost:54321', 'synthetic')).toBe(true)
  for (const url of [undefined, 'invalid', 'https://example.supabase.co', 'https://localhost.example.test',
    'https://localhost@example.test', 'file://localhost/example', 'https://user@localhost']) {
    expect(hasLocalSupabase(url, 'synthetic')).toBe(false)
  }
})
