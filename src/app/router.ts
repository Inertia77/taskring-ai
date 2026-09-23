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

const BASE_PATH = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '')

function toAppPath(pathname: string) {
  if (!BASE_PATH) return pathname
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) return '/'
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length)
  return pathname
}

function toBrowserPath(pathname: string) {
  if (!BASE_PATH) return pathname
  return pathname === '/' ? `${BASE_PATH}/` : `${BASE_PATH}${pathname}`
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? pathname
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery
}

export function resolveAppRoute(pathname: string): ResolvedAppRoute {
  const normalized = normalizePath(toAppPath(pathname))
  const matched = PRIMARY_ROUTES.find((route) => route.path === normalized)

  if (matched) {
    return { key: matched.key, path: matched.path, redirectTo: null }
  }

  return { key: 'today', path: '/today', redirectTo: '/today' }
}

export function useAppRouter() {
  const [pathname, setPathname] = useState(() => toAppPath(window.location.pathname))
  const resolved = useMemo(() => resolveAppRoute(pathname), [pathname])

  useEffect(() => {
    if (!resolved.redirectTo) return
    const targetPath = toBrowserPath(resolved.redirectTo)
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath)
    }
  }, [resolved.redirectTo])

  useEffect(() => {
    const handlePopState = () => setPathname(toAppPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath: AppRoutePath) => {
    const targetPath = toBrowserPath(nextPath)
    if (window.location.pathname === targetPath) return
    window.history.pushState(null, '', targetPath)
    setPathname(nextPath)
  }, [])

  return { ...resolved, navigate }
}
