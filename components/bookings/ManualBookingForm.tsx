'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TextField, TextAreaField } from '@/components/ui/Field'
import { createManualBooking, type ManualBookingInput } from '@/app/(app)/bookings/actions'
import { EMIRATES } from '@/lib/options'
import { PACKAGE_LIST } from '@/lib/report-templates'
import {
  SLOT_TIMES,
  SLOTS,
  PAYMENT_STATUS_LABELS,
  TRAVEL_FEE_AED,
  isLongDistance,
  type PaymentStatus,
  type SlotTime,
} from '@/lib/booking-types'
import { LongDistanceTag } from './BookingBadges'
import type { PackageType } from '@/lib/report-types'

const PAYMENT_OPTIONS: PaymentStatus[] = ['manual', 'paid', 'pending']

/** Today (yyyy-MM-dd) in Asia/Dubai — local to the client to avoid importing the server data module. */
function dubaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
}

interface FormState {
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
  slot_time: SlotTime | ''
  package_id: PackageType
  total_price: string
  payment_status: PaymentStatus
  assigned_inspector: string
  admin_notes: string
}

const EMPTY: FormState = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  emirate: '',
  address: '',
  car_make: '',
  car_model: '',
  car_year: '',
  vin: '',
  plate_number: '',
  inspection_date: '',
  slot_time: '',
  package_id: 'standard',
  total_price: '',
  payment_status: 'manual',
  assigned_inspector: '',
  admin_notes: '',
}

/**
 * Admin form to add a phone / WhatsApp booking (paid offline). Goes through
 * createManualBooking → admin_create_booking RPC, which bypasses the distance /
 * notice rules but still refuses to double-book a slot.
 */
export function ManualBookingForm({
  inspectors,
}: {
  inspectors: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Fall back to the cheapest sold tier (Standard) for any unknown/retired id, so a
  // stray value can never silently price a booking at the most expensive package.
  const pkg = PACKAGE_LIST.find((p) => p.id === form.package_id) ?? PACKAGE_LIST[0]
  const longDistance = isLongDistance(form.emirate)
  const travel = longDistance ? TRAVEL_FEE_AED : 0
  const suggested = pkg.price + travel

  function set(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.emirate) return setError('Pick an emirate.')
    if (!form.slot_time) return setError('Pick a time slot.')

    const total = form.total_price.trim() ? Math.round(Number(form.total_price)) : suggested
    if (!Number.isFinite(total) || total < 0) return setError('Enter a valid total.')

    const input: ManualBookingInput = {
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_email: form.customer_email,
      emirate: form.emirate,
      address: form.address,
      car_make: form.car_make,
      car_model: form.car_model,
      car_year: form.car_year,
      vin: form.vin,
      plate_number: form.plate_number,
      inspection_date: form.inspection_date,
      slot_time: form.slot_time as SlotTime,
      package_id: form.package_id,
      total_price: total,
      payment_status: form.payment_status,
      assigned_inspector: form.assigned_inspector || null,
      admin_notes: form.admin_notes,
    }

    startTransition(async () => {
      const res = await createManualBooking(input)
      if (!res.ok || !res.id) {
        setError(res.error || 'Could not create the booking.')
        return
      }
      router.push(`/bookings/${res.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Customer */}
      <section className="card-base space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            value={form.customer_name}
            onChange={(e) => set({ customer_name: e.target.value })}
          />
          <TextField
            label="Phone / WhatsApp"
            value={form.customer_phone}
            onChange={(e) => set({ customer_phone: e.target.value })}
          />
        </div>
        <TextField
          label="Email"
          optional
          type="email"
          value={form.customer_email}
          onChange={(e) => set({ customer_email: e.target.value })}
        />
      </section>

      {/* Vehicle */}
      <section className="card-base space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Vehicle</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Make" value={form.car_make} onChange={(e) => set({ car_make: e.target.value })} />
          <TextField label="Model" value={form.car_model} onChange={(e) => set({ car_model: e.target.value })} />
          <TextField label="Year" value={form.car_year} onChange={(e) => set({ car_year: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="VIN / chassis" optional value={form.vin} onChange={(e) => set({ vin: e.target.value })} />
          <TextField
            label="Plate number"
            optional
            value={form.plate_number}
            onChange={(e) => set({ plate_number: e.target.value })}
          />
        </div>
      </section>

      {/* Location */}
      <section className="card-base space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Location</h2>
          {longDistance && <LongDistanceTag />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-base">Emirate</span>
            <select
              className="input-base"
              value={form.emirate}
              onChange={(e) => set({ emirate: e.target.value })}
            >
              <option value="">Select…</option>
              {EMIRATES.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </label>
          <TextField label="Address" value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        {longDistance && (
          <p className="text-xs text-attention">
            Long-distance emirate — AED {TRAVEL_FEE_AED} travel fee; the website would only offer 9:30 AM.
          </p>
        )}
      </section>

      {/* Schedule */}
      <section className="card-base space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Schedule</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-base">Inspection date</span>
            <input
              type="date"
              min={dubaiToday()}
              value={form.inspection_date}
              onChange={(e) => set({ inspection_date: e.target.value })}
              className="input-base"
            />
          </label>
          <label className="block">
            <span className="label-base">Time slot</span>
            <select
              className="input-base"
              value={form.slot_time}
              onChange={(e) => set({ slot_time: e.target.value as SlotTime })}
            >
              <option value="">Select…</option>
              {SLOT_TIMES.map((t) => (
                <option key={t} value={t}>
                  {SLOTS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Package & payment */}
      <section className="card-base space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Package &amp; payment
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-base">Package</span>
            <select
              className="input-base"
              value={form.package_id}
              onChange={(e) => set({ package_id: e.target.value as PackageType })}
            >
              {PACKAGE_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — AED {p.price}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-base">Total charged (AED)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.total_price}
              onChange={(e) => set({ total_price: e.target.value })}
              placeholder={String(suggested)}
              className="input-base"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Suggested: AED {suggested}
              {travel > 0 ? ` (incl. AED ${travel} travel)` : ''}
              {form.total_price.trim() === '' && ' — used if left blank'}
            </span>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-base">Payment status</span>
            <select
              className="input-base"
              value={form.payment_status}
              onChange={(e) => set({ payment_status: e.target.value as PaymentStatus })}
            >
              {PAYMENT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_STATUS_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-base">Assigned inspector</span>
            <select
              className="input-base"
              value={form.assigned_inspector}
              onChange={(e) => set({ assigned_inspector: e.target.value })}
            >
              <option value="">Unassigned</option>
              {inspectors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TextAreaField
          label="Internal notes"
          optional
          value={form.admin_notes}
          onChange={(e) => set({ admin_notes: e.target.value })}
        />
      </section>

      {error && (
        <p className="rounded-input border border-fail/30 bg-fail-muted px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/bookings')}
          disabled={pending}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 size={18} className="animate-spin" />}
          Create booking
        </button>
      </div>
    </form>
  )
}
