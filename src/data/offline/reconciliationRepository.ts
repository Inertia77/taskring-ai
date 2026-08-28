import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import type { OfflineCommand } from './models'

export interface OfflineServerReconciliationRepository {
  assertAcknowledged(command: OfflineCommand): Promise<void>
}

export function createOfflineServerReconciliationRepository(
  client: SupabaseClient<Database>,
  userId: string,
): OfflineServerReconciliationRepository {
  return {
    async assertAcknowledged(command) {
      if (command.user_id !== userId) {
        throw new Error('Local command owner does not match the authenticated user.')
      }

      if (command.command_type === 'record_task_action_v01') {
        if (!command.event_id) throw new Error('Stored execution command has no Event UUID.')
        const { data, error } = await client
          .from('task_events')
          .select('id')
          .eq('user_id', userId)
          .eq('id', command.event_id)
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error('Authoritative Event readback did not find the acknowledged command.')
        return
      }

      if (!command.feedback_id) throw new Error('Stored feedback command has no Feedback UUID.')
      const { data, error } = await client
        .from('user_feedback')
        .select('id')
        .eq('user_id', userId)
        .eq('id', command.feedback_id)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Authoritative Feedback readback did not find the acknowledged command.')
    },
  }
}
