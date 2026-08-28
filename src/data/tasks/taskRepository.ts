import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import type { Task, TaskCreateInput, TaskUpdateInput } from '../models'

export interface TaskRepository {
  list(): Promise<Task[]>
  create(input: TaskCreateInput): Promise<Task>
  update(taskId: string, input: TaskUpdateInput): Promise<Task>
  cancel(taskId: string): Promise<Task>
}

export function createTaskRepository(client: SupabaseClient<Database>, userId: string): TaskRepository {
  return {
    async list() {
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return [...(data ?? [])].sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'))
    },

    async create(input) {
      const { data, error } = await client
        .from('tasks')
        .insert({
          user_id: userId,
          title: input.title,
          description: input.description,
          project_id: input.projectId,
          priority_hint: input.priorityHint,
          due_at: input.dueAt,
          not_before: input.notBefore,
          estimate_minutes: input.estimateMinutes,
          status: 'active',
          task_kind: input.taskKind,
          execution_context: input.executionContext,
          created_by: 'user',
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async update(taskId, input) {
      const { data, error } = await client
        .from('tasks')
        .update({
          title: input.title,
          description: input.description,
          project_id: input.projectId,
          priority_hint: input.priorityHint,
          due_at: input.dueAt,
          not_before: input.notBefore,
          estimate_minutes: input.estimateMinutes,
          remaining_minutes: input.remainingMinutes,
          execution_context: input.executionContext,
          task_kind: input.taskKind,
          status: input.status,
        })
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async cancel(taskId) {
      const { data, error } = await client
        .from('tasks')
        .update({ status: 'cancelled' })
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  }
}
