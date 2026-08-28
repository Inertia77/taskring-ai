import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'
import type { Project, Task } from '../models'
import {
  DailyPlanPublishError,
  type DailyPlan,
  type PublishDailyPlanInput,
  type PublishDailyPlanResult,
  type TodayPlanItem,
} from './models'

export interface DailyPlanRepository {
  getActivePlan(planDate: string): Promise<DailyPlan | null>
  getPlanItems(planId: string): Promise<TodayPlanItem[]>
  getCandidateTasks(): Promise<Task[]>
  publishPlan(input: PublishDailyPlanInput): Promise<PublishDailyPlanResult>
}

function publishError(message: string) {
  if (message.includes('Daily plan changed. Refresh before publishing again.')) {
    return new DailyPlanPublishError('stale', 'Today’s plan changed elsewhere. Refresh before publishing again.')
  }
  if (message.includes('Execution has started; replanning is not supported by this stage.')) {
    return new DailyPlanPublishError('execution-started', 'Execution has started; replanning is not supported by this stage.')
  }
  if (
    message.includes('Duplicate task') ||
    message.includes('Duplicate bucket position') ||
    message.includes('Invalid daily plan item') ||
    message.includes('One or more tasks are unavailable')
  ) {
    return new DailyPlanPublishError('validation', 'The plan contains an invalid or unavailable task. Refresh and review the plan.')
  }
  return new DailyPlanPublishError('server', 'Today’s plan could not be published. Please try again.')
}

export function createDailyPlanRepository(client: SupabaseClient<Database>, userId: string): DailyPlanRepository {
  return {
    async getActivePlan(planDate) {
      const { data, error } = await client
        .from('daily_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_date', planDate)
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data
    },

    async getPlanItems(planId) {
      const { data: items, error: itemError } = await client
        .from('daily_plan_items')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .order('position', { ascending: true })
      if (itemError) throw itemError
      if (!items?.length) return []

      const taskIds = [...new Set(items.map((item) => item.task_id))]
      const { data: tasks, error: taskError } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .in('id', taskIds)
      if (taskError) throw taskError

      const taskMap = new Map((tasks ?? []).map((task) => [task.id, task]))
      const projectIds = [...new Set((tasks ?? []).map((task) => task.project_id).filter((id): id is string => Boolean(id)))]
      let projects: Pick<Project, 'id' | 'title'>[] = []
      if (projectIds.length) {
        const { data, error } = await client
          .from('projects')
          .select('id,title')
          .eq('user_id', userId)
          .in('id', projectIds)
        if (error) throw error
        projects = data ?? []
      }
      const projectMap = new Map(projects.map((project) => [project.id, project]))

      return items.map((item) => {
        const task = taskMap.get(item.task_id)
        if (!task) throw new Error('A planned task is unavailable.')
        return {
          ...item,
          task,
          project: task.project_id ? projectMap.get(task.project_id) ?? null : null,
        }
      })
    },

    async getCandidateTasks() {
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },

    async publishPlan(input) {
      const { data, error } = await client.rpc('publish_daily_plan_v01', {
        p_plan_date: input.planDate,
        p_base_plan_id: input.basePlanId,
        p_items: input.items,
        p_capacity_minutes: input.capacityMinutes ?? null,
        p_capacity_breakdown: input.capacityBreakdown ?? null,
        p_brief: input.brief ?? null,
      })
      if (error) throw publishError(error.message)
      const result = data?.[0]
      if (!result) throw new DailyPlanPublishError('server', 'Today’s plan could not be published. Please try again.')
      return { planId: result.plan_id, revision: result.revision }
    },
  }
}
