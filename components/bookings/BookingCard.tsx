import Link from 'next/link'
import { User, Phone, Calendar, Clock, MapPin, UserCog } from 'lucide-react'
import { format } from 'date-fns'
import {
  SLOTS,
  isLongDistance,
  isLiveHold,
  showsDiscount,
  aedFromFils,
  type BookingWithInspector,
} from '@/lib/booking-types'
import {
  BookingStatusBadge,
  PaymentStatusBadge,
  ManualBookingTag,
  LongDistanceTag,
} from './BookingBadges'

/**
 * Scannable summary of one booking (the list view). The whole card links to the
 * detail page, which carries the full brief field set. Server-safe (no hooks).
 *
 * `isAdmin` defaults to true; pass false for an inspector's read-only job list,
 * which hides the payment/total/assignment row (no revenue, no other inspectors).
 */
export function BookingCard({
  booking: b,
  isAdmin = true,
}: {
  booking: BookingWithInspector
  isAdmin?: boolean
}) {
  const date = b.inspection_date
    ? format(new Date(`${b.inspection_date}T00:00:00`), 'd MMM')
    : ''
  const vehicle = [b.car_year, b.car_make, b.car_model].filter(Boolean).join(' ')

  return (
    <Link
      href={`/bookings/${b.id}`}
      className="card-base block p-4 transition-colors hover:border-border-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold text-accent">{b.id}</p>
            {isLiveHold(b) && (
              <span
                title="Live payment hold"
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-attention"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-base font-semibold text-text-primary">{vehicle}</p>
        </div>
        <BookingStatusBadge status={b.booking_status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <User size={14} className="text-text-muted" />
          {b.customer_name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Phone size={14} className="text-text-muted" />
          {b.customer_phone}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={14} className="text-text-muted" />
          {date}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={14} className="text-text-muted" />
          {SLOTS[b.slot_time]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} className="text-text-muted" />
          {b.emirate}
          {isLongDistance(b.emirate) && <LongDistanceTag />}
        </span>
      </div>

      {isAdmin && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <PaymentStatusBadge status={b.payment_status} />
            {b.manual_booking && <ManualBookingTag />}
            {showsDiscount(b) ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary">
                  {aedFromFils(b.amount_paid)}
                </span>
                <span className="text-xs text-text-muted line-through">AED {b.total_price}</span>
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  {b.promo_code ?? 'Discount'}
                </span>
              </span>
            ) : (
              <span className="text-sm font-semibold text-text-primary">AED {b.total_price}</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <UserCog size={13} />
            {b.inspector?.full_name ?? 'Unassigned'}
          </span>
        </div>
      )}
    </Link>
  )
}
