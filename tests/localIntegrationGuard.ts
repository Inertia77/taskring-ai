// Development suites provision synthetic accounts and must never target a remote project.
export function hasLocalSupabase(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && !parsed.username && !parsed.password
  } catch { return false }
}
