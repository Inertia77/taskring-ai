import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import type { TaskEvent, UserFeedback } from '../execution/models'

export interface HistoryEvent extends TaskEvent {
  taskTitle: string
}

export interface HistoryFeedback extends UserFeedback {
  taskTitle: string | null
}

export interface HistoryRepository {
  listRecentEvents(limit?: number): Promise<HistoryEvent[]>
  listRecentFeedback(limit?: number): Promise<HistoryFeedback[]>
}

export function createHistoryRepository(client: SupabaseClient<Database>, userId: string): HistoryRepository {
  return {
    async listRecentEvents(limit = 100) {
      const { data: events, error } = await client
        .from('task_events')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      if (!events?.length) return []

      const taskIds = [...new Set(events.map((event) => event.task_id))]
      const { data: tasks, error: taskError } = await client
        .from('tasks')
        .select('id,title')
        .eq('user_id', userId)
        .in('id', taskIds)
      if (taskError) throw taskError
      const taskMap = new Map((tasks ?? []).map((task) => [task.id, task.title]))

      return events.map((event) => ({
        ...event,
        taskTitle: taskMap.get(event.task_id) ?? 'Unavailable task',
      }))
    },

    async listRecentFeedback(limit = 50) {
      const { data: feedback, error } = await client
        .from('user_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      if (!feedback?.length) return []

      const taskIds = [...new Set(feedback.map((item) => item.task_id).filter((id): id is string => Boolean(id)))]
      let taskMap = new Map<string, string>()
      if (taskIds.length) {
        const { data: tasks, error: taskError } = await client
          .from('tasks')
          .select('id,title')
          .eq('user_id', userId)
          .in('id', taskIds)
        if (taskError) throw taskError
        taskMap = new Map((tasks ?? []).map((task) => [task.id, task.title]))
      }

      return feedback.map((item) => ({
        ...item,
        taskTitle: item.task_id ? taskMap.get(item.task_id) ?? 'Unavailable task' : null,
      }))
    },
  }
}
