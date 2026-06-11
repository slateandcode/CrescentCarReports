import Link from 'next/link'
import { ProductLogo } from '@/components/ui/Logo'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { DesktopNav } from './DesktopNav'
import { IS_DEMO } from '@/lib/env'
import type { InspectorProfile } from '@/lib/report-types'

export function TopBar({ profile }: { profile: InspectorProfile }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" aria-label="Dashboard">
          <ProductLogo />
        </Link>

        <DesktopNav isAdmin={profile.role === 'admin'} />

        <div className="ml-auto flex items-center gap-3">
          {IS_DEMO && (
            <span className="hidden rounded-tag border border-accent/30 bg-accent-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent sm:inline">
              Preview mode
            </span>
          )}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight text-text-primary">{profile.full_name}</p>
            <p className="text-xs capitalize leading-tight text-text-muted">{profile.role}</p>
          </div>
          <LogoutButton className="hidden sm:inline-flex" />
          {/* Icon-only logout for phones (the name/role + full button are sm+ only). */}
          <LogoutButton label="" className="w-11 justify-center sm:hidden" />
        </div>
      </div>
    </header>
  )
}
