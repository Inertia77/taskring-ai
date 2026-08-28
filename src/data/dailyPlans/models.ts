import type { Database, Json } from '../../types/database.types'
import type { Project, Task } from '../models'

export type DailyPlan = Database['public']['Tables']['daily_plans']['Row']
export type DailyPlanItem = Database['public']['Tables']['daily_plan_items']['Row']
export type TaskEvent = Database['public']['Tables']['task_events']['Row']

export const TODAY_BUCKETS = [
  { value: 'must', label: '🔥 MUST' },
  { value: 'should', label: '⭐ SHOULD' },
  { value: 'main_quest', label: '🌙 MAIN QUEST' },
  { value: 'flex', label: '🪶 FLEX' },
  { value: 'routine', label: '🔁 ROUTINE' },
  { value: 'game', label: '🎮 GAME' },
  { value: 'bonus', label: '💭 BONUS' },
] as const

export type TodayBucket = (typeof TODAY_BUCKETS)[number]['value']

export interface TodayPlanItem extends DailyPlanItem {
  task: Task
  project: Pick<Project, 'id' | 'title'> | null
  latestEvent: TaskEvent | null
}

export interface ActiveTodayPlan {
  plan: DailyPlan
  items: TodayPlanItem[]
}

export interface PublishPlanItemInput {
  task_id: string
  bucket: TodayBucket
  position: number
  planned_minutes: number | null
  reason: string | null
}

export interface PublishDailyPlanInput {
  planDate: string
  basePlanId: string | null
  items: PublishPlanItemInput[]
  capacityMinutes?: number | null
  capacityBreakdown?: Json | null
  brief?: string | null
}

export interface PublishDailyPlanResult {
  planId: string
  revision: number
}

export type DailyPlanPublishErrorKind = 'stale' | 'execution-started' | 'validation' | 'server'

export class DailyPlanPublishError extends Error {
  readonly kind: DailyPlanPublishErrorKind

  constructor(kind: DailyPlanPublishErrorKind, message: string) {
    super(message)
    this.name = 'DailyPlanPublishError'
    this.kind = kind
  }
}

export function isTodayBucket(value: string): value is TodayBucket {
  return TODAY_BUCKETS.some((bucket) => bucket.value === value)
}
