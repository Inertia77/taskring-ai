import type { ActiveTodayPlan, TodayPlanItem } from '../dailyPlans/models'
import type { TaskAction } from '../execution/models'
import { isExecutionCommand, type OfflineCommand } from './models'

function targetState(action: TaskAction) {
  return action === 'reopened' ? 'started' : action
}

function projectItem(item: TodayPlanItem, command: OfflineCommand): TodayPlanItem {
  if (!isExecutionCommand(command) || !command.action) return item

  const nextState = targetState(command.action)
  let task = item.task

  if (command.action === 'partial' && command.remaining_minutes !== null) {
    task = { ...task, remaining_minutes: command.remaining_minutes }
  } else if (command.action === 'done') {
    task = {
      ...task,
      status: 'done',
      completed_at: command.occurred_at,
      remaining_minutes: 0,
    }
  } else if (command.action === 'blocked') {
    task = { ...task, status: 'blocked' }
  } else if (command.action === 'cancelled') {
    task = { ...task, status: 'cancelled' }
  } else if (command.action === 'reopened') {
    task = { ...task, status: 'active', completed_at: null }
  }

  return {
    ...item,
    current_state: nextState,
    task,
  }
}

export function applyOptimisticProjection(
  plan: ActiveTodayPlan | null,
  commands: OfflineCommand[],
): ActiveTodayPlan | null {
  if (!plan) return null
  const relevant = commands
    .filter((command) => command.plan_date === plan.plan.plan_date && isExecutionCommand(command))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

  if (!relevant.length) return plan

  const items = plan.items.map((item) => {
    let projected = item
    for (const command of relevant) {
      if (command.plan_item_id === item.id) projected = projectItem(projected, command)
    }
    return projected
  })

  return { ...plan, items }
}

export function commandsForPlanItem(commands: OfflineCommand[], planItemId: string) {
  return commands
    .filter((command) => command.plan_item_id === planItemId)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
}

export function commandDisplayAction(command: OfflineCommand) {
  if (command.command_type === 'add_plan_item_feedback_v01') return 'Feedback'
  if (!command.action) return 'Execution action'
  return command.action === 'reopened'
    ? 'Reopen'
    : command.action.charAt(0).toUpperCase() + command.action.slice(1)
}
