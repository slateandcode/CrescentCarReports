'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ban, Check, Loader2, Lock, Plus, X } from 'lucide-react'
import { blockSlot, unblockSlot } from '@/app/(app)/bookings/actions'
import { BookingStatusBadge } from './BookingBadges'
import type { DaySlot } from '@/lib/bookings-data'

/** Friendly labels for the booking_slot_availability RPC reason codes. */
const REASON_LABEL: Record<string, string> = {
  booked: 'Booked',
  blocked: 'Blocked',
  travel_buffer: 'Held — long-distance travel buffer',
  travel_buffer_unavailable: 'Travel buffer unavailable',
  long_distance_first_slot_only: 'Long-distance: 9:30 AM only',
  cutoff: 'Too late to book (under 1 hour)',
}

/**
 * One day's five fixed slots with manual block / unblock. Bookings link to their
 * detail; free slots can be blocked (with a reason); manual blocks can be lifted.
 * Slots the RPC reports unavailable for a non-block reason (travel buffer, cutoff)
 * are shown as read-only context.
 */
export function DaySchedule({ date, slots }: { date: string; slots: DaySlot[] }) {
  return (
    <div className="space-y-3">
      {slots.map((s) => (
        <SlotRow key={s.slot} slot={s} date={date} />
      ))}
    </div>
  )
}

function SlotRow({ slot: s, date }: { slot: DaySlot; date: string }) {
  return (
    <div className="card-base flex items-stretch gap-3 p-3 sm:gap-4 sm:p-4">
      <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-input border border-border bg-surface px-2 py-2 text-center">
        <span className="text-sm font-bold text-text-primary">{s.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <SlotBody slot={s} date={date} />
      </div>
    </div>
  )
}

function SlotBody({ slot: s, date }: { slot: DaySlot; date: string }) {
  // 1) An occupied slot — link to the booking (or show "booked elsewhere" when RLS hides it).
  if (s.booking) {
    const b = s.booking
    return (
      <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {[b.car_year, b.car_make, b.car_model].filter(Boolean).join(' ')}
          </p>
          <p className="truncate text-xs text-text-secondary">
            {b.customer_name} · {b.emirate}
            {b.inspector?.full_name ? ` · ${b.inspector.full_name}` : ''}
          </p>
        </div>
        <BookingStatusBadge status={b.booking_status} />
      </Link>
    )
  }

  // 2) A manual admin block — show the reason and an unblock control.
  if (s.block) {
    return <BlockedRow blockId={s.block.id} reason={s.block.reason} />
  }

  // 3) Available — offer a block control.
  if (s.available) {
    return <AvailableRow date={date} slot={s.slot} />
  }

  // 4) Unavailable for a non-block reason (travel buffer / cutoff) — read-only.
  return (
    <div className="flex h-full items-center gap-2 text-sm text-text-muted">
      <Lock size={15} />
      {s.reason ? (REASON_LABEL[s.reason] ?? 'Unavailable') : 'Unavailable'}
    </div>
  )
}

function BlockedRow({ blockId, reason }: { blockId: string; reason: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await unblockSlot(blockId)
      if (!res.ok) {
        setError(res.error || 'Could not unblock.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-fail">
          <Ban size={15} /> Blocked
        </p>
        {reason && <p className="mt-0.5 truncate text-xs text-text-secondary">{reason}</p>}
      </div>
      <div className="flex flex-col items-end">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="btn-secondary h-9 text-sm"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          Unblock
        </button>
        {error && <p className="mt-1 text-xs text-fail">{error}</p>}
      </div>
    </div>
  )
}

function AvailableRow({ date, slot }: { date: string; slot: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function block() {
    setError(null)
    startTransition(async () => {
      const res = await blockSlot(date, slot as DaySlot['slot'], reason)
      if (!res.ok) {
        setError(res.error || 'Could not block the slot.')
        return
      }
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-pass">
          <Check size={15} /> Available
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-secondary h-9 text-sm"
          >
            <Plus size={14} /> Block
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. day off, travel)…"
            className="input-base h-10 min-h-0 flex-1 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={block}
              disabled={pending}
              className="btn-primary h-10 text-sm"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Block slot
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              disabled={pending}
              className="btn-secondary h-10 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-fail">{error}</p>}
    </div>
  )
}
