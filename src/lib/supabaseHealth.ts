export type SupabaseHealth = 'checking' | 'online' | 'offline' | 'not-configured'

export function buildSupabaseHealthUrl(projectUrl: string): string {
  return `${projectUrl.replace(/\/$/, '')}/auth/v1/health`
}

export async function checkSupabaseHealth(
  projectUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<boolean> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null

  try {
    const response = await fetchImpl(buildSupabaseHealthUrl(projectUrl), {
      method: 'GET',
      headers: {
        apikey: publishableKey,
      },
      cache: 'no-store',
      signal: controller?.signal,
    })

    return response.ok
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}
