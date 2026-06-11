import Link from 'next/link'
import { Plus, FileText, CalendarDays, ArrowRight } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { getDashboardStats, getRecentReports } from '@/lib/data'
import { getBookingStats, getUpcomingBookings, type BookingStats } from '@/lib/bookings-data'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { BookingStatsCards } from '@/components/bookings/BookingStatsCards'
import { UpcomingBookings } from '@/components/bookings/UpcomingBookings'
import { ReportCard } from '@/components/reports/ReportCard'
import type { BookingWithInspector } from '@/lib/booking-types'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { profile } = await requireUser()
  const isAdmin = profile.role === 'admin'
  const [stats, recent, bookingStats, upcoming] = await Promise.all([
    getDashboardStats(),
    getRecentReports(6),
    isAdmin ? getBookingStats() : Promise.resolve<BookingStats | null>(null),
    isAdmin ? getUpcomingBookings(5) : Promise.resolve<BookingWithInspector[]>([]),
  ])
  const firstName = profile.full_name.split(' ')[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-text-secondary">Welcome back,</p>
          <h1 className="text-display-sm text-text-primary">{firstName}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link href="/bookings" className="btn-secondary">
              <CalendarDays size={18} />
              <span className="hidden sm:inline">Bookings</span>
            </Link>
          )}
          <Link href="/reports" className="btn-secondary">
            <FileText size={18} />
            <span className="hidden sm:inline">View Reports</span>
          </Link>
          <Link href="/reports/new" className="btn-primary">
            <Plus size={18} />
            <span className="hidden sm:inline">New Report</span>
          </Link>
        </div>
      </div>

      <DashboardStats stats={stats} />

      {isAdmin && bookingStats && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Bookings</h2>
            <Link
              href="/bookings"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <BookingStatsCards stats={bookingStats} />
          <div className="mt-3">
            <UpcomingBookings bookings={upcoming} />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent reports</h2>
          {recent.length > 0 && (
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
            >
              View all <ArrowRight size={15} />
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card-base flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-muted text-accent">
        <FileText size={26} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-text-primary">No reports yet</h3>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">
        Create your first inspection report to get started.
      </p>
      <Link href="/reports/new" className="btn-primary mt-5">
        <Plus size={18} />
        New Report
      </Link>
    </div>
  )
}
