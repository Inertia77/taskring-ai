export const managementQueryKeys = {
  root: (userId: string) => ['management', userId] as const,
  tasks: (userId: string) => ['management', userId, 'tasks'] as const,
  projects: (userId: string) => ['management', userId, 'projects'] as const,
}

export const todayQueryKeys = {
  root: (userId: string) => ['today', userId] as const,
  plan: (userId: string, planDate: string) => ['today', userId, planDate, 'plan'] as const,
  candidates: (userId: string, planDate: string) => ['today', userId, planDate, 'candidates'] as const,
}

export const historyQueryKeys = {
  root: (userId: string) => ['history', userId] as const,
  events: (userId: string) => ['history', userId, 'events'] as const,
  feedback: (userId: string) => ['history', userId, 'feedback'] as const,
}
