export const managementQueryKeys = {
  root: (userId: string) => ['management', userId] as const,
  tasks: (userId: string) => ['management', userId, 'tasks'] as const,
  projects: (userId: string) => ['management', userId, 'projects'] as const,
}
