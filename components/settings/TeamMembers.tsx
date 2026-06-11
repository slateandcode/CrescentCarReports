import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getTeamMembers } from '@/lib/team-data'
import { RoleBadge, MemberStatusBadge } from './MemberBadges'

/** Admin-only team roster on the settings page. Each row links to the member's
 *  profile (name/email/role + assigned bookings + kick control). */
export async function TeamMembers({ currentUserId }: { currentUserId: string }) {
  const members = await getTeamMembers()

  return (
    <section className="card-base p-5">
      <h2 className="text-lg font-semibold text-text-primary">Team members</h2>
      <p className="mb-3 mt-0.5 text-sm text-text-secondary">
        Everyone with access. Tap a member to see their profile and assigned jobs.
      </p>

      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/settings/members/${m.id}`}
              className="flex items-center gap-3 py-3 transition-opacity hover:opacity-80"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-sm font-semibold uppercase text-text-secondary">
                {(m.full_name || m.email).slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">
                  {m.full_name}
                  {m.id === currentUserId && (
                    <span className="ml-1.5 text-xs font-normal text-text-muted">(you)</span>
                  )}
                </p>
                <p className="truncate text-sm text-text-secondary">{m.email}</p>
              </div>
              {m.status === 'suspended' && <MemberStatusBadge status="suspended" />}
              <RoleBadge role={m.role} />
              <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
