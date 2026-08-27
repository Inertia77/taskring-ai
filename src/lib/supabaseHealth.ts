export type SupabaseHealth = 'checking' | 'online' | 'offline' | 'not-configured'

export function buildSupabaseHealthUrl(projectUrl: string): string {
  return `${projectUrl.replace(/\/$/, '')}/auth/v1/health`
}

export async function checkSupabaseHealth(
  projectUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(buildSupabaseHealthUrl(projectUrl), {
    method: 'GET',
    headers: {
      apikey: publishableKey,
    },
  })

  return response.ok
}
