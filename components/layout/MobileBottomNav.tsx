'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, CalendarDays, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/reports', label: 'Reports', icon: FileText },
  // Visible to inspectors too — they get a read-only view of their assigned jobs.
  { href: '/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** App-like sticky bottom nav for phones. New Report lives in the Reports header. */
export function MobileBottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  // Hide on the report editor/preview — those have their own sticky action bars.
  if (/\/reports\/[^/]+\/(edit|preview)/.test(pathname)) return null

  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
      <div
        className={cn(
          'mx-auto grid max-w-md items-center px-2 pb-[env(safe-area-inset-bottom)] pt-1.5',
          items.length === 4 ? 'grid-cols-4' : 'grid-cols-3',
        )}
      >
        {items.map(({ adminOnly: _adminOnly, ...it }) => (
          <NavTab key={it.href} {...it} active={isActive(pathname, it.href)} />
        ))}
      </div>
    </nav>
  )
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function NavTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-[48px] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
        active ? 'text-accent' : 'text-text-muted hover:text-text-secondary',
      )}
    >
      <Icon size={20} />
      {label}
    </Link>
  )
}
