import type { MouseEvent } from 'react'
import { PRIMARY_ROUTES, type AppRouteKey, type AppRoutePath } from '../../app/router'

interface BottomNavigationProps {
  activeRoute: AppRouteKey
  onNavigate: (path: AppRoutePath) => void
}

function NavIcon({ route }: { route: AppRouteKey }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (route) {
    case 'today':
      return <svg {...common}><path d="M7 3v3M17 3v3M4.5 8.5h15M5 5.5h14v15H5z" /><path d="m9 14 2 2 4-4" /></svg>
    case 'inbox':
      return <svg {...common}><path d="M4 5h16l-1.5 14h-13z" /><path d="M4.8 13h4l1.2 2h4l1.2-2h4" /></svg>
    case 'tasks':
      return <svg {...common}><path d="M8 6h11M8 12h11M8 18h11" /><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17" /></svg>
    case 'history':
      return <svg {...common}><path d="M4 5v5h5" /><path d="M5.7 16.4A8 8 0 1 0 5 9" /><path d="M12 8v5l3 2" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.8 2h-3l-.7 2.3a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.7L0 10.5v3l2.3.7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2.3h3l.7-2.3a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7z" transform="translate(2.2 0) scale(.82)" /></svg>
  }
}

export function BottomNavigation({ activeRoute, onNavigate }: BottomNavigationProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, path: AppRoutePath) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(path)
  }

  return (
    <nav className="bottom-navigation" aria-label="Primary">
      <div className="bottom-navigation-inner">
        {PRIMARY_ROUTES.map((route) => (
          <a
            key={route.key}
            className="bottom-navigation-item"
            href={route.path}
            aria-current={activeRoute === route.key ? 'page' : undefined}
            data-primary-nav-item
            onClick={(event) => handleClick(event, route.path)}
          >
            <NavIcon route={route.key} />
            <span>{route.label}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
