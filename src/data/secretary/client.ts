import type { SupabaseClient } from '@supabase/supabase-js'
import { parseChatOperation, type ChatOperation } from '../../../supabase/functions/secretary-api/chat-contract'
import type { Database } from '../../types/database.types'

export type InboxItem = Omit<Database['public']['Tables']['inbox_items']['Row'], 'user_id' | 'resolved_at'>
export type InboxResult = { item?: InboxItem; items?: InboxItem[]; next_offset?: number | null;
  inbox_item_id?: string; created?: boolean }

// The host owns session acquisition/refresh. The AI supplies only a validated command.
// It never receives the Supabase client, JWT, or arbitrary query capability.
export function createSecretaryClient(client: SupabaseClient<Database>) {
  return async (input: ChatOperation): Promise<InboxResult> => {
    const parsed = parseChatOperation(input)
    if (!parsed.ok) throw new Error(parsed.message)
    const { data, error } = await client.functions.invoke('secretary-api', { body: parsed.value })
    if (error) {
      const status = error.context instanceof Response ? error.context.status : 0
      if (status === 401) throw new Error('Sign in again before continuing.')
      if (status === 409) throw new Error('This item changed. Reload and review it again.')
      if (status === 400 || status === 413) throw new Error('Check the capture fields and size.')
      throw new Error('Request not confirmed. Reload before retrying a review; reuse the same capture ID for capture retries.')
    }
    if (!data || data.ok !== true || typeof data.result !== 'object' || data.result === null) {
      throw new Error('The server did not confirm this request.')
    }
    return data.result as InboxResult
  }
}
export type SecretaryClient = ReturnType<typeof createSecretaryClient>
