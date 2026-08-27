import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

function browserPreferences() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const locale = typeof navigator === 'undefined' ? null : navigator.language || null

  return { timezone, locale }
}

export async function ensureProfile(
  client: SupabaseClient<Database>,
  session: Session,
): Promise<void> {
  const userId = session.user.id
  const { data, error: readError } = await client
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) {
    throw readError
  }

  if (data) {
    return
  }

  const { timezone, locale } = browserPreferences()
  const { error: insertError } = await client.from('profiles').insert({
    user_id: userId,
    timezone,
    locale,
  })

  if (insertError && insertError.code !== '23505') {
    throw insertError
  }
}
