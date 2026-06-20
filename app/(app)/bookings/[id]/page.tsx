import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { requireUser } from '@/lib/auth'
import { getBookingById, getActiveInspectors } from '@/lib/bookings-data'
import {
  SLOTS,
  STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  googleMapsUrl,
  isLongDistance,
  showsDiscount,
  aedFromFils,
} from '@/lib/booking-types'
import {
  BookingStatusBadge,
  PaymentStatusBadge,
  ManualBookingTag,
  LongDistanceTag,
} from '@/components/bookings/BookingBadges'
import { BookingDetailField } from '@/components/bookings/BookingDetailField'
import { BookingStatusStepper } from '@/components/bookings/BookingStatusStepper'
import { InspectorAssign } from '@/components/bookings/InspectorAssign'
import { BookingNotesEditor } from '@/components/bookings/BookingNotesEditor'
import { BookingReportAction } from '@/components/bookings/BookingReportAction'
import { CancelBookingButton } from '@/components/bookings/CancelBookingButton'

export const metadata = { title: 'Booking' }
export const dynamic = 'force-dynamic'

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Inspectors may open their own assigned job (read-only); RLS guarantees they
  // can't load anyone else's. Admins get the full management surface.
  const { profile } = await requireUser()
  const isAdmin = profile.role === 'admin'
  const { id } = await params
  const [booking, inspectors] = await Promise.all([
    getBookingById(id),
    isAdmin ? getActiveInspectors() : Promise.resolve([]),
  ])
  if (!booking) notFound()
  const b = booking

  const vehicle = [b.car_year, b.car_make, b.car_model].filter(Boolean).join(' ')
  const dateText = b.inspection_date
    ? format(new Date(`${b.inspection_date}T00:00:00`), 'EEE, d MMM yyyy')
    : '—'
  const paidText = b.paid_at ? format(new Date(b.paid_at), 'd MMM yyyy, HH:mm') : null

  return (
    <div className="space-y-5">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Bookings
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-accent break-all">{b.id}</p>
          <h1 className="mt-1 text-display-sm text-text-primary">{vehicle}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={b.booking_status} />
            {isAdmin && <PaymentStatusBadge status={b.payment_status} />}
            {isAdmin && b.manual_booking && <ManualBookingTag />}
            {isLongDistance(b.emirate) && <LongDistanceTag />}
          </div>
        </div>
        {isAdmin && <BookingReportAction bookingId={b.id} reportId={b.report_id} />}
      </div>

      {/* Pipeline (admin-managed; inspectors see status via the badge above) */}
      {isAdmin && <BookingStatusStepper bookingId={b.id} current={b.booking_status} />}

      <div className={cn('grid gap-5', isAdmin && 'lg:grid-cols-3')}>
        {/* Main column */}
        <div className={cn('space-y-5', isAdmin && 'lg:col-span-2')}>
          <section className="card-base p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Customer
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <BookingDetailField label="Name" value={b.customer_name} />
              <BookingDetailField label="Phone" value={b.customer_phone} href={`tel:${b.customer_phone}`} />
              <BookingDetailField
                label="Email"
                value={b.customer_email}
                href={b.customer_email ? `mailto:${b.customer_email}` : undefined}
              />
            </dl>
          </section>

          <section className="card-base p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Vehicle
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <BookingDetailField label="Make" value={b.car_make} />
              <BookingDetailField label="Model" value={b.car_model} />
              <BookingDetailField label="Year" value={b.car_year} />
              <BookingDetailField label="VIN / chassis" value={b.vin} mono />
              <BookingDetailField label="Plate number" value={b.plate_number} />
            </dl>
          </section>

          <section className="card-base p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Location
              </h2>
              <a
                href={googleMapsUrl(b)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
              >
                <ExternalLink size={14} /> Open in Maps
              </a>
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <BookingDetailField label="Emirate" value={b.emirate} />
              <BookingDetailField
                label="Parking"
                value={b.parking_type ? PARKING_LABELS[b.parking_type] : null}
              />
              <BookingDetailField label="Address" value={b.address} />
              {b.additional_notes && (
                <BookingDetailField label="Customer notes" value={b.additional_notes} />
              )}
            </dl>
          </section>

          <section className="card-base p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              {isAdmin ? 'Schedule & payment' : 'Schedule'}
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <BookingDetailField label="Date" value={dateText} />
              <BookingDetailField label="Time slot" value={SLOTS[b.slot_time]} />
              <BookingDetailField
                label="Package"
                value={isAdmin ? `${b.package_name} — AED ${b.package_price}` : b.package_name}
              />
              {isAdmin && (
                <>
                  <BookingDetailField
                    label="Travel fee"
                    value={b.travel_fee > 0 ? `AED ${b.travel_fee}` : 'None'}
                  />
                  <BookingDetailField
                    label={showsDiscount(b) ? 'List total' : 'Total'}
                    value={`AED ${b.total_price}`}
                  />
                  {showsDiscount(b) && (
                    <>
                      {b.promo_code && (
                        <BookingDetailField label="Promo code" value={b.promo_code} mono />
                      )}
                      <BookingDetailField label="Discount" value={`− ${aedFromFils(b.discount_amount)}`} />
                      <BookingDetailField label="Amount paid" value={aedFromFils(b.amount_paid)} />
                    </>
                  )}
                  <BookingDetailField label="Payment" value={PAYMENT_STATUS_LABELS[b.payment_status]} />
                  <BookingDetailField label="Booking status" value={STATUS_LABELS[b.booking_status]} />
                  {paidText && <BookingDetailField label="Paid at" value={paidText} />}
                </>
              )}
            </dl>
          </section>
        </div>

        {/* Right rail — admin controls only */}
        {isAdmin && (
          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <section className="card-base p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Assigned inspector
              </h2>
              <InspectorAssign bookingId={b.id} current={b.assigned_inspector} inspectors={inspectors} />
            </section>

            <section className="card-base p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Internal notes
              </h2>
              <BookingNotesEditor bookingId={b.id} initial={b.admin_notes ?? ''} />
            </section>

            <CancelBookingButton
              bookingId={b.id}
              reference={b.id}
              status={b.booking_status}
              paid={b.payment_status === 'paid'}
            />
          </aside>
        )}
      </div>
    </div>
  )
}

const PARKING_LABELS: Record<string, string> = {
  showroom: 'Showroom',
  outdoor: 'Outdoor parking',
  home: "Seller's home",
}
