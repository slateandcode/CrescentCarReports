'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import { getSessionUser } from '@/lib/auth'
import { generatePublicId } from '@/lib/utils'
import { computeCounts } from '@/lib/report-utils'
import { PACKAGES } from '@/lib/report-templates'
import { EMIRATES } from '@/lib/options'
import {
  BOOKING_STATUSES,
  SLOTS,
  isLongDistance,
  type Booking,
  type BookingStatus,
  type PaymentStatus,
  type SlotTime,
} from '@/lib/booking-types'
import type { PackageType } from '@/lib/report-types'

export interface BookingActionResult {
  ok: boolean
  error?: string
  /** New booking reference (createManualBooking). */
  id?: string
}

const DEMO_ERROR = 'Preview mode — connect Supabase to manage bookings.'

/** Admin gate shared by every booking write. Returns null with no session/role. */
async function requireAdminSession() {
  const session = await getSessionUser()
  if (!session || session.profile.role !== 'admin') return null
  return session
}

function revalidateBooking(id?: string) {
  revalidatePath('/bookings')
  revalidatePath('/bookings/schedule')
  if (id) revalidatePath(`/bookings/${id}`)
  revalidatePath('/dashboard')
}

/**
 * Admin: move a booking along the §9 pipeline. Choosing 'cancelled' stamps
 * cancelled_at and flips a 'paid' payment to 'refunded' (the status label
 * covers both Cancelled and Refunded).
 */
export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  if (!BOOKING_STATUSES.includes(status)) return { ok: false, error: 'Invalid status.' }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can update bookings.' }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('bookings')
    .select('payment_status, booking_status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Booking not found.' }

  const update: Record<string, unknown> = { booking_status: status }
  if (status === 'cancelled') {
    update.cancelled_at = new Date().toISOString()
    if (existing.payment_status === 'paid') update.payment_status = 'refunded'
  } else if (existing.booking_status === 'cancelled') {
    // Reopening a cancelled booking: clear the cancellation stamp and undo the
    // exact paid→refunded flip the cancel did (only that — a booking cancelled
    // while pending/failed/manual keeps whatever payment status it had).
    update.cancelled_at = null
    if (existing.payment_status === 'refunded') update.payment_status = 'paid'
  }

  const { error } = await supabase.from('bookings').update(update).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateBooking(id)
  return { ok: true }
}

/** Admin: reassign (or unassign) the booking's inspector. */
export async function assignBookingInspector(
  id: string,
  inspectorId: string | null,
): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can reassign bookings.' }

  const supabase = await createClient()

  // Unassign (null) is always allowed. Otherwise the target must resolve to an
  // ACTIVE inspector/admin profile — a suspended or unknown id would silently
  // assign work to someone who can no longer access the report (mirrors the
  // status='active' filter in getActiveInspectors / confirm_booking_paid).
  if (inspectorId) {
    const { data: inspector } = await supabase
      .from('inspector_profiles')
      .select('id, role, status')
      .eq('id', inspectorId)
      .maybeSingle()
    if (!inspector || inspector.status !== 'active' || (inspector.role !== 'inspector' && inspector.role !== 'admin')) {
      return { ok: false, error: 'Pick an active inspector.' }
    }
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ assigned_inspector: inspectorId })
    .eq('id', id)
    .select('report_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }

  // Keep the linked report's owner in sync so the newly-assigned inspector can
  // open/edit it (reports RLS is own-or-admin — otherwise they'd be locked out
  // while the previous inspector keeps access). Leave a COMPLETED report's
  // authored-by attribution (shown on the delivered PDF) untouched.
  if (updated?.report_id) {
    const { data: report } = await supabase
      .from('inspection_reports')
      .select('status')
      .eq('id', updated.report_id)
      .maybeSingle()
    if (report && report.status !== 'completed') {
      const { error: syncErr } = await supabase
        .from('inspection_reports')
        .update({ inspector_id: inspectorId })
        .eq('id', updated.report_id)
      if (syncErr) {
        // The booking was reassigned but the report's owner didn't follow — log
        // it so a transient failure (which would re-lock the new inspector out
        // of the report) is observable rather than silent.
        console.error('[bookings] failed to sync report inspector after reassignment', {
          reportId: updated.report_id,
          error: syncErr.message,
        })
      }
    }
  }

  revalidateBooking(id)
  return { ok: true }
}

/** Admin: save the internal notes on a booking. */
export async function saveBookingAdminNotes(
  id: string,
  notes: string,
): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can edit booking notes.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .update({ admin_notes: notes.trim() || null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateBooking(id)
  return { ok: true }
}

/** Admin: manually block a free slot (e.g. day off, travel, maintenance). */
export async function blockSlot(
  date: string,
  slot: SlotTime,
  reason: string,
): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  if (!SLOTS[slot]) return { ok: false, error: 'Invalid slot.' }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can block slots.' }

  const supabase = await createClient()
  const { error } = await supabase.from('slot_blocks').insert({
    block_date: date,
    slot_time: slot,
    reason: reason.trim() || null,
    created_by: session.id,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That slot is already blocked.' }
    return { ok: false, error: error.message }
  }

  revalidateBooking()
  return { ok: true }
}

/** Admin: remove a manual slot block. */
export async function unblockSlot(blockId: string): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can unblock slots.' }

  const supabase = await createClient()
  const { error } = await supabase.from('slot_blocks').delete().eq('id', blockId)
  if (error) return { ok: false, error: error.message }

  revalidateBooking()
  return { ok: true }
}

export interface ManualBookingInput {
  customer_name: string
  customer_phone: string
  customer_email: string
  emirate: string
  address: string
  car_make: string
  car_model: string
  car_year: string
  vin: string
  plate_number: string
  inspection_date: string
  slot_time: SlotTime
  package_id: PackageType
  total_price: number
  payment_status: PaymentStatus
  assigned_inspector: string | null
  admin_notes: string
}

const MANUAL_PAYMENT_STATUSES: PaymentStatus[] = ['manual', 'paid', 'pending']

/**
 * Admin: add a booking manually (phone/WhatsApp customers). Goes through the
 * admin_create_booking RPC, which bypasses the distance/notice rules but still
 * refuses to double-book a slot (surfaced as SLOT_UNAVAILABLE).
 */
export async function createManualBooking(
  input: ManualBookingInput,
): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can add bookings.' }

  const pkg = PACKAGES[input.package_id]
  if (!pkg) return { ok: false, error: 'Pick a valid package.' }
  if (!(EMIRATES as readonly string[]).includes(input.emirate)) {
    return { ok: false, error: 'Pick a valid emirate.' }
  }
  if (!SLOTS[input.slot_time]) return { ok: false, error: 'Pick a valid slot.' }
  if (!MANUAL_PAYMENT_STATUSES.includes(input.payment_status)) {
    return { ok: false, error: 'Invalid payment status.' }
  }
  const required: [string, string][] = [
    [input.customer_name, 'customer name'],
    [input.customer_phone, 'phone number'],
    [input.address, 'address'],
    [input.car_make, 'car make'],
    [input.car_model, 'car model'],
    [input.car_year, 'car year'],
    [input.inspection_date, 'inspection date'],
  ]
  for (const [value, label] of required) {
    if (!value.trim()) return { ok: false, error: `Please enter the ${label}.` }
  }
  const total = Math.round(Number(input.total_price))
  if (!Number.isFinite(total) || total < 0) return { ok: false, error: 'Enter a valid total.' }

  const travelFee = isLongDistance(input.emirate) ? 100 : 0
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_booking', {
    p_customer_name: input.customer_name.trim(),
    p_customer_phone: input.customer_phone.trim(),
    p_customer_email: input.customer_email.trim(),
    p_emirate: input.emirate,
    p_address: input.address.trim(),
    p_car_make: input.car_make.trim(),
    p_car_model: input.car_model.trim(),
    p_car_year: input.car_year.trim(),
    p_vin: input.vin.trim(),
    p_plate_number: input.plate_number.trim(),
    p_inspection_date: input.inspection_date,
    p_slot_time: input.slot_time,
    p_package_id: pkg.id,
    p_package_name: pkg.name,
    p_package_price: pkg.price,
    p_travel_fee: travelFee,
    p_total_price: total,
    p_payment_status: input.payment_status,
    p_booking_status: 'paid_new',
    p_assigned_inspector: input.assigned_inspector,
    p_admin_notes: input.admin_notes.trim(),
    p_additional_notes: null,
  })

  if (error) {
    if (error.message.includes('SLOT_UNAVAILABLE')) {
      return { ok: false, error: 'That slot is already taken — pick a different time or date.' }
    }
    if (error.message.includes('FORBIDDEN')) {
      return { ok: false, error: 'Only admins can add bookings.' }
    }
    return { ok: false, error: error.message }
  }

  const booking = data as Booking | null
  if (!booking?.id) return { ok: false, error: 'Booking was not created.' }

  revalidateBooking(booking.id)
  return { ok: true, id: booking.id }
}

/**
 * Admin: create a draft inspection report prefilled from the booking,
 * link it back (bookings.report_id) and move a paid/confirmed booking to
 * 'inspection_in_progress' ("In Progress"). Mirrors createReport in reports/actions.ts.
 */
export async function createReportFromBooking(bookingId: string): Promise<BookingActionResult> {
  if (IS_DEMO) return { ok: false, error: DEMO_ERROR }
  const session = await requireAdminSession()
  if (!session) return { ok: false, error: 'Only admins can create reports from bookings.' }

  const supabase = await createClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { ok: false, error: 'Booking not found.' }

  let reportId = (booking as Booking).report_id

  if (!reportId) {
    // Issue a sequential reference (CCR-YYYY-0001) via the DB function.
    const { data: reference, error: refErr } = await supabase.rpc('next_report_reference')
    if (refErr || !reference) return { ok: false, error: 'Could not allocate a report reference.' }

    const b = booking as Booking
    const pkg = b.package_id
    const { data: report, error } = await supabase
      .from('inspection_reports')
      .insert({
        report_reference: reference,
        public_id: generatePublicId(),
        inspector_id: b.assigned_inspector ?? session.id,
        status: 'draft',
        package_type: pkg,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        vehicle_make: b.car_make,
        vehicle_model: b.car_model,
        vehicle_year: b.car_year,
        vin: b.vin,
        plate_number: b.plate_number,
        inspection_location: `${b.address}, ${b.emirate}`,
        inspection_date: b.inspection_date,
        // Store the canonical slot key ('09:30'), NOT the display label
        // (SLOTS['09:30'] === '9:30 AM'). The report editor's time <select> is
        // built from SLOT_TIMES values, so the key round-trips; the label would
        // fall through to the "legacy / off-slot" option instead of matching.
        inspection_time: b.slot_time,
        checklist: {},
        critical_findings: [],
        photos: [],
        counts: computeCounts(pkg, {}),
      })
      .select('id')
      .single()

    if (error || !report) return { ok: false, error: error?.message || 'Could not create report.' }
    reportId = report.id as string

    const bookingUpdate: Record<string, unknown> = { report_id: reportId }
    if (b.booking_status === 'paid_new' || b.booking_status === 'time_confirmed') {
      bookingUpdate.booking_status = 'inspection_in_progress'
    }
    // Claim the booking atomically: only link if it still has NO report. Two
    // concurrent invocations (double-submit / retry-in-flight) would otherwise
    // both insert a report and the later link would overwrite the earlier,
    // orphaning one report. The `.is('report_id', null)` precondition lets the
    // DB row lock serialize them — exactly one update matches, the other gets
    // zero rows and discards its report in favour of the winner's.
    const { data: claimed, error: linkErr } = await supabase
      .from('bookings')
      .update(bookingUpdate)
      .eq('id', bookingId)
      .is('report_id', null)
      .select('id')
      .maybeSingle()
    if (linkErr) {
      // Roll back the just-created report so a retry starts clean.
      await supabase.from('inspection_reports').delete().eq('id', reportId)
      return { ok: false, error: `Could not link the report to the booking: ${linkErr.message}. Please try again.` }
    }
    if (!claimed) {
      // Lost the race — a concurrent invocation linked a report first. Drop ours
      // and redirect to the existing one instead of creating a duplicate.
      await supabase.from('inspection_reports').delete().eq('id', reportId)
      const { data: fresh } = await supabase
        .from('bookings')
        .select('report_id')
        .eq('id', bookingId)
        .maybeSingle()
      const existingReportId = (fresh as { report_id: string | null } | null)?.report_id
      if (!existingReportId) return { ok: false, error: 'Could not create the report. Please try again.' }
      reportId = existingReportId
    } else {
      revalidateBooking(bookingId)
      revalidatePath('/reports')
    }
  }

  redirect(`/reports/${reportId}/edit`)
}
