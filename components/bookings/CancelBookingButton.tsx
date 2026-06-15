'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Ban, Loader2 } from 'lucide-react'
import { updateBookingStatus } from '@/app/(app)/bookings/actions'
import type { BookingStatus } from '@/lib/booking-types'

/**
 * Cancel / refund a booking (confirmation modal, mirrors DeleteReportButton). A
 * paid booking is flipped to Refunded by the action; the slot reopens.
 */
export function CancelBookingButton({
  bookingId,
  reference,
  status,
  paid,
}: {
  bookingId: string
  reference: string
  status: BookingStatus
  paid: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  // Modal a11y (mirrors PhotoAdjuster's Escape handling, extended with focus
  // management): focus the "Keep booking" button on open, close on Escape unless
  // a cancel is in flight, and keep Tab focus inside the dialog.
  useEffect(() => {
    if (!open) return
    keepRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!pending) setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      // Wrap at the ends so focus can't escape the dialog into the page behind.
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending])

  if (status === 'cancelled') return null

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, 'cancelled')
      if (!res.ok) {
        setError(res.error || 'Could not cancel the booking.')
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-danger h-10 w-full text-sm"
      >
        <Ban size={16} /> Cancel / refund
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !pending && setOpen(false)}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Cancel booking"
            className="relative w-full max-w-sm animate-scale-in rounded-card border border-border bg-card p-5 shadow-glow"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fail-muted">
                <AlertTriangle size={20} className="text-fail" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary">Cancel this booking?</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  <span className="font-mono font-semibold text-accent">{reference}</span> will be marked{' '}
                  {paid ? 'Refunded' : 'Cancelled'} and its slot will reopen.
                  {paid && ' Process the Stripe refund separately.'}
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-input border border-fail/30 bg-fail-muted px-3 py-2 text-sm text-fail">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={keepRef}
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="btn-secondary h-10 text-sm"
              >
                Keep booking
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="btn-danger h-10 text-sm"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
