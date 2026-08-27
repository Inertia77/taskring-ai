import { useCallback, useEffect, useMemo, useState } from 'react'

export const PRIMARY_ROUTES = [
  { key: 'today', path: '/today', label: 'Today' },
  { key: 'inbox', path: '/inbox', label: 'Inbox' },
  { key: 'tasks', path: '/tasks', label: 'Tasks' },
  { key: 'history', path: '/history', label: 'History' },
  { key: 'settings', path: '/settings', label: 'Settings' },
] as const

export type AppRouteKey = (typeof PRIMARY_ROUTES)[number]['key']
export type AppRoutePath = (typeof PRIMARY_ROUTES)[number]['path']

export interface ResolvedAppRoute {
  key: AppRouteKey
  path: AppRoutePath
  redirectTo: AppRoutePath | null
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? pathname
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery
}

export function resolveAppRoute(pathname: string): ResolvedAppRoute {
  const normalized = normalizePath(pathname)
  const matched = PRIMARY_ROUTES.find((route) => route.path === normalized)

  if (matched) {
    return { key: matched.key, path: matched.path, redirectTo: null }
  }

  return { key: 'today', path: '/today', redirectTo: '/today' }
}

export function useAppRouter() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const resolved = useMemo(() => resolveAppRoute(pathname), [pathname])

  useEffect(() => {
    if (resolved.redirectTo && window.location.pathname !== resolved.redirectTo) {
      window.history.replaceState(null, '', resolved.redirectTo)
    }
  }, [resolved.redirectTo])

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath: AppRoutePath) => {
    if (window.location.pathname === nextPath) return
    window.history.pushState(null, '', nextPath)
    setPathname(nextPath)
  }, [])

  return { ...resolved, navigate }
}
