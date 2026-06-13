import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import {
  SLOTS,
  SLOT_TIMES,
  isLiveHold,
  type BookingStatus,
  type BookingWithInspector,
  type SlotTime,
} from './booking-types'

/**
 * Server-side booking queries. RLS already scopes rows — admins see every
 * booking, inspectors only the ones assigned to them — so none of these need
 * an explicit inspector filter. There is no demo dataset for bookings: in
 * preview mode everything returns empty so the UI still renders.
 */

/** Statuses that mean "this inspection is (still) happening". */
const ACTIVE_STATUSES: BookingStatus[] = [
  'paid_new',
  'time_confirmed',
  'inspection_in_progress',
  'report_sent',
]

/** Statuses that occupy a slot on the schedule (active + live payment holds). */
const SLOT_HOLDING_STATUSES: BookingStatus[] = ['pending_payment', ...ACTIVE_STATUSES]

/**
 * Embed the assigned inspector in the same round-trip. The `assigned_inspector`
 * hint disambiguates from the second FK to inspector_profiles (`created_by`).
 */
const WITH_INSPECTOR = '*, inspector:inspector_profiles!assigned_inspector(id, full_name)'

/** Today's date (yyyy-MM-dd) in Asia/Dubai — the slot model's timezone. */
export function dubaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
}

/** date (yyyy-MM-dd) + n days, without timezone drift. */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface BookingListFilters {
  status?: BookingStatus | 'all'
  fromDate?: string
  toDate?: string
}

export async function getBookings(filters: BookingListFilters = {}): Promise<BookingWithInspector[]> {
  if (IS_DEMO) return []
  const supabase = await createClient()
  let query = supabase.from('bookings').select(WITH_INSPECTOR)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('booking_status', filters.status)
  } else {
    // Default/"All" view hides transient pre-payment holds — they last ≤30 min
    // and would otherwise clutter the list. They still occupy the slot on the
    // schedule view. (Inspectors never see holds anyway: a hold has no assigned
    // inspector, so RLS already excludes it.)
    query = query.neq('booking_status', 'pending_payment')
  }
  if (filters.fromDate) query = query.gte('inspection_date', filters.fromDate)
  if (filters.toDate) query = query.lte('inspection_date', filters.toDate)

  // Upcoming inspections first, newest bookings first within a day.
  const { data } = await query
    .order('inspection_date', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(300)
  return (data as BookingWithInspector[]) || []
}

export async function getBookingById(id: string): Promise<BookingWithInspector | null> {
  if (IS_DEMO) return null
  const supabase = await createClient()
  const { data } = await supabase.from('bookings').select(WITH_INSPECTOR).eq('id', id).maybeSingle()
  return (data as BookingWithInspector) || null
}

export interface BookingStats {
  /** Active inspections happening today. */
  today: number
  /** Active inspections in the next 7 days (today inclusive). */
  upcoming: number
  /** Paid bookings awaiting a confirmation call ('paid_new'). */
  newPaid: number
}

export async function getBookingStats(): Promise<BookingStats> {
  if (IS_DEMO) return { today: 0, upcoming: 0, newPaid: 0 }
  const supabase = await createClient()
  const today = dubaiToday()
  const weekAhead = addDaysISO(today, 7)

  const [todayRes, upcomingRes, newPaidRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('inspection_date', today)
      .in('booking_status', ACTIVE_STATUSES),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .gte('inspection_date', today)
      .lte('inspection_date', weekAhead)
      .in('booking_status', ACTIVE_STATUSES),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('booking_status', 'paid_new'),
  ])

  return {
    today: todayRes.count || 0,
    upcoming: upcomingRes.count || 0,
    newPaid: newPaidRes.count || 0,
  }
}

/** Next active inspections from today onwards (dashboard "next inspections" list). */
export async function getUpcomingBookings(limit = 5): Promise<BookingWithInspector[]> {
  if (IS_DEMO) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('bookings')
    .select(WITH_INSPECTOR)
    .gte('inspection_date', dubaiToday())
    .in('booking_status', ACTIVE_STATUSES)
    .order('inspection_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(limit)
  return (data as BookingWithInspector[]) || []
}

export interface SlotBlock {
  id: string
  block_date: string
  slot_time: SlotTime
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface DaySlot {
  slot: SlotTime
  label: string
  /** Booking occupying the slot — null when none is visible (RLS) or the slot is free. */
  booking: BookingWithInspector | null
  /** Manual admin block on this slot, if any. */
  block: SlotBlock | null
  /** From the booking_slot_availability RPC ('normal' distance). */
  available: boolean
  /** booked | blocked | travel_buffer | cutoff | null when available. */
  reason: string | null
}

/**
 * Full picture of one day's five slots: visible bookings + manual blocks +
 * the availability RPC (which also sweeps stale payment holds). An inspector
 * may see a slot as `reason: 'booked'` with `booking: null` when the booking
 * is assigned to someone else — render it as occupied without a link.
 */
export async function getDaySchedule(date: string): Promise<DaySlot[]> {
  if (IS_DEMO) {
    return SLOT_TIMES.map((slot) => ({
      slot,
      label: SLOTS[slot],
      booking: null,
      block: null,
      available: true,
      reason: null,
    }))
  }
  const supabase = await createClient()
  const [bookingsRes, blocksRes, availabilityRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(WITH_INSPECTOR)
      .eq('inspection_date', date)
      .in('booking_status', SLOT_HOLDING_STATUSES),
    supabase.from('slot_blocks').select('*').eq('block_date', date),
    supabase.rpc('booking_slot_availability', { p_date: date, p_distance: 'normal' }),
  ])

  const bookings = (bookingsRes.data as BookingWithInspector[]) || []
  const blocks = (blocksRes.data as SlotBlock[]) || []
  const availability =
    (availabilityRes.data as { slot_time: SlotTime; available: boolean; reason: string | null }[]) || []

  return SLOT_TIMES.map((slot) => {
    const row = availability.find((a) => a.slot_time === slot)
    return {
      slot,
      label: SLOTS[slot],
      // Ignore an EXPIRED pending_payment hold: the availability RPC sweeps stale
      // holds (expire_stale_holds) and reports the slot free, but this direct
      // query — run in parallel — may still return the un-swept row. Without this
      // filter the schedule shows a phantom "Pending Payment" on a free slot.
      booking:
        bookings.find(
          (b) => b.slot_time === slot && (b.booking_status !== 'pending_payment' || isLiveHold(b)),
        ) ?? null,
      block: blocks.find((b) => b.slot_time === slot) ?? null,
      available: row?.available ?? true,
      reason: row?.reason ?? null,
    }
  })
}

/** All bookings assigned to one inspector — admin views a member's job history. */
export async function getInspectorBookings(inspectorId: string): Promise<BookingWithInspector[]> {
  if (IS_DEMO) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('bookings')
    .select(WITH_INSPECTOR)
    .eq('assigned_inspector', inspectorId)
    .order('inspection_date', { ascending: false })
    .limit(50)
  return (data as BookingWithInspector[]) || []
}

/** Active inspectors for assignment dropdowns (admin UI). */
export async function getActiveInspectors(): Promise<{ id: string; full_name: string }[]> {
  if (IS_DEMO) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('inspector_profiles')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name', { ascending: true })
  return (data as { id: string; full_name: string }[]) || []
}
