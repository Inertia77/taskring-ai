import { QueryClient } from '@tanstack/react-query'

export function createTaskRingQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

export const queryClient = createTaskRingQueryClient()
