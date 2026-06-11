import { CalendarClock, CalendarDays, PhoneCall } from 'lucide-react'
import type { BookingStats } from '@/lib/bookings-data'

const CARDS = [
  { key: 'today', label: 'Inspections today', icon: CalendarClock, tone: 'text-accent' },
  { key: 'upcoming', label: 'Next 7 days', icon: CalendarDays, tone: 'text-sky-400' },
  { key: 'newPaid', label: 'Paid · awaiting call', icon: PhoneCall, tone: 'text-attention' },
] as const

/** Booking summary stat cards — mirrors the reports DashboardStats look. */
export function BookingStatsCards({ stats }: { stats: BookingStats }) {
  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
      {CARDS.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className="card-base p-4">
          <Icon size={18} className={tone} />
          <p className="mt-3 text-3xl font-bold tabular-nums text-text-primary">{stats[key]}</p>
          <p className="mt-0.5 text-xs font-medium text-text-secondary">{label}</p>
        </div>
      ))}
    </div>
  )
}
