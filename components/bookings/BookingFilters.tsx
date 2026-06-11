'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FILTERABLE_STATUSES, STATUS_LABELS } from '@/lib/booking-types'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...FILTERABLE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
] as const

/** Status chips + date range, mirrored from the reports list filters. */
export function BookingFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all') sp.delete(k)
      else sp.set(k, v)
    }
    startTransition(() => router.replace(`/bookings?${sp.toString()}`))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-hide">
        {STATUS_TABS.map((t) => (
          <Chip key={t.value} active={status === t.value} onClick={() => update({ status: t.value })}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
        <input
          type="date"
          value={from}
          onChange={(e) => update({ from: e.target.value })}
          className="input-base h-11 flex-1 py-1.5 text-sm sm:h-10 sm:min-h-0 sm:w-auto sm:flex-none"
          aria-label="From date"
        />
        <span className="text-sm text-text-muted">–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => update({ to: e.target.value })}
          className="input-base h-11 flex-1 py-1.5 text-sm sm:h-10 sm:min-h-0 sm:w-auto sm:flex-none"
          aria-label="To date"
        />
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'whitespace-nowrap rounded-input border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-accent bg-accent-muted text-accent'
          : 'border-border bg-card text-text-secondary hover:border-border-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
