import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone, CalendarDays, Clock, FileText, type LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { requireAdmin } from '@/lib/auth'
import { getMemberById, getMemberReportCount } from '@/lib/team-data'
import { getInspectorBookings } from '@/lib/bookings-data'
import { BookingCard } from '@/components/bookings/BookingCard'
import { MemberActions } from '@/components/settings/MemberActions'
import { RoleBadge, MemberStatusBadge } from '@/components/settings/MemberBadges'

export const metadata = { title: 'Team member' }
export const dynamic = 'force-dynamic'

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  const { id } = await params
  const [member, bookings, reportCount] = await Promise.all([
    getMemberById(id),
    getInspectorBookings(id),
    getMemberReportCount(id),
  ])
  if (!member) notFound()
  const isSelf = member.id === session.id

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Settings
      </Link>

      {/* Profile header */}
      <section className="card-base p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-card text-xl font-semibold uppercase text-text-secondary">
            {(member.full_name || member.email).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-bold text-text-primary">{member.full_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={member.role} />
              <MemberStatusBadge status={member.status} />
              {isSelf && <span className="text-xs text-text-muted">(you)</span>}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
          <DetailField icon={Mail} label="Email" value={member.email} href={`mailto:${member.email}`} />
          <DetailField
            icon={Phone}
            label="Phone"
            value={member.phone || '—'}
            href={member.phone ? `tel:${member.phone}` : undefined}
          />
          <DetailField
            icon={CalendarDays}
            label="Member since"
            value={format(new Date(member.created_at), 'd MMM yyyy')}
          />
          <DetailField
            icon={Clock}
            label="Last active"
            value={member.last_activity_at ? format(new Date(member.last_activity_at), 'd MMM yyyy, HH:mm') : '—'}
          />
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <Stat icon={FileText} label="Reports" value={reportCount} />
          <Stat icon={CalendarDays} label="Assigned jobs" value={bookings.length} />
        </div>
      </section>

      {/* Assigned bookings */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Assigned bookings
        </h2>
        {bookings.length === 0 ? (
          <div className="card-base px-6 py-8 text-center text-sm text-text-secondary">
            No bookings assigned to this member.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      {/* Access — kick / reactivate */}
      <section className="card-base p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Access</h2>
        <p className="mb-3 mt-1 text-sm text-text-secondary">
          {member.status === 'active'
            ? 'Kicking a member immediately revokes their access and stops them signing back in. You can reactivate them later.'
            : 'This member is suspended and cannot sign in. Reactivate to restore their access.'}
        </p>
        <MemberActions memberId={member.id} status={member.status} isSelf={isSelf} />
      </section>
    </div>
  )
}

function DetailField({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon
  label: string
  value: string
  href?: string
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <Icon size={13} /> {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-text-primary">
        {href ? (
          <a href={href} className="hover:text-accent">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-input border border-border bg-surface p-3">
      <Icon size={16} className="text-accent" />
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-text-primary">{value}</p>
      <p className="text-xs font-medium text-text-secondary">{label}</p>
    </div>
  )
}
