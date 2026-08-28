import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import type { Project, ProjectCreateInput, ProjectUpdateInput } from '../models'

export interface ProjectRepository {
  list(): Promise<Project[]>
  create(input: ProjectCreateInput): Promise<Project>
  update(projectId: string, input: ProjectUpdateInput): Promise<Project>
  cancel(projectId: string): Promise<Project>
}

export function createProjectRepository(client: SupabaseClient<Database>, userId: string): ProjectRepository {
  return {
    async list() {
      const { data, error } = await client
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return [...(data ?? [])].sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'))
    },

    async create(input) {
      const { data, error } = await client
        .from('projects')
        .insert({
          user_id: userId,
          goal_id: null,
          title: input.title,
          status: 'active',
          priority_hint: input.priorityHint,
          target_date: input.targetDate,
          notes: input.notes,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async update(projectId, input) {
      const { data, error } = await client
        .from('projects')
        .update({
          title: input.title,
          status: input.status,
          priority_hint: input.priorityHint,
          target_date: input.targetDate,
          notes: input.notes,
        })
        .eq('id', projectId)
        .eq('user_id', userId)
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async cancel(projectId) {
      const { data, error } = await client
        .from('projects')
        .update({ status: 'cancelled' })
        .eq('id', projectId)
        .eq('user_id', userId)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  }
}
