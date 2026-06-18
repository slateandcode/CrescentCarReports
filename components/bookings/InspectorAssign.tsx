'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { assignBookingInspector } from '@/app/(app)/bookings/actions'

/** Assign / reassign / unassign the booking's inspector. */
export function InspectorAssign({
  bookingId,
  current,
  inspectors,
}: {
  bookingId: string
  current: string | null
  inspectors: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const select = e.target
    const value = select.value
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await assignBookingInspector(bookingId, value || null)
      if (!res.ok) {
        setError(res.error || 'Could not assign inspector.')
        // The select is uncontrolled — reset it to the persisted value so it
        // doesn't keep displaying an inspector that wasn't actually assigned.
        select.value = current ?? ''
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="relative">
        <select
          defaultValue={current ?? ''}
          onChange={onChange}
          disabled={pending}
          className="input-base"
          aria-label="Assigned inspector"
        >
          <option value="">Unassigned</option>
          {inspectors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.full_name}
            </option>
          ))}
        </select>
        {pending && (
          <Loader2
            size={15}
            className="absolute right-9 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
          />
        )}
      </div>
      {error && <p className="mt-2 text-xs text-fail">{error}</p>}
      {saved && !pending && !error && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-pass">
          <Check size={12} /> Saved
        </p>
      )}
    </div>
  )
}
