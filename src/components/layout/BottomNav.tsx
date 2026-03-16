import { NavLink } from 'react-router-dom'
import { Search, Home, Library, Settings } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { isAuthenticatedAtom } from '@/stores/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/feed', icon: Home, label: 'Главная', authRequired: true },
  { to: '/search', icon: Search, label: 'Поиск', authRequired: false },
  { to: '/library', icon: Library, label: 'Библиотека', authRequired: true },
  { to: '/settings', icon: Settings, label: 'Настройки', authRequired: false },
]

export default function BottomNav() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const items = navItems.filter(item => !item.authRequired || isAuthenticated)

  return (
    <nav className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none bottom-nav-safe">
      <div className="pointer-events-auto flex items-center gap-1 bg-card/80 backdrop-blur-2xl border border-border/50 rounded-full px-2 py-2 shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) => cn(
              'flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95'
            )}
          >
            {({ isActive }) => (
              <Icon
                className={cn('w-5 h-5 transition-all', isActive && 'text-primary')}
                strokeWidth={isActive ? 2.5 : 2}
              />
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
